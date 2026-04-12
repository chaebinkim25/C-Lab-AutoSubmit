import * as assert from 'assert';
import * as vscode from 'vscode';
import { verifyWorkspace, enforcePolicies, writeAndOpenSkeleton, captureWorkspaceSnapshot, wipeAndDeleteFile } from '../../utils/workspace';

suite('Core Utils: Workspace', () => {
    let originalWorkspaceFolders: any;
    let originalIsTrusted: any;
    let originalGetConfiguration: any;
    let originalShowErrorMessage: any;
    let originalFindFiles: any;
    let originalAsRelativePath: any;
    let originalOpenTextDocument: any;
    let originalShowTextDocument: any;
    
    // FileSystem Mocking State
    let originalFs: any;
    let mockFs: any;

    setup(() => {
        // Backup original VS Code APIs
        originalWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
        originalIsTrusted = Object.getOwnPropertyDescriptor(vscode.workspace, 'isTrusted');
        
        originalGetConfiguration = vscode.workspace.getConfiguration;
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalFindFiles = vscode.workspace.findFiles;
        originalAsRelativePath = vscode.workspace.asRelativePath;
        originalOpenTextDocument = vscode.workspace.openTextDocument;
        originalShowTextDocument = vscode.window.showTextDocument;

        // FS Strategy: Replace the entire 'fs' namespace with a mutable mock object
        originalFs = vscode.workspace.fs;
        mockFs = {
            writeFile: async () => {},
            readFile: async () => new Uint8Array(),
            delete: async () => {}
        };
        Object.defineProperty(vscode.workspace, 'fs', { get: () => mockFs, configurable: true });
    });

    teardown(() => {
        // Safely restore properties
        try {
            if (originalWorkspaceFolders) {Object.defineProperty(vscode.workspace, 'workspaceFolders', originalWorkspaceFolders);}
            else {delete (vscode.workspace as any).workspaceFolders;}
        } catch (e) {}

        try {
            if (originalIsTrusted) {Object.defineProperty(vscode.workspace, 'isTrusted', originalIsTrusted);}
            else {delete (vscode.workspace as any).isTrusted;}
        } catch (e) {}
        
        // Restore the original FileSystem
        Object.defineProperty(vscode.workspace, 'fs', { get: () => originalFs, configurable: true });

        // Restore standard methods
        (vscode.workspace as any).getConfiguration = originalGetConfiguration;
        (vscode.window as any).showErrorMessage = originalShowErrorMessage;
        (vscode.workspace as any).findFiles = originalFindFiles;
        (vscode.workspace as any).asRelativePath = originalAsRelativePath;
        (vscode.workspace as any).openTextDocument = originalOpenTextDocument;
        (vscode.window as any).showTextDocument = originalShowTextDocument;
    });

    test('verifyWorkspace: should return URI if a folder is open and trusted', async () => {
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => [{ uri: vscode.Uri.file('/mock/workspace') }], configurable: true });
        Object.defineProperty(vscode.workspace, 'isTrusted', { get: () => true, configurable: true });

        const uri = await verifyWorkspace();
        assert.ok(uri, "Should return a URI when valid");
        assert.strictEqual(uri.fsPath.includes('mock'), true);
    });

    test('verifyWorkspace: should fail if workspace is in Restricted Mode', async () => {
        Object.defineProperty(vscode.workspace, 'workspaceFolders', { get: () => [{ uri: vscode.Uri.file('/mock/workspace') }], configurable: true });
        Object.defineProperty(vscode.workspace, 'isTrusted', { get: () => false, configurable: true });

        let errorShown = false;
        (vscode.window as any).showErrorMessage = async () => { errorShown = true; };

        const uri = await verifyWorkspace();
        assert.strictEqual(uri, undefined, "Should return undefined if restricted");
        assert.strictEqual(errorShown, true, "Should show an error about trusting the folder");
    });

    test('enforcePolicies: should correctly override user settings', async () => {
        let updateCalls: { section: string, value: any, target: any }[] = [];

        (vscode.workspace as any).getConfiguration = () => ({
            update: async (section: string, value: any, target: any) => {
                updateCalls.push({ section, value, target });
            }
        });

        await enforcePolicies();

        // THE FIX: Expect 10 updates instead of 2
        assert.strictEqual(updateCalls.length, 10, "Should update ten strict lab settings");
        
        // Verify a couple of the critical ones exist
        assert.ok(updateCalls.find(u => u.section === 'autoSave' && u.value === 'afterDelay'));
        assert.ok(updateCalls.find(u => u.section === 'inlineSuggest.enabled' && u.value === false));
    });

    test('writeAndOpenSkeleton: should write to disk and open the file', async () => {
        let writtenUri: vscode.Uri | undefined;
        let openedUri: vscode.Uri | undefined;

        // Assigning to mockFs!
        mockFs.writeFile = async (uri: vscode.Uri) => { writtenUri = uri; };
        
        (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
            openedUri = uri;
            return { uri };
        };
        (vscode.window as any).showTextDocument = async () => {};

        const targetUri = vscode.Uri.file('/mock/workspace');
        await writeAndOpenSkeleton(targetUri, 'main.c', 'int main() {}');

        assert.ok(writtenUri, "File was never written to disk");
        assert.ok(writtenUri!.fsPath.includes('main.c'), "Wrote to the wrong filename");
        assert.strictEqual(openedUri?.fsPath, writtenUri!.fsPath, "Did not open the file that was written");
    });

    test('captureWorkspaceSnapshot: should extract source and config files', async () => {
        (vscode.workspace as any).findFiles = async (pattern: string) => {
            if (pattern.includes('.json')) {return [vscode.Uri.file('/mock/.vscode/settings.json')];}
            return [vscode.Uri.file('/mock/main.c')];
        };

        (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => uri.fsPath.replace(/.*mock[/\\]/, '');

        // Assigning to mockFs!
        mockFs.readFile = async (uri: vscode.Uri) => {
            const encoder = new TextEncoder();
            if (uri.fsPath.endsWith('main.c')) {return encoder.encode('main_code');}
            if (uri.fsPath.endsWith('settings.json')) {return encoder.encode('{"tabSize": 4}');}
            return new Uint8Array();
        };

        const snapshot = await captureWorkspaceSnapshot();

        assert.strictEqual(snapshot.sourceFiles['main.c'], 'main_code', "Failed to capture source file");
        
        const configKey = Object.keys(snapshot.vscodeConfigs).find(k => k.includes('settings.json'));
        assert.ok(configKey, "Failed to capture config file");
        assert.strictEqual(snapshot.vscodeConfigs[configKey!], '{"tabSize": 4}', "Extracted config text is incorrect");
    });

    test('wipeAndDeleteFile: should overwrite buffer before deleting', async () => {
        let callOrder: string[] = [];

        // Assigning to mockFs!
        mockFs.writeFile = async (uri: vscode.Uri, content: Uint8Array) => {
            if (content.length === 0) {callOrder.push('write_zero');}
        };

        mockFs.delete = async (uri: vscode.Uri, options: any) => {
            if (options?.useTrash === false) {callOrder.push('delete_no_trash');}
        };

        const fileUri = vscode.Uri.file('/mock/secret.c');
        await wipeAndDeleteFile(fileUri);

        assert.strictEqual(callOrder.length, 2, "Did not execute both operations");
        assert.strictEqual(callOrder[0], 'write_zero', "MUST overwrite with 0 bytes first for security!");
        assert.strictEqual(callOrder[1], 'delete_no_trash', "Delete bypassing trash must happen last");
    });
});
