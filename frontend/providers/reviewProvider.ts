// src/providers/reviewProvider.ts

import * as vscode from 'vscode';
import { MESSAGES } from '../utils/messages';
import { logEvent } from '../utils/logging';

export let globalReviewProvider: ReviewContentProvider | null = null;

export function globalReviewProviderInit(context: vscode.ExtensionContext) {
    globalReviewProvider = new ReviewContentProvider();
    const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
        'clab-review',
        globalReviewProvider
    );
    context.subscriptions.push(providerRegistration);
}

export class ReviewContentProvider implements vscode.TextDocumentContentProvider {
    // Event emitter required by VS Code to signal when a virtual document's content changes
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    // In-memory cache mapping URIs to their source code strings
    private reviewCache: Map<string, string> = new Map();

    constructor() {}

    /**
     * VS Code calls this automatically when vscode.workspace.openTextDocument(uri)
     * is called with a 'clab-review://' scheme.
     */
    provideTextDocumentContent(uri: vscode.Uri): string {
        const content = this.reviewCache.get(uri.toString());
        if (content !== undefined) {
            return content;
        }
        logEvent('PROV_NO_CONTENT', uri.toString());

        return MESSAGES.REVIEW.CONTENT_NOT_FOUND;
    }

    /**
     * Helper method to populate the cache before opening the document
     */
    public setContent(uri: vscode.Uri, content: string) {
        this.reviewCache.set(uri.toString(), content);

        // Notify VS Code that the content for this URI has been updated
        this.onDidChangeEmitter.fire(uri);
    }

    /**
     * Clears the cache when the lab session ends to free memory
     */
    public clearCache() {
        this.reviewCache.clear();
    }
}
