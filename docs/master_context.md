# Project Master Context

- **name:** C-Lab AutoSubmit System

- **purpose:** assist with C programming computer lab sessions by logging coding behavior and automating code submissions.

- **target:** cybersecurity freshman attending a C programming class, and teaching assistants monitoring the lab sessions.

## 1. Tech Stack

- **client - VS code extension:** TypeScript, VS Code Extension API (requires a delta-encoding library like `diff-match-patch` for tracking).

- **server - backend API:** Python, FastAPI.

- **database:** SQLite (sharded architecture: a separate `.db` file is dynamically generated per session using the `machine_id` and `session_id`; write-ahead logging (WAL) mode enabled).

## 2. Core Policies

1. **authentication & zero-trust session tokens:** When starting a session, the student inputs their Student Number (enforced via Regex to match a `YYYY-NNNNN` format) and Full Name. The backend verifies this initial login and issues a stateless JSON Web Token (JWT). To enforce a Zero-Trust architecture, the `student_number` is explicitly removed from all subsequent client-side network payloads. Instead, the extension authenticates all future requests by passing the JWT as a Bearer token in the `Authorization` header.

2. **class time sync:** The extension is only active during scheduled lab hours and remains completely dormant outside of these times.

3. **zero-trust local storage & ephemeral sessions:** To prevent code leakage on shared lab workstations, the extension ALWAYS securely overwrites (with empty bytes) and permanently deletes the local source files **and the hidden cache folder** upon ANY deactivation event (expected shutdown, closing VS Code, or WSL disconnect). **Any deactivation immediately expires the session token. There are no "un-finalized" or resumable sessions.** Upon restarting the lab, the backend explicitly invalidates old data, provisions a completely new session, token, and database shard. The extension automatically loads the first task and initializes a fresh hidden cache folder.

4. **policy enforcement (auto-save & formatting):** The extension overrides the workspace settings to force `files.autoSave` with a 60-second delay, disables AI/Copilot code completions, and strictly enforces educational formatting (e.g., 8-space tab sizes). A background Policy Watchdog continuously monitors these settings.

5. **machine ID & token binding:** Upon the first execution of the extension, a `machine_id` is securely generated and saved locally. This ID is transmitted during the initial login and embedded as a claim within the backend-issued JWT. The backend validates this bound `machine_id` alongside the token signature on all subsequent requests to prevent token theft and session hijacking.

6. **workspace provisioning:** The extension enforces a dedicated default workspace (`~/C-Lab-Workspace`) and automatically provisions a folder inside the default WSL distribution for Windows users.

7. **file system auditing & auto-save conflict resolution:** A background File Watcher strictly audits the workspace for external file creations and deletions. To prevent an infinite loop of false-positive security alerts caused by the forced 60-second `files.autoSave` policy, the File Watcher MUST strictly ignore internal VS Code save events. General file modifications must be monitored exclusively by the internal Diff Tracker, which is already aware of VS Code's editor state. **Whenever logging a file-specific violation, the extension MUST preserve and transmit the exact relative path. It must retain file extensions (e.g., `main.c`) if present, and accurately capture directories or extensionless files (e.g., `Makefile`) without artificially altering the path.**

8. **cross-platform encoding & normalization:** To prevent Korean character malformation (specifically NFD decomposition issues native to macOS file systems and inputs), the extension MUST normalize all Korean string inputs (e.g., Student Name) to **NFC (Normalization Form Canonical Composition)** before transmission. Furthermore, the backend's file sanitization logic must explicitly permit Korean Unicode ranges, and all file I/O operations must strictly enforce UTF-8 encoding.

9. **stateless api architecture & kst time-binding:** To prevent submission failures during high concurrency or multi-worker server deployments, the backend MUST NOT rely on in-memory variables. The `session_id` and database shard naming must be deterministic and **strictly bound to the KST (`Asia/Seoul`) timezone and the student's ID** (e.g., `YYYY-MM-DD_KST_{student_number}`). Because the frontend no longer transmits the `student_number` directly, the backend autonomously extracts this ID from the validated JWT claims to route data to the correct shard.

