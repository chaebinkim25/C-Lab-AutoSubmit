# server/core/time_utils.py

import os
import time
from datetime import datetime
import pytz

# --- 1. OS-Level Enforcement ---
# This forces the underlying Python runtime (especially inside Docker/Linux)
# to treat 'Asia/Seoul' as the system default.
os.environ['TZ'] = 'Asia/Seoul'
if hasattr(time, 'tzset'):
    time.tzset() # type: ignore

# --- 2. Application-Level KST Constant ---
KST = pytz.timezone("Asia/Seoul")

# --- 3. Strict Time Getters ---
def get_kst_now() -> datetime:
    """
    Returns the current timezone-aware datetime strictly in KST.
    Use this instead of datetime.now() everywhere in the app.
    """
    return datetime.now(KST)

def get_kst_db_shard_name(student_number: str) -> str:
    """
    Returns the date formatted specifically for stateless database sharding.
    Format: YYYY-MM-DD_KST_{student_number}
    """
    return f"{get_kst_now().strftime('%Y-%m-%d')}_{student_number}"

def get_kst_iso8601() -> str:
    """
    Returns the timestamp formatted for API JSON payloads and telemetry.
    Format: YYYY-MM-DDTHH:MM:SS+09:00
    """
    return get_kst_now().isoformat(timespec='seconds')
