// src/trackers/telemetryWorker.ts

import * as vscode from 'vscode';
import { DiffTracker } from './diffTracker';
import { SecurityTracker } from './securityTracker';
import { DebugTrackerManager } from './debugTracker';
import { telemetryLogQueue, logEvent } from '../extension';
import { CONFIG } from '../utils/config';
import { getSessionId } from '../utils/token';
import { getMachineId } from '../utils/machineID';

export class TelemetryWorker {
    private context: vscode.ExtensionContext;
    private isRunning: boolean = false;

    // A handle for the timeout
    private timeoutHandle?: NodeJS.Timeout;

    private diffTracker: DiffTracker;
    private securityTracker?: SecurityTracker;
    private debugTracker: DebugTrackerManager;
    private pendingSubmissions: any[] = [];

    constructor(
        context: vscode.ExtensionContext,
        diffTracker: DiffTracker,
        securityTracker: SecurityTracker | undefined,
        debugTracker: DebugTrackerManager
    ) {
        this.context = context;
        this.diffTracker = diffTracker;
        this.securityTracker = securityTracker;
        this.debugTracker = debugTracker;
    }

    public queueSubmission(payload: any) {
        this.pendingSubmissions.push(payload);
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

        const sessionId = getSessionId(this.context);
        const machineId = getMachineId(this.context);
        if (!sessionId || !machineId) {return false;}        

        const submissions = [...this.pendingSubmissions];
        this.pendingSubmissions.length = 0;

        // Safely extract and clear the volatile worker queue
        const pendingLogs = [...telemetryLogQueue];
        telemetryLogQueue.length = 0;

        if (patches.length === 0 && security_events.length === 0 && debug_events.length === 0 && pendingLogs.length === 0 && submissions.length === 0) {
            return;
        }


        const payloadObj = {
            patches,
            security_events,
            debug_events,
            pendingLogs,
            submissions 
        };
        
        const payload = this.sanitizePII(JSON.stringify(payloadObj));

        try {
            const res = await fetch(`${CONFIG.BASE_URL}/api/track/bulk`, {
            method: 'POST',
                headers: {
                    'x-machine-id': machineId,
                    'x-session-id': sessionId,
                    'Content-Type': 'application/json'
                },
                body: payload
            });
            if (!res.ok) {throw new Error(`HTTP ${res.status} - ${res.statusText}`);}
            return true;
        } catch (e: any) {
            logEvent('TEL_ERR_BULK', e.message);
            
            // Requeue all items on failure to prevent data loss
            if (patches.length > 0) { this.diffTracker.requeuePatches(patches); }
            if (security_events.length > 0 && this.securityTracker) { this.securityTracker.requeueEvents(security_events); }
            if (debug_events.length > 0 && this.debugTracker) { this.debugTracker.requeueEvents(debug_events); }
            if (pendingLogs.length > 0) { telemetryLogQueue.unshift(...pendingLogs); }
            if (submissions.length > 0) { this.pendingSubmissions.unshift(...submissions); }
            return false;
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
    public async emergencyFlush(): Promise<boolean> {
        logEvent('TEL_FLUSH');
        const success = await this.dispatchBulk();
        await new Promise(resolve => setTimeout(resolve, 500));
        return success ?? true;
    }
}