10. **extension diagnostics & health monitoring:** To facilitate remote debugging and ensure system stability, the VS Code extension must autonomously capture internal operational errors, unhandled exceptions, and critical state changes, securely transmitting these client-side diagnostic logs back to the server.

11. **korean localization:** All user-facing UI elements, status bar items, input box prompts, warning/error/info notifications, and the generated Markdown review MUST be written in Korean to ensure clarity and accessibility for the local student base.

12. **unified log formatting:** To ensure chronological consistency and predictable parsing, ALL server endpoint logs, database `timestamp` columns, diagnostic telemetry, and client-server JSON payloads MUST strictly adhere to a single unified timestamp format: **ISO 8601 with KST offset (`YYYY-MM-DDTHH:MM:SS+09:00`)**.

## 3. Core Workflows

### A. Activation: initialization to idle state

- **trigger:** the extension activates when VS Code opens.

- **command registration:** internal commands (`c-lab.startLab`, `c-lab.navigateTask`, `c-lab.midSubmit`, `c-lab.finalSubmit`, `c-lab.getReview`) are registered.

- **time validation:** the extension fires a one-off call to the `/api/check-time` endpoint.

- **state handling:**

  - **if `false` (not class time):** the extension remains dormant. No UI elements are rendered, and tracking is bypassed.

  - **if `true` (class time):** it proceeds to the next steps.

- **update check:** verifies version parity with the backend. If outdated, the UI shows an "Updating..." state and halts initialization until VS Code completes the auto-update and reloads.

- **dependency validation:** checks if the `ms-vscode.cpptools` extension is active. If missing, it provides a bulletproof UI prompt guiding the user to install it and reload the window.

- **ui element reveal:** reveals the "start lab" button in the VS Code UI.

### B. Start Lab: Authentication & Provisioning

- **trigger:** the user executes the "start lab" command.

- **workspace routing:** determines the default `C-Lab-Workspace` folder path and triggers a window reload to eject the current folder and open the secure workspace environment.

- **authentication & normalization:** prompts the user via VS Code input boxes to enter their student number and name (prompts in Korean). The extension immediately normalizes the Korean name input to NFC format to prevent macOS rendering bugs.

- **workspace validation:** verifies the folder is in a "Trusted" state. Enforces the strict auto-save, anti-cheat, and formatting policies.

- **session initialization:** calls the `/api/session/start` endpoint with the student credentials and `machine_id`. The backend explicitly **expires any previous sessions/tokens** associated with this machine. It establishes a completely new, deterministic database shard explicitly formatted for the new session (e.g., `{machine_id}_{session_id}.db`) and responds with a fresh stateless JWT.

- **cache initialization:** The extension creates a local secret folder (e.g., `.clab_cache/`) to hold task history during the active session.

- **first task provisioning:** The extension immediately fetches and provisions the skeleton code for the **first task** into `main.c`.

- **task navigation UI:** The primary button morphs into "Mid Submit", and Task Navigation / Next Task buttons are revealed. When clicked:

  1. The extension copies the current state of `main.c` into `.clab_cache/`.

  2. The student selects a new task (or automatically advances if using the Next Task button).

  3. If the selected task exists in `.clab_cache/`, it is restored to `main.c`. 
     If not, a fresh skeleton is fetched from the backend.

- **task fetching:** the backend dynamically seeds PRNG placeholders (e.g., `{{RAND_min_max}}`) within the skeleton code to issue randomized variables specific to that student.

- **baseline setup:** the extension writes the downloaded skeleton code (or resumed code) to the local lab folder (enforcing UTF-8 encoding), explicitly initializes the text baseline for the background trackers (preventing auto-formatter false positives), and transmits a baseline diff to the server using the JWT Bearer token.

- **tracker initialization:** starts the Diff Tracker, Debug Tracker, Policy Watchdog, and File Watcher.

### C. Track A: Diff Data Acquisition (True Delta Patches)

