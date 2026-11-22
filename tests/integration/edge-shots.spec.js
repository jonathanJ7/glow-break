// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Tiros al borde de un bloque.
 *
 * 1. Ángulo mínimo tras una esquina (MIN_BOUNCE_ANGLE): una esquina ya no
 *    puede devolver la bola casi plana. Antes era el mejor tiro siempre:
 *    la bola quedaba rebotando de lado a lado muchísimo tiempo.
 * 2. Zona débil: TODOS los bloques tienen una cara marcada que recibe ×3 de
 *    los golpes de bola, así que el ángulo óptimo depende del tablero.
 */

const DEG = Math.PI / 180;

test.describe('Ángulo mínimo tras rebotar en una esquina', () => {
    test('clampMinBounceAngle endereza solo lo que está por debajo del mínimo', async ({ page }) => {
        await loadGameWithHooks(page);

        const r = await page.evaluate(() => {
            const { clampMinBounceAngle } = window.__game.collision;
            const min = window.__game.config.MIN_BOUNCE_ANGLE;
            const angleOf = (v) => Math.atan2(Math.abs(v.vy), Math.abs(v.vx));
            const flat = clampMinBounceAngle(-10 * Math.cos(0.03), -10 * Math.sin(0.03));
            const steep = clampMinBounceAngle(3, -9);
            const horizontalDown = clampMinBounceAngle(10, 0, 0.7, 0.7);
            return {
                min,
                flatAngle: angleOf(flat),
                flatSpeed: Math.hypot(flat.vx, flat.vy),
                flatSigns: [Math.sign(flat.vx), Math.sign(flat.vy)],
                steep,
                horizontalDownVy: horizontalDown.vy,
            };
        });

        expect(r.min).toBeCloseTo(15 * DEG, 6);
        expect(r.flatAngle).toBeCloseTo(r.min, 6);
        expect(r.flatSpeed).toBeCloseTo(10, 6);
        // Mantiene el sentido: seguía yendo a la izquierda y hacia arriba
        expect(r.flatSigns).toEqual([-1, -1]);
        // Una salida empinada no se toca
        expect(r.steep).toEqual({ vx: 3, vy: -9 });
        // Horizontal exacta: el sentido vertical sale de la normal
        expect(r.horizontalDownVy).toBeGreaterThan(0);
    });

    test('física y mira: ninguna esquina devuelve la bola por debajo del mínimo', async ({ page }) => {
        await loadGameWithHooks(page);

        const r = await page.evaluate(() => {
            const { processPhysicsStep, simulateTrajectory, reflectVelocity, findFirstCollision } = window.__game.collision;
            const min = window.__game.config.MIN_BOUNCE_ANGLE;
            const brick = { x: 100, y: 100, width: 36, height: 36, hp: 1000, maxHp: 1000, col: 0, type: 'normal' };
            const bounds = { left: 0, right: 400, top: 0, bottom: 600 };
            const radius = 5;
            const speed = 10;
            const angleOf = (vx, vy) => Math.atan2(Math.abs(vy), Math.abs(vx));

            let cornerHits = 0;
            let wouldBeFlat = 0;
            let worstPhysics = Infinity;
            let worstAim = Infinity;

            // Barrido: bolas subiendo con muchos ángulos y posiciones hacia la
            // esquina inferior izquierda del bloque
            for (let a = 20; a <= 160; a += 2) {
                const ang = -a * Math.PI / 180;
                for (let dx = -12; dx <= 12; dx += 0.5) {
                    const vx = Math.cos(ang) * speed;
                    const vy = Math.sin(ang) * speed;
                    // Partimos un poco antes de la esquina, sobre la recta que la roza
                    const sx = 100 + dx - vx * 3;
                    const sy = 140 - vy * 3;
                    const pre = findFirstCollision(sx, sy, vx * 4, vy * 4, radius, [brick], bounds);
                    if (!pre || pre.side !== 'corner') continue;
                    cornerHits++;
                    const pure = reflectVelocity(vx, vy, pre.normalX, pre.normalY);
                    if (angleOf(pure.vx, pure.vy) < min) wouldBeFlat++;

                    let ball = { x: sx, y: sy, vx, vy };
                    for (let i = 0; i < 4; i++) {
                        const res = processPhysicsStep(ball, radius, [brick], bounds, () => ({ shouldBounce: true, damage: 0 }));
                        const hit = res.collisions.find(c => c.collision.side === 'corner');
                        ball = { x: res.newX, y: res.newY, vx: res.newVx, vy: res.newVy };
                        if (hit) {
                            worstPhysics = Math.min(worstPhysics, angleOf(res.newVx, res.newVy));
                            break;
                        }
                    }

                    const pts = simulateTrajectory(sx, sy, ang, speed, radius, [brick], bounds, 1, 400);
                    const iCorner = pts.findIndex(p => p.side === 'corner');
                    if (iCorner > 0 && pts[iCorner + 1]) {
                        const p0 = pts[iCorner];
                        const p1 = pts[iCorner + 1];
                        worstAim = Math.min(worstAim, angleOf(p1.x - p0.x, p1.y - p0.y));
                    }
                }
            }
            return { min, cornerHits, wouldBeFlat, worstPhysics, worstAim };
        });

        expect(r.cornerHits).toBeGreaterThan(20);
        // Sin la corrección varias de estas salidas habrían sido planas...
        expect(r.wouldBeFlat).toBeGreaterThan(0);
        // ...con ella ninguna baja del mínimo, ni en la física ni en la mira
        expect(r.worstPhysics).toBeGreaterThanOrEqual(r.min - 1e-6);
        // (la mira se mide entre puntos dibujados: el empujón de 0,5px
        // anti-atasco tras el rebote mete hasta ~0,3° de error de medición)
        expect(r.worstAim).toBeGreaterThanOrEqual(r.min - 0.5 * Math.PI / 180);
    });

    test('getHitFaces: una cara para un impacto de cara, dos para una esquina', async ({ page }) => {
        await loadGameWithHooks(page);
        const r = await page.evaluate(() => {
            const { getHitFaces } = window.__game.collision;
            return {
                face: getHitFaces({ side: 'left', normalX: -1, normalY: 0 }),
                corner: getHitFaces({ side: 'corner', normalX: -0.6, normalY: 0.8 }),
                wall: getHitFaces({ side: 'wall-left', normalX: 1, normalY: 0 }),
            };
        });
        expect(r.face).toEqual(['left']);
        expect(r.corner).toEqual(['left', 'bottom']);
        expect(r.wall).toEqual([]);
    });
});

