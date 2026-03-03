# C 언어 실습 자동화 시스템 API 명세서 (JSON Payload)

**💡 공통 보안 정책:** 

- **IP 확인 방법:** 클라이언트(VS Code)는 IP 주소를 명시적으로 전송하지 않으며, 서버가 HTTP 요청 헤더에서 직접 추출하여 화이트리스트를 검증합니다. (이때, `X-Forwarded-For` 헤더를 통한 Client IP와 실제 요청을 보낸 Direct IP를 교차 검증합니다.)

- **내부망 IP 스푸핑 방지 (Machine ID):** 외부 툴(Postman 등)을 이용한 신분 위장을 막기 위해, 익스텐션은 최초 실행 시 고유한 UUID(`machine_id`)를 발급받아 로컬에 저장하고, 모든 POST 요청에 이 값을 포함하여 전송해야 합니다. 서버는 IP와 `machine_id`가 일치하는지 교차 검증합니다.

**📁 데이터베이스 정책 (학생별 독립 DB):**

- 서버는 동시 접속 시 발생할 수 있는 SQLite의 Lock 병목 현상을 막기 위해, 수신된 `student_id`를 기준으로 `databases/` 폴더에 학생별로 독립된 DB 파일 `student_{student_id}.db`를 동적으로 생성하여 데이터를 저장합니다.

- 실습 시작 전 로그인하지 않은 상태에서 전송되는 로그는 `student_unknown.db` 등에 임시 보관됩니다.

---

### 1. 수업 시간 동기화 API (GET /api/check-time)
* 익스텐션이 1분마다 서버 상태를 확인하기 위해 호출.
* **Request:** 없음
* **Response:**

        {
          "active": true,
          "message": "C프로그래밍 실습이 진행 중입니다.",
          "server_time": "2026-02-28T18:10:00Z",
          "server_date": "2026-02-28"
        }

---

### 1.5. 스켈레톤 코드 제공 API (GET /api/lab/skeleton)
* 실습 파일(`practice_main.c`)이 새로 생성될 때, 베이스가 될 C 언어 뼈대 코드를 제공합니다.
* 주차별로 실습 내용이 다를 경우 서버에서 코드를 동적으로 교체할 수 있습니다.
* **Request:** 없음
* **Response:** HTTP 200 OK

        {
          "skeleton": "int main(void)\n{\n        return 0;\n}\n"
        }

---

### 2. [Track A] 1초 단위 Diff 수집 API (POST /api/track/diff)
* 백그라운드에서 1초 단위로 모인 코드 변경점(Diff) 배열을 서버로 전송.
* **Request Payload:**

        {
          "machine_id": "550e8400-e29b-41d4-a716-446655440000",
          "student_id": "2026-00001",
          "timestamp": "2026-02-28T18:15:30Z",
          "file_name": "practice_main.c",
          "changes": [
            {
              "range": {
                "startLine": 4, "startChar": 0, 
                "endLine": 4, "endChar": 0
              },
              "text": "    int a = 10;\n",
              "rangeLength": 0
            },
            {
              "range": {
                "startLine": 5, "startChar": 4, 
                "endLine": 5, "endChar": 9
              },
              "text": "printf",
              "rangeLength": 5
            }
          ]
        }

* **Response:** HTTP 200 OK
        
        {
          "status": "success"
        }

---

### 3. [Track A] 디버그/실행 시 가제출 API (POST /api/track/debug)
* 학생이 C/C++ 익스텐션의 디버그/실행을 트리거할 때 전체 코드 스냅샷 전송.
* **Request Payload:**

        {
          "machine_id": "550e8400-e29b-41d4-a716-446655440000",
          "student_id": "2026-00001",
          "timestamp": "2026-02-28T18:20:45Z",
          "event": "debug_start",
          "source_code": "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello World!\\n\");\n    return 0;\n}\n"
        }

* **Response:** HTTP 200 OK
        
        {
          "status": "success"
        }

---

### 4. [NEW] [Track C] 상세 디버그 로깅 API (POST /api/track/debug-log)
* DebugAdapterTracker를 통해 가로챈 디버깅 액션 및 콘솔 입출력 로그를 전송.
* **Request Payload:**
        {
          "machine_id": "550e8400-e29b-41d4-a716-446655440000",
          "student_id": "2026-00001",    // [선택] 실습 시작 전이면 빈 문자열("")
          "timestamp": "2026-02-28T18:25:12Z",
          "event_type": "stderr",      // stdout, stderr, stepIn, stepOver, stopped, crashed 등
          "content": "Segmentation fault (core dumped)" // 출력된 내용이나 정지 사유
        }
* **Response:** HTTP 200 OK
        
        {
          "status": "success"
        }

---

### 5. [Track B] 최종 제출 API (POST /api/submit/final)
* 실습 종료 시 명시적으로 우측 하단 제출 버튼 클릭 시 전송하거나 시간 초과 시 강제 자동 제출.
* **Request Payload:**

        {
          "machine_id": "550e8400-e29b-41d4-a716-446655440000",
          "student_id": "2026-00001",
          "student_name": "홍길동",
          "timestamp": "2026-02-28T18:50:00Z",
          "source_code": "#include <stdio.h>\n\nint main(void) {\n    /* 완성된 과제 코드 */\n    return 0;\n}\n"
        }

* **Response:**
  * **성공 시 (HTTP 200):** 익스텐션이 로컬 파일을 안전하게 삭제할 수 있도록 `saved: true`를 반드시 포함합니다.
        {
          "status": "success",
          "message": "과제가 성공적으로 서버에 안전하게 저장되었습니다.",
          "saved": true
        }
  * **실패 시 (HTTP 500 등):**
        {
          "detail": {
            "status": "error",
            "message": "서버 데이터베이스 저장에 실패했습니다. 코드가 삭제되지 않았습니다.",
            "saved": false
          }
        }
