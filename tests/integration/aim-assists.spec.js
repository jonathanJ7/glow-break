// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Behavior covered (ayudas de puntería por dificultad):
 *  - En Difícil la mira recorre toda el área pero termina en el primer
 *    impacto: ningún punto de la trayectoria está marcado como rebote.
 *  - En Difícil las bolas se dispersan: cada bola saca su propio dado y,
 *    si sale, se desvía dentro del ±maxDegrees de SU tipo. En Fácil y
 *    Medio el ángulo sale siempre exacto.
 *  - La dispersión nunca deja una bola horizontal ni hacia abajo.
 *  - El apuntado congelado está disponible también en Difícil.
 */

test.describe('Glow-Break - ayudas de puntería', () => {
    test('en difícil la mira llega al primer impacto y no muestra el rebote', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'hard');

        const result = await page.evaluate(() => {
            const g = window.__game;
            const assists = g.DIFFICULTY_SETTINGS.hard.assists;

            // Disparo recto hacia arriba: con bloques en pantalla tiene que
            // chocar contra alguno o contra el techo.
            const points = g.physics.calculateTrajectory(
                g.gameState.launchX,
                g.gameState.launchY - 10,
                -Math.PI / 2,
                assists.aimBounces,
                1200
            );

            return {
                aimBounces: assists.aimBounces,
                aimLength: assists.aimLength,
                pointCount: points.length,
                bouncePoints: points.filter(p => p.isBounce).length,
                startY: points[0].y,
                endY: points[points.length - 1].y,
            };
        });

        expect(result.aimBounces).toBe(0);
        expect(result.aimLength).toBeNull();          // largo completo, no recortado
        expect(result.pointCount).toBe(2);            // origen + impacto, nada más
        expect(result.bouncePoints).toBe(0);          // no se revela hacia dónde sale
        expect(result.endY).toBeLessThan(result.startY);
    });

    test('en difícil cada tipo de bola se desvía dentro de su propio rango', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'hard');

        const result = await page.evaluate(() => {
            const g = window.__game;
            const aim = -Math.PI / 2;
            const perType = {};

            for (const type of g.BallRegistry.getTypes()) {
                const behavior = g.BallRegistry.get(type);
                const scatter = behavior.aimScatter || g.config.DEFAULT_AIM_SCATTER;
                const maxRad = scatter.maxDegrees * Math.PI / 180;

                let deviated = 0;
                let maxOffset = 0;
                const SHOTS = 600;
                for (let i = 0; i < SHOTS; i++) {
                    const angle = g.game.applyAimScatter(aim, behavior);
                    const offset = Math.abs(angle - aim);
                    if (offset > 1e-9) deviated++;
                    maxOffset = Math.max(maxOffset, offset);
                }

                perType[type] = {
                    shots: SHOTS,
                    deviated,
                    maxOffset,
                    allowed: maxRad,
                    declaredChance: scatter.chance,
                };
            }
            return perType;
        });

        for (const [type, r] of Object.entries(result)) {
            // Con 600 tiros y una probabilidad >= 20%, "ninguno se desvió"
            // es imposible en la práctica: si pasa, la dispersión no se aplicó.
            expect(r.deviated, `${type} debería desviarse a veces`).toBeGreaterThan(0);
            // ...y tampoco se desvían todas: el dado tiene que fallar seguido.
            expect(r.deviated, `${type} no debería desviarse siempre`).toBeLessThan(r.shots);
            // El desvío observado respeta el máximo declarado por el tipo.
            expect(r.maxOffset, `${type} no debe exceder su desvío máximo`).toBeLessThanOrEqual(r.allowed + 1e-9);
            // Frecuencia observada cerca de la declarada (margen amplio, es azar).
            const rate = r.deviated / r.shots;
            expect(Math.abs(rate - r.declaredChance)).toBeLessThan(0.12);
        }
    });

    test('la dispersión nunca deja una bola horizontal ni hacia abajo', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'hard');

        const outOfRange = await page.evaluate(() => {
            const g = window.__game;
            const { AIM_ANGLE_MIN, AIM_ANGLE_MAX } = g.config;
            let bad = 0;

            // Apuntando justo en los topes, el desvío tiende a salirse del
            // rango permitido: tiene que quedar recortado.
            for (const aim of [AIM_ANGLE_MIN, AIM_ANGLE_MAX]) {
                for (const type of g.BallRegistry.getTypes()) {
                    const behavior = g.BallRegistry.get(type);
                    for (let i = 0; i < 300; i++) {
                        const angle = g.game.applyAimScatter(aim, behavior);
                        if (angle > AIM_ANGLE_MAX + 1e-9 || angle < AIM_ANGLE_MIN - 1e-9) bad++;
                    }
                }
            }
            return bad;
        });

        expect(outOfRange).toBe(0);
    });

    test('en fácil y medio la bola sale exacta al ángulo apuntado', async ({ page }) => {
        await loadGameWithHooks(page);

        for (const difficulty of ['easy', 'medium']) {
            await startGame(page, difficulty);

            const maxOffset = await page.evaluate(() => {
                const g = window.__game;
                const aim = -Math.PI / 2;
                let worst = 0;
                for (const type of g.BallRegistry.getTypes()) {
                    const behavior = g.BallRegistry.get(type);
                    for (let i = 0; i < 300; i++) {
                        worst = Math.max(worst, Math.abs(g.game.applyAimScatter(aim, behavior) - aim));
                    }
                }
                return worst;
            });

            expect(maxOffset, `${difficulty} no debe dispersar`).toBe(0);
            await page.reload();
            await page.waitForFunction(() => window.__game?.ready === true);
        }
    });

    test('el apuntado congelado está disponible en todas las dificultades', async ({ page }) => {
        await loadGameWithHooks(page);

        const freeze = await page.evaluate(() => {
            const g = window.__game;
            return Object.fromEntries(
                ['easy', 'medium', 'hard'].map(d => [d, g.DIFFICULTY_SETTINGS[d].assists.freezeAim])
            );
        });

        expect(freeze).toEqual({ easy: true, medium: true, hard: true });
    });
});