test.describe('Zona débil (todos los bloques)', () => {
    test('la cara débil recibe ×3 de bola; otras caras y el área, daño normal', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const r = await page.evaluate(() => {
            const { physics, config } = window.__game;
            const make = (type) => ({ x: 50, y: 50, width: 36, height: 36, hp: 100, maxHp: 100, col: 1, type, weakSide: 'left' });
            const a = make('normal'); physics.damageBrick(a, 2, 'ball', ['left']);
            const b = make('normal'); physics.damageBrick(b, 2, 'ball', ['right']);
            const c = make('normal'); physics.damageBrick(c, 2, 'ball', ['left', 'bottom']);
            const d = make('normal'); physics.damageBrick(d, 2, 'bomb');
            const e = make('armored'); physics.damageBrick(e, 4, 'ball', ['left']);
            return { mult: config.WEAK_SPOT.multiplier, a: a.hp, b: b.hp, c: c.hp, d: d.hp, e: e.hp };
        });

        expect(r.mult).toBe(3);
        expect(r.a).toBe(100 - 2 * 3);
        expect(r.b).toBe(98);
        expect(r.c).toBe(100 - 2 * 3); // esquina pegada a la cara débil
        expect(r.d).toBe(98);
        expect(r.e).toBe(100 - 4 * 0.5 * 3); // blindado: primero el tipo, después la zona débil
    });

    test('todo bloque nace con cara débil (jefes y spawner incluidos) y se guarda', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const r = await page.evaluate(() => {
            const { game, gameState, weakSpots } = window.__game;
            const sides = new Set();
            for (let i = 0; i < 200; i++) sides.add(weakSpots.rollWeakSide());
            const { config } = window.__game;
            for (let t = 10; t <= 30; t++) { gameState.turn = t; game.generateNewRow(); }
            gameState.turn = config.BOSS_INTERVAL;
            game.generateNewRow();
            const hasBoss = gameState.bricks.some(b => b.type === 'boss');
            const allHave = hasBoss && gameState.bricks.length > 0
                && gameState.bricks.every(b => weakSpots.WEAK_FACES.includes(b.weakSide));
            gameState.bricks[0].weakSide = 'top';
            game.saveGame();
            const save = JSON.parse(localStorage.getItem('glowbreak_save'));
            return { sides: [...sides].sort(), allHave, savedSide: save.bricks[0].weakSide };
        });

        expect(r.sides).toEqual(['bottom', 'left', 'right', 'top']);
        expect(r.allHave).toBe(true);
        expect(r.savedSide).toBe('top');
    });

    test('un guardado sin caras débiles las recibe al reanudar', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const r = await page.evaluate(() => {
            const { game, gameState, weakSpots } = window.__game;
            game.saveGame();
            const save = JSON.parse(localStorage.getItem('glowbreak_save'));
            for (const b of save.bricks) delete b.weakSide;
            localStorage.setItem('glowbreak_save', JSON.stringify(save));
            game.resumeGame();
            return gameState.bricks.length > 0
                && gameState.bricks.every(b => weakSpots.WEAK_FACES.includes(b.weakSide));
        });

        expect(r).toBe(true);
    });

    test('la física real aplica el ×3 al pegarle a la cara débil', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'easy');

        const r = await page.evaluate(() => {
            const { gameState, physics, rendering } = window.__game;
            const cell = rendering.getCellSize();
            const left = rendering.getLeftBorder();
            const top = rendering.getTopOffset();
            const make = (weakSide) => ({
                x: left + 3 * cell, y: top + 3 * cell, width: cell - 4, height: cell - 4,
                hp: 1000, maxHp: 1000, col: 3, type: 'normal', weakSide
            });
            const hitFromBelow = (brick) => {
                gameState.bricks = [brick];
                gameState.bonuses = [];
                gameState.overdriveActive = false;
                gameState.balls = [{
                    x: brick.x + cell / 2, y: brick.y + cell + 20, vx: 0, vy: -10,
                    active: true, hasGoneUp: true, ballType: 'normal', damage: 1, state: {}
                }];
                gameState.isShooting = false;
                for (let i = 0; i < 5; i++) physics.updateBalls();
                return brick.hp;
            };
            return { weak: hitFromBelow(make('bottom')), other: hitFromBelow(make('top')) };
        });

        expect(r.weak).toBe(1000 - 3);
        expect(r.other).toBe(1000 - 1);
    });
});
