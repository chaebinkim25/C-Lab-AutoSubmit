# C-Lab AutoSubmit - Development To-Do List

## Phase 1: Project Setup & Architecture
- [x] **Initialize Backend Repository**
  - [x] Set up Python environment.
  - [x] Install FastAPI, Uvicorn, and SQLite dependencies.
  - [x] Define the SQLite schema (Write-Ahead Logging mode) for: Sessions, Diff Logs, Paste Violations, Debug Logs, and Submissions.
- [x] **Initialize VS Code Extension Repository**
  - [x] Generate extension scaffolding using `yo code` (TypeScript).
  - [x] Configure `package.json` for extension activation events (`onStartupFinished`) and command registrations (`c-lab.startLab`, `c-lab.midSubmit`, `c-lab.finalSubmit`, `c-lab.cleanup`).
  - [x] Setup Webpack/esbuild for extension bundling.

## Phase 2: Session Initialization & Time Sync (Workflows A & B)
- [x] **Backend: Foundation APIs**
  - [x] Implement `GET /api/check-time` (logic to check against schedule).
  - [x] Implement `GET /api/lab/tasks` (serve skeleton codes).
  - [x] Implement `POST /api/session/start` (register session and provision SQLite shard).
- [x] **Extension: Activation & Environment Checks**
  - [x] Implement local `machine_id` generation and storage logic.
  - [x] Create time-sync check against `/api/check-time` on startup.
  - [x] Implement auto-update check/wait logic.
  - [x] Validate OS platform and `cpptools` dependency.
- [x] **Extension: The "Start Lab" Flow**
  - [x] Build the UI status bar button ("start lab" state).
  - [x] Implement user prompts (`InputBox`) for Student ID and Name.
  - [x] Ensure workspace is trusted and the correct folder is open.
  - [x] Override workspace setting: force `files.autoSave` with a 1-second delay.
  - [x] Download first skeleton code, write to disk, and send baseline back to server.

## Phase 3: The Tracking Engine (Tracks A, B, & C)
- [x] **Backend: Tracking APIs**
  - [x] Implement `POST /api/track/diff` to receive code diffs.
  - [x] Implement `POST /api/track/debug-log` to receive debug telemetry.
  - [x] Implement endpoint to log paste violations (can be part of diff or a separate endpoint).
- [x] **Extension: Diff & Paste Tracking (Tracks A & B)**
  - [x] Implement `vscode.workspace.onDidChangeTextDocument` listener.
  - [x] Aggregate changes into 1-second interval payloads.
  - [x] Create background worker to send payloads at randomized 10-20s intervals.
  - [x] Implement Paste Detection logic (distinguish external pastes from internal/whitespace).
  - [x] Implement auto-undo for unauthorized pastes and transmit violation log.
- [x] **Extension: Debug Tracker (Track C)**
  - [x] Register `DebugAdapterTracker` for the C/C++ debugger.
  - [x] Intercept snapshot, breakpoints, navigation commands, and variable inspection.
  - [x] Aggregate and transmit payload upon debug session termination.

## Phase 4: Submissions & Teardown (Tracks D, E, & F)
- [x] **Backend: Submission APIs**
  - [x] Implement `POST /api/session/submit` (handle mid/final code + `.vscode` configs).
  - [x] Implement `GET /api/lab/submissions` (generate and return amalgamated markdown).
- [x] **Extension: Mid-Submission (Track D)**
  - [x] Bind "mid submission" button logic.
  - [x] Send current source files and `.vscode` configs to backend.
  - [x] Clear editor, download next skeleton, and establish new baseline.
- [x] **Extension: Final Submission & Review (Track E)**
  - [x] Bind `c-lab.finalSubmit` to button and Command Palette.
  - [x] Send final payload to backend.
  - [x] **Security Wipe:** Overwrite active source files with `""`, then delete local files.
  - [x] Close all active editors.
  - [x] Fetch amalgamated markdown from `/api/lab/submissions` and display in read-only tab.
  - [x] Update UI button to "end session".
- [x] **Extension: Cleanup (Track F)**
  - [x] Bind "end session" button logic.
  - [x] Delete the read-only markdown file.
  - [x] Close all editors and the workspace folder.
  - [x] Hide extension UI.

