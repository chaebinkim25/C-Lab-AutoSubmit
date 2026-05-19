// src/trackers/telemetryWorker.ts

import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';
import { SecurityTracker } from './securityTracker';
import { DebugTrackerManager } from './debugTracker';
import { TerminalTracker } from './terminalTracker';
import { telemetryLogQueue, logEvent } from '../extension';
import { CONFIG } from '../utils/config';
import { getToken } from '../utils/token';

export class TelemetryWorker {
    private context: vscode.ExtensionContext;
    private isRunning: boolean = false;

    // A handle for the timeout
    private timeoutHandle?: NodeJS.Timeout;

    private diffTracker: DiffTracker;
    private securityTracker?: SecurityTracker;
    private debugTracker: DebugTrackerManager;
    private terminalTracker?: TerminalTracker;

    constructor(
        context: vscode.ExtensionContext,
        diffTracker: DiffTracker,
        securityTracker: SecurityTracker | undefined,
        debugTracker: DebugTrackerManager,
        terminalTracker?: TerminalTracker
    ) {
        this.context = context;
        this.diffTracker = diffTracker;
        this.securityTracker = securityTracker;
        this.debugTracker = debugTracker;
        this.terminalTracker = terminalTracker;
    }

    public start(context: vscode.ExtensionContext) {
        this.isRunning = true;
        this.scheduleNextRun();

        // Ensure the worker stops if the extension is deactivated
        context.subscriptions.push({
            dispose: () => { this.isRunning = false; }
        });

        logEvent('TEL_ACTIVE');
    }

    private scheduleNextRun() {
        if (!this.isRunning) {return;}

        const delay = Math.floor(Math.random() * (20000 - 10000 + 1) + 60000);

        this.timeoutHandle = setTimeout(() => {
            this.dispatchBulk().finally(() => {
                this.scheduleNextRun();
            });
        }, delay);
    }

    private sanitizePII(payloadStr: string): string {
        return payloadStr.replace(/[a-zA-Z]:\\[Uu]sers\\[^\\]+\\/gi, '~/')
                         .replace(/\/[Uu]sers\/[^\/]+\//gi, '~/')
                         .replace(/\/home\/[^\/]+\//gi, '~/');
    }

    private async dispatchBulk() {
        const patches = this.diffTracker.getPendingPatches();
        const security_events = this.securityTracker ? this.securityTracker.getPendingSecurityEvents() : [];
        const debug_events = this.debugTracker ? this.debugTracker.getPendingEvents() : [];

        const terminal_events = this.terminalTracker ? this.terminalTracker.getPendingEvents() : [];

        // Safely extract and clear the volatile worker queue
        const pendingLogs = [...telemetryLogQueue];
        telemetryLogQueue.length = 0;

        // Map log entries into structured objects for transport
        const extension_logs = pendingLogs.map(e => ({
            elapsed_seconds: e.elapsed_seconds,
            log_code: e.code,
            args: e.args.join('|')
        }));        

        if (patches.length === 0 && security_events.length === 0 && debug_events.length === 0 && extension_logs.length === 0 && terminal_events.length === 0) {
            return;
        }

        const token = getToken(this.context);
        if (!token) {return;}

        const payloadObj = {
            patches,
            security_events,
            debug_events,
            extension_logs,
            terminal_events 
        };
        
        const payload = this.sanitizePII(JSON.stringify(payloadObj));

        try {
            const res = await fetch(`${CONFIG.BASE_URL}/api/track/bulk`, {
            method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: payload
            });
            if (!res.ok) {throw new Error(`HTTP ${res.status}`);}
        } catch (e: any) {
            logEvent('TEL_ERR_BULK', e.message);
            
            // Requeue all items on failure to prevent data loss
            if (patches.length > 0) { this.diffTracker.requeuePatches(patches); }
            if (security_events.length > 0 && this.securityTracker) { this.securityTracker.requeueEvents(security_events); }
            if (debug_events.length > 0 && this.debugTracker) { this.debugTracker.requeueEvents(debug_events); }
            if (terminal_events.length > 0 && this.terminalTracker) { this.terminalTracker.requeueEvents(terminal_events); }
            if (pendingLogs.length > 0) { telemetryLogQueue.unshift(...pendingLogs); }
        }
    }

    public stop() {
        this.isRunning = false;
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
        }
        logEvent('TEL_STOP');
    }

    // Emergency Flush for Unexpected Shutdowns
    public async emergencyFlush(): Promise<void> {
        logEvent('TEL_FLUSH');
        await this.dispatchBulk();
        return new Promise(resolve => setTimeout(resolve, 500));
    }
}
