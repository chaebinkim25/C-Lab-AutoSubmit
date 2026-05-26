# server/core/queries.py

from core.database import get_db_connection

# ==========================================
# STATELESS QUERY PROTOCOL RULES:
# 1. NO global variables.
# 2. Every function MUST require `machine_id` and `session_id` for shard routing.
# 3. Every function MUST open and close its own connection using the context manager.
# ==========================================

async def query_start_session(machine_id: str, session_id: str, student_number: str, student_name: str) -> None:
    """
    Stateless insertion of a brand new session into the specific shard.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        await cursor.execute("""
            INSERT INTO sessions (timestamp, student_number, student_name, status)
            VALUES (CURRENT_TIMESTAMP, ?, ?, 'started')
        """, (student_number, student_name))

        await conn.commit()

async def query_end_session(machine_id: str, session_id: str, status: str) -> None:
    """
    Stateless update to close an active session (mark as 'completed' or 'suspended').
    Returns True if a row was updated, False if no active session was found.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        await cursor.execute("""
            INSERT INTO sessions (timestamp, student_number, student_name, status)
            VALUES (CURRENT_TIMESTAMP, '-', '-', ?)
        """, (status,))

        await conn.commit()

async def query_insert_raw_telemetry(machine_id: str, session_id: str, payload_json: str) -> None:
    """
    Statelessly saves the raw telemetry bulk payload directly to the database.
    """
    async with get_db_connection(machine_id, session_id) as conn:
        cursor = await conn.cursor()

        query = """
            INSERT INTO raw_telemetry (timestamp, payload)
            VALUES (CURRENT_TIMESTAMP, ?)
        """

        await cursor.execute(query, (payload_json,))
        await conn.commit()
