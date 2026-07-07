/**
 * BonusBehaviors - Comportamientos para tipos de bonuses/power-ups
 *
 * Cada tipo de bonus define:
 * - render(ctx, bonus, helpers): Cómo se dibuja
 * - onCollect(bonus, ball, gameState, helpers): Qué pasa al recolectarlo
 * - getText(bonus): Texto a mostrar en el bonus
 * - getConfig(): Configuración del tipo
 *
 * Principio Open/Closed: Para agregar un nuevo tipo de bonus,
 * simplemente crea un nuevo behavior y regístralo.
 */

import { BonusRegistry } from '../core/Registry.js';
import { BALL_BONUS_SCALE_TURNS, LASER_MAXHP_RATIO, LASER_CURRENT_HP_RATIO } from '../../config.js';

// ============================================
// BALL BONUS - Agrega bolas normales
// ============================================
const BallBonusBehavior = {
    type: 'ball',
    displayName: 'Bolas extra (+N)',
    color: '#4ecca3',
    icon: null,
    targetBallType: 'normal',

    describe() {
        return 'Suma N bolas normales a tu inventario para siempre. '
            + `N escala con el turno: N = 1 + (turno ÷ ${BALL_BONUS_SCALE_TURNS}, redondeado hacia abajo). `
            + `Es decir: +1 hasta el turno ${BALL_BONUS_SCALE_TURNS - 1}, +2 del ${BALL_BONUS_SCALE_TURNS} al `
            + `${BALL_BONUS_SCALE_TURNS * 2 - 1}, +3 del ${BALL_BONUS_SCALE_TURNS * 2} en adelante, y así sucesivamente.`;
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Texto
        ctx.fillStyle = 'white';
        ctx.font = `bold ${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+' + (bonus.value || 1), bonus.x, bonus.y);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const count = bonus.value || 1;
        const key = this.targetBallType;
        gameState.ballInventory[key] = (gameState.ballInventory[key] || 0) + count;

        return {
            inventoryChange: { [key]: count }
        };
    },

    getText(bonus) {
        return '+' + (bonus.value || 1);
    },

    getConfig() {
        return {
            minTurn: 0,
            category: 'ball'
        };
    }
};

// ============================================
// FIREBALL BONUS - Agrega bolas de fuego
// ============================================
const FireballBonusBehavior = {
    type: 'fireballBall',
    displayName: 'Bola de fuego',
    color: '#ff6b6b',
    icon: '🔥',
    targetBallType: 'fireball',

    describe() {
        return 'Suma +1 bola de fuego a tu inventario para siempre.';
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icono
        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const count = bonus.value || 1;
        const key = this.targetBallType;
        gameState.ballInventory[key] = (gameState.ballInventory[key] || 0) + count;

        return {
            inventoryChange: { [key]: count }
        };
    },

    getText(bonus) {
        return this.icon;
    },

    getConfig() {
        return {
            minTurn: 8,
            category: 'ball',
            probability: 0.15
        };
    }
};

// ============================================
// SPLITTER BONUS - Agrega bolas divisoras
// ============================================
const SplitterBonusBehavior = {
    type: 'splitterBall',
    displayName: 'Bola divisora',
    color: '#f9ed69',
    icon: '💥',
    targetBallType: 'splitter',

    describe() {
        return 'Suma +1 bola divisora a tu inventario para siempre.';
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icono
        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const count = bonus.value || 1;
        const key = this.targetBallType;
        gameState.ballInventory[key] = (gameState.ballInventory[key] || 0) + count;

        return {
            inventoryChange: { [key]: count }
        };
    },

    getText(bonus) {
        return this.icon;
    },

    getConfig() {
        return {
            minTurn: 15,
            category: 'ball',
            probability: 0.10
        };
    }
};

// ============================================
// HORIZONTAL LASER - Dispara láser horizontal
// ============================================
const HorizontalLaserBehavior = {
    type: 'horizontal',
    displayName: 'Láser horizontal',
    color: '#3b82f6',
    icon: '⚡',

    describe() {
        return 'Efecto inmediato (no se guarda): dispara un láser horizontal a la fila de bloques '
            + 'más cercana a la bola que lo recogió. Daña a cada bloque de esa fila con el MAYOR entre '
            + `${Math.round(LASER_MAXHP_RATIO * 100)}% de su HP máximo y ${Math.round(LASER_CURRENT_HP_RATIO * 100)}% `
            + 'de su HP actual — nunca mata de un solo golpe a un bloque sano, pero remata a los dañados.';
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icono
        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const { fireHorizontalLaser } = helpers;
        fireHorizontalLaser(ball.y);

        return {
            effect: 'laser',
            immediate: true
        };
    },

    getText(bonus) {
        return this.icon;
    },

    getConfig() {
        return {
            minTurn: 3,
            category: 'powerup'
        };
    }
};

// ============================================
// STRENGTH BONUS - Agrega bolas de fuerza
// ============================================
const StrengthBonusBehavior = {
    type: 'strength',
    displayName: 'Bola de fuerza',
    color: '#ff8c00',
    icon: '💪',
    targetBallType: 'strength',

    describe() {
        return 'Suma +1 bola de fuerza a tu inventario para siempre.';
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icono
        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const key = this.targetBallType;
        gameState.ballInventory[key] = (gameState.ballInventory[key] || 0) + 1;

        return {
            inventoryChange: { [key]: 1 }
        };
    },

    getText(bonus) {
        return this.icon;
    },

    getConfig() {
        return {
            minTurn: 3,
            category: 'powerup'
        };
    }
};

// ============================================
// BOMB BONUS - Agrega bolas bomba
// ============================================
const BombBonusBehavior = {
    type: 'bombBall',
    displayName: 'Bola bomba',
    color: '#f87171',
    icon: '💣',
    targetBallType: 'bomb',

    describe() {
        return 'Suma +1 bola bomba a tu inventario para siempre.';
    },

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Icono
        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        const count = bonus.value || 1;
        const key = this.targetBallType;
        gameState.ballInventory[key] = (gameState.ballInventory[key] || 0) + count;

        return {
            inventoryChange: { [key]: count }
        };
    },

    getText(bonus) {
        return this.icon;
    },

    getConfig() {
        return {
            minTurn: 12,
            category: 'ball'
        };
    }
};

// ============================================
// REGISTRO DE TODOS LOS TIPOS
// ============================================
BonusRegistry
    .setDefault('ball')
    .register('ball', BallBonusBehavior)
    .register('fireballBall', FireballBonusBehavior)
    .register('splitterBall', SplitterBonusBehavior)
    .register('horizontal', HorizontalLaserBehavior)
    .register('strength', StrengthBonusBehavior)
    .register('bombBall', BombBonusBehavior);

// Exportar para uso directo
export {
    BallBonusBehavior,
    FireballBonusBehavior,
    SplitterBonusBehavior,
    HorizontalLaserBehavior,
    StrengthBonusBehavior,
    BombBonusBehavior
};

export default BonusRegistry;
