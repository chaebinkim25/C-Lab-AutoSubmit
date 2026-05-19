# server/api/routers/track.py

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from core.auth import verify_token, TokenData
from core.logger import logger
from core.ingestion import telemetry_queue
from core.log_messages import LogMsg

router = APIRouter(tags=["Telemetry"])

# Pydantic Diff Schemas
class DiffPatch(BaseModel):
    elapsed_seconds: int
    file_path: str
    is_baseline: bool
    delta_patch: str

# Pydantic Security Schemas
class SecurityEvent(BaseModel):
    elapsed_seconds: int
    event_type: str
    file_path: str
    line_number: Optional[int] = None
    context: Optional[str] = None
    content: str

# Pydantic Debug Schemas
class DebugEvent(BaseModel):
    elapsed_seconds: int
    debug_code: str
    file_path: str
    details: Optional[str] = None

# Pydantic Extension Log Schema
class ExtensionLogEvent(BaseModel):
    elapsed_seconds: int
    log_code: str
    args: str

# Pydantic Terminal Schema
class TerminalEvent(BaseModel):
     elapsed_seconds: int
     stream: str
     content: str

# Pydantic Bulk Schemas
class BulkTelemetryPayload(BaseModel):
    patches: Optional[List[DiffPatch]] = []
    security_events: Optional[List[SecurityEvent]] = []
    debug_events: Optional[List[DebugEvent]] = []
    extension_logs: Optional[List[ExtensionLogEvent]] = []
    terminal_events: Optional[List[TerminalEvent]] = []

# Bulk Endpoint
@router.post("/api/track/bulk")
async def track_bulk(payload: BulkTelemetryPayload, token: TokenData = Depends(verify_token)):
    """
    Unified telemetry ingestion endpoint. Receives all queued trackers in a single payload
    to drastically minimize network packet congestion.
    """

    p_len = len(payload.patches or [])
    s_len = len(payload.security_events or [])
    d_len = len(payload.debug_events or [])
    l_len = len(payload.extension_logs or [])
    t_len = len(payload.terminal_events or [])

    if p_len == 0 and s_len == 0 and d_len == 0 and l_len == 0 and t_len == 0:
        return {"status": "ignored", "message": LogMsg.TRK_EMPTY_PAYLOAD}

    logger.info(LogMsg.TRK_BULK_RECV.format(
        student_number=token.student_number,
        machine_id=token.machine_id,
        p=p_len, s=s_len, d=d_len, l=l_len, t=t_len
    ))

    # Try to push the validated payload into the high-speed RAM queue
    try:
        telemetry_queue.put_nowait({
            "machine_id": token.machine_id,
            "session_id": token.session_id,
            "payload": payload
        })
    except asyncio.QueueFull:
        logger.warning(LogMsg.TRK_QUEUE_FULL.format(student_number=token.student_number))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=LogMsg.ERR_HIGH_LOAD
        )

    q_size = telemetry_queue.qsize()

    if q_size > 100:
        logger.warning(LogMsg.TRK_QUEUE_BACKLOG.format(q_size=q_size))

    return {"status": "queued", "queue_depth": q_size}
