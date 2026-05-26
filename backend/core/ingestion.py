# server/core/ingestion.py

import asyncio
import json
from core.logger import logger
from core.queries import query_insert_raw_telemetry
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
            payload_json = json.dumps(payload, ensure_ascii=False)
            await query_insert_raw_telemetry(machine_id, session_id, payload_json)
            telemetry_queue.task_done()
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(LogMsg.INGEST_CRITICAL.format(error=str(e)))
