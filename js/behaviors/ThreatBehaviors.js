/**
 * ThreatBehaviors - Amenazas que se ACUMULAN con las eras.
 *
 * Cada era (ver js/systems/Eras.js y ERA_SETTINGS en config.js) suma la
 * siguiente amenaza según `order`; las anteriores siguen activas. Cuando
 * están todas, cada era nueva sube de nivel una de ellas.
 *
 * Contrato de una amenaza (todos los hooks son opcionales salvo los
 * marcados; ver threatBase en Registry.js):
 *   - type, displayName, icon, order                (requeridos)
 *   - levels: [{...params nivel 1}, {...nivel 2}, ...] (requerido)
 *   - describe(level): texto EXACTO del nivel, con los números de `levels`
 *   - onRowGenerated(newBricks, ctx)  marcar bloques de la fila nueva
 *   - onTurnEnd(ctx)                  efecto de fin de turno (antes de bajar)
 *   - getExtraAdvance(ctx)            filas extra que baja el tablero
 *   - modifyDamage(brick, dmg, source, ctx)
 *   - hidesBrick(brick, ctx)          ocultar HP/tipo del bloque
 *   - renderBrick(ctx2d, brick, rect, ctx) / renderBoard(ctx2d, ctx)
 *   - getHudHint(ctx)                 texto corto al lado del ícono en el HUD
 *
 * Estado por bloque (se guarda en la partida): brick.corrupt,
 * brick.crawler, brick.shellUntil, brick.revealed.
 */

import { ThreatRegistry } from '../core/Registry.js';

function pickRandom(list, count) {
    const pool = list.slice();
    const out = [];
    while (out.length < count && pool.length > 0) {
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
}

function isBoss(brick) {
    return brick.type === 'boss';
}

// ============================================
// ☣️ CORRUPCIÓN - bloques que contagian a sus vecinos
// ============================================
const CorruptionThreat = {
    type: 'corruption',
    order: 1,
    displayName: 'Corrupción',
    icon: '☣️',
    color: '#c026d3',
    levels: [
        { seedEvery: 5, spread: 1 },
        { seedEvery: 3, spread: 1 },
        { seedEvery: 2, spread: 2 },
    ],

    describe(level) {
        const p = this.levels[level - 1];
        return `Cada ${p.seedEvery} turnos, un bloque de la fila nueva nace corrupto (borde violeta, ☣). `
            + `Al final de cada turno, cada corrupto vivo contagia a ${p.spread === 1 ? '1 vecino' : `${p.spread} vecinos`} `
            + 'pegado (arriba, abajo o a los lados) elegido al azar: el contagiado se vuelve corrupto y su HP '
            + 'sube al HP actual del que lo contagió si este era mayor. Los jefes no se corrompen. '
            + 'Si no los matás rápido, se comen el tablero.';
    },

    onRowGenerated(newBricks, ctx) {
        if (ctx.turn % ctx.params.seedEvery !== 0) return;
        const candidates = newBricks.filter(b => !isBoss(b) && !b.corrupt);
        for (const b of pickRandom(candidates, 1)) b.corrupt = true;
    },

    onTurnEnd(ctx) {
        const { gameState, grid, helpers, params } = ctx;
        // Snapshot: los recién contagiados recién contagian el turno que viene
        const sources = gameState.bricks.filter(b => b.corrupt && b.hp > 0);
        let infected = 0;
        for (const src of sources) {
            const targets = grid.neighbors(src).filter(n => !n.corrupt && !isBoss(n) && n.hp > 0);
            for (const target of pickRandom(targets, params.spread)) {
                target.corrupt = true;
                if (src.hp > target.hp) target.hp = src.hp;
                target.maxHp = Math.max(target.maxHp, target.hp);
                helpers.createParticles(target.x + target.width / 2, target.y + target.height / 2, this.color, 6);
                infected++;
            }
        }
        if (infected > 0) {
            const cell = helpers.getCellSize();
            helpers.addFloatingText(helpers.getWidth() / 2, helpers.getTopOffset() + cell * 0.5,
                `☣️ +${infected} corrupto${infected > 1 ? 's' : ''}`, { color: '#e879f9', size: 14 });
        }
    },

    renderBrick(ctx2d, brick, rect, ctx) {
        if (!brick.corrupt) return;
        const { getFontSize } = ctx.helpers;
        const pulse = 0.55 + Math.sin(performance.now() * 0.006) * 0.3;
        ctx2d.save();
        ctx2d.fillStyle = `rgba(192, 38, 211, ${0.18 + pulse * 0.12})`;
        ctx2d.beginPath();
        ctx2d.roundRect(rect.x, rect.y, rect.width, rect.height, rect.radii);
        ctx2d.fill();
        ctx2d.strokeStyle = `rgba(232, 121, 249, ${pulse})`;
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.roundRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, rect.radii);
        ctx2d.stroke();
        ctx2d.fillStyle = '#f5d0fe';
        ctx2d.font = `bold ${getFontSize(10)}px Arial`;
        ctx2d.textAlign = 'left';
        ctx2d.textBaseline = 'top';
        ctx2d.fillText('☣', rect.x + 3, rect.y + 2);
        ctx2d.restore();
    },

};

