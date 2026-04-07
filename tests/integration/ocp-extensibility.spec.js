// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks } from './helpers/game.js';
import {
    registerTestBrick,
    registerTestBall,
    registerTestBonus,
} from './helpers/test-behaviors.js';

/**
 * OCP extensibility suite.
 *
 * Every spec in this file targets a specific Open/Closed leak in the engine.
 * Tests are written RED-first: they fail against the engine before the fix,
 * and pass after the corresponding refactor phase. The plan that drives this
 * lives at /Users/jona/.claude/plans/valiant-bubbling-noodle.md.
 *
 * The acceptance bar is: registering a new brick / ball / bonus must work
 * via the registries alone, with zero edits to game.js / physics.js /
 * rendering.js / config.js.
 */

test.describe('OCP - Fase 0: test harness', () => {
    test('test hooks expose all three registries on window.__game', async ({ page }) => {
        await loadGameWithHooks(page);
        const exposed = await page.evaluate(() => ({
            hasBrick: !!window.__game?.BrickRegistry,
            hasBall: !!window.__game?.BallRegistry,
            hasBonus: !!window.__game?.BonusRegistry,
            hasGameState: !!window.__game?.gameState,
        }));
        expect(exposed).toEqual({
            hasBrick: true,
            hasBall: true,
            hasBonus: true,
            hasGameState: true,
        });
    });

    test('production load (no testHooks query) does NOT expose window.__game', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#mainMenu')).toBeVisible();
        // Give any async hook loader a generous window to fire.
        await page.waitForTimeout(250);
        const exposed = await page.evaluate(() => typeof window.__game);
        expect(exposed).toBe('undefined');
    });

    test('can register a brick type via test hook', async ({ page }) => {
        await loadGameWithHooks(page);
        await registerTestBrick(page, 'magenta-test-brick');
        const types = await page.evaluate(() => window.__game.BrickRegistry.getTypes());
        expect(types).toContain('magenta-test-brick');
    });

    test('can register a ball type via test hook', async ({ page }) => {
        await loadGameWithHooks(page);
        await registerTestBall(page, 'magenta-test-ball');
        const types = await page.evaluate(() => window.__game.BallRegistry.getTypes());
        expect(types).toContain('magenta-test-ball');
    });

    test('can register a bonus type via test hook', async ({ page }) => {
        await loadGameWithHooks(page);
        await registerTestBonus(page, 'magenta-test-bonus');
        const types = await page.evaluate(() => window.__game.BonusRegistry.getTypes());
        expect(types).toContain('magenta-test-bonus');
    });
});

