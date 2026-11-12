// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Villano del espacio libre (v2.13.0).
 *  - VillainDirector es una máquina de estados pura: se testea con tiempos
 *    explícitos, sin reloj ni canvas.
 *  - El villano solo aparece si sobra alto arriba del tablero, demora la
 *    fila nueva solo mientras se lo ve, y respeta prefers-reduced-motion.
 */
test.describe('Glow-Break - villano: VillainDirector (puro)', () => {
    test.beforeEach(async ({ page }) => { await loadGameWithHooks(page); });

    test('fin de turno: prepara → lanza → vuelve a la espera', async ({ page }) => {
        const poses = await page.evaluate(() => {
            const { createVillainDirector, handleVillainEvent, getVillainPose, VILLAIN_ACTIONS: A } = window.__game.villainDirector;
            const d = createVillainDirector();
            handleVillainEvent(d, 'turnEnded', { eraChanged: false }, 1000);
            const at = ms => getVillainPose(d, ms).pose;
            return [at(1000), at(1000 + A.prepara.duration + 10), at(1000 + A.prepara.duration + A.lanza.duration + 10)];
        });
        expect(poses).toEqual(['prepara', 'lanza', 'idle']);
    });

    test('cambio de era termina en furia; escudo perdido termina en burla', async ({ page }) => {
        const r = await page.evaluate(() => {
            const { createVillainDirector, handleVillainEvent, getVillainPose, VILLAIN_ACTIONS: A } = window.__game.villainDirector;
            const after = A.prepara.duration + A.lanza.duration + 10;
            const era = createVillainDirector();
            handleVillainEvent(era, 'turnEnded', { eraChanged: true }, 0);
            const shield = createVillainDirector();
            handleVillainEvent(shield, 'shieldUsed', {}, 0);
            handleVillainEvent(shield, 'turnEnded', { eraChanged: false }, 0);
            return [getVillainPose(era, after).pose, getVillainPose(shield, after).pose];
        });
        expect(r).toEqual(['furia', 'burla']);
    });

    test('acusa el golpe una sola vez por turno al llegar a golpeKills', async ({ page }) => {
        const r = await page.evaluate(() => {
            const { createVillainDirector, handleVillainEvent, getVillainPose } = window.__game.villainDirector;
            const kills = window.__game.config.VILLAIN.golpeKills;
            const d = createVillainDirector();
            handleVillainEvent(d, 'shootingStarted', {}, 0);
            handleVillainEvent(d, 'bricksDestroyed', { count: kills - 1 }, 0);
            const before = getVillainPose(d, 10).pose;
            handleVillainEvent(d, 'bricksDestroyed', { count: 1 }, 20);
            const hit = getVillainPose(d, 30).pose;
            const restartedAt = d.current.startedAt;
            handleVillainEvent(d, 'bricksDestroyed', { count: 10 }, 100);
            return { before, hit, sameReaction: d.current.startedAt === restartedAt };
        });
        expect(r).toEqual({ before: 'mira', hit: 'golpe', sameReaction: true });
    });

    test('una reacción de menor prioridad no interrumpe la furia', async ({ page }) => {
        const r = await page.evaluate(() => {
            const { createVillainDirector, handleVillainEvent, getVillainPose, VILLAIN_ACTIONS: A } = window.__game.villainDirector;
            const kills = window.__game.config.VILLAIN.golpeKills;
            const d = createVillainDirector();
            handleVillainEvent(d, 'turnEnded', { eraChanged: true }, 0);
            const furiaAt = A.prepara.duration + A.lanza.duration + 10;
            getVillainPose(d, furiaAt);
            handleVillainEvent(d, 'shootingStarted', {}, furiaAt);
            handleVillainEvent(d, 'bricksDestroyed', { count: kills }, furiaAt);
            return [getVillainPose(d, furiaAt + 10).pose, getVillainPose(d, furiaAt + A.furia.duration + 10).pose];
        });
        // La furia sigue; el golpe queda encolado para después
        expect(r).toEqual(['furia', 'golpe']);
    });
});

test.describe('Glow-Break - villano: layout y fila nueva', () => {
    test('en la vista dividida no aparece ni demora la fila nueva', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 541 });
        await loadGameWithHooks(page);
        await startGame(page, 'medium');
        const r = await page.evaluate(async () => {
            const g = window.__game;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            g.game.endTurn();
            return { visible: g.villain.getVillainDebugState().visible, hidden: g.villain.isNewRowHidden(performance.now()) };
        });
        expect(r).toEqual({ visible: false, hidden: false });
    });

    test('en pantalla alta aparece y la fila nueva llega cuando cae el bloque', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loadGameWithHooks(page);
        await startGame(page, 'medium');
        const r = await page.evaluate(async () => {
            const g = window.__game;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const visible = g.villain.getVillainDebugState().visible;
            g.game.endTurn();
            const hiddenNow = g.villain.isNewRowHidden(performance.now());
            await new Promise(r => setTimeout(r, 1200));
            return { visible, hiddenNow, hiddenLater: g.villain.isNewRowHidden(performance.now()) };
        });
        expect(r).toEqual({ visible: true, hiddenNow: true, hiddenLater: false });
    });

    test('con prefers-reduced-motion la fila nueva aparece al instante', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 390, height: 844 });
        await loadGameWithHooks(page);
        await startGame(page, 'medium');
        const r = await page.evaluate(async () => {
            const g = window.__game;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            g.game.endTurn();
            return { reduced: g.villain.getVillainDebugState().reducedMotion, hidden: g.villain.isNewRowHidden(performance.now()) };
        });
        expect(r).toEqual({ reduced: true, hidden: false });
    });
});
