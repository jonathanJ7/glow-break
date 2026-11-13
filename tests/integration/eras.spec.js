// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, setStartingTurn, startGame } from './helpers/game.js';

/**
 * Behavior covered (v2.12.0 — Eras y amenazas):
 *  - Las eras ACUMULAN amenazas: cada era suma una y las anteriores siguen
 *    activas; con todas activas, cada era sube de nivel una de ellas.
 *  - Cada amenaza hace exactamente lo que dice:
 *      ☣️ corrupción contagia a UN vecino por turno y cada grupo de corruptos
 *         pegados copia el HP más alto (los grupos se parten y se unen),
 *      🌊 oleada baja el tablero 2 filas,
 *      🧬 adaptación bloquea el 2º daño de área (no el de bola),
 *      🐛 reptador baja una fila extra si tiene lugar,
 *      🌫️ niebla oculta las filas de arriba hasta que el bloque recibe daño.
 *  - El estado de amenazas de cada bloque sobrevive a guardar/reanudar.
 *  - El HUD muestra la era y las amenazas activas.
 */

/** Arranca una partida en `turn` y deja el tablero vacío. */
async function startAt(page, turn, difficulty = 'medium') {
    await loadGameWithHooks(page);
    await setStartingTurn(page, turn);
    await startGame(page, difficulty);
    await page.evaluate(() => {
        const s = window.__game.gameState;
        s.bricks = [];
        s.bonuses = [];
    });
}

/** Coloca un bloque en (col, row) y devuelve su índice en gameState.bricks. */
function placeBrickScript() {
    return `window.__place = (col, row, hp, extra = {}) => {
        const G = window.__game;
        const cell = G.rendering.getCellSize();
        const brick = {
            x: G.rendering.getLeftBorder() + col * cell,
            y: G.rendering.getTopOffset() + row * cell,
            width: cell - 4, height: cell - 4,
            hp, maxHp: hp, col, type: 'normal', isReinforced: false,
            ...extra,
        };
        G.gameState.bricks.push(brick);
        return brick;
    };
    window.__rowOf = (b) => Math.round((b.y - window.__game.rendering.getTopOffset()) / window.__game.rendering.getCellSize());`;
}

