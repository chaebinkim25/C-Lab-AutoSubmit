import * as vscode from 'vscode';
import axios from 'axios';
import * as crypto from 'crypto';
import * as os from 'os';      // 추가됨: 운영체제 정보
import * as path from 'path';  // 추가됨: 경로 조작
import * as fs from 'fs';      // 추가됨: 파일 시스템 제어

let submitStatusBarItem: vscode.StatusBarItem;
let isClassActive = false;
let pollingInterval: NodeJS.Timeout | undefined;

// (주의: 맨 뒤에 슬래시(/)가 없어야 합니다!)
const SERVER_URL = '127.0.0.1:8000';

let machineId: string;
let diffBuffer: { fileName: string, changes: any[] }[] = [];
let diffTimer: NodeJS.Timeout | null = null;

const MAX_RETRY_QUEUE_SIZE = 9000; // 2.5 hours buffer
const BATCH_CHUNK_SIZE = 100;       // Send 100 diffs per HTTP request

// ✅ 새 코드 (메모리상에만 존재하는 동적 키)
let backupEncryptionKey: Uint8Array | null = null;

// [추가됨] 네트워크 오류로 전송에 실패한 데이터를 임시 보관하는 큐
let diffRetryQueue: { fileName: string, changes: any[], timestamp: string }[] = [];

// [추가됨] 디버그 로그 배치 처리를 위한 상태 변수
let debugLogBuffer: { eventType: string, content: string, timestamp: string }[] = [];
let debugRetryQueue: { eventType: string, content: string, timestamp: string }[] = [];
let debugLogTimer: NodeJS.Timeout | null = null;

let isLabStarted = false;
let currentStudentId = '';
let currentStudentName = '';
let currentStartDate = ''; // [추가됨] 실습을 시작한 날짜 기록

let docChangeListener: vscode.Disposable | undefined;
let debugStartListener: vscode.Disposable | undefined;
let debugTrackerListener: vscode.Disposable | undefined;

// 👇 [추가됨] 설정 변경 감지용 추적기 및 무한루프 방지 플래그
let configChangeListener: vscode.Disposable | undefined;
let isEnforcingConfig = false;

let globalContext: vscode.ExtensionContext;


/**
 * 💡 [추가됨] 메모리에 키가 없으면(VS Code 재시작 시) OS 안전 저장소에서 복구를 시도합니다.
 */
async function getEncryptionKey(): Promise<Uint8Array> {
    if (backupEncryptionKey) {
        return backupEncryptionKey;
    }

    // 메모리에 없다면 SecretStorage에서 안전하게 꺼내옵니다.
    const storedSecret = await globalContext.secrets.get('c_lab_backup_secret');
    if (storedSecret) {
        backupEncryptionKey = new Uint8Array(crypto.scryptSync(storedSecret, 'salt', 32));
        return backupEncryptionKey;
    }

    throw new Error("보안 키가 존재하지 않아 백업을 진행할 수 없습니다.");
}

/**
 * 데이터를 AES-256-CBC로 암호화 (비동기로 변경)
 */
async function encryptBackupData(text: string): Promise<Uint8Array> {
    const key = await getEncryptionKey(); // 키 획득 대기
    const iv = new Uint8Array(crypto.randomBytes(16));
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const enc1 = new Uint8Array(cipher.update(text, 'utf8'));
    const enc2 = new Uint8Array(cipher.final());
    
    const result = new Uint8Array(iv.length + enc1.length + enc2.length);
    result.set(iv, 0);
    result.set(enc1, iv.length);
    result.set(enc2, iv.length + enc1.length);
    
    return result;
}

/**
 * Returns a YYYY-MM-DD string forced to KST (UTC+9),
 * regardless of the client's local timezone.
 */
function getKSTDateString(): string {
    const now = new Date();

    // KST is exactly 9 hours ahead of UTC
    const kstOffsetMs = 9 * 60 * 60 * 1000; 
    
    // Add the offset to the current timestamp
    const kstTime = new Date(now.getTime() + kstOffsetMs);

    // Extract the date using UTC methods to prevent the system's 
    // local timezone from interfering
    const year = kstTime.getUTCFullYear();
    const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kstTime.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('C-Lab AutoSubmit 익스텐션 활성화!');
    globalContext = context;

    machineId = context.globalState.get<string>('c_lab_machine_id') || '';
    if (!machineId) {
        machineId = crypto.randomUUID();
        context.globalState.update('c_lab_machine_id', machineId);
    }

    enforceWorkspaceSettings();

// 💡 [추가된 부분] 방금 폴더 이동 때문에 새로고침 된 것인지 확인합니다.
    const isAutoStartPending = context.globalState.get<boolean>('c_lab_auto_start_pending');
    if (isAutoStartPending) {
        context.globalState.update('c_lab_auto_start_pending', undefined);
        
        const resumeLabStart = async () => {
            // 창이 완전히 로드되고 내부망 통신이 준비될 여유를 줌 (1.5초)
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // 서버 시간을 강제로 한 번 확인하여 isClassActive 상태를 업데이트
            await checkClassTime(); 
            
            if (isClassActive) {
                await startLabProcess();
            } else {
                vscode.window.showWarningMessage('서버와 연결할 수 없거나 실습 시간이 아닙니다.');
            }
        };

        // 💡 [핵심 패치] VS Code의 '작업 공간 신뢰(Trust)' 모달 대기 처리
        if (!vscode.workspace.isTrusted) {
            // 아직 신뢰를 누르지 않은 상태라면, 'Yes'를 누를 때까지 기다렸다가 실행
            vscode.workspace.onDidGrantWorkspaceTrust(() => {
                resumeLabStart();
            });
        } else {
            // 이미 신뢰된 상태라면 바로 실행
            resumeLabStart();
        }
    }
    else {
        // 이전 세션 복구
        currentStudentId = context.workspaceState.get<string>('c_lab_student_id') || '';
        currentStudentName = context.workspaceState.get<string>('c_lab_student_name') || '';
        currentStartDate = context.workspaceState.get<string>('c_lab_start_date') || '';
        isLabStarted = context.workspaceState.get<boolean>('c_lab_is_started') || false;

        if (isLabStarted && currentStudentId) {
            console.log(`[세션 복구] ${currentStudentName} 님의 실습 세션 대기 중...`);
            // 실제 복구/제출 여부는 checkClassTime()에서 날짜와 서버 상태를 확인한 뒤 결정합니다.
        }
    }

    const startCommandId = 'c-lab-autosubmit.startTask';
    context.subscriptions.push(vscode.commands.registerCommand(startCommandId, async () => {
        if (!isClassActive) {
            vscode.window.showWarningMessage('현재는 실습 시간이 아닙니다.');
            return;
        }
        await startLabProcess();
    }));

    const submitCommandId = 'c-lab-autosubmit.submitTask';
    context.subscriptions.push(vscode.commands.registerCommand(submitCommandId, async () => {
        if (!isClassActive) { return; }
        if (!isLabStarted) {
            vscode.window.showWarningMessage('먼저 [▶️ 실습 시작] 버튼을 눌러 실습을 시작해 주세요.');
            return;
        }
        await submitLabProcess();
    }));

    submitStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(submitStatusBarItem);

    updateStatusBarUI();
    startTimePolling();
}

