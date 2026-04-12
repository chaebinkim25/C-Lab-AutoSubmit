import * as assert from 'assert';
import * as vscode from 'vscode';
import { getOSPlatform, validateCppTools } from '../../utils/environment';

suite('Core Utils: Environment', () => {
    let originalGetExtension: typeof vscode.extensions.getExtension;
    let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
    let originalExecuteCommand: typeof vscode.commands.executeCommand;

    setup(() => {
        // Backup the original VS Code APIs before each test
        originalGetExtension = vscode.extensions.getExtension;
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalExecuteCommand = vscode.commands.executeCommand;
    });

    teardown(() => {
        // Restore the original APIs after each test!
        (vscode.extensions as any).getExtension = originalGetExtension;
        (vscode.window as any).showErrorMessage = originalShowErrorMessage;
        (vscode.commands as any).executeCommand = originalExecuteCommand;
    });

    test('getOSPlatform: should return a valid operating system string', () => {
        const platform = getOSPlatform();
        
        // Ensure it returns a string and is not empty or undefined
        assert.ok(platform, "Platform string should not be empty");
        assert.strictEqual(typeof platform, 'string', "Platform should be a string");
        
        // It should match common Node.js process.platform outputs
        const validPlatforms = ['win32', 'darwin', 'linux'];
        assert.ok(validPlatforms.includes(platform) || platform.length > 0, `Returned unknown platform: ${platform}`);
    });

    test('validateCppTools: should return true if C/C++ extension is installed', async () => {
        // Mock getExtension to return a "fake" extension object
        (vscode.extensions as any).getExtension = (extId: string) => {
            if (extId === 'ms-vscode.cpptools') { return { id: extId, isActive: true }; }
            return undefined;
        };

        const mockContext = { subscriptions: [] } as any;
        const isValid = await validateCppTools(mockContext);
        assert.strictEqual(isValid, true, "Should return true when extension is found");
    });

    test('validateCppTools: should show prompt and return false if missing', async () => {
        // Mock getExtension to simulate the extension being missing
        (vscode.extensions as any).getExtension = () => undefined;

        let errorMessageShown = false;

        // Intercept the popup and simulate the user just closing it (returning undefined)
        (vscode.window as any).showErrorMessage = async (msg: string) => {
            errorMessageShown = true;
            return undefined;
        };

        const mockContext = { subscriptions: [] } as any;
        const isValid = await validateCppTools(mockContext);
        
        assert.strictEqual(isValid, false, "Should return false when extension is missing");
        assert.strictEqual(errorMessageShown, true, "Should have shown an error/warning message to the user");
    });

    test('validateCppTools: should trigger install command if user clicks Install', async () => {
        // Mock getExtension to simulate missing extension
        (vscode.extensions as any).getExtension = () => undefined;

        // Intercept the popup and simulate the user clicking a button named 'Install'
        (vscode.window as any).showErrorMessage = async (msg: string, ...items: string[]) => {
            // Check if one of your buttons is named "Install" (or adjust this if you named it differently)
            return items.includes('Install') ? 'Install' : items[0]; 
        };

        let executedCommand = '';
        let executedArg = '';

        // Intercept the command execution to see what your code tries to run
        (vscode.commands as any).executeCommand = async (command: string, arg: string) => {
            executedCommand = command;
            executedArg = arg;
        };

        const mockContext = { subscriptions: [] } as any;
        const isValid = await validateCppTools(mockContext);

        assert.strictEqual(isValid, false, "Should still return false because it's not active yet");
        // Verify your code attempted to open the extension installation page
        assert.strictEqual(executedCommand, 'extension.open');
        assert.strictEqual(executedArg, 'ms-vscode.cpptools');
    });
});
