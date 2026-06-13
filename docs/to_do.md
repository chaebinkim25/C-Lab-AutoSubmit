# C-Lab AutoSubmit System - Implementation Tasks

## Phase 1: Infrastructure & Scaffolding
- [x] **Backend: FastAPI Scaffolding**
  - [x] Initialize project with FastAPI and Uvicorn.
  - [x] Set up global timezone configuration to enforce `Asia/Seoul` (KST).
  - [x] Configure standard Python logger to output `ISO 8601 KST` timestamps.
- [x] **Backend: Database Architecture**
  - [x] Implement dynamic SQLite shard routing via machine and session (e.g., `{machine_id}_{session_id}.db`).
  - [x] Enable Write-Ahead Logging (WAL) mode for concurrency.
  - [x] Define stateless query protocols (no in-memory globals).
- [x] **Frontend: VS Code Extension Scaffolding**
  - [x] Initialize TypeScript extension project (`yo code`).
  - [x] Configure `webpack` or `esbuild` for bundling.
  - [x] Install required tracking libraries (e.g., `diff-match-patch`).

## Phase 2: Session Management & Provisioning
- [x] **Backend: Core Session API**
  - [x] Build `GET /api/check-time` (07:00–13:00 KST validation).
  - [x] Build `GET /api/lab/tasks` (with PRNG `{{RAND_min_max}}` seed injection).
  - [x] Build `POST /api/session/start` (enforce clean slate).
  - [x] Build `POST /api/session/end` (handle completed vs. suspended status).
- [x] **Frontend: Initialization & UI**
  - [x] Register `c-lab.startLab` command.
  - [x] Check time against server on activation; remain dormant if outside lab hours.
  - [x] Validate `ms-vscode.cpptools` dependency presence.
  - [x] Build localized (Korean) input boxes for Student Number (Regex check) and Name.
  - [x] Implement strict NFC normalization for Korean strings.
- [x] **Frontend: Workspace Management**
  - [x] Generate, securely store, and retrieve `machine_id`.
  - [x] Enforce routing to `~/C-Lab-Workspace` (create if missing).
  - [x] Auto-provision WSL folder if on Windows.
  - [x] Validate "Trusted Workspace" state.
  - [x] Enforce policies: `files.autoSave` (1s), 8-space tabs, disable AI Copilot.

## Phase 3: Telemetry & Security (Tracks A & B)
- [x] **Frontend: Track A (Diff Tracker)**
  - [x] Hook `vscode.workspace.onDidChangeTextDocument`.
  - [x] Implement `diff-match-patch` to extract true deltas (not full text).
  - [x] Batch modifications into 1-second interval chunks.
  - [x] Build asynchronous worker queue to push `/api/track/diff` payloads every 10-20s.
- [x] **Frontend: Track B (Security & File Watcher)**
  - [x] Implement Paste Detection: Compare paste events against local `diffBuffer` and `recentlyDeletedBuffer`.
  - [x] If unauthorized: Execute native VS Code `undo`, show Korean warning.
  - [x] Extract surrounding context (3-5 lines) and exact line number for violation logs.
  - [x] Hook `vscode.window.onDidChangeWindowState` to detect window focus loss.
  - [x] detect editor active window change
  - [x] Implement File Watcher for external creations/deletions.
  - [x] **Crucial:** Add logic to File Watcher to completely ignore VS Code's native auto-save events to prevent false positives. Ensure file extensions are preserved in logs.
- [x] **Backend: Telemetry Endpoints**
  - [x] Build `POST /api/track/diff`.
  - [x] Build `POST /api/track/security-violation`.

## Phase 4: Debug Interception (Track C)
- [x] **Frontend: DAP Tracker**
  - [x] Register `DebugAdapterTrackerFactory` for `cppdbg` / `cppvsdbg`.
  - [x] Capture initial `active_file` name (with extension) and full source snapshot on launch.
  - [x] Parse and store `setBreakpoints` line numbers.
  - [x] Intercept execution navigation (step-over, continue).
  - [x] Intercept evaluation sequences and output streams.
  - [x] On termination, call `vscode.languages.getDiagnostics()` to capture compilation/runtime problems.
  - [x] Fire aggregated payload to `/api/track/debug-log`.
- [x] **Backend: Debug API**
  - [x] Build `POST /api/track/debug-log`.

## Phase 5: Submission & Review (Tracks D & E)
- [x] **Frontend: Submissions**
  - [x] Register `c-lab.midSubmit` command. **Retain editors, package source/`.vscode` files, fetch and provision the next task's skeleton code.**
  - [x] Register `c-lab.finalSubmit` command. Add Korean confirmation prompt.
  - [x] Add Status Bar button: `[Submit Task]`.
