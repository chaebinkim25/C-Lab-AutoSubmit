// src/trackers/securityTrackers.ts

import * as vscode from 'vscode';
import { logEvent } from '../utils/logging';
import { MESSAGES } from '../utils/messages';

export class SecurityTracker {
    private lastKnownText: Map<string, string> = new Map();
    private securityEvents: any[] = [];

    // Track exactly when they tabbed out
    private blurTimestamp: number | null = null;

    // State for active editor tracking
    private activeFilePath: string | null = null;
    private activeFileEntryTime: number | null = null;

    public isSystemOperation: boolean = false;
    private isActive: boolean = true;
    private sessionStartTime: number = 0;

    constructor() {}

    private getElapsedSeconds(): number {
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }

    public start(context: vscode.ExtensionContext) {
        this.sessionStartTime = Date.now();

        const windowStateDisposable = vscode.window.onDidChangeWindowState(e => this.analyzeWindowState(e));
        context.subscriptions.push(windowStateDisposable);

        const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(e => this.analyzeActiveEditorChange(e));
        context.subscriptions.push(activeEditorDisposable);

        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.scheme === 'file') {
            this.activeFilePath = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);
            this.activeFileEntryTime = Date.now();
        }

        logEvent('TRK_SEC_ACTIVE');
    }

    public stop() {
        this.isActive = false;
        logEvent('TRK_SEC_DEACTIVATED');
    }

    private analyzeActiveEditorChange(editor: vscode.TextEditor | undefined) {

        if (!this.isActive) { return; }

        const now = Date.now();

        // 1. Log the departure from the previous file
        if (this.activeFilePath && this.activeFileEntryTime) {
            const durationSec = ((now - this.activeFileEntryTime) / 1000).toFixed(1);

            this.securityEvents.push({
                elapsed_seconds: this.getElapsedSeconds(),
                event_type: 'editor_left',
                file_path: this.activeFilePath,
                content: MESSAGES.TRACKER.EDITOR_LEFT(durationSec)
            });
        }

        // 2. Log the arrival into the new file
        if (editor && editor.document.uri.scheme === 'file') {
            const newFilePath = vscode.workspace.asRelativePath(editor.document.uri).normalize('NFC');
            this.activeFilePath = newFilePath;
            this.activeFileEntryTime = now;

            logEvent('TRK_SEC_ENTER', newFilePath);

            this.securityEvents.push({
                elapsed_seconds: this.getElapsedSeconds(),
                event_type: 'editor_entered',
                file_path: newFilePath,
                content: MESSAGES.TRACKER.EDITOR_ENTERED(newFilePath)
            });
        } else {
            // The student closed all tabs, or opened a non-file tab (like the Settings or Extension panel)
            this.activeFilePath = null;
            this.activeFileEntryTime = null;
            logEvent('TRK_SEC_CLOSED');
        }
    }

    private analyzeWindowState(windowState: vscode.WindowState) {

        if (!this.isActive) { return; }

        if (!windowState.focused) {
            // Window lost focus (User clicked away to another app/browser)
            this.blurTimestamp = Date.now();
            logEvent('TRK_SEC_BLUR');

            this.securityEvents.push({
                elapsed_seconds: this.getElapsedSeconds(),
                event_type: 'focus_lost',
                file_path: 'SYSTEM',
                content: MESSAGES.TRACKER.FOCUS_LOST
            });

        } else {
            // Window regained focus
            if (this.blurTimestamp !== null) {
                // Calculate exactly how many seconds they were away
                const durationMs = Date.now() - this.blurTimestamp;
                const durationSec = (durationMs / 1000).toFixed(1);

                logEvent('TRK_SEC_FOCUS', durationSec);

                this.securityEvents.push({
                    elapsed_seconds: this.getElapsedSeconds(),
                    event_type: 'focus_restored',
                    file_path: 'SYSTEM',
                    content: MESSAGES.TRACKER.FOCUS_RESTORED(durationSec)
                });

                // Reset the timer
                this.blurTimestamp = null;
            }
        }
    }

    public setBaseline(documentUri: vscode.Uri, text: string) {
        this.lastKnownText.set(documentUri.fsPath, text);
    }

    public getPendingSecurityEvents() {
        const events = [...this.securityEvents];
        this.securityEvents = [];
        return events;
    }

    public requeueEvents(events: any[]) {
        this.securityEvents.unshift(...events);
    }
}
