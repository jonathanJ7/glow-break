/**
 * Registry - Sistema de registro central para tipos extensibles.
 *
 * Implementa el principio Open/Closed permitiendo agregar nuevos tipos
 * sin modificar el código existente.
 *
 * Cada registry recibe en construcción:
 *   - base: behavior con métodos no-op por defecto. Se mergea con cada
 *     behavior registrado, así las llamadas del motor (`brick.onTurnStart`,
 *     etc.) nunca necesitan guards `if (behavior.method)`.
 *   - required: lista de campos que un behavior debe definir o el
 *     register() lanza. Falla rápido en lugar de en silencio.
 *
 * Uso:
 *   BrickRegistry.register('miTipo', MiBrickBehavior);
 *   const behavior = BrickRegistry.get('miTipo');
 */

class TypeRegistry {
    /**
     * @param {string} name
     * @param {{ base?: object, required?: string[] }} [options]
     */
    constructor(name, options = {}) {
        this.name = name;
        this.types = new Map();
        this.defaultType = null;
        this.baseBehavior = options.base || {};
        this.requiredFields = options.required || [];
    }

    /**
     * Registra un nuevo tipo en el registry.
     *
     * Valida los campos requeridos y mergea el behavior con la base
     * para que los métodos opcionales tengan no-ops por defecto.
     *
     * @param {string} type
     * @param {object} behavior
     */
    register(type, behavior) {
        for (const field of this.requiredFields) {
            if (!(field in behavior) || behavior[field] === undefined) {
                throw new Error(
                    `[${this.name}] Cannot register '${type}': missing required field '${field}'`
                );
            }
        }

        if (this.types.has(type)) {
            console.warn(`[${this.name}] Type '${type}' is being overwritten`);
        }

        const merged = Object.assign({}, this.baseBehavior, behavior);
        this.types.set(type, merged);
        return this;
    }

    /**
     * Obtiene el comportamiento para un tipo (o el default si no existe).
     */
    get(type) {
        return this.types.get(type) || this.types.get(this.defaultType);
    }

    has(type) {
        return this.types.has(type);
    }

    setDefault(type) {
        this.defaultType = type;
        return this;
    }

    getTypes() {
        return Array.from(this.types.keys());
    }

    getAll() {
        return this.types;
    }
}

// ============================================
// BASES — métodos no-op por defecto
// ============================================

const brickBase = {
    render() {},
    onDestroy() { return null; },
    onDamage(brick, damage) { return damage; },
    onTurnStart() {},
    onTurnEnd() {},
    getConfig() { return {}; },
};

const ballBase = {
    render() {},
    onCollision() {
        return { bounce: true, damage: 1, continueChecking: false };
    },
    onExitBrick() {},
    onPostStep() {},
    getConfig() { return {}; },
};

const bonusBase = {
    render() {},
    onCollect() { return null; },
    getText() { return ''; },
    getConfig() { return {}; },
};

// ============================================
// REGISTRIES GLOBALES
// ============================================

export const BrickRegistry = new TypeRegistry('BrickRegistry', {
    base: brickBase,
    required: ['type', 'render', 'getConfig'],
});

export const BallRegistry = new TypeRegistry('BallRegistry', {
    base: ballBase,
    required: ['type', 'render', 'createBall', 'getConfig'],
});

export const BonusRegistry = new TypeRegistry('BonusRegistry', {
    base: bonusBase,
    required: ['type', 'render', 'onCollect', 'getConfig'],
});

export default TypeRegistry;
