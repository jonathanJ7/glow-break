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