// ============================================
// 🌊 OLEADAS - el tablero avanza 2 filas
// ============================================
const WavesThreat = {
    type: 'waves',
    order: 2,
    displayName: 'Oleadas',
    icon: '🌊',
    color: '#38bdf8',
    levels: [
        { every: 6 },
        { every: 5 },
        { every: 4 },
    ],

    describe(level) {
        const p = this.levels[level - 1];
        return `En los turnos múltiplos de ${p.every} llega una oleada: al terminar ese turno el tablero `
            + 'baja 2 filas en vez de 1 y entra una fila extra de bloques (sin bonus). Se avisa durante '
            + 'todo el turno de la oleada, y el HUD muestra cuántos turnos faltan.';
    },

    isWaveTurn(turn, params) {
        return turn % params.every === 0;
    },

    getExtraAdvance(ctx) {
        return this.isWaveTurn(ctx.turn, ctx.params) ? 1 : 0;
    },

    getHudHint(ctx) {
        if (this.isWaveTurn(ctx.turn, ctx.params)) return '¡YA!';
        return String(ctx.params.every - (ctx.turn % ctx.params.every));
    },

    renderBoard(ctx2d, ctx) {
        if (!this.isWaveTurn(ctx.turn, ctx.params) || ctx.gameState.gameOver) return;
        const { getLeftBorder, getRightBorder, getTopOffset, getBottomLine, getFontSize } = ctx.helpers;
        const left = getLeftBorder();
        const right = getRightBorder();
        const top = getTopOffset() - 15;
        const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.4;

        ctx2d.save();
        ctx2d.strokeStyle = `rgba(56, 189, 248, ${pulse})`;
        ctx2d.lineWidth = 3;
        ctx2d.shadowColor = '#38bdf8';
        ctx2d.shadowBlur = 10;
        ctx2d.strokeRect(left, top, right - left, getBottomLine() - top + 10);
        ctx2d.shadowBlur = 0;
        if (!ctx.gameState.isShooting) {
            ctx2d.fillStyle = `rgba(125, 211, 252, ${0.6 + pulse * 0.4})`;
            ctx2d.font = `bold ${getFontSize(12)}px Arial`;
            ctx2d.textAlign = 'center';
            ctx2d.textBaseline = 'bottom';
            ctx2d.fillText('🌊 ¡OLEADA! Al terminar este turno bajan 2 filas', (left + right) / 2, getBottomLine() - 24);
        }
        ctx2d.restore();
    },
};

