// src/ui.ts

import * as vscode from 'vscode';
import { MESSAGES } from './utils/messages';

// 1. Status Bar Management
export let labStatusBarItem: vscode.StatusBarItem;
export let navStatusBarItem: vscode.StatusBarItem;
export let nextStatusBarItem: vscode.StatusBarItem;

export function initializeStatusBar(context: vscode.ExtensionContext) {
    labStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    nextStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101); 
    navStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    context.subscriptions.push(labStatusBarItem, navStatusBarItem, nextStatusBarItem);
    updateStatusBar('start');
}
export function updateStatusBar(state: 'start' | 'mid' | 'final' | 'done' | 'deactivated') {
    if (!labStatusBarItem) {return;}

    switch (state) {

        case 'start':

            labStatusBarItem.text = MESSAGES.UI.START_LAB_BTN;
            labStatusBarItem.command = 'c-lab.startLab';
            labStatusBarItem.backgroundColor = undefined;
            labStatusBarItem.show();
            nextStatusBarItem?.hide();
            navStatusBarItem?.hide();

            break;

        case 'mid':
        case 'final':

            // mid submit and navigation remains constant throughout the lab

            labStatusBarItem.text = MESSAGES.UI.MID_SUBMIT_BTN;
            labStatusBarItem.command = 'c-lab.midSubmit';
            labStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            labStatusBarItem.show();

            navStatusBarItem.text = MESSAGES.UI.NAVIGATE_BTN;
            navStatusBarItem.command = 'c-lab.navigateTask';
            navStatusBarItem.show();

            // The Next button morphs into Final Submit on the last task

            nextStatusBarItem.text = state === 'mid' 
                ? MESSAGES.UI.NEXT_TASK_BTN 
                : MESSAGES.UI.FINAL_SUBMIT_BTN;

            nextStatusBarItem.command = state === 'mid' 
                ? 'c-lab.nextTask' 
                : 'c-lab.finalSubmit';

            nextStatusBarItem.backgroundColor = undefined;

            nextStatusBarItem.show();

            break;

        case 'done':

            nextStatusBarItem?.hide();
            navStatusBarItem?.hide();

            labStatusBarItem.text = MESSAGES.UI.END_SESSION_BTN;
            labStatusBarItem.command = 'c-lab.endSession';
            labStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            labStatusBarItem.show();

            break;

        case 'deactivated':

            labStatusBarItem?.hide();
            navStatusBarItem?.hide();
            nextStatusBarItem?.hide();

            break;            
    }
}

// 2. Modals & Input Prompts
export async function promptStudentLogin(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
        prompt: MESSAGES.PROMPTS.STUDENT_ID_PROMPT,
        placeHolder: MESSAGES.PROMPTS.STUDENT_ID_PLACEHOLDER,
        ignoreFocusOut: true,
        validateInput: text => {
            const regex = /^\d{4}-\d{5}$/;
            return regex.test(text) ? null : MESSAGES.PROMPTS.STUDENT_ID_INVALID;
        }
    });
}

export async function promptStudentName(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
        prompt: MESSAGES.PROMPTS.NAME_PROMPT,
        placeHolder: MESSAGES.PROMPTS.NAME_PLACEHOLDER,
        ignoreFocusOut: true
    });
}


export async function promptMidSubmitConfirmation(): Promise<boolean> {
    const confirmation = await vscode.window.showWarningMessage(
        MESSAGES.PROMPTS.CONFIRM_MID_SUBMIT,
        { modal: true },
        MESSAGES.PROMPTS.YES_SUBMIT, MESSAGES.PROMPTS.NO
    );
    return confirmation === MESSAGES.PROMPTS.YES_FINAL_SUBMIT;
}

export async function promptFinalSubmitConfirmation(): Promise<boolean> {
    const confirmation = await vscode.window.showWarningMessage(
        MESSAGES.PROMPTS.CONFIRM_FINAL_SUBMIT,
        { modal: true },
        MESSAGES.PROMPTS.YES_FINAL_SUBMIT, MESSAGES.PROMPTS.NO
    );
    return confirmation === MESSAGES.PROMPTS.YES_FINAL_SUBMIT;
}

// 3. Global Notifications

export function showSuccess(message: string, isModal: boolean = false) {
    if (isModal) {
        vscode.window.showInformationMessage(message, { modal: true });
    } else {
        vscode.window.showInformationMessage(message);
    }
}

export function showError(message: string) {
    vscode.window.showErrorMessage(message);
}
