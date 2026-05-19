// src/commands/submitTask.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from '../utils/time';
import { globalTelemetryWorker, globalSecurityTracker, globalDiffTracker, globalDebugTracker } from './startLab';
import { setSessionCloseReason, globalReviewProvider, logEvent, clearExtensionOutput } from '../extension';
import { promptFinalSubmitConfirmation, showSuccess, showError, updateStatusBar } from '../ui';
import { MESSAGES } from '../utils/messages';
import { CONFIG } from '../utils/config';
import { getToken } from '../utils/token';
import { generateLocalReview } from '../utils/reviewGenerator';

// Rate Limiting State

let lastSubmitTime = 0;
const SUBMIT_COOLDOWN_MS = 1000; // 1-second cooldown
let isSubmitting = false;

// Main Commands

export async function midSubmitCommand(context: vscode.ExtensionContext) {

    const token = validateSubmission(context, 'Mid');

    if (!token) {
        logEvent('SUBMIT_ERROR', "no token");
        return;
    }

    setSubmissionState(true);

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: MESSAGES.PROGRESS.SUBMITTING_TASK,
        cancellable: false
    }, async (progress) => {
        try {
            // 1. Force save all files so we don't submit stale disk data
            await vscode.workspace.saveAll();

            // 2. Do not close editor tabs
            logEvent('SUBMIT_PACK_MID');
            const currentTaskId = context.workspaceState.get<string>('currentTaskId') || "unknown";

            // 3. Cache Locally IMMEDIATELY (Before any network delays)       
            await cacheCurrentTaskLocally(currentTaskId);

            // 4. Build the Payload using the safe, locked memory
            const payload = await buildSubmissionPayload('mid', currentTaskId);
            progress.report({ increment: 50, message: MESSAGES.PROGRESS.SENDING_TO_SERVER });

            // 5. Send to Backend (Can take up to 14s if retrying)
            const response = await sendSubmissionPayload(payload, token);
           
            if (response.status === 'completed') {
                showSuccess(MESSAGES.SUCCESS.TASK_SUBMITTED);

                await vscode.commands.executeCommand('c-lab.nextTask');
            }
        } catch (error: any) {
            logEvent('SUBMIT_ERROR', error.message);
            showError(MESSAGES.ERRORS.SUBMIT_FAILED(error.message));
        } finally {
            setSubmissionState(false);
        }
    });
}

export async function finalSubmitCommand(context: vscode.ExtensionContext) {

    const token = validateSubmission(context, 'Final');

    if (!token) {
        logEvent('SUBMIT_ERROR', "no token");
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

            // 2. Send to the FINAL submit endpoint
            const response = await sendSubmissionPayload(payload, token);

            if (response.status === 'success' || response.status === 'completed') {
                await executeFinalTeardown(context, reviewMarkdown);
            } else {
                throw new Error(response.message || MESSAGES.ERRORS.SERVER_RESPONSE_ERROR);
            }

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
    
    const token = getToken(context);
    if (!token) {
        vscode.window.showErrorMessage(MESSAGES.ERRORS.NO_SESSION_RESTART);
        return null;
    }

    return token;
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

    const studentNumber = context.workspaceState.get<string>('studentNumber') || "Unknown";
    const uri = vscode.Uri.parse(`clab-review://feedback/코드_리뷰_${studentNumber}.md`);
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

async function buildSubmissionPayload(type: 'mid' | 'final', taskId: string, reviewMarkdown?: string): Promise<string> {
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

    return JSON.stringify({
        submission_type: type,
        task_id: taskId,
        timestamp: getKSTISO8601(),
        sourceFiles,
        vscodeConfigs
    });
}

async function sendSubmissionPayload(payload: string, token: string): Promise<any> {
    const maxRetries = 6;
    let attempt = 0;
    let delay = 2000; // Start with a 2-second delay

    while (true) {
        try {
            const res = await fetch(`${CONFIG.BASE_URL}/api/session/submit`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: payload
            });
            
            if (!res.ok) {
                const isRetryable = res.status === 429 || res.status >= 500;
                const errBody = await res.text();
                if (isRetryable && attempt < maxRetries) {
                    throw new Error(`Retryable HTTP ${res.status}`);
                }
                throw new Error(`HTTP ${res.status}: ${errBody}`);
            }
            return await res.json();
        } catch (error: any) {
            const isRetryableError = error.message.includes('fetch failed') || error.message.includes('Retryable HTTP') || error.message.includes('network timeout') || error.message.includes('ECONNREFUSED');
            
            if (!isRetryableError || attempt >= maxRetries) {
                throw error;
            }
            
            logEvent('SUBMIT_RETRY', String(attempt + 1), String(delay));
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
            delay *= 2; // Exponentially increase delay: 2s, 4s, 8s
        }
    }
}
