/**
 * Guide - Guía del juego accesible desde el menú principal.
 *
 * TRANSPARENCIA TOTAL: todo el contenido se genera desde las mismas
 * fuentes que usa el motor — los behaviors registrados (displayName,
 * describe(), getConfig()) y las constantes de config.js. Si un número
 * del juego cambia, la guía cambia sola; aquí no hay texto duplicado
 * que pueda quedar desactualizado.
 *
 * Contrato para tipos nuevos (Open/Closed): registra tu behavior con
 * `displayName` y `describe()` (números exactos, nada ambiguo) y la
 * guía lo lista automáticamente.
 */

import { BrickRegistry, BallRegistry, BonusRegistry } from '../behaviors/index.js';
import {
    DIFFICULTY_SETTINGS, SPAWN_SCHEDULE, COLS,
    MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER,
    COMBO_BALLS_PER, COMBO_MAX_REWARD,
    OVERDRIVE_MAX, OVERDRIVE_MULTIPLIER,
    BOSS_INTERVAL,
    STARTING_SHIELDS, MAX_SHIELDS, SHIELD_BURN_ROWS,
    HP_LOG_FACTOR,
} from '../../config.js';
import { FREEZE_TIME_MS, UNFREEZE_DISTANCE } from '../../input.js';

// Formatea una probabilidad 0..1 como porcentaje sin decimales de sobra
function pct(p) {
    const v = p * 100;
    return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + '%';
}

// Icono de un behavior: guideIcon > emoji > icon > punto de su color
function iconOf(behavior) {
    if (behavior.guideIcon) return behavior.guideIcon;
    if (behavior.emoji) return behavior.emoji;
    if (behavior.icon) return behavior.icon;
    return `<span class="guide-dot" style="background:${behavior.color || '#fff'}"></span>`;
}

function item(icon, name, text, extra = '') {
    return `
        <div class="guide-item">
            <div class="guide-item-icon">${icon}</div>
            <div class="guide-item-body">
                <div class="guide-item-name">${name}</div>
                <div class="guide-item-text">${text}</div>
                ${extra ? `<div class="guide-prob">${extra}</div>` : ''}
            </div>
        </div>`;
}

// Línea de aparición de un bloque: probabilidad exacta por dificultad
// (entre los bloques que se generan) y turno desde el que puede salir.
function brickSpawnLine(config) {
    const base = config.baseChance || 0;
    if (base <= 0) return '';
    const mult = config.difficultyMultiplier || {};
    const chances = ['easy', 'medium', 'hard']
        .map(d => `${DIFFICULTY_SETTINGS[d].emoji} ${pct(base * (mult[d] ?? 1))}`)
        .join(' · ');
    const fromTurn = (config.minTurn || 0) + 1;
    return `De cada bloque que aparece: ${chances}${fromTurn > 1 ? ` — desde el turno ${fromTurn}` : ''}`;
}

function buildBricksSection() {
    let html = '';
    for (const [, behavior] of BrickRegistry.getAll()) {
        html += item(
            iconOf(behavior),
            behavior.displayName || behavior.type,
            behavior.describe(),
            brickSpawnLine(behavior.getConfig())
        );
    }
    return html;
}

function buildBallsSection() {
    let html = '';
    for (const [, behavior] of BallRegistry.getAll()) {
        const icon = behavior.icon
            ? behavior.icon
            : `<span class="guide-dot" style="background:${behavior.color || '#fff'}"></span>`;
        html += item(icon, behavior.displayName || behavior.type, behavior.describe());
    }
    return html;
}

function buildBonusesSection() {
    let html = `<p class="guide-note">Los poderes aparecen como círculos en la fila nueva.
        Se recogen tocándolos con cualquier bola. Como máximo aparece 1 bonus de bolas y
        1 poder por turno, siempre en columnas libres (si no hay columna libre, no aparece).
        Ojo: si un bonus llega a la línea inferior sin que lo recojas, desaparece.</p>`;
    for (const [, behavior] of BonusRegistry.getAll()) {
        const icon = behavior.icon
            ? behavior.icon
            : `<span class="guide-dot" style="background:${behavior.color || '#fff'}">+N</span>`;
        html += item(icon, behavior.displayName || behavior.type, behavior.describe());
    }
    return html;
}

