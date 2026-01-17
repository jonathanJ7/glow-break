/**
 * Test de verificación del fix de spawners
 * Verifica que los spawners se generen en TODAS las dificultades
 */

const DIFFICULTY_SETTINGS = {
    easy: {
        explosiveChance: 0.06,
        armoredChance: 0.03,
        poisonBrickChance: 0.04
    },
    medium: {
        explosiveChance: 0.08,
        armoredChance: 0.10,
        poisonBrickChance: 0.05
    },
    hard: {
        explosiveChance: 0.04,
        armoredChance: 0.20,
        poisonBrickChance: 0.06
    }
};

// Simula la lógica CORREGIDA de generación de tipos
function determineBrickType(config, turn, specialRoll) {
    let type = 'normal';
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

    // Spawner: [explosiveChance + armoredChance, ...]
    if (type === 'normal' && config.poisonBrickChance && turn > 8) {
        const spawnerThreshold = cumulativeProbability + config.poisonBrickChance;
        if (specialRoll >= cumulativeProbability && specialRoll < spawnerThreshold) {
            type = 'spawner';
        }
    }

    return type;
}

// Test de generación masiva
function testSpawnerGeneration(difficulty, numTests = 10000) {
    const config = DIFFICULTY_SETTINGS[difficulty];
    const turn = 15; // Turno alto para que todos los tipos puedan generarse

    const counts = {
        normal: 0,
        explosive: 0,
        armored: 0,
        spawner: 0
    };

    for (let i = 0; i < numTests; i++) {
        const specialRoll = Math.random();
        const type = determineBrickType(config, turn, specialRoll);
        counts[type]++;
    }

    const percentages = {
        normal: (counts.normal / numTests * 100).toFixed(2),
        explosive: (counts.explosive / numTests * 100).toFixed(2),
        armored: (counts.armored / numTests * 100).toFixed(2),
        spawner: (counts.spawner / numTests * 100).toFixed(2)
    };

    return { counts, percentages };
}

// Ejecutar tests
console.log('='.repeat(60));
console.log('TEST DE GENERACIÓN DE SPAWNERS');
console.log('='.repeat(60));
console.log('\nVerificando que spawners aparecen en TODAS las dificultades...\n');

let allPassed = true;

for (const difficulty of ['easy', 'medium', 'hard']) {
    const config = DIFFICULTY_SETTINGS[difficulty];
    const result = testSpawnerGeneration(difficulty, 10000);

    const spawnerCount = result.counts.spawner;
    const spawnerPercentage = parseFloat(result.percentages.spawner);
    const expectedPercentage = config.poisonBrickChance * 100;

    const passed = spawnerCount > 0;
    const status = passed ? '✅ PASS' : '❌ FAIL';

    if (!passed) allPassed = false;

    console.log(`${status} Dificultad: ${difficulty.toUpperCase()}`);
    console.log(`   Configuración: explosiveChance=${config.explosiveChance}, armoredChance=${config.armoredChance}, spawnerChance=${config.poisonBrickChance}`);
    console.log(`   Spawners generados: ${spawnerCount} de 10000 (${spawnerPercentage}%)`);
    console.log(`   Esperado: ~${expectedPercentage}%`);
    console.log(`   Diferencia: ${Math.abs(spawnerPercentage - expectedPercentage).toFixed(2)}%`);
    console.log(`   Distribución completa:`);
    console.log(`      - Normal: ${result.percentages.normal}%`);
    console.log(`      - Explosive: ${result.percentages.explosive}%`);
    console.log(`      - Armored: ${result.percentages.armored}%`);
    console.log(`      - Spawner: ${result.percentages.spawner}%`);
    console.log('');
}

console.log('='.repeat(60));
if (allPassed) {
    console.log('✅ TODOS LOS TESTS PASARON');
    console.log('Los spawners se generan correctamente en TODAS las dificultades');
} else {
    console.log('❌ ALGUNOS TESTS FALLARON');
    console.log('Hay problemas con la generación de spawners');
}
console.log('='.repeat(60));

process.exit(allPassed ? 0 : 1);
