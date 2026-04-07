// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Glow-Break integration tests.
 *
 * The game is a touch-first PWA, so the default project emulates an
 * iPhone 13 (hasTouch + isMobile + mobile viewport). Add more mobile
 * devices to the `projects` array if you want to cross-check on other
 * form factors — all tests should remain mobile-only.
 */
export default defineConfig({
    testDir: './tests/integration',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',

    use: {
        baseURL: 'http://127.0.0.1:8080',
        trace: 'retain-on-failure',
    },

    projects: [
        {
            // iPhone 13 viewport + touch, but forced to Chromium so we don't
            // also need to install the WebKit browser binary. If you want to
            // cross-check on real Safari, add a second project with
            // devices['iPhone 13'] untouched and run `npx playwright install
            // webkit`.
            name: 'mobile-iphone-13',
            use: {
                ...devices['iPhone 13'],
                defaultBrowserType: 'chromium',
                browserName: 'chromium',
            },
        },
    ],

    webServer: {
        command: 'npx http-server -p 8080 -c-1 -s .',
        url: 'http://127.0.0.1:8080',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
