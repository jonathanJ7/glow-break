// @ts-check

/**
 * Dispatches a real TouchEvent sequence on a canvas element. Playwright's
 * `page.touchscreen` only exposes `tap()`, so for drag-to-aim gestures we
 * synthesize the events ourselves inside the page context. Coordinates are
 * relative to the canvas' top-left corner.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - CSS selector for the canvas to touch
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} [steps=12] - intermediate touchmove events
 */
export async function touchDrag(page, selector, from, to, steps = 12) {
    await page.evaluate(
        ({ selector, from, to, steps }) => {
            const canvas = /** @type {HTMLElement | null} */ (
                document.querySelector(selector)
            );
            if (!canvas) throw new Error(`Canvas not found: ${selector}`);

            const rect = canvas.getBoundingClientRect();

            const fire = (type, x, y) => {
                const clientX = rect.left + x;
                const clientY = rect.top + y;
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

                const touchList = type === 'touchend' ? [] : [touch];
                const event = new TouchEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    touches: touchList,
                    targetTouches: touchList,
                    changedTouches: [touch],
                });
                canvas.dispatchEvent(event);
            };

            fire('touchstart', from.x, from.y);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = from.x + (to.x - from.x) * t;
                const y = from.y + (to.y - from.y) * t;
                fire('touchmove', x, y);
            }
            fire('touchend', to.x, to.y);
        },
        { selector, from, to, steps }
    );
}