+- **delta encoding & baseline anchors:** Instead of transmitting the full file content, the extension calculates true text deltas (patches). **CRITICAL EXCEPTION:** Whenever a task is loaded (either a fresh skeleton OR **navigating back to a cached, previously started task**), the tracker MUST transmit the full file text as a baseline (`is_baseline: true`). Since all tasks share the `main.c` editor window, these periodic baselines guarantee the backend's chronological diff reconstruction engine always has the correct anchor and doesn't accidentally apply a Task 2 patch to a Task 1 history.

- **diff aggregation:** modifications are aggregated into 1-second timestamped intervals (recorded in ISO 8601 KST).

- **data transmission:** the background worker queue sweeps the lightweight patch payloads and bundles them with other telemetry (security, debug, diagnostics) to push to the unified `/api/track/bulk` endpoint at randomized intervals (10–20 seconds), drastically reducing network packet overhead.

- **system operation bypass:** The tracker pauses (`isSystemOperation`) during internal file swaps (like navigating tasks) to prevent massive delta payloads from being generated by the extension's own operations.

### D. Track B: Paste Detection & Context Logging

- **restriction:** copying and pasting code from external sources is strictly prohibited.

- **exception:** pasting is permitted *only* if the text originated from a cut or copy action within the current tracked workspace session (verified against a global `diffBuffer` and a `recentlyDeletedBuffer`).

- **enforcement policy:** upon detecting an unauthorized external paste event, the system acts as a strict surveillance monitor. It permanently logs the attempt to the TA's database and displays a stern warning in Korean, but does *not* forcefully undo the student's action.

- **system operation bypass:** The tracker utilizes an `isSystemOperation` flag to temporarily pause paste detection during automated file swaps (like navigating between tasks) to prevent false positives, resetting the baseline immediately after the new file loads.

- **situational awareness:** The extension queues a security violation log for bulk transmission to the TA's database. To provide full situational context, this payload MUST include the exact text pasted, **the exact line number/position of the attempt, and a snippet of the surrounding code (e.g., 3-5 lines above and below the cursor location)**.

### E. Track C: C/C++ Debug Logic Details

- **method:** utilizes a custom `DebugAdapterTrackerFactory` to intercept DAP (Debug Adapter Protocol) messages for `cppdbg` and `cppvsdbg` instances.

- **captured data:**

  - **active file:** the exact filename with its extension (e.g., `main.c`) of the file currently being debugged.

  - **snapshot:** full source text of the active file at the time the debugger launches.

  - **diagnostics/problems:** active workspace problems (compilation errors, syntax warnings, or runtime faults) captured via VS Code's native diagnostics API (`vscode.languages.getDiagnostics()`) to explain premature debug termination.

  - **breakpoints:** file locations and line numbers for all active breaks.

  - **execution actions:** developer navigation commands (step-over, continue, etc.).

  - **variable inspection:** mapped evaluation sequences linking user hover/watch window events to their respective output values.

  - **output:** standard streams (`stdout`, `stderr`).

- **data transmission:** queues the aggregate payload for the next periodic `/api/track/bulk` transmission immediately upon debug session termination.

### F. Track D: Mid Submission & Problem Navigation

- **trigger:** the student clicks the "Mid Submission" button.

- **execution:** **This action executes silently without any confirmation dialog.**
  *(Protected by a 3-second frontend debounce lock to prevent double-click network spam).*

- **data transmission:** queued locally and sent asynchronously to the backend (`/api/track/bulk`) in a fire-and-forget manner to avoid blocking the student's main thread UI.

### G. Track E: Final Submission & Review

- **trigger:** the student explicitly clicks the "Final Submission" button (which replaces the "Next Task" button upon reaching the final assignment).

- **confirmation alert:** The extension triggers a popup asking the user to verify their intent in Korean.
  *(Also protected by the frontend debounce lock).*

