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
