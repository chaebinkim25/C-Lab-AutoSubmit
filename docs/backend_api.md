# C-Lab AutoSubmit System: Backend API Specification

## Global Architectural Rules

- **Stateless Identity & Zero-Trust State:** 
  All requests MUST include the student's identity parameters directly via custom HTTP headers:
  `x-machine-id` and `x-session-id`. 
  The backend autonomously extracts these headers to securely route to the correct database shard. There are no session tokens.

- **Database Sharding:** 
  Database shards are dynamically provisioned and queried 
  using the client's machine identifier and a unique session identifier 
  (e.g., `{machine_id}_{session_id}.db`). Operations utilize asynchronous `aiosqlite` with WAL mode enabled.
  **No in-memory session tracking is permitted.** AWS EBS snapshots provide background backups.

- **Single-Sided Information Flow:** 
  The backend operates purely as a secure data sink. It does not send any state, curriculum, timing, configuration data, or tokens to the frontend. All communication is a one-way push from the extension to the server.

---

## 1. Session Lifecycle

### `POST /api/session/start`

Validates student data and sanitizes the Korean name (allowing `[^\w\s-]`). 
**Crucially, it immediately invalidates any previously active sessions associated with this `machine_id`.** 
It takes the frontend-generated `session_id`, provisions a fresh, stateless SQLite shard 
(`{machine_id}_{session_id}.db`), and acknowledges the session.
Every lab start is a completely clean slate.

- **Headers:** `x-machine-id`, `x-session-id`
- **Request Body:**

```json
{
  "student_number": "2026-12345",
  "student_name": "홍길동",
}
```

### `POST /api/session/end`

Records the explicit termination of a session to close the audit log and calculate the total lab duration.

The backend automatically generates a parsed, human-readable Markdown representation of the entire `.db` shard for easy TA review.

- **Headers:** `x-machine-id`, `x-session-id`
- **Request Body:**

```json
{
  "status": "completed", // or "suspended" (if unexpectedly closed)
}
```

---

## 3. Background Telemetry & Tracking

### `POST /api/track/bulk`

A schema-less unified endpoint to dramatically reduce network overhead by combining diff patches, security violations, debug logs, terminal events, extension diagnostics, and code submissions into a single HTTPS payload. Routes directly into a high-speed RAM queue.

- **Headers:** `x-machine-id`, `x-session-id`

- **Request Body:**

```json
{
  "diffs": [
    {
      "sec": 75,
      "file": "lab1_part1.c",
      "is_baseline": false,
      "delta": "@@ -15,4 +15,10 @@\n+int x = 5;\n"
    }
  ],
  "events": [
    {
      "sec": 75,
      "event_type": "Unauthorized Paste",
      "file_path": "src/main.c",
      "line_number": 24,
      "content": "int i = 0; while(i<10) { i++; }"
    }
  ],
  "debug_events": [
    {
      "sec": 77,
      "debug_code": "DBG_STEP_OVER",
      "file_path": "main.c",
      "details": "..."
    }
  ],
  "extension_logs": [
        "45|EXT_FATAL_UNCAUGHT"
      ],
  "terminal_events": [
    {
      "sec": 80,
      "stream": "stdin",
      "content": "./main\n"
    },
    {
      "sec": 81,
      "stream": "stdout",
      "content": "Hello World\n"
    }
  ],
  "submissions": [
    {
      "submission_type": "mid",
      "task_id": "lab11_part1",
      "timestamp": "2026-04-15T09:30:00+09:00",
      "sourceFiles": {
        "main.c": "int main() { return 0; }"
      },
      "vscodeConfigs": {
        ".vscode/settings.json": "{}"
      }
    }
  ]      
}
```
