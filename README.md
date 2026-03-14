# C-Lab-AutoSubmit
C 언어 실습 자동화 및 과제 제출 시스템

## 백엔드 서버 환경설정

### 윈도우 - powershell 또는 cmd에서

**파이썬 가상환경 생성**

```bash
mkdir c-lab-server
cd c-lab-server

python -m venv venv

venv\Scripts\activate
```

실행 결과: 터미널 프롬프트 앞에 `(venv)` 표시됨

**FastAPI, Uvicorn 설치**

```bash
pip install fastapi uvicorn
```

실행 결과: FastAPI와 Uvicorn이 설치되었다는 메시지가 나옴

**소스코드 이동**

`main.py`, `database.py`, `.env` 파일을 `c-lab-server` 폴더로 이동

**서버 실행**

```bash
uvicorn main:app --reload
```

실행 결과: 서버가 시작된다는 메시지

**브라우저에서 확인**

브라우저에서 `http://127.0.0.1:8000/docs`에 접속해서 API 명세서가 나오는 것을 확인

## 프론트엔드 VS Code 익스텐션 환경설정

### 윈도우 - powershell 또는 cmd에서

**Node.js 설치 확인**

```bash
node -v
npm -v
```

실행 결과: 버전이 출력됨. 

설치되지 않은 것이 확인되면, Node.js를 다운받아서 설치.

**Yeoman, 익스텐션 생성기 설치**

```bash
npm install -g yo generator-code
```

실행 결과: yo와 generator-code가 설치됨.

**프로젝트 뼈대 생성**

```bash
yo code
```

실행 결과: 터미널에서 보이는 질문들이 나오는데, 여기에 적절하게 답변을 선택하기.

- extension type: New Extension (TypeScript)
- extension name: c-lab-autosubmit
- package manager: npm

**vscode 열기**

```bash
cd c-lab-autosubmit
code .
```

**파일 복사하기**

자동 생성된 `src/extension.ts` 파일을 지우고, `src` 폴더에 `extension.ts` 파일을 이동하기. 
