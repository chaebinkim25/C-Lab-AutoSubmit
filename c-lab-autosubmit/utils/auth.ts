// src/utils/auth.ts
import * as vscode from 'vscode';

export interface StudentCredentials {
    studentNumber: string;
    studentName: string;
}

/**
 * Prompts the user for their Student Number and Name.
 * @returns The credentials, or undefined if the user cancels the prompt.
 */
export async function promptForCredentials(): Promise<StudentCredentials | undefined> {
    // 1. Prompt for Student Number
    const studentNumber = await vscode.window.showInputBox({
        prompt: "C-Lab: Enter your Student Number",
        placeHolder: "e.g., 2026-12345", // Updated placeholder
        ignoreFocusOut: true, 
        validateInput: (text) => {
            if (!text || text.trim().length === 0) {
                return "Student Number cannot be empty.";
            }
            // THE FIX: Strict Regex for 0000-00000 format
            if (!/^\d{4}-\d{5}$/.test(text.trim())) {
                return "Student Number must be in the format: YYYY-NNNNN (e.g., 2026-12345).";
            }
            return null; // Input is valid
        }
    });

    // If the user presses Escape, the prompt returns undefined. Halt the flow.
    if (!studentNumber) {
        return undefined;
    }

    // 2. Prompt for Student Name
    const studentName = await vscode.window.showInputBox({
        prompt: "C-Lab: Enter your Full Name",
        placeHolder: "e.g., Hong Gildong",
        ignoreFocusOut: true,
        validateInput: (text) => {
            if (!text || text.trim().length === 0) {
                return "Name cannot be empty.";
            }
            return null; // Input is valid
        }
    });

    if (!studentName) {
        return undefined;
    }

    return {
        studentNumber: studentNumber.trim(),
        studentName: studentName.trim()
    };
}
