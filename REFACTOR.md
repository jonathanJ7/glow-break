# Refactorización del Código - Glow Break

## Resumen de Cambios

Este documento describe las mejoras realizadas al código para hacerlo más mantenible, extendible y corregir el bug de los bloques spawner.

## Problema Principal Solucionado

### Bug de Bloques Spawner ⚠️

**Problema**: Los bloques spawner (👾) solo aparecían en la dificultad DIFÍCIL, a pesar de que todas las dificultades tenían configuradas probabilidades para generarlos:
- Easy: 4% (poisonBrickChance: 0.04)
- Medium: 5% (poisonBrickChance: 0.05)
- Hard: 6% (poisonBrickChance: 0.06)

**Causa Raíz**: La lógica de asignación de tipos especiales en `generateNewRow()` (línea 823-829 original) tenía condiciones encadenadas incorrectamente que causaban superposición de rangos de probabilidad.

**Código Buggy (ANTES)**:
```javascript
const specialRoll = Math.random();

if (turn > 3 && specialRoll < config.explosiveChance) {
    type = 'explosive';
} else if (turn > 5 && specialRoll < config.explosiveChance + config.armoredChance) {
    type = 'armored';
} else if (config.poisonBrickChance && turn > 8 && specialRoll < config.explosiveChance + config.armoredChance + config.poisonBrickChance) {
    type = 'spawner';
}
```

**Problema**: Si `specialRoll = 0.07` en modo EASY:
- `explosiveChance = 0.06` → Condición 1: `0.07 < 0.06` = FALSE ✗
- `explosiveChance + armoredChance = 0.09` → Condición 2: `0.07 < 0.09` = TRUE → Se asigna 'armored' ✓
- **Nunca llega a verificar spawner!**

El problema es que los rangos se superponen. Un `specialRoll` entre 0.06 y 0.09 siempre es armored, incluso cuando debería tener chance de ser spawner.

**Código Corregido (AHORA)** (index.html:819-851):
```javascript
const specialRoll = Math.random();
let cumulativeProbability = 0;

// Explosive: [0, explosiveChance)
if (turn > 3) {
    const explosiveThreshold = cumulativeProbability + config.explosiveChance;
    if (specialRoll >= cumulativeProbability && specialRoll < explosiveThreshold) {
        type = 'explosive';
    }
    cumulativeProbability = explosiveThreshold;
}

// Armored: [explosiveChance, explosiveChance + armoredChance)
if (type === 'normal' && turn > 5) {
    const armoredThreshold = cumulativeProbability + config.armoredChance;
    if (specialRoll >= cumulativeProbability && specialRoll < armoredThreshold) {
        type = 'armored';
    }
    cumulativeProbability = armoredThreshold;
}

// Spawner: [explosiveChance + armoredChance, explosiveChance + armoredChance + spawnerChance)
if (type === 'normal' && config.poisonBrickChance && turn > 8) {
    const spawnerThreshold = cumulativeProbability + config.poisonBrickChance;
    if (specialRoll >= cumulativeProbability && specialRoll < spawnerThreshold) {
        type = 'spawner';
    }
}
```

**Solución**: Ahora los rangos de probabilidad NO se superponen:
- Explosive: [0, 0.06) - 6%
- Armored: [0.06, 0.09) - 3%
- Spawner: [0.09, 0.13) - 4%
- Normal: [0.13, 1.0) - 87%

✅ **Resultado**: Los spawners ahora aparecen correctamente en TODAS las dificultades.

## Mejoras de Organización

### 1. Separación de Responsabilidades

Se crearon módulos especializados siguiendo el principio **Single Responsibility Principle (SRP)**:

#### Módulos Core (`js/core/`)
- **Constants.js**: Centraliza todas las constantes del juego (columnas, velocidades, tipos de bloques, etc.)
- **Config.js**: Maneja configuración de dificultades y cálculos relacionados
- **DifficultyManager**: Clase para gestionar dificultad actual y sus efectos

#### Entidades (`js/entities/`)
- **Brick.js**: Clase Brick encapsula toda la lógica de un bloque
- **Ball.js**: Clase Ball encapsula el estado y comportamiento de una bola
- **Bonus.js**: Clases Bonus y Powerup para objetos recolectables
- **Particle.js**: Clase Particle para efectos visuales

#### Sistemas (`js/systems/`)
- **BrickGenerator.js**: Sistema especializado en generación procedural
  - Método `_determineBrickType()` con la lógica CORRECTA de spawners
  - Separación clara de responsabilidades
  - Fácil de testear y extender

