// @ts-check
import { test, expect } from '@playwright/test';
import { loadGameWithHooks } from './helpers/game.js';

/**
 * Regresión de la mecha de la bola bomba (v2.8.2).
 *
 * La onda expansiva (damagedBricks) solo debe generarse cada `hitsPerFuse`
 * impactos — NO en cada rebote. Este spec ejercita onCollision directamente
 * con un gameState y helpers falsos para verificar el ciclo completo de la
 * mecha a lo largo de dos detonaciones.
 */

test.describe('Bola bomba - mecha', () => {
    test('la onda expansiva solo detona cada hitsPerFuse impactos', async ({ page }) => {
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

            const aoePerHit = [];
            const totalHits = behavior.hitsPerFuse * 2;
            for (let i = 0; i < totalHits; i++) {
                const r = behavior.onCollision(ball, hitBrick, gameState, helpers);
                aoePerHit.push((r.damagedBricks || []).length);
            }
            return { aoePerHit, hitsPerFuse: behavior.hitsPerFuse };
        });

        // Solo los impactos múltiplo de hitsPerFuse detonan (índices 1-based)
        result.aoePerHit.forEach((aoeCount, i) => {
            const hitNumber = i + 1;
            if (hitNumber % result.hitsPerFuse === 0) {
                expect(aoeCount, `impacto ${hitNumber} debe detonar`).toBeGreaterThan(0);
            } else {
                expect(aoeCount, `impacto ${hitNumber} NO debe detonar`).toBe(0);
            }
        });
    });
});
