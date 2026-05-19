# server/core/auth.py

import jwt
import os
from datetime import timedelta
from core.time_utils import get_kst_now
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from core.logger import logger
from core.log_messages import LogMsg

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    # Fail gracefully with a warning if the admin forgot to set the .env in production
    logger.warning(LogMsg.AUTH_NO_SECRET)
    SECRET_KEY = "c-lab-zero-trust-secret-key-32bytes"

ALGORITHM = "HS256"

security = HTTPBearer()

class TokenData(BaseModel):
    student_number: str
    student_name: str
    machine_id: str
    session_id:str

def create_access_token(data: dict) -> str:
    """Generates a stateless JWT containing the student's ID, Machine ID, and Session ID with expiration."""
    to_encode = data.copy()
    expire = get_kst_now() + timedelta(hours=12)
    to_encode.update({"exp": int(expire.timestamp())})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> TokenData:
    """Validates the JWT and extracts the Zero-Trust claims for database routing."""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        student_number: str = payload.get("student_number", "")
        student_name: str = payload.get("student_name", "")
        machine_id: str = payload.get("machine_id", "")
        session_id: str = payload.get("session_id", "")

        if not student_number or not machine_id or not session_id:
            raise HTTPException(status_code=401, detail=LogMsg.ERR_AUTH_CLAIMS)

        return TokenData(student_number=student_number, student_name=student_name, machine_id=machine_id, session_id=session_id)

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail=LogMsg.ERR_AUTH_EXPIRED)

    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail=LogMsg.ERR_AUTH_INVALID)
