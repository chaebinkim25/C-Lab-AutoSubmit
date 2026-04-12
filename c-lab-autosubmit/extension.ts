// src/extension.ts
import * as vscode from 'vscode';
import { getMachineId } from './utils/machineId';
import { checkLabTime, startSession, fetchLabTasks, sendBaseline, sendSubmission, fetchLabSubmissions } from './utils/api';
import { enforceVersionCheck } from './utils/update';
import { validateCppTools, getOSPlatform } from './utils/environment';
import { promptForCredentials, StudentCredentials } from './utils/auth';
import { verifyWorkspace, enforcePolicies, writeAndOpenSkeleton, captureWorkspaceSnapshot, wipeAndDeleteFile, prepareDefaultWorkspace, cleanupWorkspace } from './utils/workspace';
import { registerDiffTracker } from './tracking/diffTracker';
import { registerDebugTracker } from './tracking/debugTracker';
import { registerPolicyWatchdog } from './tracking/policyTracker';
import { registerFileWatcher } from './tracking/fileTracker';
import { 
    initStatusBar, showDormantState, showMidSubmissionState, showFinalSubmissionState, showCleanupState, hideStatusBar,
    notifyInitializing, notifyPreparingWorkspace, notifyAuthenticating, notifySessionStarted, notifyCapturingSnapshot, notifyCapturingFinal, notifyGeneratingReview, notifyCleanup,
    notifySessionAlreadyActive, notifySessionNotActive, notifyInitCancelled, notifyUntrustedWorkspace, notifyMissingCredentials, notifyMissingWorkspace,
    notifyInitFailed, notifyConnectionFailed, notifyNoTasksFound, notifySubmissionFailed, notifyFinalSubmissionFailed, notifyReviewGenerationFailed
} from './utils/ui';
// Variable to track tasks (so we can access them in the Mid Submission phase later)
export let sessionTasks: any[] = [];
export let currentTaskIndex = 0;

// --- Session state ---
export type SessionStatus = 'DORMANT' | 'ACTIVE' | 'REVIEW';
export let currentSessionStatus: SessionStatus = 'DORMANT';

let activeCredentials: StudentCredentials | undefined;
let activeMachineId: string = "";
let activeWorkspaceUri: vscode.Uri | undefined;
let sessionDisposables: vscode.Disposable[] = [];

// Key to the global variables
const STARTUP_STATE_KEY = 'c_lab_startup_phase';

// Deactivation guards
let extensionContext: vscode.ExtensionContext | undefined;
let isIntentionalWorkspaceReload = false;

