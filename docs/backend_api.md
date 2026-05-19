# C-Lab AutoSubmit System: Backend API Specification

## Global Architectural Rules

- **Authentication & Zero-Trust State:** 
  With the exception of `/api/check-time` and `/api/session/start`, 
  all requests MUST include a valid stateless JSON Web Token (JWT) 
  in the `Authorization: Bearer <token>` header. 
  The backend autonomously extracts the `student_number`, `machine_id`, and `session_id` 
  from the token claims to securely route to the correct database shard.

- **Database Sharding:** 
  Database shards are dynamically provisioned and queried 
  using the client's machine identifier and a unique session identifier 
  (e.g., `{machine_id}_{session_id}.db`). 
  **No in-memory session tracking is permitted.**

- **Timestamp Standardization:** 
  All temporal data (payloads and database records) 
  **MUST** strictly adhere to the ISO 8601 format with the KST offset: 
  `YYYY-MM-DDTHH:MM:SS+09:00`.

- **Text Encoding:** 
  All file I/O and JSON payloads use UTF-8. Korean string inputs 
  (like `student_name`) must be normalized to NFC (Normalization Form Canonical Composition) 
  by the client prior to transmission.

---

## 1. Initialization & Tasks

### `GET /api/check-time`

Checks if the current server time falls strictly within the scheduled lab hours in KST. 
*(No Auth Required)*

- **Response:**

    ```json
    {
      "is_active_lab_time": true,
      "current_time_kst": "2026-04-15T08:30:00+09:00",
      "required_extension_version": "1.1.0"
    }
    ```

### `GET /api/lab/tasks`

Retrieves the sequence of assignments for the active lab. 
The backend uses the `student_number` extracted from the JWT 
as a PRNG seed to dynamically replace `{{RAND_min_max}}` tags in the skeleton code, 
ensuring each student receives personalized variables.

- **Headers:** `Authorization: Bearer <token>`

- **Response:**
    ```json
    [
      {
        "task_id": "lab1_part1",
        "title": "Simple Addition",
        "description": "return the sum of the two parameters",
        "skeleton_code": "int add(int a, int b) {\n    // Seeded values: 42, 17\n    return 0;\n}"
      }
    ]
    ```

---

## 2. Session Lifecycle

### `POST /api/session/start`

Validates student data and sanitizes the Korean name (allowing `[^\w\s-]`). 
**Crucially, it immediately invalidates/expires any previously active tokens or sessions associated with this `machine_id`.** 
It generates a brand new `session_id`, provisions a fresh, stateless SQLite shard 
(`{machine_id}_{session_id}.db`), and returns a newly signed JWT. 
Every lab start is a completely clean slate.

- **Request Body:**

    ```json
    {
      "student_number": "2026-12345",
      "student_name": "홍길동",
      "machine_id": "a1b2c3d4-e5f6...",
      "timestamp": "2026-04-15T09:00:00+09:00"
    }
    ```

- **Response:**

    ```json
    {
      "status": "started",
      "session_id": "sess_8f92a1b",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```

### `POST /api/session/submit`

Processes and archives code snapshots alongside the workspace configuration. 

The payload structure depends on the `submission_type`. 

**Mid Submission:**

- **Headers:** `Authorization: Bearer <token>`

- **Request Body:**

  Only transmits the currently active task file (e.g., `main.c`).

    ```json
    {
      "submission_type": "mid",
      "task_id": "lab1_part1",
      "timestamp": "2026-04-15T10:15:00+09:00",
      "sourceFiles": {
        "main.c": "int main() { return 0; }"
      },
      "vscodeConfigs": {
        ".vscode/launch.json": "{...}"
      }
    }
    ```

**Final Submission:**

- **Headers:** `Authorization: Bearer <token>`

- **Request Body:**

  Transmits the active file AND all previously saved files from the local secret cache folder.

    ```json
    {
      "submission_type": "final",
      "timestamp": "2026-04-15T12:50:00+09:00",
      "sourceFiles": {
        "review.md": "# C-Lab 실습 최종 리뷰\n\n**학번:** 2026-12345\n..."
      },
      "vscodeConfigs": {}
    }
    ```

### `POST /api/session/end`

Records the explicit termination of a session to close the audit log and calculate the total lab duration.

The backend automatically generates a parsed, human-readable Markdown representation of the entire `.db` shard for easy TA review.

- **Headers:** `Authorization: Bearer <token>`

- **Request Body:**

    ```json
    {
      "status": "completed", // or "suspended" (if unexpectedly closed)
      "timestamp": "2026-04-15T12:55:00+09:00"
    }
    ```

---

## 3. Background Telemetry & Tracking

### `POST /api/track/bulk`

A unified endpoint to dramatically reduce network overhead by combining diff patches, security violations, debug logs, and extension diagnostics into a single HTTP payload.

- **Headers:** `Authorization: Bearer <token>`

- **Request Body:**

    ```json
    {
      "patches": [
        {
          "elapsed_seconds": 75,
          "file_path": "lab1_part1.c",
          "is_baseline": false,
          "delta_patch": "@@ -15,4 +15,10 @@\n+int x = 5;\n"
        }
      ],
      "security_events": [
        {
          "elapsed_seconds": 76,
          "event_type": "Unauthorized Paste",
          "file_path": "src/main.c",
          "line_number": 24,
          "context": "    printf(\"Start\");\n    // Paste occurred here\n    return 0;",
          "content": "int i = 0; while(i<10) { i++; }"
        }
      ],
      "debug_events": [
        {
          "elapsed_seconds": 77,
          "debug_code": "DBG_STEP_OVER",
          "file_path": "main.c",
          "details": "..."
        }
      ],
      "extension_logs": [
        "45|EXT_FATAL_UNCAUGHT|Failed to resolve workspace path"
      ],
      "terminal_events": [
        {
          "elapsed_seconds": 80,
          "stream": "stdin",
          "content": "./main\n"
        },
        {
          "elapsed_seconds": 81,
          "stream": "stdout",
          "content": "Hello World\n"
      ]      
    }
    ```
