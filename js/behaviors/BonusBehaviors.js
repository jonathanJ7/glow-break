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

// ============================================
// BALL BONUS - Agrega bolas normales
// ============================================
const BallBonusBehavior = {
    type: 'ball',
    color: '#4ecca3',
    icon: null,
    targetBallType: 'normal',

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
    color: '#ff6b6b',
    icon: '🔥',
    targetBallType: 'fireball',

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
    color: '#f9ed69',
    icon: '💥',
    targetBallType: 'splitter',

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
    color: '#3b82f6',
    icon: '⚡',

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
    color: '#ff8c00',
    icon: '💪',
    targetBallType: 'strength',

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
// REGISTRO DE TODOS LOS TIPOS
// ============================================
BonusRegistry
    .setDefault('ball')
    .register('ball', BallBonusBehavior)
    .register('fireballBall', FireballBonusBehavior)
    .register('splitterBall', SplitterBonusBehavior)
    .register('horizontal', HorizontalLaserBehavior)
    .register('strength', StrengthBonusBehavior);

// Exportar para uso directo
export {
    BallBonusBehavior,
    FireballBonusBehavior,
    SplitterBonusBehavior,
    HorizontalLaserBehavior,
    StrengthBonusBehavior
};

export default BonusRegistry;
