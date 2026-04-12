// src/utils/api.ts
import * as vscode from 'vscode';
import { DiffPayload } from '../tracking/diffTracker';

// NOTE: In production, this should be pulled from vscode.workspace.getConfiguration()
const API_BASE_URL = 'http://127.0.0.1:8000';

export interface ServerStatus {
    isLabTime: boolean;
    requiredVersion: string | null;
}

/**
 * Pings the backend to check the lab schedule and retrieve the required extension version.
 */
export async function checkLabTime(): Promise<ServerStatus> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-time`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json() as { is_lab_time: boolean; current_server_time: string; required_version: string };
        
        return {
            isLabTime: data.is_lab_time,
            requiredVersion: data.required_version
        };

    } catch (error) {
        console.error('[C-Lab] Failed to check server status:', error);
        // Fail-safe: Block access and assume network is down
        return {
            isLabTime: false,
            requiredVersion: null 
        }; 
    }
}

export interface TaskItem {
    task_id: string;
    title: string;
    description: string;
    skeleton_code: string;
}

export interface SessionPayload {
    student_number: string;
    student_name: string;
    machine_id: string;
    os_platform: string;
}

/**
 * Sends a POST request to the backend to initialize a new student lab session.
 * * @param payload - An object containing student details (number, name), 
 * machine identifier, and OS platform information.
 * @returns A promise that resolves to `true` if the session started successfully 
 * (HTTP 200-299), or `false` if the request failed or timed out.
 */
export async function startSession(payload: SessionPayload): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/session/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return response.ok;
    } catch (error) {
        console.error('[C-Lab] Failed to start session:', error);
        return false;
    }
}

/**
 * Retrieves the list of available C programming lab tasks from the backend.
 * * @returns A promise that resolves to an array of `TaskItem` objects. 
 * Returns an empty array `[]` if the network request fails or the server 
 * returns a non-200 status code.
 * * @throws Will log an error to the Developer Tools console but does not 
 * re-throw, ensuring the UI doesn't crash if the API is offline.
 */
export async function fetchLabTasks(studentNumber: string): Promise<TaskItem[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/lab/tasks?student_number=${studentNumber}`);
        if (!response.ok) { throw new Error('Failed to fetch tasks'); }
        return await response.json() as TaskItem[];
    } catch (error) {
        console.error('[C-Lab] Failed to fetch lab tasks:', error);
        return [];
    }
}

/**
 * Establishes the initial state (baseline) of a C source file on the server.
 * * This is a foundational function for the diff-tracking system. It uploads the 
 * full initial content of a file so that subsequent changes can be recorded 
 * as incremental differences (diffs).
 * * @param studentNumber - The unique identification number of the student.
 * @param studentName - The name of the student
 * @param machineId - Unique identifier for the student's hardware.
 * @param filename - The name of the file being tracked (e.g., 'main.c').
 * @param content - The complete source code text at the start of the session.
 * @returns A promise that resolves when the network request is complete.
 */
export async function sendBaseline(studentNumber: string, studentName: string, machineId: string, filename: string, content: string): Promise<void> {    // We will build the full diff-tracking backend endpoint in Phase 3.
    // For now, this establishes the initial state on the server.
    try {
        await fetch(`${API_BASE_URL}/api/track/diff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_number: studentNumber,
                student_name: studentName,
                machine_id: machineId,
                file_name: filename,
                timestamp: new Date().toISOString(),
                diff_payload: content,
                is_baseline: true
            })
        });
        console.log(`[C-Lab] Baseline established for ${filename}`);
    } catch (error) {
        console.error('[C-Lab] Failed to send baseline:', error);
    }
}

/**
 * Reports a security or policy violation to the backend.
 * Handles both unauthorized pastes and attempts to bypass extension settings.
 */
export async function logSecurityViolation(
    studentNumber: string, 
    studentName: string, 
    machineId: string, 
    violationType: string, 
    details: string,
    filename?: string // Optional parameter
): Promise<void> {
    try {
        await fetch(`${API_BASE_URL}/api/track/security-violation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_number: studentNumber,
                student_name: studentName,
                machine_id: machineId,
                timestamp: new Date().toISOString(),
                violation_type: violationType,
                details: details,
                file_name: filename || null
            })
        });
        console.log(`[C-Lab] Security violation logged: ${violationType}`);
    } catch (error) {
        // Fail silently to prevent interrupting the student's UI
        console.error('[C-Lab] Failed to log security violation:', error);
    }
}

/**
 * Reports a potential academic integrity violation to the server when a 
 * paste event is detected in the editor.
 * * This function captures what was pasted, which file it was pasted into, 
 * and identifying information about the student and their machine.
 * * @param studentNumber - The unique identification number of the student.
 * @param studentName - The name of the student
 * @param machineId - Unique identifier for the hardware being used.
 * @param filename - The name of the file where the paste occurred (e.g., 'lab1.c').
 * @param content - The actual text content that was pasted into the editor.
 * @returns A promise that resolves when the report has been sent.
 */
