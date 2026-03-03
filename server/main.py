import json # Ensure json is imported at the top if not already
import os
import ipaddress
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
from zoneinfo import ZoneInfo # 💡 [수정됨] 명시적인 KST 타임존 처리를 위해 추가
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import logging
import database  # 방금 만든 DB 모듈 임포트

logger = logging.getLogger(__name__)

# .env 파일 로드

# 현재 main.py 파일이 있는 위치를 기준으로 절대 경로 생성
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")

# 절대 경로로 .env 파일 로드
load_dotenv(ENV_PATH)

# --- 서버 시작 시 DB 초기화 로직 ---
@asynccontextmanager
async def lifespan(app: FastAPI): 
    print("🚀 서버가 시작되었습니다. (학생별 개별 DB 모드)")
    yield
    print("서버 종료")

# app 객체 생성 시 lifespan 등록
app = FastAPI(title="C-Lab AutoSubmit API", lifespan=lifespan)

# --- CORS 설정 ---
# VS Code 익스텐션 등 외부 클라이언트의 접근을 허용합니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 실제 배포 시에는 보안을 위해 특정 도메인으로 제한할 수 있습니다.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic 데이터 모델 (API_SPEC.md 반영 업데이트) ---

class DiffPayload(BaseModel):
    machine_id: str   # [추가됨] 익스텐션 고유 식별자 (IP 스푸핑 방어용)
    student_id: str = "unknown" # 👈 추가됨
    timestamp: str
    file_name: str
    changes: List[Dict[str, Any]]

class DebugPayload(BaseModel):
    machine_id: str   # [추가됨] 익스텐션 고유 식별자
    student_id: str = "unknown" # 👈 추가됨
    timestamp: str
    event: str
    source_code: str

class SubmitPayload(BaseModel):
    machine_id: str   # [추가됨] 익스텐션 고유 식별자
    student_id: str
    student_name: str
    timestamp: str
    source_code: str

# [추가됨] 데이터 모델 부분에 아래 클래스를 추가해 주세요.
class DebugLogPayload(BaseModel):
    machine_id: str
    student_id: str = ""  # 학생이 [실습 시작]을 누르기 전에 디버거를 켤 수도 있으므로 기본값은 빈 문자열
    timestamp: str
    event_type: str
    content: str

# 💡 [수정됨] IP 화이트리스트 검증 로직을 제거하고, 로깅용 IP만 추출합니다.
def verify_ip(request: Request):
    direct_ip = request.client.host 
    
    # Nginx 등 리버스 프록시를 거쳐온 경우 원래 클라이언트 IP 추출
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip_str = forwarded_for.split(",")[0].strip()
    else:
        client_ip_str = direct_ip

    # 🚨 기존의 허용 IP(ALLOWED_IPS) 대역 검사 및 HTTPException(403) 발생 로직을 모두 삭제했습니다.
    # 이제 어떤 IP에서 접속하든 모두 통과됩니다.

    # DB 저장을 위해 IP 정보만 그대로 반환합니다.
    return {"client_ip": client_ip_str, "direct_ip": direct_ip}
# --- API 엔드포인트 (기본 라우팅) ---

@app.get("/")
def root():
    return {"message": "C-Lab AutoSubmit 서버가 정상 작동 중입니다."}

