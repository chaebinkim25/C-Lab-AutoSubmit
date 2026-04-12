// src/tracking/diffTracker.ts
import * as vscode from 'vscode';
import { sendDiff, logSecurityViolation } from '../utils/api'; 

// The aggregation buffer. 
// Maps the filename to its latest source code content.
export const diffBuffer = new Map<string, string>();
const lastProcessedState = new Map<string, string>(); // Tracks what was already processed
const recentlyDeletedBuffer = new Map<string, string[]>(); // Tracks cut/deleted text

// The queue where 1-second aggregated changes will sit until the background worker sends them
export interface DiffPayload {
    studentNumber: string;
    studentName: string;
    machineId: string;
    filename: string;
    timestamp: string;
    content: string;
    is_baseline: boolean;
}
export const diffPayloadQueue: DiffPayload[] = [];

// Timing
let aggregationInterval: NodeJS.Timeout | undefined;
let workerTimeout: NodeJS.Timeout | undefined; // for the background worker

/**
 * Sweeps the queue and sends payloads to the server.
 * Reschedules itself at a random interval between 10s and 20s.
 */
export async function processQueueWorker() {
    if (diffPayloadQueue.length > 0) {
        // Extract all current items from the queue (empties the main array)
        const payloadsToSend = diffPayloadQueue.splice(0, diffPayloadQueue.length);
        const failedPayloads: DiffPayload[] = [];

        for (const payload of payloadsToSend) {
            const success = await sendDiff(payload);
            if (!success) {
                // If it fails, save it to be pushed back to the queue
                failedPayloads.push(payload);
            }
        }

        // Put any failed payloads back at the front of the queue to retry next time
        if (failedPayloads.length > 0) {
            diffPayloadQueue.unshift(...failedPayloads);
            console.warn(`[C-Lab] Re-queued ${failedPayloads.length} failed payloads.`);
        }
    }

    // Schedule the next sweep (Random delay between 10000ms and 20000ms)
    const nextDelay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;
    workerTimeout = setTimeout(processQueueWorker, nextDelay);
}

/**
 * Subscribes to document changes and aggregates them into 1-second interval payloads.
 */