function enableTrackers() {

    if (!docChangeListener) {
        docChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (!isLabStarted || event.document.uri.scheme !== 'file') { return; }
            const fileName = event.document.fileName;

            // 💡 [핵심 패치] Undo/Redo 동작 감지
            const isUndoOrRedo = event.reason === vscode.TextDocumentChangeReason.Undo || 
                                 event.reason === vscode.TextDocumentChangeReason.Redo;

            // 🚨 붙여넣기(Ctrl+V) 감지 및 차단 방어 로직
            let isPasteDetected = false;
            let pastedTextLength = 0;

            // Undo/Redo에 의한 텍스트 삽입이 "아닐 때만" 붙여넣기 검사 수행
            if (!isUndoOrRedo) {
                for (const change of event.contentChanges) {
                    if (change.text.length > 50 || (change.text.match(/\n/g) || []).length >= 2) {
                        isPasteDetected = true;
                        pastedTextLength = change.text.length;
                        break;
                    }
                }
            }

            if (isPasteDetected) {
                // 1. 학생에게 강력한 에러 경고창 띄우기
                vscode.window.showErrorMessage('🚨 [부정행위 경고] 외부 코드 복사/붙여넣기가 감지되어 차단되었습니다!');
                
                // 2. 서버의 Track C (상세 디버그 로그)에 증거 자료 전송
                sendDebugLogToServer('suspicious_paste', `대량 텍스트 삽입 시도 차단 (길이: ${pastedTextLength}자)`);

                // 3. 강제 실행 취소(Undo)를 발생시켜 붙여넣은 코드를 즉시 날려버림
                setTimeout(() => {
                    vscode.commands.executeCommand('undo');
                }, 10);
                
                return; // Diff 버퍼에 들어가지 않도록 수집 로직 중단
            }
            // -----------------------------------------------------------

            // 정상적인 입력 및 Undo/Redo 내역은 모두 정상적으로 Diff 버퍼에 수집
            const changes = event.contentChanges.map(change => ({
                range: { startLine: change.range.start.line, startChar: change.range.start.character, endLine: change.range.end.line, endChar: change.range.end.character },
                text: change.text, rangeLength: change.rangeLength
            }));
            if (changes.length > 0) {
                diffBuffer.push({ fileName, changes });
                if (!diffTimer) { 
                    // 💡 기존 1000ms 고정 대기 대신, 1000ms ~ 2000ms 사이의 무작위 대기
                    const jitter = Math.floor(Math.random() * 1000); 
                    diffTimer = setTimeout(() => flushDiffBuffer(), 1000 + jitter); 
                }
            }
        });
    }

    if (!debugStartListener) {
        debugStartListener = vscode.debug.onDidStartDebugSession(async (session) => {
            if (!isLabStarted) { return; }
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file') { return; }
            try {
                await axios.post(`${SERVER_URL}/api/track/debug`, {
                    machine_id: machineId, 
                    student_id: currentStudentId, // 👈 [추가됨] 학생 학번 추가
                    timestamp: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T'), 
                    event: 'debug_start', 
                    source_code: editor.document.getText()
                });
            } catch (error) { console.error('스냅샷 전송 실패', error); }
        });
    }

    if (!debugTrackerListener) {
        debugTrackerListener = vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker(session: vscode.DebugSession) {
                return {
                    onWillReceiveMessage: m => {
                        if (m.type === 'request') {
                            if (['next', 'stepIn', 'stepOut', 'continue'].includes(m.command)) {
                                sendDebugLogToServer('step_action', `조작: ${m.command}`);
                            }
                            if (m.command === 'evaluate' && m.arguments) {
                                const expr = m.arguments.expression;
                                const ctx = m.arguments.context;
                                if (ctx === 'watch') { sendDebugLogToServer('watch_added', `조사식: ${expr}`); }
                                else if (ctx === 'hover') { sendDebugLogToServer('hover_evaluated', `호버 확인: ${expr}`); }
                            }
                        }
                    },
                    onDidSendMessage: m => {
                        if (m.type === 'event') {
                            if (m.event === 'output' && m.body) {
                                const category = m.body.category || 'console';
                                const output = m.body.output ? m.body.output.trim() : '';
                                if (output) { sendDebugLogToServer(category, output); }
                            }
                            if (m.event === 'stopped' && m.body) {
                                const reason = m.body.reason;
                                const desc = m.body.description || '';
                                if (reason === 'exception') { sendDebugLogToServer('crashed', `예외 발생: ${desc}`); }
                                else { sendDebugLogToServer('stopped', `정지 사유: ${reason}`); }
                            }
                        }
                    }
                };
            }
        });
    }

    // 👇 [추가됨] 4. 환경 설정(settings.json) 조작 감지기
    if (!configChangeListener) {
        configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
            // 실습 중이 아니거나, 우리가 코드로 덮어쓰고 있는 중이면 무시
            if (!isLabStarted || isEnforcingConfig) { return; }

            // 감시할 주요 보안 설정 키 목록
            const restrictedKeys = [
                'files.autoSave',
                'editor.inlineSuggest.enabled',
                'github.copilot.enable',
                'codeium.enableConfig'
            ];

            // 학생이 건드린 설정 중에 우리가 감시하는 키가 포함되어 있는지 확인
            const isTampered = restrictedKeys.some(key => event.affectsConfiguration(key));

            if (isTampered) {
                // 1. 서버로 부정행위 로그 즉시 전송
                sendDebugLogToServer('settings_tampered', '학생이 강제로 AI 또는 자동 저장 설정 조작을 시도했습니다.');
                
                // 2. 경고창 출력
                vscode.window.showErrorMessage('🚨 [보안 경고] 실습 중 환경 설정을 임의로 조작할 수 없습니다. 시스템이 설정을 복구합니다.');
                
                // 3. 비동기 충돌을 막기 위해 0.5초 뒤에 즉시 설정 원상 복구 (재덮어쓰기)
                setTimeout(() => {
                    enforceWorkspaceSettings();
                }, 500);
            }
        });
    }

    console.log("✅ [최적화] 실습 시작: 백그라운드 추적기가 등록되었습니다.");
}

