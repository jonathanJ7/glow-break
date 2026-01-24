/**
 * Game Constants
 * Centraliza todas las constantes del juego siguiendo el principio DRY
 */

export const GAME_CONSTANTS = {
    // Grid
    COLS: 7,

    // Ball
    BASE_BALL_RADIUS: 6,
    BALL_SPEED: 10,
    MIN_BALL_RADIUS: 4,
    MIN_FONT_SIZE: 8,

    // Performance
    FAST_SPEED_MULTIPLIER: 5,
    SHOOT_DELAY: 45,
    MAX_BALLS_ON_SCREEN: 200,

    // Brick types
    BRICK_TYPES: {
        NORMAL: 'normal',
        EXPLOSIVE: 'explosive',
        ARMORED: 'armored',
        SPAWNER: 'spawner'
    },

    // Brick categories (helpful = ayudan al jugador, challenging = dificultan)
    BRICK_CATEGORIES: {
        HELPFUL: ['explosive'],           // Explosivos ayudan a destruir bloques
        CHALLENGING: ['armored', 'spawner'] // Armored y spawner dificultan
    },

    // Brick generation thresholds
    BRICK_GENERATION_TURNS: {
        EXPLOSIVE_MIN_TURN: 3,
        ARMORED_MIN_TURN: 5,
        SPAWNER_MIN_TURN: 8
    },

    // Colors
    COLORS: {
        BRICK_TIER_1: '#ff6b6b',
        BRICK_TIER_2: '#f59e0b',
        BRICK_TIER_3: '#fbbf24',
        BRICK_TIER_4: '#facc15',
        BRICK_TIER_5: '#a3e635',
        BRICK_TIER_6: '#4ade80',
        BRICK_TIER_7: '#10b981',
        BRICK_TIER_8: '#06b6d4'
    }
};

export default GAME_CONSTANTS;
