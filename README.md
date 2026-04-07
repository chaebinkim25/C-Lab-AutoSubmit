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

**Pydantic, FastAPI, Uvicorn 설치**

```bash
pip install pydantic fastapi uvicorn
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

## vscode extension frontend development

**install node.js, nvm**

```bash
sudo apt install nodejs
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
npm install -g yo generator-code
yo code
```

- extension type: New Extension (TypeScript)
- extension name: c-lab-autosubmit
- extension identifier: (default value)
- extension description: Assist with C programming computer lab sessions by logging coding behavior and automating code submissions.
- git repo initialization: y
- bundler: webpack
- package manager: npm