function disableTrackers() {
    if (docChangeListener) { docChangeListener.dispose(); docChangeListener = undefined; }
    if (debugStartListener) { debugStartListener.dispose(); debugStartListener = undefined; }
    if (debugTrackerListener) { debugTrackerListener.dispose(); debugTrackerListener = undefined; }

    // 👇 [추가됨] 설정 감지기 해제
    if (configChangeListener) { configChangeListener.dispose(); configChangeListener = undefined; }

    if (diffTimer) { clearTimeout(diffTimer); diffTimer = null; }
    diffBuffer = [];
    diffRetryQueue = []; 
    
    // [추가됨] 디버그 로그 관련 추적기 및 큐 해제
    if (debugLogTimer) { clearTimeout(debugLogTimer); debugLogTimer = null; }
    debugLogBuffer = [];
    debugRetryQueue = [];
    
    console.log("💤 [최적화] 모든 추적기가 해제되었습니다.");
}

async function startLabProcess() {
    // 1. 운영체제별 기본 실습 폴더 경로 설정 (사용자 홈 디렉토리/Documents/C_Lab_Practice)
    const homeDir = os.homedir();
    const defaultLabFolder = path.join(homeDir, 'Documents', 'C_Lab_Practice');

    // 폴더가 없으면 자동 생성
    if (!fs.existsSync(defaultLabFolder)) {
        fs.mkdirSync(defaultLabFolder, { recursive: true });
        vscode.window.showInformationMessage('기본 실습 폴더가 생성되었습니다.');
    }

    const defaultFolderUri = vscode.Uri.file(defaultLabFolder);

    // 2. 현재 열려있는 작업 공간이 기본 폴더인지 대소문자 구분 없이 확인 (Windows 호환성)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const isDefaultFolderOpen = workspaceFolders && workspaceFolders.some(
        folder => folder.uri.fsPath.toLowerCase() === defaultFolderUri.fsPath.toLowerCase()
    );

    // 3. 기본 폴더가 열려있지 않다면 강제로 열기
    if (!isDefaultFolderOpen) {
        // 💡 [추가된 부분] 창이 새로고침되기 전에 '자동 시작 대기 중' 상태를 저장합니다.
        await globalContext.globalState.update('c_lab_auto_start_pending', true);

        // VS Code 창이 리로드되므로 사용자에게 안내 메시지 출력
        vscode.window.showInformationMessage('🚀 C-Lab 전용 실습 폴더로 이동합니다. 이동이 완료되면 다시 [▶️ 실습 시작]을 눌러주세요.');
        await vscode.commands.executeCommand('vscode.openFolder', defaultFolderUri, false);
        return; // 창이 새로고침되면서 익스텐션이 재시작되므로 아래 로직은 실행하지 않음
    }

    // 4. (기본 폴더가 열려있는 상태) 학번, 이름 입력받기
    const studentIdInput = await vscode.window.showInputBox({
        title: '▶️ C-Lab 실습 시작 (1/2)', 
        prompt: '본인의 학번을 정확히 입력해주세요.', 
        placeHolder: '예: 2026-00001',
        validateInput: text => {
            if (/^\d{4}-\d{5}$/.test(text)) {
                // Return an Info object to show a success message without blocking Enter
                return {
                    message: `✅ 올바른 학번 형식: ${text}`,
                    severity: vscode.InputBoxValidationSeverity.Info
                };
            } else {
                // Return the error string to block submission
                return '학번은 2026-00000 형식(연도 4자리-번호 5자리)으로 입력해야 합니다.';
            }
        }
    });
    if (!studentIdInput) { return; }

    const studentNameInput = await vscode.window.showInputBox({
        title: '▶️ C-Lab 실습 시작 (2/2)', prompt: '본인의 이름을 입력해주세요.', placeHolder: '예: 홍길동'
    });
    if (!studentNameInput) { return; }


    // 💡 [핵심 보안 패치] 로컬 시간이 아닌 서버 시간을 가져와서 시작 시간으로 기록합니다.
    let validatedStartDate = '';
    try {
        const response = await axios.get(`${SERVER_URL}/api/check-time`);
        
        // 서버에서 실습 비활성화 상태라고 응답하면 시작을 차단
        if (!response.data.active) {
            vscode.window.showErrorMessage('현재는 서버상 실습 시간이 아닙니다. 실습을 시작할 수 없습니다.');
            return;
        }
        
        validatedStartDate = response.data.server_date;
        
        if (!validatedStartDate) {
            throw new Error("서버 응답에 날짜 정보가 없습니다.");
        }

        // 👇👇 [추가된 부분] 서버 검증이 통과되면, 백업용 암호화 키를 서버에서 받아와 메모리에 적재합니다.
        const secretResponse = await axios.get(`${SERVER_URL}/api/lab/secret`);
        if (secretResponse.data && secretResponse.data.secret) {
            const fetchedSecret = secretResponse.data.secret;
            backupEncryptionKey = new Uint8Array(crypto.scryptSync(fetchedSecret, 'salt', 32));
            console.log("🔐 오프라인 백업용 보안 키가 메모리에 안전하게 로드되었습니다.");

            // 2. 💡 [추가됨] 네트워크 단절 및 재시작에 대비해 OS 안전 저장소에 보관
            await globalContext.secrets.store('c_lab_backup_secret', fetchedSecret);
            
            console.log("🔐 오프라인 백업용 보안 키가 OS 안전 저장소에 로드되었습니다.");
            
        } else {
            throw new Error("서버로부터 보안 키를 받아오지 못했습니다.");
        }
        // 👆👆 [추가된 부분 끝]

    } catch (error) {
        console.error("서버 검증 실패:", error);
        // 보안을 위해 서버 시간을 검증하지 못하면 실습 시작을 원천 차단합니다.
        vscode.window.showErrorMessage('서버와 통신하여 시간을 검증할 수 없습니다. 네트워크를 확인해 주세요.');
        return; 
    }


    currentStudentId = studentIdInput;
    currentStudentName = studentNameInput;
    currentStartDate = validatedStartDate;
    isLabStarted = true;

    await globalContext.workspaceState.update('c_lab_student_id', currentStudentId);
    await globalContext.workspaceState.update('c_lab_student_name', currentStudentName);
    await globalContext.workspaceState.update('c_lab_start_date', currentStartDate);
    await globalContext.workspaceState.update('c_lab_is_started', true);

    // 💡 [추가된 부분] TypeScript 컴파일러를 안심시키기 위한 안전망
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('작업 공간(폴더)을 찾을 수 없습니다. 다시 시도해 주세요.');
        return;
    }

    const wsUri = vscode.workspace.workspaceFolders[0].uri;
    const testFileUri = vscode.Uri.joinPath(wsUri, 'practice_main.c');
    
    try {
        await vscode.workspace.fs.stat(testFileUri);
        vscode.window.showInformationMessage(`[작업 복구] ${currentStudentName} 님의 기존 코드를 불러옵니다.`);
    } catch (error) {
        // 💡 [리팩토링] 서버에서 주차별 스켈레톤 코드를 동적으로 다운로드합니다.
        let baseSkeleton = "int main(void)\n{\n        return 0;\n}\n"; // 서버 장애 시 사용할 Fallback 기본값
        
        try {
            const skeletonResponse = await axios.get(`${SERVER_URL}/api/lab/skeleton`, { timeout: 3000 });
            if (skeletonResponse.data && skeletonResponse.data.skeleton) {
                baseSkeleton = skeletonResponse.data.skeleton;
            }
        } catch (fetchErr) {
            console.warn("서버에서 스켈레톤 코드를 가져오지 못해 기본값을 사용합니다.", fetchErr);
        }

        // 받아온 뼈대 코드 위에 학생 정보 주석을 덧붙입니다.
        const finalCode = 
`/*
 * 학번: ${currentStudentId}
 * 이름: ${currentStudentName}
 */

${baseSkeleton}`;

        // ✅ 수정된 코드
        await vscode.workspace.fs.writeFile(testFileUri, new TextEncoder().encode(finalCode));

        vscode.window.showInformationMessage(`[실습 시작] ${currentStudentName} 님 환영합니다. 실습을 시작합니다!`);
    }

    const document = await vscode.workspace.openTextDocument(testFileUri);
    await vscode.window.showTextDocument(document);

    enableTrackers(); // 실습 시작 시 추적기 장착
    updateStatusBarUI();
}

