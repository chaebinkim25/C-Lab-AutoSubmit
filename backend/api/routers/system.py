# server/api/routers/system.py

from fastapi import APIRouter, Request
import psutil

from core.time_utils import get_kst_now, get_kst_iso8601
from core.logger import logger
from core.log_messages import LogMsg
from core.ingestion import telemetry_queue

# Initialize the router for system-level endpoints
router = APIRouter(tags=["System"])

@router.get("/api/check-time")
def check_time(request: Request):
    """
    Validates if current server time falls strictly within scheduled KST lab hours.
    Lab Hours: Wednesdays between 07:00 AM and 01:00 PM KST.
    """
    now_kst = get_kst_now()

    # Safely extract the IP address
    ip = request.client.host if request.client else "Unknown"

    # Python datetime.weekday(): Monday is 0, Wednesday is 2
    is_wednesday = now_kst.weekday() == 2
    is_active_hours = 0 <= now_kst.hour < 13

    is_active_lab_time = is_wednesday and is_active_hours

    logger.info(LogMsg.TIME_CHECK.format(is_active_lab_time=is_active_lab_time, ip = ip))

    return {
        "is_active_lab_time": is_active_lab_time,
        "current_time_kst": get_kst_iso8601(),
        "required_extension_version": "1.1.1"
    }

@router.get("/api/health")
def check_health():
    """Provides basic system monitoring metrics for the TA dashboard."""
    q_size = telemetry_queue.qsize()
    
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    net = psutil.net_io_counters()
    return {
        "status": "healthy" if q_size < 500 else "degraded",
        "queue_depth": q_size,
        "system": {
            "cpu_percent": cpu,
            "ram_percent": mem.percent,
            "disk_percent": disk.percent,
            "network_bytes_sent": net.bytes_sent,
            "network_bytes_recv": net.bytes_recv
        }
    }
