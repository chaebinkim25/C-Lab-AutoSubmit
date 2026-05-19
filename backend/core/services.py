# server/core/services.py

import os
import json
import random
import re
import aiosqlite
import urllib.parse
from typing import List, Optional
from core.logger import logger
from core.log_messages import LogMsg
from core.time_utils import get_kst_iso8601
from core import queries
from core.database import get_db_path

# Get the absolute path of the directory containing this script (.../server/core)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Go up one level to the backend root (.../server)
BASE_DIR = os.path.dirname(SCRIPT_DIR)

# Dynamically build the exact path to the json file
CURRICULUM_PATH = os.path.join(BASE_DIR, "data", "tasks.json")

def load_lab_tasks() -> List[dict]:
    """Safely loads the external JSON curriculum file."""
    if not os.path.exists(CURRICULUM_PATH):
        logger.error(LogMsg.LAB_NO_CURRICULUM.format(path=CURRICULUM_PATH))
        return []
        
    try:
        with open(CURRICULUM_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
            tasks = data.get("tasks", [])
            logger.info(LogMsg.LAB_LOADED.format(count=len(tasks)))
            return tasks
    except json.JSONDecodeError as e:
        logger.error(LogMsg.LAB_PARSE_FAIL.format(error=e))
        return []

# Load into memory on startup
LAB_TASKS_DB = load_lab_tasks()

class LabService:
    @staticmethod
    def _generate_seeded_task(student_number: str, student_name: str, task: dict) -> dict:
        """Injects deterministic random values into a task's skeleton code."""
        seed_string = f"{student_number}_{task['task_id']}"
        random.seed(seed_string)
        
        def replace_rand(match):
            min_val, max_val = int(match.group(1)), int(match.group(2))
            if min_val > max_val: 
                min_val, max_val = max_val, min_val
            return str(random.randint(min_val, max_val))
            
        injected_code = re.sub(r'\{\{RAND_(\d+)_(\d+)\}\}', replace_rand, task["skeleton_code"])
        
        # Inject Student Name and Number as a C Comment Header ---
        header = f"/*\n * Student ID: {student_number}\n * Name: {student_name}\n */\n"
        final_skeleton = header + injected_code

        return {
            "task_id": task["task_id"],
            "title": task["title"],
            "description": task["description"],
            "skeleton_code": final_skeleton
        }

    @classmethod
    def get_all_tasks(cls, student_number: str, student_name: str = "Unknown") -> List[dict]:
        """Returns the full list of seeded tasks for a student."""
        global LAB_TASKS_DB
        if not LAB_TASKS_DB:
            LAB_TASKS_DB = load_lab_tasks()
            
        return [cls._generate_seeded_task(student_number, student_name, task) for task in LAB_TASKS_DB]

    @classmethod
    async def process_submission(cls, student_number: str, machine_id: str, session_id: str, task_id: str, files: list, is_final: bool = False) -> dict:
        """Statelessly saves the submitted code."""
        
        # 1. Fetch current DB state
        session = await queries.get_session_for_submission(machine_id, session_id)
        if not session:
            return {"status": "error", "message": LogMsg.ERR_NO_ACTIVE_SESSION}
            
        student_name = session.get('student_name', 'Unknown')

        # 2. Persist the files to the database
        await queries.save_task_files(machine_id, session_id, files)

        # 3. Handle Final Submission
        if is_final:
            await queries.complete_session(machine_id, session_id, get_kst_iso8601())            
            return {"status": "completed"}

        # 4. Update the DB pointer to track where they currently are
        await queries.advance_session_task(machine_id, session_id, task_id)

        return {"status": "success"}
        
    @classmethod
    def get_task_context(cls, student_number: str, student_name: str, task_string: str, custom_files: Optional[list] = None) -> dict:
        """
        Single source of truth for parsing task state, calculating progression, 
        and formatting the file payload for the frontend.
        """
        tasks = cls.get_all_tasks(student_number, student_name)
        total_tasks = len(tasks) if tasks else 1

        # 1. Unified Parsing
        try:
            task_idx = int(task_string.split(' ')[1]) - 1
        except (IndexError, ValueError):
            task_idx = 0

        # 2. Unified Boolean Logic
        is_last_task = (task_idx >= total_tasks - 1)

        # 3. Unified Payload Construction (Use resumed files, or generate skeleton)
        files = custom_files
        if not files and tasks and 0 <= task_idx < total_tasks:
            files = [{
                "file_path": "main.c",
                "content": tasks[task_idx]["skeleton_code"]
            }]

        return {
            "current_task": task_string,
            "is_last_task": is_last_task,
            "files": files or []
        }
    

    @classmethod
    async def generate_db_markdown_dump(cls, machine_id: str, session_id: str, student_number: str) -> Optional[str]:
        """Reads a closed session database and generates a formatted Markdown dump."""
        db_path = get_db_path(machine_id, session_id)
        if not os.path.exists(db_path):
                return None
                
        output_dir = os.path.join(BASE_DIR, "data", "reviews")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, f"{student_number}_{session_id}_dump.md")
        
        async with aiosqlite.connect(db_path) as conn:
            cur = await conn.cursor()
            await cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables_data = await cur.fetchall()
            tables = [t[0] for t in tables_data if not t[0].startswith('sqlite_')]
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(f"# Full Database Dump for {student_number} ({session_id})\n\n")
                
                for table_name in tables:
                    f.write(f"# Table: {table_name}\n\n")
                    await cur.execute(f"PRAGMA table_info({table_name});")
                    col_data = await cur.fetchall()
                    columns = [col_info[1] for col_info in col_data]
                    
                    await cur.execute(f"SELECT * FROM {table_name};")
                    rows = await cur.fetchall()
                    
                    if not rows:
                            f.write("*This table is empty.*\n\n---\n\n")
                            continue
                            
                    for idx, row in enumerate(rows, 1):
                            row_data = dict(zip(columns, row))
                            row_id = row_data.get('id', f'Row {idx}')
                            timestamp = row_data.get('timestamp', 'No Timestamp')
                            
                            f.write(f"## Record ID : {row_id}\n")
                            if 'timestamp' in row_data:
                                f.write(f"**Timestamp** : {timestamp}\n\n")
                            else:
                                f.write("\n")
                                
                            for col_name, item in row_data.items():
                                if col_name in ['id', 'timestamp']: continue
                                f.write(f"### {col_name}\n")
                                item_str = str(item) if item is not None else ""
                                
                                if 'source' in col_name or 'code' in col_name:
                                        f.write("```c\n")
                                        if item_str:
                                            for line_num, line in enumerate(item_str.split('\n'), 1):
                                                    f.write(f"{line_num}: {line}\n")
                                        f.write("```\n\n")
                                elif 'diff' in col_name or 'delta' in col_name:
                                        f.write("```diff\n")
                                        if item_str:
                                            decoded_str = urllib.parse.unquote(item_str)
                                            try:
                                                    parsed_json = json.loads(decoded_str)
                                                    if isinstance(parsed_json, str): f.write(parsed_json + "\n")
                                                    else: f.write(json.dumps(parsed_json, indent=2, ensure_ascii=False) + "\n")
                                            except json.JSONDecodeError:
                                                    try:
                                                        if '\\u' in decoded_str or '\\x' in decoded_str:
                                                                decoded_str = bytes(decoded_str, "utf-8").decode("unicode_escape")
                                                    except Exception: pass
                                                    f.write(decoded_str + "\n")
                                        f.write("```\n\n")
                                elif col_name in ['breakpoints', 'execution_actions', 'variable_inspection', 'output_streams'] or (item_str.strip().startswith('{') or item_str.strip().startswith('[')):
                                        f.write("```json\n")
                                        if item_str:
                                            try:
                                                    parsed_json = json.loads(item_str)
                                                    f.write(json.dumps(parsed_json, indent=2, ensure_ascii=False) + "\n")
                                            except json.JSONDecodeError:
                                                    f.write(item_str + "\n")
                                        f.write("```\n\n")
                                else:
                                        f.write(f"{item_str}\n\n")
                            f.write("---\n\n")
        
        return output_file