test.describe('Glow-Break - eras y amenazas', () => {
    test('las amenazas se acumulan era tras era y después suben de nivel', async ({ page }) => {
        await loadGameWithHooks(page);
        const r = await page.evaluate(() => {
            const { getThreatLevels } = window.__game.eras;
            return {
                t14: getThreatLevels(14, 'medium'),
                t15: getThreatLevels(15, 'medium'),
                t30: getThreatLevels(30, 'medium'),
                t75: getThreatLevels(75, 'medium'),
                t90: getThreatLevels(90, 'medium'),
                t105: getThreatLevels(105, 'medium'),
                hard15: getThreatLevels(15, 'hard'),
                easy24: getThreatLevels(24, 'easy'),
                easy25: getThreatLevels(25, 'easy'),
                far: getThreatLevels(5000, 'medium'),
            };
        });

        expect(r.t14).toEqual({});
        expect(r.t15).toEqual({ corruption: 1 });
        // La corrupción sigue activa cuando llegan las oleadas
        expect(r.t30).toEqual({ corruption: 1, waves: 1 });
        expect(r.t75).toEqual({ corruption: 1, waves: 1, adaptation: 1, crawlers: 1, fog: 1 });
        expect(r.t90).toEqual({ corruption: 2, waves: 1, adaptation: 1, crawlers: 1, fog: 1 });
        expect(r.t105).toEqual({ corruption: 2, waves: 2, adaptation: 1, crawlers: 1, fog: 1 });
        // Difícil: cada amenaza llega directamente en nivel 2
        expect(r.hard15).toEqual({ corruption: 2 });
        // Fácil: eras más largas
        expect(r.easy24).toEqual({});
        expect(r.easy25).toEqual({ corruption: 1 });
        // Todas topean en su nivel máximo
        expect(Object.values(r.far)).toEqual([3, 3, 3, 3, 3]);
    });

    test('corrupción: cada corrupto contagia a UN solo vecino y el grupo copia el HP del más fuerte', async ({ page }) => {
        // Turno 20, medio: corrupción nivel 1 (solo vecinos ortogonales)
        await startAt(page, 20);
        const r = await page.evaluate(placeBrickScript() + `;
            const src = __place(2, 2, 100, { corrupt: true });
            const neighbors = [__place(1, 2, 300), __place(3, 2, 50), __place(2, 1, 700), __place(2, 3, 20)];
            const diag = __place(3, 3, 999);
            window.__game.game.endTurn();
            const infected = neighbors.filter(b => b.corrupt);
            ({
                infectedCount: infected.length,
                srcHp: src.hp,
                expectedHp: Math.max(100, ...infected.map(b => b.maxHp)),
                infectedHp: infected.map(b => b.hp),
                healthyHp: neighbors.filter(b => !b.corrupt).map(b => b.hp).sort((a, b) => a - b),
                diag: { corrupt: !!diag.corrupt, hp: diag.hp },
            });
        `);
        expect(r.infectedCount).toBe(1);
        expect(r.srcHp).toBe(r.expectedHp);
        expect(r.infectedHp).toEqual([r.expectedHp]);
        // Los sanos no cambian de HP
        expect(r.healthyHp.every(hp => [300, 50, 700, 20].includes(hp))).toBe(true);
        // La diagonal no cuenta en nivel 1
        expect(r.diag).toEqual({ corrupt: false, hp: 999 });
    });

    test('corrupción: elige solo entre vecinos sanos, así en 4 turnos contagia a los 4', async ({ page }) => {
        await startAt(page, 20);
        const r = await page.evaluate(placeBrickScript() + `;
            const G = window.__game;
            const results = [];
            for (let trial = 0; trial < 20; trial++) {
                G.gameState.bricks = [];
                G.gameState.turn = 20;
                __place(2, 3, 100, { corrupt: true });
                const neighbors = [__place(1, 3, 10), __place(3, 3, 10), __place(2, 2, 10), __place(2, 4, 10)];
                const perTurn = [];
                for (let t = 0; t < 4; t++) {
                    G.game.endTurn();
                    perTurn.push(neighbors.filter(b => b.corrupt).length);
                }
                results.push(perTurn.join(','));
            }
            results;
        `);
        // Cada turno exactamente uno nuevo, nunca repite uno ya contagiado
        expect(new Set(r)).toEqual(new Set(['1,2,3,4']));
    });

    test('corrupción: los grupos se unen al tocarse y se parten al romper el del medio', async ({ page }) => {
        await startAt(page, 20);
        const r = await page.evaluate(placeBrickScript() + `;
            // Unidos: A-B-C pegados en la fila 2 → todos copian al más fuerte
            const a = __place(0, 2, 10, { corrupt: true });
            const b = __place(1, 2, 500, { corrupt: true });
            const c = __place(2, 2, 20, { corrupt: true });
            // Partidos: D _ F (el del medio ya no está) → cada uno conserva su HP
            const d = __place(4, 4, 30, { corrupt: true });
            const f = __place(6, 4, 40, { corrupt: true });
            window.__game.game.endTurn();
            const merged = [a.hp, b.hp, c.hp];
            const split = [d.hp, f.hp];
            // Ahora se rompe B: A y C quedan en grupos separados
            const G = window.__game;
            G.gameState.bricks = G.gameState.bricks.filter(x => x !== b);
            a.hp = 1; c.hp = 2;
            G.game.endTurn();
            ({ merged, split, afterBreak: [a.hp, c.hp] });
        `);
        expect(r.merged).toEqual([500, 500, 500]);
        expect(r.split).toEqual([30, 40]);
        expect(r.afterBreak).toEqual([1, 2]);
    });

    test('corrupción nivel 3: también contagia en diagonal', async ({ page }) => {
        // Medio: corrupción sube a nivel 3 en el turno 165
        await startAt(page, 165);
        const r = await page.evaluate(placeBrickScript() + `;
            const level = window.__game.gameState.threatLevels.corruption;
            // Su único vecino está en diagonal: lo contagia y forman grupo
            const src = __place(2, 2, 100, { corrupt: true });
            const diag = __place(3, 3, 999);
            window.__game.game.endTurn();
            ({ level, srcHp: src.hp, diagCorrupt: !!diag.corrupt });
        `);
        expect(r.level).toBe(3);
        expect(r.diagCorrupt).toBe(true);
        expect(r.srcHp).toBe(999);
    });

    test('oleada: en el turno de oleada el tablero baja 2 filas', async ({ page }) => {
        // Turno 36, medio: oleadas nivel 1 (cada 6) → 36 es turno de oleada
        await startAt(page, 36);
        const r = await page.evaluate(placeBrickScript() + `;
            const b = __place(1, 2, 999);
            const levels = window.__game.gameState.threatLevels;
            window.__game.game.endTurn();
            ({ row: __rowOf(b), waves: levels.waves });
        `);
        expect(r.waves).toBe(1);
        expect(r.row).toBe(4);
    });

    test('fuera del turno de oleada el tablero baja 1 fila', async ({ page }) => {
        await startAt(page, 37);
        const row = await page.evaluate(placeBrickScript() + `;
            const b = __place(1, 2, 999);
            window.__game.game.endTurn();
            __rowOf(b);
        `);
        expect(row).toBe(3);
    });

    test('adaptación: el segundo daño de área se bloquea, la bola pega siempre', async ({ page }) => {
        await startAt(page, 50);
        const r = await page.evaluate(placeBrickScript() + `;
            const { damageBrick } = window.__game.physics;
            const b = __place(3, 3, 1000);
            const first = damageBrick(b, 100, 'laser');
            const second = damageBrick(b, 100, 'bomb');
            const ball = damageBrick(b, 7, 'ball');
            ({ first, second, ball, hp: b.hp });
        `);
        expect(r.first).toBe(100);
        expect(r.second).toBe(0);
        expect(r.ball).toBe(7);
        expect(r.hp).toBe(893);
    });

    test('reptador: baja una fila extra si la celda de abajo está libre', async ({ page }) => {
        await startAt(page, 65);
        const r = await page.evaluate(placeBrickScript() + `;
            const crawler = __place(0, 1, 999, { crawler: true });
            const blocked = __place(4, 1, 999, { crawler: true });
            __place(4, 2, 999);
            const normal = __place(6, 1, 999);
            window.__game.game.endTurn();
            ({ crawler: __rowOf(crawler), blocked: __rowOf(blocked), normal: __rowOf(normal) });
        `);
        expect(r.crawler).toBe(3);
        expect(r.blocked).toBe(2);
        expect(r.normal).toBe(2);
    });

    test('niebla: oculta las filas de arriba hasta que el bloque recibe daño', async ({ page }) => {
        await startAt(page, 80);
        const r = await page.evaluate(placeBrickScript() + `;
            const G = window.__game;
            const helpers = G.physics.physicsHelpers;
            const hidden = (b) => G.threatSystem.isBrickHidden(G.gameState.threatLevels, G.gameState, b, helpers);
            const top = __place(2, 0, 500);
            const low = __place(2, 5, 500);
            const before = { top: hidden(top), low: hidden(low) };
            G.physics.damageBrick(top, 1, 'ball');
            ({ before, afterHit: hidden(top) });
        `);
        expect(r.before).toEqual({ top: true, low: false });
        expect(r.afterHit).toBe(false);
    });

    test('el estado de amenazas de cada bloque sobrevive a guardar y reanudar', async ({ page }) => {
        await startAt(page, 80);
        const r = await page.evaluate(placeBrickScript() + `;
            const G = window.__game;
            __place(1, 3, 321, { corrupt: true, crawler: true, shellUntil: 82, revealed: true });
            G.game.saveGame();
            G.game.resumeGame();
            const b = G.gameState.bricks.find(x => x.hp === 321);
            ({ corrupt: b.corrupt, crawler: b.crawler, shellUntil: b.shellUntil, revealed: b.revealed,
               levels: G.gameState.threatLevels });
        `);
        expect(r).toMatchObject({ corrupt: true, crawler: true, shellUntil: 82, revealed: true });
        expect(Object.keys(r.levels)).toHaveLength(5);
    });

    test('el HUD muestra la era y las amenazas activas', async ({ page }) => {
        await loadGameWithHooks(page);
        await setStartingTurn(page, 60);
        await startGame(page, 'medium');
        const hud = page.locator('#threatHud');
        await expect(hud).toBeVisible();
        await expect(hud.locator('.threat-era')).toHaveText('V');
        await expect(hud.locator('.threat-chip')).toHaveCount(4);

        await hud.evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await expect(page.locator('#threatPanel')).toBeVisible();
        await expect(page.locator('#threatPanelBody')).toContainText('Reptadores');
    });
});