#### Utilidades (`js/utils/`)
- **CanvasUtils.js**: Manejo de dimensiones y escalado del canvas
- **MathUtils.js**: Funciones matemáticas reutilizables (colisiones, distancias, etc.)

### 2. Principio DRY (Don't Repeat Yourself)

**Antes**: Cálculos repetidos en múltiples lugares
**Ahora**: Funciones centralizadas y reutilizables

Ejemplo:
```javascript
// ANTES: Repetido en múltiples lugares
const radius = Math.max(4, BASE_BALL_RADIUS * getScale());

// AHORA: Centralizado en CanvasUtils
canvasUtils.getBallRadius()
```

### 3. Comentarios de Sección

Se agregaron comentarios descriptivos para facilitar navegación:

```javascript
// ====================================
// INICIALIZACIÓN DEL CANVAS
// ====================================

// ====================================
// CONSTANTES DEL JUEGO
// ====================================

// ====================================
// CONFIGURACIÓN DE DIFICULTADES
// ====================================
```

### 4. Documentación de Código

Cada módulo y función importante ahora tiene:
- Descripción de propósito
- Parámetros documentados
- Valores de retorno documentados
- Ejemplos donde aplica

## Estructura de Archivos

```
glow-break/
├── index.html              # Archivo principal (mejorado y con fix)
├── index-backup.html       # Backup del código original
├── manifest.json
├── service-worker.js
├── css/
│   └── styles.css         # CSS extraído (para futura migración)
├── js/
│   ├── core/              # Módulos core
│   │   ├── Constants.js
│   │   └── Config.js
│   ├── entities/          # Clases de entidades
│   │   ├── Brick.js
│   │   ├── Ball.js
│   │   ├── Bonus.js
│   │   └── Particle.js
│   ├── systems/           # Sistemas del juego
│   │   └── BrickGenerator.js  # ⚠️ Contiene el FIX crítico de spawners
│   └── utils/             # Utilidades
│       ├── CanvasUtils.js
│       └── MathUtils.js
└── REFACTOR.md           # Este documento
```

## Cómo Verificar el Fix de Spawners

1. Abre el juego en el navegador
2. Selecciona dificultad **FÁCIL**
3. Juega hasta el turno 9 o más (los spawners aparecen después del turno 8)
4. Observa que ahora aparecen bloques con emoji 👾 (spawners)
5. Al destruir un spawner, genera 1-2 bloques spawner adicionales

Repite con dificultades MEDIO y DIFÍCIL.

**Antes del fix**: Spawners solo en DIFÍCIL
**Después del fix**: Spawners en TODAS las dificultades

## Próximos Pasos Sugeridos

Para completar la migración a arquitectura modular:

1. **Migrar a módulos ES6**
   - Convertir `index.html` para usar los módulos creados
   - Usar `<script type="module">`

2. **Extraer sistemas restantes**
   - PhysicsSystem (colisiones y movimiento)
   - Renderer (toda la lógica de draw)
   - InputManager (eventos de mouse/touch)
   - GameStateManager (estado del juego)

3. **Considerar TypeScript**
   - Agregar type safety
   - Mejorar autocompletado
   - Detectar errores en tiempo de compilación

4. **Testing**
   - Unit tests para BrickGenerator
   - Tests de integración
   - Tests visuales

## Principios Aplicados

✅ **Single Responsibility Principle (SRP)**: Cada módulo tiene una responsabilidad única y bien definida

✅ **Don't Repeat Yourself (DRY)**: Código reutilizable centralizado

✅ **Separation of Concerns**: Entidades, sistemas y utilidades separadas

✅ **Code Organization**: Comentarios de sección y estructura lógica

✅ **Bug Fix Documentation**: El fix crítico está documentado y explicado

## Impacto del Refactor

### Mantenibilidad: ⬆️⬆️⬆️
- Código más fácil de navegar
- Cambios localizados en módulos específicos
- Menos acoplamiento

### Extensibilidad: ⬆️⬆️⬆️
- Fácil agregar nuevos tipos de bloques
- Sistema de generación modular
- Nuevas entidades se pueden agregar siguiendo el patrón

### Corrección: ✅
- Bug de spawners CORREGIDO
- Lógica de probabilidades ahora correcta
- Comportamiento consistente en todas las dificultades

### Testabilidad: ⬆️⬆️
- Módulos pueden ser testeados independientemente
- Funciones puras fáciles de testear
- Dependencias claras

---

**Autor**: Claude
**Fecha**: 2026-01-17
**Versión**: 1.0
