// src/utils/secureWipe.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from './time';
import { MESSAGES } from './messages';
import { logEvent } from './logging';

export async function secureWipeWorkspace(): Promise<void> {
    try {
        // 1. Find all C/C++ source and header files in the workspace
        const files = await vscode.workspace.findFiles('**/*.{c,h}', '**/node_modules/**');

        if (files.length === 0) {return;}

        logEvent('UTIL_WIPE_INIT', String(files.length));

        // Wipe the secret cache folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            const cacheDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.clab_cache');
            try {
                await vscode.workspace.fs.delete(cacheDir, { recursive: true, useTrash: false });
            } catch(e) {}
        }

        // 2. Iterate and destroy
        for (const uri of files) {
            try {
                // Read the exact file size
                const stat = await vscode.workspace.fs.stat(uri);

                // Create an empty byte array of the exact same size
                // (Uint8Array automatically initializes all elements to 0x00)
                const zeroBuffer = new Uint8Array(stat.size);

                // Overwrite the physical file sectors with the null bytes
                await vscode.workspace.fs.writeFile(uri, zeroBuffer);

                // Permanently delete the file pointer, bypassing the OS trash/recycle bin
                await vscode.workspace.fs.delete(uri, { useTrash: false });

            } catch (err) {
                logEvent('UTIL_WIPE_FAIL', uri.fsPath);
            }
        }

        logEvent('UTIL_WIPE_DONE');

    } catch (error) {

        logEvent('UTIL_WIPE_FATAL', String(error));

    }
}

export async function cleanupWorkspaceOnStartup(): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return; }

        const rootPath = workspaceFolders[0].uri;

        logEvent('UTIL_CLEAN_INIT');

        // 1. Delete the .vscode and .clab_cache directory recursively
        const vscodeDir = vscode.Uri.joinPath(rootPath, '.vscode');
        try {
            await vscode.workspace.fs.stat(vscodeDir); // Throws if it doesn't exist
            await vscode.workspace.fs.delete(vscodeDir, { recursive: true, useTrash: false });
        } catch (err) {
            // Ignore error if the folder doesn't exist
        }

        const cacheDir = vscode.Uri.joinPath(rootPath, '.clab_cache');
        try {
            await vscode.workspace.fs.delete(cacheDir, { recursive: true, useTrash: false });
        } catch (err) {}


        // 2. Delete any residual source files and compiled binaries (.exe, .out, .o)
        const residualFiles = await vscode.workspace.findFiles('**/*.{c,h,exe,out,o}');
        for (const uri of residualFiles) {
            try {
                await vscode.workspace.fs.delete(uri, { useTrash: false });
            } catch (err) {
                // Ignore individual file deletion errors
            }
        }

        logEvent('UTIL_CLEAN_DONE');

    } catch (error) {

        logEvent('UTIL_CLEAN_FAIL', String(error));

    }
}
