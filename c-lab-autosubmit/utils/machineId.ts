// src/utils/machineId.ts
import * as vscode from 'vscode';
import * as crypto from 'crypto';

const MACHINE_ID_KEY = 'c_lab_machine_id';

/**
 * Fallback UUID v4 generator for older Node environments
 */
function generateUUID(): string {
    try {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) {}

    // Fallback: Generate 16 random bytes and manually format as UUIDv4
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Set version to 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Set variant to 10xx
    const hex = bytes.toString('hex');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

/**
 * Retrieves the existing machine ID or generates a new one if it's the first run.
 * @param context The VS Code extension context
 * @returns The unique machine ID string
 */
export function getMachineId(context: vscode.ExtensionContext): string {
    // Attempt to load the existing ID from VS Code's local storage
    let machineId = context.globalState.get<string>(MACHINE_ID_KEY);

    if (!machineId) {
        // First execution: generate a new UUID and save it
        machineId = generateUUID();
        
        // Store it asynchronously. (Fire and forget, it will be saved to disk shortly)
        context.globalState.update(MACHINE_ID_KEY, machineId);
        
        console.log(`[C-Lab] First run detected. Generated new machine ID`);
    } else {
        console.log(`[C-Lab] Loaded existing machine ID`);
    }

    return machineId;
}