## Phase 5: Testing & Quality Assurance
- [x] **Unit Testing: Backend Endpoints (`main.py`)**
  - [x] `track_diff`: Verify DB shard routing and `machine_id` rejection logic.
  - [x] `track_debug_log`: Verify complex JSON payload serialization for SQLite.
  - [x] `track_paste_violation`: Ensure separate table insertion works securely.
  - [x] `submit_session`: Test both 'mid' and 'final' state insertions.
  - [x] `get_lab_submissions`: Validate the Markdown generation loop and formatting.
- [x] **Unit Testing: Extension Network Utils (`src/utils/api.ts`)**
  - [x] `checkLabTime`, `fetchLabTasks`, `fetchLabSubmissions`: Test GET logic and query params.
  - [x] `startSession`, `sendBaseline`, `sendDiff`: Test POST payload formatting.
  - [x] `logPasteViolation`, `sendDebugTelemetry`, `sendSubmission`: Test error handling and response parsing.
- [x] **Unit Testing: Extension Core Utils (`src/utils/`)**
  - [x] `auth.ts -> promptForCredentials`: Test regex validation (empty strings, non-digits for student ID) and cancellation.
  - [x] `environment.ts -> getOSPlatform`, `validateCppTools`: Mock VS Code extension registry to test missing dependency prompts.
  - [x] `machineId.ts -> getMachineId`: Test UUID generation and retrieval from `globalState`.
  - [x] `update.ts -> enforceVersionCheck`: Test UI blocking and status bar generation on version mismatch.
  - [x] `workspace.ts`: Test `verifyWorkspace`, `enforceAutoSave` (settings override), `writeAndOpenSkeleton`, `captureWorkspaceSnapshot` (file crawling), and `wipeAndDeleteFile` (buffer overwriting).
- [x] **Unit Testing: The Tracking Engine (`src/tracking/`)**
  - [x] `diffTracker.ts -> registerDiffTracker`: Mock keystrokes to test the 1-second interval aggregation and the anti-cheat Paste Heuristic (pure whitespace vs. external snippets).
  - [x] `diffTracker.ts -> processQueueWorker`: Simulate network failures to test the queue re-insertion (retry) logic.
  - [x] `debugTracker.ts -> registerDebugTracker`: Mock DAP messages to ensure `evaluate` requests map correctly to their asynchronous responses.
- [x] **Integration & E2E Testing**
  - [x] Simulate a full student workflow: Start Lab -> Type Code -> Copy/Paste Violation -> Mid Submit -> Debug Error -> Final Submit -> End Session.
  - [x] Verify the extension cleanly detaches and restores VS Code to its default state after `c-lab.cleanup`.
  - [x] Test end-to-end flow from `/api/session/start` to `/api/session/submit`.
  - [x] Verify SQLite shard creation and data integrity on the backend.
  - [x] Validate Debug Adapter Protocol (DAP) interception with different C compilers (GCC/Clang).
- [x] **Security & Policy Validation**
  - [x] Confirm `machine_id` mismatch triggers 403 Forbidden responses.
  - [x] Verify 1-second `autoSave` override cannot be disabled during an active session.
  - [x] Ensure the "Secure Wipe" accurately clears the file before deletion.
  - [x] Test the background worker's retry logic during simulated network outages.

## Phase 6: System Enhancement & Optimization

### **Architecture & Lifecycle Refactoring**
- [x] Refactor extension startup sequence to combine lab schedule and version validation into a single API request.
- [x] Implement an explicit state machine (`SessionStatus`) to enforce a linear session lifecycle and prevent out-of-order command execution.
- [x] Eliminate "Zombie Tracker" memory leaks by enforcing explicit `vscode.Disposable` lifecycle management for all background tasks.
- [x] Restructure extension activation lifecycle to guarantee all commands are registered prior to asynchronous state evaluations and early returns.
- [x] Purge legacy `globalState` variables (`c_lab_class_schedule`, `c_lab_auto_start_pending`) on activation to prevent cache pollution.
- [x] Abstract physical environment destruction logic into `cleanupWorkspace()` to maintain strict single-responsibility architecture.
- [x] Implement strict MVC (Model-View-Controller) architecture by decoupling all VS Code UI presentation logic (Information, Warnings, Errors, Status Bar) into a dedicated `ui.ts` view controller.
- [x] Implement a lifecycle deactivation guard (`isIntentionalWorkspaceReload`) to prevent global state corruption during intentional WSL workspace transitions.

