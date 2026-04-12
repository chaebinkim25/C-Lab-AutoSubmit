import * as assert from 'assert';
import * as vscode from 'vscode';
import { wipeAndDeleteFile } from '../../utils/workspace';

suite('Security & Policy: Secure Wipe Verification', () => {
    let originalFs: any;
    let actionLog: { action: string, uri: string, data?: any, options?: any }[] = [];

    setup(() => {
        actionLog = [];

        // Safely mock the entire FileSystem object to avoid read-only API errors
        originalFs = vscode.workspace.fs;
        const mockFs = {
            writeFile: async (uri: vscode.Uri, content: Uint8Array) => {
                actionLog.push({ action: 'writeFile', uri: uri.fsPath, data: content });
            },
            delete: async (uri: vscode.Uri, options?: { useTrash: boolean }) => {
                actionLog.push({ action: 'delete', uri: uri.fsPath, options });
            },
            readFile: async () => new Uint8Array() // Stub just in case
        };
        Object.defineProperty(vscode.workspace, 'fs', { get: () => mockFs, configurable: true });
    });

    teardown(() => {
        Object.defineProperty(vscode.workspace, 'fs', { get: () => originalFs, configurable: true });
    });

    test('wipeAndDeleteFile: Should overwrite file with empty bytes before permanently deleting', async () => {
        const targetUri = vscode.Uri.file('/mock/secure-file.c');

        // Execute the secure wipe!
        await wipeAndDeleteFile(targetUri);

        // Verify the sequence of operations
        assert.strictEqual(actionLog.length, 2, "Expected exactly 2 file system operations (write then delete)");

        // --- Step 1: Verification of the Wipe ---
        const writeAction = actionLog[0];
        assert.strictEqual(writeAction.action, 'writeFile', "First action must be a file overwrite");
        assert.strictEqual(writeAction.uri, targetUri.fsPath, "Overwrite targeted the wrong file");
        assert.ok(writeAction.data instanceof Uint8Array, "Content must be written as a byte array");
        assert.strictEqual(writeAction.data.length, 0, "🚨 SECURITY FAILURE: File was not overwritten with 0 bytes before deletion!");

        // --- Step 2: Verification of the Delete ---
        const deleteAction = actionLog[1];
        assert.strictEqual(deleteAction.action, 'delete', "Second action must be a file deletion");
        assert.strictEqual(deleteAction.uri, targetUri.fsPath, "Deletion targeted the wrong file");
        assert.strictEqual(deleteAction.options?.useTrash, false, "🚨 SECURITY FAILURE: File was not permanently deleted (useTrash must be false)!");
    });
});
