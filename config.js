// ====================================
// CONSTANTES DEL JUEGO
// ====================================
export const COLS = 7;
export const BASE_BALL_RADIUS = 6;
export const BALL_SPEED = 10;
export const FAST_SPEED_MULTIPLIER = 5;
export const SHOOT_DELAY = 45;
export const MAX_BALLS_ON_SCREEN = 200;
export const POINTER_DISPLAY_DELAY_MS = 100; // Delay para visualización suave del puntero

// ====================================
// COLORES Y ESTILOS
// ====================================
export const BRICK_COLORS = [
    '#4ecca3', '#3db892', '#2ea37f', '#1f8e6c',
    '#f9ed69', '#f5e150', '#e6cf3a', '#d4bd25',
    '#ff6b6b', '#f55555', '#e04040', '#cc2b2b',
    '#a855f7', '#9333ea', '#7e22ce', '#6b21a8',
    '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'
];

// ====================================
// CONFIGURACIÓN DE DIFICULTADES
// ====================================
export const DIFFICULTY_SETTINGS = {
    easy: {
        name: 'FÁCIL',
        emoji: '😊',
        color: '#4ecca3',
        hpMultiplier: 0.8,
        densityBase: 0.28,
        densityGrowth: 0.005,
        maxDensity: 0.55,
        bonusChance: 0.12,
        powerupChance: 0.05,
        explosiveChance: 0.06,
        armoredChance: 0.015,
        multiBallChance: 0.2,
        startingBalls: 1,
        hpVariationMin: 0.3,
        hpVariationMax: 1.0,
        poisonBrickChance: 0.08,
        regeneratorChance: 0.06
    },
    medium: {
        name: 'MEDIO',
        emoji: '😤',
        color: '#f5b942',
        hpMultiplier: 1.5,
        densityBase: 0.38,
        densityGrowth: 0.008,
        maxDensity: 0.70,
        bonusChance: 0.08,
        powerupChance: 0.035,
        explosiveChance: 0.08,
        armoredChance: 0.05,
        multiBallChance: 0.1,
        startingBalls: 1,
        hpVariationMin: 0.5,
        hpVariationMax: 1.5,
        poisonBrickChance: 0.10,
        regeneratorChance: 0.10
    },
    hard: {
        name: 'DIFÍCIL',
        emoji: '💀',
        color: '#e94560',
        hpMultiplier: 2.8,
        densityBase: 0.50,
        densityGrowth: 0.012,
        maxDensity: 0.85,
        bonusChance: 0.05,
        powerupChance: 0.025,
        explosiveChance: 0.04,
        armoredChance: 0.10,
        multiBallChance: 0.05,
        startingBalls: 1,
        hpVariationMin: 0.7,
        hpVariationMax: 2.0,
        poisonBrickChance: 0.12,
        regeneratorChance: 0.16,
        reinforcedRows: true
    }
};