/**
 * 최종 제출 프로세스
 */
async function submitLabProcess() {
    // 💡 [수정됨] 활성화된 에디터 유무와 상관없이 코드를 안전하게 추출하는 로직 도입
    let sourceCode = "";
    let fileUri: vscode.Uri | undefined;

    if (vscode.workspace.workspaceFolders) {
        const wsUri = vscode.workspace.workspaceFolders[0].uri;
        fileUri = vscode.Uri.joinPath(wsUri, 'practice_main.c');

        // 1. 메모리에 열려있는 문서 중 해당 파일이 있는지 확인 (저장되지 않은 최신 상태 확보)
        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === fileUri?.fsPath);
        
        if (openDoc) {
            sourceCode = openDoc.getText();
        } else {
            // 2. 탭이 닫혀있다면 디스크에서 파일 읽기 시도
            try {
                // ✅ 수정된 코드
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                sourceCode = new TextDecoder('utf-8').decode(fileData);
            } catch (e) {
                // 사용자가 명시적으로 제출을 누른 상황이므로 빈 코드를 보내지 않고 경고 발생
                vscode.window.showErrorMessage('제출할 practice_main.c 파일을 찾을 수 없습니다. 실수로 삭제했는지 확인하세요.');
                return; 
            }
        }
    } else {
        vscode.window.showErrorMessage('활성화된 작업 공간(폴더)이 없습니다.');
        return;
    }

    // 💡 [추가됨] 최종 제출 전 확인 및 경고 메시지 (모달 창)
    const confirmation = await vscode.window.showWarningMessage(
        '🚀 최종 제출을 진행하시겠습니까?\n\n제출이 완료되면 현재 코드가 서버로 전송되며, 보안을 위해 파일이 영구 삭제되고 실습 환경이 완전히 초기화됩니다.',
        { modal: true }, // 화면 중앙에 팝업을 띄워 다른 작업을 차단하고 확실히 인지시킴
        '예 (제출 및 초기화)',
        '아니오'
    );

    // 사용자가 '아니오'를 누르거나 창을 끄면 제출을 취소합니다.
    if (confirmation !== '예 (제출 및 초기화)') {
        return; 
    }

    const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T');

    try {
        const response = await axios.post(`${SERVER_URL}/api/submit/final`, {
            machine_id: machineId,
            student_id: currentStudentId,
            student_name: currentStudentName,
            timestamp: timestamp,
            source_code: sourceCode
        });
        
        // 💡 [핵심 안정성 패치] 상태 코드(200)뿐만 아니라, 서버가 명시적으로 '저장 완료(saved: true)'를 응답했는지 확인합니다.
        if (response.status === 200 && response.data && response.data.saved === true) {            
            // 성공 알림 (폴더가 즉시 닫히면서 사라질 수 있으나, 서버 전송은 이미 안전하게 완료됨)
            vscode.window.showInformationMessage(`🎉 제출 완료! ${currentStudentName} 님의 과제가 성공적으로 전송되었습니다.`);

            // 세션 정보 삭제 및 추적기 해제
            await clearSessionState();
            disableTrackers();
            updateStatusBarUI();

            // practice_main.c 파일 영구 삭제
            if (fileUri) {
                try {
                    await vscode.workspace.fs.delete(fileUri, { useTrash: false });
                } catch (e) {
                    console.log("파일이 이미 없거나 삭제할 수 없습니다.");
                }
            }

            // 💡 [수정됨] 2초 대기 없이 즉시 모든 탭을 닫고 폴더를 닫아버림 (완벽한 즉시 초기화)
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await vscode.commands.executeCommand('workbench.action.closeFolder');
        }
    } catch (error: any) {
        console.error('❌ 최종 제출 실패:', error);
        
        // 👇 [수정됨] 백엔드에서 넘겨준 상세 에러(사유)를 추출하여 알림창에 띄움
        let errorMessage = "네트워크 상태를 확인하세요.";
        if (error.response && error.response.data && error.response.data.detail) {
            errorMessage = error.response.data.detail.message || JSON.stringify(error.response.data.detail);
        } else if (error.message) {
            errorMessage = error.message;
        }

        vscode.window.showErrorMessage(`🚨 최종 제출에 실패했습니다: ${errorMessage}`);
    }
}

