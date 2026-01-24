/**
 * Registry - Sistema de registro central para tipos extensibles
 *
 * Implementa el principio Open/Closed permitiendo agregar nuevos tipos
 * sin modificar el código existente.
 *
 * Uso:
 *   BrickRegistry.register('miTipo', MiBrickBehavior);
 *   const behavior = BrickRegistry.get('miTipo');
 */

class TypeRegistry {
    constructor(name) {
        this.name = name;
        this.types = new Map();
        this.defaultType = null;
    }

    /**
     * Registra un nuevo tipo en el registry
     * @param {string} type - Identificador del tipo
     * @param {object} behavior - Objeto con los métodos del comportamiento
     */
    register(type, behavior) {
        if (this.types.has(type)) {
            console.warn(`[${this.name}] Type '${type}' is being overwritten`);
        }
        this.types.set(type, behavior);
        return this;
    }

    /**
     * Obtiene el comportamiento para un tipo
     * @param {string} type - Identificador del tipo
     * @returns {object} - Comportamiento del tipo o el default
     */
    get(type) {
        return this.types.get(type) || this.types.get(this.defaultType);
    }

    /**
     * Verifica si un tipo está registrado
     * @param {string} type - Identificador del tipo
     * @returns {boolean}
     */
    has(type) {
        return this.types.has(type);
    }

    /**
     * Establece el tipo por defecto
     * @param {string} type - Identificador del tipo default
     */
    setDefault(type) {
        this.defaultType = type;
        return this;
    }

    /**
     * Obtiene todos los tipos registrados
     * @returns {string[]}
     */
    getTypes() {
        return Array.from(this.types.keys());
    }

    /**
     * Obtiene todos los behaviors registrados
     * @returns {Map}
     */
    getAll() {
        return this.types;
    }
}

// Registries globales para cada tipo de entidad
export const BrickRegistry = new TypeRegistry('BrickRegistry');
export const BallRegistry = new TypeRegistry('BallRegistry');
export const BonusRegistry = new TypeRegistry('BonusRegistry');

export default TypeRegistry;
