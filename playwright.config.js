// @ts-check
import { existsSync } from 'node:fs';
import { defineConfig, devices, chromium } from '@playwright/test';

/**
 * Chromium a usar. Si la versión de @playwright/test del lockfile no
 * encuentra su propio navegador (p. ej. en el entorno cloud de Claude Code,
 * que trae Chromium preinstalado en /opt/pw-browsers/chromium para otra
 * versión de Playwright), caemos a ese binario en lugar de exigir
 * `npx playwright install`. Se puede forzar con PW_CHROMIUM_PATH.
 */
function resolveChromiumExecutable() {
    if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
    try {
        if (existsSync(chromium.executablePath())) return undefined;
    } catch { /* sin navegador propio: probamos el fallback */ }
    const preinstalled = '/opt/pw-browsers/chromium';
    return existsSync(preinstalled) ? preinstalled : undefined;
}
const chromiumExecutable = resolveChromiumExecutable();

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
                ...(chromiumExecutable && {
                    launchOptions: { executablePath: chromiumExecutable },
                }),
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
