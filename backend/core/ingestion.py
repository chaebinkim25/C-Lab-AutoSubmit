# server/core/ingestion.py

import asyncio
from core.logger import logger
from core.queries import insert_diff_patches, insert_security_events, insert_debug_events, insert_extension_logs, insert_terminal_events
from core.log_messages import LogMsg

# Global in-memory queue with a strict memory bound to prevent OOM during Thundering Herds
telemetry_queue = asyncio.Queue(maxsize=1000)

async def telemetry_worker():
    """
    Background worker that continuously pulls telemetry payloads from the RAM queue 
    and writes them to the SQLite shards asynchronously.
    """
    logger.info(LogMsg.INGEST_START)
    
    while True:
        try:
            task = await telemetry_queue.get()
            
            # Shutdown signal received
            if task is None:
                break
                
            machine_id = task["machine_id"]
            session_id = task["session_id"]
            payload = task["payload"]

            # Execute the database writes
            if payload.patches:
                await insert_diff_patches(machine_id, session_id, payload.patches)
            if payload.security_events:
                await insert_security_events(machine_id, session_id, payload.security_events)
            if payload.debug_events:
                await insert_debug_events(machine_id, session_id, payload.debug_events)
            if payload.extension_logs:
                await insert_extension_logs(machine_id, session_id, payload.extension_logs)
            if payload.terminal_events:
                await insert_terminal_events(machine_id, session_id, payload.terminal_events)                
            telemetry_queue.task_done()
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(LogMsg.INGEST_CRITICAL.format(error=str(e)))
