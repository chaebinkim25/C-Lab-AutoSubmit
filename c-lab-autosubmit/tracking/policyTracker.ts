// src/tracking/policyTracker.ts
import * as vscode from 'vscode';
import { logSecurityViolation } from '../utils/api';
import { enforcePolicies } from '../utils/workspace';

/**
 * Initializes the real-time configuration watchdog.
 * Monitors critical workspace settings and reverts them if tampered with.
 * Returns a Disposable so it can be killed when the session ends.
 */
export function registerPolicyWatchdog(
    studentNumber: string, 
    studentName: string, 
    machineId: string
): vscode.Disposable {
    
    console.log('[C-Lab] Initializing Policy Watchdog...');

    // Return the listener directly as the disposable
    return vscode.workspace.onDidChangeConfiguration(async (e) => {
        
        const securitySettings = [
            'files.autoSave', 
            'files.autoSaveDelay',
            'editor.inlineSuggest.enabled',
            'editor.quickSuggestions',
            'editor.tabSize'
        ];

        // Find exactly WHICH settings the student tried to change
        const tamperedSettings = securitySettings.filter(setting => e.affectsConfiguration(setting));

        if (tamperedSettings.length > 0) {
            vscode.window.showWarningMessage("🚨 C-Lab Security: Lab policies (Auto-Save, AI blocks, Indentation) cannot be altered during an active session.");
            
            // 1. Log the exact violation to the backend silently
            logSecurityViolation(
                studentNumber,
                studentName,
                machineId,
                "Policy Tampering",
                `Attempted to modify: ${tamperedSettings.join(', ')}`
            );

            // 2. Re-apply the strict workspace policies instantly
            await enforcePolicies(); 
        }
    });
}
