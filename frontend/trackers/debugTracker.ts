// src/trackers/debugTracker.ts

import * as vscode from 'vscode';
import { logEvent } from '../extension';
import { MESSAGES } from '../utils/messages';

export class DebugTrackerManager implements vscode.DebugAdapterTrackerFactory {
    private debugEvents: any[] = [];

    // The core debug commands we actually care about for educational telemetry
    private readonly TARGET_COMMANDS = [
        'setBreakpoints',
        'next',        // Step Over
        'stepIn',      // Step Into
        'stepOut',     // Step Out
        'continue',    // Continue execution
        'pause',       // Manually pausing execution
        'evaluate'     // Track variable inspections
    ];

    private isActive: boolean = true;
    private sessionStartTime: number = 0;

    constructor() {}

    private getElapsedSeconds(): number {
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }

    public start(context: vscode.ExtensionContext) {
        this.sessionStartTime = Date.now();

        // Register this factory for both Linux/WSL (cppdbg) and Windows (cppvsdbg) C++ debuggers
        const cppdbgDisposable = vscode.debug.registerDebugAdapterTrackerFactory('cppdbg', this);
        const cppvsdbgDisposable = vscode.debug.registerDebugAdapterTrackerFactory('cppvsdbg', this);
        const lldbDisposable = vscode.debug.registerDebugAdapterTrackerFactory('lldb', this);

        context.subscriptions.push(cppdbgDisposable, cppvsdbgDisposable, lldbDisposable);

        logEvent('TRK_DBG_ACTIVE');
    }

    public stop() {
        this.isActive = false;
        logEvent('TRK_DBG_DEACTIVATED');
    }

    // Fulfills the vscode.DebugAdapterTrackerFactory interface
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {

        if (!this.isActive) { return undefined; }

        logEvent('TRK_DBG_START', session.name);

        // Capture Initial Active File & Source Snapshot ---
        const editor = vscode.window.activeTextEditor;
        let activeFilePath = 'Unknown';
        let sourceSnapshot = '';

        if (editor && editor.document.uri.scheme === 'file') {
            // asRelativePath flawlessly preserves the folder structure and the .c extension
            activeFilePath = vscode.workspace.asRelativePath(editor.document.uri).normalize('NFC');
            sourceSnapshot = editor.document.getText();
            logEvent('TRK_DBG_SNAPSHOT', activeFilePath);
        } else {
            logEvent('TRK_DBG_NO_FILE');
        }

        // Queue the launch event with the full snapshot
        this.debugEvents.push({
            elapsed_seconds: this.getElapsedSeconds(),
            debug_code: 'DBG_LAUNCH',
            file_path: activeFilePath,
            // We store the entire code snapshot in the details payload
            details: sourceSnapshot
        });

        // Return an object that fulfills the vscode.DebugAdapterTracker interface
        return {
            onWillReceiveMessage: (message: any) => this.interceptMessage(message, activeFilePath),
            onWillStopSession: () => {
                logEvent('TRK_DBG_STOP');

                let capturedDiagnostics: any[] = [];

                // Retrieve all diagnostics (errors, warnings) currently known to VS Code
                const allDiagnostics = vscode.languages.getDiagnostics();

                for (const [uri, diagnostics] of allDiagnostics) {
                    // Only grab diagnostics for the file they were just debugging
                    if (vscode.workspace.asRelativePath(uri).normalize('NFC') === activeFilePath) {
                        capturedDiagnostics = diagnostics.map(d => ({
                            line: d.range.start.line + 1, // Convert 0-indexed to human-readable 1-indexed
                            // Map VS Code's numeric severity enum to a readable string
                            severity: d.severity === vscode.DiagnosticSeverity.Error ? 'Error' :
                                      d.severity === vscode.DiagnosticSeverity.Warning ? 'Warning' : 'Info',
                            message: d.message
                        }));
                        break;
                    }
                }

                if (capturedDiagnostics.length > 0) {
                    // Format the real errors into a readable string
                    let errorSummary = capturedDiagnostics.map(d => `[L${d.line}] ${d.message}`).join(' | ');
                    // Truncate to prevent UI log bloat if there are dozens of cascading errors
                    if (errorSummary.length > 150) {
                        errorSummary = errorSummary.substring(0, 150) + '...';
                    }
                    logEvent('TRK_DBG_DIAG', capturedDiagnostics.length.toString(), errorSummary);
                }

                // Log the stop event, attaching the diagnostics if any exist
                this.debugEvents.push({
                    elapsed_seconds: this.getElapsedSeconds(),
                    debug_code: 'DBG_STOP',
                    file_path: activeFilePath,
                    details: capturedDiagnostics.length > 0 ? JSON.stringify({ diagnostics: capturedDiagnostics }) : null
                });
            }
        };
    }

