# server/api/routers/session.py

import re
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import Optional

from core.queries import create_new_session, end_active_session
from core.logger import logger
from core.log_messages import LogMsg
from core.services import LabService
from core.auth import create_access_token, verify_token, TokenData

router = APIRouter(tags=["Session"])

# Start Session Schema & Endpoint

class StartSessionRequest(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    timestamp: str

    @field_validator('student_name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        """
        Core Policy #8: Apply Unicode-safe regex sanitization.
        In Python 3, \\w inherently includes Unicode characters (like Korean Hangul).
        This strips emojis, invisible control characters, and special symbols,
        leaving only letters, numbers, spaces, and hyphens.
        """
        sanitized = re.sub(r'[^\w\s-]', '', v)
        return sanitized.strip()

@router.post("/api/session/start")
async def start_session(payload: StartSessionRequest):
    """
    Validates student data, sanitizes the name, drops resume logic, and strictly starts a new zero-trust session shard.    
    """
    logger.info(LogMsg.SES_START_REQ.format(
        student_number=payload.student_number, 
        student_name=payload.student_name,
        machine_id=payload.machine_id
    ))

    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    
    token = create_access_token({
        "student_number": payload.student_number, 
        "student_name": payload.student_name,
        "machine_id": payload.machine_id,
        "session_id": session_id
    })

    logger.info(LogMsg.SES_NEW_SHARD.format(
        student_number=payload.student_number,
        student_name=payload.student_name
    ))

    try:
        # This will automatically create the YYYY-MM-DD_KST_{student_number}.db file
        # and run the init_db_schema script if it's the first time they logged in today.
        await create_new_session(
            student_number=payload.student_number,
            student_name=payload.student_name,
            machine_id=payload.machine_id,
            session_id=session_id
        )

        task_context = LabService.get_task_context(
            student_number=payload.student_number,
            student_name=payload.student_name,
            task_string="Task 1"
        )

    except Exception as e:
        logger.error(LogMsg.SES_NEW_ERR.format(error=str(e)))
        raise HTTPException(status_code=500, detail=LogMsg.ERR_DB_PROVISION)
        
    return {
        "status": "started",
        "token": token,
        "task_context": task_context
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
async def end_session(payload: EndSessionRequest, token: TokenData = Depends(verify_token)):
    """
    Records the explicit termination of a session.
    Because resume logic is permanently discarded, any termination safely locks the session.
    """
    logger.info(LogMsg.SES_END_REQ.format(
        student_number=token.student_number, 
        status=payload.status
    ))
    
    success = await end_active_session(
        machine_id=token.machine_id,
        session_id=token.session_id,
        status=payload.status,
        end_timestamp=payload.timestamp
    )

    try:
        dump_path = await LabService.generate_db_markdown_dump(token.machine_id, token.session_id, token.student_number)
        if dump_path:
            logger.info(LogMsg.SES_DUMP_GEN.format(dump_path=dump_path))
    except Exception as e:
        logger.error(LogMsg.ERR_SES_DUMP.format(error=str(e)))

    if not success:
        logger.warning(LogMsg.SES_END_DESYNC.format(student_number=token.student_number))
        # We return a 200 HTTP status anyway so the VS Code extension can proceed 
        # with its zero-trust local file wipe without getting hung up on a network error.
        return {
            "status": "ignored", 
            "message": LogMsg.API_NO_SESSION_CLOSE
        }
        
    return {
        "status": "success",
        "recorded_state": payload.status
    }

# Submission Schema & Endpoint

class SubmissionPayload(BaseModel):
    submission_type: str
    task_id: str
    timestamp: str
    sourceFiles: dict
    vscodeConfigs: Optional[dict] = {}

@router.post("/api/session/submit")
async def submit_session(payload: SubmissionPayload, token: TokenData = Depends(verify_token)):
    is_final = (payload.submission_type == "final")
    logger.info(LogMsg.LAB_SUBMIT_TYPE.format(sub_type=payload.submission_type.upper(), student_number=token.student_number))

    # Map the dict format to the internal Service format
    files_list = []
    for k, v in payload.sourceFiles.items():
        task_name = k[:-2] if k != 'main.c' and k.endswith('.c') else payload.task_id
        files_list.append({"task_name": task_name, "file_path": k, "content": v})

    result = await LabService.process_submission(
        student_number=token.student_number,
        machine_id=token.machine_id,
        session_id=token.session_id,
        task_id=payload.task_id,
        files=files_list,
        is_final=is_final
    )
    
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", LogMsg.ERR_SUBMISSION_FAILED))
        
    return result