export function registerDiffTracker(context: vscode.ExtensionContext, studentNumber: string, studentName: string, machineId: string) {    console.log('[C-Lab] Initializing Diff Tracker...');
    console.log('[C-Lab] Initializing Diff Tracker & Paste Detector...');

    // 1. Keystroke Listener (from previous step)
    const listener = vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;

        // 1. Filter out irrelevant documents (e.g., Output panels, Git diff views, Debug console)
        if (document.uri.scheme !== 'file') {
            return; 
        }

        // 2. Filter for C/C++ source files only
        if (!document.fileName.endsWith('.c') && !document.fileName.endsWith('.h') && !document.fileName.endsWith('.json') && !document.fileName.endsWith('.md')) {
            return;
        }

        // 3. Ignore empty events (sometimes fired during saves or focus changes)
        if (event.contentChanges.length === 0) {
            return;
        }

        // Extract just the relative filename (e.g., "lab1_part1.c")
        const filename = vscode.workspace.asRelativePath(document.uri);
        const previousContent = diffBuffer.get(filename) || "";

        // 4. PASTE DETECTION LOGIC (TRACK B) ---
        // If the document was empty, this is the initial skeleton code load. Allow it.
        if (previousContent.trim().length > 0) {
            for (const change of event.contentChanges) {
                
                // Track Deletions (Handles the "Cut" part of Cut & Paste)
                if (change.rangeLength > 0 && change.text.trim() === "") {
                    const deletedText = previousContent.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
                    if (deletedText.trim().length > 5) {
                        if (!recentlyDeletedBuffer.has(filename)) { recentlyDeletedBuffer.set(filename, []); }
                        recentlyDeletedBuffer.get(filename)!.push(deletedText.trim());
                    }
                }

                // Track Insertions (The "Paste" part)
                const insertedText = change.text;
                if (insertedText.length > 10 && insertedText.trim().length > 0) {
                    
                    // Because clipboard access is async, we evaluate it without blocking the main thread
                    vscode.env.clipboard.readText().then(clipboardText => {
                        const normalizedInsert = insertedText.replace(/\r\n/g, '\n').trim();
                        const normalizedClip = clipboardText.replace(/\r\n/g, '\n').trim();

                        // 1. Is it actually from the clipboard? (Ignores VS Code snippets)
                        if (normalizedClip.includes(normalizedInsert) || normalizedInsert.includes(normalizedClip)) {
                            
                            // --- NEW WORKSPACE-WIDE COPY CHECK ---
                            let isWorkspaceCopy = false;

                            // 1. Check if it was copied from the SAME file (before the paste occurred)
                            const normalizedPrev = previousContent.replace(/\r\n/g, '\n');
                            if (normalizedPrev.includes(normalizedInsert)) {
                                isWorkspaceCopy = true;
                            }

                            // 2. Check if it was copied from OTHER files in the workspace
                            if (!isWorkspaceCopy) {
                                for (const [iterFilename, content] of diffBuffer.entries()) {
                                    // Skip the current file because diffBuffer already contains the newly pasted text!
                                    if (iterFilename === filename) { continue; }

                                    const normalizedContent = content.replace(/\r\n/g, '\n');
                                    if (normalizedContent.includes(normalizedInsert)) {
                                        isWorkspaceCopy = true;
                                        break;
                                    }
                                }
                            }
                            
                            // --- NEW WORKSPACE-WIDE CUT CHECK ---
                            let isWorkspaceCut = false;
                            // Loop through the deletion history of EVERY tracked file
                            for (const deletedHistory of recentlyDeletedBuffer.values()) {
                                if (deletedHistory.some(del => del.includes(normalizedInsert) || normalizedInsert.includes(del))) {
                                    isWorkspaceCut = true;
                                    break;
                                }
                            }

                            // 2. If it wasn't already in ANY document, and wasn't recently cut... BUSTED!
                            if (!isWorkspaceCopy && !isWorkspaceCut) {
                                console.warn(`[C-Lab] 🚨 UNAUTHORIZED PASTE DETECTED in ${filename}!`);

                                // 1. Revert the student's action natively
                                vscode.commands.executeCommand('undo').then(() => {
                                    // 2. Display a stern warning
                                    vscode.window.showWarningMessage(
                                        `🚨 C-Lab Policy Violation: External copy-pasting is strictly prohibited. Your action has been reverted and logged.`
                                    );
                                });

                                // 3. Transmit the exact pasted content to the TA's database
                                logSecurityViolation(studentNumber, studentName, machineId, "Unauthorized Paste", insertedText, filename);
                            }
                        }
                    });
                }
            }
        }

        // 5. Update the aggregation buffer
        // If the user types rapidly, this simply overwrites the buffer with the absolute 
        // latest state of the file, effectively aggregating the 1-second interval changes.
        diffBuffer.set(filename, document.getText());

    });

    // 2. The 1-Second Aggregation Loop
    aggregationInterval = setInterval(() => {
        const now = new Date().toISOString();

        for (const [filename, currentContent] of diffBuffer.entries()) {
            const previousContent = lastProcessedState.get(filename);

            // If the content is different from the last 1-second tick, it means they typed!
            if (currentContent !== previousContent) {
                // Update the state so we don't log it again until they type more
                lastProcessedState.set(filename, currentContent);

                // Add to the send queue
                diffPayloadQueue.push({
                    studentNumber: studentNumber,
                    studentName: studentName,
                    machineId: machineId,
                    filename: filename,
                    timestamp: now,
                    content: currentContent,
                    is_baseline: false,
                });
            }
        }
    }, 1000); // 1000 ms = 1 second

    // 3. Start the Background Worker
    const initialDelay = Math.floor(Math.random() * (20000 - 10000 + 1)) + 10000;
    workerTimeout = setTimeout(processQueueWorker, initialDelay);

    // THE FIX: Return a custom Disposable instead of pushing to context
    return {
        dispose: () => {
            console.log('[C-Lab] Shutting down Diff Tracker...');
            
            // 1. Kill the VS Code event listener
            listener.dispose(); 
            
            // 2. Kill the background loops
            if (aggregationInterval) { clearInterval(aggregationInterval); }
            if (workerTimeout) { clearTimeout(workerTimeout); }
            
            // 3. Wipe the memory buffers so the next session starts completely fresh
            diffBuffer.clear();
            diffPayloadQueue.length = 0;
            
            // Because these aren't exported, we clear them directly here
            // (Assuming you have access to lastProcessedState and recentlyDeletedBuffer in this scope)
            // lastProcessedState.clear();
            // recentlyDeletedBuffer.clear();
        }
    };
}

