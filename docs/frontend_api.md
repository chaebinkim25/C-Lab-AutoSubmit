# C-Lab AutoSubmit System: Frontend (VS Code Extension) Specification

## Global Client Architectural Rules

- **Zero-Trust Local Storage & Ephemeral Tokens:** 
  The extension acts as a thin, stateless client. 
  All local source files (`.c`, `.h`) AND the local secret cache folder 
  MUST be securely overwritten with empty bytes and deleted upon any extension deactivation. 
  **Any deactivation event immediately renders the current session token expired.**

- **Task Navigation & Local Caching:** 
  Upon executing `Start Lab`, the extension automatically provisions 
  the skeleton code for the **first task** into `main.c`. 
  It initializes a hidden local directory (e.g., `.clab_cache/`). 
  When the user navigates to a new task, the current `main.c` is saved to this cache. 
  If the user navigates back to a previously attempted task, 
  the extension restores the code from the cache rather than fetching a new skeleton.

- **String Normalization:** 
  All Korean text input via VS Code UI prompts (e.g., Student Name) 
  MUST be normalized to **NFC (Normalization Form Canonical Composition)** 
  before payload construction to prevent cross-platform rendering bugs.

- **Time Synchronization:** 
  The client MUST format all outgoing timestamps in **ISO 8601 KST** 
  (`YYYY-MM-DDTHH:MM:SS+09:00`).

---

## 1. Native VS Code API Integrations

The extension registers the following commands, exposing them to the VS Code Command Palette and dynamically morphing Status Bar UI buttons:

- `c-lab.startLab`: 
  Triggers the authentication flow, calls `POST /api/session/start`, 
  initializes the `.clab_cache` directory, and automatically provisions the first task.
  **UI Morph:** Transforms the main Status Bar button 
  into `c-lab.midSubmit` and reveals the Navigation/Next buttons.

- `c-lab.navigateTask`: 
  Triggered by the task navigation UI button. Opens a QuickPick menu. 
  Saves the active `main.c` to `.clab_cache/` and provisions the selected task.

- `c-lab.nextTask`: 
  Triggered by the Next Task UI button. 
  Saves the active `main.c` to `.clab_cache/` and provisions the next sequential task. 
  **UI Morph:** If navigating to the final task, 
  this button functionally morphs into `c-lab.finalSubmit`.

- `c-lab.midSubmit`: 
  Triggered by the primary Lab Status Bar button during the `mid` and `final` phases.
  Silently bundles ONLY the currently active `main.c` 
  and calls `POST /api/session/submit` (tagged `mid`). 
  **Does not show any confirmation dialog.** Includes a strict 3-second UI debounce 
  and boolean lock to prevent duplicate overlapping network requests.

- `c-lab.finalSubmit`:
  Triggered by the morphed Next Task button on the last assignment.
  Triggers a Korean confirmation dialog. On accept, builds a local Markdown review, 
  submits ONLY the review file as the `final` payload, and opens the review phase.
  Protected by the same 3-second debounce lock as mid-submissions.
  **UI Morph:** Hides navigation buttons 
  and morphs the primary Lab Status Bar button into `c-lab.endSession`.

- `c-lab.endSession`:
  Triggered by the primary Lab Status Bar button during the `done` review phase 
  or via Command Palette in emergencies. 
  Prompts for confirmation if not already completed, 
  transmits a `suspended` or `completed` payload to `/api/session/end`, 
  executes the Zero-Trust wipe, and deactivates the extension UI.

### B. Virtual Text Document Provider (`vscode.workspace.registerTextDocumentContentProvider`)

Used exclusively for Track E (Review Phase) to completely prevent 
the "Do you want to save?" infinite loop bug.

- **URI Scheme:** `clab-review://`

- **Implementation:** 
  The extension generates the amalgamated Markdown review internally at the end of the session,
  dynamically serves it through this provider, and opens it using `vscode.commands.
  executeCommand('markdown.showPreview', uri)`. 
  Because virtual documents are intrinsically read-only, 
  VS Code's dirty-file watchers are bypassed.

---

## 2. Background Trackers & Event Listeners

### A. Diff Tracker (Track A)

Monitors active text editors using `vscode.workspace.onDidChangeTextDocument`.

- **Delta Encoding:** Uses a library (e.g., `diff-match-patch`) to calculate true insertions/deletions rather than copying full text.

- **Aggregation:** Batches deltas into 1-second KST intervals.

- **Queue:** Pushes lightweight patches to a background worker queue that aggregates all telemetry and executes a single `POST /api/track/bulk` at randomized 10–20 second intervals.

- **Baseline Capture (Anchor Points):** Whenever a file is loaded into the editor—whether it is a **fresh skeleton** OR **restored from the local cache** during task navigation—the tracker immediately queues an initial payload with `is_baseline: true` containing the full file text. This is mandatory because all tasks share the same `main.c` file; sending a new baseline on every swap provides a clean chronological anchor for the backend to reconstruct the code history without cross-contamination between tasks.

