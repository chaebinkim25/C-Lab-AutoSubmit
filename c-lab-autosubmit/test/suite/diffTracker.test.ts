// src/test/suite/diffTracker.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerDiffTracker, diffBuffer, diffPayloadQueue } from '../../tracking/diffTracker';

suite('Tracking Engine: Diff Tracker & Anti-Cheat', () => {
    let capturedDocumentChangeListener: (e: any) => void;
    let capturedAggregationTick: () => void;
    let capturedWorkerTick: () => Promise<void>;

    // Original API Backups
    let originalOnDidChange: any;
    let originalAsRelativePath: any;
    let originalExecuteCommand: any;
    let originalShowWarningMessage: any;
    let originalSetInterval: typeof global.setInterval;
    let originalSetTimeout: typeof global.setTimeout; 
    let originalFetch: typeof global.fetch; 

    // Clipboard Mocking State
    let originalClipboard: any;

    // Spies to check if anti-cheat fired
    let undoCalled = false;
    let warningShown = false;
    let mockClipboardContent = '';

    setup(() => {
        undoCalled = false;
        warningShown = false;
        mockClipboardContent = '';

        // 1. Intercept the Document Change Listener
        originalOnDidChange = vscode.workspace.onDidChangeTextDocument;
        (vscode.workspace as any).onDidChangeTextDocument = (callback: any) => {
            capturedDocumentChangeListener = callback;
            return { dispose: () => {} };
        };

        // 2. Intercept the 1-second Interval
        originalSetInterval = global.setInterval;
        (global as any).setInterval = (callback: any, ms: number) => {
            if (ms === 1000) {capturedAggregationTick = callback;}
            return setTimeout(() => {}, 0); // dummy
        };

        // 3. Intercept the Queue Worker's random setTimeout
        originalSetTimeout = global.setTimeout;
        (global as any).setTimeout = (callback: any, ms: number) => {
            if (ms >= 10000 && ms <= 20000) {
                capturedWorkerTick = callback;
                return originalSetTimeout(() => {}, 0); // dummy for the worker
            }
            return originalSetTimeout(callback, ms);
        };

        // 4. Override the getter on vscode.env to inject our mock clipboard
        originalClipboard = vscode.env.clipboard;
        Object.defineProperty(vscode.env, 'clipboard', {
            get: () => ({
                readText: async () => mockClipboardContent,
                writeText: async () => {} 
            }),
            configurable: true
        });

        // 5. Mock the Punishment Commands
        originalExecuteCommand = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async (cmd: string) => {
            if (cmd === 'undo') {undoCalled = true;}
        };

        originalShowWarningMessage = vscode.window.showWarningMessage;
        (vscode.window as any).showWarningMessage = async (msg: string) => {
            warningShown = true;
        };

        // 6. Mock Path Formatting and Fetch
        originalAsRelativePath = vscode.workspace.asRelativePath;
        (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath.replace('/mock/', '').replace('\\mock\\', '');
        
        originalFetch = global.fetch;
    });

    teardown(() => {
        (vscode.workspace as any).onDidChangeTextDocument = originalOnDidChange;
        (vscode.workspace as any).asRelativePath = originalAsRelativePath;
        (vscode.commands as any).executeCommand = originalExecuteCommand;
        (vscode.window as any).showWarningMessage = originalShowWarningMessage;
        global.setInterval = originalSetInterval;
        global.setTimeout = originalSetTimeout;
        global.fetch = originalFetch;

        Object.defineProperty(vscode.env, 'clipboard', {
            get: () => originalClipboard,
            configurable: true
        });

        diffBuffer.clear();
        diffPayloadQueue.length = 0;
    });

    // UPGRADED HELPER: Now supports rangeLength and rangeOffset to simulate "Cut" deletions
    const fireDocumentChange = (filename: string, oldText: string, newText: string, insertedText: string, rangeLength: number = 0, rangeOffset: number = oldText.length) => {
        if (!diffBuffer.has(filename)) {diffBuffer.set(filename, oldText);}
        capturedDocumentChangeListener({
            document: {
                uri: vscode.Uri.file(`/mock/${filename}`),
                fileName: filename,
                getText: () => newText
            },
            contentChanges: [{ rangeLength, rangeOffset, text: insertedText }]
        });
    };

    // --- ORIGINAL TRACKING TESTS ---

    test('registerDiffTracker: 1-second interval should aggregate rapid keystrokes into a single payload', () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        fireDocumentChange('rapid.c', '', 'i', 'i', 0, 0);
        fireDocumentChange('rapid.c', 'i', 'in', 'n', 0, 1);
        fireDocumentChange('rapid.c', 'in', 'int', 't', 0, 2);

        capturedAggregationTick();

        assert.strictEqual(diffPayloadQueue.length, 1, "Failed to aggregate: Queue has multiple items");
        assert.strictEqual(diffPayloadQueue[0].content, 'int', "Aggregated payload does not have the final text");
    });

    test('processQueueWorker: should empty the queue on successful network request', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        global.fetch = async () => ({ ok: true, status: 200 }) as any;

        diffPayloadQueue.push({
            studentNumber: '20261234', studentName: 'Gildong', machineId: 'MAC123',
            filename: 'success.c', timestamp: '2026-04-01T12:00:00Z', content: 'int main() {}',
            is_baseline: false
        });

        await capturedWorkerTick();

        assert.strictEqual(diffPayloadQueue.length, 0, "Queue was not cleared after a successful send");
    });

    test('processQueueWorker: should re-insert payload into queue if network fails (Retry Logic)', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        global.fetch = async () => { throw new Error('Network offline'); };

        diffPayloadQueue.push({
            studentNumber: '20261234', studentName: 'Gildong', machineId: 'MAC123',
            filename: 'retry.c', timestamp: '2026-04-01T12:00:00Z', content: 'int main() {}',
            is_baseline: false
        });

        await capturedWorkerTick();

        assert.strictEqual(diffPayloadQueue.length, 1, "Failed to re-insert the failed payload back into the queue");
        assert.strictEqual(diffPayloadQueue[0].filename, 'retry.c', "Re-inserted data was corrupted");
    });


    // --- NEW WORKSPACE-WIDE ANTI-CHEAT TESTS ---

    test('Workspace-Wide Paste: Should ALLOW pasting code COPIED from another file in the workspace', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        const sharedStruct = 'typedef struct {\n    int id;\n} Student;';
        
        // 1. Simulate File A (header.h) already containing the struct
        diffBuffer.set('header.h', sharedStruct); 

        // 2. Simulate the OS clipboard holding that exact code
        mockClipboardContent = sharedStruct;

        // 3. Simulate pasting that code into File B (main.c)
        fireDocumentChange('main.c', '#include "header.h"\n', '#include "header.h"\n' + sharedStruct, sharedStruct, 0, 20);

        await new Promise(resolve => setTimeout(resolve, 10));

        // 4. Verify the anti-cheat engine allowed it because it found it in header.h
        assert.strictEqual(undoCalled, false, "Falsely punished a legitimate cross-file copy-paste!");
        assert.strictEqual(warningShown, false, "Should not show a warning for internal pastes.");
    });

    test('Workspace-Wide Paste: Should ALLOW pasting code CUT from another file in the workspace', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        const codeToMove = 'int helper_func() { return 42; }';
        
        // 1. Initialize File A with the code
        diffBuffer.set('utils.c', codeToMove);

        // 2. Simulate CUTTING the code from File A (A deletion event)
        // rangeLength is the length of the string, inserted text is empty
        fireDocumentChange('utils.c', codeToMove, '', '', codeToMove.length, 0);

        // 3. Simulate the OS clipboard holding the cut code
        mockClipboardContent = codeToMove;

        // 4. Simulate pasting that cut code into File B (main.c)
        fireDocumentChange('main.c', '', codeToMove, codeToMove, 0, 0);

        await new Promise(resolve => setTimeout(resolve, 10));

        // 5. Verify the anti-cheat engine checked the recentlyDeletedBuffer and allowed it
        assert.strictEqual(undoCalled, false, "Falsely punished a legitimate cross-file cut-and-paste!");
    });

    test('Workspace-Wide Paste: Should BLOCK and revert unauthorized external OS pastes', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDiffTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        // 1. Set up the workspace files (none of them contain the cheat code)
        diffBuffer.set('main.c', 'int main() {\n\n}');
        diffBuffer.set('header.h', '#define MAX 10');

        // 2. Simulate the OS clipboard holding code from Chrome/ChatGPT
        const illegalSnippet = 'printf("StackOverflow Answer!");\nreturn 0;';
        mockClipboardContent = illegalSnippet; 

        // 3. Simulate pasting it into main.c
        fireDocumentChange('main.c', 'int main() {\n\n}', 'int main() {\n' + illegalSnippet + '\n}', illegalSnippet, 0, 13);

        await new Promise(resolve => setTimeout(resolve, 10));

        // 4. Verify the hammer dropped
        assert.strictEqual(undoCalled, true, "Failed to undo the unauthorized paste!");
        assert.strictEqual(warningShown, true, "Failed to show the warning message to the student!");
    });
});
