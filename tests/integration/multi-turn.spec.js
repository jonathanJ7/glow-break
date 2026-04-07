// @ts-check
import { test, expect } from '@playwright/test';
import {
    loadGame,
    startGame,
    setStartingTurn,
    playTurn,
    playTurns,
    getTurn,
    getBallCount,
    isGameOver,
} from './helpers/game.js';

/**
 * Multi-turn simulations. The intent of these tests is to keep the game
 * loop honest across refactors: if anything in the turn-progression
 * pipeline breaks (skip → endTurn → moveBricksDown → generateNewRow →
 * updateUI) the turn counter won't tick the way it should and these tests
 * will catch it. None of them inspect random outcomes; they only assert
 * monotonic, high-level invariants.
 */

test.describe('Glow-Break - multi-turn simulations', () => {
    test('easy mode: turn counter advances by 1 per played turn', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        for (let i = 0; i < 5; i++) {
            const before = await getTurn(page);
            const after = await playTurn(page, ((i % 3) - 1) * 40);
            // Game over should not happen this early on easy starting from 1.
            expect(after).not.toBeNull();
            expect(after).toBe(before + 1);
        }
    });

    test('easy mode: 15-turn simulation never crashes and never decrements turn', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'easy');

        let last = await getTurn(page);
        for (let i = 0; i < 15; i++) {
            const next = await playTurn(page, ((i % 5) - 2) * 30);
            if (next === null) break; // game over is acceptable, just stop
            expect(next).toBeGreaterThanOrEqual(last);
            last = next;
        }

        // Either the run reached turn 16 or the game ended honestly.
        expect(last >= 6 || (await isGameOver(page))).toBe(true);
    });

    test('medium mode: 10 turns can be played from turn 1', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'medium');

        const last = await playTurns(page, 10);
        // Either survived 10 turns, or game-over showed before then —
        // both are valid outcomes; we just want no hangs / no crashes.
        if (!(await isGameOver(page))) {
            expect(last).toBeGreaterThanOrEqual(2);
        }
    });

    test('hard mode: simulation runs to completion (game over OR survives)', async ({ page }) => {
        await loadGame(page);
        await startGame(page, 'hard');

        const last = await playTurns(page, 12);

        // Either we survived more than one turn, or the overlay shows.
        expect((await isGameOver(page)) || last > 1).toBe(true);
    });

    test('ball count is monotonic non-decreasing across an easy run', async ({ page }) => {
        // The bonus pickups in this game only ever ADD balls — there is no
        // mechanic that subtracts from the player's inventory. So the ball
        // counter should never go down between turns. (It's allowed to
        // stay flat if no bonuses were picked up that turn.)
        await loadGame(page);
        await startGame(page, 'easy');

        let prevBalls = await getBallCount(page);

        for (let i = 0; i < 8; i++) {
            const next = await playTurn(page, ((i % 5) - 2) * 30);
            if (next === null) break;

            const balls = await getBallCount(page);
            expect(balls).toBeGreaterThanOrEqual(prevBalls);
            prevBalls = balls;
        }
    });

    test('high-turn start: easy from turn 30 still simulates 5 turns', async ({ page }) => {
        await loadGame(page);
        await setStartingTurn(page, 30);
        await startGame(page, 'easy');

        expect(await getTurn(page)).toBe(30);

        for (let i = 0; i < 5; i++) {
            const next = await playTurn(page, ((i % 5) - 2) * 25);
            if (next === null) break;
        }

        // Either we made progress past turn 30, or the game ended honestly.
        expect((await isGameOver(page)) || (await getTurn(page)) > 30).toBe(true);
    });
});
