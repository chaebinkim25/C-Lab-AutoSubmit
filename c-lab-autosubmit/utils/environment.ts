// src/utils/environment.ts
import * as vscode from 'vscode';
import * as os from 'os';
import { 
    showInstallMissingExtensionState, 
    promptInstallCppExtension, 
    promptReloadAfterInstall, 
    notifyCppExtensionActivationFailed 
} from './ui';

export function getOSPlatform(): string {
    return os.platform();
}

export async function validateCppTools(context: vscode.ExtensionContext): Promise<boolean> {
    const cppToolsId = 'ms-vscode.cpptools';
    const cppExtension = vscode.extensions.getExtension(cppToolsId);

    if (!cppExtension) {
        console.warn(`[C-Lab] Missing required dependency: ${cppToolsId}`);
        
        // 1. The status bar button now serves as a backup way to open the installer
        const openExtensionCommandId = 'c-lab.openCppExtensionPane';
        const openExtensionCmd = vscode.commands.registerCommand(openExtensionCommandId, () => {
            vscode.commands.executeCommand('extension.open', cppToolsId);
        });

        context.subscriptions.push(openExtensionCmd);
        showInstallMissingExtensionState(openExtensionCommandId);

        // 2. The Bulletproof UI Prompt
        const installAction = "1. Install C/C++";
        const reloadAction = "2. Reload Window";
        
        // We do NOT await this. We let it float on the screen so the user can click 
        // "Install", wait for it to finish, and then click "Reload" right on the same popup!
        promptInstallCppExtension(installAction, reloadAction)
        .then(selection => {
            if (selection === installAction) {
                // Open the marketplace
                vscode.commands.executeCommand('extension.open', cppToolsId);
                
                // Pop the message back up immediately so the "Reload" button is still available!
                promptReloadAfterInstall(reloadAction)
                .then(secondSelection => {
                    if (secondSelection === reloadAction) {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });

            } else if (selection === reloadAction) {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

        // 3. Halt the activation safely
        return false;
    }

    if (!cppExtension.isActive) {
        try {
            await cppExtension.activate();
            console.log(`[C-Lab] Successfully activated ${cppToolsId}`);
        } catch (error) {
            console.error(`[C-Lab] Failed to activate ${cppToolsId}:`, error);
            notifyCppExtensionActivationFailed();
            return false;
        }
    }

    console.log('[C-Lab] Environment dependencies validated.');
    return true;
}
