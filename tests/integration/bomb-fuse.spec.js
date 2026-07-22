// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks } from './helpers/game.js';

/**
 * Regresión de la mecha de la bola bomba (v2.8.5).
 *
 * La onda expansiva (damagedBricks) solo debe generarse cuando la mecha
 * termina de recargar — NO en cada rebote. Además la mecha se desgasta:
 * la primera detonación cuesta hitsPerFuse impactos y cada detonación
 * encarece la siguiente en fuseWear impactos más (3, 4, 5…).
 */

test.describe('Bola bomba - mecha con desgaste', () => {
    test('la onda detona cada vez más espaciada: 3, luego 4, luego 5 impactos', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const behavior = window.__game.BallRegistry.get('bomb');
            const ball = behavior.createBall(0, 0, 0, 0);

            // Bloque golpeado + un vecino dentro del radio de la onda
            const hitBrick = { x: 0, y: 0, width: 40, height: 20, hp: 10, maxHp: 10 };
            const neighbor = { x: 45, y: 0, width: 40, height: 20, hp: 10, maxHp: 10 };
            const gameState = { bricks: [hitBrick, neighbor] };

            const helpers = {
                getCellSize: () => 45,
                createParticles: () => {},
                addScreenShake: () => {},
                addFloatingText: () => {},
                speedMultiplier: 1,
            };

            // Simular 3 ciclos completos de mecha (3 + 4 + 5 impactos)
            const detonationHits = [];
            const totalHits = behavior.hitsPerFuse * 3 + behavior.fuseWear * 3;
            for (let hit = 1; hit <= totalHits; hit++) {
                const r = behavior.onCollision(ball, hitBrick, gameState, helpers);
                if ((r.damagedBricks || []).length > 0) {
                    detonationHits.push(hit);
                }
            }
            return {
                detonationHits,
                hitsPerFuse: behavior.hitsPerFuse,
                fuseWear: behavior.fuseWear,
            };
        });

        // Con hitsPerFuse=3 y fuseWear=1: detona en los impactos 3, 7 y 12
        const { hitsPerFuse, fuseWear } = result;
        const expected = [
            hitsPerFuse,
            hitsPerFuse * 2 + fuseWear,
            hitsPerFuse * 3 + fuseWear * 3,
        ];
        expect(result.detonationHits).toEqual(expected);
    });

    test('cada bola bomba nueva arranca con la mecha barata otra vez', async ({ page }) => {
        await loadGameWithHooks(page);
        const result = await page.evaluate(() => {
            const behavior = window.__game.BallRegistry.get('bomb');
            const ball = behavior.createBall(0, 0, 0, 0);
            return {
                fuseCost: ball.state.fuseCost,
                hitsPerFuse: behavior.hitsPerFuse,
            };
        });
        expect(result.fuseCost).toBe(result.hitsPerFuse);
    });
});
