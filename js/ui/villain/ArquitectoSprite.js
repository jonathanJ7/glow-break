/**
 * ARQUITECTO — el villano del espacio libre. Figura alta de circuitos con
 * capa de luz: arrogante, teatral y muy mal perdedor. Construye (y arroja)
 * el muro de bloques.
 *
 * Dibujo vectorial neón en una caja de 64x64 unidades (ver NeonPainter).
 * `drawArquitecto` es determinista: el mismo (pose, t, opts) produce el
 * mismo dibujo, por eso sus cuadros se pueden pre-dibujar y cachear.
 */
import { createNeonPainter } from './NeonPainter.js';

const RED = '#ff3b5c';
const RED_FURY = '#ff1f3d';
const WARM = '#ff9a7a';   // detalles cálidos (emblema, guanteletes)
const CYAN = '#3ee0ff';   // bloques y cubos: el color del lado del jugador

/** Margen (en unidades) alrededor de la caja de 64: lugar para el brillo. */
export const SPRITE_MARGIN = 8;
export const SPRITE_UNITS = 64 + SPRITE_MARGIN * 2;

/**
 * Cuadros por pose para la caché. Los bucles se indexan por tiempo
 * absoluto (`loopMs`); las poses con duración, por su progreso.
 */
export const POSE_FRAMES = {
    idle:    { frames: 12, loopMs: 1800 },
    mira:    { frames: 8, loopMs: 1800 },
    burla:   { frames: 6, loopMs: 1000 },
    golpe:   { frames: 4, loopMs: 400 },
    furia:   { frames: 4, loopMs: 400 },
    prepara: { frames: 6, byProgress: true },
    lanza:   { frames: 1, byProgress: true },
};

// Brazos: [hombro, codo, mano]; hand*: ángulo del guantelete.
const POSES = {
    idle:    { lean: 0, head: [0, 0, 0], mood: 'smug', crossed: true, flare: 0, stance: 0 },
    mira:    { lean: 0.08, head: [1, 1.2, 0.18], mood: 'normal', armL: [[21, 21], [19, 31], [38, 33]], armR: [[43, 21], [46, 31], [36, 18]], handL: 0, handR: -1.2, flare: 0, stance: 0 },
    prepara: { lean: -0.04, head: [0.5, -0.8, -0.12], mood: 'smug', armL: [[21, 21], [14, 29], [23, 37]], armR: [[43, 21], [50, 12], [48, 4]], handL: 0.6, handR: -1.6, flare: 1, stance: 1 },
    lanza:   { lean: 0.16, head: [1, 1.5, 0.1], mood: 'angry', armL: [[21, 21], [13, 25], [8, 20]], armR: [[43, 21], [52, 27], [49, 37]], handL: -2.4, handR: 1.4, flare: 5, stance: 3, dy: 2 },
    burla:   { lean: -0.1, head: [-0.5, -1.5, -0.25], mood: 'laugh', armL: [[21, 21], [19, 31], [31, 34]], armR: [[43, 21], [51, 26], [56, 33]], handL: 0.2, handR: 0.9, point: true, flare: 1, stance: 1 },
    golpe:   { lean: -0.2, head: [-1.5, -0.5, -0.3], mood: 'hurt', armL: [[21, 21], [17, 29], [21, 36]], armR: [[43, 21], [41, 15], [33, 10]], handL: 0.4, handR: -2.6, flare: 3, stance: 2 },
    furia:   { lean: 0, head: [0, -0.5, 0], mood: 'angry', armL: [[21, 21], [11, 14], [9, 5]], armR: [[43, 21], [53, 14], [55, 5]], handL: -1.6, handR: -1.6, fists: true, flare: 9, stance: 4 },
};

/** Punto (en unidades de la caja) desde donde sale el bloque arrojado. */
export const THROW_ORIGIN = { x: 46, y: 40 };

