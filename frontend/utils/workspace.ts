// src/utils/workspace.ts

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { MESSAGES } from './messages';
import { logEvent } from '../extension';

export async function ensureSecureWorkspace(): Promise<boolean> {
    const isWindowsHost = os.platform() === 'win32';
    const isAlreadyInWSL = vscode.env.remoteName === 'wsl';

    // WSL Auto-Provisioning (Windows Users)
    if (isWindowsHost && !isAlreadyInWSL) {

        logEvent('UTIL_WSL_LOCAL');

        try {
            // 1. Silently reach into the default WSL distro and provision the directory
            logEvent('UTIL_WSL_MKDIR');
            execSync('wsl.exe -e bash -c "mkdir -p ~/C-Lab-Workspace"');

            // 2. Prompt the user in Korean
            const userChoice = await vscode.window.showInformationMessage(
                MESSAGES.SYSTEM.WSL_DETECTED,
                MESSAGES.SYSTEM.MOVE_TO_WSL
            );

            if (userChoice === MESSAGES.SYSTEM.MOVE_TO_WSL) {
                logEvent('UTIL_WSL_LAUNCH');
                // 3. The magic trick: Tell WSL to launch a new VS Code window natively anchored to the Linux folder
                execSync('wsl.exe -e bash -c "cd ~/C-Lab-Workspace && code ."');
            }

            // Halt execution in this Windows window so they don't do the lab locally
            return false;

        } catch (error) {
            logEvent('UTIL_WSL_FAIL', String(error));
            vscode.window.showErrorMessage(MESSAGES.SYSTEM.WSL_MISSING);
            return false;
        }
    }

    // Standard Provisioning (macOS, Linux, or users already inside WSL)
    // If they are in WSL, os.homedir() automatically resolves to /home/username!
    const homeDir = os.homedir();
    const targetWorkspaceName = 'C-Lab-Workspace';
    const targetPath = path.join(homeDir, targetWorkspaceName);

    // Create the directory if it does not exist locally
    if (!fs.existsSync(targetPath)) {
        logEvent('UTIL_WS_PROV', targetPath);
        fs.mkdirSync(targetPath, { recursive: true });
    }

    // Check if the editor is currently opened to this exact folder
    const currentFolders = vscode.workspace.workspaceFolders;
    let isCorrectWorkspace = false;

    if (currentFolders && currentFolders.length > 0) {
        const currentPath = path.normalize(currentFolders[0].uri.fsPath);
        if (currentPath === path.normalize(targetPath)) {
            isCorrectWorkspace = true;
        }
    }

    // Eject and Route if they are somewhere else
    if (!isCorrectWorkspace) {
        logEvent('UTIL_WS_EJECT', targetPath);

        const userChoice = await vscode.window.showInformationMessage(
            MESSAGES.SYSTEM.WRONG_WORKSPACE,
            MESSAGES.SYSTEM.MOVE_WORKSPACE
        );

        if (userChoice === MESSAGES.SYSTEM.MOVE_WORKSPACE) {
            const targetUri = vscode.Uri.file(targetPath);
            await vscode.commands.executeCommand('vscode.openFolder', targetUri, false);
        }

        return false;
    }

    logEvent('UTIL_WS_VALID');
    return true;
}

export async function validateWorkspaceTrust(): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
        logEvent('UTIL_WS_TRUST_FAIL');

        const manageTrustAction = MESSAGES.SYSTEM.OPEN_TRUST_SETTINGS;
        const userChoice = await vscode.window.showErrorMessage(
            MESSAGES.SYSTEM.UNTRUSTED_WORKSPACE,
            manageTrustAction
        );

        if (userChoice === manageTrustAction) {
            // Natively opens the VS Code Workspace Trust management tab
            vscode.commands.executeCommand('workbench.trust.manage');
        }

        return false;
    }

    logEvent('UTIL_WS_TRUST_PASS');
    return true;
}