// Tabla del calendario determinista de apariciones por dificultad
function buildScheduleSection() {
    const rows = [];
    const diffs = ['easy', 'medium', 'hard'];

    // Recolectar todos los tipos que aparecen en algún schedule
    const allTypes = new Set();
    for (const d of diffs) {
        Object.keys(SPAWN_SCHEDULE[d].ballBonuses).forEach(t => allTypes.add(t));
        Object.keys(SPAWN_SCHEDULE[d].powerups).forEach(t => allTypes.add(t));
    }

    for (const type of allTypes) {
        const behavior = BonusRegistry.get(type);
        const icon = behavior.icon || '🟢';
        const name = behavior.displayName || type;
        const cells = diffs.map(d => {
            const cfg = SPAWN_SCHEDULE[d].ballBonuses[type] || SPAWN_SCHEDULE[d].powerups[type];
            if (!cfg) return '<td>—</td>';
            return `<td>turno ${cfg.first}, luego cada ${cfg.interval}</td>`;
        }).join('');
        rows.push(`<tr><td>${icon} ${name}</td>${cells}</tr>`);
    }

    return `
        <p class="guide-note">El calendario es 100% determinista: no hay azar en QUÉ aparece
        ni CUÁNDO (solo la columna es aleatoria). Si dos bonus de bolas coinciden en el mismo
        turno, aparece solo el más raro (prioridad: divisora → bomba → fuego → normal).
        Los poderes (fuerza y láser) usan un espacio aparte, así que un turno puede traer
        un bonus de bolas Y un poder a la vez.</p>
        <div class="guide-table-wrap">
        <table class="guide-table">
            <tr><th>Bonus</th><th>😊 Fácil</th><th>😤 Medio</th><th>💀 Difícil</th></tr>
            ${rows.join('')}
        </table>
        </div>
        <p class="guide-note">Si empiezas una partida en un turno alto, recibes todas las
        bolas de este calendario como si las hubieras recogido todas desde el turno 1.</p>`;
}

function buildDifficultySection() {
    const diffs = ['easy', 'medium', 'hard'];
    const rows = diffs.map(d => {
        const c = DIFFICULTY_SETTINGS[d];
        return `<tr>
            <td>${c.emoji} ${c.name}</td>
            <td>×${c.hpMultiplier}</td>
            <td>×${c.hpVariationMin} a ×${c.hpVariationMax}</td>
            <td>${pct(c.densityBase)} +${pct(c.densityGrowth)}/turno (máx ${pct(c.maxDensity)})</td>
            <td>${c.reinforcedRows ? 'Cada 10 turnos: fila con HP ×2' : '—'}</td>
        </tr>`;
    }).join('');

    return `
        <p class="guide-note">Fórmula exacta del HP: en el turno T, el HP base es
        <b>⌊T × (1 + ln(T+1) × ${HP_LOG_FACTOR}) × multiplicador⌋</b>. Cada bloque individual
        multiplica ese valor por un factor aleatorio dentro del rango de variación de la
        dificultad. La densidad es la probabilidad de que cada una de las ${COLS} columnas
        de la fila nueva tenga bloque (siempre queda al menos 1 columna libre).</p>
        <div class="guide-table-wrap">
        <table class="guide-table">
            <tr><th>Dificultad</th><th>HP</th><th>Variación</th><th>Densidad</th><th>Extra</th></tr>
            ${rows}
        </table>
        </div>`;
}