### **Environment & Workspace Engineering**
- [x] Implement a "One-Shot" workspace reload architecture using global state to seamlessly transition students into a secure, sandboxed lab folder.
- [x] Extract OS-specific workspace initialization and WSL bridging logic into `workspace.ts` for better separation of concerns.
- [x] Implement dynamic WSL bridging on Windows to seamlessly transfer the workspace session into a native Linux environment via Remote URIs.
- [x] Implement a delayed background shell process ("time bomb") during session cleanup to forcefully terminate the WSL VM without crashing the VS Code client UI.
- [x] Enforce strict execution context via `extensionKind: ['workspace']` to force the Extension Host into the remote Linux environment, resolving cross-boundary dependency resolution failures.
- [x] Mitigate the WSL "Split Brain" registry cache limitation by replacing background extension polling with a deterministic, interactive UI installation sequence.

### **Security & Anti-Cheat Validation**
- [x] Enforce "Fail-Closed" security posture on startup if the backend server is unreachable.
- [x] Enforce strict RegEx UI validation (`YYYY-NNNNN`) for student credentials to prevent backend database pollution.
- [x] Centralize workspace-scoped policy enforcement (disabling AI/Copilot, locking auto-save, standardizing 8-space indentation) protected by a real-time configuration watchdog.
- [x] Modularize tracker architecture by extracting the configuration watchdog into a dedicated `policyTracker.ts` service.
- [x] Refine anti-cheat paste detection to allow legitimate cross-file code transfers within the workspace by validating clipboard data against all tracked session buffers.
- [x] Implement OS-level File System Watcher (`fileTracker.ts`) to audit external file additions, deletions, and modifications to the secure workspace.

### **Backend Observability & Telemetry**
- [x] Consolidate unauthorized paste tracking and policy tampering telemetry into a unified `/api/track/security-violation` endpoint for centralized audit logging.
- [x] Configure production-grade `RotatingFileHandler` logging with custom `logging.Filter` to explicitly extract and track `ip_address`, `machine_id`, and `student_number` globally across all endpoints.

## Phase 7: Verification of System Hardening (Phase 6 Features)
- [x] **Unit Testing: Formatting & Utilities**
  - [x] Test UI `promptForCredentials` strictly rejects invalid formats (e.g., `202A-12345`, `2026 12345`) and accepts `YYYY-NNNNN`.
  - [x] Test `/api/lab/tasks` ensures deterministic `{{RAND_min_max}}` seed generation (consistency per student, uniqueness across students, bounded ranges).
  - [x] Test `/api/track/security-violation` handles both file-specific strings and global `null` filenames without throwing DB schema errors.
- [x] **Integration Testing: Anti-Cheat Engine**
  - [x] Verify Workspace-Wide Paste Detection accurately allows internal code movement between tabs while blocking and reverting external OS clipboard pastes.
  - [x] Verify Policy Watchdog successfully catches and instantly reverts mid-session attempts to toggle `autoSave`, `tabSize`, or AI code completion.
  - [x] Verify OS-Level File Watcher securely detects external drag-and-drops, notepad edits, and file deletions within the active workspace.
- [ ] **E2E Testing: Environment & Lifecycle**
  - [ ] Verify "One-Shot" reload logic successfully establishes `vscode-remote://wsl+...` context on Windows and native folder routing on macOS/Linux.
  - [ ] Verify `c_lab_startup_phase` global state logic correctly intercepts the extension activation post-reload, bypassing the start button and resuming initialization.
  - [ ] Verify `cleanupWorkspace()` gracefully initiates the "time bomb" shell command to stop the WSL distro without throwing a "Connection Lost" VS Code error.
  - [ ] Inspect `c_lab_api.log` after an E2E flow to confirm `ip_address`, `machine_id`, and `student_number` are properly formatted in every log entry.

## Phase 8: Polish & Deployment
- [ ] **Security & Optimization**
  - [ ] Review all API endpoints for injection vulnerabilities.
  - [ ] Ensure all extension-to-server traffic includes the `machine_id`.
  - [ ] Test the "No-Internet" failure states (e.g., local caching if diffs fail to send).
- [ ] **Backend Deployment**
  - [ ] Containerize FastAPI with Docker.
  - [ ] Deploy to cloud provider.
  - [ ] Set up SSL/HTTPS to prevent packet sniffing/hijacking.
- [ ] **Extension Publishing**
  - [ ] Finalize extension logo and `README.md`.
  - [ ] Package extension via `vsce package`.
  - [ ] Publish to VS Code Marketplace (`vsce publish`).
