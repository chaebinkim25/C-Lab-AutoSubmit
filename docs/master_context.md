# Project Master Context
- **name:** C-Lab AutoSubmit System
- **purpose:** assist with C programming computer lab sessions by logging coding behavior and automating code submissions.
- **target:** cybersecurity freshman attending a C programming class, and teaching assistants monitoring the lab sessions.

## 1. Tech Stack
- **client - VS code extension:** TypeScript, VS Code Extension API
- **server - backend API:** Python, FastAPI
- **database:** SQLite (sharded architecture: a separate `.db` file is dynamically generated per student, per date, and per session; write-ahead logging mode enabled)

## 2. Core Policies
1. **no login:** when start a session, the student inputs his/her student number and name for identification. This ID information must be included in all backend communications.
2. **class time sync:** the extension is only active during scheduled lab hours and deactivates automatically outside of these times.
3. **clean up:** upon deactivation, the extension overwrites the session's source file with blank content before permanently deleting it.
4. **auto save:** while the extension is active, it overrides the workspace settings to force `files.autoSave` with a 1-second delay.
5. **machine ID:** upon the first execution of the extension, a `machine_id` is generated and saved locally. This ID must be included in all subsequent network communications.

## 3. Core Workflows

### A. Activation: initialization to idle state
- **trigger:** the extension activates when VS Code opens.
- **command registration:** the internal `c-lab.startLab`, `c-lab.midSubmit`, `c-lab.finalSubmit`, `c-lab.cleanup` commands are registered.
- **time validation:** the extension fires a one-off call to `/api/check-time` endpoint to check if now is the lab time. 
- **state handling:**
  - **if `false` (not class time):** the extension remains invisible. No UI elements like status bar items or sidebar views are rendered.
  - **if `true` (class time):** the remaining startup logic is executed.
- **update check:** if the version is not current, it waits until the auto-update process is complete. During this time it displays an "updating..." button in the VS Code UI, whcih opens extension pane when clicked.
- **dependency validation:** check current os platform and cpptools extensions. 
- **ui element reveal:** once the extension is confirmed to be up-to-date, it reveals the "start lab" button in the VS Code UI.

### B. Start Lab: authentication state
- **trigger:** the user executes the "start lab" command, either via the UI or the command palete.
- **state validation:** if the lab had already started, display an alert message indicating that the session is active. The extension remains in phase 3: active lab session.
- **time validation:** the extension fires a one-off call to `/api/check-time`. If it is not lab time, display an alert message indicating this. The extension remains in phase 1: initialization.
- **user identification:** if validated, prompt the user via VS Code `InputBox` prompts to enter their student number and name.
- **session initialization:** the extension calls the `/api/start-session` endpoint.
  - **payload:** student number, student name, and local `machine_id`. 
  - **response:** the server registers the session and returns the first C programming skeleton code.
- **workspace validation:** the extension ensures the designated lab folder is open and checks if the VS Code Workspace is trusted. Create the designated source file. Applies the 1-second `file.autoSave` override policy.
- **workspace setup:** the extension writes the downloaded skeleton code to the local lab folder.
- **ui transition:** the UI button updates its text and command binding from "start lab" to "mid submission", if there is more skeleton codes left, otherwise, "final submission".
- **progression:** the students works and submits. If there is more work to do, passing a mid-submission might triger the download of the next skeleton code. 

### C. Track A: Diff Data Acquisition
- **diff aggregation:** all code modifications are captured and aggregated into 1-second timestamped intervals for each file.
- **data transmission:** the aggregated diff payloads are sent to the backend server at randomized intervals between 10 and 20 seconds. 

### D. Track B: Paste Detection
- **restriction:** copying and pasting code from external sources is strictly prohibited. 
- **exception:** pasting whitespace, formatting adjustments, internal duplications from the student's currently active source file, and the initial skeleton code insertion are permitted.
- **enforcement policy:** upon detecting an unauthorized paste event, the extension automatically undoes the action and transmits a violation log to the server containing the full content of the pasted text. 

### E. Track C: Debug Logic Details
- **method:** utilizes the `DebugAdapterTracker` API to intercept and read debug adpter protocol messages.
- **captured data:** 
  - **snapshot:** a complete snapshot of the active source code at the time the debug session is initiated.
  - **breakpoints:** the specific locations (file and line numbers) of all registered breakpoints.
  - **execution actions:** developer navigation commands, including start, step-over, step-into, continue, and stop debugging.
  - **variable inspection:** evaluated expressions from the watch window, data retrieved via mouse-hover interactions, and all input/output processed through the debug console.
  - **output:** standard streams (`stdout` and `stderr`) along with internal debug event details.
- **data transmission:** all tracked debug telemetry is aggregated into a single payload and send to the backend server immediately upon the termination of the debug session.

### F. Track D: Mid Submission
- **trigger:** the student clicks mid submission button located in the VS Code status bar. 
- **data transmission:** a complete snapshot of the all current source files and the workspace's `.vscode` configuration files is transmitted to the backend server. 
- **workspace setup:** the extension clears the active editor content, replaces it with the next sequence of skeleton code.
- **ui transition:** If the newly loaded skeleton code is the final one in the sequence, the extension updates the UI button from "mid submission" to "final submission".
- **baseline initialization:** once the extension downloads and writes the initial skeleton code to the workspace, it transmits this code back to the server to establish the baseline for all subsequent diff tracking. 

### G. Track E: Final Submission & Review
- **trigger:** the student clicks final submission button located in the VS Code status bar.
- **data transmission:** a complete snapshot of the all current source files and the workspace's `.vscode` configuration files is transmitted to the backend server.
- **execution:**
  - the final code is sent to the backend.
  - the extension immediately overwrites the active source file with an empty string to wipe it from memory/disk caches.
  - the extension deletes the local file completely.
  - the extension closes all editors.
  - amalgamated markdown of all submitted source codes is downloaded from the backend and the extension displays the markdown in read-only editor tabs for the students to review. 
  - the UI button in the status bar updates its text and command binding from "final submission" to "end session".

### H. Track F: Session End & Cleanup
- **trigger:** the student clicks end session button located in the VS Code status bar.
- **execution & wipe:**
  - the extension deletes the read-only review markdown.
  - the extension closes all editors and the workspace folder.
  - the ui hides until the next valid class time.


## 4. Backend API specification
- `GET /api/check-time`: returns a boolean indicating whether the current time falls within scheduled lab hours.
- `GET /api/lab/tasks`: retrieves the list of skeleton code assignments for the current day's session.
- `GET /api/lab/submissions`: retrieves amalgamated markdown of all submitted codes of the student. 
- `POST /api/session/start`: initializes a lab session by registering the student's number, name, machine id, and operating system. Dynamically provisions the dedicated SQLite database file for the student's current session.
- `POST /api/track/diff`: receives and stores the aggregated 1-second source code modification diffs.
- `POST /api/track/debug`: captures a complete snapshot of the all current source files and the workspace's `.vscode` configuration files
- `POST /api/track/debug-log`: receives and logs the detailed telemetry data from a completed debug session. 
- `POST /api/session/submit`: process and stores both mid-session and final code submissions, including workspace configuration snapshots.

## 5. Publish Strategy
- **server:** to cloud with FastAPI container. apply `HTTPS` to prevent `machine_id` hijacking.
- **client:** VS Code Marketplace publishing(`vsce publish`). auto update. 
