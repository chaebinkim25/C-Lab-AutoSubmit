// src/extension.ts

import * as vscode from 'vscode';
import { startLabCommand, globalTelemetryWorker } from './commands/startLab';
import { midSubmitCommand, finalSubmitCommand } from './commands/submitTask';
import { navigateTaskCommand } from './commands/navigateTask';
import { nextTaskCommand } from './commands/nextTask';
import { endSessionCommand } from './commands/endSession';
import { ReviewContentProvider } from './providers/reviewProvider';
import { checkCppToolsDependency } from './utils/dependencies';
import { secureWipeWorkspace } from './utils/secureWipe';
import { terminateWSLSession } from './utils/wslTeardown';
import { getKSTISO8601 } from './utils/time';
import { initializeStatusBar } from './ui';
import { MESSAGES } from './utils/messages';
import { getSessionId, clearSessionId } from './utils/token';
import { getMachineId } from './utils/machineID';
import { CONFIG } from './utils/config';

// Export globally so commands can access the setContent method
export let globalReviewProvider: ReviewContentProvider | null = null;

export let labStatusBarItem: vscode.StatusBarItem;

let globalExtensionContext: vscode.ExtensionContext;

export let sessionCloseReason: 'expected' | 'unexpected' = 'unexpected';

export interface LogEntry {
    timestamp: string;
    elapsed_seconds: number;
    code: keyof typeof MESSAGES.LOGS;
    args: string[];
}

export const extensionLogBuffer: LogEntry[] = []; // Persistent history for the Final Review
export const telemetryLogQueue: LogEntry[] = [];  // Volatile queue for the Background Worker

export function setSessionCloseReason(reason: 'expected' | 'unexpected') {
    sessionCloseReason = reason;
}

let extensionStartTime = Date.now();

export function resetExtensionStartTime() {
    extensionStartTime = Date.now();
}

// Create a dedicated Output Channel for Track G
const extLogger = vscode.window.createOutputChannel("C-Lab AutoSubmit");

export function logEvent(code: keyof typeof MESSAGES.LOGS, ...args: string[]) {
    const timestamp = getKSTISO8601();
    const elapsed_seconds = Math.floor((Date.now() - extensionStartTime) / 1000);    
    const msgTemplate = MESSAGES.LOGS[code] as any;
    const displayStr = typeof msgTemplate === 'function' ? msgTemplate(...args) : msgTemplate;

    // 1. Write readable localized string to the actual VS Code Output UI
    extLogger.appendLine(`[${timestamp}] ${displayStr}`);

    // 2. Store the event in both buffers
    const entry = { timestamp, elapsed_seconds, code, args };
    telemetryLogQueue.push(entry);
    extensionLogBuffer.push(entry);

    if (extensionLogBuffer.length > 2000) {    
        extensionLogBuffer.shift();
    }
}

export function clearLogs() {
    extensionLogBuffer.length = 0;
    telemetryLogQueue.length = 0;
}

export function clearExtensionOutput() {
    extLogger.clear();
}


// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {

    globalExtensionContext = context;

    logEvent('EXT_ACTIVATED');

    // 2. Dependency Validation
    const hasCppTools = await checkCppToolsDependency();
    if (!hasCppTools) {
        logEvent('EXT_NO_CPP');
        // Return immediately. Do not render the Start Lab button.
        return;
    }

    extLogger.show(true);

    // Global Error Boundary
    process.on('uncaughtException', (err: Error) => {
        const errStr = err.stack || err.message;
        logEvent('EXT_FATAL_UNCAUGHT', errStr);
        vscode.window.showErrorMessage(MESSAGES.ERRORS.SYSTEM_FATAL_ERROR);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        const errStr = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
        logEvent('EXT_FATAL_UNHANDLED', errStr);
    });

    globalReviewProvider = new ReviewContentProvider();
    const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
        'clab-review',
        globalReviewProvider
    );
    context.subscriptions.push(providerRegistration);

    // Create and Initialize the Status Bar Item
    // Alignment.Right, Priority 100 (keeps it far to the right, highly visible)
    labStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(labStatusBarItem);

    // Set initial state
    initializeStatusBar(context);

    // Register the startLab command
    let startDisposable = vscode.commands.registerCommand('c-lab.startLab', () => {
        startLabCommand(context);
    });

    // Register the midSubmit Command
    let submitDisposable = vscode.commands.registerCommand('c-lab.midSubmit', () => {
        midSubmitCommand(context);
    });

    // Register the finalSubmit Command
    let finalSubmitDisposable = vscode.commands.registerCommand('c-lab.finalSubmit', () => {
        finalSubmitCommand(context);
    });

    // Register the navigateTask Command
    let navigateDisposable = vscode.commands.registerCommand('c-lab.navigateTask', () => {
        navigateTaskCommand(context);
    });

    // Register the nextTask Command
    let nextDisposable = vscode.commands.registerCommand('c-lab.nextTask', () => {
        nextTaskCommand(context);
    });

    // Register the endSession Command
    let endSessionDisposable = vscode.commands.registerCommand('c-lab.endSession', () => {
        endSessionCommand(context);
    });

    context.subscriptions.push(startDisposable, submitDisposable, finalSubmitDisposable, navigateDisposable, nextDisposable, endSessionDisposable);    
}

// Zero-Trust Teardown Hook
export async function deactivate(): Promise<void> {
    logEvent('EXT_TEARDOWN_INIT');

    // Use session presence as source of truth for an active session
    const hasActiveSession = globalExtensionContext && getSessionId(globalExtensionContext) !== undefined;

    // 1. Close all editors immediately to prevent VS Code from caching ghost tabs
    // This stops the "no code review md file" error loop on the next startup.
    try {
        await vscode.workspace.saveAll();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    } catch (e) {
        logEvent('EXT_TEARDOWN_ERROR_CLOSING');
    }

    if (hasActiveSession) {
        if (sessionCloseReason === 'unexpected') {
            logEvent('EXT_TEARDOWN_UNEXPECTED');

            
            // Queue mid submission before flushing
            const currentTaskId = globalExtensionContext.workspaceState.get<string>('currentTaskId');
            if (currentTaskId && globalTelemetryWorker) {
                try {
                    const rootPath = vscode.workspace.workspaceFolders?.[0].uri;
                    if (rootPath) {
                        const mainUri = vscode.Uri.joinPath(rootPath, 'main.c');
                        const contentBytes = await vscode.workspace.fs.readFile(mainUri);
                        const content = Buffer.from(contentBytes).toString('utf8');
                        globalTelemetryWorker.queueSubmission({
                            submission_type: 'mid',
                            task_id: currentTaskId,
                            timestamp: getKSTISO8601(),
                            sourceFiles: { 'main.c': content },
                            vscodeConfigs: {}
                        });
                    }
                } catch(e) {}
            }

            // Explicitly call /api/session/end since endSessionCommand wasn't triggered
            try {
                const machineId = getMachineId(globalExtensionContext);
                const sessionId = getSessionId(globalExtensionContext);
                if (machineId && sessionId) {
                    await fetch(`${CONFIG.BASE_URL}/api/session/end`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-machine-id': machineId,
                            'x-session-id': sessionId
                        },
                        body: JSON.stringify({ status: 'suspended', timestamp: getKSTISO8601() })
                    });
                }
            } catch(e) {}

        } else {
            logEvent('EXT_TEARDOWN_EXPECTED');
        }

        if (globalTelemetryWorker) {
            globalTelemetryWorker.stop();
            await globalTelemetryWorker.emergencyFlush();
        }

        // Execute Secure File Destruction
        // This runs regardless of how the session ended
        await secureWipeWorkspace();

        // Purge sensitive session data (Zero-Trust)
        if (globalExtensionContext) {
            await clearSessionId(globalExtensionContext);
            await globalExtensionContext.workspaceState.update('studentNumber', undefined);
            await globalExtensionContext.workspaceState.update('machineId', undefined);
        }
    }

    if (globalReviewProvider) {
        globalReviewProvider.clearCache();
    }

    logEvent('EXT_TEARDOWN_DONE');

    clearExtensionOutput();
    clearLogs();
}