// ============================================
// 🧬 ADAPTACIÓN - caparazón contra el daño de área
// ============================================
// El láser, la bomba y las explosiones hacen daño PROPORCIONAL al HP máximo,
// así que la curva de HP nunca los alcanza. Con esta amenaza, cada bloque
// que recibe daño de área "se adapta" y lo ignora por un tiempo.
const AREA_SOURCES = new Set(['bomb', 'explosion', 'laser']);

const AdaptationThreat = {
    type: 'adaptation',
    order: 3,
    displayName: 'Adaptación',
    icon: '🧬',
    color: '#2dd4bf',
    levels: [
        { shellTurns: 1, bornShelled: false },
        { shellTurns: 2, bornShelled: false },
        { shellTurns: 2, bornShelled: true },
    ],

    describe(level) {
        const p = this.levels[level - 1];
        return 'Cuando un bloque recibe daño de ÁREA (láser, área de la bola bomba, explosiones y onda del '
            + 'jefe), le crece un caparazón (borde turquesa) y queda inmune a todo daño de área durante el '
            + `resto de ese turno y ${p.shellTurns === 1 ? 'el turno siguiente' : `los ${p.shellTurns} turnos siguientes`}. `
            + 'Los golpes directos de bola le pegan siempre.'
            + (p.bornShelled ? ` Además, todos los bloques nuevos nacen con caparazón por ${p.shellTurns} turnos.` : '');
    },

    hasShell(brick, turn) {
        return Number.isFinite(brick.shellUntil) && brick.shellUntil >= turn;
    },

    modifyDamage(brick, damage, source, ctx) {
        if (!AREA_SOURCES.has(source) || damage <= 0) return damage;
        if (this.hasShell(brick, ctx.turn)) {
            ctx.helpers.createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, this.color, 2);
            return 0;
        }
        brick.shellUntil = ctx.turn + ctx.params.shellTurns;
        return damage;
    },

    onRowGenerated(newBricks, ctx) {
        if (!ctx.params.bornShelled) return;
        for (const b of newBricks) b.shellUntil = ctx.turn + ctx.params.shellTurns;
    },

    renderBrick(ctx2d, brick, rect, ctx) {
        if (!this.hasShell(brick, ctx.turn)) return;
        ctx2d.save();
        ctx2d.strokeStyle = 'rgba(45, 212, 191, 0.85)';
        ctx2d.lineWidth = 2;
        ctx2d.setLineDash([4, 3]);
        ctx2d.shadowColor = '#2dd4bf';
        ctx2d.shadowBlur = 6;
        const radii = rect.radii.map(r => (r > 0 ? 3 : 0));
        ctx2d.beginPath();
        ctx2d.roundRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, radii);
        ctx2d.stroke();
        ctx2d.restore();
    },
};

