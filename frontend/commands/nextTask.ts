// src/commands/nextTask.ts

import * as vscode from 'vscode';
import { performTaskSwitch } from './taskHelpers';

export async function nextTaskCommand(context: vscode.ExtensionContext) {
    const tasks: any[] = context.workspaceState.get('labTasks') || [];
    if (tasks.length === 0) { return; }

    const currentTaskId = context.workspaceState.get<string>('currentTaskId');
    if (!currentTaskId) { return; }

    const currentIndex = tasks.findIndex(t => t.task_id === currentTaskId);
    if (currentIndex === -1 || currentIndex >= tasks.length - 1) {
        // Already at the last task; the button morphs before this is clickable, 
        // but this acts as a safe fallback.
        return; 
    }

    const nextTask = tasks[currentIndex + 1];

    await performTaskSwitch(context, nextTask, tasks);
}