/**
 * [핵심 기능] 에디터가 열려있지 않아도 디스크에서 파일을 직접 읽어 강제로 제출합니다.
 */
async function forceAutoSubmit(reason: string) {
    if (!currentStudentId) { return; } 

    let sourceCode = "/* 파일을 찾을 수 없어 빈 코드가 제출되었습니다. */";
    let fileUri: vscode.Uri | undefined;

    if (vscode.workspace.workspaceFolders) {
        const wsUri = vscode.workspace.workspaceFolders[0].uri;
        fileUri = vscode.Uri.joinPath(wsUri, 'practice_main.c');
        try {
            // 파일을 에디터로 열지 않고 백그라운드에서 버퍼로 읽어옴
            const fileData = await vscode.workspace.fs.readFile(fileUri);

            // ✅ 수정된 코드
            sourceCode = new TextDecoder('utf-8').decode(fileData);
        } catch (e) {
            console.log("practice_main.c 파일을 찾을 수 없습니다.");
        }
    }

    // Get current time in Seoul format
    const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T');

    try {
        const response = await axios.post(`${SERVER_URL}/api/submit/final`, {
            machine_id: machineId,
            student_id: currentStudentId,
            student_name: currentStudentName,
            timestamp: timestamp,
            source_code: sourceCode
        });

        // 💡 [안정성 패치] 강제 제출 시에도 서버 저장 보장을 확인합니다.
        if (response.status === 200 && response.data && response.data.saved === true) {
            vscode.window.showInformationMessage(`[자동 제출 완료] ${reason} (${currentStudentName} 님)`);
            
            await clearSessionState();
            disableTrackers();

            // 찌꺼기 파일 완전 삭제
            if (fileUri) {
                try {
                    await vscode.workspace.fs.delete(fileUri, { useTrash: false });
                } catch (e) {}
            }
            
            // 💡 [수정됨] 대기 시간 없이 즉시 유령 탭 닫기 및 폴더 닫기 (완전 초기화)
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await vscode.commands.executeCommand('workbench.action.closeFolder');
        }
    } catch (error) {
        console.error('자동 제출 실패:', error);
    }
}

