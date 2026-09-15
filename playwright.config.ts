import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
const password = process.env.JR_E2E_PASSWORD || randomBytes(24).toString('hex');
process.env.JR_E2E_PASSWORD = password;
export default defineConfig({
    testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'node --experimental-strip-types scripts/e2e-prepare.mjs && npm run dev -- --port 3100',
        url: 'http://localhost:3100/login', reuseExistingServer: false, timeout: 180000,
        env: { APP_URL: 'http://localhost:3100', DATABASE_PATH: './.test-data/e2e.sqlite', JR_ADMIN_EMAIL: 'e2e@example.test', JR_ADMIN_PASSWORD: password }
    }
});
