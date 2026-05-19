# server/core/queries.py

from typing import Optional
from core.database import get_db_connection
from core.time_utils import get_kst_iso8601
from core.log_messages import LogMsg

# ==========================================
# STATELESS QUERY PROTOCOL RULES:
# 1. NO global variables.
# 2. Every function MUST require `machine_id` and `session_id` for shard routing.
# 3. Every function MUST open and close its own connection using the context manager.
# ==========================================

async def create_new_session(student_number: str, student_name: str, machine_id: str, session_id: str) -> None:
    """
    Stateless insertion of a brand new session into the specific shard.
    """
    timestamp = get_kst_iso8601()

    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()
        await cursor.execute("""
            INSERT INTO sessions (machine_id, student_number, student_name, status, start_timestamp)
            VALUES (?, ?, ?, 'started', ?)
        """, (machine_id, student_number, student_name, timestamp))

        await conn.commit()


async def advance_session_task(machine_id: str, session_id: str, next_task_name: str) -> None:
    """Updates the session pointer to the next task."""
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "UPDATE sessions SET current_task = ?", 
            (next_task_name,)
        )
        await conn.commit()

async def complete_session(machine_id: str, session_id: str, end_timestamp: str) -> None:
    """Marks a session as finalized and locks it."""
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            "UPDATE sessions SET status = 'completed', end_timestamp = ?",
            (end_timestamp,)
        )
        await conn.commit()

async def end_active_session(machine_id: str, session_id: str, status: str, end_timestamp: str) -> bool:
    """
    Stateless update to close an active session (mark as 'completed' or 'suspended').
    Returns True if a row was updated, False if no active session was found.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        await cursor.execute("""
            UPDATE sessions
            SET status = ?, end_timestamp = ?
            WHERE status != 'completed'
        """, (status, end_timestamp))

        await conn.commit()
        return cursor.rowcount > 0

async def insert_diff_patches(machine_id: str, session_id: str, patches: list) -> bool:
    """
    Batch inserts a list of diff patches into the active session.
    Returns True if successful, False if no active session was found.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        query = """
            INSERT INTO file_diffs (elapsed_seconds, file_path, is_baseline, delta_patch)        
            VALUES (?, ?, ?, ?)
        """

        batch_data = [
            (p.elapsed_seconds, p.file_path, p.is_baseline, p.delta_patch)
            for p in patches
        ]

        await cursor.executemany(query, batch_data)
        await conn.commit()

        return cursor.rowcount > 0

async def insert_security_events(machine_id: str, session_id: str, events: list) -> bool:
    """
    Batch inserts a list of security/telemetry events into the active session.
    Returns True if successful, False if no active session was found.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        # We assume the database table 'security_logs' has these columns.
        query = """
            INSERT INTO security_logs (elapsed_seconds, event_type, file_path, line_number, context, content)        
            VALUES (?, ?, ?, ?, ?, ?)
        """

        batch_data = [
            (
                e.elapsed_seconds,
                e.event_type,
                e.file_path,
                e.line_number,
                e.context,
                e.content
            )
            for e in events
        ]

        await cursor.executemany(query, batch_data)
        await conn.commit()

        return cursor.rowcount > 0

async def insert_debug_events(machine_id: str, session_id: str, events: list) -> bool:
    """
    Batch inserts a list of DAP (Debug Adapter Protocol) events into the active session.
    Returns True if successful, False if no active session was found.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        # We assume the database table 'debug_logs' has these columns.
        query = """
            INSERT INTO debug_logs (elapsed_seconds, debug_code, file_path, details)        
            VALUES (?, ?, ?, ?)
        """

        # Map the Pydantic models into a list of tuples for fast batch insertion
        batch_data = [
            (
                e.elapsed_seconds,
                e.debug_code,
                e.file_path,
                e.details
            )
            for e in events
        ]

        await cursor.executemany(query, batch_data)
        await conn.commit()

        return cursor.rowcount > 0

async def insert_extension_logs(machine_id: str, session_id: str, logs: list) -> bool:
    """
    Saves the internal VS Code extension logs for remote TA diagnostics.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        query = """
            INSERT INTO extension_logs (elapsed_seconds,log_code, args)
            VALUES (?, ?, ?)
        """

        batch_data = [
            (
                l.elapsed_seconds,
                l.log_code,
                l.args
            )
            for l in logs
        ]

        await cursor.executemany(query, batch_data)
        await conn.commit()

        return cursor.rowcount > 0

async def insert_terminal_events(machine_id: str, session_id: str, events: list) -> bool:
     """
     Batch inserts terminal stdout/stdin payloads into the active session.
     """
     async with get_db_connection(machine_id, session_id) as conn:
         cursor = await conn.cursor()

         query = """
             INSERT INTO terminal_logs (elapsed_seconds, stream, content)
             VALUES (?, ?, ?)
         """

         batch_data = [
             (
                 e.elapsed_seconds,
                 e.stream,
                 e.content
             )
             for e in events
         ]

         await cursor.executemany(query, batch_data)
         await conn.commit()

         return cursor.rowcount > 0


async def get_session_for_submission(machine_id: str, session_id: str) -> Optional[dict]:
    """Stateless fetch of the active session ID and current task string."""
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()
        await cursor.execute("""
            SELECT current_task, student_name FROM sessions LIMIT 1
        """)

        row = await cursor.fetchone()
        return dict(row) if row else None

async def save_task_files(machine_id: str, session_id: str, files: list) -> None:
    """Inserts submitted files into the submissions table."""
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()
        insert_query = """
            INSERT INTO submissions (task_name, file_path, content, submitted_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """
        batch_data = [(f["task_name"], f["file_path"], f["content"]) for f in files]
        await cursor.executemany(insert_query, batch_data)
        await conn.commit()