/**
 * 메모리 및 workspaceState의 세션 정보를 깨끗하게 비웁니다.
 */
async function clearSessionState() {
    await globalContext.workspaceState.update('c_lab_student_id', undefined);
    await globalContext.workspaceState.update('c_lab_student_name', undefined);
    await globalContext.workspaceState.update('c_lab_start_date', undefined);
    await globalContext.workspaceState.update('c_lab_is_started', undefined);

    // 💡 [추가됨] 실습이 완전히 종료되면 키를 안전 저장소와 메모리에서 영구 삭제
    await globalContext.secrets.delete('c_lab_backup_secret');
    backupEncryptionKey = null;

    isLabStarted = false;
    currentStudentId = '';
    currentStudentName = '';
    currentStartDate = '';
}

function updateStatusBarUI() {
    if (!isClassActive) {
        submitStatusBarItem.hide();
    } else {
        if (!isLabStarted) {
            submitStatusBarItem.text = '$(play) C-Lab 실습 시작';
            submitStatusBarItem.tooltip = '클릭하여 학번과 이름을 입력하고 실습 환경을 설정합니다.';
            submitStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            submitStatusBarItem.command = 'c-lab-autosubmit.startTask';
        } else {
            submitStatusBarItem.text = '$(rocket) C-Lab 최종 제출';
            submitStatusBarItem.tooltip = `현재 접속자: ${currentStudentName}(${currentStudentId})\n클릭하여 코드를 최종 제출합니다.`;
            submitStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            submitStatusBarItem.command = 'c-lab-autosubmit.submitTask';
        }
        submitStatusBarItem.show();
    }
}

async function flushDiffBuffer() {
    if (!isClassActive || (diffBuffer.length === 0 && diffRetryQueue.length === 0)) {
        if (diffBuffer.length === 0) { diffTimer = null; }
        return;
    }

    const currentBuffer = [...diffBuffer];
    diffBuffer = []; 
    diffTimer = null;

    const fileChangesMap = new Map<string, any[]>();
    for (const item of currentBuffer) {
        if (!fileChangesMap.has(item.fileName)) { fileChangesMap.set(item.fileName, []); }
        fileChangesMap.get(item.fileName)?.push(...item.changes);
    }

    const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T');
    const payloadsToSend = [...diffRetryQueue]; 
    diffRetryQueue = []; 

    for (const [fileName, changes] of fileChangesMap.entries()) {
        payloadsToSend.push({ fileName, changes, timestamp: now });
    }

    // --- NEW BATCHING LOGIC ---
    // Process payloadsToSend in chunks
    for (let i = 0; i < payloadsToSend.length; i += BATCH_CHUNK_SIZE) {
        const chunk = payloadsToSend.slice(i, i + BATCH_CHUNK_SIZE);

        try {
            await axios.post(`${SERVER_URL}/api/track/diff/batch`, chunk.map(payload => ({
                machine_id: machineId,
                student_id: currentStudentId,
                timestamp: payload.timestamp,
                file_name: payload.fileName,
                changes: payload.changes
            })), { 
                timeout: 5000 // Give the batch request a slightly longer timeout
            });
        } catch (error) {
            console.warn(`⚠️ [네트워크 오류] Diff Batch 전송 실패. ${chunk.length}개의 데이터를 큐에 복구합니다.`);
            // If the chunk fails, push it back to the queue
            diffRetryQueue.push(...chunk);
            
            // 🚨 임계점 초과 시 강제 백업 및 종료
            if (diffRetryQueue.length > MAX_RETRY_QUEUE_SIZE) {
                // 비동기 실행으로 플로우를 끊지 않고 실행
                handleEmergencyOfflineBackup("2.5시간 오프라인 버퍼 초과 (Diff)");
                return; // 더 이상 처리하지 않고 함수 즉시 탈출
            }
            break;
        }
    }
}

function startTimePolling() {
    checkClassTime(); // 시작 직후 즉시 1회 확인
    pollingInterval = setInterval(() => { 
        checkClassTime(); 
        
        // 💡 [수정됨] Thundering Herd 방지를 위해 Random Jitter 추가 (0~5초 분산)
        if (diffRetryQueue.length > 0) {
            const jitter = Math.floor(Math.random() * 5000); // 0ms ~ 5000ms 무작위 지연
            setTimeout(() => {
                flushDiffBuffer();
            }, jitter);
        }
        
        if (debugRetryQueue.length > 0) {
            // Diff 전송과 겹치지 않게 기본 500ms 오프셋 + 무작위 지연
            const jitter = Math.floor(Math.random() * 5000) + 500; 
            setTimeout(() => {
                flushDebugLogs();
            }, jitter);
        }
    }, 60000); // 1분마다 확인
}

/**
 * [핵심 로직] 서버 폴링 시 찌꺼기 세션 감지 및 자동 제출 트리거
 */
