// src/utils/ui.ts
import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

/**
 * Initializes the global Status Bar Item.
 * Must be called during extension activation.
 */
export function initStatusBar(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
}

export function showDormantState() {
    statusBarItem.text = "$(play) C-Lab 실습 시작";
    statusBarItem.tooltip = "클릭하여 학번과 이름을 입력하고 실습 환경을 설정합니다.";
    statusBarItem.command = 'c-lab.startLab';
    statusBarItem.show();
}

export function showMidSubmissionState(currentTaskNum: number, totalTasks: number) {
    // Inject the progress numbers into the text (e.g., "Mid Submission (1/3)")
    statusBarItem.text = `$(arrow-right) 중간 제출 및 다음 문제 (${currentTaskNum}/${totalTasks})`;
    statusBarItem.tooltip = `현재: ${currentTaskNum} | 현재 코드를 제출하고 다음 실습 과제를 불러옵니다.`;
    statusBarItem.command = 'c-lab.midSubmit';
    statusBarItem.show();
}

export function showFinalSubmissionState() {
    statusBarItem.text = "$(rocket) 최종 제출";
    statusBarItem.tooltip = "모든 코드를 최종 제출합니다.";
    statusBarItem.command = 'c-lab.finalSubmit';
    statusBarItem.show();
}

export function showCleanupState() {
    statusBarItem.text = "$(stop) 실습 종료";
    statusBarItem.tooltip = "실습을 종료하고 폴더를 정리합니다.";
    statusBarItem.command = 'c-lab.cleanup';
    statusBarItem.show();
}

export function showUpdatingState(commandId: string) {
    statusBarItem.text = "$(sync) C-Lab 업데이트 필요";
    statusBarItem.tooltip = "새로운 버전이 출시되었습니다. 클릭하여 업데이트를 진행하세요.";
    statusBarItem.command = commandId;
    statusBarItem.show();
}

export function showInstallMissingExtensionState(commandId: string) {
    // Updated text to be very explicit
    statusBarItem.text = "$(warning) C-Lab: C/C++ 익스텐션 설치";
    statusBarItem.tooltip = "클릭해서 C/C++ 익스텐션을 설치하고, VS Code를 다시 로드하세요.";
    statusBarItem.command = commandId;
    statusBarItem.show();
}

export function hideStatusBar() {
    statusBarItem.hide();
}

// --- NOTIFICATIONS (INFO) ---
export function notifyInitializing() {
    vscode.window.showInformationMessage("C-Lab: Initializing secure environment...");
}

export function notifyPreparingWorkspace() {
    vscode.window.showInformationMessage("C-Lab: Preparing secure lab environment...");
}

export function notifyAuthenticating(studentName: string, studentNumber: string) {
    vscode.window.showInformationMessage(`Authenticating ${studentName} (${studentNumber})...`);
}

export function notifySessionStarted(taskTitle: string) {
    vscode.window.showInformationMessage(`Session started successfully! Task: ${taskTitle}`);
}

export function notifyCapturingSnapshot() {
    vscode.window.showInformationMessage("Capturing workspace snapshot and submitting...");
}

export function notifyCapturingFinal() {
    vscode.window.showInformationMessage("Capturing final snapshot and securing workspace...");
}

export function notifyGeneratingReview() {
    vscode.window.showInformationMessage("Generating your lab review...");
}

export function notifyCleanup() {
    vscode.window.showInformationMessage("C-Lab: Ending session and cleaning up workspace...");
}

// --- NOTIFICATIONS (WARNINGS) ---
export function notifySessionAlreadyActive() {
    vscode.window.showWarningMessage("C-Lab: A session is already active. Please submit or end it first.");
}

export function notifySessionNotActive() {
    vscode.window.showWarningMessage("C-Lab: A session is not active. Please start or end it first.");
}

export function notifyInitCancelled() {
    vscode.window.showWarningMessage("C-Lab session initialization cancelled.");
}

export function notifyUntrustedWorkspace() {
    vscode.window.showWarningMessage("C-Lab no folder is open or it's untrusted.");
}

export function notifyMissingCredentials() {
    vscode.window.showWarningMessage("C-Lab: error - name and id is not registered.");
}

export function notifyMissingWorkspace() {
    vscode.window.showWarningMessage("C-Lab: error - no active workspace.");
}

// --- NOTIFICATIONS (ERRORS) ---
export function notifyInitFailed(errorMessage: string) {
    vscode.window.showErrorMessage(`C-Lab: Initialization failed. ${errorMessage || "Ensure WSL is installed."}`);
}

export function notifyConnectionFailed() {
    vscode.window.showErrorMessage("C-Lab: Failed to connect to the server. Please check your network.");
}

export function notifyNoTasksFound() {
    vscode.window.showErrorMessage("C-Lab: No tasks found for today's session.");
}

export function notifySubmissionFailed() {
    vscode.window.showErrorMessage("C-Lab: Submission failed. Please check your network and try again.");
}

export function notifyFinalSubmissionFailed() {
    vscode.window.showErrorMessage("C-Lab: Final submission failed. Please check your network.");
}

export function notifyReviewGenerationFailed() {
    vscode.window.showErrorMessage("C-Lab: Could not generate review document.");
}

export function promptInstallCppExtension(installAction: string, reloadAction: string) {
    return vscode.window.showWarningMessage(
        "C-Lab requires the Microsoft C/C++ extension. Install it, wait for it to finish, then click Reload.",
        installAction,
        reloadAction
    );
}

export function promptReloadAfterInstall(reloadAction: string) {
    return vscode.window.showInformationMessage(
        "Once the installation is completely finished, click Reload to start C-Lab.",
        reloadAction
    );
}

export function notifyCppExtensionActivationFailed() {
    vscode.window.showErrorMessage("Failed to activate the required C/C++ extension.");
}

export function notifyVersionCheckFailed() {
    vscode.window.showErrorMessage("C-Lab: Cannot verify version due to network failure. Startup blocked.");
}

export function notifyUpdateRequired() {
    vscode.window.showWarningMessage("C-Lab: Extension is outdated. Please click the status bar to update.");
}
