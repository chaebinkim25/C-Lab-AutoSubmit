import * as assert from 'assert';
import { getMachineId } from '../../utils/machineId';

suite('Core Utils: Machine ID', () => {
    // We create a fake globalState object to intercept the reads and writes
    class MockGlobalState {
        public store: Record<string, any> = {};
        public keysUpdated: string[] = [];

        get<T>(key: string): T | undefined {
            return this.store[key];
        }

        async update(key: string, value: any): Promise<void> {
            this.keysUpdated.push(key);
            this.store[key] = value;
        }
    }

    let mockContext: any;

    setup(() => {
        // Reset the mock context completely before each test
        mockContext = {
            globalState: new MockGlobalState()
        };
    });

    test('getMachineId: should generate and save a new UUID if none exists', async () => {
        // 1. Run function with a completely empty state
        const newId = await getMachineId(mockContext);

        // 2. It should return a valid string
        assert.ok(newId, "Generated ID should not be empty");
        assert.strictEqual(typeof newId, 'string', "Generated ID must be a string");

        // 3. It should look like a UUID (standard 36 character format with hyphens)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.ok(uuidRegex.test(newId), `Generated ID is not a valid UUID: ${newId}`);

        // 4. It should have called globalState.update() to save the new ID
        const state = mockContext.globalState as MockGlobalState;
        assert.strictEqual(state.keysUpdated.length, 1, "globalState.update was not called to save the ID");
        
        // 5. Ensure the saved value matches exactly what was returned
        const savedKey = state.keysUpdated[0];
        assert.strictEqual(state.store[savedKey], newId, "The saved ID does not match the returned ID");
    });

    test('getMachineId: should retrieve existing UUID if one is already saved', async () => {
        const state = mockContext.globalState as MockGlobalState;
        const fakeExistingId = '12345678-1234-1234-1234-123456789abc';
        
        // Spy trick: Let the function run once in a vacuum to tell us what key it uses to save!
        await getMachineId(mockContext);
        const actualKeyUsed = state.keysUpdated[0];
        
        // Now, set up the REAL test condition: prepopulate the state using that specific key
        mockContext = { globalState: new MockGlobalState() };
        (mockContext.globalState as MockGlobalState).store[actualKeyUsed] = fakeExistingId;

        // Run the function!
        const retrievedId = await getMachineId(mockContext);

        // It should return the EXACT fake ID we injected, proving it didn't generate a new one
        assert.strictEqual(retrievedId, fakeExistingId, "Function generated a new ID instead of retrieving the existing one");
        
        // It should NOT have called update() this time, because the ID already existed
        assert.strictEqual((mockContext.globalState as MockGlobalState).keysUpdated.length, 0, "globalState.update should not be called if ID already exists");
    });
});
