import * as assert from 'assert';
import * as vscode from 'vscode';
import { startSession, sendSubmission } from '../../utils/api';
import { registerDiffTracker, diffBuffer } from '../../tracking/diffTracker';
import { registerDebugTracker } from '../../tracking/debugTracker';
import { wipeAndDeleteFile } from '../../utils/workspace';

suite('Integration & E2E: Full Student Workflow', () => {
    // Spies & Interceptors
    let networkLog: { url: string, body: any }[] = [];
    let capturedDocumentChangeListener: (e: any) => void;
    let capturedAggregationTick: () => void;
    let capturedWorkerTick: () => Promise<void>;
    let capturedDebugFactory: vscode.DebugAdapterTrackerFactory;

    // Original API Backups
    let originalFetch: any;
    let originalSetInterval: any;
    let originalSetTimeout: any;
    let originalOnDidChange: any;
    let originalRegisterFactory: any;
    let originalClipboard: any;
    let originalFs: any; // <-- New variable to hold the entire FS object
    let originalAsRelativePath: any;

    setup(() => {
        networkLog = [];
        
        // 1. Intercept ALL Network Traffic
        originalFetch = global.fetch;
        global.fetch = async (url: any, init?: any) => {
            if (init && init.body) {
                networkLog.push({ url: url.toString(), body: JSON.parse(init.body) });
            }
            return { ok: true, status: 200 } as any;
        };

        // 2. Intercept Time (Diff Tracker)
        originalSetInterval = global.setInterval;
        (global as any).setInterval = (callback: any, ms: number) => {
            if (ms === 1000) {capturedAggregationTick = callback;}
            return setTimeout(() => {}, 0);
        };

        originalSetTimeout = global.setTimeout;
        (global as any).setTimeout = (callback: any, ms: number) => {
            if (ms >= 10000 && ms <= 20000) {
                capturedWorkerTick = callback;
                return originalSetTimeout(() => {}, 0);
            }
            return originalSetTimeout(callback, ms); 
        };

        // 3. Intercept Typing
        originalOnDidChange = vscode.workspace.onDidChangeTextDocument;
        (vscode.workspace as any).onDidChangeTextDocument = (callback: any) => {
            capturedDocumentChangeListener = callback;
            return { dispose: () => {} };
        };

        // 4. Intercept Debugging
        originalRegisterFactory = vscode.debug.registerDebugAdapterTrackerFactory;
        (vscode.debug as any).registerDebugAdapterTrackerFactory = (type: string, factory: any) => {
            if (type === 'cppdbg') {capturedDebugFactory = factory;}
            return { dispose: () => {} };
        };

        // Mock Relative Path 
        originalAsRelativePath = vscode.workspace.asRelativePath;
        (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath.replace('/mock/', '').replace('\\mock\\', '');

        // 5. Mock Clipboard
        originalClipboard = vscode.env.clipboard;
        Object.defineProperty(vscode.env, 'clipboard', {
            get: () => ({ readText: async () => 'printf("Cheater!");' }),
            configurable: true
        });

        // THE FIX: Safely mock the entire FileSystem object
        originalFs = vscode.workspace.fs;
        const mockFs = {
            writeFile: async () => {},
            delete: async () => {},
            readFile: async () => new Uint8Array()
        };
        Object.defineProperty(vscode.workspace, 'fs', { get: () => mockFs, configurable: true });
    });

    teardown(() => {
        global.fetch = originalFetch;
        global.setInterval = originalSetInterval;
        global.setTimeout = originalSetTimeout;
        (vscode.workspace as any).onDidChangeTextDocument = originalOnDidChange;
        (vscode.debug as any).registerDebugAdapterTrackerFactory = originalRegisterFactory;
        (vscode.workspace as any).asRelativePath = originalAsRelativePath;
        
        // Safely restore getters
        Object.defineProperty(vscode.env, 'clipboard', { get: () => originalClipboard, configurable: true });
        Object.defineProperty(vscode.workspace, 'fs', { get: () => originalFs, configurable: true });
        
        diffBuffer.clear();
    });

    test('SCENARIO: Complete Lab Lifecycle (Start -> Type -> Cheat -> Submit -> Debug -> Submit -> End)', async () => {
        const dummyContext = { subscriptions: [] } as any;
        const student = { num: '20269999', name: 'E2E_Test_Student', machine: 'E2E-MAC-01' };

        // ==========================================
        // ACT 1: START LAB
        // ==========================================
        await startSession({
            student_number: student.num, student_name: student.name,
            machine_id: student.machine, os_platform: 'win32'
        });

        assert.ok(networkLog.find(r => r.url.includes('/api/session/start')), "Failed Phase 1: Did not start session");

        // ==========================================
        // ACT 2: TYPE CODE (Diff Tracking)
        // ==========================================
        registerDiffTracker(dummyContext, student.num, student.name, student.machine);
        
        diffBuffer.set('lab.c', '');
        capturedDocumentChangeListener({
            document: { uri: vscode.Uri.file('/mock/lab.c'), fileName: 'lab.c', getText: () => 'int main()' },
            contentChanges: [{ rangeLength: 0, rangeOffset: 0, text: 'int main()' }]
        });

        capturedAggregationTick(); 
        await capturedWorkerTick(); 

        const diffRequest = networkLog.find(r => r.url.includes('/api/track/diff'));
        assert.ok(diffRequest, "Failed Phase 2: Did not transmit code diff");
        assert.strictEqual(diffRequest.body.diff_payload, 'int main()');

        // ==========================================
        // ACT 3: COPY/PASTE VIOLATION
        // ==========================================
        capturedDocumentChangeListener({
            document: { uri: vscode.Uri.file('/mock/lab.c'), fileName: 'lab.c', getText: () => 'int main() { printf("Cheater!"); }' },
            contentChanges: [{ rangeLength: 0, rangeOffset: 10, text: 'printf("Cheater!");' }]
        });

        await new Promise(resolve => originalSetTimeout(resolve, 20)); 

        // THE FIX: Check the new unified security endpoint and body structure
        const cheatRequest = networkLog.find(r => r.url.includes('/api/track/security-violation'));
        assert.ok(cheatRequest, "Failed Phase 3: Did not catch or log paste violation");
        assert.strictEqual(cheatRequest.body.violation_type, 'Unauthorized Paste');
        assert.strictEqual(cheatRequest.body.details, 'printf("Cheater!");');

        // ==========================================
        // ACT 4: MID SUBMISSION
        // ==========================================
        await sendSubmission({
            student_number: student.num, student_name: student.name, machine_id: student.machine,
            submission_type: 'mid', task_id: 'task_01',
            source_files_snapshot: { 'lab.c': 'int main()' }, vscode_config_snapshot: {}
        });

        const midRequest = networkLog.find(r => r.url.includes('/api/session/submit') && r.body.submission_type === 'mid');
        assert.ok(midRequest, "Failed Phase 4: Mid submission failed");

        // ==========================================
        // ACT 5: DEBUG ERROR
        // ==========================================
        registerDebugTracker(dummyContext, student.num, student.name, student.machine);
        const tracker: any = await capturedDebugFactory.createDebugAdapterTracker!({ id: 's1', name: 'T', type: 'cppdbg' } as any);
        
        if (tracker.onWillStartSession) {tracker.onWillStartSession();}
        if (tracker.onWillReceiveMessage) {tracker.onWillReceiveMessage({ type: 'request', command: 'next', arguments: {} });}
        if (tracker.onExit) {tracker.onExit(0, undefined);}

        await new Promise(resolve => originalSetTimeout(resolve, 10));

        const debugRequest = networkLog.find(r => r.url.includes('/api/track/debug-log'));
        assert.ok(debugRequest, "Failed Phase 5: Did not transmit debug telemetry");
        assert.strictEqual(debugRequest.body.execution_actions[0].action, 'next');

        // ==========================================
        // ACT 6: FINAL SUBMIT & END SESSION
        // ==========================================
        await sendSubmission({
            student_number: student.num, student_name: student.name, machine_id: student.machine,
            submission_type: 'final', task_id: 'task_01',
            source_files_snapshot: { 'lab.c': 'int main() { return 0; }' }, vscode_config_snapshot: {}
        });

        const finalRequest = networkLog.find(r => r.url.includes('/api/session/submit') && r.body.submission_type === 'final');
        assert.ok(finalRequest, "Failed Phase 6: Final submission failed");

        // Wipe the file to end the session
        await wipeAndDeleteFile(vscode.Uri.file('/mock/lab.c'));
        
        assert.ok(networkLog.length >= 6, "Workflow did not generate the expected number of network events");
    });
});
