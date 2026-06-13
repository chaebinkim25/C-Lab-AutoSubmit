# Project Master Context

- **name:** C-Lab AutoSubmit System

- **purpose:** assist with C programming computer lab sessions by logging coding behavior and automating code submissions.

- **target:** cybersecurity freshman attending a C programming class, and teaching assistants monitoring the lab sessions.

## 1. Tech Stack

- **client - VS code extension:** TypeScript, VS Code Extension API (requires a delta-encoding library like `diff-match-patch` for tracking).

- **server - backend API:** Python, FastAPI.

- **database:** SQLite (sharded architecture: a separate `.db` file is dynamically generated per session using the `machine_id` and `session_id`; write-ahead logging (WAL) mode enabled).

## 2. Core Policies

1. **client identity & stateless headers:** When starting a session, the student inputs their Student Number (enforced via Regex to match a `YYYY-NNNNN` format) and Full Name. The extension locally generates a unique `session_id`. To enforce a Zero-Trust architecture, the extension explicitly authenticates all future requests by passing these identities (`x-machine-id`, `x-session-id`) in the HTTP headers. No JWTs or server-side session tokens are used.

2. **zero-trust local storage & ephemeral sessions:** To prevent code leakage on shared lab workstations, the extension ALWAYS securely overwrites (with empty bytes) and permanently deletes the local source files **and the hidden cache folder** upon ANY deactivation event (expected shutdown, closing VS Code, or WSL disconnect). **Any deactivation immediately purges the local session variables. There are no "un-finalized" or resumable sessions.** Upon restarting the lab, the backend explicitly invalidates old data, provisions a completely new session and database shard. The extension automatically loads the first task and initializes a fresh hidden cache folder.

3. **policy enforcement (auto-save & formatting):** The extension overrides the workspace settings to force `files.autoSave` with a 60-second delay, disables AI/Copilot code completions, and strictly enforces educational formatting (e.g., 8-space tab sizes). A background Policy Watchdog continuously monitors these settings.

4. **machine ID & session binding:** Upon the first execution of the extension, a `machine_id` is securely generated and saved locally. The frontend dynamically generates a unique `session_id` and securely binds it alongside the machine and student data on all subsequent requests.

5. **workspace provisioning:** The extension enforces a dedicated default workspace (`~/C-Lab-Workspace`) and automatically provisions a folder inside the default WSL distribution for Windows users.

6. **file system auditing & auto-save conflict resolution:** A background File Watcher strictly audits the workspace for external file creations and deletions. To prevent an infinite loop of false-positive security alerts caused by the forced 60-second `files.autoSave` policy, the File Watcher MUST strictly ignore internal VS Code save events. General file modifications must be monitored exclusively by the internal Diff Tracker, which is already aware of VS Code's editor state. **Whenever logging a file-specific violation, the extension MUST preserve and transmit the exact relative path. It must retain file extensions (e.g., `main.c`) if present, and accurately capture directories or extensionless files (e.g., `Makefile`) without artificially altering the path.**

7. **cross-platform encoding & normalization:** To prevent Korean character malformation (specifically NFD decomposition issues native to macOS file systems and inputs), the extension MUST normalize all Korean string inputs (e.g., Student Name) to **NFC (Normalization Form Canonical Composition)** before transmission. Furthermore, the backend's file sanitization logic must explicitly permit Korean Unicode ranges, and all file I/O operations must strictly enforce UTF-8 encoding.

8. **stateless api architecture:** To prevent submission failures during high concurrency or multi-worker server deployments, the backend MUST NOT rely on in-memory variables. The database shard naming must be deterministic and **strictly bound to the machine and session IDs** (e.g., `{machine_id}_{session_id}.db`). The backend securely extracts the `machine_id` and `session_id` from the custom HTTP headers (`x-machine-id`, `x-session-id`) to securely route data to the correct shard.

9. **extension diagnostics & health monitoring:** To facilitate remote debugging and ensure system stability, the VS Code extension must autonomously capture internal operational errors, unhandled exceptions, and critical state changes, securely transmitting these client-side diagnostic logs back to the server.

