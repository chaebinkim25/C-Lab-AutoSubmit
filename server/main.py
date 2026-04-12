# main.py
from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import BaseModel
from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from database_util import get_db_connection
import os
import json
import copy
import random
import re
import logging
from logging.handlers import RotatingFileHandler

# --- Global File Path ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Configuration: Logging ---
LOG_FILE = os.path.join(BASE_DIR, "c_lab_api.log")

# Context Filter to handle Student Number, IP, AND Machine ID
class ContextFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'student_number'):
            record.student_number = "SYSTEM"
        if not hasattr(record, 'ip_address'):
            record.ip_address = "LOCAL"
        if not hasattr(record, 'machine_id'):
            record.machine_id = "NO_HW_ID"
        return True
    
# Create a custom logger
logger = logging.getLogger("C-Lab-API")
logger.setLevel(logging.DEBUG)
logger.addFilter(ContextFilter()) # Attach the filter

# Create handlers (File and Console)
# 5MB per file, keep 5 backups
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=5)
console_handler = logging.StreamHandler()

# Create formatters and add it to handlers
log_format = logging.Formatter('%(asctime)s - [%(levelname)s] - [%(ip_address)s] - [%(machine_id)s] - [%(student_number)s] - %(message)s')
file_handler.setFormatter(log_format)
console_handler.setFormatter(log_format)

# Add handlers to the logger
logger.addHandler(file_handler)
logger.addHandler(console_handler)

logger.info("Starting C-Lab AutoSubmit API Server...")

app = FastAPI(title="C-Lab AutoSubmit API")

# Explicitly define the timezone as KST
KST = ZoneInfo("Asia/Seoul")

# --- Configuration: Define Lab Hours ---
# 0 = Monday, 1 = Tuesday, ..., 4 = Friday
LAB_DAY_OF_WEEK = 2 
LAB_START_TIME = time(7, 0)   # 07:00 AM
LAB_END_TIME = time(13, 0)    # 01:00 PM

# --- Response Model ---
class TimeCheckResponse(BaseModel):
    is_lab_time: bool
    current_server_time: str
    required_version: str

@app.get("/api/check-time", response_model=TimeCheckResponse)
def check_time():
    """
    Checks if the current server time falls within the scheduled lab hours in KST.
    """
    # Force datetime to evaluate the current time in KST
    now = datetime.now(KST)
    current_time = now.time()
    current_day = now.weekday()

    # Validate against day of the week and time bounds
    is_active = (
        current_day == LAB_DAY_OF_WEEK and
        LAB_START_TIME <= current_time <= LAB_END_TIME
    )

    return TimeCheckResponse(
        is_lab_time=is_active,
        current_server_time=now.isoformat(),
        required_version="1.0.5"
    )

# --- Response Models ---
class TaskItem(BaseModel):
    task_id: str
    title: str
    description: str
    skeleton_code: str

# --- Cache Variables ---
_cached_tasks = None
_last_mtime = 0.0

_default_task = {
    "task_id": "c lab",
    "title": "base code",
    "description": "minimal code with main function definition.",
    "skeleton_code": 
"""
int main(void)
{
        return 0;
}
"""
}

# --- File Path ---
TASKS_JSON_PATH = os.path.join(BASE_DIR, "tasks.json")

