// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks, startGame } from './helpers/game.js';

/**
 * Tablero de tamaño fijo (v2.12.2): la cantidad de filas hasta la línea de
 * peligro no depende del alto de la pantalla. Antes, en pantalla dividida
 * entraban ~8,6 filas y en pantalla completa ~13,7.
 */
test.describe('Glow-Break - tablero de tamaño fijo', () => {
    for (const [name, width, height] of [
        ['pantalla dividida', 390, 541],
        ['pantalla completa', 390, 844],
        ['ventana muy alta', 390, 1000],
    ]) {
        test(`${name} (${width}x${height}) tiene las mismas filas hasta la línea`, async ({ page }) => {
            await page.setViewportSize({ width, height });
            await loadGameWithHooks(page);
            await startGame(page, 'medium');
            const r = await page.evaluate(() => {
                const { rendering: rd, config: c } = window.__game;
                return {
                    rows: (rd.getBottomLine() - c.DANGER_LINE_GAP - rd.getTopOffset()) / rd.getCellSize(),
                    expected: c.BOARD_ROWS + c.LAUNCH_ZONE_ROWS,
                    cell: rd.getCellSize(),
                    maxCellWidth: (rd.getWidth() - 20) / c.COLS,
                };
            });
            expect(r.rows).toBeCloseTo(r.expected, 5);
            // En estas pantallas el ancho manda: los bloques no se achican
            expect(r.cell).toBeCloseTo(r.maxCellWidth, 5);
        });
    }
});
