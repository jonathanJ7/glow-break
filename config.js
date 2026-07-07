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
// MECÁNICAS DE DIVERSIÓN
// ====================================
// Combo: ladrillos destruidos en un mismo turno. Cada COMBO_BALLS_PER
// destruidos dan +1 bola normal al final del turno (cap COMBO_MAX_REWARD).
export const COMBO_BALLS_PER = 12;
export const COMBO_MAX_REWARD = 8;

// Overdrive: destruir ladrillos carga el medidor; al llenarse, el
// siguiente turno todas las bolas hacen daño x2.
export const OVERDRIVE_MAX = 40;
export const OVERDRIVE_MULTIPLIER = 2;

// Jefes: cada BOSS_INTERVAL turnos aparece un jefe de 3 columnas.
export const BOSS_INTERVAL = 15;
export const BOSS_HP_MULTIPLIER = 6;

// Curva de HP: HP base del turno T = ⌊T × (1 + ln(T+1) × HP_LOG_FACTOR) × hpMultiplier⌋
export const HP_LOG_FACTOR = 0.18;

// Escudos: cargas de segunda oportunidad. Al llegar los ladrillos a la
// línea, un escudo quema las SHIELD_BURN_ROWS filas de abajo en vez de
// game over.
export const STARTING_SHIELDS = 1;
export const MAX_SHIELDS = 3;
export const SHIELD_BURN_ROWS = 2;

// El bonus de bolas normales escala: +1 bola extra por cada
// BALL_BONUS_SCALE_TURNS turnos transcurridos.
export const BALL_BONUS_SCALE_TURNS = 25;

// Láser horizontal: daña a cada bloque de la fila con el mayor entre
// (maxHp × LASER_MAXHP_RATIO) y (hp actual × LASER_CURRENT_HP_RATIO).
export const LASER_MAXHP_RATIO = 0.5;
export const LASER_CURRENT_HP_RATIO = 0.6;

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
// Además de los números (HP, densidad), cada dificultad define `assists`:
// las ayudas de información que recibe el jugador. La dificultad no solo
// sube los números, también reduce cuánto "sabe" el jugador:
//   - aimBounces:  rebotes que simula la línea de puntería
//   - aimLength:   largo de la línea como fracción del alto del área de
//                  juego (null = sin límite extra, tope interno de 1200px)
//   - freezeAim:   si el apuntado fino con congelación está disponible
//   - hpRoundStep: el HP mostrado se redondea HACIA ARRIBA a múltiplos de
//                  este valor (1 = exacto; los valores menores al step se
//                  muestran exactos)
// La guía del juego genera su tabla de ayudas desde estos campos.
export const DIFFICULTY_SETTINGS = {
    easy: {
        name: 'FÁCIL',
        emoji: '😊',
        color: '#4ecca3',
        hpMultiplier: 1.0,
        densityBase: 0.30,
        densityGrowth: 0.005,
        maxDensity: 0.55,
        startingBalls: 1,
        hpVariationMin: 0.3,
        hpVariationMax: 1.0,
        assists: {
            aimBounces: 5,
            aimLength: null,
            freezeAim: true,
            hpRoundStep: 1,
        },
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
        assists: {
            aimBounces: 1,
            aimLength: null,
            freezeAim: true,
            hpRoundStep: 1,
        },
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
        assists: {
            aimBounces: 1,
            aimLength: 0.35,
            freezeAim: false,
            hpRoundStep: 10,
        },
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
            bombBall:     { first: 12, interval: 12 },
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
            bombBall:     { first: 18, interval: 14 },
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
            bombBall:     { first: 28, interval: 18 },
            fireballBall: { first: 25, interval: 20 },
            ball:         { first: 1, interval: 3 },
        },
        powerups: {
            strength:   { first: 20, interval: 18 },
            horizontal: { first: 10, interval: 15 },
        },
    }
};
