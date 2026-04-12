import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerDebugTracker } from '../../tracking/debugTracker';

suite('Tracking Engine: Debug Tracker', () => {
    let capturedFactories = new Map<string, vscode.DebugAdapterTrackerFactory>();
    
    // Original API Backups
    let originalRegisterFactory: any;
    let originalFetch: typeof global.fetch;
    let originalActiveTextEditor: any;

    // Spy variable to hold the intercepted network request
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

        // 2. Intercept Network Requests (to catch sendDebugTelemetry on exit)
        originalFetch = global.fetch;
        global.fetch = async (url: any, init?: any) => {
            if (init && init.body) {
                fetchPayload = JSON.parse(init.body as string);
            }
            return { ok: true, status: 200 } as any;
        };

        // 3. Mock the Active Text Editor (for the initial source snapshot)
        originalActiveTextEditor = Object.getOwnPropertyDescriptor(vscode.window, 'activeTextEditor');
        Object.defineProperty(vscode.window, 'activeTextEditor', {
            get: () => ({
                document: { 
                    languageId: 'c', 
                    getText: () => 'int main() { int x = 42; return 0; }' 
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

    // Helper to dynamically find the payload regardless of how api.ts structures the JSON
    const extractDebugData = (payload: any) => {
        if (!payload) {return null;}
        if (payload.variable_inspection) {return payload;} // It's flat
        if (payload.debug_data) {return payload.debug_data;}
        if (payload.debug_payload) {return payload.debug_payload;}
        if (payload.debugPayload) {return payload.debugPayload;}
        if (payload.payload) {return payload.payload;}
        return payload; // Fallback
    };

    test('registerDebugTracker: should map async DAP evaluate requests to their responses', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDebugTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        const factory = capturedFactories.get('cppdbg');
        assert.ok(factory, "Factory for cppdbg was not registered");

        const dummySession = { id: 'session1', name: 'Test Session', type: 'cppdbg' } as any;
        const tracker: any = await factory.createDebugAdapterTracker!(dummySession);

        // A. Start Session
        if (tracker.onWillStartSession) {
            tracker.onWillStartSession();
        }

        // B. VS Code asks the debugger to evaluate a variable
        if (tracker.onWillReceiveMessage) {
            tracker.onWillReceiveMessage({
                type: 'request', command: 'evaluate', seq: 105, 
                arguments: { expression: 'x', context: 'hover' }
            });
        }

        // C. The Debugger replies
        if (tracker.onDidSendMessage) {
            tracker.onDidSendMessage({
                type: 'response', command: 'evaluate', request_seq: 105, 
                success: true, body: { result: '42' }
            });
        }

        // D. End the session
        if (tracker.onExit) {
            tracker.onExit(0, undefined);
        }

        await new Promise(resolve => setTimeout(resolve, 10));

        assert.ok(fetchPayload, "Telemetry fetch was not called upon exit");
        
        // Use our smart extractor!
        const debugData = extractDebugData(fetchPayload); 
        assert.ok(debugData && debugData.variable_inspection, "Could not locate the debug data inside the fetch payload");

        assert.strictEqual(debugData.source_snapshot, 'int main() { int x = 42; return 0; }');
        assert.ok(debugData.variable_inspection['hover'], "Missing hover context array");
        
        const hoverEvent = debugData.variable_inspection['hover'][0];
        assert.strictEqual(hoverEvent.expression, 'x', "Did not capture the evaluated variable name");
        assert.strictEqual(hoverEvent.result, '42', "Did not map the async result back to the variable");
    });

    test('registerDebugTracker: should capture stdout and execution navigation', async () => {
        const dummyContext = { subscriptions: [] } as any;
        registerDebugTracker(dummyContext, '20261234', 'Gildong', 'MAC123');

        const factory = capturedFactories.get('cppdbg');
        const tracker: any = await factory!.createDebugAdapterTracker!({ name: 'Test' } as any);

        if (tracker.onWillStartSession) {
            tracker.onWillStartSession();
        }

        // 1. Simulate "Step Over"
        if (tracker.onWillReceiveMessage) {
            tracker.onWillReceiveMessage({ type: 'request', command: 'next', arguments: {} });
        }

        // 2. Simulate terminal print
        if (tracker.onDidSendMessage) {
            tracker.onDidSendMessage({
                type: 'event', event: 'output',
                body: { category: 'stdout', output: 'Hello World\n' }
            });
        }

        if (tracker.onExit) {
            tracker.onExit(0, undefined);
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));

        // Use our smart extractor!
        const debugData = extractDebugData(fetchPayload);

        assert.ok(debugData && debugData.execution_actions, "Could not locate the debug data inside the fetch payload");
        assert.strictEqual(debugData.execution_actions.length, 1);
        assert.strictEqual(debugData.execution_actions[0].action, 'next');
        assert.strictEqual(debugData.output_streams.stdout, 'Hello World\n');
    });
});
