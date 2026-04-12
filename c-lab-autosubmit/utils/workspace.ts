// src/utils/workspace.ts
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { getOSPlatform } from './environment';

/**
 * Ensures a workspace folder is open and trusted.
 * @returns The URI of the active workspace folder, or undefined if validation fails.
 */
export async function verifyWorkspace(): Promise<vscode.Uri | undefined> {
    // 1. Check if at least one folder is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
            "C-Lab: No folder is open. Please create and open a dedicated folder (e.g., 'Lab_01') before starting the session."
        );
        return undefined;
    }

    // 2. Check if the workspace is trusted
    if (!vscode.workspace.isTrusted) {
        vscode.window.showErrorMessage(
            "C-Lab: Workspace is in Restricted Mode. You must 'Trust' this folder in VS Code to run the AutoSubmit system."
        );
        // VS Code natively prompts for trust when a workspace opens, 
        // but if they denied it, they need to manually click the shield icon in the status bar.
        return undefined;
    }

    // Return the primary open folder to be used as the designated lab directory
    return workspaceFolders[0].uri;
}

/**
 * Overrides the workspace configuration for the duration of the lab.
 * Enforces auto-save, 8-space indentation, and strictly disables AI/code completion,
 * while allowing basic syntax formatting (auto-closing braces).
 */
export async function enforcePolicies(): Promise<void> {
    const fileConfig = vscode.workspace.getConfiguration('files');
    const editorConfig = vscode.workspace.getConfiguration('editor');

    try {
        // 1. Data Integrity Policies (Auto-Save)
        await fileConfig.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Workspace);
        await fileConfig.update('autoSaveDelay', 1000, vscode.ConfigurationTarget.Workspace);
        
        // 2. Anti-Cheat Policies (Disable AI, Copilot, and Snippets)
        await editorConfig.update('inlineSuggest.enabled', false, vscode.ConfigurationTarget.Workspace); // Kills Copilot
        await editorConfig.update('quickSuggestions', { "other": false, "comments": false, "strings": false }, vscode.ConfigurationTarget.Workspace);
        await editorConfig.update('suggestOnTriggerCharacters', false, vscode.ConfigurationTarget.Workspace);
        await editorConfig.update('wordBasedSuggestions', "off", vscode.ConfigurationTarget.Workspace);

        // 3. Educational Formatting Policies
        await editorConfig.update('tabSize', 8, vscode.ConfigurationTarget.Workspace);
        await editorConfig.update('insertSpaces', true, vscode.ConfigurationTarget.Workspace);
        await editorConfig.update('autoClosingBrackets', 'always', vscode.ConfigurationTarget.Workspace);
        await editorConfig.update('autoIndent', 'full', vscode.ConfigurationTarget.Workspace);
        
        console.log('[C-Lab] Workspace security and formatting policies enforced.');
    } catch (error) {
        console.error('[C-Lab] Failed to override workspace settings:', error);
        vscode.window.showWarningMessage(
            "C-Lab: Could not enforce strict lab policies automatically. Please ensure AI tools are disabled."
        );
    }
}

/**
 * Writes the skeleton code to the workspace and opens it in the editor.
 * * NOTE: If the file already exists, it will be overwritten. 
 * If the file is already open in an editor tab, that tab will be updated 
 * and brought into focus (made the active tab).
 * * @param targetUri - The base folder URI where the file should be created.
 * @param filename - The name of the file (e.g., 'exercise1.c').
 * @param content - The raw string of C code to write into the file.
 */
export async function writeAndOpenSkeleton(targetUri: vscode.Uri, filename: string, content: string): Promise<void> {
    const fileUri = vscode.Uri.joinPath(targetUri, filename);
    
    // Write the file to disk using VS Code's FileSystem API
    const contentBytes = new TextEncoder().encode(content);
    await vscode.workspace.fs.writeFile(fileUri, contentBytes);

    // Open the file in the editor
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    
    console.log(`[C-Lab] Wrote and opened ${filename}`);
}

/**
 * Scans the current VS Code workspace to create a complete snapshot of all 
 * source code and configuration files.
 * * This is useful for "Full Submissions" or "Emergency Backups," as it 
 * captures the state of the entire project rather than just a single file.
 * * @returns A promise resolving to an object containing:
 * - `sourceFiles`: A mapping of relative paths to the full text of C/C++ files.
 * - `vscodeConfigs`: A mapping of paths to the content of .vscode JSON settings.
 */
