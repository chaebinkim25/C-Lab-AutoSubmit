// src/utils/dependencies.ts

import * as vscode from 'vscode';
import { MESSAGES } from './messages';
import { logEvent } from '../extension';

export async function checkCppToolsDependency(): Promise<boolean> {
    const cppToolsId = 'ms-vscode.cpptools';
    const cppExtension = vscode.extensions.getExtension(cppToolsId);

    if (cppExtension) {
        logEvent('UTIL_DEP_PASS', cppToolsId);
        return true;
    }

    logEvent('UTIL_DEP_FAIL', cppToolsId);

    // Bulletproof UI prompt in Korean guiding the user to install the extension
    const installAction = MESSAGES.SYSTEM.INSTALL_CPP_TOOLS;
    const userChoice = await vscode.window.showErrorMessage(
        MESSAGES.SYSTEM.MISSING_CPP_TOOLS,
        installAction
    );

    if (userChoice === installAction) {
        // This native command forcefully opens the VS Code Marketplace tab directly to the missing extension!
        vscode.commands.executeCommand('extension.open', cppToolsId);
    }

    return false;
}
