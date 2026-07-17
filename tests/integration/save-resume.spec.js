// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, setStartingTurn, startGame } from './helpers/game.js';

/**
 * Behavior covered (v2.8.1):
 *  - Selección de cola de disparo: cuando el inventario supera el tope de
 *    bolas en pantalla, las especiales igual entran en la cola (antes las
 *    normales llenaban el tope y las especiales nunca se disparaban).
 *  - Partida guardada: el estado se persiste en localStorage al inicio de
 *    cada turno; el botón "Continuar" del menú restaura turno, inventario,
 *    bloques y escudos tras una recarga (crash/cierre de la app).
 *  - El game over borra el guardado: no se puede continuar una partida
 *    terminada.
 */

test.describe('Glow-Break - cola de disparo con inventario grande', () => {
    test('las especiales se disparan aunque haya más normales que el tope', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const result = await page.evaluate(() => {
            const g = window.__game;
            g.gameState.ballInventory = {
                normal: 500,
                fireball: 3,
                splitter: 2,
                strength: 4,
                bomb: 1,
            };

            g.game.startShooting();

            // startShooting ya disparó la primera bola de la cola.
            const fired = g.gameState.balls.map((b) => b.ballType);
            const queue = [...fired, ...g.gameState.ballsToShoot];
            const counts = {};
            for (const t of queue) counts[t] = (counts[t] || 0) + 1;
            return { counts, total: g.gameState.totalBallsToShoot };
        });

        // La cola respeta el tope, pero reservando lugar para TODAS las
        // especiales; las normales rellenan el resto.
        expect(result.counts.fireball).toBe(3);
        expect(result.counts.splitter).toBe(2);
        expect(result.counts.strength).toBe(4);
        expect(result.counts.bomb).toBe(1);
        expect(result.counts.normal).toBe(result.total - 10);
    });
});

test.describe('Glow-Break - partida guardada (Continuar)', () => {
    test('recargar la página permite continuar con el mismo estado', async ({ page }) => {
        await loadGameWithHooks(page);
        await setStartingTurn(page, 30);
        await startGame(page, 'easy');

        const before = await page.evaluate(() => {
            const gs = window.__game.gameState;
            return {
                turn: gs.turn,
                inventory: { ...gs.ballInventory },
                brickCount: gs.bricks.length,
                brickTypes: gs.bricks.map((b) => b.type).sort(),
                shields: gs.shieldCharges,
            };
        });

        // Simular crash/cierre: recargar la página desde cero.
        await page.goto('/?testHooks=1');
        const continueBtn = page.locator('#continueBtn');
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toContainText('Turno 30');

        await continueBtn.evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await expect(page.locator('#mainMenu')).toBeHidden();
        await expect(page.locator('#ui')).toBeVisible();

        const after = await page.evaluate(() => {
            const gs = window.__game.gameState;
            return {
                turn: gs.turn,
                inventory: { ...gs.ballInventory },
                brickCount: gs.bricks.length,
                brickTypes: gs.bricks.map((b) => b.type).sort(),
                shields: gs.shieldCharges,
            };
        });

        expect(after.turn).toBe(before.turn);
        expect(after.inventory).toEqual(before.inventory);
        expect(after.brickCount).toBe(before.brickCount);
        expect(after.brickTypes).toEqual(before.brickTypes);
        expect(after.shields).toBe(before.shields);
    });

    test('sin partida guardada el botón Continuar no aparece', async ({ page }) => {
        await loadGameWithHooks(page);
        await expect(page.locator('#continueBtn')).toBeHidden();
    });

    test('el game over borra la partida guardada', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        await page.evaluate(() => window.__game.game.endGame());
        await expect(page.locator('#gameOver')).toBeVisible();

        await page.goto('/?testHooks=1');
        await expect(page.locator('#mainMenu')).toBeVisible();
        await expect(page.locator('#continueBtn')).toBeHidden();
    });
});
