### Source File Tree

```text
C-Lab-AutoSubmit/
├── doc/
│   ├── backend_api.md
│   ├── checklist.md
│   ├── file_tree.md
│   ├── frontend_api.md
│   ├── master_context.md
│   ├── to_do.md
│   └── use_case_scenario.md
├── script/
│   ├── amalgamate.py
│   └── inspect_db.py
├── server/
│   ├── api/routers/
│   │   ├── lab.py
│   │   ├── session.py
│   │   ├── system.py
│   │   └── track.py
│   ├── core/
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── log_messages.py
│   │   ├── logger.py
│   │   ├── queries.py
│   │   ├── services.py
│   │   └── time_utils.py
│   ├── data/
│   │   ├── define_task_json.py
│   │   └── tasks.json
│   └── main.py
└── src/
    ├── api/
    │   └── client.ts
    ├── commands/
    │   ├── nextTask.ts
    │   ├── navigateTask.ts
    │   ├── getReview.ts
    │   ├── startLab.ts
    │   ├── taskHelpers.ts
    │   └── submitTask.ts
    ├── providers/
    │   └── reviewProvider.ts
    ├── test/
    │   └── extension.test.ts
    ├── trackers/
    │   ├── debugTracker.ts
    │   ├── diffTracker.ts
    │   ├── securityTracker.ts
    │   ├── terminalTracker.ts
    │   └── telemetryWorker.ts
    ├── utils/
    │   ├── config.ts
    │   ├── dependencies.ts
    │   ├── machineID.ts
    │   ├── messages.ts
    │   ├── policies.ts
    │   ├── reviewGenerator.ts
    │   ├── secureWipe.ts
    │   ├── time.ts
    │   ├── token.ts
    │   ├── workspace.ts
    │   └── wslTeardown.ts
    ├── extension.ts
    └── ui.ts
```

---

### Part 0: Documentation & Scripts

**`doc/`**
- Contains the master context, system specifications, architectural rules, to-do checklists, and end-to-end use case scenarios for the C-Lab AutoSubmit system.

**`script/`**
- **`amalgamate.py`**: A python utility script used to merge all project source files into a single text document for LLM context ingestion.
- **`inspect_db.py`**: A diagnostic script that connects to a specific SQLite session shard, decodes URL-encoded/JSON payloads, and dumps the raw telemetry data into a readable Markdown format for debugging.

---

### Part 1: Server (FastAPI Backend)

The backend is a stateless, KST-bound Python application using FastAPI and dynamic SQLite sharding to handle high-concurrency lab sessions.

**`server/api/routers/` (API Layer)**
- **`lab.py`**: Manages the core curriculum workflow. Contains endpoints to fetch initial tasks, process intermediate ("mid") code submissions, handle final submissions, and generate markdown-based code reviews.
- **`session.py`**: Handles student authentication and session state. It routes students to the correct database shard, drops old resume logic to enforce a clean slate per launch, and cleanly closes sessions.
- **`system.py`**: Contains system-level health checks, specifically the `check-time` endpoint that enforces strict KST lab operating hours (e.g., Wednesdays 17:00–18:00) before allowing the VS Code extension to activate.
- **`track.py`**: The ingestion layer for the extension's telemetry. Receives batched payloads of diffs, security violations (like unauthorized pasting), debug events, and extension logs.

**`server/core/` (Business Logic & Data Access)**
- **`auth.py`**: Handles JWT claims/signing on the backend.
- **`database.py`**: Manages SQLite connections. Implements a daily, student-specific sharding strategy (`YYYY-MM-DD_KST_{student_number}.db`) with WAL (Write-Ahead Logging) enabled to handle concurrent writes without locking issues.
- **`log_messages.py`**: A centralized dictionary of string templates used for system logging and API error responses.
- **`logger.py`**: Configures the global logging system to enforce strict ISO 8601 KST timestamps across console and rotating file logs.
- **`queries.py`**: Contains all raw SQL executions. Designed to be stateless, where every query explicitly requires the student number to route to the correct shard.
- **`services.py`**: The business logic orchestrator. It loads the curriculum JSON, calculates task progression, and dynamically injects deterministic random values and student metadata into the C skeleton code before sending it to the client.
- **`time_utils.py`**: Global time utilities that force the Python runtime into the `Asia/Seoul` timezone and format KST timestamps.

