// src/commands/submitTask.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from '../utils/time';
import { globalTelemetryWorker, globalSecurityTracker, globalDiffTracker, globalDebugTracker } from './startLab';
import { setSessionCloseReason } from '../extension';
import { logEvent, clearExtensionOutput } from '../utils/logging';
import { promptFinalSubmitConfirmation, showSuccess, showError, updateStatusBar } from '../ui';
import { MESSAGES } from '../utils/messages';
import { getSessionId } from '../utils/token';
import { generateLocalReview } from '../utils/reviewGenerator';
import { globalReviewProvider } from '../providers/reviewProvider';

// Rate Limiting State

let lastSubmitTime = 0;
const SUBMIT_COOLDOWN_MS = 1000; // 1-second cooldown
let isSubmitting = false;

// Main Commands

export async function midSubmitCommand(context: vscode.ExtensionContext) {

    const sessionId = validateSubmission(context, 'Mid');

    if (!sessionId) {
        logEvent('SUBMIT_ERROR', "no session id");
        return;
    }

    setSubmissionState(true);

    try {
        // 1. Force save all files so we don't submit stale disk data
        await vscode.workspace.saveAll();

        // 2. Do not close editor tabs
        logEvent('SUBMIT_PACK_MID');
        const currentTaskId = context.workspaceState.get<string>('currentTaskId') || "unknown";

        // 3. Cache Locally IMMEDIATELY (Before any network delays)        
        await cacheCurrentTaskLocally(currentTaskId);

        // 4. Build the Payload using the safe, locked memory
        const payloadObj = await buildSubmissionPayload('mid', currentTaskId);
        
        // 5. Queue payload into Telemetry Worker silently
        if (globalTelemetryWorker) {
            globalTelemetryWorker.queueSubmission(payloadObj);
        }
        
        const tasks: any[] = context.workspaceState.get('labTasks') || [];
        const currentIndex = tasks.findIndex(t => t.task_id === currentTaskId);
        const isLastTask = currentIndex >= tasks.length - 1;

        if (isLastTask) {
            showSuccess(MESSAGES.SUCCESS.TASK_SUBMITTED_LAST);    
        } else {
            showSuccess(MESSAGES.SUCCESS.TASK_SUBMITTED_AND_MOVE);
            await vscode.commands.executeCommand('c-lab.nextTask');
        }
        
    } catch (error: any) {
        logEvent('SUBMIT_ERROR', error.message);
        showError(MESSAGES.ERRORS.SUBMIT_FAILED(error.message));
    } finally {
        setSubmissionState(false);
    }    
}

export async function finalSubmitCommand(context: vscode.ExtensionContext) {

    const sessionId = validateSubmission(context, 'Final');

    if (!sessionId) {
        logEvent('SUBMIT_ERROR', "no sessionId");
        return;
    }

    // 1. Confirmation Prompt
    const confirmed = await promptFinalSubmitConfirmation();
    if (!confirmed) {return;}

    setSubmissionState(true);
   
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: MESSAGES.PROGRESS.SUBMITTING_FINAL,
        cancellable: false
    }, async (progress) => {
        try {
            // Force save to catch last minute typing before the editors close
            await vscode.workspace.saveAll();

            const currentTaskId = context.workspaceState.get<string>('currentTaskId') || "unknown";

            await cacheCurrentTaskLocally(currentTaskId);

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            logEvent('SUBMIT_PACK_FINAL');

            // 1. Generate Local Review Markdown
            const reviewMarkdown = await generateLocalReview(context, currentTaskId);
            const payload = await buildSubmissionPayload('final', currentTaskId, reviewMarkdown);

            progress.report({ increment: 50, message: MESSAGES.PROGRESS.SAVING_TO_SERVER });

            if (globalTelemetryWorker) {
                globalTelemetryWorker.queueSubmission(payload);
                
                // Fallback loop if the server is overloaded
                let success = await globalTelemetryWorker.emergencyFlush();
                let retries = 0;
                while (!success && retries < 6) {
                    logEvent('SUBMIT_RETRY', 'Final Submission', '5000');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    success = await globalTelemetryWorker.emergencyFlush();
                    retries++;
                }

                if (!success) {
                    throw new Error(MESSAGES.ERRORS.SERVER_RESPONSE_ERROR);
                }
            }

            await executeFinalTeardown(context, reviewMarkdown);
            
        } catch (error: any) {
            logEvent('SUBMIT_FINAL_ERROR', error.message);
            showError(MESSAGES.ERRORS.FINAL_SUBMIT_FAILED(error.message)); // Cleaned
        } finally {
            setSubmissionState(false);
        }
    });
}