function rotate(pts, cx, cy, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/**
 * Dibuja al Arquitecto con el origen en la esquina de la caja de 64.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u      px por unidad
 * @param {string} pose   clave de POSES
 * @param {number} t      fase 0..1 del bucle (capa, respiración, cubos)
 * @param {{p?: number}} opts  p: progreso de "prepara" (bloque armándose)
 */
export function drawArquitecto(ctx, u, pose, t, opts = {}) {
    const g = createNeonPainter(ctx, u);
    const P = POSES[pose] || POSES.idle;
    const C = pose === 'furia' ? RED_FURY : RED;
    const TAU = Math.PI * 2;
    const by = Math.sin(t * TAU) * 0.4;                       // respiración
    const dy = (P.dy || 0) + (pose === 'burla' ? Math.sin(t * TAU * 6) * 0.6 : 0);
    const pulse = 0.55 + 0.45 * Math.sin(t * TAU * 2);
    const st = P.stance;

    const upper = (fn) => {
        ctx.save();
        ctx.translate(32 * u, (41 + dy) * u); ctx.rotate(P.lean); ctx.translate(-32 * u, -41 * u);
        fn();
        ctx.restore();
    };

    const cubes = (front) => {
        for (let k = 0; k < 2; k++) {
            const a = t * TAU + k * Math.PI, z = Math.sin(a);
            if ((z > 0) !== front) continue;
            const x = 32 + Math.cos(a) * 27, y = 33 + z * 4 + dy, s = 1.6 + z * 0.5;
            g.poly(rotate([[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], x, y, t * TAU * 2 + k), CYAN, 0.5);
        }
    };

    const hand = (x, y, a, fist) => {
        g.poly(rotate([[x - 2, y - 1.6], [x + 2, y - 1.6], [x + 2.4, y + 1.4], [x, y + (fist ? 2.2 : 3)], [x - 2.4, y + 1.4]], x, y, a), C, 0.7);
        const [kx, ky] = rotate([[x, y + 0.4]], x, y, a)[0];
        g.dot(kx, ky, 0.5, WARM);
    };

    const arm = ([shoulder, elbow, wrist], handAngle) => {
        g.limb([[shoulder[0], shoulder[1] + by], elbow, wrist], 3.8, C);
        g.poly([[elbow[0] - 1.3, elbow[1] - 1.3], [elbow[0] + 1.3, elbow[1] - 1.3], [elbow[0] + 1.3, elbow[1] + 1.3], [elbow[0] - 1.3, elbow[1] + 1.3]], C, 0.45);
        hand(wrist[0], wrist[1], handAngle, P.fists);
    };

    const draw = () => {
        // Reflejo rojo en el piso
        ctx.save();
        const glow = ctx.createRadialGradient(32 * u, 60 * u, 0, 32 * u, 60 * u, 18 * u);
        glow.addColorStop(0, 'rgba(255,59,92,0.35)'); glow.addColorStop(1, 'rgba(255,59,92,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(32 * u, 60 * u, 18 * u, 3 * u, 0, 0, TAU); ctx.fill();
        ctx.restore();

        cubes(false);

        // Capa (detrás de todo, se abre según la pose)
        upper(() => {
            const N = 7, f = P.flare, hem = [];
            for (let i = 0; i <= N; i++) {
                hem.push([(12 - f) + (40 + 2 * f) * i / N, 57 - dy + Math.sin(t * TAU + i * 0.9) * 1.3 + (i % 2 ? -1.5 : 0)]);
            }
            const cape = [[20, 20 + by], ...hem, [44, 20 + by]];
            const cloth = ctx.createLinearGradient(0, 18 * u, 0, 58 * u);
            cloth.addColorStop(0, '#3a0d18'); cloth.addColorStop(1, '#0b0306');
            g.fill(() => g.path(cape), cloth);
            g.tube(C, 0.8, () => g.path(cape));
            for (let i = 1; i < N; i += 2) g.line([[i < N / 2 ? 22 : 42, 22 + by], hem[i]], C, 0.3, 0.45);
            for (const s of [-1, 1]) g.poly([[32 + s * 7.5, 20 + by], [32 + s * 10, 11 + by], [32 + s * 4.5, 18 + by]], C, 0.7);
        });

        // Piernas, rodilleras y botas
        for (const [hx, hy, kx, ky, fx, fy] of [[29, 41, 27 - st * 0.6, 50, 26 - st, 57], [35, 41, 37 + st * 0.6, 50, 38 + st, 57]]) {
            const kneeY = ky + dy * 0.3;
            g.limb([[hx, hy + dy * 0.5], [kx, kneeY], [fx, fy]], 4.6, C);
            g.poly([[kx - 1.6, kneeY - 1.6], [kx + 1.6, kneeY - 1.6], [kx + 1.2, kneeY + 1.4], [kx - 1.2, kneeY + 1.4]], C, 0.6);
            const dir = fx < 32 ? -1 : 1;
            g.poly([[fx - 2.4, 56], [fx + 2.4, 56], [fx + 2.4 + 2 * dir, 60], [fx - 2.4 + 1.5 * dir, 60]], C, 0.8);
            g.line([[fx - 2 + 1.5 * dir, 59.3], [fx + 2 + 2 * dir, 59.3]], '#ffffff', 0.35, 0.8);
        }

        upper(() => {
            // Torso, placas y emblema (un bloque que late)
            g.poly([[20, 20 + by], [44, 20 + by], [41, 32 + by], [36, 40], [28, 40], [23, 32 + by]], C, 1.1);
            g.line([[24, 22 + by], [29, 30 + by], [32, 31 + by], [35, 30 + by], [40, 22 + by]], C, 0.45, 0.8);
            g.line([[29.5, 34.5], [34.5, 34.5]], C, 0.35, 0.7);
            g.line([[30, 37], [34, 37]], C, 0.35, 0.7);
            const emblem = [[29.5, 24.5 + by], [34.5, 24.5 + by], [34.5, 27.5 + by], [29.5, 27.5 + by]];
            g.glowFill(() => g.path(emblem), C, 0.35 + 0.4 * pulse);
            g.tube(WARM, 0.45, () => g.path(emblem));
            g.poly([[27, 38.6], [37, 38.6], [37, 41], [27, 41]], C, 0.5);
            g.dot(32, 39.8, 0.7, WARM);

            // Hombreras con púas
            for (const s of [-1, 1]) {
                const X = x => 32 + s * (x - 32);
                g.poly([[X(15), 19 + by], [X(23), 17.5 + by], [X(25.5), 22 + by], [X(19), 25 + by], [X(13.5), 23 + by]], C, 0.9);
                g.poly([[X(15.5), 19.5 + by], [X(12), 14 + by], [X(18.5), 18.2 + by]], C, 0.6);
                g.line([[X(16.5), 21.5 + by], [X(22.5), 20 + by]], WARM, 0.3, 0.8);
            }

            // Brazos
            if (P.crossed) {
                g.limb([[21, 21 + by], [18, 30]], 3.8, C);
                g.limb([[43, 21 + by], [46, 30]], 3.8, C);
                g.limb([[46, 30], [26, 31.5]], 3.6, C); hand(25, 31.5, Math.PI / 2, true);
                g.limb([[18, 30], [38, 29]], 3.6, C); hand(39, 29, -Math.PI / 2, true);
            } else {
                arm(P.armL, P.handL);
                arm(P.armR, P.handR);
                if (P.point) {
                    const [x, y] = P.armR[2];
                    g.limb([[x + 0.8, y + 1.5], [x + 3.2, y + 5]], 1.4, C);
                }
            }

            drawHead(ctx, g, u, P, C, by);

            if (pose === 'prepara') {
                // El bloque se arma de partículas sobre la palma
                const prog = opts.p ?? 1, bx = 47, byy = -1;
                for (let i = 0; i < 10; i++) {
                    const a = i * 0.63 + prog * 3, r = 9 * (1 - prog) + 1;
                    g.dot(bx + Math.cos(a) * r * 1.4, byy + Math.sin(a) * r * 0.6 + 1, 0.45, CYAN);
                }
                if (prog > 0.3) {
                    ctx.save(); ctx.globalAlpha = Math.min(1, (prog - 0.3) / 0.7);
                    g.brick(bx, byy, 16, 7, '?', CYAN);
                    ctx.restore();
                }
            }
        });

        cubes(true);

        if (pose === 'burla') {
            ctx.save();
            ctx.font = `bold ${4.2 * u}px Arial`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
            ctx.shadowColor = C; ctx.shadowBlur = 3 * u;
            const k = Math.floor(t * 6) % 2;
            ctx.fillText('JA', (12 + k) * u, (8 - k) * u);
            ctx.fillText('JA', (5 - k) * u, (15 + k * 0.5) * u);
            ctx.restore();
        }
        if (pose === 'golpe') {
            for (const [x, y, s] of [[49, 18, 1.2], [53, 24, 0.9], [47, 28, 0.7], [55, 15, 0.6]]) {
                g.poly([[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]], C, 0.4);
            }
        }
        if (pose === 'furia') {
            for (const [x, y] of [[6, 2], [58, 2], [3, 8], [61, 8], [10, 0], [54, 0]]) {
                g.dot(x, y + Math.sin(t * TAU + x) * 1.2, 0.7, '#ffffff');
            }
            g.line([[22, 61], [18, 63], [15, 62]], C, 0.4, 0.8);
            g.line([[42, 61], [47, 63], [50, 62]], C, 0.4, 0.8);
        }
    };

    if (pose === 'furia' || pose === 'golpe') g.ghosted(draw);
    draw();
}

/** Casco con aletas y cresta; el visor cambia según el ánimo. */
function drawHead(ctx, g, u, P, C, by) {
    const [hdx, hdy, tilt] = P.head;
    const hx = 32 + hdx, hy = 11 + hdy + by;
    ctx.save();
    ctx.translate(hx * u, (hy + 5) * u); ctx.rotate(tilt); ctx.translate(-hx * u, -(hy + 5) * u);

    for (const s of [-1, 1]) g.poly([[hx + s * 4.5, hy - 4.5], [hx + s * 10.5, hy - 11], [hx + s * 6.5, hy - 0.5]], C, 0.7);
    g.poly([[hx - 1.2, hy - 5.5], [hx, hy - 10], [hx + 1.2, hy - 5.5]], C, 0.6);
    g.poly([[hx - 5, hy - 6], [hx + 5, hy - 6], [hx + 7, hy - 1], [hx + 5, hy + 5], [hx, hy + 8], [hx - 5, hy + 5], [hx - 7, hy - 1]], C, 1);
    g.fill(() => g.path([[hx - 5.5, hy - 1.8], [hx + 5.5, hy - 1.8], [hx + 4.5, hy + 2.2], [hx - 4.5, hy + 2.2]]), '#000');

    const W = '#ffffff';
    switch (P.mood) {
        case 'normal':
            g.line([[hx - 4, hy + 0.2], [hx + 4, hy + 0.2]], W, 0.75); break;
        case 'smug':
            g.line([[hx - 4, hy + 0.7], [hx - 1, hy + 0.4]], W, 0.7);
            g.line([[hx + 1, hy + 0.4], [hx + 4, hy - 0.4]], W, 0.7); break;
        case 'angry':
            g.line([[hx - 4.3, hy - 1], [hx - 0.8, hy + 1]], W, 0.8);
            g.line([[hx + 0.8, hy + 1], [hx + 4.3, hy - 1]], W, 0.8); break;
        case 'laugh':
            g.line([[hx - 4, hy + 1], [hx - 2.5, hy - 0.6], [hx - 1, hy + 1]], W, 0.6);
            g.line([[hx + 1, hy + 1], [hx + 2.5, hy - 0.6], [hx + 4, hy + 1]], W, 0.6); break;
        case 'hurt':
            g.line([[hx - 4, hy + 0.3], [hx - 2, hy + 0.3]], W, 0.6, 0.9);
            g.line([[hx + 0.5, hy - 0.3], [hx + 1.5, hy + 0.8]], W, 0.5, 0.6);
            g.line([[hx + 2.5, hy + 0.3], [hx + 4, hy + 0.3]], W, 0.6, 0.4); break;
    }
    if (P.mood === 'laugh') {
        g.poly([[hx - 2.2, hy + 3.6], [hx + 2.2, hy + 3.6], [hx + 1.4, hy + 5.8], [hx - 1.4, hy + 5.8]], WARM, 0.4);
    } else {
        for (const yy of [3.8, 5.2]) g.line([[hx - 1.8, hy + yy], [hx + 1.8, hy + yy]], C, 0.3, 0.7);
    }
    ctx.restore();
}

/** Bloque suelto (el que cae al tablero), con el origen en la caja de 64. */
export function drawThrownBrick(ctx, u) {
    const g = createNeonPainter(ctx, u);
    g.brick(32, 32, 16, 7, '?', CYAN);
    g.speedLines(32, 21, 12, CYAN);
}
