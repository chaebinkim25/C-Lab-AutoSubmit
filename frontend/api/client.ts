// src/api/client.ts

import { CONFIG } from '../utils/config';
import { logEvent } from '../extension';

export async function checkActiveTime(): Promise<boolean> {
    try {
        const response = await fetch(`${CONFIG.BASE_URL}/api/check-time`);
        if (!response.ok) {
            const errBody = await response.text();
            logEvent('API_NETWORK_ERROR', `HTTP ${response.status}: ${errBody}`);
            return false;
        }
        
        const parsed = await response.json() as any;
        if (parsed.is_active_lab_time) {
            return true;
        } else {
            logEvent('API_REJECTED');
            return false;
        }
    } catch (err: any) {

        logEvent('API_NETWORK_ERROR', err.message);
        return false;
    }
}
