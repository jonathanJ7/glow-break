// @ts-check
import { test, expect } from '@playwright/test';
import { startGame, aimAndShoot } from './helpers/game.js';

/**
 * El juego tiene que funcionar sin conexión (modo avión): después de una
 * primera visita con red, el service worker sirve todo desde la caché.
 */
test.describe('Sin conexión (modo avión)', () => {
    test('después de una visita, el juego carga y se juega offline', async ({ page, context }) => {
        await page.goto('/');
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);

        await context.setOffline(true);

        // También con query en la URL (ej. start_url con ?source=pwa)
        for (const url of ['/', '/?source=pwa']) {
            await page.goto(url);
            await expect(page.locator('#mainMenu')).toBeVisible();
        }

        await startGame(page, 'easy');
        await aimAndShoot(page);
        await expect(page.locator('#ui')).toBeVisible();
    });
});
