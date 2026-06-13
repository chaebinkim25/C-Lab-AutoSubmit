# _batch_db_from_current_to_md.py

import sqlite3
import json
import os
import glob
import re
import urllib.parse
from collections import defaultdict
from datetime import datetime

# ==========================================
# 1. Utility Functions
# ==========================================

def format_iso_to_kst(ts_string):
    """Cleans up ISO timestamps for the markdown report."""
    if not ts_string:
        return "N/A"
    try:
        clean_str = ts_string.replace('T', ' ')
        if '+' in clean_str:
            clean_str = clean_str.split('+')[0]
        elif 'Z' in clean_str:
            clean_str = clean_str.split('Z')[0]
        clean_str = clean_str.split('.')[0] 
        return f"{clean_str}"
    except Exception:
        return ts_string
    
def sanitize_filename(name):
    """Removes invalid characters from a string for safe filenames."""
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def is_ignored_file(file_name):
    """Filters out noise like hidden files or swap files."""
    if not file_name:
        return False
    name = os.path.basename(file_name)
    if name.startswith(".DS_Store") or name.endswith(".swp"):
        return True
    return False

def extract_task_key(text):
    """Extracts the task group (e.g., 'PART0') from a string."""
    if not text: 
        return "UNKNOWN"
    match = re.search(r'(part\d+)', text, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return os.path.splitext(os.path.basename(text))[0].upper()

def extract_changes_only(patch_text):
    """Parses a unified diff and extracts ONLY additions and deletions."""
    if not patch_text:
        return []
        
    patch_text = patch_text.replace('\r\n', '\n')
    changes = []
    current_type = None
    current_lines = []
    
    def flush():
        if current_type is not None:
            text = '\\n'.join(current_lines)
            if text != "":
                text = text.replace('"', '\\"')
                changes.append(f'{current_type}"{text}"')
        current_lines.clear()

    for line in patch_text.split('\n'):
        if line.startswith('---') or line.startswith('+++') or line.startswith('@@'):
            continue
        
        if line.startswith('+'):
            if current_type != '+':
                flush()
                current_type = '+'
            current_lines.append(line[1:])
        elif line.startswith('-'):
            if current_type != '-':
                flush()
                current_type = '-'
            current_lines.append(line[1:])
        else:
            flush()
            current_type = None
            
    flush()
    return changes

def format_custom_diff_array(diff_list):
    """Formats the array so it bypasses strict JSON string-escaping."""
    items = []
    for item in diff_list:
        if isinstance(item, (int, float)):
            items.append(str(int(item)))
        else:
            items.append(item)
    return "[" + ", ".join(items) + "]"

def convert_utc_to_kst(utc_string):
    """Converts a UTC timestamp string to KST."""
    if not utc_string:
        return "N/A"
    return format_iso_to_kst(utc_string)

# ==========================================
# 2. Main DB Extraction Pipeline
# ==========================================

def process_and_merge_databases(target_path="./data/shards", output_dir="zipped_data_report"):
    if not os.path.exists(target_path):
        target_path = "./data" if os.path.exists("./data") else target_path
        if not os.path.exists(target_path):
            print(f"Data directory '{target_path}' does not exist.")
            return
        
    os.makedirs(output_dir, exist_ok=True)
       
    # Resolve DB files
    db_files = []
    if os.path.isfile(target_path) and target_path.endswith('.db'):
        db_files = [target_path]
    else:
        db_files = glob.glob(os.path.join(target_path, "**", "*.db"), recursive=True)
        if not db_files:
            db_files = glob.glob(os.path.join(target_path, "*.db"))

    if not db_files:
        print(f"No database files found at '{target_path}'")
        return

    task_title_map = {
        "PART0": "포장 타입 만들기",
        "PART1": "포장 타입 상자 만들기",
        "PART2": "포장 타입 상자의 멤버에 접근하기",
        "PART3": "포장 타입 상자의 주소 저장하기",
        "PART4": "포장 타입 상자 주소에서 바로 멤버 쓰기",
        "PART5": "포장 타입 상자 주소 멤버",
        "PART6": "단방향 원형 링크드 리스트",
        "PART7": "노드에 데이터 붙이기",
        "PART8": "단방향 원형 링크드 리스트 만들기",
        "PART9": "단방향 원형 링크드 리스트에서 노드 삭제하기"
    }
    
    # --- GLOBAL TRACKING VARIABLES ---
    global_max_submitted_part = -1
    global_max_worked_part = -1

    for db_path in db_files:
        print(f"⏳ Processing database: {os.path.basename(db_path)}")
        
        student_num = "UNKNOWN"
        student_name = "UNKNOWN"
        all_logs = []
        all_patches = []
        all_submissions = []
        
        conn = None

        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            
            # 1. Read Minimal Metadata
            cur.execute("SELECT student_number, student_name FROM sessions LIMIT 1")
            meta_row = cur.fetchone()
            if meta_row:
                student_num, student_name = meta_row
            
            # 2. Extract JSON payloads from raw_telemetry
            cur.execute("SELECT payload FROM raw_telemetry ORDER BY rowid ASC")
            for row in cur.fetchall():
                try:
                    payload = json.loads(row[0])
                    all_logs.extend(payload.get('pendingLogs', []))
                    all_patches.extend(payload.get('patches', []))
                    all_submissions.extend(payload.get('submissions', []))
                except json.JSONDecodeError:
                    continue

        except Exception as e:
            print(f"❌ Error reading {os.path.basename(db_path)}: {e}")
            continue
        finally:
            if conn: conn.close()
            
        if not all_logs and not all_patches:
            print(f"⚠️ No telemetry data found in {os.path.basename(db_path)}. Skipping.")
            continue

        # Sort extracted data
        all_logs.sort(key=lambda x: x.get('elapsed_seconds', 0))
        all_patches.sort(key=lambda x: x.get('elapsed_seconds', 0))
        all_submissions.sort(key=lambda x: x.get('timestamp', ''))

        timestamps = [log.get('timestamp') for log in all_logs if log.get('timestamp')]
        start_time = timestamps[0] if timestamps else "N/A"
        end_time = timestamps[-1] if timestamps else "N/A"

        # 3. Build the Task Timeline
        timeline = []
        for log in all_logs:
            code = log.get('code', '')
            if code in ('TASK_PROVISION', 'TASK_RESTORE'):
                args = log.get('args', [])
                if args:
                    task_id = args[0]
                    timeline.append((log.get('elapsed_seconds', 0), task_id))
                    
                    # Track max part worked on
                    match = re.search(r'PART(\d+)', task_id, re.IGNORECASE)
                    if match:
                        global_max_worked_part = max(global_max_worked_part, int(match.group(1)))

        def get_active_task(elapsed):
            active_task = "UNKNOWN"
            for t_sec, task_id in timeline:
                if elapsed >= t_sec:
                    active_task = task_id
                else:
                    break
            return active_task

        # 4. Map Data to Tasks
        tasks_data = defaultdict(lambda: {'diffs': [], 'submissions': []})
        
        # Route Patches
        for diff in all_patches:
            elapsed = diff.get('elapsed_seconds', 0)
            file_path = diff.get('file_path', '')
            is_baseline = diff.get('is_baseline', False)
            patch = diff.get('delta_patch', '')
            
            if is_ignored_file(file_path) or is_baseline:
                continue
                
            task_key = extract_task_key(get_active_task(elapsed))
            tasks_data[task_key]['diffs'].append({
                'elapsed': elapsed,
                'file': file_path,
                'patch': patch
            })

        # Route Submissions
        for sub in all_submissions:
            task_key = extract_task_key(sub.get('task_id', 'UNKNOWN'))
            
            # --- Track Max Submitted Part ---
            match = re.search(r'PART(\d+)', task_key, re.IGNORECASE)
            if match:
                global_max_submitted_part = max(global_max_submitted_part, int(match.group(1)))
            # --------------------------------

            time_str = sub.get('timestamp', '')
            files = []
            
            for f_path, content in sub.get('sourceFiles', {}).items():
                files.append({'file': f_path, 'content': content})
                
            tasks_data[task_key]['submissions'].append({
                'time': time_str,
                'files': files
            })

        if '00000' in str(student_num):
            continue
        
        # 5. Generate Markdown Report
        safe_name = sanitize_filename(student_name)
        raw_filename = f"컴프실_실습_15주차_{safe_name}.md"
        raw_md_path = os.path.join(output_dir, raw_filename)
        
        with open(raw_md_path, 'w', encoding='utf-8') as f:
            f.write(f"# 실습 로그 - 파일\n\n")
            f.write(f"**학번:** {student_num} **이름:** {student_name}\n")
            f.write(f"**실습 시작:** `{format_iso_to_kst(start_time)}`\n")
            f.write(f"**실습 종료:** `{format_iso_to_kst(end_time)}`\n\n")

            def get_task_num(t_name):
                match = re.search(r'\d+', t_name)
                return int(match.group()) if match else 9999

            for task_name in sorted(tasks_data.keys(), key=get_task_num):
                if task_name == "UNKNOWN": continue
                
                content = tasks_data[task_name]
                display_title = task_title_map.get(task_name.upper(), task_name)
                
                f.write(f"## {display_title}\n\n")
                
                # Format Diff History
                diff_array = []
                for d in content.get('diffs', []):
                    try:
                        decoded_patch = urllib.parse.unquote(d['patch'])
                    except Exception:
                        decoded_patch = d['patch']
                    
                    changes = extract_changes_only(decoded_patch)
                    for change in changes:
                        diff_array.extend([d['elapsed'], change])
                
                if diff_array:
                    f.write("### 작성 과정\n")
                    f.write("```text\n")
                    f.write(format_custom_diff_array(diff_array))
                    f.write("\n```\n\n")
                else:
                    f.write("### 작성 기록: 없음\n\n")

                # Format Final Source Code Submission
                raw_content = ''
                ext = 'c'
                raw_time = ''

                if content['submissions']:
                    latest_sub = content['submissions'][-1]
                    if latest_sub['files']:
                        file_info = latest_sub['files'][0]
                        raw_content = file_info['content'] if file_info['content'] else ''
                        ext = file_info['file'].split('.')[-1].lower() if '.' in file_info['file'] else 'c'
                        raw_time = latest_sub['time']

                if ext in ["md", "markdown"]:
                    continue

                f.write("### 소스 코드")
                if raw_time:               
                    f.write(f": `{convert_utc_to_kst(raw_time)}`\n")
                else:
                    f.write("\n")

                if raw_content.strip():
                    raw_content = re.sub(r'/\*\s*\* Student ID:.*?\* Name:.*?\*/\s*', '', raw_content, flags=re.DOTALL | re.IGNORECASE)
                else:
                    raw_content = "/* 제출된 내용이 없습니다 (No code submitted) */"

                f.write(f"```{ext}\n{raw_content.strip()}\n```\n\n")              

    print(f"\nFinished generating reports in '{output_dir}/'")
    
    print("\n" + "="*40)
    print("BATCH SUMMARY")
    print("="*40)
    if global_max_worked_part >= 0:
        print(f"Highest Part Worked On   : PART{global_max_worked_part}")
    if global_max_submitted_part >= 0:
        print(f"Highest Part Submitted   : PART{global_max_submitted_part}")
    else:
        print("Highest Part Submitted   : None found.")
    print("="*40 + "\n")

if __name__ == "__main__":
    process_and_merge_databases(target_path="./data5/", output_dir="./zipped_data_report")
