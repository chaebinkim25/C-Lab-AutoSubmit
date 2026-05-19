// src/commands/taskHelpers.ts

import * as vscode from 'vscode';
import { updateStatusBar } from '../ui';
import { globalSecurityTracker, globalDiffTracker } from './startLab';
import { logEvent } from '../extension';

export async function performTaskSwitch(
    context: vscode.ExtensionContext, 
    targetTask: any, 
    tasks: any[]
) {
    const currentTaskId = context.workspaceState.get<string>('currentTaskId');
    
    // Prevent unnecessary work if they select the task they are already on
    if (currentTaskId && currentTaskId === targetTask.task_id) { return; }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const rootPath = workspaceFolders[0].uri;

    // 1. Pause tracking during automated file swaps
    if (globalSecurityTracker) { globalSecurityTracker.isSystemOperation = true; }
    if (globalDiffTracker) { globalDiffTracker.isSystemOperation = true; }

    // 2. Save current main.c to cache
    if (currentTaskId) {
        
        await vscode.workspace.saveAll();

        const mainUri = vscode.Uri.joinPath(rootPath, 'main.c');
        const cacheUri = vscode.Uri.joinPath(rootPath, '.clab_cache', `${currentTaskId}.c`);
        try {
            const content = await vscode.workspace.fs.readFile(mainUri);
            await vscode.workspace.fs.writeFile(cacheUri, content);
        } catch (e) {
            logEvent('TASK_CACHE_FAIL', currentTaskId);
        }
    }

    // 3. Restore target task from cache or provision new skeleton
    const newTaskId = targetTask.task_id;
    const targetCacheUri = vscode.Uri.joinPath(rootPath, '.clab_cache', `${newTaskId}.c`);
    const targetMainUri = vscode.Uri.joinPath(rootPath, 'main.c');

    let newContent = "";
    try {
        const cachedBytes = await vscode.workspace.fs.readFile(targetCacheUri);
        newContent = Buffer.from(cachedBytes).toString('utf8');
        logEvent('TASK_RESTORE', newTaskId);
    } catch (e) {
        newContent = targetTask.skeleton_code;
        logEvent('TASK_PROVISION', newTaskId);
    }

    // Ensure file exists on disk so openTextDocument doesn't crash on initial lab start
    const createEdit = new vscode.WorkspaceEdit();
    createEdit.createFile(targetMainUri, { ignoreIfExists: true });
    await vscode.workspace.applyEdit(createEdit);

    // 4. Update the editor buffer synchronously using WorkspaceEdit
    const doc = await vscode.workspace.openTextDocument(targetMainUri);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    edit.replace(targetMainUri, fullRange, newContent);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    
    // 5. Update State & UI    
    await context.workspaceState.update('currentTaskId', newTaskId);

    if (newTaskId === tasks[tasks.length - 1].task_id) {
        updateStatusBar('final');
    } else {
        updateStatusBar('mid');
    }

    await vscode.window.showTextDocument(doc);

    // Wait for VS Code to flush pending asynchronous document changes
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 6. Anchor the DB Baseline and re-enable tracking
    
    if (globalDiffTracker) { 
        globalDiffTracker.setBaseline(targetMainUri, doc.getText()); 
        globalDiffTracker.isSystemOperation = false;
    }
    if (globalSecurityTracker) { 
        globalSecurityTracker.setBaseline(targetMainUri, doc.getText()); 
        globalSecurityTracker.isSystemOperation = false; 
    }
}

