// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, setStartingTurn, startGame } from './helpers/game.js';

/**
 * Rendimiento (v2.15.1): el juego se ponía lento a los pocos niveles en
 * celulares de alta gama. Causas, todas cubiertas acá:
 *  - shadowBlur en vivo por cada bola especial, bonus, zona débil (todos los
 *    bloques), caparazón... crece con los turnos. Ahora son halos
 *    pre-dibujados (js/ui/Glow.js).
 *  - getWidth()/getHeight() llamaban a getBoundingClientRect() cientos de
 *    veces por cuadro. Ahora el tamaño se cachea en resizeCanvas.
 *  - El canvas se rasterizaba a DPR 3; ahora tiene tope CANVAS_MAX_DPR.
 */
test.describe('Glow-Break - rendimiento', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const w = /** @type {any} */ (window);
            w.__perf = { blurSets: 0, containerRects: 0 };
            const blur = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
            Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
                get() { return blur.get.call(this); },
                set(v) {
                    // Solo cuenta el canvas del juego (las cachés fuera de
                    // pantalla pueden usar shadowBlur: se dibujan una vez)
                    if (v > 0 && this.canvas && this.canvas.id === 'gameCanvas') w.__perf.blurSets++;
                    blur.set.call(this, v);
                },
            });
            const rect = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = function () {
                if (this.id === 'gameContainer') w.__perf.containerRects++;
                return rect.call(this);
            };
        });
    });

    test('un turno con muchas bolas especiales no usa shadowBlur por entidad ni mide el DOM por cuadro', async ({ page }) => {
        await loadGameWithHooks(page);
        await setStartingTurn(page, 40);
        await startGame(page, 'medium');

        const r = await page.evaluate(async () => {
            const w = /** @type {any} */ (window);
            const g = w.__game;
            const gs = g.gameState;
            gs.ballInventory = { normal: 20, fireball: 10, splitter: 10, strength: 10, bomb: 10 };
            gs.overdriveActive = true;   // anillo dorado en cada bola
            gs.eraBanner = null;
            gs.aimAngle = -Math.PI / 2 + 0.3;
            g.game.startShooting();

            // Esperar a que haya bolas en vuelo y medir ~40 cuadros
            await new Promise(res => setTimeout(res, 1200));
            w.__perf.blurSets = 0;
            w.__perf.containerRects = 0;
            let frames = 0;
            let maxActive = 0;
            await new Promise(res => {
                const tick = () => {
                    frames++;
                    maxActive = Math.max(maxActive, gs.balls.filter(b => b.active).length);
                    if (frames < 40) requestAnimationFrame(tick); else res(null);
                };
                requestAnimationFrame(tick);
            });
            return { ...w.__perf, frames, maxActive, bricks: gs.bricks.length };
        });

        expect(r.maxActive).toBeGreaterThan(10);
        expect(r.bricks).toBeGreaterThan(5);
        // Antes: decenas por cuadro (una por bola especial, anillo y bloque).
        // Quedan solo efectos únicos (láser, marco de overdrive): pocos.
        expect(r.blurSets / r.frames).toBeLessThan(3);
        // El tamaño del contenedor está cacheado: no se mide por cuadro
        expect(r.containerRects).toBe(0);
    });

    test('el canvas tiene tope de resolución y sigue el tamaño de la pantalla al girar', async ({ page }) => {
        await loadGameWithHooks(page);
        await startGame(page, 'medium');

        const before = await page.evaluate(() => {
            const { rendering: rd, config: c } = /** @type {any} */ (window).__game;
            return {
                dpr: window.devicePixelRatio,
                max: c.CANVAS_MAX_DPR,
                canvasW: rd.canvas.width,
                cssW: rd.getWidth(),
            };
        });
        expect(before.dpr).toBeGreaterThan(before.max); // iPhone 13: DPR 3
        expect(before.canvasW).toBe(Math.round(before.cssW * before.max));

        await page.setViewportSize({ width: 360, height: 600 });
        await expect.poll(() => page.evaluate(() =>
            /** @type {any} */ (window).__game.rendering.getWidth()
        )).toBe(360);
    });
});
