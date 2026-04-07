// @ts-check
import { test, expect } from '@playwright/test';
import { loadGame, setStartingTurn, startGame, getTurn, getBallCount } from './helpers/game.js';

/**
 * Behavior covered:
 *  - The "Empezar en turno" input clamps to 1..500 on `change`.
 *  - The "balls preview" line updates when the input changes — at turn 1
 *    it announces a single ball, at higher turns it shows separate hints
 *    per difficulty.
 *  - Starting a game with a high starting turn lands you at that exact
 *    turn in the game UI and gives you more than one ball.
 *
 * The exact preview text is part of the user-facing UI and is therefore
 * fair to assert on. We assert on substrings only, not full text.
 */
test.describe('Glow-Break - starting turn input', () => {
    test('input clamps to the documented range', async ({ page }) => {
        await loadGame(page);

        const input = page.locator('#startTurnInput');

        // Below minimum → clamped to 1.
        await setStartingTurn(page, 0);
        await expect(input).toHaveValue('1');

        // Negative → clamped to 1.
        await setStartingTurn(page, -50);
        await expect(input).toHaveValue('1');

        // Above maximum → clamped to 500.
        await setStartingTurn(page, 9999);
        await expect(input).toHaveValue('500');

        // In range → preserved.
        await setStartingTurn(page, 42);
        await expect(input).toHaveValue('42');
    });

    test('balls preview reacts to the turn input', async ({ page }) => {
        await loadGame(page);

        const preview = page.locator('#ballsPreview');

        await setStartingTurn(page, 1);
        // At turn 1 the preview is "🔵 1 bola" (literal copy in the menu).
        await expect(preview).toContainText('1');

        // At a high turn the preview should mention all three difficulty
        // emojis (😊 / 😤 / 💀) — that's the purpose of the multi-difficulty
        // hint shown in the menu.
        await setStartingTurn(page, 100);
        await expect(preview).toContainText('😊');
        await expect(preview).toContainText('😤');
        await expect(preview).toContainText('💀');
    });

    test('starting at a high turn lands at that turn with extra balls', async ({ page }) => {
        await loadGame(page);
        await setStartingTurn(page, 50);
        await startGame(page, 'easy');

        expect(await getTurn(page)).toBe(50);
        // Ball count formula is implementation-defined but it must be > 1
        // by turn 50 on easy — the menu preview itself promises this.
        expect(await getBallCount(page)).toBeGreaterThan(1);
    });

    test('default starting turn is 1 across reloads', async ({ page }) => {
        await loadGame(page);
        await expect(page.locator('#startTurnInput')).toHaveValue('1');

        await setStartingTurn(page, 200);
        await expect(page.locator('#startTurnInput')).toHaveValue('200');

        // Reloading wipes the in-memory state.
        await loadGame(page);
        await expect(page.locator('#startTurnInput')).toHaveValue('1');
    });
});
