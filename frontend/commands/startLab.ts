// src/commands/startLab.ts

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getMachineId } from '../utils/machineID';
import { ensureSecureWorkspace, validateWorkspaceTrust } from '../utils/workspace';
import { enforceLabPolicies, startPolicyWatchdog } from '../utils/policies';
import { DiffTracker } from '../trackers/diffTracker';
import { TelemetryWorker } from '../trackers/telemetryWorker';
import { performTaskSwitch } from './taskHelpers';
import { SecurityTracker } from '../trackers/securityTracker';
import { DebugTrackerManager } from '../trackers/debugTracker';
import { promptStudentLogin, promptStudentName, showSuccess, showError, updateStatusBar } from '../ui';
import { cleanupWorkspaceOnStartup } from '../utils/secureWipe';
import { MESSAGES } from '../utils/messages';
import { getKSTISO8601 } from '../utils/time';
import { CONFIG } from '../utils/config';
import { setSessionId } from '../utils/token';
import { getSeededTasks } from '../data/tasks';
import { logEvent, clearLogs, clearExtensionOutput, resetExtensionStartTime } from '../extension';

// Instantiate the tracker globally so we can access its patch queue later
export let globalDiffTracker: DiffTracker | null = null;
export let globalTelemetryWorker: TelemetryWorker | null = null;
export let globalSecurityTracker: SecurityTracker | null = null;
export let globalDebugTracker: DebugTrackerManager | null = null;

let isStarting = false;
export let isLabRunning = false;

export function setLabRunning(state: boolean) {
    isLabRunning = state;
}


export async function startLabCommand(context: vscode.ExtensionContext) {

    if (isStarting || isLabRunning) {
        vscode.window.showWarningMessage(MESSAGES.ERRORS.ALREADY_STARTED);
        return;
    }
    isStarting = true;
    
    clearLogs();
    clearExtensionOutput();
    resetExtensionStartTime();

    logEvent('START_EXEC');

    // 1. Validate and enforce the workspace routing
    const isSecureWorkspace = await ensureSecureWorkspace();
    if (!isSecureWorkspace) {
        // Halt execution; VS Code is about to reload the window into the correct folder.
        isStarting = false;
        return;
    }

    // 2. Validate Trusted Workspace State
    const isTrusted = await validateWorkspaceTrust();
    if (!isTrusted) {
        isStarting = false;
        return;
    }

    // 3. Enforce strictly controlled workspace settings (Auto-Save, Formatting)
    await enforceLabPolicies();

    // Start the silent watchdog
    startPolicyWatchdog(context);

    // 4. Retrieve or generate the persistent Machine ID
    const machineId = getMachineId(context);

    // 5. Prompt for Student Number with strict Regex validation
    const rawStudentNumber = await promptStudentLogin();

    // If the user presses Escape or cancels the prompt
    if (!rawStudentNumber) {
        logEvent('START_ABORT_ID');
        isStarting = false;
        return;
    }

    const studentNumber = rawStudentNumber.normalize('NFC');

    // 6. Prompt for Student Name
    const rawName = await promptStudentName();

    if (!rawName) {
        logEvent('START_ABORT_NAME');
        isStarting = false;
        return;
    }

    // 7. Strict NFC Normalization (Core Policy #8)
    // This absolutely guarantees macOS users won't send decomposed Korean characters (NFD) to the backend
    const studentName = rawName.normalize('NFC');

    // Log the full authentication payload locally
    logEvent('START_AUTH', studentNumber, studentName, machineId);

    // Close any lingering ghost tabs from a previous crashed session BEFORE wiping
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');    

    // Purge the workspace of old runs, leftover binaries, and stale .vscode configs
    await cleanupWorkspaceOnStartup();

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: MESSAGES.PROGRESS.COMMUNICATING_SERVER,
        cancellable: false
    }, async (progress) => {
        try {
            // 1. Authenticate with backend
            const sessionId = crypto.randomUUID();
            await authenticateWithServer(studentNumber, studentName, machineId, sessionId);

            // 2. Save credentials to secure storage
            await setSessionId(context, sessionId);
            context.workspaceState.update('studentNumber', studentNumber);
            context.workspaceState.update('machineId', machineId);

            // 3. Initializing new task list
            const tasks = getSeededTasks(studentNumber, studentName);
            await context.workspaceState.update('labTasks', tasks);

            // 4. Start Trackers
            if (!globalDiffTracker) { globalDiffTracker = new DiffTracker(); globalDiffTracker.start(context); }
            if (!globalSecurityTracker) { globalSecurityTracker = new SecurityTracker(); globalSecurityTracker.start(context); }
            if (!globalDebugTracker) { globalDebugTracker = new DebugTrackerManager(); globalDebugTracker.start(context); }
 
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const rootPath = workspaceFolders[0].uri;
                const cacheDir = vscode.Uri.joinPath(rootPath, '.clab_cache');
                try { await vscode.workspace.fs.createDirectory(cacheDir); } catch(e) {}
            }

            // 5. Provision the first task using the helper
            showSuccess(MESSAGES.SUCCESS.STARTED_NEW);
            await context.workspaceState.update('currentTaskId', undefined); // Clear residual state
            await performTaskSwitch(context, tasks[0], tasks);

            // 6. Start the background telemetry worker
            if (!globalTelemetryWorker) {
                globalTelemetryWorker = new TelemetryWorker(context, globalDiffTracker, globalSecurityTracker, globalDebugTracker);
                globalTelemetryWorker.start(context);
            }

            isLabRunning = true;

        } catch (error: any) {
            showError(MESSAGES.ERRORS.START_FAILED(error.message));
        } finally {
            isStarting = false;
        }
    });
}

// Helper: HTTP Request to Start/Resume Session ---
async function authenticateWithServer(
    studentNumber: string,
    studentName: string,
    machineId: string,
    sessionId: string
): Promise<any> {
    const payload = JSON.stringify({
        student_number: studentNumber,
        student_name: studentName, 
    });
    const res = await fetch(`${CONFIG.BASE_URL}/api/session/start`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json' ,
            'x-machine-id': machineId,
            'x-session-id': sessionId
        },
        body: payload
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
    }
    return res.json();
}
