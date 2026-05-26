# server/api/routers/track.py

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from core.auth import verify_session, SessionData
from core.logger import logger
from core.ingestion import telemetry_queue
from core.log_messages import LogMsg

router = APIRouter(tags=["Telemetry"])

# Bulk Endpoint
@router.post("/api/track/bulk")
async def track_bulk(payload: dict, session: SessionData = Depends(verify_session)):
    """
    Schema-less unified telemetry ingestion endpoint.
    Accepts any arbitrary JSON object from the client and queues it.
    """

    logger.info(LogMsg.TRK_BULK_RECV.format(
        machine_id=session.machine_id,
        session_id=session.session_id
    ))

    # Try to push the raw payload into the high-speed RAM queue
    try:
        telemetry_queue.put_nowait({
            "machine_id": session.machine_id,
            "session_id": session.session_id,
            "payload": payload
        })
    except asyncio.QueueFull:
        logger.warning(LogMsg.TRK_QUEUE_FULL.format(machine_id=session.machine_id))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=LogMsg.ERR_HIGH_LOAD
        )

    q_size = telemetry_queue.qsize()

    if q_size > 100:
        logger.warning(LogMsg.TRK_QUEUE_BACKLOG.format(q_size=q_size))

    return {"status": "queued", "queue_depth": q_size}
