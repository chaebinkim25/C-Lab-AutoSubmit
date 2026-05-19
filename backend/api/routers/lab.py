# server/api/routers/lab.py

from fastapi import APIRouter, Depends, HTTPException
from core.logger import logger
from core.services import LabService
from core.log_messages import LogMsg
from core.auth import verify_token, TokenData

router = APIRouter(tags=["Lab Workflow"])

@router.get("/api/lab/tasks")
def get_lab_tasks(token: TokenData = Depends(verify_token)):

    """Retrieves the assignments for the active lab via the Service Layer."""

    logger.info(LogMsg.LAB_FETCH_TASKS.format(student_number=token.student_number))

    tasks = LabService.get_all_tasks(token.student_number, token.student_name)
    if not tasks:
        raise HTTPException(status_code=500, detail=LogMsg.ERR_NO_CURRICULUM)

    return tasks