export async function logPasteViolation(studentNumber: string, studentName: string, machineId: string, filename: string, content: string): Promise<void> {
    try {
        await fetch(`${API_BASE_URL}/api/track/paste-violation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_number: studentNumber,
                student_name: studentName,
                machine_id: machineId,
                file_name: filename,
                timestamp: new Date().toISOString(),
                pasted_content: content
            })
        });
        console.log(`[C-Lab] Paste violation logged for ${filename}`);
    } catch (error) {
        console.error('[C-Lab] Failed to log paste violation:', error);
    }
}

/**
 * Sends an incremental code update (diff) to the server for a specific file.
 * * Unlike `sendBaseline`, this function sets `is_baseline` to `false`, 
 * signaling to the backend that this is a regular snapshot of the student's 
 * progress during the lab session.
 * * @param payload - An object containing the student's ID, student's name, machine ID, 
 * the filename, a current timestamp, and the latest code content.
 * @returns A promise that resolves to `true` if the diff was successfully 
 * recorded by the server, or `false` if the request failed.
 */
export async function sendDiff(payload: DiffPayload): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/track/diff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_number: payload.studentNumber,
                student_name: payload.studentName,
                machine_id: payload.machineId,
                file_name: payload.filename,
                timestamp: payload.timestamp,
                diff_payload: payload.content,
                is_baseline: false // Regular typing diff
            })
        });
        return response.ok;
    } catch (error) {
        console.error('[C-Lab] Failed to send diff payload:', error);
        return false;
    }
}

export interface DebugTelemetry {
    source_snapshot: string;
    breakpoints: any[];
    execution_actions: any[];
    variable_inspection: any;
    output_streams: { stdout: string; stderr: string };
}

/**
 * Transmits detailed debugging session data to the backend for pedagogical analysis.
 * * This function captures a "snapshot" of the debugging environment, including 
 * where breakpoints are set, what variables are being inspected, and how 
 * the student is stepping through the code (execution actions).
 * * @param studentNumber - The unique identification number of the student.
 * @param studentName - The name of the student
 * @param machineId - Unique identifier for the hardware being used.
 * @param telemetry - An object containing specific debug-related events and state.
 * @returns A promise that resolves when the transmission attempt is complete.
 */
export async function sendDebugTelemetry(studentNumber: string, studentName: string, machineId: string, telemetry: DebugTelemetry): Promise<void> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/track/debug-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_number: studentNumber,
                student_name: studentName,
                machine_id: machineId,
                source_snapshot: telemetry.source_snapshot,
                breakpoints: telemetry.breakpoints,
                execution_actions: telemetry.execution_actions,
                variable_inspection: telemetry.variable_inspection,
                output_streams: telemetry.output_streams
            })
        });
        
        if (response.ok) {
            console.log('[C-Lab] Debug telemetry transmitted securely.');
        } else {
            console.error(`[C-Lab] Server rejected debug telemetry: ${response.statusText}`);
        }
    } catch (error) {
        console.error('[C-Lab] Failed to send debug telemetry:', error);
    }
}

export interface SubmissionPayload {
    student_number: string;
    student_name: string,
    machine_id: string;
    submission_type: 'mid' | 'final';
    task_id: string;
    source_files_snapshot: Record<string, string>;
    vscode_config_snapshot: Record<string, string>;
}

/**
 * Transmits the final or intermediate code submission to the server for grading or archival.
 * * This function handles the "Submit" action in the lab workflow. It sends the 
 * complete source code along with metadata identifying the student and the specific task.
 * * @param payload - An object containing the student's ID, the task being submitted, 
 * the source code, and the type of submission (e.g., 'manual' or 'auto').
 * @returns A promise that resolves to `true` if the server accepted the submission, 
 * or `false` if the request failed or was rejected.
 */
export async function sendSubmission(payload: SubmissionPayload): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/session/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`[C-Lab] ${payload.submission_type} submission successful.`);
            return true;
        } else {
            console.error(`[C-Lab] Server rejected submission: ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error('[C-Lab] Failed to send submission:', error);
        return false;
    }
}

/**
 * Retrieves a student's previous lab submissions from the server, formatted as Markdown.
 * * This function is typically used to populate a "History" or "Review" view within the 
 * VS Code extension, allowing students to see their past work for a specific session.
 * * @param studentNumber - The unique identification number of the student.
 * @param studentName - The name of the student
 * @param machineId - Unique identifier for the hardware being used.
 * @returns A promise that resolves to a Markdown string if successful, or `null` if 
 * the data could not be retrieved.
 */
export async function fetchLabSubmissions(studentNumber: string, studentName: string, machineId: string): Promise<string | null> {
    try {
        const url = new URL(`${API_BASE_URL}/api/lab/submissions`);
        url.searchParams.append('student_number', studentNumber);
        url.searchParams.append('student_name', studentName);
        url.searchParams.append('machine_id', machineId);

        const response = await fetch(url.toString());
        
        if (response.ok) {
            const data = await response.json() as { markdown_content: string };
            return data.markdown_content;
        } else {
            console.error(`[C-Lab] Server rejected fetch: ${response.statusText}`);
            return null;
        }
    } catch (error) {
        console.error('[C-Lab] Failed to fetch submissions:', error);
        return null;
    }
}
