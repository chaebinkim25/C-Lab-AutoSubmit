# server/core/log_messages.py

class LogMsg:

    # Auth
    AUTH_NO_SECRET = "JWT_SECRET environment variable not set! Falling back to unsafe default."
    ERR_AUTH_CLAIMS = "Invalid token claims"
    ERR_AUTH_EXPIRED = "Token expired"
    ERR_AUTH_INVALID = "Invalid token"

    # Background Tasks
    BKP_START = "Background backup worker started. Interval: {interval_seconds}s"
    BKP_SUCCESS = "Successfully backed up database shards via EBS Snapshot: {snapshot_id}"
    BKP_FAIL = "Failed to create database backup: {error}"
    INGEST_START = "Telemetry ingestion worker started."
    INGEST_CRITICAL = "CRITICAL: Error in telemetry worker loop: {error}"

    # Endpoints
    SES_DUMP_GEN = "Generated server-side DB markdown dump at {dump_path}"
    ERR_SES_DUMP = "Failed to generate server-side DB markdown dump: {error}"
    LAB_SUBMIT_TYPE = "[{sub_type}] Submission from {student_number}"
    ERR_SUBMISSION_FAILED = "Submission failed"
    TRK_EMPTY_PAYLOAD = "Empty bulk payload."
    TRK_QUEUE_FULL = "Telemetry queue is FULL (Thundering Herd). Shedding load for {student_number}."
    ERR_HIGH_LOAD = "Server is currently experiencing high load. Please retry telemetry later."
    TRK_QUEUE_BACKLOG = "Telemetry queue backlog growing: {q_size} items waiting to write to disk."

    # System / Main
    STARTUP_INIT = "C-Lab AutoSubmit Backend initializing..."
    STARTUP_TIME = "Strict KST Time-Binding and ISO 8601 formatting active."
    TIME_CHECK = "Time check requested from {ip}. Active status: {is_active_lab_time}"

    # Lab Router
    LAB_NO_CURRICULUM = "CRITICAL: Curriculum file not found at {path}"
    LAB_LOADED = "Successfully loaded {count} lab tasks from curriculum.json"
    LAB_PARSE_FAIL = "CRITICAL: Failed to parse curriculum.json. Invalid JSON format: {error}"
    LAB_FETCH_TASKS = "Fetching seeded tasks for student: {student_number}"
    LAB_MID_SUBMIT = "Received task submission from {student_number} on {machine_id} ({file_count} files)"
    LAB_FINAL_SUBMIT = "Received FINAL submission from {student_number} on {machine_id}"

    # Session Router
    SES_START_REQ = "Start session requested for {student_number} {student_name} on {machine_id}"
    SES_NEW_SHARD = "No active session. Provisioning new shard for {student_number} {student_name}"
    SES_NEW_ERR = "Failed to create new session: {error}"
    SES_END_REQ = "End session requested for {student_number}. Status: {status}"
    SES_END_DESYNC = "No active session found to close for {student_number}. Client may have desynced."

    # Telemetry / Track
    TRK_BULK_RECV = "Received bulk telemetry from {student_number} on {machine_id} (Patches: {p}, Sec: {s}, Dbg: {d}, Logs: {l}, Term: {t})"

    # Database
    DB_PROVISION = "Provisioning new database shard: {db_path}"

    # Exceptions & API Messages
    ERR_NO_CURRICULUM = "Curriculum missing in server."
    ERR_DB_PROVISION = "Database provisioning failed."
    ERR_INVALID_STATUS = "Status must be one of {allowed_states}"
    ERR_NO_SESSION_ID = "Database error: Failed to generate a session ID."
    ERR_NO_ACTIVE_SESSION = "No active session found."

    API_NO_ACTIVE_SESSION = "No active session found for machine_id."
    API_NO_SESSION_CLOSE = "No active session found to close."
