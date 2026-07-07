// @ts-check
import { test, expect } from '@playwright/test';
import { touchDrag } from './helpers/touch.js';

/**
 * Integration smoke test: boots the PWA on a mobile device, starts a
 * game, drags on the canvas to aim, releases to shoot, and verifies the
 * turn advances once all balls come back. Everything is done through the
 * real DOM + touch events — no game-internals are imported or mocked.
 */
test.describe('Glow-Break - mobile drag-to-aim', () => {
    test('starts a game, drags to aim, shoots and advances turn', async ({ page }) => {
        // 1. Load the PWA. The menu should be visible.
        await page.goto('/');

        const mainMenu = page.locator('#mainMenu');
        const ui = page.locator('#ui');
        const canvas = page.locator('#gameCanvas');
        const turnDisplay = page.locator('#turnDisplay');
        const skipBtn = page.locator('#skipBtn');

        await expect(mainMenu).toBeVisible();
        await expect(ui).toBeHidden();

        // 2. Tap "EASY" chip + play button to start a game. Playwright uses
        //    touchscreen.tap automatically for .tap() on a hasTouch device.
        await page.locator('.diff-chip[data-diff="easy"]').tap();
        await page.locator('#playBtn').tap();

        await expect(mainMenu).toBeHidden();
        await expect(ui).toBeVisible();
        await expect(turnDisplay).toHaveText('1');

        // 3. Figure out the canvas box so we can aim from the launcher
        //    (bottom center) towards the top where bricks are.
        const box = await canvas.boundingBox();
        if (!box) throw new Error('canvas has no bounding box');

        const from = { x: box.width / 2, y: box.height - 20 };
        const to = { x: box.width / 2 + 40, y: box.height * 0.25 };

        // 4. Drag-to-aim, then release to shoot. The game exposes two
        //    tells that shooting began: #skipBtn becomes visible and
        //    #instructions fades to opacity 0. We assert on skipBtn.
        await touchDrag(page, '#gameCanvas', from, to);

        await expect(skipBtn).toBeVisible({ timeout: 2_000 });

        // 5. Skip the shooting phase to finish the turn instantly,
        //    instead of waiting for every ball to land. This exercises
        //    the same endTurn() path the game uses naturally.
        await skipBtn.tap();

        // 6. Turn must advance to 2 and the skip button must hide again.
        await expect(turnDisplay).toHaveText('2', { timeout: 5_000 });
        await expect(skipBtn).toBeHidden();

        // 7. Game should NOT be over after a single turn on easy.
        await expect(page.locator('#gameOver')).toBeHidden();
    });
});