10. **korean localization:** All user-facing UI elements, status bar items, input box prompts, warning/error/info notifications, and the generated Markdown review MUST be written in Korean to ensure clarity and accessibility for the local student base.

11. **single-sided information flow:** To maximize network resilience, the system strictly enforces a one-way information flow. The frontend operates autonomously (handling its own task definitions, PRNG generation, session ID generation, and state transitions) and purely pushes data to the backend. The backend acts solely as a passive data sink and never dictates state or serves content to the client, including session tokens.

## 3. Core Workflows

### A. Activation: Manual Initialization

- **trigger:** the extension does NOT activate on startup. It activates strictly when the user manually executes the "start lab" command via the Command Palette.

- **command registration:** internal commands (`c-lab.startLab`, `c-lab.navigateTask`, `c-lab.midSubmit`, `c-lab.finalSubmit`, `c-lab.getReview`) are registered.

- **dependency validation:** checks if the `ms-vscode.cpptools` extension is active. If missing, it provides a bulletproof UI prompt guiding the user to install it and reload the window.

- **ui element state:** reveals the "Start Lab" button in the VS Code UI upon activation.

### B. Start Lab: Authentication & Provisioning

- **trigger:** the user executes the "start lab" command via the Command Palette or the UI button.

- **workspace routing:** determines the default `C-Lab-Workspace` folder path and triggers a window reload to eject the current folder and open the secure workspace environment.

- **authentication & normalization:** prompts the user via VS Code input boxes to enter their student number and name (prompts in Korean). The extension immediately normalizes the Korean name input to NFC format to prevent macOS rendering bugs.

- **workspace validation:** verifies the folder is in a "Trusted" state. Enforces the strict auto-save, anti-cheat, and formatting policies.

- **session initialization:** The extension generates a unique `session_id` and calls the `/api/session/start` endpoint with the student credentials and `machine_id`. The backend establishes a completely new, deterministic database shard explicitly formatted for the new session (e.g., `{machine_id}_{session_id}.db`) and responds with a 200 OK.

- **cache initialization:** The extension creates a local secret folder (e.g., `.clab_cache/`) to hold task history during the active session.

- **first task provisioning:** The extension immediately fetches and provisions the skeleton code for the **first task** into `main.c`.

- **task navigation UI:** The primary button morphs into "Mid Submit", and Task Navigation / Next Task buttons are revealed. When clicked:

  1. The extension copies the current state of `main.c` into `.clab_cache/`.

  2. The student selects a new task (or automatically advances if using the Next Task button).

  3. If the selected task exists in `.clab_cache/`, it is restored to `main.c`. 
     If not, a fresh skeleton is generated locally.

- **task generating:** the frontend dynamically seeds PRNG placeholders (e.g., `{{RAND_min_max}}`) within the skeleton code using a pseudo-random number generator bounded by the student ID to issue randomized variables specific to that student.

- **baseline setup:** the extension writes the downloaded skeleton code (or resumed code) to the local lab folder (enforcing UTF-8 encoding), explicitly initializes the text baseline for the background trackers (preventing auto-formatter false positives), and transmits a baseline diff to the server using the custom headers.

- **tracker initialization:** starts the Diff Tracker, Debug Tracker, Policy Watchdog, and File Watcher.

### C. Track A: Diff Data Acquisition (True Delta Patches)

- **delta encoding & baseline anchors:** Instead of transmitting the full file content, the extension calculates true text deltas (patches). **CRITICAL EXCEPTION:** Whenever a task is loaded (either a fresh skeleton OR **navigating back to a cached, previously started task**), the tracker MUST transmit the full file text as a baseline (`is_baseline: true`). Since all tasks share the `main.c` editor window, these periodic baselines guarantee the backend's chronological diff reconstruction engine always has the correct anchor and doesn't accidentally apply a Task 2 patch to a Task 1 history.

- **diff aggregation:** modifications are aggregated into 1-second timestamped intervals.

