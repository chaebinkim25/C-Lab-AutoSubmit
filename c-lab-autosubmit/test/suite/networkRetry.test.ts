import * as assert from 'assert';
import { diffPayloadQueue, processQueueWorker } from '../../tracking/diffTracker';

suite('Network Resilience: Background Worker Retry Logic', () => {
    let originalFetch: any;

    setup(() => {
        // Ensure we start with a clean slate
        diffPayloadQueue.length = 0; 
        originalFetch = global.fetch;
    });

    teardown(() => {
        global.fetch = originalFetch;
        diffPayloadQueue.length = 0;
    });

    test('processQueueWorker: Should retain payloads on network failure and flush on recovery', async () => {
        let fetchCallCount = 0;

        // 1. Intercept Network to simulate an Outage -> Recovery cycle
        global.fetch = async () => {
            fetchCallCount++;
            if (fetchCallCount === 1) {
                // First attempt: Wi-Fi drops! 
                throw new Error('Network offline');
            }
            // Second attempt: Wi-Fi is back!
            return { ok: true, status: 200 } as any; 
        };

        // 2. Inject a dummy code snapshot into the memory queue
        diffPayloadQueue.push({
            studentNumber: '20261234',
            studentName: 'Gildong',
            machineId: 'WIFI-DROP-MAC',
            filename: 'lab.c',
            timestamp: new Date().toISOString(),
            content: 'int main() { printf("No internet!"); }',
            is_baseline: false
        });

        // ==========================================
        // ACT 1: Trigger worker during the outage
        // ==========================================
        await processQueueWorker();

        // 3. Verify the fail-safe worked
        assert.strictEqual(fetchCallCount, 1, "The worker should have attempted to send the payload.");
        assert.strictEqual(
            diffPayloadQueue.length, 
            1, 
            "🚨 CRITICAL FAILURE: The payload was destroyed! It must be re-queued when the network fails."
        );

        // ==========================================
        // ACT 2: Trigger worker after network recovery
        // ==========================================
        await processQueueWorker();

        // 4. Verify the recovery flush worked
        assert.strictEqual(fetchCallCount, 2, "The worker should have retried the connection.");
        assert.strictEqual(
            diffPayloadQueue.length, 
            0, 
            "The queue was not cleared after the network recovered and transmission succeeded."
        );
    });
});
