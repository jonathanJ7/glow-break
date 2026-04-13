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
        startingBalls: 1,
        hpVariationMin: 0.3,
        hpVariationMax: 1.0,
    },
    medium: {
        name: 'MEDIO',
        emoji: '😤',
        color: '#f5b942',
        hpMultiplier: 1.5,
        densityBase: 0.38,
        densityGrowth: 0.008,
        maxDensity: 0.70,
        startingBalls: 1,
        hpVariationMin: 0.5,
        hpVariationMax: 1.5,
    },
    hard: {
        name: 'DIFÍCIL',
        emoji: '💀',
        color: '#e94560',
        hpMultiplier: 2.8,
        densityBase: 0.50,
        densityGrowth: 0.012,
        maxDensity: 0.85,
        startingBalls: 1,
        hpVariationMin: 0.7,
        hpVariationMax: 2.0,
        reinforcedRows: true,
    }
};

// ====================================
// SPAWN SCHEDULE DETERMINISTA
// ====================================
// Define en qué turnos aparecen bolas y poderes de forma fija.
// Orden en ballBonuses = prioridad (el más raro primero).
// first: turno en que aparece por primera vez.
// interval: cada cuántos turnos reaparece después del primero.
export const SPAWN_SCHEDULE = {
    easy: {
        ballBonuses: {
            splitterBall: { first: 20, interval: 15 },
            fireballBall: { first: 8, interval: 10 },
            ball:         { first: 1, interval: 1 },
        },
        powerups: {
            strength:   { first: 5, interval: 8 },
            horizontal: { first: 3, interval: 6 },
        },
    },
    medium: {
        ballBonuses: {
            splitterBall: { first: 35, interval: 20 },
            fireballBall: { first: 15, interval: 15 },
            ball:         { first: 1, interval: 2 },
        },
        powerups: {
            strength:   { first: 10, interval: 12 },
            horizontal: { first: 5, interval: 10 },
        },
    },
    hard: {
        ballBonuses: {
            splitterBall: { first: 50, interval: 30 },
            fireballBall: { first: 25, interval: 20 },
            ball:         { first: 1, interval: 3 },
        },
        powerups: {
            strength:   { first: 20, interval: 18 },
            horizontal: { first: 10, interval: 15 },
        },
    }
};