async function checkClassTime() {
    try {
        const response = await axios.get(`${SERVER_URL}/api/check-time`);
        const newlyActive = response.data.active;

        // 💡 [핵심 보안 패치] 클라이언트 시간이 아닌, 서버가 내려준 날짜를 기준으로 판단
        const serverTodayStr = response.data.server_date; 
        
        // 만약 서버 백엔드 업데이트가 안 되어 날짜가 없다면 방어적으로 로컬 시간을 쓰되, 가급적 서버 시간을 강제해야 합니다.
        const todayStr = serverTodayStr || getKSTDateString();

        // 1. 남아있는 세션에 대한 자동 제출 검사
        if (isLabStarted) {
            const isOldSession = currentStartDate && currentStartDate < todayStr;
            const isOutsideClassTime = !newlyActive;

            if (isOldSession || isOutsideClassTime) {
                console.log("[보안] 유효하지 않은 이전 세션 감지. 강제 제출을 시도합니다.");
                await forceAutoSubmit(isOldSession ? "실습 날짜 경과" : "실습 시간 종료");
                updateStatusBarUI();
                return; // 강제 제출 후 종료
            }
        }

        // 2. 실습 시간 상태에 따른 추적기 On/Off
        if (newlyActive && !isClassActive) {
            isClassActive = true;
            if (isLabStarted) { enableTrackers(); }
        } else if (!newlyActive && isClassActive) {
            isClassActive = false;
            disableTrackers();
        }
        
        updateStatusBarUI();
    } catch (error) {
        if (isClassActive) {
            isClassActive = false;
            disableTrackers();
            updateStatusBarUI();
        }
    }
}

async function enforceWorkspaceSettings() {
    if (!vscode.workspace.workspaceFolders) { return; }
    
    isEnforcingConfig = true; // 🚨 무한 루프 방지 잠금
    
    const config = vscode.workspace.getConfiguration();
    
    try {
        // 1. VS Code 기본 설정 (항상 존재하므로 바로 업데이트)
        await config.update('files.autoSave', 'afterDelay', vscode.ConfigurationTarget.Workspace);
        await config.update('files.autoSaveDelay', 1000, vscode.ConfigurationTarget.Workspace);
        await config.update('editor.tabSize', 8, vscode.ConfigurationTarget.Workspace);
        await config.update('editor.insertSpaces', true, vscode.ConfigurationTarget.Workspace);
        await config.update('editor.inlineSuggest.enabled', false, vscode.ConfigurationTarget.Workspace);
        await config.update('editor.suggest.showInlineDetails', false, vscode.ConfigurationTarget.Workspace);

        // 2. 외부 확장 프로그램 설정 (존재 여부 확인 후 업데이트)
        const safeUpdate = async (key: string, value: any) => {
            try {
                // 설정 업데이트 시도
                await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            } catch (error) {
                // 확장 프로그램이 설치되어 있지 않아 발생하는 에러(CodeExpectedError 등)를 안전하게 무시합니다.
                console.warn(`[C-Lab] 설정 무시됨 (${key}): 설치되지 않은 확장 프로그램입니다.`);
            }
        };

        // AI 도구들 차단 (설치된 경우에만 적용)
        await safeUpdate('github.copilot.enable', { "*": false });
        await safeUpdate('github.copilot.editor.enableAutoCompletions', false);
        await safeUpdate('codeium.enableConfig', { "*": false });
        await safeUpdate('tabnine.experimentalAutoImports', false);
        await safeUpdate('cody.autocomplete.enabled', false);

    } catch (error) {
        console.error("작업 공간 설정 강제 적용 중 오류 발생:", error);
    } finally {
        isEnforcingConfig = false; // 🔓 잠금 해제
    }
}

function sendDebugLogToServer(eventType: string, content: string) {
    if (!isClassActive || !isLabStarted) { return; }
    
    // 1. 즉시 전송하지 않고 메모리 버퍼에 기록
    debugLogBuffer.push({
        eventType: eventType,
        content: content,
        timestamp: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T')
    });

    // 2. 타이머가 작동 중이 아니라면 2초(2000ms) 후 일괄 전송 타이머 시작
    if (!debugLogTimer) {
        // 💡 기존 2000ms 고정 대기 대신, 2000ms ~ 3500ms 사이의 무작위 대기
        const jitter = Math.floor(Math.random() * 1500);
        debugLogTimer = setTimeout(() => flushDebugLogs(), 2000 + jitter);
    }
}
async function flushDebugLogs() {
    // 1. 보낼 데이터가 없으면 리턴
    if (!isClassActive || (debugLogBuffer.length === 0 && debugRetryQueue.length === 0)) {
        if (debugLogBuffer.length === 0) { debugLogTimer = null; }
        return;
    }

    // 2. 현재 버퍼를 복사하고 비우기 (타이머 초기화)
    const currentBuffer = [...debugLogBuffer];
    debugLogBuffer = [];
    debugLogTimer = null;

    // 3. 이전 실패 큐(Retry Queue)의 데이터를 앞에 두고, 새 로그를 뒤에 병합
    const logsToSend = [...debugRetryQueue, ...currentBuffer];
    debugRetryQueue = []; 

    // --- NEW BATCHING LOGIC ---
    // Process logsToSend in chunks
    for (let i = 0; i < logsToSend.length; i += BATCH_CHUNK_SIZE) {
        const chunk = logsToSend.slice(i, i + BATCH_CHUNK_SIZE);

        try {
            await axios.post(`${SERVER_URL}/api/track/debug-log/batch`, chunk.map(log => ({
                machine_id: machineId,
                student_id: currentStudentId,
                timestamp: log.timestamp,
                event_type: log.eventType,
                content: log.content
            })), { 
                timeout: 5000 // Keep the 5-second timeout for the batch
            });
        } catch (error) {
            console.warn(`⚠️ [네트워크 오류] DebugLog Batch 전송 실패. ${chunk.length}개의 데이터를 큐에 복구합니다.`);
            
            // If the chunk fails, push it back to the queue
            debugRetryQueue.push(...chunk);
            
            // Push the rest of the unprocessed logs back to the queue
            const remaining = logsToSend.slice(i + BATCH_CHUNK_SIZE);
            debugRetryQueue.push(...remaining);

            // 🚨 임계점 초과 시 강제 백업 및 종료
            if (debugRetryQueue.length > MAX_RETRY_QUEUE_SIZE) {
                // 비동기 실행으로 플로우를 끊지 않고 실행
                handleEmergencyOfflineBackup("2.5시간 오프라인 버퍼 초과 (Diff)");
                return; // 더 이상 처리하지 않고 함수 즉시 탈출
            }
            break;
        }
    }
}