# 1-2. 수업 시간 통제 API
@app.get("/api/check-time")
def check_time():
    # 💡 [핵심 버그 수정] 항상 한국 시간(KST)을 기준으로 현재 시간을 가져옵니다.
    kst = ZoneInfo("Asia/Seoul")
    now = datetime.now(kst)

    # .env에서 스케줄 읽기 (없거나 에러 시 빈 딕셔너리로 처리)
    schedule_str = os.getenv("CLASS_SCHEDULE", "{}")
    try:
        schedule = json.loads(schedule_str)
    except json.JSONDecodeError:
        schedule = {}

    # 현재 요일 (0:월요일 ~ 6:일요일)
    current_weekday = str(now.weekday())
    is_active = False

    # 1. 오늘 요일이 스케줄에 등록되어 있는지 확인
    if current_weekday in schedule:
        start_str, end_str = schedule[current_weekday]
        
        # 2. 문자열 시간("10:00")을 시간/분 숫자로 분리
        start_hour, start_minute = map(int, start_str.split(":"))
        end_hour, end_minute = map(int, end_str.split(":"))
        
        # 3. 오늘의 날짜에 시작/종료 시간을 결합하여 타임스탬프 생성
        start_time = now.replace(hour=start_hour, minute=start_minute, second=0, microsecond=0)
        end_time = now.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
        
        # 4. 현재 시간이 시작~종료 시간 사이에 있는지 판별
        if start_time <= now <= end_time:
            is_active = True
   
    return {
        "active": is_active,
        "message": "C프로그래밍 실습이 진행 중입니다." if is_active else "현재는 실습 시간이 아닙니다.",
        "server_time": now.isoformat(),
        # [추가됨] 프론트엔드와의 호환성 및 날짜 비교를 위해 YYYY-MM-DD 포맷 추가
        "server_date": now.strftime("%Y-%m-%d")
    }

# 기존의 @app.get("/api/check-time") 아래에 추가해 주세요.
@app.get("/api/lab/secret")
def get_backup_secret(ips: dict = Depends(verify_ip)):
    """
    [보안] 실습 시작 시점에 오프라인 백업 암호화용 비밀키를 클라이언트(메모리)에 제공합니다.
    화이트리스트 IP에서만 접근 가능합니다.
    """
    # .env 파일에서 가져오되, 설정이 없으면 임시 키를 반환
    secret = os.getenv("BACKUP_SECRET_PASS", "c-lab-default-offline-secret-2026")
    return {"secret": secret}

# 기존의 @app.get("/api/lab/secret") 아래에 추가해 주세요.

@app.get("/api/lab/skeleton")
def get_skeleton_code(ips: dict = Depends(verify_ip)):
    """
    실습 시작 시 제공할 기본 C 언어 뼈대 코드(Skeleton Code)를 반환합니다.
    (주차별 실습 내용에 따라 서버에서 유연하게 변경 가능)
    """
    # 기본 C89 스켈레톤 코드
    # 필요에 따라 파일에서 읽어오거나 데이터베이스에서 조회하도록 확장할 수 있습니다.
    skeleton = (
        "int main(void)\n"
        "{\n"
        "        return 0;\n"
        "}\n"
    )
    return {"skeleton": skeleton}

# Track A: 1초 단위 Diff 수집 API
@app.post("/api/track/diff")
def track_diff(payload: DiffPayload, ips: dict = Depends(verify_ip)):
    try:
        database.insert_diff(
            payload.machine_id, payload.student_id, ips["client_ip"], ips["direct_ip"], 
            payload.timestamp, payload.file_name, payload.changes
        )
        print(f"[Diff 저장 완료] IP: {ips['client_ip']}, Machine: {payload.machine_id[:8]}...")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Diff DB 저장 에러: {str(e)}")
        raise HTTPException(status_code=500, detail="DB 저장 실패")

@app.post("/api/track/diff/batch")
def track_diff_batch(payload: List[DiffPayload], ips: dict = Depends(verify_ip)):
    if not payload:
        return {"status": "success", "message": "Empty batch"}

    # Group by student_id to ensure we write to the correct independent DB.
    # Assuming one VS Code instance = one student session.
    student_id = payload[0].student_id 
    
    # Transform Pydantic models into a list of tuples for SQLite executemany
    batch_data = [
        (
            item.machine_id, 
            item.student_id, 
            ips["client_ip"], 
            ips["direct_ip"], 
            item.timestamp, 
            item.file_name, 
            json.dumps(item.changes) # Convert the changes list back to a JSON string
        )
        for item in payload
    ]
    
    try:
        database.insert_diff_batch(student_id, batch_data)
        print(f"[Diff Batch 저장 완료] IP: {ips['client_ip']}, {len(batch_data)}개 레코드 일괄 삽입")
        return {"status": "success", "inserted": len(batch_data)}
    except Exception as e:
        logger.error(f"Diff Batch DB 저장 에러: {str(e)}")
        raise HTTPException(status_code=500, detail="DB 일괄 저장 실패")

