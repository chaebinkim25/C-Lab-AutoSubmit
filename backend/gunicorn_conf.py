# server/gunicorn_conf.py
import multiprocessing

# Bind to localhost; your next checklist item (Nginx/Traefik) will proxy to this port.
bind = "127.0.0.1:8000"

# Tuning Uvicorn Workers:
# The standard formula for optimal concurrency is (2 * CPU Cores) + 1.
# Example: An AWS t3.medium (2 vCPUs) will provision 5 workers.
cores = multiprocessing.cpu_count()
workers = (cores * 2) + 1

# Specify the Uvicorn ASGI worker class
worker_class = "uvicorn.workers.UvicornWorker"

# Timeouts & Connections
# Extended timeout to prevent dropping payloads during high-concurrency final submissions
timeout = 120
keepalive = 5

# Logging
# Forward access and error logs to standard output so your custom setup in logger.py handles them
accesslog = "-"
errorlog = "-"
loglevel = "info"
