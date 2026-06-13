
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

    Note over Student, DB: Phase 1: Pre-Activation
    Student->>VSCode: Opens VS Code
    VSCode->>Student: Remains dormant (No UI shown)

    Note over Student, DB: Phase 2: Session Initialization
    Student->>VSCode: Executes "Start Lab" via Command Palette or UI button (Inputs ID & Name)
    VSCode->>VSCode: Generates local session_id
    VSCode->>Server: POST /api/session/start (Headers: Machine, Session) {student_number, student_name}
    Server->>Server: Invalidates any existing sessions for machine_id
    Server->>DB: Provisions NEW {machine_id}_{session_id}.db
    Server-->>VSCode: 200 OK (JWT Token, session_id)

    VSCode->>VSCode: Initializes hidden .clab_cache/ directory
    VSCode->>VSCode: Generates Seeded Tasks Locally
    VSCode->>Student: Provisions Task 1 into main.c automatically
    VSCode->>Student: Reveals Task Navigation, Next Task & Mid Submit buttons

    Note over Student, DB: Phase 3: Active Coding & Background Telemetry
    Student->>VSCode: Modifies code in main.c
    loop Every 60-70 seconds (Jittered)
         VSCode->>Server: POST /api/track/bulk (Headers: Machine, Session) {patches, security_events...}
         Server->>DB: Archives telemetry payload to session shard
    end

    Student->>VSCode: Pastes code from StackOverflow
    VSCode->>VSCode: Detects external paste (not in diffBuffer)
    VSCode->>Student: Executes native VS Code 'Undo' + Korean Warning
    VSCode->>VSCode: Queues security violation for bulk transmission    

    Note over Student, DB: Phase 4: Silent Mid Submission & Navigation
    Student->>VSCode: Clicks "Mid Submission"
    VSCode->>VSCode: Queues mid submission for bulk transmission
    Note over VSCode, Server: Executes silently. Only main.c is sent.

    Student->>VSCode: Clicks "Next Task"
    VSCode->>VSCode: Copies current main.c state into .clab_cache/lab1_part1.c
    VSCode->>Student: Provisions Task 2 skeleton into main.c

    Note over Student, DB: Phase 5: Final Submission & Review
    Note over Student, VSCode: Student reaches final task; Next Task button becomes Final Submission
    Student->>VSCode: Clicks "Final Submission"
    VSCode->>Student: Shows Confirmation Dialog (Korean)
    Student->>VSCode: Accepts
    VSCode->>VSCode: Bundles main.c PLUS all files in .clab_cache/
    VSCode->>VSCode: Generates Review MD and Queues Final Submission
    VSCode->>Server: POST /api/track/bulk (Emergency Flush) {submissions: [final payload], ...}
    Server->>DB: Saves final snapshot & telemetry    

    VSCode->>Student: Opens Read-Only Virtual Document (clab-review://)

    Note over Student, DB: Phase 6: Zero-Trust Teardown (Deactivation)
    Student->>VSCode: Clicks "End Session" (Review Phase) or Closes VS Code
    VSCode->>Server: POST /api/session/end (Headers: Machine, Session) {status: completed, timestamp}
    Server->>DB: Closes Session Audit Log & calculates duration
    Server->>Server: Generates parsed Markdown dump of DB shard
    VSCode->>VSCode: ZERO-TRUST WIPE: Overwrites main.c & .clab_cache/ with 0x00 bytes
    VSCode->>VSCode: Permanently deletes files & session memory
    VSCode->>VSCode: Deactivates Extension UI
```

---

## Detailed Chronological Breakdown

### Phase 1: Pre-Activation (Dormant State)
* **Trigger:** VS Code boots up.
* **API Called:** None
* **Logic:** The extension does not activate on startup. It remains completely dormant and consumes no background resources. The student must explicitly wake the extension and launch the lab manually via the Command Palette (`C-Lab: Start Lab Session`).

### Phase 2: Ephemeral Initialization (Clean Slate)
* **Trigger:** User manually executes "Start Lab" via Command Palette or UI button and inputs `2026-12345` and `홍길동`.
* **API Called:** `POST /api/session/start`
* **Logic:** The frontend receives the student credentials and autonomously generates a unique `session_id`. The server receives the IDs and provisions a fresh SQLite shard (`e5f6..._sess_8f92.db`). Operating under a single-sided information flow, the frontend generates the seeded tasks locally, clears the workspace, initializes the secret `.clab_cache/` folder, automatically provisions the first task into `main.c`, and explicitly sets the initial text baseline for the background trackers. All subsequent network requests will include the routing IDs in custom headers.

### Phase 3: Background Telemetry (The Watchdogs)
* **Trigger:** Student begins typing and testing code.
* **APIs Called:** Unified Background Telemetry Polling via `/api/track/bulk`
* **Logic:** The Diff Tracker aggregates keystrokes into 1-second chunks and fires patches to the server using the custom Session Headers. When the student attempts an unauthorized external paste, the Security Tracker intercepts it, hits "Undo", and immediately queues a violation payload (including the pasted text and surrounding lines).

### Phase 4: Cache Navigation & Silent Submits
* **Trigger:** Student wishes to save progress on Task 1 and move to Task 2.
* **APIs Called:** Queued for `POST /api/track/bulk`.
* **Logic:** The student clicks "Mid Submission". The extension executes a *silent* submit, queuing **only** the `main.c` file payload to save bandwidth. The student then clicks the "Next Task" button. The extension secretly copies the contents of `main.c` into `.clab_cache/lab1_part1.c`, pauses security tracking, injects the new skeleton for Task 2 into the editor, and resets the tracking baselines.

### Phase 5: Final Review Generation
* **Trigger:** Student reaches the last task (Next Task button morphs into Final Submission), finishes, and clicks "Final Submission".
* **APIs Called:** Emergency flush via `POST /api/track/bulk`.
* **Logic:** After user confirmation, the extension sweeps the workspace. It bundles the active `main.c` **and** all historical tasks saved in the `.clab_cache/` directory. It then autonomously generates a local amalgamated Markdown review from the cached files, queues it as a `final` submission, and triggers an immediate emergency flush of the telemetry worker to deliver it. The review is then displayed via a read-only virtual text provider (`clab-review://`) to prevent infinite "save" loops.

### Phase 6: Zero-Trust Teardown (Burn on Close)
* **Trigger:** The student explicitly clicks the morphed "End Session" button after reviewing their feedback, or unexpectedly closes VS Code mid-session.
* **API Called:** `POST /api/session/end`.
* **Logic:** The extension fires the termination status (`completed` or `suspended`) to close the database audit log. The backend finalizes the log and generates a static Markdown dump for the TA. Locally, the extension initiates the **DoD-style wipe**: It targets `main.c` and everything inside `.clab_cache/`, overwrites the sectors with `0x00` null bytes, permanently deletes them, drops the session identifiers from memory, and safely resets the UI back to the idle `start` state. The machine is left completely clean for the next student.
