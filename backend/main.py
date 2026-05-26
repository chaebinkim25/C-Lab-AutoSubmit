# server/main.py

import asyncio
import uvicorn
from fastapi import FastAPI
from contextlib import asynccontextmanager

from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / ".env"

load_dotenv(dotenv_path=env_path)  # Load environment variables from .env file before anything else

from core.logger import setup_global_logging, logger
from core.log_messages import LogMsg
from api.routers import session
from api.routers import track
from core.ingestion import telemetry_worker, telemetry_queue
from core.backup import backup_worker

# 1. Initialize the global logging configuration
setup_global_logging()

# 2. FastAPI Initialization
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(LogMsg.STARTUP_INIT)

    # Start the background ingestion worker
    worker_task = asyncio.create_task(telemetry_worker())    

    # Start the background backup worker (Runs every 3 hours= 10800s)
    backup_task = asyncio.create_task(backup_worker(interval_seconds=10800))

    yield

    # Graceful shutdown: send termination pill and wait for queue to empty
    await telemetry_queue.put(None)
    await worker_task

    backup_task.cancel()

app = FastAPI(title="C-Lab AutoSubmit API", version="1.1.0", lifespan=lifespan)

# 3. Initial Endpoints
app.include_router(session.router)
app.include_router(track.router)

# 4. Server Execution
if __name__ == "__main__":
    # Run the Uvicorn server directly for local development testing
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
