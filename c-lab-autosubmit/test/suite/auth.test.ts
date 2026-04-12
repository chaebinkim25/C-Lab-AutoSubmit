import * as assert from 'assert';
import * as vscode from 'vscode';
import { promptForCredentials } from '../../utils/auth';

suite('Core Utils: Auth', () => {
    let originalShowInputBox: typeof vscode.window.showInputBox;

    setup(() => {
        // Backup the original VS Code API before each test
        originalShowInputBox = vscode.window.showInputBox;
    });

    teardown(() => {
        // Restore the original API after each test so we don't break VS Code!
        (vscode.window as any).showInputBox = originalShowInputBox;
    });

    test('promptForCredentials: should return credentials on valid input', async () => {
        let callCount = 0;
        
        // Mock the popup to simulate a user typing '20261234' then 'Gildong'
        (vscode.window as any).showInputBox = async () => {
            callCount++;
            return callCount === 1 ? '2026-12345' : 'Gildong';
        };

        const result = await promptForCredentials();
        
        assert.ok(result, "Function returned undefined instead of credentials");
        assert.strictEqual(result.studentNumber, '2026-12345');
        assert.strictEqual(result.studentName, 'Gildong');
    });

    test('promptForCredentials: should return undefined on cancellation (ESC)', async () => {
        // Mock the popup to return undefined, which is what VS Code does when a user hits ESC
        (vscode.window as any).showInputBox = async () => {
            return undefined; 
        };

        const result = await promptForCredentials();
        
        assert.strictEqual(result, undefined, "Function should return undefined when cancelled");
    });

    test('promptForCredentials: validateInput should reject empty strings and non-digits', async () => {
        let idValidator: any;
        let nameValidator: any;
        let callCount = 0;

        // Intercept the options object to steal the validation functions!
        (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
            callCount++;
            if (callCount === 1) {
                idValidator = options.validateInput;
                return '2026-12345'; 
            } else if (callCount === 2) {
                nameValidator = options.validateInput;
                return 'Gildong';
            }
        };

        // Run the function just to trigger our interceptor
        await promptForCredentials();

        assert.ok(idValidator, "No validation function found for student ID!");

        // 1. Test ID Validation (Regex)
        const emptyIdCheck = await idValidator('');
        assert.ok(emptyIdCheck, "Expected an error string for empty ID, but got valid");

        const letterCheck = await idValidator('2026-abcde');
        assert.ok(letterCheck, "Expected an error string for non-digits, but got valid");

        const validIdCheck = await idValidator('2026-12345');
        assert.strictEqual(validIdCheck, null, "Expected undefined (valid) for correct ID");

        // 2. Test Name Validation (Empty string check)
        if (nameValidator) {
            const emptyNameCheck = await nameValidator('');
            assert.ok(emptyNameCheck, "Expected an error string for empty name");

            const validNameCheck = await nameValidator('Gildong');
            assert.strictEqual(validNameCheck, null, "Expected undefined (valid) for correct Name");
        }
    });
});
