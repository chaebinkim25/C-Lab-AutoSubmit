// src/utils/policies.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from './time';
import { MESSAGES } from './messages';
import { logEvent } from '../extension';


export async function enforceLabPolicies() {
    logEvent('UTIL_POL_ENFORCE');

    // We target the 'Workspace' scope so these settings only apply to the C-Lab folder,
    // not the student's global VS Code preferences.
    const config = vscode.workspace.getConfiguration(undefined, null);

    try {
        // Core Policy #4: Auto-Save with 60-second delay
        await config.update('files.autoSave', 'afterDelay', vscode.ConfigurationTarget.Workspace);
        await config.update('files.autoSaveDelay', 60000, vscode.ConfigurationTarget.Workspace);

        // Core Policy #4: Strict Educational Formatting (8-space tabs)
        await config.update('editor.tabSize', 8, vscode.ConfigurationTarget.Workspace);
        await config.update('editor.insertSpaces', true, vscode.ConfigurationTarget.Workspace);

        // Disable AI/Copilot completions locally
        try {
            await config.update('github.copilot.enable', { "*": false }, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
            // Silently ignore: Copilot is not installed anyway
        }

        logEvent('UTIL_POL_APPLIED');

    } catch (error) {

        logEvent('UTIL_POL_FAIL', String(error));
    }
}

export function startPolicyWatchdog(context: vscode.ExtensionContext) {

    logEvent('UTIL_POL_WATCH');

    const watchdog = vscode.workspace.onDidChangeConfiguration((e) => {
        // Check which specific policies were touched
        const tamperedAutoSave = e.affectsConfiguration('files.autoSave') || e.affectsConfiguration('files.autoSaveDelay');
        const tamperedCopilot = e.affectsConfiguration('github.copilot.enable');
        const tamperedFormat = e.affectsConfiguration('editor.tabSize') || e.affectsConfiguration('editor.insertSpaces');

        if (tamperedAutoSave || tamperedCopilot || tamperedFormat) {
            // Send a high-visibility log without reverting the settings.
            // This is captured by extensionLogBuffer and transmitted by TelemetryWorker.
            logEvent('UTIL_POL_ALERT', String(tamperedAutoSave), String(tamperedCopilot), String(tamperedFormat));
        }
    });

    context.subscriptions.push(watchdog);
}
