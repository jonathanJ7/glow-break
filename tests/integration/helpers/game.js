// @ts-check
import { expect } from '@playwright/test';
import { touchDrag } from './touch.js';

/**
 * High-level game-flow helpers used by integration specs.
 *
 * Everything goes through real DOM events and reads only DOM state. No
 * imports from the game source. The whole point is that these helpers (and
 * the specs that use them) keep working across refactors as long as the
 * observable behavior — turn counter, ball counter, menu / UI / game-over
 * visibility, skip button — does not change.
 */

const CANVAS = '#gameCanvas';

/**
 * Load the PWA at `/` and assert the main menu is visible.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function loadGame(page) {
    await page.goto('/');
    await expect(page.locator('#mainMenu')).toBeVisible();
    await expect(page.locator('#ui')).toBeHidden();
}

/**
 * Set the "Empezar en turno" input to a specific starting turn. The input
 * is clamped 1..500 by the game itself.
 *
 * Uses page.evaluate to set the value and dispatch input/change events
 * directly on the element. The mobile soft-keyboard / native number input
 * combination races with the change handler when driven through
 * locator.fill on iPhone emulation, so this version mirrors what
 * "the user typed and tabbed away" does in the DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} turn
 */
export async function setStartingTurn(page, turn) {
    await page.evaluate((val) => {
        const input = /** @type {HTMLInputElement | null} */ (
            document.getElementById('startTurnInput')
        );
        if (!input) throw new Error('startTurnInput not found');
        input.value = String(val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, turn);
}

/**
 * Click a difficulty button to start a new game.
 *
 * Uses HTMLElement.click() via locator.evaluate so the test does not
 * depend on Playwright's hasTouch tap → synthetic click coupling, which
 * is unreliable when many tests run in parallel. The button's click
 * listener is the user-facing contract — that's still what we exercise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'easy'|'medium'|'hard'} difficulty
 */
export async function startGame(page, difficulty) {
    const btnId = difficulty === 'easy'
        ? '#easyBtn'
        : difficulty === 'medium'
            ? '#mediumBtn'
            : '#hardBtn';

    const btn = page.locator(btnId);
    await expect(btn).toBeVisible();
    await btn.evaluate((el) => /** @type {HTMLElement} */ (el).click());

    await expect(page.locator('#mainMenu')).toBeHidden({ timeout: 5_000 });
    await expect(page.locator('#ui')).toBeVisible({ timeout: 5_000 });
}

/**
 * Read the current turn from the on-screen turn counter.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function getTurn(page) {
    const text = await page.locator('#turnDisplay').textContent();
    return Number((text ?? '0').trim());
}

/**
 * Read the current ball count from the on-screen ball display.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function getBallCount(page) {
    const text = await page.locator('#ballDisplay').textContent();
    return Number((text ?? '0').trim());
}

/**
 * Returns true if the game-over overlay is currently visible.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function isGameOver(page) {
    return await page.locator('#gameOver').isVisible();
}

/**
 * Compute (from, to) for an aim drag based on the canvas bounding box.
 * `aimOffsetX` lets specs aim slightly off-vertical so the ball spreads
 * across columns and the game doesn't always feed the same column.
 *
 * @param {{ width: number, height: number }} box
 * @param {number} [aimOffsetX=40]
 */
export function aimVector(box, aimOffsetX = 40) {
    return {
        from: { x: box.width / 2, y: box.height - 20 },
        to: { x: box.width / 2 + aimOffsetX, y: box.height * 0.25 },
    };
}

/**
 * Drag-to-aim and release on the canvas. Resolves once the skip button
 * appears, which is the game's signal that shooting actually started.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [aimOffsetX]
 */
export async function aimAndShoot(page, aimOffsetX) {
    const canvas = page.locator(CANVAS);
    // Wait until the canvas is actually measurable. boundingBox() can return
    // null briefly even after the menu hides if the layout hasn't settled.
    await expect(canvas).toBeVisible();
    /** @type {{x:number,y:number,width:number,height:number} | null} */
    let box = null;
    await expect.poll(async () => {
        box = await canvas.boundingBox();
        return box && box.width > 0 && box.height > 0;
    }, { timeout: 5_000 }).toBeTruthy();
    if (!box) throw new Error('canvas has no bounding box');

    const { from, to } = aimVector(box, aimOffsetX);
    await touchDrag(page, CANVAS, from, to);

    await expect(page.locator('#skipBtn')).toBeVisible({ timeout: 5_000 });
}

/**
 * End the in-progress turn instantly via the skip button. Resolves once
 * the skip button hides itself again (which the game does inside endTurn).
 *
 * @param {import('@playwright/test').Page} page
 */
export async function skipTurn(page) {
    const btn = page.locator('#skipBtn');
    await expect(btn).toBeVisible();
    await btn.evaluate((el) => /** @type {HTMLElement} */ (el).click());
    await expect(btn).toBeHidden({ timeout: 5_000 });
}

/**
 * Play exactly one turn: aim, shoot, skip, then wait for the turn counter
 * to advance. Returns the new turn number, or null if the game ended
 * during this turn.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [aimOffsetX]
 */
export async function playTurn(page, aimOffsetX) {
    const startTurn = await getTurn(page);

    await aimAndShoot(page, aimOffsetX);
    await skipTurn(page);

    // After endTurn either the game-over overlay shows OR the turn counter
    // advances. Wait for whichever happens first.
    await expect
        .poll(async () => (await isGameOver(page)) || (await getTurn(page)) > startTurn,
            { timeout: 5_000 })
        .toBe(true);

    if (await isGameOver(page)) return null;
    return await getTurn(page);
}

/**
 * Play up to `count` turns. Stops early on game over. Returns the last
 * observed turn number (which may be less than start+count if the game
 * ended).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} count
 */
export async function playTurns(page, count) {
    let lastTurn = await getTurn(page);

    for (let i = 0; i < count; i++) {
        // Vary the aim offset turn by turn so the simulation is not stuck
        // shooting the exact same path every time. Numbers are arbitrary;
        // they only need to span both sides of vertical.
        const offset = ((i % 5) - 2) * 30;
        const next = await playTurn(page, offset);
        if (next === null) break;
        lastTurn = next;
    }

    return lastTurn;
}
