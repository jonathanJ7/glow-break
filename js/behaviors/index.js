/**
 * Behaviors Index - Exporta todos los behaviors y registries
 *
 * Importa este archivo para inicializar todos los registros
 * y tener acceso a los behaviors.
 */

// Importar todos los behaviors (esto los registra automáticamente)
import './BrickBehaviors.js';
import './BallBehaviors.js';
import './BonusBehaviors.js';

// Re-exportar los registries
export { BrickRegistry, BallRegistry, BonusRegistry } from '../core/Registry.js';

// Re-exportar behaviors individuales por si se necesitan
export {
    NormalBrickBehavior,
    ExplosiveBrickBehavior,
    ArmoredBrickBehavior,
    SpawnerBrickBehavior,
    RegeneratorBrickBehavior
} from './BrickBehaviors.js';

export {
    NormalBallBehavior,
    FireballBehavior,
    SplitterBehavior,
    StrengthBallBehavior
} from './BallBehaviors.js';

export {
    BallBonusBehavior,
    FireballBonusBehavior,
    SplitterBonusBehavior,
    HorizontalLaserBehavior,
    StrengthBonusBehavior
} from './BonusBehaviors.js';