// Helper Functions

function validateSubmission(context: vscode.ExtensionContext, type: string): string | null {
    
    const now = Date.now();
    if (isSubmitting || now - lastSubmitTime < SUBMIT_COOLDOWN_MS) {
        logEvent('SUBMIT_REJECT_RATE_LIMIT', type);
        vscode.window.showWarningMessage(MESSAGES.ERRORS.SUBMIT_TOO_FAST);
        return null;
    }
    
    const sessionId = getSessionId(context);
    if (!sessionId) {
        vscode.window.showErrorMessage(MESSAGES.ERRORS.NO_SESSION_RESTART);
        return null;
    }

    return sessionId;
}

function setSubmissionState(active: boolean) {   
    isSubmitting = active;
    lastSubmitTime = Date.now();
}

async function cacheCurrentTaskLocally(taskId: string) {
    const rootPath = vscode.workspace.workspaceFolders![0].uri;
    const mainUri = vscode.Uri.joinPath(rootPath, 'main.c');
    const cacheUri = vscode.Uri.joinPath(rootPath, '.clab_cache', `${taskId}.c`);

    try {
        const currentContent = await vscode.workspace.fs.readFile(mainUri);
        await vscode.workspace.fs.writeFile(cacheUri, currentContent);
    } catch (error: any) {
        logEvent('SUBMIT_ERROR', error.message);
        showError(MESSAGES.ERRORS.SUBMIT_FAILED(error.message));
    }
}

async function executeFinalTeardown(context: vscode.ExtensionContext, reviewMarkdown: string) {
    const sourceFiles = await vscode.workspace.findFiles('**/*.{c,h}', '**/node_modules/**');
    for (const uri of sourceFiles) {
        await vscode.workspace.fs.delete(uri, { useTrash: false });
    }

    if (globalTelemetryWorker) { globalTelemetryWorker.stop(); }
    if (globalSecurityTracker) { globalSecurityTracker.stop(); }
    if (globalDiffTracker) { globalDiffTracker.stop(); }
    if (globalDebugTracker) { globalDebugTracker.stop(); }

    const uri = vscode.Uri.parse(`clab-review:/submitted_code.md`);
    if (globalReviewProvider) {
        globalReviewProvider.setContent(uri, reviewMarkdown);
    }
    await vscode.commands.executeCommand('markdown.showPreview', uri);

    showSuccess(MESSAGES.SUCCESS.FINAL_SUBMITTED, true);
    logEvent('SUBMIT_FINAL_CLOSED');
    clearExtensionOutput();

    updateStatusBar('done');
    setSessionCloseReason('expected');
}

async function buildSubmissionPayload(type: 'mid' | 'final', taskId: string, reviewMarkdown?: string): Promise<any> {    
    const sourceFiles: Record<string, string> = {};
    const vscodeConfigs: Record<string, string> = {};

    if (type === 'final' && reviewMarkdown) {
        sourceFiles['review.md'] = reviewMarkdown;
    } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            const rootPath = workspaceFolders[0].uri;
            try {
                const mainUri = vscode.Uri.joinPath(rootPath, 'main.c');
                sourceFiles['main.c'] = Buffer.from(await vscode.workspace.fs.readFile(mainUri)).toString('utf8');
            } catch(e){}

            const configFiles = await vscode.workspace.findFiles('.vscode/*.json');
            for (const uri of configFiles) {
                const relativePath = vscode.workspace.asRelativePath(uri);
                vscodeConfigs[relativePath] = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            }
        }
    }

    return {
        submission_type: type,
        task_id: taskId,
        timestamp: getKSTISO8601(),
        sourceFiles,
        vscodeConfigs
    };
}
