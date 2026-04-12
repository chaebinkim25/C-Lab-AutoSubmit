// src/test/suite/fileTracker.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerFileWatcher } from '../../tracking/fileTracker';

suite('Security & Policy: OS-Level File Watcher', () => {
    // Callbacks to simulate the OS events
    let capturedOnDidCreate: (uri: vscode.Uri) => void;
    let capturedOnDidChange: (uri: vscode.Uri) => void;
    let capturedOnDidDelete: (uri: vscode.Uri) => void;

    let originalCreateWatcher: any;
    let originalAsRelativePath: any;
    let originalFetch: any;

    let networkLog: any[] = [];

    setup(() => {
        networkLog = [];

        // 1. Intercept network requests to capture Security Violations
        originalFetch = global.fetch;
        global.fetch = async (url: any, init?: any) => {
            if (init && init.body) {
                networkLog.push(JSON.parse(init.body as string));
            }
            return { ok: true, status: 200 } as any;
        };

        // 2. Mock Path Formatting
        originalAsRelativePath = vscode.workspace.asRelativePath;
        (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => {
            // Simply strip the mock directory prefix to get the filename
            return uri.fsPath.replace('/mock_workspace/', '').replace('\\mock_workspace\\', '');
        };

        // 3. Intercept the FileSystemWatcher Creation
        originalCreateWatcher = vscode.workspace.createFileSystemWatcher;
        (vscode.workspace as any).createFileSystemWatcher = (pattern: vscode.GlobPattern) => {
            return {
                // Steal the callback functions so we can trigger them manually!
                onDidCreate: (cb: any) => { capturedOnDidCreate = cb; return { dispose: () => {} }; },
                onDidChange: (cb: any) => { capturedOnDidChange = cb; return { dispose: () => {} }; },
                onDidDelete: (cb: any) => { capturedOnDidDelete = cb; return { dispose: () => {} }; },
                dispose: () => {}
            };
        };
    });

    teardown(() => {
        (vscode.workspace as any).createFileSystemWatcher = originalCreateWatcher;
        (vscode.workspace as any).asRelativePath = originalAsRelativePath;
        global.fetch = originalFetch;
    });

    test('File Watcher: Should detect external file creations (e.g., Drag & Drop)', async () => {
        const workspaceUri = vscode.Uri.file('/mock_workspace');
        registerFileWatcher('20261234', 'Gildong', 'MAC123', workspaceUri);

        assert.ok(capturedOnDidCreate, "onDidCreate listener was not registered");

        // Simulate OS event: Student drags "chatgpt_answers.c" into the folder
        const droppedFileUri = vscode.Uri.file('/mock_workspace/chatgpt_answers.c');
        capturedOnDidCreate(droppedFileUri);

        // Wait a tick for async fetch to fire
        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(networkLog.length, 1, "Failed to log creation violation");
        assert.strictEqual(networkLog[0].violation_type, "File Created");
        assert.strictEqual(networkLog[0].file_name, "chatgpt_answers.c");
    });

    test('File Watcher: Should detect external file modifications (e.g., Notepad edits)', async () => {
        const workspaceUri = vscode.Uri.file('/mock_workspace');
        registerFileWatcher('20261234', 'Gildong', 'MAC123', workspaceUri);

        assert.ok(capturedOnDidChange, "onDidChange listener was not registered");

        // Simulate OS event: Student opens "lab1.c" in Notepad and hits Ctrl+S
        const editedFileUri = vscode.Uri.file('/mock_workspace/lab1.c');
        capturedOnDidChange(editedFileUri);

        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(networkLog.length, 1, "Failed to log modification violation");
        assert.strictEqual(networkLog[0].violation_type, "File Modified (Save/External)");
        assert.strictEqual(networkLog[0].file_name, "lab1.c");
    });

    test('File Watcher: Should detect external file deletions', async () => {
        const workspaceUri = vscode.Uri.file('/mock_workspace');
        registerFileWatcher('20261234', 'Gildong', 'MAC123', workspaceUri);

        assert.ok(capturedOnDidDelete, "onDidDelete listener was not registered");

        // Simulate OS event: Student deletes "lab1.c" using the File Explorer
        const deletedFileUri = vscode.Uri.file('/mock_workspace/lab1.c');
        capturedOnDidDelete(deletedFileUri);

        await new Promise(resolve => setTimeout(resolve, 10));

        assert.strictEqual(networkLog.length, 1, "Failed to log deletion violation");
        assert.strictEqual(networkLog[0].violation_type, "File Deleted");
        assert.strictEqual(networkLog[0].file_name, "lab1.c");
    });

    test('File Watcher: Should safely ignore noisy background files (.vscode, .git, .DS_Store)', async () => {
        const workspaceUri = vscode.Uri.file('/mock_workspace');
        registerFileWatcher('20261234', 'Gildong', 'MAC123', workspaceUri);

        // Simulate OS events for background system files
        capturedOnDidCreate(vscode.Uri.file('/mock_workspace/.vscode/settings.json'));
        capturedOnDidChange(vscode.Uri.file('/mock_workspace/.git/config'));
        capturedOnDidDelete(vscode.Uri.file('/mock_workspace/.DS_Store'));

        await new Promise(resolve => setTimeout(resolve, 10));

        // The network log should be completely empty!
        assert.strictEqual(networkLog.length, 0, "Falsely flagged a background system file as a security violation!");
    });
});