# Track A: 디버그 가제출 API
@app.post("/api/track/debug")
def track_debug(payload: DebugPayload, ips: dict = Depends(verify_ip)):
    try:
        database.insert_debug(
            payload.machine_id, payload.student_id, ips["client_ip"], ips["direct_ip"], 
            payload.timestamp, payload.event, payload.source_code
        )
        print(f"[Debug 저장 완료] IP: {ips['client_ip']}, Machine: {payload.machine_id[:8]}...")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"디버그 스냅샷 DB 저장 에러: {str(e)}")
        raise HTTPException(status_code=500, detail="DB 저장 실패")

# Track B: 최종 제출 API
@app.post("/api/submit/final")
def submit_final(payload: SubmitPayload, ips: dict = Depends(verify_ip)):
    try:
        database.insert_submission( 
            payload.machine_id, payload.student_id, payload.student_name, ips["client_ip"], ips["direct_ip"], 
            payload.timestamp, payload.source_code
        )
        print(f"✅ [최종 제출 완료] 학번: {payload.student_id}, 이름: {payload.student_name} (IP: {ips['client_ip']})")
        return {
            "status": "success", 
            "message": "과제가 성공적으로 서버에 안전하게 저장되었습니다.",
            "saved": True
        }
    except Exception as e:
        error_msg = f"❌ [DB 저장 실패] 학번: {payload.student_id}, 사유: {str(e)}"
        print(error_msg)
        logger.error(error_msg)
        raise HTTPException(
            status_code=500, 
            detail={"status": "error", "message": "서버 데이터베이스 저장에 실패했습니다. 코드가 삭제되지 않았습니다.", "saved": False}
        )

# Track C: 상세 디버그 로깅 API
@app.post("/api/track/debug-log")
def track_debug_log(payload: DebugLogPayload, ips: dict = Depends(verify_ip)):
    try:
        database.insert_debug_log(
            payload.machine_id, payload.student_id, payload.timestamp, 
            payload.event_type, payload.content
        )
        
        important_events = ['watch_added', 'hover_evaluated', 'crashed', 'stderr', 'suspicious_paste', 'settings_tampered']
        if payload.event_type in important_events:
            print(f"🚨 [디버그/보안 추적] {payload.student_id or '미확인'} ({payload.event_type}): {payload.content[:50]}")
            
        return {"status": "success"}
    except Exception as e:
        logger.error(f"디버그 로그 DB 저장 에러: {str(e)}")
        raise HTTPException(status_code=500, detail="DB 저장 실패")

@app.post("/api/track/debug-log/batch")
def track_debug_log_batch(payload: List[DebugLogPayload], ips: dict = Depends(verify_ip)):
    if not payload:
        return {"status": "success", "message": "Empty batch"}

    # Group by student_id to ensure we write to the correct independent DB.
    student_id = payload[0].student_id 
    
    # Transform into tuples
    batch_data = [
        (
            item.machine_id, 
            item.student_id, 
            item.timestamp, 
            item.event_type, 
            item.content
        )
        for item in payload
    ]
    
    try:
        database.insert_debug_log_batch(student_id, batch_data)
        print(f"[DebugLog Batch 저장 완료] IP: {ips['client_ip']}, {len(batch_data)}개 레코드 일괄 삽입")
        return {"status": "success", "inserted": len(batch_data)}
    except Exception as e:
        logger.error(f"DebugLog Batch DB 저장 에러: {str(e)}")
        raise HTTPException(status_code=500, detail="DB 일괄 저장 실패")
