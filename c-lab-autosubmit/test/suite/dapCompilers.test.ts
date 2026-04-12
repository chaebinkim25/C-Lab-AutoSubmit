import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerDebugTracker } from '../../tracking/debugTracker';

suite('Integration: DAP Compiler Variants (GCC vs Clang)', () => {
    let capturedFactories = new Map<string, vscode.DebugAdapterTrackerFactory>();
    
    // Original API Backups
    let originalRegisterFactory: any;
    let originalFetch: typeof global.fetch;
    let originalActiveTextEditor: any;

    let fetchPayload: any = null;

    setup(() => {
        fetchPayload = null;
        capturedFactories.clear();

        // 1. Intercept Factory Registration
        originalRegisterFactory = vscode.debug.registerDebugAdapterTrackerFactory;
        (vscode.debug as any).registerDebugAdapterTrackerFactory = (type: string, factory: vscode.DebugAdapterTrackerFactory) => {
            capturedFactories.set(type, factory);
            return { dispose: () => {} };
        };

        // 2. Intercept Network Requests
        originalFetch = global.fetch;
        global.fetch = async (url: any, init?: any) => {
            if (init && init.body) {
                fetchPayload = JSON.parse(init.body as string);
            }
            return { ok: true, status: 200 } as any;
        };

        // 3. Mock the Active Text Editor
        originalActiveTextEditor = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
        Object.defineProperty(vscode.window, 'activeTextEditor', {
            get: () => ({
                document: { 
                    languageId: 'c', 
                    getText: () => 'int arr[3] = {1, 2, 3};' 
                }
            }),
            configurable: true
        });
    });

    teardown(() => {
        (vscode.debug as any).registerDebugAdapterTrackerFactory = originalRegisterFactory;
        global.fetch = originalFetch;
        
        if (originalActiveTextEditor) {
            Object.defineProperty(vscode.window, 'activeTextEditor', originalActiveTextEditor);
        } else {
            delete (vscode.window as any).activeTextEditor;
        }
    });

    const extractDebugData = (payload: any) => {
        if (!payload) { return null; }
        if (payload.variable_inspection) { return payload; }
        if (payload.debug_data) { return payload.debug_data; }
        return payload;
    };

    test('DAP Interception: Should handle GCC/GDB string formatting', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDebugTracker(dummyContext, '20261234', 'Gildong', 'MAC-GCC');

        const factory = capturedFactories.get('cppdbg');
        const tracker: any = await factory!.createDebugAdapterTracker!({ id: 's1', name: 'GDB', type: 'cppdbg' } as any);

        if (tracker.onWillStartSession) { tracker.onWillStartSession(); }

        // Simulate GDB Variable Evaluation
        if (tracker.onWillReceiveMessage) {
            tracker.onWillReceiveMessage({ type: 'request', command: 'evaluate', seq: 10, arguments: { expression: 'arr', context: 'watch' }});
        }
        if (tracker.onDidSendMessage) {
            tracker.onDidSendMessage({ type: 'response', command: 'evaluate', request_seq: 10, success: true, body: { result: '{1, 2, 3}' }});
            // Simulate GDB system output
            tracker.onDidSendMessage({ type: 'event', event: 'output', body: { category: 'stderr', output: '[New Thread 0x123 of process 456]\n' }});
        }

        if (tracker.onExit) { tracker.onExit(0, undefined); }
        await new Promise(resolve => setTimeout(resolve, 10));

        const debugData = extractDebugData(fetchPayload);
        
        assert.ok(debugData, "Failed to capture GDB payload");
        assert.strictEqual(debugData.variable_inspection['watch'][0].result, '{1, 2, 3}', "Failed to parse GDB array format");
        assert.ok(debugData.output_streams.stderr.includes('[New Thread'), "Failed to capture GDB stderr stream");
    });

    test('DAP Interception: Should handle Clang/LLDB string formatting', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDebugTracker(dummyContext, '20261234', 'Gildong', 'MAC-CLANG');

        const factory = capturedFactories.get('cppdbg');
        const tracker: any = await factory!.createDebugAdapterTracker!({ id: 's2', name: 'LLDB', type: 'cppdbg' } as any);

        if (tracker.onWillStartSession) { tracker.onWillStartSession(); }

        // Simulate LLDB Variable Evaluation (Notice the strict type casting LLDB uses)
        if (tracker.onWillReceiveMessage) {
            tracker.onWillReceiveMessage({ type: 'request', command: 'evaluate', seq: 20, arguments: { expression: 'arr', context: 'hover' }});
        }
        if (tracker.onDidSendMessage) {
            tracker.onDidSendMessage({ type: 'response', command: 'evaluate', request_seq: 20, success: true, body: { result: '(int [3]) [1, 2, 3]' }});
            // Simulate LLDB system output
            tracker.onDidSendMessage({ type: 'event', event: 'output', body: { category: 'console', output: 'Process 789 stopped\n* thread #1, queue = com.apple.main-thread\n' }});
        }

        if (tracker.onExit) { tracker.onExit(0, undefined); }
        await new Promise(resolve => setTimeout(resolve, 10));

        const debugData = extractDebugData(fetchPayload);
        
        assert.ok(debugData, "Failed to capture LLDB payload");
        assert.strictEqual(debugData.variable_inspection['hover'][0].result, '(int [3]) [1, 2, 3]', "Failed to parse LLDB type-cast array format");
    });
});