// ============================================
// 🐛 REPTADORES - bloques que bajan más rápido
// ============================================
const CrawlersThreat = {
    type: 'crawlers',
    order: 4,
    displayName: 'Reptadores',
    icon: '🐛',
    color: '#84cc16',
    levels: [
        { chance: 0.5, perRow: 1 },
        { chance: 0.75, perRow: 1 },
        { chance: 0.75, perRow: 2 },
    ],

    describe(level) {
        const p = this.levels[level - 1];
        return `En cada fila nueva (salvo la del jefe) se ${p.perRow === 1 ? 'elige 1 bloque' : `eligen ${p.perRow} bloques`} `
            + `al azar y cada uno tiene un ${Math.round(p.chance * 100)}% de ser reptador (🐛). `
            + 'Al final de cada turno, si la celda de abajo está libre, el reptador baja una fila EXTRA '
            + '(antes de que baje todo el tablero) y aplasta el bonus que hubiera ahí.';
    },

    onRowGenerated(newBricks, ctx) {
        const candidates = newBricks.filter(b => !isBoss(b));
        if (candidates.length === 0) return;
        const picks = pickRandom(candidates, ctx.params.perRow);
        for (const b of picks) {
            if (Math.random() < ctx.params.chance) b.crawler = true;
        }
    },

    onTurnEnd(ctx) {
        const { gameState, grid, helpers } = ctx;
        const cell = helpers.getCellSize();
        const left = helpers.getLeftBorder();
        const top = helpers.getTopOffset();
        // De abajo hacia arriba: un reptador encima de otro puede seguirlo
        const crawlers = gameState.bricks
            .filter(b => b.crawler && b.hp > 0 && !isBoss(b))
            .sort((a, b) => b.y - a.y);

        for (const b of crawlers) {
            const row = grid.rowOf(b);
            if (grid.get(b.col, row + 1)) continue;
            grid.move(b, row, row + 1);
            b.y += cell;
            // Aplasta el bonus de esa celda
            gameState.bonuses = gameState.bonuses.filter(bonus =>
                !(Math.floor((bonus.x - left) / cell) === b.col
                  && Math.floor((bonus.y - top) / cell) === row + 1));
            helpers.createParticles(b.x + b.width / 2, b.y, this.color, 4);
        }
    },

    renderBrick(ctx2d, brick, rect, ctx) {
        if (!brick.crawler) return;
        const { getFontSize } = ctx.helpers;
        ctx2d.save();
        ctx2d.font = `${getFontSize(10)}px Arial`;
        ctx2d.textAlign = 'left';
        ctx2d.textBaseline = 'bottom';
        ctx2d.fillText('🐛', rect.x + 2, rect.y + rect.height - 1);
        // Chevron hacia abajo
        const cx = rect.x + rect.width - 9;
        const cy = rect.y + rect.height - 8;
        ctx2d.strokeStyle = 'rgba(190, 242, 100, 0.9)';
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.moveTo(cx - 4, cy - 2);
        ctx2d.lineTo(cx, cy + 2);
        ctx2d.lineTo(cx + 4, cy - 2);
        ctx2d.stroke();
        ctx2d.restore();
    },
};

// ============================================
// 🌫️ NIEBLA - las filas de arriba no muestran información
// ============================================
const FogThreat = {
    type: 'fog',
    order: 5,
    displayName: 'Niebla',
    icon: '🌫️',
    color: '#94a3b8',
    levels: [
        { rows: 3 },
        { rows: 4 },
        { rows: 5 },
    ],

    describe(level) {
        const p = this.levels[level - 1];
        return `Los bloques de las ${p.rows} filas de arriba se ven grises con "?": no muestran su HP, `
            + 'su color ni su tipo (ni corrupción, reptador o caparazón). Se revelan para siempre cuando '
            + `bajan de la fila ${p.rows} o cuando reciben cualquier golpe. La colisión no cambia.`;
    },

    rowOf(brick, helpers) {
        return Math.round((brick.y - helpers.getTopOffset()) / helpers.getCellSize());
    },

    hidesBrick(brick, ctx) {
        if (brick.revealed) return false;
        return this.rowOf(brick, ctx.helpers) < ctx.params.rows;
    },

    renderBoard(ctx2d, ctx) {
        const { getLeftBorder, getRightBorder, getTopOffset, getCellSize } = ctx.helpers;
        const top = getTopOffset() - 15;
        const bottom = getTopOffset() + getCellSize() * ctx.params.rows;
        const grad = ctx2d.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, 'rgba(148, 163, 184, 0.16)');
        grad.addColorStop(1, 'rgba(148, 163, 184, 0)');
        ctx2d.save();
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(getLeftBorder(), top, getRightBorder() - getLeftBorder(), bottom - top);
        ctx2d.restore();
    },
};

ThreatRegistry
    .register('corruption', CorruptionThreat)
    .register('waves', WavesThreat)
    .register('adaptation', AdaptationThreat)
    .register('crawlers', CrawlersThreat)
    .register('fog', FogThreat);

export { CorruptionThreat, WavesThreat, AdaptationThreat, CrawlersThreat, FogThreat };