- **data transmission:** the background worker queue sweeps the lightweight patch payloads and bundles them with other telemetry (security, debug, diagnostics) to push to the unified `/api/track/bulk` endpoint at randomized intervals (60–70 seconds), drastically reducing network packet overhead.

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

- **data transmission:** pushed into the local telemetry worker queue and flushed asynchronously to the backend (`/api/track/bulk`) to avoid blocking the student's main thread UI.

### G. Track E: Final Submission & Review

- **trigger:** the student explicitly clicks the "Final Submission" button (which replaces the "Next Task" button upon reaching the final assignment).

- **confirmation alert:** The extension triggers a popup asking the user to verify their intent in Korean.
  *(Also protected by the frontend debounce lock).*

- **data transmission:**

  - Aggregates the currently active `main.c`, all cached historical files, and the full extension log buffer into a single localized Markdown string.

  - Queues ONLY this generated review document in the `sourceFiles` payload to the telemetry worker (tagged as `final`).

  - closes all open editors.

- **asynchronous fallback:** Submissions share the background worker's requeue mechanism. If the server gets overloaded during the submission spike at the end of the lab, the extension holds the payload in memory and automatically retries on the next interval.

- **review phase:** Immediately serves the locally generated Markdown review document to the student via a read-only virtual text provider (`clab-review://`) to prevent infinite "save" loops.

- **teardown:** The `TelemetryWorker` polling loop AND all local trackers (Diff, Security, Debug) are explicitly and immediately halted to guarantee no further background network syncs or false-positive security logs are generated while the user reviews their feedback.

- **ui transition:** updates status to "done".

### H. Track F: Session Suspend & Teardown

- **trigger:** Unexpected deactivation (closing VS Code), explicitly executing `c-lab.endSession` via the Command Palette during a lab, OR clicking the "End Session" UI button during the final Review Phase.

- **unexpected deactivation (suspend):** If the system detects a deactivation event before a `final` submission, it autonomously builds and queues a backup `mid` submission payload, executing an emergency telemetry flush. It transmits a session termination payload (`/api/session/end`) tagged as `suspended`. **It closes all open editor tabs, executes the strict data destruction policy (zero-byte wipe and delete) on local files.**

- **expected deactivation(cleanup):** The expected "Cleanup" path is now handled directly within Track E (Final Submission), which sets the `sessionCloseReason` to `expected` and relies on the extension's native `deactivate()` hook to perform the zero-trust data wipe and WSL teardown.

- **markdown generation:** Additionally, in both deactivation, the backend automatically generates a readable Markdown dump of the database upon receiving the `completed` termination status.

### I. Track G: Extension Diagnostics

- **trigger:** caught exceptions, network payload failures, or significant extension lifecycle events (e.g., activation failures, workspace ejection).

- **captured data:** log level (INFO, WARN, ERROR), error messages, localized stack traces, VS Code environment data, and the associated student/machine ID context.

- **data transmission:** sent asynchronously to the backend (`/api/track/extension-log`) in a fire-and-forget manner to avoid blocking the student's main thread UI.

## 4. Backend API specification

- `POST /api/session/start`: Validates student data. Applies Unicode-safe regex sanitization to the student's name. **Invalidates any existing sessions for the machine.** Provisions a completely new, stateless SQLite shard specifically bound to the **Machine ID and frontend-generated Session ID** (e.g., `{machine_id}_{session_id}.db`).

- `POST /api/session/end`: Receives the termination status (`suspended` or `completed`) and records the timestamp in the database to explicitly close the session audit log and calculate total lab duration.

- `POST /api/track/bulk`: Receives and routes unified payload streams (diffs, security violations, debug logs, extension logs, and **submissions**) to their respective database tables in the stateless shard.

## 5. Publish Strategy

- **server:** Deploy to the cloud inside a FastAPI container utilizing multi-worker scaling. Enforce `HTTPS` to prevent token theft or differential payload network hijacking. Ensure the container storage for SQLite files is persistent and stateful. Use standard python logging.

- **client:** Publish through the VS Code Marketplace (`vsce publish`). Rely on native auto-updates combined with the forced `enforceVersionCheck` blocking mechanism.
