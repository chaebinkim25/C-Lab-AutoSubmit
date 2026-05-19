// src/utils/wslTeardown.ts

import { exec } from 'child_process';
import * as vscode from 'vscode';
import { logEvent } from '../extension';

export function terminateWSLSession(): void {
    // 1. Detect if we are running inside WSL
    const distroName = process.env.WSL_DISTRO_NAME;

    // If we aren't in WSL (e.g., Mac, native Linux, or native Windows), do nothing
    if (!distroName) {
        logEvent('UTIL_TERM_SKIP');
        return;
    }

    logEvent('UTIL_TERM_PILL');

    // 2. Execute the Windows command via WSL Interop
    // 'wsl.exe' is available in the Linux PATH thanks to Microsoft's interop layer
    exec(`wsl.exe --shutdown`, (error) => {
        if (error) {
            logEvent('UTIL_TERM_FAIL', error.message);
        }
    });
}
