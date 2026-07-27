// @ts-check
import { test, expect } from '@playwright/test';
import { loadGame, loadGameWithHooks } from './helpers/game.js';

/**
 * Behavior covered:
 *  - The game guide opens from the main menu button and closes with the
 *    back button, returning to the menu.
 *  - The guide content is generated from the live registries: EVERY
 *    registered brick, ball and bonus type appears by its displayName
 *    (fallback: type key). This keeps the guide honest — a new type
 *    registered without guide info would fail here.
 *  - Key exact numbers from config appear verbatim (spot checks), so the
 *    guide can't silently drift into vagueness.
 */

test.describe('Glow-Break - game guide', () => {
    test('guide opens from the menu and closes with the back button', async ({ page }) => {
        await loadGame(page);

        const guideBtn = page.locator('#guideBtn');
        await expect(guideBtn).toBeVisible();
        await guideBtn.evaluate((el) => /** @type {HTMLElement} */ (el).click());

        await expect(page.locator('#guideScreen')).toBeVisible();
        await expect(page.locator('.guide-section')).toHaveCount(7);

        await page.locator('#guideBackBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());
        await expect(page.locator('#guideScreen')).toBeHidden();
        await expect(page.locator('#mainMenu')).toBeVisible();
    });

    test('guide lists every registered brick, ball and bonus type', async ({ page }) => {
        await loadGameWithHooks(page);

        const { names, contentText } = await page.evaluate(() => {
            const g = window.__game;
            const names = [];
            for (const registry of [g.BrickRegistry, g.BallRegistry, g.BonusRegistry]) {
                for (const [type, behavior] of registry.getAll()) {
                    names.push(behavior.displayName || type);
                }
            }
            return {
                names,
                contentText: document.getElementById('guideContent').textContent,
            };
        });

        expect(names.length).toBeGreaterThan(10);
        for (const name of names) {
            expect(contentText, `guide should mention "${name}"`).toContain(name);
        }
    });

    test('guide states exact numbers for the core mechanics', async ({ page }) => {
        await loadGame(page);
        await page.locator('#guideBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());

        const text = await page.locator('#guideContent').textContent();

        // Spot checks contra config.js: si estos números cambian en el juego,
        // la guía se regenera sola y hay que actualizar solo este test.
        expect(text).toContain('12 bloques');            // COMBO_BALLS_PER
        expect(text).toContain('40 puntos');             // OVERDRIVE_MAX
        expect(text).toContain('Cada 15 turnos');        // BOSS_INTERVAL
        expect(text).toContain('solo la que cruzó');     // SHIELD_BURN_ROWS = 1
        expect(text).toContain('0.18');                  // HP_LOG_FACTOR (fórmula visible)
        expect(text).toContain('200 bolas');             // MAX_BALLS_ON_SCREEN
    });

    test('guide tables scroll sideways on a phone viewport', async ({ page }) => {
        await loadGame(page);
        await page.locator('#guideBtn').evaluate((el) => /** @type {HTMLElement} */ (el).click());

        const wraps = page.locator('.guide-table-wrap');
        const count = await wraps.count();
        expect(count).toBeGreaterThan(0);

        let overflowing = 0;
        for (let i = 0; i < count; i++) {
            const wrap = wraps.nth(i);

            // El pan horizontal se decide mirando el elemento tocado Y todos
            // sus ancestros: si alguno prohíbe el eje X, el navegador ignora
            // el gesto aunque el contenedor tenga overflow-x: auto.
            const axisBlockedBy = await wrap.evaluate((el) => {
                const blockers = [];
                for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
                    const ta = getComputedStyle(node).touchAction;
                    const allowsX = ta === 'auto' || ta === 'manipulation' || /\bpan-x\b/.test(ta);
                    if (!allowsX) blockers.push(`${node.tagName}.${node.className} => ${ta}`);
                }
                return blockers;
            });
            expect(axisBlockedBy, 'ningún ancestro debe bloquear el pan horizontal').toEqual([]);

            const { scrollWidth, clientWidth } = await wrap.evaluate((el) => ({
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
            }));
            if (scrollWidth <= clientWidth) continue; // esa tabla entra en pantalla
            overflowing++;

            const scrolled = await wrap.evaluate((el) => {
                el.scrollLeft = el.scrollWidth;
                return el.scrollLeft;
            });
            expect(scrolled, 'la tabla desbordada debe poder scrollear').toBeGreaterThan(0);
        }

        // En un viewport de teléfono al menos una tabla tiene que desbordar,
        // si no, este test no estaría probando nada.
        expect(overflowing).toBeGreaterThan(0);
    });
});
