// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks } from './helpers/game.js';

/**
 * Fireball pass-through regression suite.
 *
 * Captures the observable semantics of the fireball ball type as a
 * BASELINE before Fase 4 of the OCP refactor (which moves the
 * fireball-specific branch out of physics.js into FireballBehavior.onCollision /
 * .onPostStep). The unit-style tests in here exercise the behavior directly
 * via the test hooks; the integration test plays through a real turn.
 *
 * Pre Fase 4:
 *   - The fireball semantics live half in FireballBehavior, half in
 *     physics.js (`if (isFireball) { ... }`).
 *   - FireballBehavior.onCollision does NOT return `passThrough: true`.
 *   - FireballBehavior.onPostStep is the no-op base; physics.js does the
 *     hitBricks cleanup inline.
 *
 * Post Fase 4:
 *   - The physics.js fireball branch is gone.
 *   - FireballBehavior.onCollision returns `passThrough: true`.
 *   - FireballBehavior.onPostStep cleans up state.hitBricks.
 *
 * The "damages once" and "integration turn advances" tests must stay GREEN
 * across the refactor — they are the regression net for the engine path.
 * The "passThrough" and "onPostStep cleanup" tests start RED and turn GREEN
 * once Fase 4 ships.
 */

test.describe('Fireball passthrough — behavior unit tests', () => {
    test('onCollision damages a brick on first hit', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fb = window.__game.BallRegistry.get('fireball');
            const ball = fb.createBall(0, 0, 0, 0);
            const brick = {
                x: 10, y: 10, width: 20, height: 20,
                hp: 5, maxHp: 5, type: 'normal',
            };
            const helpers = {
                getBrickColor: () => '#fff',
                createParticles: () => {},
                speedMultiplier: 5,
            };
            return fb.onCollision(ball, brick, {}, helpers);
        });
        expect(result.damage).toBe(1);
        expect(result.bounce).toBe(false);
    });

    test('onCollision does not double-damage the same brick', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fb = window.__game.BallRegistry.get('fireball');
            const ball = fb.createBall(0, 0, 0, 0);
            const brick = {
                x: 10, y: 10, width: 20, height: 20,
                hp: 5, maxHp: 5, type: 'normal',
            };
            const helpers = {
                getBrickColor: () => '#fff',
                createParticles: () => {},
                speedMultiplier: 5,
            };
            const r1 = fb.onCollision(ball, brick, {}, helpers);
            const r2 = fb.onCollision(ball, brick, {}, helpers);
            return { first: r1, second: r2, hitCount: ball.state.hitBricks.size };
        });
        expect(result.first.damage).toBe(1);
        expect(result.second.damage).toBe(0);
        expect(result.hitCount).toBe(1);
    });

    test('onCollision returns passThrough: true (Fase 4)', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fb = window.__game.BallRegistry.get('fireball');
            const ball = fb.createBall(0, 0, 0, 0);
            const brick = {
                x: 10, y: 10, width: 20, height: 20,
                hp: 5, maxHp: 5, type: 'normal',
            };
            const helpers = {
                getBrickColor: () => '#fff',
                createParticles: () => {},
                speedMultiplier: 5,
            };
            const fresh = fb.onCollision(ball, brick, {}, helpers);
            const repeat = fb.onCollision(ball, brick, {}, helpers);
            return { fresh, repeat };
        });
        expect(result.fresh.passThrough).toBe(true);
        expect(result.repeat.passThrough).toBe(true);
    });

    test('onPostStep removes hitBricks the ball has physically left (Fase 4)', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fb = window.__game.BallRegistry.get('fireball');
            const ball = fb.createBall(1000, 1000, 0, 0); // ball nowhere near any brick
            // Pretend the ball previously hit a brick at (10,10)
            ball.state.hitBricks.add('10,10');
            const gameState = {
                bricks: [{
                    x: 10, y: 10, width: 20, height: 20,
                    hp: 5, maxHp: 5, type: 'normal',
                }],
            };
            const helpers = { getBallRadius: () => 5 };
            fb.onPostStep(ball, gameState, helpers);
            return { hitBricksSize: ball.state.hitBricks.size };
        });
        expect(result.hitBricksSize).toBe(0);
    });

    test('onPostStep keeps hitBricks the ball still overlaps (Fase 4)', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const fb = window.__game.BallRegistry.get('fireball');
            // Position ball directly inside the brick
            const ball = fb.createBall(20, 20, 0, 0);
            ball.state.hitBricks.add('10,10');
            const gameState = {
                bricks: [{
                    x: 10, y: 10, width: 20, height: 20,
                    hp: 5, maxHp: 5, type: 'normal',
                }],
            };
            const helpers = { getBallRadius: () => 5 };
            fb.onPostStep(ball, gameState, helpers);
            return { hitBricksSize: ball.state.hitBricks.size };
        });
        expect(result.hitBricksSize).toBe(1);
    });
});

test.describe('Fireball passthrough — engine integration', () => {
    test('a turn with only a fireball in inventory still advances', async ({ page }) => {
        await loadGameWithHooks(page);
        // Start a real game
        await page.locator('.diff-chip[data-diff="easy"]').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await page.locator('#playBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await expect(page.locator('#ui')).toBeVisible({ timeout: 5_000 });

        // Force a fireball-only inventory
        await page.evaluate(() => {
            const gs = window.__game.gameState;
            gs.ballInventory.fireball = 1;
            gs.ballInventory.normal = 0;
            gs.ballInventory.splitter = 0;
            gs.ballInventory.strength = 0;
        });

        // Aim straight up and shoot via the launch indicator
        const canvas = page.locator('#gameCanvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('canvas has no bounding box');

        // Drag from middle bottom to middle top (straight-up aim)
        await page.evaluate(({ box }) => {
            const canvas = document.querySelector('#gameCanvas');
            const rect = canvas.getBoundingClientRect();
            const fromX = rect.left + box.width / 2;
            const fromY = rect.top + box.height - 20;
            const toX = rect.left + box.width / 2 + 1;
            const toY = rect.top + box.height * 0.25;

            const mk = (type, x, y) => {
                const t = new Touch({
                    identifier: 1, target: canvas,
                    clientX: x, clientY: y,
                    pageX: x, pageY: y,
                    radiusX: 2, radiusY: 2, force: 1,
                });
                const list = type === 'touchend' ? [] : [t];
                canvas.dispatchEvent(new TouchEvent(type, {
                    bubbles: true, cancelable: true, composed: true,
                    touches: list, targetTouches: list, changedTouches: [t],
                }));
            };
            mk('touchstart', fromX, fromY);
            for (let i = 1; i <= 10; i++) {
                const t = i / 10;
                mk('touchmove', fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
            }
            mk('touchend', toX, toY);
        }, { box });

        // Wait for skip button, then end turn fast
        await expect(page.locator('#skipBtn')).toBeVisible({ timeout: 5_000 });
        await page.locator('#skipBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await expect(page.locator('#skipBtn')).toBeHidden({ timeout: 5_000 });

        // Turn must have advanced
        const turn = await page.locator('#turnDisplay').textContent();
        expect(Number(turn)).toBeGreaterThanOrEqual(2);
    });
});
