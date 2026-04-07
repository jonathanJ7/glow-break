// @ts-check
import { test, expect } from '@playwright/test';
import { touchDrag, touchPress, touchRelease } from './helpers/touch.js';
import { loadGame, startGame, aimAndShoot, skipTurn, getTurn } from './helpers/game.js';

/**
 * Behavior covered:
 *  - Drag-to-aim followed by release transitions the game into shooting:
 *    the skip button becomes visible and the instructions banner fades.
 *  - Skipping the turn from the skip button advances the turn counter.
 *  - Tapping anywhere on the canvas while balls are flying activates the
 *    speed boost (#speedIndicator visible). Releasing turns it off again.
 *  - Aiming at multiple angles all advance the game (no angle should
 *    soft-lock shooting).
 */
test.describe('Glow-Break - aim and shoot', () => {
    test('drag to aim, release, skip turn → turn advances to 2', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        await aimAndShoot(page);
        await expect(page.locator('#instructions')).toHaveCSS('opacity', '0');

        await skipTurn(page);

        await expect(page.locator('#turnDisplay')).toHaveText('2', { timeout: 5_000 });
        await expect(page.locator('#gameOver')).toBeHidden();
    });

    test('aiming at varied angles all advance the turn', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        const canvas = page.locator('#gameCanvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('canvas has no bounding box');

        // A spread of aim offsets — far left, slight left, vertical-ish,
        // slight right, far right. None of them should soft-lock the game.
        const offsets = [-80, -30, 5, 30, 80];

        for (let i = 0; i < offsets.length; i++) {
            const startTurn = await getTurn(page);

            const from = { x: box.width / 2, y: box.height - 20 };
            const to = { x: box.width / 2 + offsets[i], y: box.height * 0.25 };
            await touchDrag(page, '#gameCanvas', from, to);

            await expect(page.locator('#skipBtn')).toBeVisible({ timeout: 5_000 });
            await skipTurn(page);

            await expect(page.locator('#turnDisplay'))
                .toHaveText(String(startTurn + 1), { timeout: 5_000 });
        }
    });

    test('press-and-hold during shooting toggles the speed indicator', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        // Start shooting first — the speed indicator only kicks in *during*
        // shooting (handlePointerDown branches on isShooting).
        await aimAndShoot(page);

        const canvas = page.locator('#gameCanvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('canvas has no bounding box');

        const center = { x: box.width / 2, y: box.height / 2 };

        // Press the canvas mid-flight: speed indicator should appear.
        await touchPress(page, '#gameCanvas', center);
        await expect(page.locator('#speedIndicator')).toBeVisible({ timeout: 2_000 });

        // Release: speed indicator hides again.
        await touchRelease(page, '#gameCanvas', center);
        await expect(page.locator('#speedIndicator')).toBeHidden({ timeout: 2_000 });

        // Skip the rest of the turn so the test exits cleanly.
        await skipTurn(page);
    });

    test('skip button is hidden again after the turn ends', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        await expect(page.locator('#skipBtn')).toBeHidden();

        await aimAndShoot(page);
        await expect(page.locator('#skipBtn')).toBeVisible();

        await skipTurn(page);
        await expect(page.locator('#skipBtn')).toBeHidden();
    });
});