- **data transmission:**

  - Aggregates the currently active `main.c`, all cached historical files, and the full extension log buffer into a single localized Markdown string.

  - Transmits ONLY this generated review document in the `sourceFiles` payload via `/api/session/submit` (tagged as `final`).

  - closes all open editors.

- **asynchronous fallback:** Protected by a local retry mechanism with exponential backoff. If the server gets overloaded (e.g., returning 503 or 429) during the submission spike at the end of the lab, the extension will hold the payload and automatically retry, guaranteeing successful delivery.

- **review phase:** Immediately serves the locally generated Markdown review document to the student via a read-only virtual text provider (`clab-review://`) to prevent infinite "save" loops.

- **teardown:** The `TelemetryWorker` polling loop AND all local trackers (Diff, Security, Debug) are explicitly and immediately halted to guarantee no further background network syncs or false-positive security logs are generated while the user reviews their feedback.

- **ui transition:** updates status to "done".

### H. Track F: Session Suspend & Teardown

- **trigger:** Unexpected deactivation (closing VS Code), explicitly executing `c-lab.endSession` via the Command Palette during a lab, OR clicking the "End Session" UI button during the final Review Phase.

- **unexpected deactivation (suspend):** If the system detects a deactivation event before a `final` submission, it autonomously builds and transmits a backup `mid` submission payload. It transmits a session termination payload (`/api/session/end`) tagged as `suspended`. **It closes all open editor tabs, executes the strict data destruction policy (zero-byte wipe and delete) on local files, and the token is permanently expired.**

- **expected deactivation(cleanup):** The expected "Cleanup" path is now handled directly within Track E (Final Submission), which sets the `sessionCloseReason` to `expected` and relies on the extension's native `deactivate()` hook to perform the zero-trust data wipe and WSL teardown.

- **markdown generation:** Additionally, in both deactivation, the backend automatically generates a readable Markdown dump of the database upon receiving the `completed` termination status.

### I. Track G: Extension Diagnostics

- **trigger:** caught exceptions, network payload failures, or significant extension lifecycle events (e.g., activation failures, workspace ejection).

- **captured data:** log level (INFO, WARN, ERROR), error messages, localized stack traces, VS Code environment data, and the associated student/machine ID context.

- **data transmission:** sent asynchronously to the backend (`/api/track/extension-log`) in a fire-and-forget manner to avoid blocking the student's main thread UI.

## 4. Backend API specification

- `GET /api/check-time`: Returns a boolean validating if the current server time falls strictly within scheduled KST lab hours.

- `GET /api/lab/tasks`: Retrieves the sequence of assignments. Synthesizes a dedicated PRNG seed to swap placeholder tags (like `{{RAND_min_max}}`) with integers unique to the requesting student ID.

- `POST /api/session/start`: Validates student data. Applies Unicode-safe regex sanitization to the student's name. **Invalidates any existing tokens/sessions for the machine.** Provisions a completely new, stateless SQLite shard specifically bound to the **Machine ID and new Session ID** (e.g., `{machine_id}_{session_id}.db`). Returns the new token and initializes the fresh session for task navigation via the UI.

- `POST /api/session/submit`: Processes, archives, and associates major milestone snapshots (`mid` or `final`) alongside internal `.vscode` environment configs, safely querying the stateless machine/session-bound shard.

- `POST /api/session/end`: Receives the termination status (`suspended` or `completed`) and records the final KST timestamp in the database to explicitly close the session audit log and calculate total lab duration.

- `POST /api/track/bulk`: Receives and routes unified payload streams (diffs, security violations, debug logs, and extension logs) to their respective database tables in the stateless shard.

## 5. Publish Strategy

- **server:** Deploy to the cloud inside a FastAPI container utilizing multi-worker scaling. Enforce `HTTPS` to prevent token theft or differential payload network hijacking. Ensure the container storage for SQLite files is persistent and stateful. Use standard python logging configured to output ISO 8601 KST timestamps.

- **client:** Publish through the VS Code Marketplace (`vsce publish`). Rely on native auto-updates combined with the forced `enforceVersionCheck` blocking mechanism.