- [x] **Frontend: Review Phase (Infinite Loop Fix)**
  - [x] Register custom `vscode.workspace.registerTextDocumentContentProvider` (`clab-review://`).
  - [x] Fetch Markdown from server, open via native markdown preview.
- [x] **Backend: Submission APIs**
  - [x] Build `POST /api/session/submit` (mid & final).

## Phase 6: Teardown & Diagnostics (Tracks F & G)
- [x] **Frontend: Zero-Trust Teardown**
  - [x] Hook extension `deactivate()` lifecycle.
  - [x] Detect if deactivation is unexpected (Suspend path) vs. expected (Cleanup path).
  - [x] Execute file destruction: Overwrite local `.c` files AND the `.clab_cache` directory with `0x00` bytes, then permanently delete.
  - [x] (Windows only) Execute background `wsl.exe -t` termination if closing session.
- [x] **Frontend: Task Navigation Logic**
  - [x] Update `Start Lab` to automatically provision the first task upon initialization.
  - [x] Add a Task Navigation UI button that opens a menu to navigate to all other tasks.
  - [x] Add a `Next Task` UI button for sequential progression.
  - [x] Implement logic to morph the `Next Task` button into `Final Submission` when on the last task.
- [x] **Diagnostics & Polish**
  - [x] Implement global error boundary to catch unhandled exceptions.
  - [x] Format and send logs to `POST /api/track/extension-log`.
  - [x] Build backend `POST /api/track/extension-log`.
  - [x] Do a final sweep of all UI prompts, status bars, and errors to ensure 100% Korean text.

## Phase 7: Refactoring
- [x] Task Navigation Logic: Discard all resume logic. On initialization, always show the first task. Provide a UI button that opens a menu to navigate to all tasks.
- [x] db file shard: name by machine id and session
- [x] Task Caching: Implement a secret `.clab_cache` folder. Save `main.c` to cache on navigation. Restore from cache if navigating back to an attempted task.
- [x] Submit Payloads: Update `c-lab.midSubmit` to execute silently and ONLY send `main.c`. Update `c-lab.finalSubmit` to bundle `main.c` + all files in `.clab_cache`.
- [x] Watchdog Bypass: Removed (monitor `.clab_cache` as well, only ignore autosave).
- [x] sanitize trailing whitespaces
- [x] remove cleanup button
- [x] Refactor base url in network calls into dedicated single source to easily and safely modify base url.
- [x] check Review Phase in frontend
- [x] final submission, build review file from all source files and logs, submit that file only and show as a review phase
- [x] review functionality does not get data from backend, but construct it itself from the beginning. 
- [x] Check DRY principle in source codes
- [x] log all network problems
- [x] diff delta does not process utf-8 very well
- [x] discriminate system activity from user activity in diff
- [x] save starting code to database
- [x] add session end ui button to deactivate
- [x] remove obsolete functionalities
- [x] find and remove all legacy artifacts from previous archtecture
- [x] all texts shown by ux/ui gathered
- [x] move out generateLocalReview from submitTask.ts
- [x] check ui button logic (Refactored to 3-button state machine funnel)
- [x] reject multiple submission in short duration (Implemented boolean lock + 3s cooldown)
- [x] send all vscode log to backend (Teardown & Wipe logs now fully captured and flushed)
- [x] close editor window when deactivate. everytime start, vscode complains no code review md file
- [x] in backend, after session ended, generate markdown that shows all contents of the db file.
- [x] deactivate extension after session ends
- [x] minimize network packets (gzip final submissions)
- [x] use elapsed second instead of timestamp
- [x] use elapsed second instead of timestamp also in telemetry of logs
- [x] use codes in debug telemetry also. 
- [x] network packet for log messages contains log code instead of sentences
- [x] migrate `core/database.py` to use `aiosqlite` to allow non-blocking `await` calls.
- [x] remove id column from session in database

- [x] check frontend payload matches backend pydantic schema
- [x] check extension start time when start lab
- [x] minimize disc writing and waiting time
- [x] check sql commands following use scenario
- [x] forbid start when already lab started

- [x] no gzip
- [x] move all messages to separate file
- [x] log stdin and stdout

## Phase 8: fix errors

- [x] "Hot Exit" Ghost Buffers and File System Watcher Race Conditions
- [x] http error is not logged in frontend
- [x] session id is always 1 why keep counting
- [x] clear vscode output after final submission

## Phase 8: Polish & Deployment
- [x] log in-memory ingestion queue 
- [x] check server health
- [x] monitor server cpu, memory, disk, network usage
- [x] background database backup
- [x] let backup rely on AWS EBS volume snapshots
- [x] jwt secret management
- [x] check if .clab_cache could gets corrupted
- [x] test if fetch implementation works properly respects the http.proxy settings
- [x] test extension in the network problem setup
- [x] increase retry time to 100 times

