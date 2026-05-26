# server/core/logger.py

from pathlib import Path
import os
import logging
from logging.handlers import RotatingFileHandler

def setup_global_logging() -> logging.Logger:
    """
    Configures the root logger for both Console and File output in KST.
    Call this exactly once at the startup of the application.
    """

    # Resolve the path to the 'logs' directory relative to this file
    log_dir = Path(__file__).parent / "../logs"
    
    # Ensure the 'logs' directory exists
    os.makedirs(log_dir, exist_ok=True)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')

    # Create console handler with our custom formatter
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    # Resolve the exact absolute path for the log file
    log_file_path = log_dir / "c_lab_backend.log"

    # File Handler (Writes to logs/c_lab_backend.log, rotates at 5MB, keeps 3 backups)
    # Enforcing UTF-8 encoding
    file_handler = RotatingFileHandler(
        filename=str(log_file_path),
        mode='a',
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)

    # Set up the main application logger
    app_logger = logging.getLogger("c_lab_backend")
    app_logger.setLevel(logging.INFO)

    # Prevent adding multiple handlers if called multiple times (e.g., during hot-reloads)
    if not app_logger.handlers:
        app_logger.addHandler(console_handler)
        app_logger.addHandler(file_handler)
        app_logger.propagate = False

    # Force Uvicorn's internal loggers to use our formatter
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = [console_handler, file_handler]
        uvicorn_logger.propagate = False

    return app_logger

# Expose a ready-to-use logger instance for the rest of the app to import
logger = logging.getLogger("c_lab_backend")
