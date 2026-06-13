// src/utils/token.ts

import * as vscode from 'vscode';

const SESSION_KEY = 'c-lab-autosubmit.sessionId';

export async function setSessionId(context: vscode.ExtensionContext, token: string): Promise<void> {
    await context.globalState.update(SESSION_KEY, token);
}

export function getSessionId(context: vscode.ExtensionContext): string | undefined {
    return context.globalState.get<string>(SESSION_KEY);
}

export async function clearSessionId(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(SESSION_KEY, undefined);
}
