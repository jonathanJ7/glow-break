// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Behavior covered (ayudas de puntería por dificultad):
 *  - En Difícil la mira recorre toda el área pero termina en el primer
 *    impacto: ningún punto de la trayectoria está marcado como rebote.
 *  - En Difícil las bolas se dispersan por TIPO: se tira un dado por tipo
 *    y por turno, y el tipo al que le toca desvía TODAS sus bolas el mismo
 *    ángulo, dentro del ±maxDegrees que declara. En Fácil y Medio el
 *    ángulo sale siempre exacto.
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

    test('en difícil el desvío se tira por tipo y por turno, dentro de su rango', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'hard');

        const result = await page.evaluate(() => {
            const g = window.__game;
            const TURNS = 600;
            const perType = {};

            for (const type of g.BallRegistry.getTypes()) {
                const scatter = g.BallRegistry.get(type).aimScatter || g.config.DEFAULT_AIM_SCATTER;
                perType[type] = {
                    turns: TURNS,
                    deviated: 0,
                    maxOffset: 0,
                    allowed: scatter.maxDegrees * Math.PI / 180,
                    declaredChance: scatter.chance,
                };
            }

            for (let t = 0; t < TURNS; t++) {
                const offsets = g.game.rollAimScatter();
                for (const type of Object.keys(perType)) {
                    const offset = Math.abs(offsets[type] || 0);
                    if (offset > 1e-9) perType[type].deviated++;
                    perType[type].maxOffset = Math.max(perType[type].maxOffset, offset);
                }
            }
            return perType;
        });

        for (const [type, r] of Object.entries(result)) {
            // Con 600 turnos y una probabilidad >= 20%, "nunca se desvió" es
            // imposible en la práctica: si pasa, la dispersión no se aplicó.
            expect(r.deviated, `${type} debería desviarse a veces`).toBeGreaterThan(0);
            // ...y tampoco en todos los turnos: el dado tiene que fallar seguido.
            expect(r.deviated, `${type} no debería desviarse siempre`).toBeLessThan(r.turns);
            // El desvío observado respeta el máximo declarado por el tipo.
            expect(r.maxOffset, `${type} no debe exceder su desvío máximo`).toBeLessThanOrEqual(r.allowed + 1e-9);
            // Frecuencia observada cerca de la declarada (margen amplio, es azar).
            const rate = r.deviated / r.turns;
            expect(Math.abs(rate - r.declaredChance)).toBeLessThan(0.12);
        }
    });

    test('todas las bolas de un mismo tipo salen juntas, con el desvío de su tipo', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'hard');

        const result = await page.evaluate(() => {
            const g = window.__game;
            const types = g.BallRegistry.getTypes();

            // Forzar un desvío distinto y no nulo para cada tipo, de modo que
            // "todas juntas" y "cada tipo por su lado" sean distinguibles.
            const forced = {};
            types.forEach((type, i) => { forced[type] = (i + 1) * 0.02; });

            g.gameState.aimAngle = -Math.PI / 2;
            g.gameState.gameOver = false;
            g.gameState.balls = [];
            g.gameState.aimScatterOffsets = forced;

            // 3 bolas de cada tipo, intercaladas: si el desvío fuera por bola,
            // las 3 de un mismo tipo saldrían con ángulos distintos.
            const queue = [];
            for (let i = 0; i < 3; i++) queue.push(...types);
            g.gameState.ballsToShoot = queue.slice();

            const shot = [];
            for (let i = 0; i < queue.length; i++) {
                const type = g.gameState.ballsToShoot[0];
                g.game.shootNextBall();
                const ball = g.gameState.balls[g.gameState.balls.length - 1];
                shot.push({ type, angle: Math.atan2(ball.vy, ball.vx) });
            }

            const anglesByType = {};
            for (const { type, angle } of shot) {
                (anglesByType[type] = anglesByType[type] || []).push(angle);
            }
            return { anglesByType, forced, aim: g.gameState.aimAngle };
        });

        const seen = [];
        for (const [type, angles] of Object.entries(result.anglesByType)) {
            expect(angles).toHaveLength(3);
            // Todas las bolas del tipo, con el MISMO ángulo...
            for (const angle of angles) {
                expect(Math.abs(angle - angles[0]), `${type} debe salir todo junto`).toBeLessThan(1e-9);
            }
            // ...y ese ángulo es el apuntado más el desvío de SU tipo.
            expect(Math.abs(angles[0] - (result.aim + result.forced[type]))).toBeLessThan(1e-9);
            seen.push(angles[0]);
        }

        // Y los tipos entre sí salieron por lados distintos.
        expect(new Set(seen.map(a => a.toFixed(6))).size).toBe(seen.length);
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
                for (let turn = 0; turn < 300; turn++) {
                    g.gameState.aimScatterOffsets = g.game.rollAimScatter();
                    for (const type of g.BallRegistry.getTypes()) {
                        const angle = g.game.applyAimScatter(aim, type);
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
                for (let turn = 0; turn < 300; turn++) {
                    g.gameState.aimScatterOffsets = g.game.rollAimScatter();
                    for (const type of g.BallRegistry.getTypes()) {
                        worst = Math.max(worst, Math.abs(g.game.applyAimScatter(aim, type) - aim));
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
