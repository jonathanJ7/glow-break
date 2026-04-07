// @ts-check

/**
 * Touch helpers for driving the canvas through real TouchEvents.
 *
 * Playwright's `page.touchscreen` only exposes `tap()`, so for drag-to-aim
 * gestures, taps, and press-and-hold we synthesize the events ourselves
 * inside the page context. Coordinates are relative to the canvas' top-left
 * corner.
 */

/**
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} steps
 */
function buildSequence(from, to, steps) {
    const moves = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        moves.push({
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
        });
    }
    return moves;
}

/**
 * Inject a touch sequence into the page. Each step describes one of
 * touchstart / touchmove / touchend with absolute (canvas-relative) x/y.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {Array<{type: 'touchstart'|'touchmove'|'touchend', x: number, y: number}>} steps
 */
async function dispatchTouchSequence(page, selector, steps) {
    await page.evaluate(
        ({ selector, steps }) => {
            const canvas = /** @type {HTMLElement | null} */ (
                document.querySelector(selector)
            );
            if (!canvas) throw new Error(`Canvas not found: ${selector}`);

            const rect = canvas.getBoundingClientRect();

            for (const step of steps) {
                const clientX = rect.left + step.x;
                const clientY = rect.top + step.y;
                const touch = new Touch({
                    identifier: 1,
                    target: canvas,
                    clientX,
                    clientY,
                    pageX: clientX,
                    pageY: clientY,
                    radiusX: 2,
                    radiusY: 2,
                    force: 1,
                });

                const touchList = step.type === 'touchend' ? [] : [touch];
                const event = new TouchEvent(step.type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    touches: touchList,
                    targetTouches: touchList,
                    changedTouches: [touch],
                });
                canvas.dispatchEvent(event);
            }
        },
        { selector, steps }
    );
}

/**
 * Dispatch a full touch drag (start → moves → end) on a canvas element.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - CSS selector for the canvas to touch
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} [steps=12] - intermediate touchmove events
 */
export async function touchDrag(page, selector, from, to, steps = 12) {
    const moves = buildSequence(from, to, steps);
    /** @type {Array<{type: 'touchstart'|'touchmove'|'touchend', x: number, y: number}>} */
    const sequence = [{ type: 'touchstart', x: from.x, y: from.y }];
    for (const m of moves) sequence.push({ type: 'touchmove', x: m.x, y: m.y });
    sequence.push({ type: 'touchend', x: to.x, y: to.y });
    await dispatchTouchSequence(page, selector, sequence);
}

/**
 * Tap (touchstart + touchend with no movement) at a single point on a canvas.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{x: number, y: number}} pos
 */
export async function touchTap(page, selector, pos) {
    await dispatchTouchSequence(page, selector, [
        { type: 'touchstart', x: pos.x, y: pos.y },
        { type: 'touchend', x: pos.x, y: pos.y },
    ]);
}

/**
 * Press a single point and only fire touchstart. Caller must follow up with
 * `touchRelease` to complete the gesture. Useful for verifying mid-touch
 * state (e.g., the speed indicator while holding).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{x: number, y: number}} pos
 */
export async function touchPress(page, selector, pos) {
    await dispatchTouchSequence(page, selector, [
        { type: 'touchstart', x: pos.x, y: pos.y },
    ]);
}

/**
 * Release an in-progress touch with a final touchend at the given point.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{x: number, y: number}} pos
 */
export async function touchRelease(page, selector, pos) {
    await dispatchTouchSequence(page, selector, [
        { type: 'touchend', x: pos.x, y: pos.y },
    ]);
}
