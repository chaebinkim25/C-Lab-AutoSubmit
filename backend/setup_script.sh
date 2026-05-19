// server/setup_script.sh

sudo mount -t tmpfs -o size=2G tmpfs ./data/shards
python3 -m setup_env.py
python3 -m main.py