- [x] **Authentication & Identity**
  - [x] Refactor Auth: Implement stateless Session Tokens (JWT) to completely remove `student_number` from client-side network traffic (Zero-Trust architecture).
  - [x] Secure Storage: Store the JWT securely in the VS Code extension's globalState rather than plaintext variables.
- [x] **Backend: Implement JWT Expiration (`core/auth.py`)**
  - [x] Update `create_access_token` to include an `exp` (expiration) claim to prevent indefinite token reuse.
  - [x] Calculate the expiration target using the centralized timezone function (e.g., `get_kst_now() + timedelta(hours=12)`).
  - [x] Ensure `jwt.decode` in the authorization dependency properly catches and handles `jwt.ExpiredSignatureError`.
- [x] **Backend: Resolve FastAPI Event Loop Blocking**
  - [x] migrate `core/database.py` to use `aiosqlite` to allow non-blocking `await` calls.
  - [x] increase the telemetry jitter window to 60 seconds
  - [x] in-memory ingestion queue in background tasks. 
  - [x] configure backend server to store sahrds directory in a RAM disk
- [x] **Frontend: Resolve Hardcoded HTTP Module (`client.ts`, `submitTask.ts`, `telemetryWorker.ts`)**
  - [x] Refactor network calls to remove strict reliance on the Node `http` module.
  - [x] Migrate requests to use native `fetch` API (fully supported in Node 18+ / modern VS Code environments) OR implement dynamic switching between `http`/`https` modules based on the URL scheme.
  - [x] Ensure the extension gracefully handles TLS/HTTPS connections when communicating with the deployed backend.
- [x] **Frontend: Prevent Telemetry Data Loss (`trackers/telemetryWorker.ts`)**
  - [x] Intercept network failures in the `req.on('error')` block to ensure payload data is not permanently dropped.
  - [x] Implement V2 retry queue: `unshift` failed diff payloads back into `diffTracker.patchQueue` so they successfully aggregate into the next active jitter window once the network restores.
- [x] **Frontend: Expand NFC Normalization (`commands/startLab.ts`)**
  - [x] Apply `.normalize('NFC')` to the `studentNumber` input as well as the student name.
  - [x] Prevent edge-case database routing or validation errors caused by strangely encoded strings (e.g., pasted from a PDF).
- [x] **Anti-Cheat & Privacy Enforcement**
  - [x] Macro/Script Evasion Detection: Update `diffTracker.ts` to calculate insertion velocity. Flag insertions that exceed human typing speeds (e.g., 100+ characters in < 0.5s) to catch macro-based pasting.
  - [x] PII Sanitization: Add a middleware function in the telemetry worker to scrub absolute OS paths (e.g., C:\Users\Name\... or /Users/Name/...) from debugTracker and console output payloads before they leave the student's machine.
- [x] **Network Resilience (Availability)**
  - [x] Mitigate Thundering Herd: reduce backend memory pressure.
  - [x] Asynchronous Fallback: Add a local retry queue with exponential backoff for final submissions. If the server returns a 503 or 429 due to a spike at the end of the lab period, the extension should hold the payload and try again rather than failing out.
- [ ] **Infrastructure & Environment Deployment**
  - [ ] Backend Containerization: Containerize the FastAPI backend, ensuring Uvicorn is tuned with appropriate worker threads to handle simultaneous SQLite WAL access.
  - [ ] Transport Layer Security: Deploy to the cloud provider behind a reverse proxy (like Nginx or Traefik) and enforce strict SSL/TLS (HTTPS) to prevent on-campus packet sniffing.
  - [ ] Review all API endpoints for injection vulnerabilities.
  - [ ] Ensure all extension-to-server traffic includes the `machine_id`.
  - [ ] Test the "No-Internet" failure states (e.g., local caching if diffs fail to send).
- [ ] **Extension Publishing**
  - [ ] Finalize extension logo and `README.md`.
  - [ ] Package extension via `vsce package`.
  - [ ] Publish to VS Code Marketplace (`vsce publish`).

## Phase 9: Fix error report
- [x] frontend: sort tasks in the generated review
- [x] frontend: not use main.c in the generated review
- [x] frontend: not use uri to save
- [x] frontend: for macOS user, add lldb to tracker factory list
- [x] frontend: wrap telemetry path extraction in a normalizer
- [x] frontend: make mid submission move to next task

## Phase 10: Network resilience update
- [x] remove all get operation from backend. store all task info in frontend.
- [x] remove /api/check-time
- [x] do not activate on startup. only manual activation
- [x] show start lab button after activation
- [x] remove /api/health-check
- [x] backend does not tell anyting to frontend. single sided information flow from frontend to backend.
- [ ] remove issuing the initial session token functionality during `POST /api/session/start`
