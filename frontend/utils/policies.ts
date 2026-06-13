// src/utils/policies.ts

import * as vscode from 'vscode';
import { logSubEvent, logEvent } from './logging';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

async function update_config(item: string, value: unknown) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const config = vscode.workspace.getConfiguration(undefined, folder?folder.uri:null);
    try {
        await config.update(item, value, vscode.ConfigurationTarget.Workspace);
        logSubEvent("UTIL_POL_UPDATE", item, JSON.stringify(value));
    } catch (e) {
        logSubEvent("UTIL_POL_FAIL", item, String(e));
    }
}

function disableDebuginfodGlobally() {
    // Target the .gdbinit file in the user's home directory (~/.gdbinit)
    const gdbinitPath = path.join(os.homedir(), '.gdbinit');
    const disableCmd = 'set debuginfod enabled off\n';

    try {
        let content = '';
        if (fs.existsSync(gdbinitPath)) {
            content = fs.readFileSync(gdbinitPath, 'utf8');
        }

        // Only append it if it's not already there
        if (!content.includes('set debuginfod enabled off')) {
            fs.appendFileSync(gdbinitPath, disableCmd);
            logSubEvent("UTIL_POL_GDBINIT", "Appended debuginfod off");
        }
    } catch (e) {
        logSubEvent("UTIL_POL_GDBINIT_FAIL", String(e));
    }
}

export async function enforceLabPolicies() {
    logSubEvent('UTIL_POL_ENFORCE');
    logSubEvent('UTIL_POL_WORKSPACE_FILE', String(vscode.workspace.workspaceFile?.fsPath));
    logSubEvent('UTIL_POL_WORKSPACE_FOLDERS', String(vscode.workspace.workspaceFolders?.length));

    const isMac = os.platform() === 'darwin';
    const isArm = os.arch() === 'arm64';

    const intelliSenseMode = isMac 
        ? (isArm ? 'macos-clang-arm64' : 'macos-clang-x64') 
        : (isArm ? 'linux-gcc-arm64' : 'linux-gcc-x64');

    const compilerPath = isMac ? '/usr/bin/clang' : '/usr/bin/gcc';

    for (const [item, value] of Object.entries({
        'files.autoSave': 'afterDelay',
        'files.autoSaveDelay': 1000,

        'editor.wordWrap': 'on',

        "[c]": {
            'editor.tabSize': 8,
            'editor.detectIndentation': false,
            'editor.insertSpaces': true
        },

        'terminal.integrated.env.linux': {
            'DEBUGINFOD_URLS': ''
        },

        'github.copilot.enable': { "*": false },

        'C_Cpp.default.compilerPath': compilerPath,
        'C_Cpp.default.intelliSenseMode': intelliSenseMode,
        'C_Cpp.default.cStandard': 'c99'
    })) {
        await update_config(item, value);
        
    }

    disableDebuginfodGlobally();

    logSubEvent('UTIL_POL_APPLIED');
}
