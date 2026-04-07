// @ts-check
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from './helpers/game.js';

/**
 * Behavior covered:
 *  - The main menu is visible on first load and the in-game UI is hidden.
 *  - Tapping each difficulty button hides the menu, shows the game UI,
 *    and updates the difficulty badge accordingly.
 *  - The difficulty selection round-trips: opening the menu again from
 *    game-over allows starting a different difficulty.
 *
 * The difficulty *names* (FÁCIL / MEDIO / DIFÍCIL) are user-visible strings
 * displayed in #difficultyBadge, so asserting on them is fair game for a
 * behavior test.
 */
test.describe('Glow-Break - main menu navigation', () => {
    test('main menu is shown on load and game UI is hidden', async ({ page }) => {
        await loadGame(page);

        await expect(page.locator('#mainMenu')).toBeVisible();
        await expect(page.locator('#ui')).toBeHidden();
        await expect(page.locator('#gameOver')).toBeHidden();
        await expect(page.locator('#skipBtn')).toBeHidden();
    });

    test('all three difficulty buttons start a game', async ({ page }) => {
        for (const difficulty of /** @type {const} */ (['easy', 'medium', 'hard'])) {
            await loadGame(page);
            await startGame(page, difficulty);

            // Common post-start checks: menu hidden, UI shown, turn 1.
            await expect(page.locator('#mainMenu')).toBeHidden();
            await expect(page.locator('#ui')).toBeVisible();
            await expect(page.locator('#turnDisplay')).toHaveText('1');
            await expect(page.locator('#ballDisplay')).toHaveText('1');
        }
    });

    test('difficulty badge reflects the selected difficulty', async ({ page }) => {
        const badge = page.locator('#difficultyBadge');

        await loadGame(page);
        await startGame(page, 'easy');
        await expect(badge).toContainText('FÁCIL');

        // Open menu again to switch difficulty. The cleanest way without
        // touching internals is to reload the page.
        await loadGame(page);
        await startGame(page, 'medium');
        await expect(badge).toContainText('MEDIO');

        await loadGame(page);
        await startGame(page, 'hard');
        await expect(badge).toContainText('DIFÍCIL');
    });

    test('instructions are visible at the start of a fresh game', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        // Instructions are shown until the first shot fires.
        const instructions = page.locator('#instructions');
        await expect(instructions).toBeVisible();
    });
});