export function deactivate() {
    if (pollingInterval) { clearInterval(pollingInterval); }
    disableTrackers();
}

async function handleEmergencyOfflineBackup(reason: string) {
    if (!currentStudentId) { return; } 

    // 1. 디스크에서 최신 소스 코드 읽기
    let sourceCode = "/* 파일을 찾을 수 없어 빈 코드가 백업되었습니다. */";
    let fileUri: vscode.Uri | undefined;
    let workspacePath: string | undefined; // 작업 공간 경로 저장용

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const wsUri = vscode.workspace.workspaceFolders[0].uri;
        workspacePath = wsUri.fsPath;
        fileUri = vscode.Uri.joinPath(wsUri, 'practice_main.c');
        try {
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            sourceCode = new TextDecoder('utf-8').decode(fileData);
        } catch (e) {
            console.log("practice_main.c 파일을 찾을 수 없습니다.");
        }
    }

    const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(' ', 'T');

    // 2. 마지막으로 서버 제출 시도 (최후의 발악)
    let isServerSuccess = false;
    try {
        const response = await axios.post(`${SERVER_URL}/api/submit/final`, {
            machine_id: machineId,
            student_id: currentStudentId,
            student_name: currentStudentName,
            timestamp: timestamp,
            source_code: sourceCode
        }, { timeout: 3000 });

        if (response.status === 200 && response.data?.saved === true) {
            isServerSuccess = true;
            vscode.window.showInformationMessage(`[자동 제출 완료] ${reason} 작동. 다행히 네트워크가 복구되어 서버에 저장되었습니다.`);
        }
    } catch (error) {
        console.warn('최후 서버 제출 실패, 로컬 암호화 백업으로 전환합니다.');
    }

    // 3. 서버 제출 실패 시 -> 네이티브 UI를 통해 저장 위치 선택
    if (!isServerSuccess) {
        const timestampStr = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
        const fileName = `${currentStudentName}_${currentStudentId}_${timestampStr}.clab_backup`;
        
        // 기본 저장 위치를 현재 작업 공간으로 설정 (작업 공간이 없으면 undefined)
        const defaultUri = workspacePath ? vscode.Uri.file(path.join(workspacePath, fileName)) : undefined;

        // 학생에게 저장 위치를 묻는 네이티브 대화상자 호출
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: defaultUri,
            title: '🚨 오프라인 백업 파일 저장 위치 선택',
            filters: {
                'C-Lab Backup Files': ['clab_backup'],
                'All Files': ['*']
            },
            saveLabel: '백업 파일 저장'
        });

        let finalBackupPath = '';

        if (saveUri) {
            finalBackupPath = saveUri.fsPath;
        } else {
            // 학생이 실수나 당황해서 '취소'를 누른 경우의 Fallback 로직
            if (workspacePath) {
                finalBackupPath = path.join(workspacePath, fileName);
                vscode.window.showWarningMessage('저장이 취소되어 현재 실습 폴더에 강제로 백업 파일을 생성합니다.');
            } else {
                // 작업 공간마저 없는 최악의 경우 OS 임시 폴더 사용
                finalBackupPath = path.join(os.tmpdir(), fileName);
                vscode.window.showWarningMessage('임시 폴더에 백업 파일을 생성합니다.');
            }
        }

        const backupPayload = {
            studentId: currentStudentId,
            studentName: currentStudentName,
            machineId: machineId,
            reason: reason,
            timestamp: timestamp,
            sourceCode: sourceCode,
            unsubmittedDiffs: diffRetryQueue,
            unsubmittedDebugLogs: debugRetryQueue
        };

        try {
            const jsonString = JSON.stringify(backupPayload);
            const encryptedBuffer = await encryptBackupData(jsonString);

            fs.writeFileSync(finalBackupPath, encryptedBuffer);
            
            // 모달 창으로 강력하게 경고하여 학생이 반드시 인지하게 함
            vscode.window.showErrorMessage(
                `🚨 [치명적 오류] 네트워크가 단절되어 서버 제출에 실패했습니다.\n\n안전한 위치에 암호화된 백업 파일이 생성되었습니다.\n👉 저장 위치: ${finalBackupPath}\n\n실습 점수 인정을 위해 이 파일을 USB에 담아 조교에게 직접 제출해 주세요!`, 
                { modal: true }
            );
        } catch (writeErr) {
            vscode.window.showErrorMessage(`🚨 백업 파일 생성마저 실패했습니다. 관리자를 호출하세요.`);
        }
    }

    // 4. 세션 초기화 및 파일 파기
    await clearSessionState();
    disableTrackers();

    if (fileUri) {
        try {
            await vscode.workspace.fs.delete(fileUri, { useTrash: false });
        } catch (e) {}
    }

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.closeFolder');
}