@app.get("/api/lab/tasks", response_model=List[TaskItem])
def get_lab_tasks(request: Request, student_id: str = "unknown"):
    """
    Retrieves the ordered list of skeleton code assignments for the current day's session.
    The client uses the length of this list to manage the UI state (mid vs final submission).
    Based on student_id, replace {{RAND_min_max}} tag to randomized integer. 
    """
    global _cached_tasks, _last_mtime
    client_ip = request.client.host if request.client else "UNKNOWN"
    
    try:
        current_mtime = os.path.getmtime(TASKS_JSON_PATH)

        if _cached_tasks is None or current_mtime > _last_mtime:
            with open(TASKS_JSON_PATH, "r", encoding="utf-8") as f:
                _cached_tasks = json.load(f)
            _last_mtime = current_mtime
            # No machine_id payload here yet, so we use N/A
            logger.info("tasks.json reloaded and cached.", extra={'student_number': student_id, 'ip_address': client_ip, 'machine_id': 'N/A'})

        # 1. deep copy the original cache
        personalized_tasks = copy.deepcopy(_cached_tasks.get("tasks", []))

        # 2. analyze each skeleton code and replace placeholders with the corresponding random numbers
        for task in personalized_tasks:
            skeleton_code = task.get("skeleton_code", "")

            # use private Random instance for each task
            # generate seed by concatenating student_id and task_id
            seed_string = f"{student_id}_{task.get('task_id', '')}"
            prng = random.Random(seed_string)

            # find {{RAND_min_max}} pattern and replace to random number 

            # from the matched pattern, extract the range and generate random number
            def replace_rand(match):
                min_val = int(match.group(1))
                max_val = int(match.group(2))
                # return personalized random number within the range
                return str(prng.randint(min_val, max_val))

            # regex expression for {{RAND_min_max}} pattern
            rand_pattern = r"\{\{RAND_(-?\d+)_(-?\d+)\}\}"

            # 정규표현식을 통해 모든 태그 치환 적용
            modified_skeleton = re.sub(rand_pattern, replace_rand, skeleton_code)
            task["skeleton_code"] = modified_skeleton

        return personalized_tasks

    except FileNotFoundError as e:
        logger.error(f"File not found, Failed to load tasks.json: {e}", extra={'student_number': student_id, 'ip_address': client_ip, 'machine_id': 'N/A'})
        return [_default_task]

    except json.JSONDecodeError as e:
        logger.error(f"Json decode error, Failed to load tasks.json: {e}", extra={'student_number': student_id, 'ip_address': client_ip, 'machine_id': 'N/A'})
        return [_default_task]


