#database_util.py

import sqlite3
import os
import re
from datetime import date

# THE FIX: Force the path to be absolute relative to this Python file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIRECTORY = os.path.join(BASE_DIR, "databases")
os.makedirs(DB_DIRECTORY, exist_ok=True)

def sanitize_filename(name: str) -> str:
    """Strips out any characters that aren't alphanumeric or underscores."""
    return re.sub(r'[^a-zA-Z0-9_]', '', name)

def get_db_connection(student_number: str, student_name: str, session_name: str) -> sqlite3.Connection:
    """
    Dynamically routes to (or creates) the student's DB for the current date and session.
    """
    # Sanitize inputs to prevent Path Traversal attacks
    safe_number = sanitize_filename(student_number)
    safe_name = sanitize_filename(student_name)
    safe_session = sanitize_filename(session_name)
    
    db_filename = f"{safe_number}_{safe_name}_{safe_session}.db"
    db_path = os.path.join(DB_DIRECTORY, db_filename)

    db_exists = os.path.exists(db_path)

    # Connect to the DB (creates it if it doesn't exist)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    
    # Enable Write-Ahead Logging (WAL) for better concurrency performance
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    
    # Initialize the tables
    if not db_exists:
        _initialize_schema(conn)
    
    return conn

def _initialize_schema(conn: sqlite3.Connection):
    cursor = conn.cursor()
    # Execute the SQL schema defined above
    cursor.executescript("""
        -- Table 1: Session Metadata
        -- Stores the immutable context of this specific DB file.
        CREATE TABLE IF NOT EXISTS session_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_number TEXT NOT NULL,
            student_name TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            os_platform TEXT NOT NULL,
            start_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Table 2: Diff Logs
        -- Tracks the 1-second aggregated code modifications.
        CREATE TABLE IF NOT EXISTS diff_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            diff_payload TEXT NOT NULL -- Can store structured JSON diffs
        );

        -- Table 3: Security & Policy Violations
        -- Logs unauthorized pastes and attempts to tamper with extension settings.
        CREATE TABLE IF NOT EXISTS security_violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            violation_type TEXT NOT NULL,
            file_name TEXT,              -- Can be NULL if it's a global policy violation
            details TEXT NOT NULL
        );

        -- Table 4: Debug Logs
        -- Captures telemetry upon the termination of a debug adapter session.
        CREATE TABLE IF NOT EXISTS debug_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            source_snapshot TEXT NOT NULL,
            breakpoints TEXT NOT NULL,         -- JSON array of file/line locations
            execution_actions TEXT NOT NULL,   -- JSON array of step-over, step-into, etc.
            variable_inspection TEXT NOT NULL, -- JSON object of watch window/hover evals
            output_streams TEXT NOT NULL       -- JSON object for stdout/stderr
        );

        -- Table 5: Submissions
        -- Stores the mid-session and final code commits.
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_type TEXT CHECK(submission_type IN ('mid', 'final')) NOT NULL,
            task_id TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            source_files_snapshot TEXT NOT NULL,   -- JSON mapping of filename -> content
            vscode_config_snapshot TEXT NOT NULL   -- JSON mapping of .vscode configs
        );
                         
        -- Indexes
        -- Speeds up queries that filter by filename when reconstructing file timelines
        CREATE INDEX IF NOT EXISTS idx_diff_logs_filename ON diff_logs(file_name);
                                          
    """)
    conn.commit()
    
