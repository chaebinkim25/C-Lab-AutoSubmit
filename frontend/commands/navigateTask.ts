// src/commands/navigateTask.ts

import * as vscode from 'vscode';
import { performTaskSwitch } from './taskHelpers';
import { MESSAGES } from '../utils/messages';

export async function navigateTaskCommand(context: vscode.ExtensionContext) {
    const tasks: any[] = context.workspaceState.get('labTasks') || [];
    if (tasks.length === 0) {return;}

    const currentTaskId = context.workspaceState.get<string>('currentTaskId');

    const items = tasks.map(t => ({
        label: t.title,
        description: t.task_id === currentTaskId ? MESSAGES.UI.CURRENT_TASK : "",
        task: t
    }));
    const selected = await vscode.window.showQuickPick(items, { placeHolder: MESSAGES.UI.SELECT_TASK });
    if (!selected) { return; }

    await performTaskSwitch(context,selected.task, tasks);
}
