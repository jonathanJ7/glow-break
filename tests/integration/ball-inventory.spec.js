// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame, getBallCount } from './helpers/game.js';

/**
 * Behavior covered (v2.11.0): tope del inventario de bolas.
 *  - Con el inventario lleno, un bonus de bolas NO se agarra: la bola pasa
 *    de largo y el bonus sigue en el tablero.
 *  - Si entran algunas, se agarran esas y el bonus se queda con el resto.
 *  - Combo / dorado / jefe suman solo lo que entra.
 *  - El panel 🎒 permite tirar bolas entre turnos, nunca la última.
 *  - Un guardado viejo que pasaba el tope se recorta (primero normales).
 *  - El total se muestra en un solo lugar (🎒 N/200).
 */

/** Pone una bola encima de un bonus recién creado y corre un paso de física. */
async function touchBonus(page, inventory, bonus) {
    return page.evaluate(({ inventory, bonus }) => {
        const g = window.__game;
        const gs = g.gameState;
        gs.ballInventory = { ...inventory };
        const b = {
            x: g.rendering.getWidth() / 2,
            y: g.rendering.getBottomLine() - 200,
            radius: 12,
            ...bonus,
        };
        gs.bonuses = [b];
        gs.bricks = [];
        gs.isShooting = true;
        const ball = g.BallRegistry.get('normal').createBall(b.x, b.y, 0, -0.01);
        ball.hasGoneUp = true;
        gs.balls = [ball];
        g.physics.updateBalls();
        return {
            inventory: { ...gs.ballInventory },
            bonusesLeft: gs.bonuses.length,
            bonusValue: gs.bonuses[0]?.value ?? null,
        };
    }, { inventory, bonus });
}

test.describe('Glow-Break - tope del inventario de bolas', () => {
    test('con el inventario lleno el bonus de bolas no se agarra y queda en el tablero', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');
        const cap = await page.evaluate(() => window.__game.config.MAX_BALL_INVENTORY);

        const r = await touchBonus(page, { normal: cap }, { type: 'ball', value: 3 });
        expect(r.inventory.normal).toBe(cap);
        expect(r.bonusesLeft).toBe(1);
        expect(r.bonusValue).toBe(3);

        // Las especiales tampoco entran si no hay lugar
        const r2 = await touchBonus(page, { normal: cap - 1, fireball: 1 }, { type: 'fireballBall', value: 1 });
        expect(r2.inventory.fireball).toBe(1);
        expect(r2.bonusesLeft).toBe(1);
    });

    test('si entran algunas, se agarran y el bonus se queda con el resto', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');
        const cap = await page.evaluate(() => window.__game.config.MAX_BALL_INVENTORY);

        const r = await touchBonus(page, { normal: cap - 2 }, { type: 'ball', value: 5 });
        expect(r.inventory.normal).toBe(cap);
        expect(r.bonusesLeft).toBe(1);
        expect(r.bonusValue).toBe(3);

        // Con lugar de sobra se agarra entero y desaparece
        const r2 = await touchBonus(page, { normal: 10 }, { type: 'ball', value: 5 });
        expect(r2.inventory.normal).toBe(15);
        expect(r2.bonusesLeft).toBe(0);
    });

    test('combo y botín de bloques solo suman lo que entra', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const r = await page.evaluate(() => {
            const g = window.__game;
            const cap = g.config.MAX_BALL_INVENTORY;
            g.gameState.ballInventory = { normal: cap - 1 };
            const granted = g.physics.addBallsToInventory('normal', 2);
            const afterLoot = g.gameState.ballInventory.normal;

            g.gameState.ballInventory = { normal: cap - 1 };
            g.gameState.combo = 48; // +4 bolas de combo, entra 1
            g.game.endTurn();
            return { cap, granted, afterLoot, afterCombo: g.gameState.ballInventory.normal };
        });
        expect(r.granted).toBe(1);
        expect(r.afterLoot).toBe(r.cap);
        expect(r.afterCombo).toBe(r.cap);
    });

    test('el panel 🎒 tira bolas entre turnos, pero nunca la última', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        await page.evaluate(() => {
            const g = window.__game;
            g.gameState.ballInventory = { normal: 25, fireball: 2 };
            g.game.updateUI();
        });

        await page.locator('#ballsHud').click();
        await expect(page.locator('#dropPanel')).toBeVisible();

        await page.locator('.drop-row[data-type="normal"] .drop-btn[data-count="10"]').click();
        expect(await getBallCount(page)).toBe(17);
        await expect(page.locator('.drop-row[data-type="normal"] .drop-count')).toHaveText('15');

        await page.locator('.drop-row[data-type="fireball"] .drop-btn[data-count="all"]').click();
        await page.locator('.drop-row[data-type="normal"] .drop-btn[data-count="all"]').click();
        expect(await getBallCount(page)).toBe(1);
        await expect(page.locator('.drop-row[data-type="normal"] .drop-btn').first()).toBeDisabled();

        // El tirado se guarda: el inventario persistido refleja el cambio
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('glowbreak_save')).ballInventory);
        expect(saved.normal).toBe(1);
        expect(saved.fireball || 0).toBe(0);

        await page.locator('#dropCloseBtn').click();
        await expect(page.locator('#dropPanel')).toBeHidden();
    });

    test('el panel no se abre con bolas en vuelo', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');
        const opened = await page.evaluate(() => {
            const g = window.__game;
            g.gameState.isShooting = true;
            return g.dropPanel.openDropPanel();
        });
        expect(opened).toBe(false);
        await expect(page.locator('#dropPanel')).toBeHidden();
    });

    test('recortar un inventario excedido descarta primero normales', async ({ page }) => {
        await loadGameWithHooks(page);
        const r = await page.evaluate(() => {
            const g = window.__game;
            const cap = g.config.MAX_BALL_INVENTORY;
            const inv = { normal: cap + 50, fireball: 5, bomb: 2 };
            const removed = g.ballInventory.clampInventory(inv);
            return { cap, inv, removed, total: g.ballInventory.getInventoryTotal(inv) };
        });
        expect(r.removed).toBe(57);
        expect(r.total).toBe(r.cap);
        expect(r.inv.fireball).toBe(5);
        expect(r.inv.bomb).toBe(2);
    });

    test('el total y el tope se muestran en un solo lugar', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');
        await page.evaluate(() => {
            const g = window.__game;
            g.gameState.ballInventory = { normal: g.config.MAX_BALL_INVENTORY };
            g.game.updateUI();
        });
        await expect(page.locator('#ballsHud')).toHaveText(/🎒\s*200\/200/);
        await expect(page.locator('#ballsHud')).toHaveClass(/balls-full/);
    });
});
