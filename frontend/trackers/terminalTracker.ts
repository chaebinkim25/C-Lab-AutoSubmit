// src/trackers/terminalTracker.ts

import * as vscode from 'vscode';
import { logEvent } from '../extension';

export class TerminalTracker {
    private terminalEvents: any[] = [];
    private isActive: boolean = true;
    private sessionStartTime: number = 0;
    
    // Independent buffers for input and output streams
    private stdoutBuffer: string = "";
    private stdinBuffer: string = "";
    private timeoutHandle: NodeJS.Timeout | null = null;

    constructor() {}

    private getElapsedSeconds(): number {
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }

    public start(context: vscode.ExtensionContext) {
        this.sessionStartTime = Date.now();

        // 1. Track STDOUT (Data written from the process to the terminal)
        if ((vscode.window as any).onDidWriteTerminalData) {
            const disposableOut = (vscode.window as any).onDidWriteTerminalData((e: any) => {
                if (!this.isActive) { return; }
                this.stdoutBuffer += e.data;
                this.scheduleFlush('stdout');
            });
            context.subscriptions.push(disposableOut);
            logEvent('TRK_TERM_ACTIVE');
        } else {
            logEvent('GENERIC_ERROR', 'onDidWriteTerminalData API not supported in this VS Code version');
        }

        // 2. Track STDIN (Keystrokes sent from the user to the terminal)
        if ((vscode.window as any).onDidSendTerminalData) {
            const disposableIn = (vscode.window as any).onDidSendTerminalData((e: any) => {
                if (!this.isActive) { return; }
                this.stdinBuffer += e.data;
                this.scheduleFlush('stdin');
            });
            context.subscriptions.push(disposableIn);
        }
    }

    public stop() {
        this.isActive = false;
        this.flush();
        logEvent('TRK_TERM_DEACTIVATED');
    }

    private scheduleFlush(stream: 'stdout' | 'stdin') {
        const targetBuffer = stream === 'stdout' ? this.stdoutBuffer : this.stdinBuffer;
        
        // Flush early if the buffer is getting aggressively spammed (e.g., infinite loop output)
        if (targetBuffer.length > 1000) {
            this.flush();
        } else if (!this.timeoutHandle) {
            this.timeoutHandle = setTimeout(() => this.flush(), 1000);
        }
    }

    private flush() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }

        this.processBuffer('stdout', this.stdoutBuffer);
        this.stdoutBuffer = "";

        this.processBuffer('stdin', this.stdinBuffer);
        this.stdinBuffer = "";
    }

    private processBuffer(stream: 'stdout' | 'stdin', rawText: string) {
        if (rawText.length === 0) { return; }

        // Strip ANSI escape sequences (colors, cursor resets) to keep the DB readable
         
        const cleanText = rawText.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

        if (cleanText.trim().length > 0) {
            this.terminalEvents.push({
                elapsed_seconds: this.getElapsedSeconds(),
                stream: stream,
                content: cleanText
            });
        }
    }

    public getPendingEvents() {
        const events = [...this.terminalEvents];
        this.terminalEvents = [];
        return events;
    }

    public requeueEvents(events: any[]) {
        this.terminalEvents.unshift(...events);
    }
}