export async function captureWorkspaceSnapshot(): Promise<{ sourceFiles: Record<string, string>, vscodeConfigs: Record<string, string> }> {
    const sourceFiles: Record<string, string> = {};
    const vscodeConfigs: Record<string, string> = {};
    const textDecoder = new TextDecoder('utf-8');

    // 1. Capture Source Files (*.c, *.cpp, *.h)
    const cFiles = await vscode.workspace.findFiles('**/*.{c,cpp,h}');
    for (const file of cFiles) {
        const relativePath = vscode.workspace.asRelativePath(file);
        const contentBytes = await vscode.workspace.fs.readFile(file);
        sourceFiles[relativePath] = textDecoder.decode(contentBytes);
    }

    // 2. Capture Workspace Configurations (.vscode/*.json)
    const configFiles = await vscode.workspace.findFiles('.vscode/*.json');
    for (const file of configFiles) {
        const relativePath = vscode.workspace.asRelativePath(file);
        const contentBytes = await vscode.workspace.fs.readFile(file);
        vscodeConfigs[relativePath] = textDecoder.decode(contentBytes);
    }

    return { sourceFiles, vscodeConfigs };
}

/**
 * Performs a secure deletion of a file by zeroing out its content before 
 * removing it from the file system.
 * * This approach helps prevent accidental data recovery by overwriting 
 * the file's disk space with empty bytes and bypassing the operating 
 * system's recycle bin/trash can.
 * * @param fileUri - The unique VS Code URI of the file to be destroyed.
 * @returns A promise that resolves when the file has been fully purged.
 */
export async function wipeAndDeleteFile(fileUri: vscode.Uri): Promise<void> {
    try {
        // 1. Overwrite with empty bytes to clear the disk cache
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
        
        // 2. Permanently delete the file (bypasses the OS trash can)
        await vscode.workspace.fs.delete(fileUri, { useTrash: false });
        
        console.log(`[C-Lab] Securely wiped and deleted: ${fileUri.fsPath}`);
    } catch (error) {
        console.error(`[C-Lab] Failed to wipe file: ${fileUri.fsPath}`, error);
    }
}

/**
 * Determines the default lab directory and creates it if it doesn't exist.
 * On Windows, it automatically provisions a folder inside the default WSL distribution.
 * On Mac/Linux, it uses the local home directory.
 * @returns The constructed vscode.Uri of the target workspace.
 */
export async function prepareDefaultWorkspace(): Promise<vscode.Uri> {
    const osPlatform = getOSPlatform();
    let targetUri: vscode.Uri;

    if (osPlatform === 'win32') {
        // --- WINDOWS (WSL ROUTING) ---
        const wslExt = vscode.extensions.getExtension('ms-vscode-remote.remote-wsl');
        if (!wslExt) {
            throw new Error("The official WSL extension is required on Windows. Please install it.");
        }

        // Query the OS for the default WSL Distro name and Linux home path
        const distroName = execSync('wsl.exe -e sh -c "echo $WSL_DISTRO_NAME"', { encoding: 'utf8' }).trim();
        const linuxHome = execSync('wsl.exe -e sh -c "cd ~ && pwd"', { encoding: 'utf8' }).trim();
        
        if (!distroName || !linuxHome) {throw new Error("Could not detect WSL.");}

        const linuxWorkspacePath = `${linuxHome}/C-Lab-Workspace`;

        // Create the directory natively inside Linux
        execSync(`wsl.exe -e sh -c "mkdir -p ${linuxWorkspacePath}"`);

        // Construct the VS Code Remote URI
        const remoteAuthority = `wsl+${distroName}`;
        targetUri = vscode.Uri.parse(`vscode-remote://${remoteAuthority}${linuxWorkspacePath}`);
    } else {
        // --- NATIVE MAC OR LINUX ---
        const defaultFolderPath = path.join(os.homedir(), 'C-Lab-Workspace');
        targetUri = vscode.Uri.file(defaultFolderPath);

        try {
            await vscode.workspace.fs.createDirectory(targetUri);
        } catch (e) {
            console.error("[C-Lab] Could not create default lab directory", e);
        }
    }

    return targetUri;
}

/**
 * Cleans up the active workspace by clearing temporary review files, closing all editors,
 * scheduling WSL termination (if applicable), and ejecting the folder.
 */
export async function cleanupWorkspace(): Promise<void> {
    // 1. Clear the Untitled Markdown File (Prevents the "Do you want to save?" popup)
    for (const document of vscode.workspace.textDocuments) {
        if (document.isUntitled && document.fileName.includes('Lab_Review')) {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            edit.delete(document.uri, fullRange);
            await vscode.workspace.applyEdit(edit);
        }
    }

    // 2. Close all open editor tabs (including the Markdown Preview)
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // 3. Eject Workspace & Terminate WSL
    // If we are running inside WSL, process.env.WSL_DISTRO_NAME will be populated.
    const wslDistro = process.env.WSL_DISTRO_NAME;
    
    if (wslDistro) {
        console.log(`[C-Lab] Scheduling WSL termination for: ${wslDistro}`);
        // Set a 2-second "time bomb" to kill the Linux VM gracefully
        exec(`nohup sh -c 'sleep 2 && wsl.exe -t "${wslDistro}"' > /dev/null 2>&1 &`);
    }

    // 4. Close the Workspace Folder
    // This fully ejects the user from the lab directory and resets the VS Code window.
    await vscode.commands.executeCommand('workbench.action.closeFolder');
}
