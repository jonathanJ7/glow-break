/**
 * NeonPainter — primitivas de dibujo "neón" (estética tipo Tron) sobre un
 * contexto 2D, en un sistema de unidades: `u` px por unidad.
 *
 * Usa `shadowBlur`, que es CARO: estas funciones están pensadas para
 * pre-dibujar cuadros en una caché (ver VillainSpriteCache), no para
 * llamarse en cada frame del juego.
 */

const DARK_TOP = '#2a3450';
const DARK_MID = '#141a2b';
const DARK_BOTTOM = '#06080f';

/** Mezcla dos colores #rrggbb (k = 0 → a, k = 1 → b). */
export function mixColor(a, b, k) {
    const parse = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const A = parse(a), B = parse(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

export function createNeonPainter(ctx, u) {
    const metal = () => {
        const g = ctx.createLinearGradient(0, 0, 0, 64 * u);
        g.addColorStop(0, DARK_TOP); g.addColorStop(0.5, DARK_MID); g.addColorStop(1, DARK_BOTTOM);
        return g;
    };

    const p = {
        ctx, u,

        /** Traza un camino de puntos en unidades. */
        path(pts, close = true) {
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)));
            if (close) ctx.closePath();
        },

        /** Tubo de luz: halo de color + núcleo casi blanco. */
        tube(color, w, build, alpha = 1) {
            ctx.save();
            ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.shadowColor = color; ctx.shadowBlur = w * u * 3.5;
            ctx.strokeStyle = color; ctx.lineWidth = w * u;
            build(); ctx.stroke(); ctx.stroke();
            ctx.shadowBlur = w * u * 2;
            ctx.strokeStyle = mixColor(color, '#ffffff', 0.7); ctx.lineWidth = w * u * 0.38;
            build(); ctx.stroke();
            ctx.restore();
        },

        /** Relleno (por defecto: metal oscuro con degradé). */
        fill(build, style) {
            ctx.save(); ctx.fillStyle = style || metal(); build(); ctx.fill(); ctx.restore();
        },

        glowFill(build, color, alpha) {
            ctx.save();
            ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = 6 * u; ctx.fillStyle = color;
            build(); ctx.fill();
            ctx.restore();
        },

        /** Polígono sólido con borde de luz. */
        poly(pts, color, w = 1, filled = true) {
            if (filled) p.fill(() => p.path(pts));
            p.tube(color, w, () => p.path(pts));
        },

        line(pts, color, w = 1, alpha = 1) {
            p.tube(color, w, () => p.path(pts, false), alpha);
        },

        /** Extremidad gruesa: cuerpo oscuro con borde de luz y línea de energía. */
        limb(pts, W, color) {
            const build = () => p.path(pts, false);
            ctx.save();
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.shadowColor = color; ctx.shadowBlur = 3 * u; ctx.strokeStyle = color; ctx.lineWidth = W * u;
            build(); ctx.stroke();
            ctx.shadowBlur = 0; ctx.strokeStyle = mixColor(color, '#ffffff', 0.5); ctx.lineWidth = (W - 0.5) * u;
            build(); ctx.stroke();
            const g = ctx.createLinearGradient(0, 0, 0, 64 * u);
            g.addColorStop(0, DARK_TOP); g.addColorStop(1, '#090c16');
            ctx.strokeStyle = g; ctx.lineWidth = (W - 1.3) * u; build(); ctx.stroke();
            ctx.globalAlpha = 0.55; ctx.strokeStyle = color; ctx.lineWidth = 0.3 * u; build(); ctx.stroke();
            ctx.restore();
        },

        dot(x, y, r, color) {
            ctx.save();
            ctx.shadowColor = color; ctx.shadowBlur = r * u * 6; ctx.fillStyle = mixColor(color, '#ffffff', 0.6);
            ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2); ctx.fill(); ctx.fill();
            ctx.restore();
        },

        /** Bloque de luz con número (lo que arroja el villano). */
        brick(cx, cy, w, h, label, color = '#3ee0ff') {
            const pts = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
            p.fill(() => p.path(pts), '#06121a');
            p.glowFill(() => p.path(pts), color, 0.15);
            p.tube(color, 0.9, () => p.path(pts));
            ctx.save();
            ctx.font = `bold ${h * 0.62 * u}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = color; ctx.shadowBlur = 3 * u; ctx.fillStyle = '#ffffff';
            ctx.fillText(label, cx * u, (cy + 0.4) * u);
            ctx.restore();
        },

        /** Líneas de velocidad verticales. */
        speedLines(cx, y, w, color) {
            for (let i = -1; i <= 1; i++) p.line([[cx + i * w / 3, y], [cx + i * w / 3, y + 4]], color, 0.5, 0.6);
        },

        /**
         * Interferencia: copias fantasma desplazadas. Es ESTÁTICA (no
         * alterna cuadro a cuadro) para no producir destellos.
         */
        ghosted(draw) {
            ctx.save(); ctx.globalAlpha = 0.35; ctx.translate(2.5 * u, 0); draw(); ctx.restore();
            ctx.save(); ctx.globalAlpha = 0.25; ctx.translate(-2 * u, 0.5 * u); draw(); ctx.restore();
        },
    };
    return p;
}
