// src/utils/machineID.ts

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { logEvent } from '../extension';

export function getMachineId(context: vscode.ExtensionContext): string {
    const MACHINE_ID_KEY = 'c-lab-autosubmit.machineId';

    // Attempt to retrieve the existing ID from VS Code's persistent storage
    let machineId = context.globalState.get<string>(MACHINE_ID_KEY);

    if (!machineId) {
        logEvent('UTIL_MID_NEW');

        // Generate a new secure UUID v4
        machineId = crypto.randomUUID();

        // Save it to globalState (persists even if VS Code is closed or updated)
        context.globalState.update(MACHINE_ID_KEY, machineId);
    } else {
        logEvent('UTIL_MID_LOAD');
    }

    return machineId;
}
