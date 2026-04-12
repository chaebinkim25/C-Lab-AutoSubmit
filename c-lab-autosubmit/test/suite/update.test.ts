import * as assert from 'assert';
import * as vscode from 'vscode';
import { enforceVersionCheck } from '../../utils/update';

suite('Core Utils: Update', () => {
    let originalCreateStatusBarItem: typeof vscode.window.createStatusBarItem;
    let originalRegisterCommand: typeof vscode.commands.registerCommand;
    let originalFetch: typeof global.fetch;
    
    let mockStatusBarItem: any;
    let mockContext: any;

    setup(() => {
        // Backup original APIs
        originalCreateStatusBarItem = vscode.window.createStatusBarItem;
        originalRegisterCommand = vscode.commands.registerCommand;
        originalFetch = global.fetch;

        // 1. Create a Fake Status Bar Item
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            command: undefined,
            isVisible: false,
            show: function() { this.isVisible = true; },
            hide: function() { this.isVisible = false; },
            dispose: function() {}
        };
        (vscode.window as any).createStatusBarItem = () => mockStatusBarItem;

        // 2. Intercept command registration so it doesn't crash VS Code
        (vscode.commands as any).registerCommand = (command: string, callback: any) => {
            return { dispose: () => {} }; // Return a dummy disposable
        };

        // 3. Create a Fake Extension Context
        mockContext = {
            extension: { 
                packageJSON: { version: '1.0.5' } // The "current" version
            },
            subscriptions: []
        };
    });

    teardown(() => {
        // Restore original APIs!
        (vscode.window as any).createStatusBarItem = originalCreateStatusBarItem;
        (vscode.commands as any).registerCommand = originalRegisterCommand;
        global.fetch = originalFetch;
    });

    test('enforceVersionCheck: should return true and pass silently when versions match', async () => {
        // Mock fetch to return matching required version
        global.fetch = async (): Promise<any> => ({
            ok: true,
            // (Providing both text() and json() in case your fetchRequiredVersion uses either)
            text: async () => '1.0.5',
            json: async () => ({ required_version: '1.0.5', version: '1.0.5' })
        });

        const result = await enforceVersionCheck(mockContext, '1.0.5');

        assert.strictEqual(result, true, "Should return true to allow activation");
        assert.strictEqual(mockStatusBarItem.isVisible, false, "Status bar item should NOT be shown");
        assert.strictEqual(mockContext.subscriptions.length, 0, "Should not add anything to subscriptions");
    });

    test('enforceVersionCheck: should block UI and show status bar on mismatch', async () => {
        mockContext.extension.packageJSON.version = '0.0.1'; // Simulate outdated client
        
        // Mock fetch to return a newer required version
        global.fetch = async (): Promise<any> => ({
            ok: true,
            text: async () => '1.0.5',
            json: async () => ({ required_version: '1.0.5', version: '1.0.5' })
        });

        const result = await enforceVersionCheck(mockContext, '1.0.5');

        assert.strictEqual(result, false, "Should return false to halt the Activation flow");
        
        // Verify Status Bar Generation
        assert.strictEqual(mockStatusBarItem.isVisible, true, "Status bar item MUST be visible");
        assert.ok(mockStatusBarItem.text.includes('Updating'), "Status bar text should mention updating");
        assert.strictEqual(mockStatusBarItem.command, 'c-lab.openExtensionPane', "Should attach the click command");
        
        // Verify Memory Management
        assert.strictEqual(mockContext.subscriptions.length, 2, "Should push status bar and command to subscriptions");
    });

    test('enforceVersionCheck: should fail-safe and strictly block if network check fails', async () => {
        // Force the network request to crash
        global.fetch = async (): Promise<any> => { throw new Error("Network offline"); };

        // THE FIX: Pass null to simulate the network returning no version
        const result = await enforceVersionCheck(mockContext, null);

        assert.strictEqual(result, false, "Should safely block activation if version cannot be verified");
    });
});
