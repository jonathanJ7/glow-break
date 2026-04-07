// @ts-check

/**
 * Factories that register fake "test" behaviors against the live registries
 * via Playwright's `page.evaluate`.
 *
 * The behavior objects must be constructed inside the browser context (so
 * their methods can close over canvas helpers and the real registries), so
 * each helper takes a `page`, ships a small piece of plain data over the
 * wire, and rebuilds the behavior browser-side.
 *
 * Used by `tests/integration/ocp-extensibility.spec.js` to drive the
 * Open/Closed acceptance tests across the refactor phases.
 */

/**
 * Register a magenta test brick.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @param {{ minTurn?: number, configKey?: string|null, baseChance?: number }} [opts]
 */
export async function registerTestBrick(page, type, opts = {}) {
    await page.evaluate(({ type, opts }) => {
        const behavior = {
            type,
            emoji: '🟪',
            render(ctx, brick) {
                ctx.fillStyle = 'magenta';
                ctx.fillRect(brick.x + 2, brick.y + 2, brick.width, brick.height);
            },
            onDestroy() { return null; },
            onDamage(b, d) { return d; },
            onTurnStart() {},
            onTurnEnd() {},
            getConfig() {
                return {
                    minTurn: opts.minTurn ?? 0,
                    category: 'helpful',
                    configKey: opts.configKey ?? null,
                    baseChance: opts.baseChance ?? 0,
                };
            },
        };
        window.__game.BrickRegistry.register(type, behavior);
    }, { type, opts });
}

/**
 * Register a magenta test ball.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @param {{ minTurn?: number, inventoryKey?: string }} [opts]
 */
export async function registerTestBall(page, type, opts = {}) {
    await page.evaluate(({ type, opts }) => {
        const behavior = {
            type,
            color: 'magenta',
            damage: 1,
            render(ctx, ball, helpers) {
                ctx.fillStyle = 'magenta';
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, helpers.getBallRadius(), 0, Math.PI * 2);
                ctx.fill();
            },
            onCollision() {
                return { bounce: true, damage: 1, continueChecking: false };
            },
            createBall(x, y, vx, vy) {
                return {
                    x, y, vx, vy,
                    active: true,
                    hasGoneUp: false,
                    ballType: type,
                    damage: 1,
                    hitBricks: null,
                    lifetime: 0,
                };
            },
            getConfig() {
                return {
                    minTurn: opts.minTurn ?? 0,
                    inventoryKey: opts.inventoryKey ?? type,
                };
            },
        };
        window.__game.BallRegistry.register(type, behavior);
    }, { type, opts });
}

/**
 * Register a magenta test bonus.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @param {{ minTurn?: number, category?: 'ball'|'powerup' }} [opts]
 */
export async function registerTestBonus(page, type, opts = {}) {
    await page.evaluate(({ type, opts }) => {
        const behavior = {
            type,
            color: 'magenta',
            icon: '🟪',
            render(ctx, bonus) {
                ctx.fillStyle = 'magenta';
                ctx.beginPath();
                ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
                ctx.fill();
            },
            onCollect() { return null; },
            getText() { return ''; },
            getConfig() {
                return {
                    minTurn: opts.minTurn ?? 0,
                    category: opts.category ?? 'powerup',
                };
            },
        };
        window.__game.BonusRegistry.register(type, behavior);
    }, { type, opts });
}
