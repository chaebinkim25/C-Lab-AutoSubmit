// src/utils/reviewGenerator.ts

import * as vscode from 'vscode';
import { getKSTISO8601 } from './time';
import { extensionLogBuffer } from '../extension';
import { MESSAGES } from './messages';

export async function generateLocalReview(context: vscode.ExtensionContext, taskId: string): Promise<string> {
    const studentNumber = context.workspaceState.get<string>('studentNumber') || 'Unknown';
    let md = MESSAGES.REVIEW.HEADER(studentNumber, getKSTISO8601());

    md += MESSAGES.REVIEW.CODE_SECTION;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders) {
        const cacheFiles = await vscode.workspace.findFiles('.clab_cache/*.c');

        cacheFiles.sort((a, b) => {
            return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
        });

        for (const uri of cacheFiles) {
            const fileName = uri.path.split(/[/\\]/).pop()!;
            if (fileName === `${taskId}.c`) { continue; }
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            md += `### ${fileName.replace('.c', '')}\n\`\`\`c\n${content}\n\`\`\`\n\n`;
        }
    }

    md += MESSAGES.REVIEW.LOG_SECTION + `\`\`\`text\n`;
    
    // Translate the encoded buffer entries back to full human-readable sentences
    for (const entry of extensionLogBuffer) {
        const msgTemplate = MESSAGES.LOGS[entry.code] as any;
        const displayStr = typeof msgTemplate === 'function' ? msgTemplate(...entry.args) : (msgTemplate || entry.code);
        md += `[${entry.timestamp}] ${displayStr}\n`;
    }

    md += `\n\`\`\`\n`;

    return md;
}
