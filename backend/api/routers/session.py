# server/api/routers/session.py

import re
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, field_validator
from typing import Optional

from core.queries import query_start_session, query_end_session
from core.logger import logger
from core.log_messages import LogMsg
from core.auth import verify_session, SessionData

router = APIRouter(tags=["Session"])

# Start Session Schema & Endpoint

class StartSessionRequest(BaseModel):
    student_number: str
    student_name: str

    @field_validator('student_name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        """
        Unicode-safe regex sanitization.
        """
        sanitized = re.sub(r'[^\w\s-]', '', v)
        return sanitized.strip()

@router.post("/api/session/start")
async def start_session(
    payload: StartSessionRequest,
    x_machine_id: str = Header(..., alias="x-machine-id"),
    x_session_id: str = Header(..., alias="x-session-id")    
):
    """
    Validates student data, sanitizes the name, drops resume logic, and strictly starts a new zero-trust session shard.    
    """
    logger.info(LogMsg.SES_START_REQ.format(
        student_number=payload.student_number, 
        student_name=payload.student_name,
        machine_id=x_machine_id,
        session_id=x_session_id
    ))

    try:
        # This will automatically run the init_db_schema script.
        await query_start_session(
            machine_id=x_machine_id,
            session_id=x_session_id,
            student_number=payload.student_number,
            student_name=payload.student_name
        )

    except Exception as e:
        logger.error(LogMsg.SES_NEW_ERR.format(error=str(e)))
        raise HTTPException(status_code=500, detail=LogMsg.ERR_DB_PROVISION)
        
    return {
        "status": "started"
    }

# Session Schema & Endpoint

class EndSessionRequest(BaseModel):
    status: str
    timestamp: str

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        """Strictly enforce the two allowed termination states."""
        allowed_states = ['completed', 'suspended']
        if v not in allowed_states:
            raise ValueError(LogMsg.ERR_INVALID_STATUS.format(allowed_states=allowed_states))
        return v

@router.post("/api/session/end")
async def end_session(payload: EndSessionRequest, session: SessionData = Depends(verify_session)):
    """
    Records the explicit termination of a session.
    """
    logger.info(LogMsg.SES_END_REQ.format(
        machine_id=session.machine_id,
        status=payload.status
    ))
    
    await query_end_session(
        machine_id=session.machine_id,
        session_id=session.session_id,
        status=payload.status
    )

    return {
        "status": "success",
        "recorded_state": payload.status
    }
