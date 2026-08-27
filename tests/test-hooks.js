/**
 * Test hooks for OCP extensibility specs.
 *
 * Loaded ONLY when `?testHooks=1` is in the URL — see the inline loader
 * in index.html. Production never executes this file.
 *
 * Importing it (a) re-imports the behavior registries (no-op since main.js
 * already loaded them and ES modules are cached) and (b) exposes them on
 * `window.__game` so Playwright specs can register fake behaviors and read
 * gameplay state without modifying engine source.
 *
 * The shape of `window.__game` is the public contract for tests. Anything
 * added here should be consumed by an actual spec — do not export internals
 * speculatively.
 */
import { BrickRegistry, BallRegistry, BonusRegistry } from '../js/behaviors/index.js';
import * as game from '../game.js';
import * as physics from '../physics.js';
import * as rendering from '../rendering.js';
import * as config from '../config.js';
import * as collision from '../js/systems/CollisionSystem.js';
import * as brickSurfaces from '../js/systems/BrickSurfaces.js';
import { DIFFICULTY_SETTINGS } from '../config.js';

window.__game = {
    BrickRegistry,
    BallRegistry,
    BonusRegistry,
    get gameState() { return game.gameState; },
    game,
    physics,
    rendering,
    config,
    collision,
    brickSurfaces,
    DIFFICULTY_SETTINGS,
    ready: true,
};

console.log('[test-hooks] installed (window.__game)');
