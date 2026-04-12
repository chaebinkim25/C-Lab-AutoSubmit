// src/tracking/debugTracker.ts
import * as vscode from 'vscode';
import { sendDebugTelemetry } from '../utils/api';

export function registerDebugTracker(context: vscode.ExtensionContext, studentNumber: string, studentName: string, machineId: string) {
    console.log('[C-Lab] Initializing Debug Tracker...');

    const trackerFactory: vscode.DebugAdapterTrackerFactory = {
        createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
            
            // 1. Initialize the payload bucket for this specific debug session
            const debugPayload = {
                source_snapshot: "",
                breakpoints: [] as any[],
                execution_actions: [] as any[],
                variable_inspection: {} as any,
                output_streams: { stdout: "", stderr: "" }
            };

            // Temporary map to link async DAP requests to their responses
            const pendingEvaluations = new Map<number, { expression: string, context: string }>();

            return {
                // Triggered right before the debug session officially starts
                onWillStartSession: () => {
                    console.log(`[C-Lab] Debug session starting: ${session.name}`);
                    const editor = vscode.window.activeTextEditor;
                    if (editor && (editor.document.languageId === 'c' || editor.document.languageId === 'cpp')) {
                        debugPayload.source_snapshot = editor.document.getText();
                    }
                },

                // Intercept commands sent FROM VS Code TO the Debugger (e.g., clicking "Step Over")
                onWillReceiveMessage: (message: any) => {
                    if (message.type === 'request') {
                        const command = message.command;
                        const args = message.arguments;

                        // 1. Track Navigation Actions
                        if (['stepIn', 'next', 'stepOut', 'continue', 'pause'].includes(command)) {
                            debugPayload.execution_actions.push({
                                action: command,
                                time: new Date().toISOString()
                            });
                        }

                        // 2. Track Breakpoints
                        if (command === 'setBreakpoints' && args && args.breakpoints) {
                            const filename = args.source?.name || "unknown_file";
                            const lines = args.breakpoints.map((bp: any) => bp.line);
                            
                            debugPayload.breakpoints.push({
                                file: filename,
                                lines: lines,
                                time: new Date().toISOString()
                            });
                        }

                        // 3. Track Variable Inspections (Hover, Watch Window, Debug Console)
                        if (command === 'evaluate' && args) {
                            // Store the request sequence ID so we can match it when the answer comes back
                            pendingEvaluations.set(message.seq, {
                                expression: args.expression,
                                context: args.context || 'unknown' // 'hover', 'watch', or 'repl'
                            });
                        }
                    }
                },

                // Intercept data sent FROM the Debugger TO VS Code (e.g., program output, variable values)
                onDidSendMessage: (message: any) => {
                    // 1. Capture the answers to our Variable Inspections
                    if (message.type === 'response' && message.command === 'evaluate') {
                        const pendingReq = pendingEvaluations.get(message.request_seq);
                        
                        if (pendingReq && message.body && message.success) {
                            const evaluatedResult = message.body.result;
                            
                            // Initialize the context category if it doesn't exist (e.g., hover)
                            if (!debugPayload.variable_inspection[pendingReq.context]) {
                                debugPayload.variable_inspection[pendingReq.context] = [];
                            }

                            // Log what they looked at and what the value was
                            debugPayload.variable_inspection[pendingReq.context].push({
                                expression: pendingReq.expression,
                                result: evaluatedResult,
                                time: new Date().toISOString()
                            });
                            
                            // Clean up the map to prevent memory leaks
                            pendingEvaluations.delete(message.request_seq);
                        }
                    }

                    // 2. Capture Terminal Output
                    if (message.type === 'event' && message.event === 'output') {
                        const category = message.body?.category; // 'stdout', 'stderr', or 'console'
                        const outputText = message.body?.output || "";
                        
                        if (category === 'stdout') {
                            debugPayload.output_streams.stdout += outputText;
                        } else if (category === 'stderr') {
                            debugPayload.output_streams.stderr += outputText;
                        }
                    }
                },

                // Triggered when the debug session stops
                onExit: (code: number | undefined, signal: string | undefined) => {
                    console.log(`[C-Lab] Debug session ended. Preparing to transmit telemetry...`);
                    
                    // Fire and forget the payload to the backend
                    sendDebugTelemetry(studentNumber, studentName, machineId, debugPayload);
                }
            };
        }
    };

    // 2. Register the factory for C/C++ debuggers
    const cppdbgDisposable = vscode.debug.registerDebugAdapterTrackerFactory('cppdbg', trackerFactory);
    const cppvsdbgDisposable = vscode.debug.registerDebugAdapterTrackerFactory('cppvsdbg', trackerFactory);

    // THE FIX: Capture the factories and return a custom Disposable to clean them
    return {
        dispose: () => {
            console.log('[C-Lab] Shutting down Debug Tracker...');
            cppdbgDisposable.dispose();
            cppvsdbgDisposable.dispose();
        }
    };
}