**`server/data/` (Curriculum Data)**
- **`define_task_json.py`**: A utility script used by instructors to convert a Python dictionary of lab tasks (titles, descriptions, and skeleton C code) into the final JSON format.
- **`tasks.json`**: The static database of curriculum tasks consumed by `services.py`.

**`server/main.py`**
- The entry point for the FastAPI application. Aggregates the routers, initializes global logging, and configures the Uvicorn server.

---

### Part 2: Source (VS Code Extension Frontend)

The frontend is a TypeScript VS Code extension acting as a zero-trust, heavily monitored lab client that strictly controls the student's local environment.

**`src/` (Entry & UI)**
- **`extension.ts`**: The extension's lifecycle manager. Handles activation logic (time-checking, dependency validation), registers commands, and executes the "Zero-Trust Teardown" sequence (wiping files and killing WSL) upon deactivation.
- **`ui.ts`**: Manages the VS Code Status Bar state (Start, Mid Submit, Final Submit) and wraps native input dialogs for student authentication.

**`src/api/` & `src/providers/`**
- **`client.ts`**: A minimal HTTP client used at startup to ping the backend's `/api/check-time` endpoint to determine if the extension should wake up or remain dormant.
- **`reviewProvider.ts`**: Implements a custom `TextDocumentContentProvider`. It catches `clab-review://` URIs to render the markdown code reviews returned by the server natively within VS Code.

**`src/commands/` (User Actions)**
- **`startLab.ts`**: The initialization sequence. Authenticates the student, enforces workspace policies, and spins up the telemetry trackers. Delegates the actual file provisioning of the first task to `taskHelpers.ts`.
- **`navigateTask.ts`**: Triggered by the task navigation UI. Opens a QuickPick menu for the student to jump to a specific task, relying on `taskHelpers.ts` for the swap.
- **`nextTask.ts`**: Triggered by the Next Task UI button. Calculates the next sequential task index and initiates the swap.
- **`getReview.ts`**: Fetches the review data from the backend and triggers the native markdown preview using the custom `reviewProvider`.
- **`taskHelpers.ts`**: Centralizes the heavy lifting for file swapping, cache saving, tracker pausing, and UI updates, ensuring DRY principles across the task navigation commands.
- **`submitTask.ts`**: Handles both mid and final submissions. Mid-submissions silently package the active file, while final submissions bundle all cached files and trigger the session teardown.

**`src/trackers/` (Telemetry & Surveillance)**
- **`debugTracker.ts`**: Hooks into the Debug Adapter Protocol (DAP). It tracks how students navigate their code (step over, step into, breakpoints) and captures compilation errors/warnings.
- **`diffTracker.ts`**: Monitors all keystrokes in the workspace. Uses `diff-match-patch` every second to compute minimal delta patches of the student's code evolution.
- **`securityTracker.ts`**: The anti-cheat engine. Tracks when the window loses focus, when files are created/deleted, and calculates if a "paste" event originated from an external source or internal refactoring.
- **`telemetryWorker.ts`**: A background job that safely pulls data from the other three trackers and transmits it to the backend at randomized intervals (10-20 seconds) to prevent server DDoS spikes.

**`src/utils/` (System Enforcement & Helpers)**
- **`dependencies.ts`**: Validates that Microsoft's C/C++ extension is installed before allowing the lab to start.
- **`machineID.ts`**: Generates and retrieves a persistent UUID v4 tied to the local machine to prevent session hijacking.
- **`messages.ts`**: A centralized dictionary of frontend UI strings, error messages, and log formats.
- **`policies.ts`**: Overrides VS Code workspace settings to enforce educational constraints (e.g., forcing 8-space tabs, disabling Copilot) and sets up a watchdog to alert if the student tampers with them.
- **`secureWipe.ts`**: Contains functions to perform a DoD-style wipe (overwriting sectors with null bytes) of student code upon session termination.
- **`time.ts`**: Frontend generator for ISO 8601 KST timestamps.
- **`token.ts`**: Interfaces with VS Code's `globalState` or `SecretStorage` securely.
- **`workspace.ts`**: Enforces workspace trust and directory naming. If a student is on Windows, it automatically provisions a directory inside WSL and forces VS Code to reboot into the Linux environment.
- **`wslTeardown.ts`**: Executes a command to forcefully terminate the WSL Linux distribution (`wsl.exe -t <distro>`) when the session ends, ensuring no background compilation processes survive.
