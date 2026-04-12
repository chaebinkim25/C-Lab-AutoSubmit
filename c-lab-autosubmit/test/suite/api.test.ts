import * as assert from 'assert';
import { checkLabTime, fetchLabTasks, fetchLabSubmissions, startSession, sendBaseline, sendDiff, sendDebugTelemetry, sendSubmission, logPasteViolation } from '../../utils/api';


suite('API Network Utils: GET Requests', () => {
    let originalFetch: typeof global.fetch;
    let fetchCallLogs: { url: string, init?: RequestInit }[] = [];

    // Setup: Runs before every test to intercept the network
    setup(() => {
        originalFetch = global.fetch;
        fetchCallLogs = [];

        // Replace global.fetch with our interceptor
        global.fetch = async (url: any, init?: any): Promise<any> => {
            const urlString = url.toString();
            fetchCallLogs.push({ url: urlString, init });

            // Mock responses based on the URL requested
            const createMockResponse = (bodyData: any, ok: boolean = true) => ({
                ok,
                json: async () => bodyData,
                statusText: ok ? 'OK' : 'Error'
            });

            if (urlString.includes('/api/check-time')) {
                return createMockResponse({ is_lab_time: true, current_server_time: "2026-04-03T09:00:00Z" });
            }
            if (urlString.includes('/api/lab/tasks')) {
                return createMockResponse([{ task_id: 'lab1_part1', title: 'Part 1', description: '...', skeleton_code: '...' }]);
            }
            if (urlString.includes('/api/lab/submissions')) {
                return createMockResponse({ status: 'success', markdown_content: '# Mocked Markdown Review' });
            }
            // --- POST Mocks ---
            if (urlString.includes('/api/session/start')) { return createMockResponse({ status: 'success' }); }
            if (urlString.includes('/api/track/diff')) { return createMockResponse({ status: 'success' }); }

            if (urlString.includes('/api/track/paste-violation')) { return createMockResponse({ status: 'success' }); }
            if (urlString.includes('/api/track/debug-log')) { return createMockResponse({ status: 'success' }); }
            if (urlString.includes('/api/session/submit')) { return createMockResponse({ status: 'success' }); }

            return createMockResponse(null, false); // 404 Not Found fallback
        };
    });

    // Teardown: Restore normal network behavior after tests
    teardown(() => {
        global.fetch = originalFetch;
    });

    test('checkLabTime: should hit correct endpoint and return boolean', async () => {
        const serverStatus = await checkLabTime();

        // Verify the URL
        assert.strictEqual(fetchCallLogs.length, 1);
        assert.ok(fetchCallLogs[0].url.endsWith('/api/check-time'));
        
        // Verify the method defaults to GET (init is undefined or GET)
        assert.ok(!fetchCallLogs[0].init || fetchCallLogs[0].init.method === 'GET');
        
        // THE FIX: Access the boolean property inside the object
        assert.strictEqual(serverStatus.isLabTime, true);
    });

    test('fetchLabTasks: should retrieve and parse task list', async () => {
        const studentNumber = '20261234';
        const tasks = await fetchLabTasks(studentNumber);

        assert.strictEqual(fetchCallLogs.length, 1);
        assert.ok(fetchCallLogs[0].url.includes('/api/lab/tasks'));
        
        assert.strictEqual(tasks.length, 1);
        assert.strictEqual(tasks[0].task_id, 'lab1_part1');
    });

    test('fetchLabSubmissions: should correctly format URL query parameters', async () => {
        const studentNumber = '20261234';
        const studentName = 'abc';
        const machineId = 'TEST_MAC_123';
        
        // *Note: Adjust arguments if you added student_name to this function previously!
        const markdown = await fetchLabSubmissions(studentNumber, studentName, machineId);

        assert.strictEqual(fetchCallLogs.length, 1);
        const requestUrl = fetchCallLogs[0].url;

        // Verify query parameters were correctly appended
        assert.ok(requestUrl.includes('/api/lab/submissions'), "Base URL is wrong");
        assert.ok(requestUrl.includes(`student_number=${studentNumber}`), "Missing student_number");
        assert.ok(requestUrl.includes(`student_name=${studentName}`), "Missing student_name");
        assert.ok(requestUrl.includes(`machine_id=${machineId}`), "Missing machine_id");

        // Verify parsing logic
        assert.strictEqual(markdown, '# Mocked Markdown Review');
    });

    test('fetchLabSubmissions: should handle server errors gracefully', async () => {
        // Force the mock to return a 500 error for this specific test
        global.fetch = async () => ({
            ok: false,
            statusText: 'Internal Server Error'
        } as Response);

        const markdown = await fetchLabSubmissions('123', 'bbb', 'MAC');

        // Verify it returns null instead of crashing the extension
        assert.strictEqual(markdown, null);
    });

    // --- POST TESTS ---
    test('startSession: should format POST payload correctly', async () => {
        const payload = {
            student_number: '20261234',
            student_name: 'Gildong',
            machine_id: 'MAC_123',
            os_platform: 'win32'
        };
        
        const success = await startSession(payload);

        assert.strictEqual(success, true);
        const req = fetchCallLogs.find(log => log.url.includes('/api/session/start'));
        
        assert.ok(req, "Endpoint was not called");
        assert.strictEqual(req!.init!.method, 'POST');
        
        const body = JSON.parse(req!.init!.body as string);
        assert.strictEqual(body.student_number, '20261234');
        assert.strictEqual(body.student_name, 'Gildong');
    });

    test('sendBaseline: should format payload and set is_baseline to true', async () => {
        await sendBaseline('20269999', 'Gildong', 'MAC_123', 'main.c', 'int main(){}');
        
        const req = fetchCallLogs.find(log => log.url.includes('/api/track/diff'));
        assert.ok(req, "Endpoint was not called");
        
        const body = JSON.parse(req!.init!.body as string);
        assert.strictEqual(body.is_baseline, true);
        assert.strictEqual(body.diff_payload, 'int main(){}');
    });

    test('sendDiff: should format payload and set is_baseline to false', async () => {
        // Pass a single object here too!
        await sendDiff({
            studentNumber: '20269999',
            studentName: 'Gildong',
            machineId: 'MAC_123',
            filename: 'main.c',
            timestamp: '2026-04-03T10:05:00Z',
            content: 'printf("hi");',
            is_baseline: false
        });
        
        const req = fetchCallLogs.find(log => log.url.includes('/api/track/diff'));
        assert.ok(req, "Endpoint was not called");
        
        const body = JSON.parse(req!.init!.body as string);
        assert.strictEqual(body.is_baseline, false);
        assert.strictEqual(body.diff_payload, 'printf("hi");');
    });

    test('logPasteViolation: should format payload correctly', async () => {
        // Assuming this takes a single payload object like sendDiff
        await logPasteViolation(
            '20261234',
            'Gildong',
            'MAC_123',
            'main.c',
            'printf("stolen");'
        );
        
        const req = fetchCallLogs.find(log => log.url.includes('/api/track/paste-violation'));
        assert.ok(req, "Endpoint was not called");
        
        const body = JSON.parse(req!.init!.body as string);
        // Note: adjust these checks if your payload maps property names differently
        assert.strictEqual(body.file_name || body.filename, 'main.c'); 
    });

    test('sendDebugTelemetry: should correctly format the telemetry object', async () => {
        const mockTelemetry = {
            source_snapshot: { "main.c": "int main() {}" },
            breakpoints: ["main.c:10"],
            execution_actions: ["stepOver"],
            variable_inspection: { "x": "5" },
            output_streams: ["Hello"]
        };
        
        // This perfectly matches your 4-argument signature from the previous step
        await sendDebugTelemetry('20261234', 'Gildong', 'MAC_123', mockTelemetry as any);
        
        const req = fetchCallLogs.find(log => log.url.includes('/api/track/debug-log'));
        assert.ok(req, "Endpoint was not called");
        
        const body = JSON.parse(req!.init!.body as string);
        assert.strictEqual(body.student_number, '20261234');
        assert.deepStrictEqual(body.breakpoints, ["main.c:10"]);
        assert.deepStrictEqual(body.variable_inspection, { "x": "5" });
    });

    test('sendSubmission: should format mid/final submission payloads', async () => {
        // Because your function does JSON.stringify(payload) directly, 
        // we construct the exact snake_case object the backend expects.
        const mockSubmission = {
            student_number: '20261234',
            student_name: 'Gildong',
            machine_id: 'MAC_123',
            submission_type: 'mid',
            task_id: 'lab1_part1',
            source_files_snapshot: { "main.c": "code" },
            vscode_config_snapshot: { "launch.json": "{}" }
        };

        await sendSubmission(mockSubmission as any);
        
        const req = fetchCallLogs.find(log => log.url.includes('/api/session/submit'));
        assert.ok(req, "Endpoint was not called");
        
        const body = JSON.parse(req!.init!.body as string);
        assert.strictEqual(body.submission_type, 'mid');
        assert.strictEqual(body.task_id, 'lab1_part1');
        assert.deepStrictEqual(body.source_files_snapshot, { "main.c": "code" });
    });
});

