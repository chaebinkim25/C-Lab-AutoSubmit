// src/commands/endSession.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from '../utils/time';
import { MESSAGES } from '../utils/messages';
import { CONFIG } from '../utils/config';
import { getSessionId, clearSessionId } from '../utils/token';
import { getMachineId } from '../utils/machineID';
import { globalTelemetryWorker, globalSecurityTracker, globalDiffTracker, globalDebugTracker } from './startLab';
import { updateStatusBar } from '../ui';
import { secureWipeWorkspace } from '../utils/secureWipe';
import { terminateWSLSession } from '../utils/wslTeardown';
import { setSessionCloseReason, logEvent, clearExtensionOutput, clearLogs } from '../extension';
import { setLabRunning } from './startLab';

export async function endSessionCommand(context: vscode.ExtensionContext) {
    const confirmation = await vscode.window.showWarningMessage(
        MESSAGES.PROMPTS.CONFIRM_END_SESSION,
        { modal: true },
        MESSAGES.PROMPTS.YES_END, MESSAGES.PROMPTS.NO
    );

    if (confirmation !== MESSAGES.PROMPTS.YES_END) { return; }

    const sessionId = getSessionId(context);
    const machineId = getMachineId(context);
    if (!sessionId || !machineId) { return; }    

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: MESSAGES.PROGRESS.ENDING_SESSION,
        cancellable: false
    }, async () => {
        try {
            logEvent('EXT_TEARDOWN_MANUAL');
            await vscode.workspace.saveAll();

            // 1. Halt Trackers
            if (globalSecurityTracker) { globalSecurityTracker.stop(); }
            if (globalDiffTracker) { globalDiffTracker.stop(); }
            if (globalDebugTracker) { globalDebugTracker.stop(); }

            if (globalTelemetryWorker) { 
                const currentTaskId = context.workspaceState.get<string>('currentTaskId');
                if (currentTaskId) {
                    try {
                        const rootPath = vscode.workspace.workspaceFolders![0].uri;
                        const mainUri = vscode.Uri.joinPath(rootPath, 'main.c');
                        const content = Buffer.from(await vscode.workspace.fs.readFile(mainUri)).toString('utf8');
                        globalTelemetryWorker.queueSubmission({
                            submission_type: 'mid',
                            task_id: currentTaskId,
                            timestamp: getKSTISO8601(),
                            sourceFiles: { 'main.c': content },
                            vscodeConfigs: {}
                        });
                    } catch(e) {}
                }
                globalTelemetryWorker.stop(); 
                await globalTelemetryWorker.emergencyFlush();
            }


            // 2. Send End Payload (Suspended/Aborted Path)
            setSessionCloseReason('unexpected'); // Treat as incomplete

            await fetch(`${CONFIG.BASE_URL}/api/session/end`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-machine-id': machineId,
                    'x-session-id': sessionId                     
                },
                body: JSON.stringify({
                    status: 'suspended',
                    timestamp: getKSTISO8601()
                })
            }).catch(e => logEvent('EXT_TEARDOWN_ERR_NOTIFY', e.message));

            // 3. Zero-Trust Wipe & Teardown
            await secureWipeWorkspace();
            await clearSessionId(context);
            await context.workspaceState.update('studentNumber', undefined);
            await context.workspaceState.update('machineId', undefined);
            await context.workspaceState.update('currentTaskId', undefined);

            // 4. Close all editors and reset UI
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            
            // Deactivate extension UI after session ends to prevent immediate restart
            updateStatusBar('deactivated');
            
            clearExtensionOutput();
            clearLogs();            
            setLabRunning(false);

            // 5. Terminate WSL if applicable
            // terminateWSLSession();

        } catch (error: any) {
            logEvent('EXT_TEARDOWN_ERR_MANUAL', error.message);
        }
    });
}