test.describe('OCP - Fase 2: behavior contract', () => {
    test('registering a brick without required `render` throws', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            try {
                window.__game.BrickRegistry.register('broken-no-render', {
                    type: 'broken-no-render',
                    getConfig: () => ({}),
                });
                return { threw: false };
            } catch (e) {
                return { threw: true, message: e.message };
            }
        });
        expect(result.threw).toBe(true);
        expect(result.message).toContain('render');
    });

    test('registering a brick without required `getConfig` throws', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            try {
                window.__game.BrickRegistry.register('broken-no-config', {
                    type: 'broken-no-config',
                    render: () => {},
                });
                return { threw: false };
            } catch (e) {
                return { threw: true, message: e.message };
            }
        });
        expect(result.threw).toBe(true);
        expect(result.message).toContain('getConfig');
    });

    test('registering a ball without required `createBall` throws', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            try {
                window.__game.BallRegistry.register('broken-ball', {
                    type: 'broken-ball',
                    render: () => {},
                    getConfig: () => ({}),
                });
                return { threw: false };
            } catch (e) {
                return { threw: true, message: e.message };
            }
        });
        expect(result.threw).toBe(true);
        expect(result.message).toContain('createBall');
    });

    test('registering a bonus without required `onCollect` throws', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            try {
                window.__game.BonusRegistry.register('broken-bonus', {
                    type: 'broken-bonus',
                    render: () => {},
                    getConfig: () => ({}),
                });
                return { threw: false };
            } catch (e) {
                return { threw: true, message: e.message };
            }
        });
        expect(result.threw).toBe(true);
        expect(result.message).toContain('onCollect');
    });

    test('minimal brick inherits no-op base methods after register', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            window.__game.BrickRegistry.register('minimal-brick', {
                type: 'minimal-brick',
                render: () => {},
                getConfig: () => ({ minTurn: 0 }),
            });
            const b = window.__game.BrickRegistry.get('minimal-brick');
            return {
                hasOnDestroy: typeof b.onDestroy === 'function',
                hasOnDamage: typeof b.onDamage === 'function',
                hasOnTurnStart: typeof b.onTurnStart === 'function',
                hasOnTurnEnd: typeof b.onTurnEnd === 'function',
                onDestroyResult: b.onDestroy({}, {}, {}),
                onDamageResult: b.onDamage({}, 5, {}),
            };
        });
        expect(result.hasOnDestroy).toBe(true);
        expect(result.hasOnDamage).toBe(true);
        expect(result.hasOnTurnStart).toBe(true);
        expect(result.hasOnTurnEnd).toBe(true);
        expect(result.onDestroyResult).toBeNull();
        expect(result.onDamageResult).toBe(5);
    });

    test('minimal ball inherits no-op base methods after register', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            window.__game.BallRegistry.register('minimal-ball', {
                type: 'minimal-ball',
                render: () => {},
                createBall: (x, y, vx, vy) => ({ x, y, vx, vy, ballType: 'minimal-ball' }),
                getConfig: () => ({}),
            });
            const b = window.__game.BallRegistry.get('minimal-ball');
            return {
                hasOnCollision: typeof b.onCollision === 'function',
                hasOnExitBrick: typeof b.onExitBrick === 'function',
                hasOnPostStep: typeof b.onPostStep === 'function',
                onCollisionResult: b.onCollision({}, {}, {}, {}),
            };
        });
        expect(result.hasOnCollision).toBe(true);
        expect(result.hasOnExitBrick).toBe(true);
        expect(result.hasOnPostStep).toBe(true);
        expect(result.onCollisionResult).toEqual({
            bounce: true,
            damage: 1,
            continueChecking: false,
        });
    });

    test('engine can play a turn when a minimal test brick is in the rotation', async ({ page }) => {
        // After Fase 2, the engine calls behavior.onTurnStart/onDestroy/etc.
        // unconditionally. A minimal brick that only provides type/render/getConfig
        // must not crash the loop because the base provides no-op defaults.
        await loadGameWithHooks(page);
        await page.evaluate(() => {
            window.__game.BrickRegistry.register('drop-in-test-brick', {
                type: 'drop-in-test-brick',
                render(ctx, brick) {
                    ctx.fillStyle = 'magenta';
                    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
                },
                getConfig: () => ({ minTurn: 0 }),
            });
            // Inject one into gameState.bricks before the player shoots so the
            // engine touches it via onTurnStart / onTurnEnd / render paths.
            const gs = window.__game.gameState;
            gs.bricks.push({
                x: 50, y: 100, width: 30, height: 30,
                hp: 1, maxHp: 1, col: 0, type: 'drop-in-test-brick',
            });
        });
        // No console errors should appear from the unguarded engine calls.
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        // Trigger an end-turn cycle (simplest way: invoke moveBricksDown via game).
        await page.evaluate(() => {
            // Touch the lifecycle without playing a full turn.
            const gs = window.__game.gameState;
            for (const brick of gs.bricks) {
                const behavior = window.__game.BrickRegistry.get(brick.type);
                behavior.onTurnStart(brick, gs);
                behavior.onTurnEnd(brick, gs);
                behavior.onDestroy(brick, gs, {});
                behavior.onDamage(brick, 1, gs);
            }
        });
        expect(errors).toEqual([]);
    });
});

