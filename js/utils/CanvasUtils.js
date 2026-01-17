/**
 * Canvas Utilities
 * Maneja todo lo relacionado con dimensiones y escalado del canvas
 * Principio: Single Responsibility
 */

import { GAME_CONSTANTS } from '../core/Constants.js';

export class CanvasUtils {
    constructor(container, canvas) {
        this.container = container;
        this.canvas = canvas;
        this.prevCellSize = null;
        this.prevTopOffset = null;
        this.prevLeftBorder = null;
    }

    /**
     * Obtiene el ancho del contenedor
     */
    getWidth() {
        return this.container.getBoundingClientRect().width;
    }

    /**
     * Obtiene el alto del contenedor
     */
    getHeight() {
        return this.container.getBoundingClientRect().height;
    }

    /**
     * Obtiene la escala basada en el tamaño del canvas
     * Referencia base: 700px de alto, 400px de ancho
     */
    getScale() {
        return Math.min(this.getHeight() / 700, this.getWidth() / 400);
    }

    /**
     * Obtiene el tamaño de celda óptimo
     */
    getCellSize() {
        const maxCellWidth = (this.getWidth() - 20) / GAME_CONSTANTS.COLS;
        const availableHeight = this.getBottomLine() - this.getTopOffset() - 40;
        const maxCellHeight = availableHeight / 7;
        return Math.min(maxCellWidth, maxCellHeight);
    }

    /**
     * Obtiene el borde izquierdo
     */
    getLeftBorder() {
        const cellSize = this.getCellSize();
        const gridWidth = cellSize * GAME_CONSTANTS.COLS;
        return (this.getWidth() - gridWidth) / 2;
    }

    /**
     * Obtiene el borde derecho
     */
    getRightBorder() {
        return this.getWidth() - this.getLeftBorder();
    }

    /**
     * Obtiene el offset superior
     */
    getTopOffset() {
        return Math.max(40, this.getHeight() * 0.07);
    }

    /**
     * Obtiene la línea inferior donde aterrizan las bolas
     */
    getBottomLine() {
        return this.getHeight() - Math.max(35, this.getHeight() * 0.06);
    }

    /**
     * Obtiene todas las dimensiones del grid
     */
    getGridDimensions() {
        return {
            cellSize: this.getCellSize(),
            topOffset: this.getTopOffset(),
            leftBorder: this.getLeftBorder(),
            rightBorder: this.getRightBorder(),
            bottomLine: this.getBottomLine(),
            width: this.getWidth(),
            height: this.getHeight(),
            scale: this.getScale()
        };
    }

    /**
     * Obtiene el radio de la bola escalado
     */
    getBallRadius() {
        return Math.max(
            GAME_CONSTANTS.MIN_BALL_RADIUS,
            GAME_CONSTANTS.BASE_BALL_RADIUS * this.getScale()
        );
    }

    /**
     * Obtiene el tamaño de fuente escalado
     */
    getFontSize(baseSize) {
        return Math.max(
            GAME_CONSTANTS.MIN_FONT_SIZE,
            Math.round(baseSize * this.getScale())
        );
    }

    /**
     * Redimensiona el canvas
     */
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        const ctx = this.canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    /**
     * Guarda las dimensiones actuales
     */
    saveDimensions() {
        this.prevCellSize = this.getCellSize();
        this.prevTopOffset = this.getTopOffset();
        this.prevLeftBorder = this.getLeftBorder();
    }

    /**
     * Obtiene las dimensiones previas
     */
    getPreviousDimensions() {
        return {
            cellSize: this.prevCellSize || this.getCellSize(),
            topOffset: this.prevTopOffset || this.getTopOffset(),
            leftBorder: this.prevLeftBorder || this.getLeftBorder()
        };
    }
}

export default CanvasUtils;
