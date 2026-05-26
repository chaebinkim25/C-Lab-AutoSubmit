# server/core/log_messages.py

class LogMsg:

    # System / Main
    STARTUP_INIT = "C-Lab AutoSubmit Backend initializing..."


    # Session Router
    SES_START_REQ = "Start session requested for {student_number} {student_name} on {machine_id} - session {session_id}"
    SES_NEW_ERR = "Failed to create new session: {error}"
    SES_END_REQ = "End session requested for {machine_id}. Status: {status}"
    SES_END_DESYNC = "No active session found to close for {machine_id}. Client may have desynced."


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
    LAB_SUBMIT_TYPE = "[{sub_type}] Submission on {machine_id}"
    ERR_SUBMISSION_FAILED = "Submission failed"
    TRK_EMPTY_PAYLOAD = "Empty bulk payload."
    TRK_QUEUE_FULL = "Telemetry queue is FULL (Thundering Herd). Shedding load for {machine_id}."
    ERR_HIGH_LOAD = "Server is currently experiencing high load. Please retry telemetry later."
    TRK_QUEUE_BACKLOG = "Telemetry queue backlog growing: {q_size} items waiting to write to disk."

    # Lab Submissions
    LAB_MID_SUBMIT = "Received task submission on {machine_id}"
    LAB_FINAL_SUBMIT = "Received FINAL submission on {machine_id} ({file_count} files)"

    # Telemetry / Track
    TRK_BULK_RECV = "Received bulk telemetry from {machine_id})"

    # Database
    DB_PROVISION = "Provisioning new database shard: {db_path}"

    # Exceptions & API Messages
    ERR_DB_PROVISION = "Database provisioning failed."
    ERR_INVALID_STATUS = "Status must be one of {allowed_states}"
    ERR_NO_SESSION_ID = "Database error: Failed to generate a session ID."
    ERR_NO_ACTIVE_SESSION = "No active session found."

    API_NO_ACTIVE_SESSION = "No active session found for machine_id."
    API_NO_SESSION_CLOSE = "No active session found to close."