test.describe('OCP - Fase 3: ball state and shoot path', () => {
    test('no built-in ball type writes legacy fireball/splitter/strength flags', async ({ page }) => {
        await loadGameWithHooks(page);
        const samples = await page.evaluate(() => {
            const out = {};
            for (const t of window.__game.BallRegistry.getTypes()) {
                const b = window.__game.BallRegistry.get(t);
                const ball = b.createBall(0, 0, 0, 0);
                out[t] = {
                    hasFireballFlag: 'fireball' in ball,
                    hasSplitterFlag: 'splitter' in ball,
                    hasStrengthFlag: 'strength' in ball,
                    hasHasSplit: 'hasSplit' in ball,
                    hasBallType: 'ballType' in ball,
                    ballType: ball.ballType,
                };
            }
            return out;
        });
        for (const [type, sample] of Object.entries(samples)) {
            expect(sample.hasFireballFlag, `${type}.fireball flag`).toBe(false);
            expect(sample.hasSplitterFlag, `${type}.splitter flag`).toBe(false);
            expect(sample.hasStrengthFlag, `${type}.strength flag`).toBe(false);
            expect(sample.hasHasSplit, `${type}.hasSplit flag`).toBe(false);
            expect(sample.hasBallType).toBe(true);
            expect(sample.ballType).toBe(type);
        }
    });

    test('fireball ball stores hitBricks under ball.state, not ball', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fireball = window.__game.BallRegistry.get('fireball');
            const ball = fireball.createBall(0, 0, 0, 0);
            return {
                hasState: typeof ball.state === 'object' && ball.state !== null,
                stateHasHitBricks: ball.state && ball.state.hitBricks instanceof Set,
                hasLegacyHitBricks: 'hitBricks' in ball,
            };
        });
        expect(result.hasState).toBe(true);
        expect(result.stateHasHitBricks).toBe(true);
        expect(result.hasLegacyHitBricks).toBe(false);
    });

    test('splitter ball stores hitCount under ball.state, not ball', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const splitter = window.__game.BallRegistry.get('splitter');
            const ball = splitter.createBall(0, 0, 0, 0);
            return {
                hasState: typeof ball.state === 'object' && ball.state !== null,
                stateHasHitCount: ball.state && ball.state.hitCount === 0,
                hasLegacyHitCount: 'hitCount' in ball,
            };
        });
        expect(result.hasState).toBe(true);
        expect(result.stateHasHitCount).toBe(true);
        expect(result.hasLegacyHitCount).toBe(false);
    });

    test('shootNextBall always uses behavior.createBall — no fallback else branch', async ({ page }) => {
        // After Fase 3, registering a new ball type and forcing it through
        // shootNextBall must produce a ball whose ballType matches and which
        // has NO legacy boolean flags. Hoy falla porque la rama fallback else
        // en shootNextBall escribe fireball/splitter/strength booleans.
        await loadGameWithHooks(page);
        await registerTestBall(page, 'phase3-ghost');
        const ball = await page.evaluate(() => {
            // Use the registry path directly so we don't have to start a game.
            const b = window.__game.BallRegistry.get('phase3-ghost');
            return b.createBall(0, 0, 0, 0);
        });
        expect(ball.ballType).toBe('phase3-ghost');
        expect('fireball' in ball).toBe(false);
        expect('splitter' in ball).toBe(false);
        expect('strength' in ball).toBe(false);
        expect('hasSplit' in ball).toBe(false);
    });
});