- **System Operation Bypass:** Utilizes an `isSystemOperation` flag to temporarily suspend tracking during automated file swaps (e.g., navigating tasks or initial loading). To prevent race conditions with VS Code's asynchronous file watcher, automated swaps MUST be applied synchronously to the open editor buffer utilizing `vscode.WorkspaceEdit()` rather than writing directly to the disk. This guarantees system-level changes are fully processed before the tracker is re-armed, completely eliminating false-positive paste violations. The text baseline is explicitly reset after every swap.

### B. Security & Paste Monitor (Track B & File Watcher)

- **Paste Interception:** Monitors `vscode.workspace.onDidChangeTextDocument` for large text insertions. Compares the inserted text against an internal `diffBuffer` (valid cuts/copies from within VS Code).

- **Enforcement:** If an external paste is detected, the action is flagged and permanently recorded in the database, and a warning is displayed to the user. (Native 'undo' is disabled to act as a strict surveillance monitor).

- **System Operation Bypass:** Utilizes an `isSystemOperation` flag to temporarily suspend tracking during automated file swaps (e.g., navigating tasks or initial loading). This prevents false positives caused by VS Code's native auto-formatters triggering `onDidChangeTextDocument`. The text baseline is explicitly reset after every swap.

- **Context Capture:** Extracts the `active_file` name, exact line number, and a 3-5 line surrounding code snippet. Pushes to the global background worker queue for unified bulk transmission.

- **File System Watcher:** Uses `vscode.workspace.createFileSystemWatcher` to log external file creations/deletions. **Crucial:** Contains explicit filtering logic to ignore file modifications triggered by the extension's forced 60-second `files.autoSave` policy to prevent false positives. Always logs exact relative paths, preserving extensions.

### C. Debug Adapter Interceptor (Track C)

Utilizes `vscode.debug.registerDebugAdapterTrackerFactory` targeting the `cppdbg` or `cppvsdbg` types.

- **DAP Interception:** Listens to the JSON-RPC traffic between VS Code and the underlying debugger (GDB/LLDB).

- **Data Extraction:** Parses `setBreakpoints` requests, user navigation actions, and `output` events.

- **Diagnostic Capture:** Upon debug termination, immediately calls `vscode.languages.getDiagnostics()` to capture syntax or compilation errors that caused premature halts.

- **Transmission:** Bundles the `active_file` name, full source snapshot, diagnostics, and DAP data, pushing it to the global background worker queue for unified bulk transmission.

---

## 3. Network Service Layer (Client-to-Server)

The extension utilizes the native `fetch` API for all network requests, centralizing the backend host URL in `src/utils/config.ts` to allow safe and easy environment swapping, with the following characteristics:

- **Authentication Header:** Automatically injects the stored `student_number` and dynamically generated `machine_id` into the body or headers of every `POST` request.

- **Diagnostics Catch-All:** Any unhandled network rejections, HTTP 500s from the server, or JSON parsing errors are caught, formatted with localized stack traces and environment data (OS, WSL status), and pushed to the global queue for `POST /api/track/bulk`.

- **Asynchronous Fallback & Exponential Backoff:** Network submissions implement a robust local retry queue to mitigate thundering herd network spikes. If the backend returns a retryable error (`503 Service Unavailable`, `429 Too Many Requests`, or drops the connection), the client intercepts the failure and attempts delivery utilizing an exponential backoff algorithm (e.g., doubling the delay starting from 2s up to 6 retries) rather than aborting the submission.
---

## 4. Extension Lifecycle & Teardown

Managed via the `deactivate()` hook in `extension.ts`.

### A. Unexpected Deactivation (The "Suspend" Path)

- Triggered if the user closes VS Code or WSL drops before `c-lab.finalSubmit` is explicitly called. **Because tokens expire upon deactivation, this session cannot be resumed.**

1. Immediately constructs a `mid` submission payload from active memory.

2. Dispatches `POST /api/session/submit` (tagged `mid`).

3. Dispatches `POST /api/session/end` (tagged `suspended`).

4. **Closes all active editor tabs** to prevent VS Code from caching and attempting to restore ephemeral virtual documents on the next launch.

5. **Executes Zero-Trust Wipe:** Overwrites all `.c` files in `~/C-Lab-Workspace` with zero bytes and deletes them from disk. Token is discarded and invalidated.

### B. Expected Deactivation (The "Completed" Path)

- Triggered explicitly via the `c-lab.finalSubmit` command.

1. Explicitly invokes `stop()` on the Telemetry Worker to permanently halt the background transmission loop, preventing orphaned ghost events from triggering network errors.

2. Dispatches `POST /api/session/submit` (tagged `final`).

3. Dispatches `POST /api/session/end` (tagged `completed`).

4. **Executes Zero-Trust Wipe:** Overwrites and deletes local source files.

5. If on Windows, executes a child process command (`wsl.exe -t <distro>`) to gracefully shut down the Linux VM in the background.

6. Closes all active editor tabs including the virtual Markdown review document.
