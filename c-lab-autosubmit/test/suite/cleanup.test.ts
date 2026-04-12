import * as assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../../extension';

suite('Integration & E2E: Extension Cleanup', () => {
    let executedCommands: string[] = [];
    let appliedEdits: vscode.WorkspaceEdit[] = [];
    let statusBarHidden = false;
    let capturedCleanup: () => Promise<void>; // <-- The secret weapon

    // Original API Backups
    let originalRegisterCommand: any;
    let originalExecuteCommand: any;
    let originalTextDocuments: any;
    let originalApplyEdit: any;
    let originalCreateStatusBarItem: any;
    let originalGetExtension: any;
    let originalFetch: any;
    let originalShowInfo: any;

    setup(async () => {
        executedCommands = [];
        appliedEdits = [];
        statusBarHidden = false;

        // 1. Mock Fetch so the extension passes its activation checks
        originalFetch = global.fetch;
        global.fetch = async () => ({ 
            ok: true, 
            json: async () => ({ is_lab_time: true, required_version: '1.0.5' }) // THE FIX: Matching schema and version
        } as any);
        
        // 2. Mock dependency validation
        originalGetExtension = vscode.extensions.getExtension;
        (vscode.extensions as any).getExtension = () => ({ isActive: true });

        // 3. Mock StatusBarItem to capture the .hide() call
        originalCreateStatusBarItem = vscode.window.createStatusBarItem;
        (vscode.window as any).createStatusBarItem = () => ({
            text: '', tooltip: '', command: '',
            show: () => {}, 
            hide: () => { statusBarHidden = true; } // Spy on the hide action!
        });

        // 4. THE BYPASS: Intercept the command registration
        originalRegisterCommand = vscode.commands.registerCommand;
        (vscode.commands as any).registerCommand = (cmd: string, callback: any) => {
            if (cmd === 'c-lab.cleanup') {capturedCleanup = callback;} // Steal the function!
            return { dispose: () => {} };
        };

        // 5. Intercept executeCommand to capture closeAllEditors and closeFolder
        originalExecuteCommand = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async (cmd: string) => {
            executedCommands.push(cmd);
            return; 
        };

        // 6. Safely mock the text documents array in memory
        originalTextDocuments = Object.getOwnPropertyDescriptor(vscode.workspace, 'textDocuments');
        Object.defineProperty(vscode.workspace, 'textDocuments', {
            get: () => [{
                isUntitled: true,
                fileName: 'Lab_Review.md',
                uri: vscode.Uri.parse('untitled:Lab_Review.md'),
                getText: () => 'Mock Review Data',
                positionAt: (offset: number) => new vscode.Position(0, offset)
            }],
            configurable: true
        });

        // 7. Intercept the WorkspaceEdit 
        originalApplyEdit = vscode.workspace.applyEdit;
        (vscode.workspace as any).applyEdit = async (edit: vscode.WorkspaceEdit) => {
            appliedEdits.push(edit);
            return true;
        };

        // 8. Silence UI popups
        originalShowInfo = vscode.window.showInformationMessage;
        (vscode.window as any).showInformationMessage = async () => {};

        // 9. Force the extension to activate
        const dummyContext = {
            extension: { packageJSON: { version: '1.0.5' } },
            subscriptions: [],
            globalState: { get: () => 'MOCK_MACHINE_ID', update: async () => {} }
        } as any;
        
        await extension.activate(dummyContext);
    });

    teardown(() => {
        global.fetch = originalFetch;
        (vscode.extensions as any).getExtension = originalGetExtension;
        (vscode.window as any).createStatusBarItem = originalCreateStatusBarItem;
        (vscode.commands as any).registerCommand = originalRegisterCommand;
        (vscode.commands as any).executeCommand = originalExecuteCommand;
        if (originalTextDocuments) {Object.defineProperty(vscode.workspace, 'textDocuments', originalTextDocuments);}
        (vscode.workspace as any).applyEdit = originalApplyEdit;
        (vscode.window as any).showInformationMessage = originalShowInfo;
    });

    test('c-lab.cleanup: Should cleanly detach UI, clear buffers, and close the workspace', async () => {
        // Ensure the command was actually captured during activate()
        assert.ok(capturedCleanup, "Cleanup command was never registered during activation!");
        
        // EXECUTE THE CAPTURED FUNCTION DIRECTLY
        await capturedCleanup();

        // --- ASSERTIONS ---
        assert.strictEqual(statusBarHidden, true, "Cleanup failed to hide the Status Bar UI");
        assert.strictEqual(appliedEdits.length, 1, "Cleanup failed to apply a workspace edit to clear the Markdown file");
        assert.ok(executedCommands.includes('workbench.action.closeAllEditors'), "Cleanup failed to close editor tabs");
        assert.ok(executedCommands.includes('workbench.action.closeFolder'), "Cleanup failed to eject the workspace folder");
        
        assert.strictEqual(extension.sessionTasks.length, 0, "Global sessionTasks were not reset");
        assert.strictEqual(extension.currentTaskIndex, 0, "Global currentTaskIndex was not reset");
    });
});