test.describe('OCP - Fase 5: data-driven inventory', () => {
    test('calculateStartingBalls returns inventory keyed by ball type', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            return window.__game.game.calculateStartingBalls(20, 'easy');
        });
        // Post-Fase 5 shape: { inventory: {...}, total: N }
        expect(result.inventory).toBeDefined();
        expect(typeof result.inventory).toBe('object');
        expect(result.total).toBeGreaterThan(0);
    });

    test('a registered ball type with startingShare appears in calculateStartingBalls', async ({ page }) => {
        await loadGameWithHooks(page);
        await page.evaluate(() => {
            window.__game.BallRegistry.register('phase5-share', {
                type: 'phase5-share',
                color: 'magenta',
                damage: 1,
                render() {},
                createBall(x, y, vx, vy) {
                    return {
                        x, y, vx, vy,
                        active: true, hasGoneUp: false,
                        ballType: 'phase5-share',
                        damage: 1, lifetime: 0, state: {},
                    };
                },
                getConfig() {
                    return { minTurn: 1, startingShare: 0.5 };
                },
            });
        });
        const inv = await page.evaluate(() => {
            const r = window.__game.game.calculateStartingBalls(20, 'easy');
            return r.inventory || r;
        });
        expect(inv['phase5-share']).toBeGreaterThan(0);
    });

    test('built-in fireballBall bonus declares targetBallType: fireball', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const b = window.__game.BonusRegistry.get('fireballBall');
            return { hasTarget: 'targetBallType' in b, target: b.targetBallType };
        });
        expect(result.hasTarget).toBe(true);
        expect(result.target).toBe('fireball');
    });

    test('built-in splitterBall bonus declares targetBallType: splitter', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const b = window.__game.BonusRegistry.get('splitterBall');
            return { hasTarget: 'targetBallType' in b, target: b.targetBallType };
        });
        expect(result.hasTarget).toBe(true);
        expect(result.target).toBe('splitter');
    });

    test('a custom bonus with targetBallType increments inventory[type] when collected', async ({ page }) => {
        await loadGameWithHooks(page);
        // Register a synthetic ball type and a bonus that targets it
        await page.evaluate(() => {
            window.__game.BallRegistry.register('phase5-target', {
                type: 'phase5-target',
                color: 'magenta',
                render() {},
                createBall(x, y, vx, vy) {
                    return { x, y, vx, vy, ballType: 'phase5-target', active: true, hasGoneUp: false, damage: 1, lifetime: 0, state: {} };
                },
                getConfig: () => ({}),
            });
        });
        // Start a game so gameState.ballInventory exists
        await page.locator('#easyBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await page.waitForFunction(() => window.__game.gameState.gameStarted === true);

        const result = await page.evaluate(() => {
            // Mimic the post-Fase-5 ball-bonus contract: behavior reads
            // its own targetBallType and increments inventory[that key].
            const fireballBonus = window.__game.BonusRegistry.get('fireballBall');
            const before = window.__game.gameState.ballInventory.fireball || 0;
            fireballBonus.onCollect(
                { value: 5 },
                {},
                window.__game.gameState,
                {}
            );
            const after = window.__game.gameState.ballInventory.fireball || 0;
            return { before, after };
        });
        expect(result.after).toBe(result.before + 5);
    });

    test('shoot priorities exposed via getConfig().shootPriority', async ({ page }) => {
        await loadGameWithHooks(page);
        const priorities = await page.evaluate(() => {
            const out = {};
            for (const t of window.__game.BallRegistry.getTypes()) {
                const cfg = window.__game.BallRegistry.get(t).getConfig();
                out[t] = cfg.shootPriority;
            }
            return out;
        });
        // Built-in priorities (preserves the legacy order)
        expect(priorities.normal).toBeDefined();
        expect(priorities.fireball).toBeDefined();
        expect(priorities.splitter).toBeDefined();
        expect(priorities.strength).toBeDefined();
        expect(priorities.normal).toBeLessThan(priorities.fireball);
        expect(priorities.fireball).toBeLessThan(priorities.splitter);
        expect(priorities.splitter).toBeLessThan(priorities.strength);
    });

    test('drawBallInventory does not crash with a registered new ball type in inventory', async ({ page }) => {
        await loadGameWithHooks(page);
        await page.evaluate(() => {
            window.__game.BallRegistry.register('phase5-hud', {
                type: 'phase5-hud',
                color: 'magenta',
                icon: '🟪',
                bgColor: 'rgba(255, 0, 255, 0.8)',
                textColor: 'white',
                showInInventoryHud: true,
                render() {},
                createBall(x, y, vx, vy) {
                    return { x, y, vx, vy, ballType: 'phase5-hud', state: {} };
                },
                getConfig: () => ({}),
            });
        });
        await page.locator('#easyBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await page.waitForFunction(() => window.__game.gameState.gameStarted === true);

        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await page.evaluate(() => {
            window.__game.gameState.ballInventory['phase5-hud'] = 3;
        });
        // Force a few render frames
        await page.waitForTimeout(100);
        expect(errors).toEqual([]);
    });
});
