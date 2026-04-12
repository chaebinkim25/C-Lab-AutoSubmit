// src/tracking/fileTracker.ts
import * as vscode from 'vscode';
import { logSecurityViolation } from '../utils/api';

/**
 * Initializes a File System Watcher to audit all file creations, deletions, and external changes.
 * Returns a Disposable so it can be killed when the session ends.
 */
export function registerFileWatcher(
    studentNumber: string, 
    studentName: string, 
    machineId: string,
    workspaceUri: vscode.Uri
): vscode.Disposable {
    
    console.log('[C-Lab] Initializing File System Watcher...');

    // 1. Create a watcher scoped strictly to the active lab folder
    // The '**/*' pattern means "watch all files and all subfolders"
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceUri, '**/*')
    );

    // Helper function to ignore noisy background files (like VS Code configs or hidden OS files)
    const shouldIgnore = (filename: string) => {
        return filename.startsWith('.vscode') || filename.startsWith('.git') || filename.endsWith('.DS_Store');
    };

    // 2. Track File Additions (Internal & External)
    watcher.onDidCreate(uri => {
        const filename = vscode.workspace.asRelativePath(uri);
        if (shouldIgnore(filename)) {return;}

        logSecurityViolation(
            studentNumber, studentName, machineId,
            "File Created",
            `A new file was added to the workspace.`,
            filename
        );
    });

    // 3. Track File Deletions (Internal & External)
    watcher.onDidDelete(uri => {
        const filename = vscode.workspace.asRelativePath(uri);
        if (shouldIgnore(filename)) {return;}

        logSecurityViolation(
            studentNumber, studentName, machineId,
            "File Deleted",
            `A file was removed from the workspace.`,
            filename
        );
    });

    // 4. Track File Saves & External Edits
    // Note: diffTracker handles keystrokes. This specifically fires when a file is SAVED, 
    // or when it is modified by an external program (like Notepad).
    watcher.onDidChange(uri => {
        const filename = vscode.workspace.asRelativePath(uri);
        if (shouldIgnore(filename)) {return;}

        logSecurityViolation(
            studentNumber, studentName, machineId,
            "File Modified (Save/External)",
            `The file was saved or modified externally.`,
            filename
        );
    });

    // Return the watcher itself as the Disposable so the session manager can kill it
    return watcher;
}
