// src/test/suite/auth.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { promptForCredentials } from '../../utils/auth';

suite('Authentication UI Validation Tests', () => {
    let showInputBoxStub: sinon.SinonStub;

    setup(() => {
        // Intercept all calls to vscode.window.showInputBox
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
    });

    teardown(() => {
        // Restore the original function after each test to prevent side effects
        showInputBoxStub.restore();
    });

    test('Student Number Regex Validation', async () => {
        // We resolve with 'undefined' so the promptForCredentials function 
        // exits early without trying to trigger the second prompt (Student Name).
        showInputBoxStub.resolves(undefined);

        // Call the function to trigger the stub
        await promptForCredentials();

        // Ensure the prompt was actually called
        assert.strictEqual(showInputBoxStub.called, true, "showInputBox should have been called");

        // Extract the InputBoxOptions passed to the FIRST call (which is the Student ID prompt)
        const options: vscode.InputBoxOptions = showInputBoxStub.firstCall.args[0];
        
        // Extract the validateInput function we want to test
        const validateInput = options.validateInput;
        assert.ok(validateInput, "validateInput function should be defined");

        // The expected error message for regex failures
        const regexErrorMsg = "Student Number must be in the format: YYYY-NNNNN (e.g., 2026-12345).";
        const emptyErrorMsg = "Student Number cannot be empty.";

        // --- 1. Test Valid Formats (Should return null/undefined) ---
        assert.strictEqual(await validateInput('2026-12345'), null, "Valid ID rejected");
        assert.strictEqual(await validateInput(' 1999-00000 '), null, "Valid ID with whitespace rejected");

        // --- 2. Test Invalid Formats (Should return the regex error message) ---
        assert.strictEqual(await validateInput('202A-12345'), regexErrorMsg, "Failed to catch letter in year");
        assert.strictEqual(await validateInput('2026 12345'), regexErrorMsg, "Failed to catch space instead of dash");
        assert.strictEqual(await validateInput('202-12345'), regexErrorMsg, "Failed to catch short year");
        assert.strictEqual(await validateInput('2026-1234'), regexErrorMsg, "Failed to catch short sequence");
        assert.strictEqual(await validateInput('abcd-efghi'), regexErrorMsg, "Failed to catch all letters");

        // --- 3. Test Empty/Whitespace (Should return the empty error message) ---
        assert.strictEqual(await validateInput(''), emptyErrorMsg, "Failed to catch empty string");
        assert.strictEqual(await validateInput('   '), emptyErrorMsg, "Failed to catch whitespace-only string");
    });
});