# --- Request Model ---
class SessionStartRequest(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    os_platform: str

# --- Response Model ---
class SessionStartResponse(BaseModel):
    status: str
    message: str

# --- Cache Variables ---
session_count = {}

@app.post("/api/session/start", response_model=SessionStartResponse)
def start_session(request: Request, payload: SessionStartRequest):
    """
    Initializes a lab session and dynamically provisions the student's SQLite DB shard.
    """
    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': payload.student_number, 'ip_address': client_ip, 'machine_id': payload.machine_id}

    # 0. Get session start count of the student
    if (payload.student_number in session_count):
        session_count[payload.student_number] += 1
    else:
        session_count[payload.student_number] = 0

    try:
        # 1. Provision the SQLite shard (creates the file and schema if it doesn't exist)
        conn = get_db_connection(
            payload.student_number, 
            payload.student_name, 
            f"session{session_count.get(payload.student_number, '')}"
        )

        # 2. Record the immutable session metadata
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO session_metadata (student_number, student_name, machine_id, os_platform)
            VALUES (?, ?, ?, ?)
        """, (
            payload.student_number, 
            payload.student_name, 
            payload.machine_id, 
            payload.os_platform
        ))
        
        conn.commit()
        conn.close()

        logger.info(f"Session registered on {payload.os_platform}", extra=log_context)

        # 3. Return success (The client already has the skeleton code from /api/lab/tasks)
        return SessionStartResponse(
            status="success",
            message=f"Session registered and database provisioned for {payload.student_number}."
        )

    except HTTPException as e:
        logger.error(f"HTTP Exception. Session start failed: {e}", exc_info=True, extra=log_context)
        
        # If we manually raised an HTTPException (like a 404), 
        # let it pass through to the client as-is.
        raise

    except Exception as e:
        logger.error(f"Session start failed: {e}", exc_info=True, extra=log_context)

        # Catch any DB or OS errors and return a 500 status to the client
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(type(e))}: {str(e)}")

# --- Request Model ---
class TrackDiffRequest(BaseModel):
    student_number: str          # Needed to locate the DB shard
    student_name: str            # Needed to loacte the DB shard
    machine_id: str              # Used for security validation
    file_name: str
    timestamp: str
    diff_payload: str
    is_baseline: bool = False    # Helps distinguish the initial skeleton from actual typing

@app.post("/api/track/diff")
def track_diff(request: Request, payload: TrackDiffRequest):
    """
    Receives and stores code modifications (or the initial baseline) into the student's DB shard.
    """
    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': payload.student_number, 'ip_address': client_ip, 'machine_id': payload.machine_id}

    try:
        # 1. Connect to the specific student's DB shard
        conn = get_db_connection(
            payload.student_number, 
            payload.student_name, 
            f"session{session_count.get(payload.student_number, '')}"
        )
        cursor = conn.cursor()
        
        # 2. Security Check: Validate the Machine ID (Core Policy #5)
        cursor.execute("SELECT machine_id FROM session_metadata LIMIT 1")
        session_meta = cursor.fetchone()
        
        if not session_meta:
            conn.close()
            raise HTTPException(status_code=404, detail="Session not initialized.")
            
        if session_meta[0] != payload.machine_id:
            conn.close()
            # If the machine ID changes mid-session, someone might be spoofing requests!
            raise HTTPException(status_code=403, detail="Machine ID mismatch. Unauthorized tracking attempt.")
            
        # 3. Insert the diff payload
        cursor.execute("""
            INSERT INTO diff_logs (file_name, timestamp, diff_payload)
            VALUES (?, ?, ?)
        """, (payload.file_name, payload.timestamp, payload.diff_payload))
        
        conn.commit()
        conn.close()
        
        return {"status": "success", "message": f"Diff for {payload.file_name} stored securely."}
    
    except HTTPException as e:
        logger.error(f"Diff tracking failed: {e}", extra=log_context)
        
        # If we manually raised an HTTPException (like a 404), 
        # let it pass through to the client as-is.
        raise

    except Exception as e:
        logger.error(f"Diff tracking failed: {e}", extra=log_context)

        # Catch unexpected errors (e.g., file permission issues)
        raise HTTPException(status_code=500, detail=str(e))
    
# --- Request Model ---
class TrackDebugRequest(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    
    # Telemetry Payloads
    source_snapshot: str
    breakpoints: List[Dict[str, Any]]         # e.g., [{"file": "main.c", "line": 12}]
    execution_actions: List[Dict[str, Any]]   # e.g., [{"action": "step-over", "time": "..."}]
    variable_inspection: Dict[str, Any]       # e.g., {"x": "5", "arr[0]": "10"}
    output_streams: Dict[str, str]            # e.g., {"stdout": "Hello World\n", "stderr": ""}

@app.post("/api/track/debug-log")
def track_debug_log(request: Request, payload: TrackDebugRequest):
    """
    Receives and logs detailed telemetry data from a completed debug session.
    """
    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': payload.student_number, 'ip_address': client_ip, 'machine_id': payload.machine_id}

    try:
        # 1. Connect to the specific student's DB shard
        conn = get_db_connection(
            payload.student_number, 
            payload.student_name, 
            f"session{session_count.get(payload.student_number, '')}"
        )
        cursor = conn.cursor()
        
        # 2. Security Check: Validate the Machine ID
        cursor.execute("SELECT machine_id FROM session_metadata LIMIT 1")
        session_meta = cursor.fetchone()
        
        if not session_meta:
            conn.close()
            raise HTTPException(status_code=404, detail="Session not initialized.")
            
        if session_meta[0] != payload.machine_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Machine ID mismatch.")
            
        # 3. Serialize structured data to JSON strings for SQLite storage
        cursor.execute("""
            INSERT INTO debug_logs (
                source_snapshot, 
                breakpoints, 
                execution_actions, 
                variable_inspection, 
                output_streams
            ) VALUES (?, ?, ?, ?, ?)
        """, (
            payload.source_snapshot,
            json.dumps(payload.breakpoints),
            json.dumps(payload.execution_actions),
            json.dumps(payload.variable_inspection),
            json.dumps(payload.output_streams)
        ))
        
        conn.commit()
        conn.close()
        
        return {"status": "success", "message": "Debug telemetry stored securely."}
    
    except HTTPException as e:
        logger.error(f"Debug tracking failed: {e}", extra=log_context)

        # If we manually raised an HTTPException (like a 404), 
        # let it pass through to the client as-is.
        raise        

    except Exception as e:
        logger.error(f"Debug tracking failed: {e}", extra=log_context)
        raise HTTPException(status_code=500, detail=str(e))

# --- Request Model ---
class TrackSecurityRequest(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    timestamp: str
    violation_type: str             # e.g., "Unauthorized Paste" or "Policy Tampering"
    details: str                    # The pasted text, OR the settings they tried to change
    file_name: Optional[str] = None # Optional: Only used for file-specific violations

@app.post("/api/track/security-violation")
def track_security_violation(request: Request, payload: TrackSecurityRequest):
    """
    Receives and logs all security and policy violations (Track B & Policy Enforcement).
    """
    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': payload.student_number, 'ip_address': client_ip, 'machine_id': payload.machine_id}

    try:
        # 1. Connect to the specific student's DB shard
        conn = get_db_connection(
            payload.student_number, 
            payload.student_name, 
            f"session{session_count.get(payload.student_number, '')}"
        )
        cursor = conn.cursor()
        
        # 2. Security Check: Validate the Machine ID
        cursor.execute("SELECT machine_id FROM session_metadata LIMIT 1")
        session_meta = cursor.fetchone()
        
        if not session_meta:
            conn.close()
            raise HTTPException(status_code=404, detail="Session not initialized.")
            
        if session_meta[0] != payload.machine_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Machine ID mismatch. Unauthorized tracking attempt.")
            
        # 3. Log the unified violation
        # NOTE: Make sure your database_util.py creates a `security_violations` table 
        # instead of the old `paste_violations` table!
        cursor.execute("""
            INSERT INTO security_violations (timestamp, violation_type, file_name, details)
            VALUES (?, ?, ?, ?)
        """, (payload.timestamp, payload.violation_type, payload.file_name, payload.details))
        
        conn.commit()
        conn.close()

        logger.warning(
            f"🚨 SECURITY ALARM: {payload.violation_type} ({payload.file_name or 'Global'}) - Details: {payload.details}",
            extra=log_context
        )
        
        return {"status": "success", "message": f"{payload.violation_type} securely logged."}

    except HTTPException as e:
        logger.error(f"Security log insertion failed: {e}", extra=log_context)
        raise
    except Exception as e:
        logger.error(f"Security log insertion failed: {e}", extra=log_context)
        raise HTTPException(status_code=500, detail=str(e))

# --- Request Model ---
class SessionSubmitRequest(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    submission_type: str  # Must be 'mid' or 'final'
    task_id: str
    source_files_snapshot: Dict[str, str]   # e.g., {"lab1_part1.c": "#include..."}
    vscode_config_snapshot: Dict[str, str]  # e.g., {"launch.json": "{...}"}

@app.post("/api/session/submit")
def submit_session(request: Request, payload: SessionSubmitRequest):
    """
    Receives and stores mid-session and final code submissions, 
    including workspace configuration snapshots.
    """

    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': payload.student_number, 'ip_address': client_ip, 'machine_id': payload.machine_id}

    if payload.submission_type not in ('mid', 'final'):
        raise HTTPException(status_code=400, detail="Invalid submission type. Must be 'mid' or 'final'.")

    try:
        # 1. Connect to the specific student's DB shard
        conn = get_db_connection(
            payload.student_number, 
            payload.student_name, 
            f"session{session_count.get(payload.student_number, '')}"
        )
        cursor = conn.cursor()
        
        # 2. Security Check: Validate the Machine ID
        cursor.execute("SELECT machine_id FROM session_metadata LIMIT 1")
        session_meta = cursor.fetchone()
        
        if not session_meta:
            conn.close()
            raise HTTPException(status_code=404, detail="Session not initialized.")
            
        if session_meta[0] != payload.machine_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Machine ID mismatch. Unauthorized submission.")
            
        # 3. Insert the submission data (Serialize dicts to JSON strings)
        cursor.execute("""
            INSERT INTO submissions (
                submission_type, 
                task_id, 
                source_files_snapshot, 
                vscode_config_snapshot
            ) VALUES (?, ?, ?, ?)
        """, (
            payload.submission_type,
            payload.task_id,
            json.dumps(payload.source_files_snapshot),
            json.dumps(payload.vscode_config_snapshot)
        ))
        
        conn.commit()
        conn.close()
        
        logger.info(f"Submission ({payload.submission_type}) SUCCESS for task {payload.task_id}", extra=log_context)

        return {
            "status": "success", 
            "message": f"{payload.submission_type.capitalize()} submission for {payload.task_id} recorded successfully."
        }

    except HTTPException as e:
        logger.error(f"Submission failed: {e}", exc_info=True, extra=log_context)

        # If we manually raised an HTTPException (like a 404), 
        # let it pass through to the client as-is.
        raise

    except Exception as e:
        logger.error(f"Submission failed: {e}", exc_info=True, extra=log_context)

        raise HTTPException(status_code=500, detail=str(e))
    
# --- Response Model ---
class SubmissionsResponse(BaseModel):
    status: str
    markdown_content: str

@app.get("/api/lab/submissions", response_model=SubmissionsResponse)
def get_lab_submissions(
    request: Request,
    student_number: str = Query(...),
    student_name: str = Query(...),
    machine_id: str = Query(...),
):
    """
    Retrieves all submissions for the student and generates an amalgamated Markdown review document.
    """
    client_ip = request.client.host if request.client else "UNKNOWN"
    log_context = {'student_number': student_number, 'ip_address': client_ip, 'machine_id': machine_id}

    try:
        # 1. Connect and Validate
        conn = get_db_connection(
            student_number, 
            student_name, 
            f"session{session_count.get(student_number, '')}"
        )
        cursor = conn.cursor()
        
        cursor.execute("SELECT machine_id FROM session_metadata LIMIT 1")
        session_meta = cursor.fetchone()
        
        if not session_meta:
            conn.close()
            raise HTTPException(status_code=404, detail="Session not initialized.")
            
        if session_meta[0] != machine_id:
            conn.close()
            raise HTTPException(status_code=403, detail="Machine ID mismatch.")
            
        # 2. Fetch all submissions ordered chronologically
        cursor.execute("""
            SELECT submission_type, task_id, timestamp, source_files_snapshot, vscode_config_snapshot
            FROM submissions
            ORDER BY timestamp ASC
        """)
        rows = cursor.fetchall()
        conn.close()
        
        # 3. Build the Amalgamated Markdown Document
        md_lines = [f"# C-Lab Session Review: {student_number} {student_name}"]
        
        if not rows:
            md_lines.append("*No submissions found for this session.*")
        else:
            for row in rows:
                sub_type, task_id, timestamp, source_snap, vscode_snap = row
                source_files = json.loads(source_snap)
                vscode_configs = json.loads(vscode_snap)
                
                md_lines.append(f"## Task: {task_id} ({sub_type.upper()} Submission)")
                md_lines.append(f"**Timestamp:** {timestamp}\n")
                
                md_lines.append("### Source Files")
                for filename, content in source_files.items():
                    md_lines.append(f"**`{filename}`**")
                    md_lines.append("```c")
                    md_lines.append(content)
                    md_lines.append("```\n")
                
                if vscode_configs:
                    md_lines.append("### Workspace Configurations")
                    for filename, content in vscode_configs.items():
                        md_lines.append(f"**`{filename}`**")
                        ext = "json" if filename.endswith(".json") else "text"
                        md_lines.append(f"```{ext}")
                        md_lines.append(content)
                        md_lines.append("```\n")
                
                md_lines.append("---\n") # Section divider
                
        logger.info("Generated lab review markdown.", extra=log_context)
        return {
            "status": "success",
            "markdown_content": "\n".join(md_lines)
        }

    except HTTPException as e:
        logger.error(f"Failed to generate review: {e}", extra=log_context)

        # If we manually raised an HTTPException (like a 404), 
        # let it pass through to the client as-is.
        raise

    except Exception as e:
        logger.error(f"Failed to generate review: {e}", extra=log_context)
        raise HTTPException(status_code=500, detail=str(e))
