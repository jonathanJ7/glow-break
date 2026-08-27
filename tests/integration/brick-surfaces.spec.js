// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks } from './helpers/game.js';

/**
 * Superficies fusionadas (js/systems/BrickSurfaces.js).
 *
 * Dos bloques adyacentes deben comportarse como UNA superficie continua:
 * sin ranura entre ellos, sin caras internas y sin esquinas internas. Las
 * esquinas internas eran la causa de los rebotes inesperados: una bola que
 * golpeaba la costura entre dos bloques salía desviada como si hubiera
 * pegado en un canto.
 */

const CELL = 40;
const LEFT = 10.5;
const TOP = 40;

/**
 * Construye una grilla de bloques de prueba con las mismas convenciones que
 * el motor: brick.x/brick.y son el origen de la celda y el rect visible
 * lleva 2px de margen por lado.
 */
function bricksFrom(cells) {
    return cells.map(([col, row, span = 1]) => ({
        x: LEFT + col * CELL,
        y: TOP + row * CELL,
        width: CELL * span - 4,
        height: CELL - 4,
        hp: 5,
        maxHp: 5,
        col,
        type: 'normal',
    }));
}

test.describe('Superficies de bloques fusionadas', () => {
    test('dos bloques adyacentes comparten la arista, sin ranura', async ({ page }) => {
        await loadGameWithHooks(page);

        const result = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces } = window.__game.brickSurfaces;
            const bricks = cells;
            const surfaces = buildBrickSurfaces(bricks, CELL);
            const a = surfaces.get(bricks[0]);
            const b = surfaces.get(bricks[1]);
            return {
                gap: b.x0 - a.x1,
                aRight: a.rightExposed,
                bLeft: b.leftExposed,
                aLeft: a.leftExposed,
                bRight: b.rightExposed,
            };
        }, { cells: bricksFrom([[0, 0], [1, 0]]), CELL });

        expect(result.gap).toBe(0);
        // Las caras que se tocan no se testean...
        expect(result.aRight).toBe(false);
        expect(result.bLeft).toBe(false);
        // ...pero las expuestas siguen ahí
        expect(result.aLeft).toBe(true);
        expect(result.bRight).toBe(true);
    });

    test('las esquinas internas desaparecen y las externas se mantienen', async ({ page }) => {
        await loadGameWithHooks(page);

        const corners = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces } = window.__game.brickSurfaces;
            const surfaces = buildBrickSurfaces(cells, CELL);
            return {
                izquierdo: surfaces.get(cells[0]).corners,
                medio: surfaces.get(cells[1]).corners,
                derecho: surfaces.get(cells[2]).corners,
            };
        }, { cells: bricksFrom([[0, 0], [1, 0], [2, 0]]), CELL });

        // El bloque del medio no aporta ninguna esquina: es pura pared
        expect(corners.medio).toEqual({ tl: false, tr: false, bl: false, br: false });
        expect(corners.izquierdo).toEqual({ tl: true, tr: false, bl: true, br: false });
        expect(corners.derecho).toEqual({ tl: false, tr: true, bl: false, br: true });
    });

    test('una bola que pega en la costura rebota recto, no en diagonal', async ({ page }) => {
        await loadGameWithHooks(page);

        const normals = await page.evaluate(({ cells, CELL, LEFT, TOP }) => {
            const { findFirstCollision } = window.__game.collision;
            const { invalidateBrickSurfaces } = window.__game.brickSurfaces;
            const bounds = { left: LEFT, right: LEFT + CELL * 7, top: TOP - 15, bottom: 700 };
            const radius = 7;
            const seamX = LEFT + CELL;

            // Bola subiendo en vertical justo por la costura entre los dos bloques
            return [-2, -1, 0, 1, 2].map((offset) => {
                invalidateBrickSurfaces();
                const hit = findFirstCollision(
                    seamX + offset, TOP + CELL + 40, 0, -60, radius, cells, bounds
                );
                return hit ? { side: hit.side, nx: hit.normalX, ny: hit.normalY } : null;
            });
        }, { cells: bricksFrom([[0, 0], [1, 0]]), CELL, LEFT, TOP });

        for (const hit of normals) {
            expect(hit).not.toBeNull();
            // Antes, la esquina interna devolvía normales inclinadas (nx != 0)
            expect(hit.side).toBe('bottom');
            expect(hit.nx).toBe(0);
            expect(hit.ny).toBe(1);
        }
    });

    test('bloques NO adyacentes conservan sus bordes y esquinas', async ({ page }) => {
        await loadGameWithHooks(page);

        const result = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces } = window.__game.brickSurfaces;
            const surfaces = buildBrickSurfaces(cells, CELL);
            const a = surfaces.get(cells[0]);
            const b = surfaces.get(cells[1]);
            return { gap: b.x0 - a.x1, aCorners: a.corners, bCorners: b.corners };
        }, { cells: bricksFrom([[0, 0], [2, 0]]), CELL });

        // Una celda vacía en el medio: la ranura sigue existiendo (es real)
        expect(result.gap).toBeCloseTo(CELL, 6);
        expect(result.aCorners).toEqual({ tl: true, tr: true, bl: true, br: true });
        expect(result.bCorners).toEqual({ tl: true, tr: true, bl: true, br: true });
    });


    test('el borde de una fila no hace escalones aunque los vecinos difieran', async ({ page }) => {
        await loadGameWithHooks(page);

        // Fila de 3 bloques; solo los de los extremos tienen bloque debajo.
        // Con margen por lado, el del medio terminaba 2px más arriba: ese
        // escalón se veía como un pico y devolvía la bola contra un canto.
        const cells = bricksFrom([[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]]);

        const result = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces } = window.__game.brickSurfaces;
            const surfaces = buildBrickSurfaces(cells, CELL);
            const [izq, medio, der] = cells.map((b) => surfaces.get(b));
            return {
                bordesInferiores: [izq.y1, medio.y1, der.y1],
                bordesSuperiores: [izq.y0, medio.y0, der.y0],
                esquinasMedio: medio.corners,
            };
        }, { cells, CELL });

        // Los tres bloques terminan exactamente en la misma línea
        expect(new Set(result.bordesInferiores).size).toBe(1);
        expect(new Set(result.bordesSuperiores).size).toBe(1);
        // Y el del medio no aporta esquinas redondeadas dentro de la pared
        expect(result.esquinasMedio.bl).toBe(false);
        expect(result.esquinasMedio.br).toBe(false);
    });

    test('un jefe de 3 celdas solo tapa la parte de su cara que tiene vecino', async ({ page }) => {
        await loadGameWithHooks(page);

        const result = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces } = window.__game.brickSurfaces;
            const [boss] = cells;
            const surface = buildBrickSurfaces(cells, CELL).get(boss);
            return {
                expuestos: surface.topSegments.length,
                costuras: surface.topSeams.length,
                anchoCubierto: surface.topSeams.reduce((acc, [a, b]) => acc + (b - a), 0),
            };
        }, { cells: bricksFrom([[1, 1, 3], [2, 0]]), CELL });

        // El bloque de arriba tapa la celda del medio: quedan dos tramos
        // expuestos (izquierda y derecha) y una costura de una celda
        expect(result.expuestos).toBe(2);
        expect(result.costuras).toBe(1);
        expect(result.anchoCubierto).toBeCloseTo(CELL, 6);
    });

    test('el rect que se dibuja es el mismo que usa la colisión', async ({ page }) => {
        await loadGameWithHooks(page);

        const result = await page.evaluate(({ cells, CELL }) => {
            const { buildBrickSurfaces, brickRectFromSurface } = window.__game.brickSurfaces;
            const surfaces = buildBrickSurfaces(cells, CELL);
            return cells.map((brick) => {
                const s = surfaces.get(brick);
                const rect = brickRectFromSurface(brick, s);
                return {
                    coincide:
                        rect.x === s.x0 &&
                        rect.y === s.y0 &&
                        rect.x + rect.width === s.x1 &&
                        rect.y + rect.height === s.y1,
                    radii: rect.radii,
                };
            });
        }, { cells: bricksFrom([[0, 0], [1, 0]]), CELL });

        expect(result[0].coincide).toBe(true);
        expect(result[1].coincide).toBe(true);
        // Sin redondeo en las esquinas fusionadas: [tl, tr, br, bl]
        expect(result[0].radii[1]).toBe(0);
        expect(result[0].radii[2]).toBe(0);
        expect(result[1].radii[0]).toBe(0);
        expect(result[1].radii[3]).toBe(0);
    });
});
