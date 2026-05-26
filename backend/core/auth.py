# server/core/auth.py

from fastapi import Header, HTTPException
from pydantic import BaseModel

class SessionData(BaseModel):
    machine_id: str
    session_id:str

def verify_session(
    x_machine_id: str = Header(..., alias="x-machine-id"),
    x_session_id: str = Header(..., alias="x-session-id")
) -> SessionData:
    """Extracts the stateless identity headers directly without any JWT logic."""
    if not x_machine_id or not x_session_id:
        raise HTTPException(status_code=401, detail="Missing identity headers")
    return SessionData(machine_id=x_machine_id, session_id=x_session_id)
