// src/utils/update.ts
import * as vscode from 'vscode';
import { showUpdatingState, notifyVersionCheckFailed, notifyUpdateRequired } from './ui';
/**
 * Checks if the extension is up to date based on the version provided by the server.
 * If outdated, it blocks the startup flow and shows the updating UI.
 */
export async function enforceVersionCheck(context: vscode.ExtensionContext, requiredVersion: string | null): Promise<boolean> {
    const currentVersion = context.extension.packageJSON.version as string;
    
    // If we received null, the network failed. Enforce strict "Fail-Closed" policy.
    if (!requiredVersion) {
        console.error('[C-Lab] Cannot verify version due to network failure. Blocking startup.');
        notifyVersionCheckFailed(); // Let the user know the network dropped
        return false;
    }

    if (currentVersion !== requiredVersion) {
        console.warn(`[C-Lab] Version mismatch. Current: ${currentVersion}, Required: ${requiredVersion}`);
               
        // 1. Register a temporary command to open the extension pane
        const openExtensionCommandId = 'c-lab.openExtensionPane';
        const openExtensionCmd = vscode.commands.registerCommand(openExtensionCommandId, () => {
            // 'extension.open' is a built-in VS Code command
            // Replace 'your-publisher' with your actual VS Code publisher name
            vscode.commands.executeCommand('extension.open', 'c-lab-autosubmit.c-lab-autosubmit');
        });
        context.subscriptions.push(openExtensionCmd);

        // 2. Delegate to the centralized UI manager
        showUpdatingState(openExtensionCommandId);
        notifyUpdateRequired(); // Alert the user that they need to update

        // Return false to halt the rest of the Activation flow
        return false;
    }

    console.log('[C-Lab] Version is current.');
    return true;
}
