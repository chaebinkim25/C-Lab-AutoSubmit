// src/trackers/diffTracker.ts

import * as vscode from 'vscode';
import { diff_match_patch } from 'diff-match-patch';
import { logEvent } from '../extension';

export class DiffTracker {
    private dmp = new diff_match_patch();
    private lastKnownText: Map<string, string> = new Map();
    private dirtyFiles: Set<string> = new Set();
    private patchQueue: any[] = [];
    private aggregationInterval: NodeJS.Timeout | null = null;
    public isSystemOperation: boolean = false;
    private isActive: boolean = true;
    private sessionStartTime: number = 0;

    constructor() {}

    private getElapsedSeconds(): number {
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }
    
    public start(context: vscode.ExtensionContext) {
        this.sessionStartTime = Date.now();

        // 1. Hook the text document change event
        const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
            this.onDidChangeTextDocument(e);
        });
        context.subscriptions.push(changeDisposable);

        // 2. Set up the 1-second aggregation loop (Core Policy Track A)
        this.aggregationInterval = setInterval(() => {
            this.aggregateDiffs();
        }, 1000);

        context.subscriptions.push({
            dispose: () => {
                if (this.aggregationInterval) {clearInterval(this.aggregationInterval);}
            }
        });

        logEvent('TRK_DIFF_ACTIVE');
    }

    public stop() {
        this.isActive = false;
        if (this.aggregationInterval) {
            clearInterval(this.aggregationInterval);
            this.aggregationInterval = null;
        }
        logEvent('TRK_DIFF_DEACTIVATED');
    }

    public setBaseline(documentUri: vscode.Uri, text: string) {
        // 1. Update the local memory map to prevent false delta patches
        this.lastKnownText.set(documentUri.fsPath, text);

        // 2. Queue the full text as an absolute baseline anchor for the server
        const relativePath = vscode.workspace.asRelativePath(documentUri).normalize('NFC');
            this.patchQueue.push({
            elapsed_seconds: this.getElapsedSeconds(),
            file_path: relativePath,
            is_baseline: true,
            delta_patch: text
        });
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {

        if (!this.isActive) { return; }

        // Bypass tracking if the extension itself is swapping the file
        if (this.isSystemOperation) {
            // Keep the baseline synchronized so it doesn't trigger when tracking resumes
            this.lastKnownText.set(event.document.uri.fsPath, event.document.getText());
            return;
        }
        
        const document = event.document;

        // Only track physical files on the disk (ignore Output panels, Git UI, etc.)
        if (document.uri.scheme !== 'file') {return;}

        // Flag the file as modified for the next 1-second sweep
        this.dirtyFiles.add(document.uri.fsPath);
    }

    private aggregateDiffs() {
        if (this.dirtyFiles.size === 0) {return;}

        const elapsedSeconds = this.getElapsedSeconds();

        for (const filePath of this.dirtyFiles) {
            // Find the active document in the workspace
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
            if (!document) {continue;}

            const currentText = document.getText();
            const previousText = this.lastKnownText.get(filePath) || "";

            if (currentText !== previousText) {
                // Calculate the true delta patch
                const diffs = this.dmp.diff_main(previousText, currentText);
                this.dmp.diff_cleanupSemantic(diffs);
                const patches = this.dmp.patch_make(previousText, currentText, diffs);
                const patchText = this.dmp.patch_toText(patches);

                if (patchText) {
                    // Enforce Core Policy #7: Preserve exact relative path
                    const relativePath = vscode.workspace.asRelativePath(filePath).normalize('NFC');

                    this.patchQueue.push({
                        elapsed_seconds: elapsedSeconds,
                        file_path: relativePath,
                        is_baseline: false,
                        delta_patch: patchText
                    });
                }
            }

            // Update baseline to the new text for the next second's comparison
            this.lastKnownText.set(filePath, currentText);
        }

        // Clear the dirty flags
        this.dirtyFiles.clear();
    }

    public getPendingPatches() {
        // Safely extract and clear the queue for the transmission worker (built later)
        const patches = [...this.patchQueue];
        this.patchQueue = [];
        return patches;
    }


    public requeuePatches(patches: any[]) {
        this.patchQueue.unshift(...patches);
    }
}
