# server/core/database.py

import os
import aiosqlite
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from core.logger import logger
from core.log_messages import LogMsg

# Get the absolute path of the directory containing this script (.../server/core)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Go up one level to the backend root (.../server), then into data/shards
BASE_DIR = os.path.dirname(SCRIPT_DIR)
DB_DIR = os.path.join(BASE_DIR, "data", "shards")

BACKUP_DIR = os.path.join(os.path.dirname(DB_DIR), "backups")

os.makedirs(DB_DIR, exist_ok=True)

def get_db_path(machine_id: str, session_id: str) -> str:
    """Constructs the absolute path for the specific session database shard."""
    return os.path.join(DB_DIR, f"{machine_id}_{session_id}.db")

async def init_db_schema(conn: aiosqlite.Connection):
    """
    Creates the required tables based on the Backend API Spec.
    This only runs once when a new shard is provisioned.
    """
    await conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            timestamp TEXT NOT NULL,
            student_number TEXT NOT NULL,
            student_name TEXT NOT NULL,
            status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_telemetry (
            timestamp TEXT NOT NULL,
            payload TEXT NOT NULL
        );                                                          
    """)
    await conn.commit()

@asynccontextmanager
async def get_db_connection(machine_id: str, session_id: str) -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    Context manager that yields a WAL-enabled SQLite connection.
    Automatically initializes the schema if the student's shard is brand new.
    """
    db_path = get_db_path(machine_id, session_id)
    is_new_shard = not os.path.exists(db_path)

    # 1-second timeout ensures connections wait gracefully if the file is briefly locked
    async with aiosqlite.connect(db_path, timeout=1.0) as conn:
        # Return rows as dictionary-like objects instead of raw tuples
        conn.row_factory = aiosqlite.Row

        # Enforce WAL mode for high-concurrency safety and set synchronous to NORMAL for speed
        await conn.execute("PRAGMA synchronous=NORMAL;")

        if is_new_shard:
            await conn.execute("PRAGMA journal_mode=WAL;")
            logger.info(LogMsg.DB_PROVISION.format(db_path=db_path))
            await init_db_schema(conn)

        yield conn
