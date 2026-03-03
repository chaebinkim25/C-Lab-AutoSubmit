# server/database.py

import sqlite3
import json
import os
from contextlib import closing

# DB 파일들을 모아둘 폴더 생성
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FOLDER = os.path.join(BASE_DIR, "databases")
os.makedirs(DB_FOLDER, exist_ok=True)

def get_db_connection(student_id: str):
    """학번별로 독립된 DB 파일을 생성하고 연결합니다."""
    safe_id = "".join(c for c in student_id if c.isalnum() or c in "-_")
    if not safe_id:
        safe_id = "unknown"
        
    db_path = os.path.join(DB_FOLDER, f"student_{safe_id}.db")
    
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute('PRAGMA journal_mode=WAL;')
    
    # 연결할 때마다 테이블이 존재하는지 확인하고 없으면 만듭니다.
    init_tables(conn)
    return conn

def init_tables(conn):
    cursor = conn.cursor()

    # 1. 1초 단위 Diff 기록 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS diff_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT,
            student_id TEXT,
            ip_address TEXT,
            direct_ip TEXT, 
            timestamp TEXT,
            file_name TEXT,
            changes TEXT
        )
    ''')
    
    # 2. 디버그/실행 스냅샷 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS debug_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT,
            student_id TEXT,
            ip_address TEXT,
            direct_ip TEXT,
            timestamp TEXT,
            event TEXT,
            source_code TEXT
        )
    ''')
    
    # 3. [Track C] 상세 디버그 로깅 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS debug_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT,
            student_id TEXT,
            timestamp TEXT,
            event_type TEXT,
            content TEXT
        )
    ''')

    # 4. 최종 제출 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id TEXT,
            student_id TEXT,
            student_name TEXT,
            ip_address TEXT,
            direct_ip TEXT,
            timestamp TEXT,
            source_code TEXT
        )
    ''')

    conn.commit()

# --- 데이터 삽입 함수 ---

def insert_diff(machine_id: str, student_id: str, ip_address: str, direct_ip: str, timestamp: str, file_name: str, changes: list):
    with closing(get_db_connection(student_id)) as conn:
        conn.execute(
            "INSERT INTO diff_logs (machine_id, student_id, ip_address, direct_ip, timestamp, file_name, changes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (machine_id, student_id, ip_address, direct_ip, timestamp, file_name, json.dumps(changes))
        )
        conn.commit()

def insert_diff_batch(student_id: str, batch_data: list):
    """
    batch_data format: list of tuples 
    [(machine_id, student_id, ip_address, direct_ip, timestamp, file_name, changes_json), ...]
    """
    with closing(get_db_connection(student_id)) as conn:
        conn.executemany(
            "INSERT INTO diff_logs (machine_id, student_id, ip_address, direct_ip, timestamp, file_name, changes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            batch_data
        )
        conn.commit()

def insert_debug(machine_id: str, student_id: str, ip_address: str, direct_ip: str, timestamp: str, event: str, source_code: str):
    with closing(get_db_connection(student_id)) as conn:
        conn.execute(
            "INSERT INTO debug_logs (machine_id, student_id, ip_address, direct_ip, timestamp, event, source_code) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (machine_id, student_id, ip_address, direct_ip, timestamp, event, source_code)
        )
        conn.commit()

def insert_debug_log(machine_id: str, student_id: str, timestamp: str, event_type: str, content: str):
    with closing(get_db_connection(student_id)) as conn:
        conn.execute(
            "INSERT INTO debug_events (machine_id, student_id, timestamp, event_type, content) VALUES (?, ?, ?, ?, ?)",
            (machine_id, student_id, timestamp, event_type, content)
        )
        conn.commit()

def insert_debug_log_batch(student_id: str, batch_data: list):
    """
    batch_data format: list of tuples 
    [(machine_id, student_id, timestamp, event_type, content), ...]
    """
    with closing(get_db_connection(student_id)) as conn:
        conn.executemany(
            "INSERT INTO debug_events (machine_id, student_id, timestamp, event_type, content) VALUES (?, ?, ?, ?, ?)",
            batch_data
        )
        conn.commit()
        
def insert_submission(machine_id: str, student_id: str, student_name: str, ip_address: str, direct_ip: str, timestamp: str, source_code: str):
    with closing(get_db_connection(student_id)) as conn:
        conn.execute(
            "INSERT INTO submissions (machine_id, student_id, student_name, ip_address, direct_ip, timestamp, source_code) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (machine_id, student_id, student_name, ip_address, direct_ip, timestamp, source_code)
        )
        conn.commit()