export async function activate(context: vscode.ExtensionContext) {
    
    console.log('[C-Lab] Extension activated. Checking schedule...');

    // Save the context for the deactivate() cleanup routine
    extensionContext = context;

    // --- LEGACY CLEANUP ---
    // Remove old, insecure keys from previous extension versions
    await context.globalState.update('c_lab_class_schedule', undefined);
    await context.globalState.update('c_lab_auto_start_pending', undefined);
   
	// 1. Lab Time Validation
    const serverStatus = await checkLabTime();

    if (!serverStatus.isLabTime) {
        console.log('[C-Lab] Outside of scheduled lab hours. Extension will remain dormant.');
        return; // Exit early: no UI elements rendered, no tracking started.
    }

    // --- UI SETUP ---
    initStatusBar(context);

	// 2. Auto-Update Check
    console.log('[C-Lab] Valid lab time confirmed. Checking version...');
    const isUpToDate = await enforceVersionCheck(context, serverStatus.requiredVersion);
    if (!isUpToDate) {
        // Halt initialization. The UI now shows "Updating..." and waits for the 
        // VS Code auto-update process to restart the extension.
        return; // UI is showing "Updating...", wait for restart.
    }

	// 3. Dependency Validation
    console.log('[C-Lab] Version is current. Validating dependencies...');
    const hasDependencies = await validateCppTools(context);
    if (!hasDependencies) {
        return; // Missing cpptools. User prompted to install it.
    }

    console.log('[C-Lab] All checks passed. Initializing environment.');

    // 4. Retrieve System & Hardware Identifiers
    activeMachineId = getMachineId(context);

    const osPlatform = getOSPlatform();

    console.log('[C-Lab] System Info:', { os: osPlatform });
    
    // 5. Register Commands

	// --- START LAB COMMAND ---   
    let startLabCmd = vscode.commands.registerCommand('c-lab.startLab', async () => {

        // SANITY CHECK: Prevent starting a session if one is already running
        if (currentSessionStatus !== 'DORMANT') {
            notifySessionAlreadyActive();
            return;
        }

        // 1. Determine the default workspace path (e.g., a "C-Lab" folder in their home directory)
        let targetUri: vscode.Uri;
        try {
            notifyInitializing();
            // Let the workspace utility handle the heavy OS/WSL lifting
            targetUri = await prepareDefaultWorkspace();
        } catch (error: any) {
            notifyInitFailed(error.message);
            return;
        }

        // 2. Are we already in the correct folder? 
        const currentFolders = vscode.workspace.workspaceFolders;
        const isAlreadyInDefault = currentFolders && currentFolders.length > 0 && currentFolders[0].uri.fsPath === targetUri.fsPath;

        if (isAlreadyInDefault) {
            // We are already here! Skip the reload and go straight to init.
            vscode.commands.executeCommand('c-lab.executeInit');
        } else {
            // 3. Set the global state so the extension remembers what to do after it wakes back up
            isIntentionalWorkspaceReload = true;
            await context.globalState.update(STARTUP_STATE_KEY, 'opening-default-workspace');
            
            notifyPreparingWorkspace();

            // 4. Eject current workspace and load the default (Triggers the 1 window reload)
            // The 'false' parameter means "replace current window", not "open in new window"
            vscode.commands.executeCommand('vscode.openFolder', targetUri, false);
        }
    });

	// --- EXECUTE INITIALIZATION FOR START LAB COMMAND ---   
    let executeInitCmd = vscode.commands.registerCommand('c-lab.executeInit', async () => {

        // 1. Authenticate Student
        activeCredentials = await promptForCredentials();
        if (!activeCredentials) {
            notifyInitCancelled();
            showDormantState();
            return; // Exit if they hit Escape
        }

		// 2. Validate Workspace environment
        activeWorkspaceUri = await verifyWorkspace();
        if (!activeWorkspaceUri) {
            // Flow stops here if no folder is open or if it's untrusted.
            notifyUntrustedWorkspace();
            showDormantState();
            return; 
        }

        notifyAuthenticating(activeCredentials.studentName, activeCredentials.studentNumber);
        
        // 3. Enforce Core Policies
        await enforcePolicies();
        
		// 4. Register Session with Backend
        const sessionStarted = await startSession({
            student_number: activeCredentials.studentNumber,
            student_name: activeCredentials.studentName,
            machine_id: activeMachineId,
            os_platform: osPlatform
        });

        if (!sessionStarted) {
            notifyConnectionFailed();
            showDormantState();
            return;
        }

		// 5. Fetch Tasks and Write First Skeleton
        sessionTasks = await fetchLabTasks(activeCredentials.studentNumber);
        if (sessionTasks.length === 0) {
            notifyNoTasksFound();
            return;
        }

        const firstTask = sessionTasks[0];
        const filename = `${firstTask.task_id}.c`;
        
        await writeAndOpenSkeleton(activeWorkspaceUri, filename, firstTask.skeleton_code);
		await sendBaseline(activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId, filename, firstTask.skeleton_code);

		// 6. Now that the baseline is set, we start listeners
		
		// Start listening to keystrokes.
		const diffDisposable = registerDiffTracker(context, activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId);
        if (diffDisposable) {sessionDisposables.push(diffDisposable);}

		// Start listening to the debugger
        const debugDisposable = registerDebugTracker(context, activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId); 
        if (debugDisposable) {sessionDisposables.push(debugDisposable);}

        // Start the security watchdog
        const watchdogDisposable = registerPolicyWatchdog(activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId);
        sessionDisposables.push(watchdogDisposable);

        // Start the File System Watcher
        const fileWatcherDisposable = registerFileWatcher(activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId, activeWorkspaceUri);
        sessionDisposables.push(fileWatcherDisposable);

        // 7. update global status variable and UI

        currentSessionStatus = 'ACTIVE'; 

        if (sessionTasks.length > 1) {
            showMidSubmissionState(currentTaskIndex + 1, sessionTasks.length);
        } else {
            showFinalSubmissionState();
        }

        notifySessionStarted(firstTask.title);
    });

	// --- MID SUBMISSION COMMAND ---
    let midSubmitCmd = vscode.commands.registerCommand('c-lab.midSubmit', async () => {
        // SANITY CHECK
        if (currentSessionStatus !== 'ACTIVE') {
            notifySessionNotActive();
            return;
        }

        if (!activeCredentials) {
            notifyMissingCredentials();
            return;
        }

        if (!activeWorkspaceUri) {
            notifyMissingWorkspace();
            return;
        }

        notifyCapturingSnapshot();
        const currentTask = sessionTasks[currentTaskIndex];

        // 1. Capture Data
        const { sourceFiles, vscodeConfigs } = await captureWorkspaceSnapshot();

        // 2. Transmit to Backend
        const success = await sendSubmission({
            student_number: activeCredentials.studentNumber,
            student_name: activeCredentials.studentName,
            machine_id: activeMachineId,
            submission_type: 'mid',
            task_id: currentTask.task_id,
            source_files_snapshot: sourceFiles,
            vscode_config_snapshot: vscodeConfigs
        });

        if (!success) {
            vscode.window.showErrorMessage("C-Lab: Submission failed. Please check your network and try again.");
            return;
        }

        // 3. Clear the active editors (Closes the current C file to clear the workspace)
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // 4. Load the Next Skeleton Code
        currentTaskIndex++;
        const nextTask = sessionTasks[currentTaskIndex];
        const filename = `${nextTask.task_id}.c`;

        await writeAndOpenSkeleton(activeWorkspaceUri, filename, nextTask.skeleton_code);
        await sendBaseline(activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId, filename, nextTask.skeleton_code);

        // 5. Update UI State
        if (currentTaskIndex === sessionTasks.length - 1) {
            showFinalSubmissionState();
        } else {
            showMidSubmissionState(currentTaskIndex + 1, sessionTasks.length);
        }
    });

    // --- FINAL SUBMISSION COMMAND ---
    let finalSubmitCmd = vscode.commands.registerCommand('c-lab.finalSubmit', async () => {
        // SANITY CHECK
        if (currentSessionStatus !== 'ACTIVE') {
            notifySessionNotActive();
            return;
        }

        if (!activeCredentials) {
            notifyMissingCredentials();
            return;
        }

        if (!activeWorkspaceUri) {
            vscode.window.showWarningMessage("C-Lab: error - no active workspace.");
            return;
        }

        const currentTask = sessionTasks[currentTaskIndex];
        const filename = `${currentTask.task_id}.c`;
        const fileUri = vscode.Uri.joinPath(activeWorkspaceUri, filename);

        notifyCapturingFinal();

        // 1. Capture & Transmit Final Code
        const { sourceFiles, vscodeConfigs } = await captureWorkspaceSnapshot();
        const success = await sendSubmission({
            student_number: activeCredentials.studentNumber,
            student_name: activeCredentials.studentName,
            machine_id: activeMachineId,
            submission_type: 'final',
            task_id: currentTask.task_id,
            source_files_snapshot: sourceFiles,
            vscode_config_snapshot: vscodeConfigs
        });

        if (!success) {
            notifyFinalSubmissionFailed();
            return;
        }

        // 2. Enforce Core Policy #3: Wipe & Delete
        await wipeAndDeleteFile(fileUri);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // 3. Fetch & Display the Review Markdown
        vscode.window.showInformationMessage("Generating your lab review...");
        const markdownContent = await fetchLabSubmissions(activeCredentials.studentNumber, activeCredentials.studentName, activeMachineId);

        if (markdownContent) {
            // Create a virtual "untitled" document to hold the markdown
            const mdUri = vscode.Uri.parse('untitled:Lab_Review.md');
            const doc = await vscode.workspace.openTextDocument(mdUri);
            
            // Insert the fetched markdown content
            const edit = new vscode.WorkspaceEdit();
            edit.insert(mdUri, new vscode.Position(0, 0), markdownContent);
            await vscode.workspace.applyEdit(edit);
            
            // Open it, trigger the native VS Code markdown preview, then close the raw text tab
            await vscode.window.showTextDocument(doc);
            await vscode.commands.executeCommand('markdown.showPreview', mdUri);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } else {
            notifyReviewGenerationFailed();
        }

        // 4. Update UI State for the Final Cleanup Phase
        showCleanupState();

        // 5. Dispose session trackers
        console.log('[C-Lab] Disposing of session trackers...');
        sessionDisposables.forEach(d => d.dispose());
        sessionDisposables = []; // Clear the array for the next student

        // UPDATE STATE: Move to the review phase
        currentSessionStatus = 'REVIEW';
    });

    // --- CLEANUP COMMAND ---
    let cleanupCmd = vscode.commands.registerCommand('c-lab.cleanup', async () => {
        notifyCleanup();

        // 1. Hide the Extension UI
        hideStatusBar();

        // 2. Reset global memory state (Local State Machine)
        activeCredentials = undefined;
        activeWorkspaceUri = undefined;
        sessionTasks = [];
        currentTaskIndex = 0;
        currentSessionStatus = 'DORMANT';

        // 3. Dispose session trackers (Kill background loops)
        console.log('[C-Lab] Disposing of session trackers...');
        sessionDisposables.forEach(d => d.dispose());
        sessionDisposables = []; 

        // 4. Delegate physical environment destruction to the workspace utility
        await cleanupWorkspace();
    });

    console.log('[C-Lab] Commands are registered');

    // 6. UI Setup
    
    // Push them all to context immediately so they exist no matter what happens next
    context.subscriptions.push(startLabCmd, executeInitCmd, midSubmitCmd, finalSubmitCmd, cleanupCmd);

    console.log('[C-Lab] all subscriptions are pushed');


    // Check if we just woke up from a forced workspace reload
    const startupPhase = context.globalState.get<string>(STARTUP_STATE_KEY);
 
    console.log('[C-Lab] starting up... ', {startupPhase: startupPhase});

    if (startupPhase === 'opening-default-workspace') {
        console.log('[C-Lab] Resuming initialization after workspace reload.');
        
        // 1. Clear the state so it doesn't loop infinitely on future manual reloads
        await context.globalState.update(STARTUP_STATE_KEY, undefined);
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            console.warn('[C-Lab] Workspace reload failed. Aborting auto-init.');
            
            // Fallback to dormant state immediately
            showDormantState();
            return;
        }
        
        // 2. Wait a brief moment for the VS Code UI to settle, then fire the init logic
        setTimeout(() => {
            vscode.commands.executeCommand('c-lab.executeInit');
        }, 1000); 

        // executeInit will reveal submission buttion in the status bar. 
        return;
        
    } else {
        // Normal dormant state: Just show the Start button
        showDormantState();
    }
}

export async function deactivate() {
    console.log('[C-Lab] Extension deactivation triggered.');

    // If the window is closing, but we didn't explicitly tell it to reload for the workspace...
    if (!isIntentionalWorkspaceReload && extensionContext) {
        console.log('[C-Lab] Unplanned deactivation detected. Scrubbing startup state...');
        
        // Wipe the startup key so the next boot is completely clean
        await extensionContext.globalState.update(STARTUP_STATE_KEY, undefined);
    } else if (isIntentionalWorkspaceReload) {
        console.log('[C-Lab] Intentional workspace reload detected. Preserving state.');

        isIntentionalWorkspaceReload = false;
    }

    console.log('[C-Lab] Extension deactivated safely.');
}
