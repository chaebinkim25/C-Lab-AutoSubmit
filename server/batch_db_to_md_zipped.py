# batch_db_to_md_zipped.py

import sqlite3
import json
import os
import glob
import re
import difflib
from collections import defaultdict
from datetime import datetime, timedelta

# ==========================================
# 1. Utility Functions
# ==========================================

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def parse_db_timestamp(ts_str):
    """Safely converts a database timestamp string into a Python datetime object."""
    if not ts_str:
        return None
    
    ts_clean = ts_str.replace('T', ' ').replace('Z', '').strip()
    try:
        if '.' in ts_clean:
            return datetime.strptime(ts_clean, "%Y-%m-%d %H:%M:%S.%f")
        else:
            return datetime.strptime(ts_clean, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None

def get_seconds_from_start(current_ts_str, start_dt):
    """Returns the time difference in seconds (e.g., '45s')."""
    current_dt = parse_db_timestamp(current_ts_str)
    
    if not current_dt or not start_dt:
        return 0
        
    delta = current_dt - start_dt
    return delta

def extract_task_key(text):
    """
    Intelligently extracts the task group (e.g., 'part0') from a string.
    Helps group 'lab6_part0.c', 'part0', and similar naming conventions together.
    """
    if not text: 
        return "Unknown"
    match = re.search(r'(part\d+)', text, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    return os.path.splitext(os.path.basename(text))[0]

def convert_submissions_to_parsed_files(submissions: list):
    """
    Reads a raw JSON submission snapshot, parses it, and creates a 
    sorted list of tuples containing (file_name, source_code).
    """
    for sub in submissions:
        # Parse Source Code files
        raw_json_string = sub.get('code', '{}')
        
        try:
            # 1. Parse the JSON string into a Python dictionary
            files_dict = json.loads(raw_json_string)
            
            # 2. Sort the dictionary items alphabetically by file_name (which is x[0])
            sorted_files = sorted(files_dict.items(), key=lambda x: x[0])
            
            # 3. Store the structured, sorted data back into the event
            sub['parsed_files'] = sorted_files
            
        except json.JSONDecodeError as e:
            print(f"Error decoding json string {raw_json_string}: {e}")
            # Fallback if the database contained malformed text instead of JSON
            sub['parsed_files'] = [("Parse_Error.txt", raw_json_string)]

def extract_breakpoints_from_gdb(stdout_text):
    """Scans GDB stdout to extract exactly where execution stopped and the code snippet."""
    extracted_bps = []
    if not stdout_text: 
        return extracted_bps
    
    lines = stdout_text.split('\n')
    
    # Matches strings like: "Breakpoint 1, main () at /path/to/lab6_part0.c:22"
    bp_pattern = re.compile(r"Breakpoint \d+, .*? at .*?/([^/]+):(\d+)")
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        match = bp_pattern.search(line)
        
        if match:
            file_name = match.group(1)
            line_num = match.group(2)
            code_snippet = ""
            
            # The actual code snippet is printed on the very next line in GDB
            if i + 1 < len(lines):
                next_line = lines[i+1].strip()
                # Confirm it starts with the line number to ensure it's the code line
                if next_line.startswith(line_num):
                    # Slice off the line number and strip any extra tabs
                    code_snippet = next_line[len(line_num):].strip()
                    i += 1 # Skip this line so we don't process it again
            
            extracted_bps.append({
                'file': file_name,
                'line': line_num,
                'code': code_snippet
            })
        i += 1
        
    return extracted_bps

def convert_debug_logs_to_parsed_data(debug_logs: list):
    """
    Reads raw JSON strings for all debug log columns and parses them 
    into clean Python dictionaries and lists.
    """
    for log in debug_logs:
        # 1. Parse Output Streams
        raw_streams = log.get('output_streams', '{}')
        try:
            streams_dict = json.loads(raw_streams)
            log['parsed_stdout'] = streams_dict.get('stdout', '')
            log['parsed_stderr'] = streams_dict.get('stderr', '')
        except json.JSONDecodeError:
            log['parsed_stdout'] = raw_streams
            log['parsed_stderr'] = ''

        # 2. Extract Breakpoints & Active File directly from GDB Output
        log['parsed_breakpoints'] = extract_breakpoints_from_gdb(log['parsed_stdout'])
        
        # The active file is simply the file where the GDB breakpoint hit occurred
        if log['parsed_breakpoints']:
            log['active_file'] = log['parsed_breakpoints'][0]['file']
        else:
            log['active_file'] = None

        # 3. Parse Execution Actions
        try:
            log['parsed_actions'] = json.loads(log.get('execution_actions', '[]'))
        except json.JSONDecodeError:
            log['parsed_actions'] = []

        # 4. Parse Variable Inspection
        try:
            log['parsed_vars'] = json.loads(log.get('variable_inspection', '{}'))
        except json.JSONDecodeError:
            log['parsed_vars'] = {}

        # 5. Parse Source Snapshot
        raw_source = log.get('source_snapshot', '')
        if raw_source:
            try:
                # Try to parse it as JSON first (just in case)
                log['parsed_source'] = json.loads(raw_source)
            except json.JSONDecodeError:
                # If it fails, it means it's just raw C code! Store it under a special key.
                log['parsed_source'] = {'_RAW_CODE_': raw_source}
        else:
            log['parsed_source'] = {}

# ==========================================
# 2. Diff Conversion Logic
# ==========================================

def convert_snapshots_to_keystrokes(contents: list):
    """
    Reads raw snapshots and converts them into an alternating array of 
    time deltas (seconds) and string changes.
    Output format: [time_delta, '+added_text', time_delta, '-removed_text', ...]
    """
    contents.sort(key=lambda x: x.get('time', ''))

    previous_code = ""
    start_time = None

    flat_keystrokes = []

    for current_content in contents:
        current_code = current_content.get('codes', '')
        current_time_str = current_content.get('time')
        
        # Parse the current timestamp safely
        current_time = parse_db_timestamp(current_time_str)
        
        # Lock in the start_time on the very first valid snapshot
        if start_time is None and current_time is not None:
            start_time = current_time

        # Calculate time delta in seconds
        time_from_start = 0
        if start_time and current_time:
            time_from_start = int((current_time - start_time).total_seconds())
            
        snapshot_changes = []

        # Only process if the code actually changed
        if current_code != previous_code:
            
            # 1. Strip identical prefix
            pref_len = 0
            min_len = min(len(previous_code), len(current_code))
            while pref_len < min_len and previous_code[pref_len] == current_code[pref_len]:
                pref_len += 1
                
            # 2. Strip identical suffix
            suff_len = 0
            rem_len = min_len - pref_len
            while suff_len < rem_len and previous_code[-(suff_len + 1)] == current_code[-(suff_len + 1)]:
                suff_len += 1
                
            # 3. Isolate the tiny piece of text that actually changed
            prev_mid = previous_code[pref_len : len(previous_code) - suff_len]
            curr_mid = current_code[pref_len : len(current_code) - suff_len]
            
            # 4. Run SequenceMatcher ONLY on the changed portion
            matcher = difflib.SequenceMatcher(None, prev_mid, curr_mid)
            
            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == 'insert':
                    # Additions remain as plain raw strings
                    snapshot_changes.append(curr_mid[j1:j2])
                elif tag == 'delete':
                    # Deletions are prefixed with "del:"
                    snapshot_changes.append(f"del:{prev_mid[i1:i2]}")
                elif tag == 'replace':
                    # A replace is a deletion followed by an addition
                    snapshot_changes.append(f"del:{prev_mid[i1:i2]}")
                    snapshot_changes.append(curr_mid[j1:j2])
                    
            # 5. Append directly to the master list
            if snapshot_changes:
                flat_keystrokes.append(time_from_start)
                flat_keystrokes.extend(snapshot_changes)
                
        # Update references for the next loop
        previous_code = current_code

    # Return the fully flattened array
    return flat_keystrokes


# ==========================================
# 3. Main DB Extraction Pipeline
# ==========================================

def process_and_merge_databases(data_dir="./data", output_dir="zipped_data_report"):
    if not os.path.exists(data_dir):
        return
        
    os.makedirs(output_dir, exist_ok=True)
      
    search_pattern = os.path.join(data_dir, "*.db")
    db_files = glob.glob(search_pattern)
    
    if not db_files:
        print("no db file")
        return

    # Categorize lists to preserve original database table structure
    students_data = defaultdict(lambda: {
        'name': 'Unknown',
        'sessions': [],
        'diffs': {}, 
        'submissions': [],
        'security_violations': [],
        'debug_logs': [],
    })

    # --- Phase 1: Read Databases ---
    for db_path in db_files:
        print(f"⏳ reading db file: {os.path.basename(db_path)}")
        conn = None 
        
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()

            student_number = f"UNKNOWN_{os.path.basename(db_path)}"

            # 1. Session Metadata
            try: 
                cur.execute("SELECT student_number, student_name, machine_id, os_platform, start_timestamp FROM session_metadata LIMIT 1")
                meta_row = cur.fetchone()
                if not meta_row:
                    continue 
                    
                student_number, student_name, machine_id, os_platform, start_timestamp = meta_row
                students_data[student_number]['name'] = student_name
                
                # Append to 'sessions' list 
                students_data[student_number]['sessions'].append({
                    'time': start_timestamp,
                    'machine_id': machine_id,
                    'os_env': os_platform,
                    'source_db': os.path.basename(db_path)
                })
            except sqlite3.OperationalError as e:
                print(f"Error reading session metadata in {os.path.basename(db_path)}: {e}")
                pass
            except Exception as e: 
                print(f"Error processing session metadata in {os.path.basename(db_path)}: {e}")

            # 2. Diff logs
            try: 
                cur.execute("SELECT timestamp, file_name, diff_payload FROM diff_logs")
                for row in cur.fetchall():
                    # 'diff' info
                    time = row[0]
                    file_name = row[1]
                    payload = row[2]
                    
                    # Group by file_name inside the diffs dictionary
                    students_data[student_number]['diffs'].setdefault(file_name, []).append({
                        'time': time,
                        'codes': payload,
                    })
            except sqlite3.OperationalError as e:
                print(f"Error reading diff logs in {os.path.basename(db_path)}: {e}")
                pass
            except Exception as e: 
                print(f"Error processing diff logs in {os.path.basename(db_path)}: {e}")

            # 3. Submissions
            try: 
                cur.execute("SELECT * FROM submissions")
                columns = [desc[0] for desc in cur.description]
                for row in cur.fetchall():
                    row_dict = dict(zip(columns, row))
                    students_data[student_number]['submissions'].append({
                        'time': row_dict.get('timestamp'),
                        'sub_type': row_dict.get('submission_type'),
                        'task_id': row_dict.get('task_id'),
                        'code': row_dict.get('source_files_snapshot'),
                        'vscode_config': row_dict.get('vscode_config_snapshot')
                    })
            except sqlite3.OperationalError as e:
                print(f"Error reading submissions in {os.path.basename(db_path)}: {e}")
                pass
            except Exception as e: 
                print(f"Error processing submissions in {os.path.basename(db_path)}: {e}")

            # 4. Security Violations
            try: 
                cur.execute("SELECT timestamp, violation_type, file_name, details FROM security_violations")
                for row in cur.fetchall():
                    students_data[student_number]['security_violations'].append({
                        'time': row[0],
                        'violation_type': row[1],
                        'file_name': row[2],
                        'details': row[3],
                    })
            except sqlite3.OperationalError as e:
                print(f"Error reading security violations in {os.path.basename(db_path)}: {e}")
                pass
            except Exception as e: 
                print(f"Error processing security violations in {os.path.basename(db_path)}: {e}")

            # 5. Debug Logs
            try: 
                cur.execute("SELECT timestamp, source_snapshot, breakpoints, execution_actions, variable_inspection, output_streams FROM debug_logs")
                for row in cur.fetchall():
                    students_data[student_number]['debug_logs'].append({
                        'time': row[0],
                        'source_snapshot': row[1],
                        'breakpoints': row[2],
                        'execution_actions': row[3],
                        'variable_inspection': row[4],
                        'output_streams': row[5],
                    })
            except sqlite3.OperationalError as e:
                print(f"Error reading debug logs in {os.path.basename(db_path)}: {e}")
                pass
            except Exception as e: 
                print(f"Error processing debug logs in {os.path.basename(db_path)}: {e}")

        except Exception as e: 
            print(f"Error processing {os.path.basename(db_path)}: {e}")
        finally:
            if conn: 
                conn.close()

    # --- Phase 2.1: Parse Debug Logs and Resolve Active Files ---
    print("⏳ Resolving active debug files...")
    for student_number, data in students_data.items():
        # Parse debug logs FIRST so we have the breakpoints and source code ready
        convert_debug_logs_to_parsed_data(data['debug_logs'])
        
        for log in data['debug_logs']:
            source_files = log.get('parsed_source', {})
            raw_source = source_files.get('_RAW_CODE_', '')
            
            if not raw_source:
                log['active_file'] = None
                continue
                
            best_match_file = None
            best_ratio = 0.0
            
            # To save time, only check files that actually have a breakpoint
            bps = log.get('parsed_breakpoints', [])
            candidate_files = {bp.get('file') for bp in bps if bp.get('file')}
            
            for file_name in candidate_files:
                snapshots = data['diffs'].get(file_name, [])
                if not snapshots:
                    continue
                
                # Compare raw source against the last few snapshots of this file
                for snap in reversed(snapshots[-3:]):
                    ratio = difflib.SequenceMatcher(None, raw_source, snap['codes']).quick_ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match_file = file_name
                        
            # Save the winning file name into the log event
            log['active_file'] = best_match_file

    # --- Phase 2.2: Convert Snapshots to True Diffs ---
    print("⏳ Converting snapshots to keystrokes...")
    for student_number, data in students_data.items():
        for file_name, snapshots in data['diffs'].items():
            
            if not snapshots:
                continue
                
            # Keep the very first timestamp so Phase 4 knows where to put this in the timeline
            first_time = snapshots[0].get('time', '')
            
            # Run the conversion to get ONE flattened list
            flat_array = convert_snapshots_to_keystrokes(snapshots)
            
            # Replace the hundreds of snapshots with ONE single packaged event
            if flat_array:
                data['diffs'][file_name] = [{
                    'time': first_time,
                    'codes': flat_array
                }]
            else:
                data['diffs'][file_name] = []

    # --- Phase 3: Convert Submitted Snapshots to Codes ---
    print("⏳ Parsing and sorting submission snapshots...")
    for student_number, student_info in students_data.items():
        # Pass the student's list of submissions directly into the new function
        # It will modify the list in-place, just like the diff function
        convert_submissions_to_parsed_files(student_info['submissions'])

    # --- Phase 4: Write Raw MD ---
    print("⏳ Writing Markdown reports...")
    
    for student_number, data in students_data.items():

        # 1. Group data into tasks (e.g., 'part0', 'part1')
        tasks_data_map = defaultdict(lambda: {
            'keystrokes': [], 
            'submissions': [], 
            'debugs': []
        })
        global_events = []

        # Global events that don't belong to a specific task
        for session in data['sessions']:
            global_events.append(f"- **Session Started** at `{session.get('time')}` on `{session.get('os_env')}`")
        for violation in data['security_violations']:
            # Skip the iteration if it's the specific violation to ignore
            if violation.get('violation_type') == 'File Modified (Save/External)':
                continue
            global_events.append(f"- **Security Info:** `{violation.get('violation_type')}` on file `{violation.get('file_name')}`")

        # Categorize DIFFS (Keystrokes)
        for file_name, snapshots in data['diffs'].items():
            task_key = extract_task_key(file_name)
            for snap in snapshots:
                tasks_data_map[task_key]['keystrokes'].append({**snap, 'file_name': file_name})

        # Categorize SUBMISSIONS
        for sub in data['submissions']:
            task_key = extract_task_key(sub.get('task_id', 'Unknown'))
            tasks_data_map[task_key]['submissions'].append(sub)
        
        # Categorize DEBUG LOGS
        for debug in data['debug_logs']:
            active_file = debug.get('active_file')
            task_key = extract_task_key(active_file) if active_file else "Unknown"
            tasks_data_map[task_key]['debugs'].append(debug)

        # Inject the last debug snapshot as a submission candidate
        for task_key, task_content in tasks_data_map.items():
            debugs = task_content.get('debugs', [])
            if debugs:
                # Get the absolute latest debug log for this task
                last_debug = sorted(debugs, key=lambda x: x.get('time', ''))[-1]
                
                parsed_source = last_debug.get('parsed_source', {})
                parsed_files = []
                
                if '_RAW_CODE_' in parsed_source:
                    # Handle fallback raw code format
                    file_name = last_debug.get('active_file') or f"{task_key}_debug_fallback.c"
                    parsed_files.append((file_name, parsed_source['_RAW_CODE_']))
                else:
                    # Handle normal JSON dict format
                    parsed_files = sorted(parsed_source.items(), key=lambda x: x[0])
                
                # If we successfully extracted code, append it as a "mock" submission
                if parsed_files:
                    mock_sub = {
                        'time': last_debug.get('time'),
                        'sub_type': 'Debug Snapshot Candidate',
                        'task_id': task_key,
                        'parsed_files': parsed_files
                    }
                    task_content['submissions'].append(mock_sub)

        # Filter to retain ONLY ONE valid submission (Longest Code for THIS task)
        for task_key, task_content in tasks_data_map.items():
            subs = task_content['submissions']
            if len(subs) > 0:
                def get_code_length(submission):
                    length = 0
                    for f_name, source_code in submission.get('parsed_files', []):
                        # ONLY count the characters if the file belongs to the current task
                        file_task_key = extract_task_key(f_name)
                        if file_task_key == task_key or task_key in f_name:
                            length += len(source_code.strip())
                    return length
                
                # This will automatically pick the best version specific to this task
                valid_submission = max(subs, key=get_code_length)
                task_content['submissions'] = [valid_submission]

        # 2. Setup output file
        safe_name = sanitize_filename(data['name'])
        
        raw_filename = f"컴프실_실습_6주차_{safe_name}_{student_number}_압축데이터.md"
        raw_md_path = os.path.join(output_dir, raw_filename)

        with open(raw_md_path, 'w', encoding='utf-8') as f:
            f.write(f"# 실습 로그 - 코드 묶음\n\n")
            f.write(f"**날짜:** 2026-04-10 **학번:** {student_number} **이름:** {data['name']}\n\n")

            # Iterate through tasks alphabetically (e.g., part0, part1, part2...)
            for task_name in sorted(tasks_data_map.keys()):
                task_content = tasks_data_map[task_name]
                
                # Skip the "Unknown" bucket if it's completely empty
                if task_name == "Unknown" and not any([task_content['keystrokes'], task_content['submissions'], task_content['debugs']]):
                    continue

                f.write(f"## Task: {task_name.upper()}\n\n")

                # ===============================
                # PART A: Keystrokes
                # ===============================
                if task_content['keystrokes']:
                    for item in task_content['keystrokes']:
                        f.write(f"### Keystrokes: `{item.get('file_name', 'Unknown')}`\n")
                        f.write(f"`{item.get('codes', [])}`\n\n")
                else:
                    f.write("### Keystrokes: None\n\n")

                # ===============================
                # PART B: Submissions
                # ===============================
                if task_content['submissions']:
                    for item in task_content['submissions']:
                        f.write(f"### Submission\n")
                        # Only print files that match this task key to avoid printing other task's code
                        for submitted_file_name, source_code in item.get('parsed_files', []):
                            file_task_key = extract_task_key(submitted_file_name)
                            if file_task_key == task_name or task_name in submitted_file_name:
                                f.write(f"**File:** `{submitted_file_name}`\n")
                                f.write("```c\n")
                                f.write(f"{source_code.strip()}\n")
                                f.write("```\n\n")
                else:
                    f.write("### Submission: None\n\n")

                # ===============================
                # PART C: Debug Logs
                # ===============================
                if task_content['debugs']:
                    for idx, item in enumerate(task_content['debugs'], 1):
                        f.write(f"### Debug Session #{idx}\n")
                        
                        bps = item.get('parsed_breakpoints', [])
                        active_file = item.get('active_file')
                        
                        if bps:
                            f.write(f"**Breakpoints Hit:** {active_file}\n")
                            for bp in bps:
                                file_name = bp.get('file', 'Unknown')
                                line_num = bp.get('line', '?')
                                code_snippet = bp.get('code', '')
                                
                                if code_snippet:
                                    f.write(f"* Hit in {line_num}: `{code_snippet}`\n")
                                else:
                                    f.write(f"* Hit in `{file_name}` at line `{line_num}`\n")
                                    
                        actions = item.get('parsed_actions', [])
                        if actions:
                            f.write("\n**Execution Actions:**\n")
                            for action in actions:
                                f.write(f"* {action}\n")

                        vars_insp = item.get('parsed_vars', {})
                        if vars_insp.get('hover') or vars_insp.get('watch'):
                            f.write("\n**Variable Inspection:**\n")
                            for hover in vars_insp.get('hover', []):
                                f.write(f"* [Hover] `{hover.get('expression')}`\n")
                            for watch in vars_insp.get('watch', []):
                                f.write(f"* [Watch] `{watch.get('expression')}`\n")
                        f.write("\n")
                else:
                    f.write("### Debug Session: None\n\n")

                f.write("---\n\n")

            if global_events:
                f.write(f"## Global Events\n")
                for evt in global_events:
                    f.write(f"{evt}\n")
                f.write("\n---\n\n")

    print(f"✅ Finished generating reports in '{output_dir}/'")


if __name__ == "__main__":
    process_and_merge_databases(data_dir="./data", output_dir="zipped_data_report")