    private interceptMessage(message: any, activeFilePath: string) {
        let summary = '';
        let parsedDetails: any = null;
        let debugCode = '';

        // A. Handle DAP Requests (User Actions)
        if (message.type === 'request' && this.TARGET_COMMANDS.includes(message.command)) {

            if (message.command === 'setBreakpoints') {
                debugCode = 'DBG_SET_BREAKPOINTS';
                const sourceName = message.arguments?.source?.name || 'unknown file';
                const breakpoints = message.arguments?.breakpoints || [];
                const lines: number[] = breakpoints.map((bp: any) => bp.line);

                if (lines.length > 0) {
                    summary = MESSAGES.TRACKER.BREAKPOINTS_SET(sourceName, lines.join(', '));
                } else {
                    summary = MESSAGES.TRACKER.BREAKPOINTS_CLEAR(sourceName);
                }
                parsedDetails = { lines: lines };
            }
            // Parse Evaluation Requests (Hover, Watch, Debug Console)
            else if (message.command === 'evaluate') {
                debugCode = 'DBG_EVALUATE';
                const expression = message.arguments?.expression || 'unknown';
                const context = message.arguments?.context || 'unknown'; // 'hover', 'watch', or 'repl'

                summary = MESSAGES.TRACKER.EVAL_VAR(expression, context);
                parsedDetails = {
                    command_type: 'evaluate',
                    expression: expression,
                    context: context
                };
            }
            // Execution Navigation Parsing
            else {
                // Extract thread ID if the debugger provides it
                const threadId = message.arguments?.threadId;
                const threadContext = threadId ? ` (Thread ${threadId})` : '';

                // Translate raw DAP commands to TA-friendly UI terminology
                switch (message.command) {
                    case 'next':
                        summary = MESSAGES.TRACKER.NAV_ACTION("Step Over", threadContext);
                        debugCode = 'DBG_STEP_OVER';
                        break;
                    case 'stepIn':
                        summary = MESSAGES.TRACKER.NAV_ACTION("Step Into", threadContext);
                        debugCode = 'DBG_STEP_INTO';
                        break;
                    case 'stepOut':
                        summary = MESSAGES.TRACKER.NAV_ACTION("Step Out", threadContext);
                        debugCode = 'DBG_STEP_OUT';
                        break;
                    case 'continue':
                        summary = MESSAGES.TRACKER.NAV_ACTION("Continue Execution", threadContext);
                        debugCode = 'DBG_CONTINUE';
                        break;
                    case 'pause':
                        summary = MESSAGES.TRACKER.NAV_ACTION("Pause Execution", threadContext);
                        debugCode = 'DBG_PAUSE';
                        break;
                    default:
                        summary = MESSAGES.TRACKER.ACTION_UNKNOWN(message.command);
                        debugCode = 'DBG_UNKNOWN';
                }

                // Store a clean, minimal payload
                parsedDetails = {
                    command_type: 'navigation',
                    thread_id: threadId || null
                };
            }
        }
        // B. Handle DAP Events (Program Output)
        else if (message.type === 'event' && message.event === 'output') {
            const category = message.body?.category || 'console';
            let outputStr = message.body?.output || '';

            // Ignore internal VS Code telemetry spam or empty lines
            if (category === 'telemetry' || outputStr.trim() === '') {return;}

            // Security/Performance: Truncate massively long outputs (e.g., infinite loops)
            // to prevent payload bloat before sending to the database.
            if (outputStr.length > 250) {
                outputStr = outputStr.substring(0, 250) + MESSAGES.TRACKER.TRUNCATED;
            }

            debugCode = 'DBG_OUTPUT';
            summary = MESSAGES.TRACKER.OUTPUT(category, outputStr.trim());
            parsedDetails = {
                command_type: 'output',
                category: category,
                output: outputStr
            };
        }
        // Ignore all other noisy DAP traffic (threads, capabilities, variables responses)
        else {
            return;
        }

        // C. Log and Queue
        logEvent('TRK_DBG_INTERCEPT', summary);

        this.debugEvents.push({
            elapsed_seconds: this.getElapsedSeconds(),
            debug_code: debugCode,
            file_path: activeFilePath,
            details: parsedDetails ? JSON.stringify(parsedDetails) : null
        });
    }

    public getPendingEvents() {
        const events = [...this.debugEvents];
        this.debugEvents = [];
        return events;
    }


    public requeueEvents(events: any[]) {
        this.debugEvents.unshift(...events);
    }
}
