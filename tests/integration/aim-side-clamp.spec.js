// @ts-check
import { test, expect } from '@playwright/test';
import { touchPress, touchRelease } from './helpers/touch.js';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Regression: aiming far to one side with the finger slightly BELOW the
 * launch line used to flip the aim to the opposite side (atan2 returns
 * ≈ +π on the left, which the naive clamp sent to AIM_ANGLE_MAX = right).
 */
test.describe('Glow-Break - aim clamp keeps the finger side', () => {
    for (const side of ['left', 'right']) {
        test(`finger below launch line on the ${side} aims ${side}`, async ({ page }) => {
            await loadGameWithHooks(page);
            await startGame(page, 'easy');

            const { launchX, launchY } = await page.evaluate(() => {
                const g = /** @type {any} */ (window).__game.gameState;
                return { launchX: g.launchX, launchY: g.launchY };
            });
            const dx = side === 'left' ? -120 : 120;
            const pos = { x: launchX + dx, y: launchY + 4 };

            await touchPress(page, '#gameCanvas', pos);
            const { angle, min, max } = await page.evaluate(() => {
                const g = /** @type {any} */ (window).__game;
                return {
                    angle: g.gameState.aimAngle,
                    min: g.config.AIM_ANGLE_MIN,
                    max: g.config.AIM_ANGLE_MAX,
                };
            });
            await touchRelease(page, '#gameCanvas', pos);

            expect(angle).toBeCloseTo(side === 'left' ? min : max, 6);
        });
    }
});
