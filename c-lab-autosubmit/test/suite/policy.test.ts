import * as assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../../extension';

suite('Security & Policy: Watchdog Enforcement', () => {
    let capturedConfigChangeListener: (e: vscode.ConfigurationChangeEvent) => void;
    let capturedStartLab: () => Promise<void>; 
    let updateSpy: { section: string, value: any, target: any }[] = [];

    let originalOnDidChangeConfig: any;
    let originalGetConfiguration: any;
    let originalFetch: any;
    let originalRegisterCommand: any;

    setup(async () => {
        updateSpy = [];

        // 1. Intercept Configuration Change Listener
        originalOnDidChangeConfig = vscode.workspace.onDidChangeConfiguration;
        (vscode.workspace as any).onDidChangeConfiguration = (callback: any) => {
            capturedConfigChangeListener = callback;
            return { dispose: () => {} };
        };

        // 2. Intercept Command Registration to grab executeInit
        originalRegisterCommand = vscode.commands.registerCommand;
        (vscode.commands as any).registerCommand = (cmd: string, callback: any) => {
            if (cmd === 'c-lab.executeInit') {capturedStartLab = callback;}
            return { dispose: () => {} }; 
        };

        // 3. Intercept getConfiguration to spy on updates
        originalGetConfiguration = vscode.workspace.getConfiguration;
        (vscode.workspace as any).getConfiguration = (section: string) => {
            return {
                update: async (sec: string, val: any, target: any) => {
                    updateSpy.push({ section: sec, value: val, target });
                }
            };
        };

        // 4. Mock fetch so activation doesn't abort
        originalFetch = global.fetch;
        global.fetch = async (url: any, init?: any) => {
            // Silently mock the security violation endpoint as well
            if (url && url.toString().includes('security-violation')) {
                return { ok: true, status: 200 } as any;
            }
            return { 
                ok: true, 
                json: async () => ({ 
                    is_lab_time: true, 
                    current_version: '1.0.5',
                    required_version: '1.0.5'
                }) 
            } as any;
        };

        // 5. Activate the extension safely
        const dummyContext = {
            extension: { packageJSON: { version: '1.0.5' } },
            subscriptions: [],
            globalState: { get: () => 'MAC', update: async () => {} }
        } as any;
        
        await extension.activate(dummyContext);
    });

    teardown(() => {
        (vscode.workspace as any).onDidChangeConfiguration = originalOnDidChangeConfig;
        (vscode.workspace as any).getConfiguration = originalGetConfiguration;
        (vscode.commands as any).registerCommand = originalRegisterCommand;
        global.fetch = originalFetch;
    });

    test('Policy Watchdog: Should catch and instantly revert autoSave, tabSize, and AI completion tampering', async () => {
        assert.ok(capturedStartLab, "executeInit command was not captured!");

        // 1. Mock verifyWorkspace requirements safely
        const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        const originalIsTrusted = vscode.workspace.isTrusted;
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => [{ uri: vscode.Uri.file('/mock') }], configurable: true });
        Object.defineProperty(vscode.workspace, 'isTrusted', { get: () => true, configurable: true });

        global.fetch = async (url: any) => ({ ok: true, json: async () => ([{ task_id: '1', skeleton_code: '' }]) } as any);
        
        const originalInputBox = vscode.window.showInputBox;
        (vscode.window as any).showInputBox = async () => '2026-12345';
        
        // 2. Establish Session
        await capturedStartLab();
        assert.ok(capturedConfigChangeListener, "Configuration change listener was not registered!");

        // Clear legitimate initialization updates so our spy is empty
        updateSpy = []; 

        // ==========================================
        // SCENARIO A: Student tries to turn on GitHub Copilot
        // ==========================================
        const aiEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'editor.inlineSuggest.enabled'
        };
        await capturedConfigChangeListener(aiEvent);

        let aiUpdate = updateSpy.find(u => u.section === 'inlineSuggest.enabled');
        assert.ok(aiUpdate, "🚨 SECURITY BREACH: Watchdog ignored AI completion tampering.");
        assert.strictEqual(aiUpdate.value, false, "AI completion was not forced back to 'false'");

        updateSpy = []; // Reset Spy

        // ==========================================
        // SCENARIO B: Student tries to change indent to 4 spaces
        // ==========================================
        const tabEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'editor.tabSize'
        };
        await capturedConfigChangeListener(tabEvent);

        let tabUpdate = updateSpy.find(u => u.section === 'tabSize');
        assert.ok(tabUpdate, "🚨 SECURITY BREACH: Watchdog ignored tabSize tampering.");
        assert.strictEqual(tabUpdate.value, 8, "tabSize was not forced back to 8");

        updateSpy = []; // Reset Spy

        // ==========================================
        // SCENARIO C: Student tries to turn off autoSave
        // ==========================================
        const saveEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'files.autoSave'
        };
        await capturedConfigChangeListener(saveEvent);

        let autoSaveUpdate = updateSpy.find(u => u.section === 'autoSave');
        assert.ok(autoSaveUpdate, "🚨 SECURITY BREACH: Watchdog ignored autoSave tampering.");
        assert.strictEqual(autoSaveUpdate.value, 'afterDelay', "autoSave was not forced back to 'afterDelay'");

        // Clean up
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => originalWorkspaceFolders, configurable: true });
        Object.defineProperty(vscode.workspace, 'isTrusted', { get: () => originalIsTrusted, configurable: true });
        (vscode.window as any).showInputBox = originalInputBox;
    });
});
