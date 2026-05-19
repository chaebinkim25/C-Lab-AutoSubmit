// src/utils/token.ts

import * as vscode from 'vscode';

const JWT_KEY = 'c-lab-autosubmit.jwtToken';

export async function setToken(context: vscode.ExtensionContext, token: string): Promise<void> {
    await context.globalState.update(JWT_KEY, token);
}

export function getToken(context: vscode.ExtensionContext): string | undefined {
    return context.globalState.get<string>(JWT_KEY);
}

export async function clearToken(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(JWT_KEY, undefined);
}
