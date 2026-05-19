
# C-Lab AutoSubmit System: End-to-End Use Case & API Flow

This document outlines a standard "Happy Path" mixed with a security violation to illustrate the chronological flow of API calls, local state changes, and zero-trust policies throughout a typical lab session.

## Visual Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant VSCode as VS Code Extension
    participant Server as FastAPI Backend
    participant DB as SQLite Shard (machine_session.db)

    Note over Student, DB: Phase 1: Activation & Time Check
    Student->>VSCode: Opens VS Code
    VSCode->>Server: GET /api/check-time
    Server-->>VSCode: 200 OK (is_active_lab_time: true)
    VSCode->>Student: Reveals "Start Lab" button in UI

    Note over Student, DB: Phase 2: Session Initialization
    Student->>VSCode: Clicks "Start Lab" (Inputs ID & Name)
    VSCode->>Server: POST /api/session/start {machine_id, student_number, NFC name}
    Server->>Server: Invalidates any existing tokens/sessions for machine_id
    Server->>DB: Provisions NEW {machine_id}_{session_id}.db
    Server-->>VSCode: 200 OK (JWT Token, session_id)

    VSCode->>VSCode: Initializes hidden .clab_cache/ directory
    VSCode->>Server: GET /api/lab/tasks (Bearer <JWT>)
    Server-->>VSCode: Tasks JSON (with PRNG seeds applied)
    VSCode->>Student: Provisions Task 1 into main.c automatically
    VSCode->>Student: Reveals Task Navigation, Next Task & Mid Submit buttons

    Note over Student, DB: Phase 3: Active Coding & Background Telemetry
    Student->>VSCode: Modifies code in main.c
    loop Every 10-20 seconds (Jittered)
        VSCode->>Server: POST /api/track/diff {Bearer <JWT>, delta_patch}
        Server->>DB: Archives diff payload to session shard
    end

    Student->>VSCode: Pastes code from StackOverflow
    VSCode->>VSCode: Detects external paste (not in diffBuffer)
    VSCode->>Student: Executes native VS Code 'Undo' + Korean Warning
    VSCode->>Server: POST /api/track/security-violation {Bearer <JWT>, context, line_num}
    Server->>DB: Logs violation

    Note over Student, DB: Phase 4: Silent Mid Submission & Navigation
    Student->>VSCode: Clicks "Mid Submission"
    VSCode->>Server: POST /api/session/submit {Bearer <JWT>, type: mid, sourceFiles: [main.c]}
    Note over VSCode, Server: Executes silently. Only main.c is sent.
    Server->>DB: Saves mid snapshot

    Student->>VSCode: Clicks "Next Task"
    VSCode->>VSCode: Copies current main.c state into .clab_cache/lab1_part1.c
    VSCode->>Student: Provisions Task 2 skeleton into main.c

    Note over Student, DB: Phase 5: Final Submission & Review
    Note over Student, VSCode: Student reaches final task; Next Task button becomes Final Submission
    Student->>VSCode: Clicks "Final Submission"
    VSCode->>Student: Shows Confirmation Dialog (Korean)
    Student->>VSCode: Accepts
    VSCode->>VSCode: Bundles main.c PLUS all files in .clab_cache/
    VSCode->>Server: POST /api/session/submit {Bearer <JWT>, type: final, sourceFiles: [main.c, task1.c]}
    Server->>DB: Saves final snapshot

    VSCode->>Student: Opens Read-Only Virtual Document (clab-review://)

    Note over Student, DB: Phase 6: Zero-Trust Teardown (Deactivation)
    Student->>VSCode: Clicks "End Session" (Review Phase) or Closes VS Code
    VSCode->>Server: POST /api/session/end {Bearer <JWT>, status: completed}
    Server->>DB: Closes Session Audit Log & calculates duration
    Server->>Server: Generates parsed Markdown dump of DB shard
    VSCode->>VSCode: ZERO-TRUST WIPE: Overwrites main.c & .clab_cache/ with 0x00 bytes
    VSCode->>VSCode: Permanently deletes files & token memory
    VSCode->>VSCode: Deactivates Extension UI
```

---

## Detailed Chronological Breakdown

### Phase 1: Activation (Dormant State)
* **Trigger:** VS Code boots up.
* **API Called:** `GET /api/check-time`
* **Logic:** The extension does not ask for credentials yet. It anonymously pings the server to see if it is currently official lab hours in KST. If `false`, the extension remains totally invisible. If `true`, the "Start Lab" UI button is exposed.

### Phase 2: Ephemeral Initialization (Clean Slate)
* **Trigger:** User clicks "Start Lab" and inputs `2026-12345` and `홍길동`.
* **API Called:** `POST /api/session/start`
* **Logic:** The server receives the machine ID and student data. The server **strictly expires** any previous token associated with this machine, creating a completely new stateless `session_id`. A fresh SQLite shard is spawned (`e5f6..._sess_8f92.db`). The frontend receives the JWT, clears the workspace, initializes the secret `.clab_cache/` folder, automatically provisions the first task into `main.c`, and explicitly sets the initial text baseline for the background trackers.

### Phase 3: Background Telemetry (The Watchdogs)
* **Trigger:** Student begins typing and testing code.
* **APIs Called:** `POST /api/track/diff` (Periodic) & `POST /api/track/security-violation` (Event-driven).
* **Logic:** The Diff Tracker aggregates keystrokes into 1-second chunks and fires patches to the server every ~15 seconds using the JWT. When the student attempts an unauthorized external paste, the Security Tracker intercepts it, hits "Undo", and immediately fires a violation payload (including the pasted text and surrounding lines) to the server.

### Phase 4: Cache Navigation & Silent Submits
* **Trigger:** Student wishes to save progress on Task 1 and move to Task 2.
* **APIs Called:** `POST /api/session/submit` (mid).
* **Logic:** The student clicks "Mid Submission". The extension executes a *silent* submit, sending **only** the `main.c` file to save bandwidth. The student then clicks the "Next Task" button. The extension secretly copies the contents of `main.c` into `.clab_cache/lab1_part1.c`, pauses security tracking, injects the new skeleton for Task 2 into the editor, and resets the tracking baselines.

### Phase 5: Final Review Generation
* **Trigger:** Student reaches the last task (Next Task button morphs into Final Submission), finishes, and clicks "Final Submission".
* **APIs Called:** `POST /api/session/submit` (final).
* **Logic:** After user confirmation, the extension sweeps the workspace. It bundles the active `main.c` **and** all historical tasks saved in the `.clab_cache/` directory, sending them in a massive final payload. It then autonomously generates a local amalgamated Markdown review from the cached files and displays it via a read-only virtual text provider (`clab-review://`) to prevent infinite "save" loops.

### Phase 6: Zero-Trust Teardown (Burn on Close)
* **Trigger:** The student explicitly clicks the morphed "End Session" button after reviewing their feedback, or unexpectedly closes VS Code mid-session.
* **API Called:** `POST /api/session/end`.
* **Logic:** The extension fires the termination status (`completed` or `suspended`) to close the database audit log. The backend finalizes the log and generates a static Markdown dump for the TA. Locally, the extension initiates the **DoD-style wipe**: It targets `main.c` and everything inside `.clab_cache/`, overwrites the sectors with `0x00` null bytes, permanently deletes them, drops the JWT token from memory, and safely resets the UI back to the idle `start` state. The machine is left completely clean for the next student.
