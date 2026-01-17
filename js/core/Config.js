/**
 * Difficulty Configuration
 * Gestiona toda la configuración de dificultades del juego
 * Siguiendo el principio Single Responsibility
 */

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
        armoredChance: 0.03,
        multiBallChance: 0.2,
        startingBalls: 1,
        hpVariationMin: 0.3,
        hpVariationMax: 1.0,
        poisonBrickChance: 0.04  // Bloques que generan más bloques
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
        armoredChance: 0.10,
        multiBallChance: 0.1,
        startingBalls: 1,
        hpVariationMin: 0.5,
        hpVariationMax: 1.5,
        poisonBrickChance: 0.05  // Bloques que generan más bloques
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
        armoredChance: 0.20,
        multiBallChance: 0.05,
        startingBalls: 1,
        hpVariationMin: 0.7,
        hpVariationMax: 2.0,
        poisonBrickChance: 0.06,  // Bloques que generan más bloques
        reinforcedRows: true       // Cada 10 turnos, fila extra resistente
    }
};

/**
 * DifficultyManager
 * Gestiona el estado de dificultad actual y provee utilidades
 */
export class DifficultyManager {
    constructor() {
        this.currentDifficulty = 'easy';
        this.config = DIFFICULTY_SETTINGS.easy;
        this.startingTurn = 1;
    }

    /**
     * Cambia la dificultad del juego
     */
    setDifficulty(difficulty) {
        if (!DIFFICULTY_SETTINGS[difficulty]) {
            throw new Error(`Dificultad inválida: ${difficulty}`);
        }
        this.currentDifficulty = difficulty;
        this.config = DIFFICULTY_SETTINGS[difficulty];
    }

    /**
     * Obtiene la configuración actual
     */
    getConfig() {
        return this.config;
    }

    /**
     * Establece el turno inicial
     */
    setStartingTurn(turn) {
        this.startingTurn = Math.max(1, Math.floor(turn));
    }

    /**
     * Calcula el número de bolas iniciales basado en el turno y dificultad
     */
    calculateStartingBalls() {
        if (this.startingTurn <= 1) return this.config.startingBalls;

        // Fórmula: 1 + bonusBalls + rareBonusChance
        let balls = 1;

        // Por cada 2 turnos, se gana una bola extra (ajustado por dificultad)
        const bonusBallRate = this.currentDifficulty === 'hard' ? 3 :
                              this.currentDifficulty === 'medium' ? 2.5 : 2;
        const bonusBalls = Math.floor((this.startingTurn - 1) / bonusBallRate);
        balls += bonusBalls;

        // Posibilidad de bolas raras en múltiplos de 5
        if (this.startingTurn % 5 === 0) {
            const rareBonusBalls = Math.floor(this.startingTurn / 10);
            balls += rareBonusBalls;
        }

        return Math.max(this.config.startingBalls, balls);
    }

    /**
     * Verifica si el turno debe tener refuerzo (solo en difícil)
     */
    shouldReinforceRow(turn) {
        return this.config.reinforcedRows && turn % 10 === 0;
    }
}

export default DifficultyManager;
