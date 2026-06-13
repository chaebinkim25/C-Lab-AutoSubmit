import { MESSAGES } from "./messages";
import { extensionStartTime, getKSTISO8601 } from "./time";
import * as vscode from 'vscode';
export interface LogEntry {
    timestamp: string;
    elapsed_seconds: number;
    code: keyof typeof MESSAGES.LOGS;
    args: string[];
}

export const extensionLogBuffer: LogEntry[] = []; // Persistent history for the Final Review
export const telemetryLogQueue: LogEntry[] = [];  // Volatile queue for the Background Worker

export const extLogger = vscode.window.createOutputChannel("C-Lab AutoSubmit");

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

export function logSubEvent(code: keyof typeof MESSAGES.LOGS, ...args: string[]) {
    const msgTemplate = MESSAGES.LOGS[code] as any;
    const displayStr = typeof msgTemplate === 'function' ? msgTemplate(...args) : msgTemplate;

    extLogger.appendLine(`                            ${displayStr}`);
}

export function clearLogs() {
    extensionLogBuffer.length = 0;
    telemetryLogQueue.length = 0;
}

export function clearExtensionOutput() {
    extLogger.clear();
}
