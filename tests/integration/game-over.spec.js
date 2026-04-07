// @ts-check
import { test, expect } from '@playwright/test';
import {
    loadGame,
    startGame,
    setStartingTurn,
    playTurn,
    isGameOver,
    getTurn,
} from './helpers/game.js';

/**
 * Behavior covered:
 *  - Reaching game over by playing many turns at HARD starting from a
 *    high turn shows the #gameOver overlay with non-empty stats.
 *  - From game-over, the "Jugar de Nuevo" (restart) button starts a fresh
 *    game on the same difficulty: turn resets and the overlay disappears.
 *  - From game-over, the "Menú Principal" button returns the user to the
 *    main menu so they can pick another difficulty.
 *
 * Game-over is reached by pushing the player into a no-win starting state:
 * HARD difficulty + a high starting turn forces dense, high-HP rows that
 * cannot be cleared by skipping turns. The simulation runs at most a
 * bounded number of turns so the test never spins forever.
 */

const MAX_FORCE_TURNS = 25;

/**
 * Drive the game until the game-over overlay shows or we hit the safety
 * cap. Returns true if game-over was reached.
 *
 * @param {import('@playwright/test').Page} page
 */
async function forceGameOver(page) {
    for (let i = 0; i < MAX_FORCE_TURNS; i++) {
        const next = await playTurn(page, ((i % 5) - 2) * 30);
        if (next === null) return true;
        if (await isGameOver(page)) return true;
    }
    return await isGameOver(page);
}

test.describe('Glow-Break - game over flow', () => {
    test('hard mode at a high starting turn eventually triggers game over', async ({ page }) => {
        await loadGame(page);
        await setStartingTurn(page, 200);
        await startGame(page, 'hard');

        const gameOver = await forceGameOver(page);
        expect(gameOver).toBe(true);

        const overlay = page.locator('#gameOver');
        await expect(overlay).toBeVisible();

        // The final stats are populated by endGame() — they should be
        // numbers, not the placeholder, and the difficulty label should
        // mention DIFÍCIL.
        const finalTurn = await page.locator('#finalTurn').textContent();
        const finalBalls = await page.locator('#finalBalls').textContent();
        expect(Number(finalTurn)).toBeGreaterThan(0);
        expect(Number(finalBalls)).toBeGreaterThan(0);

        await expect(page.locator('#finalDifficulty')).toContainText('DIFÍCIL');
    });

    test('restart button after game over starts a fresh run on same difficulty', async ({ page }) => {
        await loadGame(page);
        await setStartingTurn(page, 200);
        await startGame(page, 'hard');

        const reached = await forceGameOver(page);
        test.skip(!reached, 'game-over not reached within safety cap');

        await page.locator('#restartBtn').evaluate(
            (el) => /** @type {HTMLElement} */ (el).click()
        );

        // Restart preserves the same starting turn input value (200) and
        // the same difficulty. The overlay must hide and the in-game UI
        // must be visible again.
        await expect(page.locator('#gameOver')).toBeHidden();
        await expect(page.locator('#ui')).toBeVisible();

        // initGame re-reads the input, so the turn lands at 200 again.
        expect(await getTurn(page)).toBe(200);
        await expect(page.locator('#difficultyBadge')).toContainText('DIFÍCIL');
    });

    test('menu button after game over returns to the main menu', async ({ page }) => {
        await loadGame(page);
        await setStartingTurn(page, 200);
        await startGame(page, 'hard');

        const reached = await forceGameOver(page);
        test.skip(!reached, 'game-over not reached within safety cap');

        await page.locator('#menuBtn').evaluate(
            (el) => /** @type {HTMLElement} */ (el).click()
        );

        await expect(page.locator('#mainMenu')).toBeVisible();
        await expect(page.locator('#gameOver')).toBeHidden();
        await expect(page.locator('#ui')).toBeHidden();
    });
});
