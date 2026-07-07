// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, setStartingTurn, startGame } from './helpers/game.js';

/**
 * Behavior covered (v2.7.0 fun mechanics):
 *  - Boss bricks spawn on boss turns (every 15) and span 3 columns.
 *  - The shield consumes itself to burn the bottom rows instead of an
 *    instant game over; with no shields left, crossing the line ends
 *    the game.
 *  - Combo kills convert into bonus balls at end of turn.
 *  - A full overdrive meter activates a double-damage turn on the next
 *    shot and resets the meter.
 *
 * All specs drive the real game through window.__game hooks — no engine
 * internals are duplicated here.
 */

test.describe('Glow-Break - fun mechanics (v2.7.0)', () => {
    test('a boss brick spawns on boss turns and spans 3 columns', async ({ page }) => {
        await loadGameWithHooks(page);
        await setStartingTurn(page, 15);
        await startGame(page, 'easy');

        const boss = await page.evaluate(() => {
            const bricks = window.__game.gameState.bricks;
            const boss = bricks.find((b) => b.type === 'boss');
            if (!boss) return null;
            const normal = bricks.find((b) => b.type !== 'boss');
            return {
                width: boss.width,
                // Un ladrillo normal mide cellSize - 4; el jefe 3*cellSize - 4.
                normalWidth: normal ? normal.width : null,
                hp: boss.hp,
            };
        });

        expect(boss).not.toBeNull();
        expect(boss.hp).toBeGreaterThan(0);
        if (boss.normalWidth !== null) {
            expect(boss.width).toBeGreaterThan(boss.normalWidth * 2.5);
        }
    });

    test('shield burns the bottom rows instead of game over, then is spent', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const result = await page.evaluate(() => {
            const g = window.__game;
            g.gameState.shieldCharges = 1;

            // Marchar la única fila hacia abajo hasta cruzar la línea.
            let shieldTriggeredBeforeGameOver = false;
            for (let i = 0; i < 12; i++) {
                g.game.moveBricksDown();
                if (g.gameState.shieldCharges === 0 && !g.gameState.gameOver) {
                    shieldTriggeredBeforeGameOver = true;
                    break;
                }
                if (g.gameState.gameOver) break;
            }

            return {
                shieldTriggeredBeforeGameOver,
                shieldCharges: g.gameState.shieldCharges,
                gameOver: g.gameState.gameOver,
                bricksLeft: g.gameState.bricks.length,
            };
        });

        // El escudo se gastó, el juego siguió, y las filas de abajo ardieron.
        expect(result.shieldTriggeredBeforeGameOver).toBe(true);
        expect(result.shieldCharges).toBe(0);
        expect(result.gameOver).toBe(false);
        expect(result.bricksLeft).toBe(0);
    });

    test('without shields, bricks crossing the line end the game', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const gameOver = await page.evaluate(() => {
            const g = window.__game;
            g.gameState.shieldCharges = 0;
            for (let i = 0; i < 12 && !g.gameState.gameOver; i++) {
                g.game.moveBricksDown();
            }
            return g.gameState.gameOver;
        });

        expect(gameOver).toBe(true);
        await expect(page.locator('#gameOver')).toBeVisible();
    });

    test('combo kills convert into bonus balls at end of turn', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const result = await page.evaluate(() => {
            const g = window.__game;
            const before = g.gameState.ballInventory.normal || 0;
            g.gameState.combo = 24; // 24 destruidos → +2 bolas (12 por bola)
            g.game.endTurn();
            return {
                gained: (g.gameState.ballInventory.normal || 0) - before,
                comboReset: g.gameState.combo === 0,
            };
        });

        expect(result.gained).toBe(2);
        expect(result.comboReset).toBe(true);
    });

    test('full overdrive meter activates a double-damage turn and resets', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const result = await page.evaluate(() => {
            const g = window.__game;
            g.gameState.overdriveCharge = 999; // >= OVERDRIVE_MAX
            g.game.startShooting();
            return {
                active: g.gameState.overdriveActive,
                charge: g.gameState.overdriveCharge,
            };
        });

        expect(result.active).toBe(true);
        expect(result.charge).toBe(0);
    });
});