function buildMechanicsSection() {
    let html = '';
    html += item('🎯', 'Combo',
        `Cada bloque destruido en un mismo turno suma 1 al combo. Al terminar el turno recibes `
        + `+1 bola normal por cada ${COMBO_BALLS_PER} bloques destruidos (máximo +${COMBO_MAX_REWARD} `
        + `por turno). El contador vuelve a 0 al empezar el siguiente turno.`);
    html += item('⚡', 'Overdrive',
        `Cada bloque destruido carga 1 punto del medidor (la línea inferior se va pintando de `
        + `dorado). Al llegar a ${OVERDRIVE_MAX} puntos, tu siguiente disparo activa OVERDRIVE: `
        + `TODO el daño de ese turno se multiplica ×${OVERDRIVE_MULTIPLIER} (bolas, bombas y ondas `
        + `expansivas incluidas) y el medidor vuelve a 0. La carga sobrante no se pierde entre turnos.`);
    html += item('🛡️', 'Escudos',
        `Empiezas cada partida con ${STARTING_SHIELDS} (máximo ${MAX_SHIELDS}; cada jefe derrotado `
        + `da +1). Cuando una fila de bloques cruza la línea roja inferior, en vez de perder se `
        + `consume 1 escudo y se destruyen TODOS los bloques de las ${SHIELD_BURN_ROWS} filas de abajo. `
        + `Sin escudos, cruzar la línea es game over.`);
    html += item('👑', 'Jefes',
        `Cada ${BOSS_INTERVAL} turnos exactos la fila nueva trae un jefe en vez de bloques `
        + `(ver detalles en la sección Bloques).`);
    html += item('🏆', 'Récords',
        `Se guarda tu mejor turno por dificultad en este dispositivo. Solo cuenta si empezaste `
        + `la partida en el turno 1 (empezar en turno alto no puntúa).`);
    return html;
}

function buildControlsSection() {
    let html = '';
    html += item('👆', 'Apuntar y disparar',
        'Arrastra el dedo para apuntar (la línea punteada muestra la trayectoria real, con los '
        + 'mismos rebotes que tendrá la bola). Suelta para disparar: las bolas salen una tras otra '
        + `en el mismo ángulo. Máximo ${MAX_BALLS_ON_SCREEN} bolas por disparo.`);
    html += item('❄️', 'Apuntado fino (congelación)',
        `Mantén el dedo quieto mientras apuntas y el puntero se ralentiza progresivamente hasta `
        + `congelarse a los ${FREEZE_TIME_MS / 1000} segundos (la línea punteada hace de barra de `
        + `carga). Congelado, el ángulo queda bloqueado; para soltarlo, aleja el dedo más de `
        + `${UNFREEZE_DISTANCE} píxeles del punto donde se congeló.`);
    html += item('⏩', 'Acelerar',
        `Con las bolas en el aire, mantén presionada la pantalla para que todo vaya ×${FAST_SPEED_MULTIPLIER}.`);
    html += item('⏭️', 'Saltar turno',
        'El botón "Saltar turno" descarta las bolas que quedan en el aire y en cola, y pasa al '
        + 'siguiente turno inmediatamente. No pierdes bolas del inventario, solo el resto del disparo.');
    html += item('🔁', 'Ciclo del turno',
        'Disparas → las bolas rebotan y dañan → cuando la última aterriza, el turno termina: '
        + 'los bloques bajan 1 fila, aparece una fila nueva arriba, y el lanzador se mueve a donde '
        + 'aterrizó la primera bola de tu disparo.');
    return html;
}

function buildGuideContent() {
    const container = document.getElementById('guideContent');
    container.innerHTML = `
        <div class="guide-section">
            <h3>🕹️ Cómo se juega</h3>
            ${buildControlsSection()}
        </div>
        <div class="guide-section">
            <h3>✨ Mecánicas</h3>
            ${buildMechanicsSection()}
        </div>
        <div class="guide-section">
            <h3>🧱 Bloques</h3>
            ${buildBricksSection()}
        </div>
        <div class="guide-section">
            <h3>⚪ Bolas</h3>
            ${buildBallsSection()}
        </div>
        <div class="guide-section">
            <h3>🎁 Poderes (bonus)</h3>
            ${buildBonusesSection()}
        </div>
        <div class="guide-section">
            <h3>📅 Calendario de apariciones</h3>
            ${buildScheduleSection()}
        </div>
        <div class="guide-section">
            <h3>📊 Dificultades y números</h3>
            ${buildDifficultySection()}
        </div>`;
}

export function setupGuide() {
    buildGuideContent();

    const screen = document.getElementById('guideScreen');
    document.getElementById('guideBtn').addEventListener('click', () => {
        screen.classList.add('open');
    });
    document.getElementById('guideBackBtn').addEventListener('click', () => {
        screen.classList.remove('open');
    });
}
