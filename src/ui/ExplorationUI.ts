// src/ui/ExplorationUI.ts
//
// UI interaktif untuk fase eksplorasi konsep (keliling & luas).
// Tiga tipe step:
//   narrative       — teks + ikon, tombol Lanjut
//   perimeter_trace — SVG persegi panjang, ketuk tiap sisi, formula live
//   area_fill       — SVG grid kotak, ketuk untuk mengisi, counter live

export interface NarrativeStep {
    type: 'narrative';
    prompt: string;
    icon?: string;
}

export interface PerimeterTraceStep {
    type: 'perimeter_trace';
    prompt: string;
    rect_w: number;
    rect_h: number;
    unit?: string;
}

export interface AreaFillStep {
    type: 'area_fill';
    prompt: string;
    grid_cols: number;
    grid_rows: number;
    unit?: string;
}

export type ExplorationStep = NarrativeStep | PerimeterTraceStep | AreaFillStep;

export interface Exploration {
    id: string;
    trigger_id: string;
    topic: 'keliling' | 'luas';
    title: string;
    steps: ExplorationStep[];
}

const ANIM_MS = 200;

export class ExplorationUI {

    private readonly backdrop: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly titleEl: HTMLHeadingElement;
    private readonly progressEl: HTMLSpanElement;
    private readonly contentArea: HTMLDivElement;
    private readonly btnNext: HTMLButtonElement;

    private _exploration: Exploration | null = null;
    private _currentStep = 0;
    private _onHidden: (() => void) | null = null;

    private readonly _handleNext: () => void;

    constructor() {
        const style = document.createElement('style');
        style.textContent = /* css */`
            #explore-backdrop {
                display: none;
                position: fixed; inset: 0; z-index: 1020;
                align-items: center; justify-content: center;
                padding: 16px; box-sizing: border-box;
                background: rgba(0,0,0,0.65);
                opacity: 0;
                transition: opacity ${ANIM_MS}ms ease;
            }
            #explore-backdrop.visible { display: flex; opacity: 1; }

            #explore-panel {
                width: 100%; max-width: 460px; max-height: 92vh;
                overflow-y: auto;
                background: #fffef7;
                border-radius: 20px;
                box-shadow: 0 12px 52px rgba(0,0,0,0.3);
                padding: 22px 22px 26px; box-sizing: border-box;
                transform: scale(0.9) translateY(24px);
                transition: transform ${ANIM_MS}ms cubic-bezier(0.34,1.56,0.64,1);
            }
            #explore-backdrop.visible #explore-panel { transform: scale(1) translateY(0); }

            @keyframes ex-fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .ex-content-enter { animation: ex-fade-in 0.25s ease-out both; }

            .ex-header {
                display: flex; align-items: center;
                gap: 10px; margin-bottom: 16px;
            }
            .ex-title {
                font-size: 16px; font-weight: 700;
                color: #1a3a20; margin: 0; flex: 1;
            }
            .ex-progress {
                font-size: 12px; color: #aaa;
                background: #f0f0f0; padding: 2px 8px;
                border-radius: 10px;
            }

            /* Narrative step */
            .ex-narrative {
                text-align: center; padding: 8px 0 16px;
            }
            .ex-narrative-icon {
                font-size: 48px; display: block;
                margin-bottom: 16px; line-height: 1;
            }
            .ex-narrative-text {
                font-size: 15px; line-height: 1.7;
                color: #333; white-space: pre-line;
                text-align: left;
                background: #f0f7f1;
                border-left: 4px solid #2d7a3a;
                border-radius: 10px;
                padding: 14px 16px;
            }

            /* Perimeter trace */
            .ex-trace-prompt {
                font-size: 14px; color: #444;
                margin-bottom: 12px; font-style: italic;
            }
            .ex-trace-svg { display: block; margin: 0 auto 14px; }
            .ex-trace-side {
                stroke: #ccc; stroke-width: 8; stroke-linecap: round;
                cursor: pointer; fill: none;
                transition: stroke 200ms ease;
            }
            .ex-trace-side:hover { stroke: #a8d5a2; }
            .ex-trace-side.traced { stroke: #2d7a3a; }
            .ex-trace-side.traced-new { stroke: #5cb85c; }
            .ex-side-label {
                font-size: 13px; fill: #2d7a3a;
                font-weight: 700; pointer-events: none;
                opacity: 0;
                transition: opacity 300ms ease;
            }
            .ex-side-label.visible { opacity: 1; }
            .ex-formula-bar {
                font-size: 14px; color: #2d4a31;
                background: #e8f5ea; border-radius: 8px;
                padding: 10px 14px; min-height: 40px;
                text-align: center; font-weight: 600;
                transition: all 200ms ease;
            }

            /* Area fill */
            .ex-fill-prompt {
                font-size: 14px; color: #444;
                margin-bottom: 12px; font-style: italic;
            }
            .ex-fill-svg { display: block; margin: 0 auto 14px; cursor: pointer; }
            .ex-cell {
                fill: #f0f0f0; stroke: #bbb; stroke-width: 1;
                transition: fill 150ms ease;
                cursor: pointer;
            }
            .ex-cell:hover   { fill: #d0ecd3; }
            .ex-cell.filled  { fill: #4a90e2; stroke: #2d6ab0; }
            .ex-cell.filled-new {
                fill: #5cb85c; stroke: #2d7a3a;
                animation: ex-cell-pop 0.25s ease-out both;
            }
            @keyframes ex-cell-pop {
                0%   { transform: scale(0.6); opacity: 0.5; }
                60%  { transform: scale(1.15); }
                100% { transform: scale(1); opacity: 1; }
            }
            .ex-fill-counter {
                font-size: 14px; color: #2d4a31;
                background: #e8f5ea; border-radius: 8px;
                padding: 10px 14px; text-align: center;
                font-weight: 600;
            }

            /* Next button */
            .ex-btn-next {
                display: block; width: 100%; margin-top: 18px;
                padding: 12px; background: #2d7a3a; color: #fff;
                border: none; border-radius: 12px;
                font-size: 15px; font-weight: 700;
                cursor: pointer;
                transition: opacity 150ms ease, transform 100ms ease;
            }
            .ex-btn-next:disabled { opacity: 0.35; cursor: not-allowed; }
            .ex-btn-next:not(:disabled):active { transform: scale(0.97); }

            .ex-btn-next.pulse {
                animation: ex-pulse 0.6s ease-out both;
            }
            @keyframes ex-pulse {
                0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(45,122,58,0.4); }
                50%  { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(45,122,58,0); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        this.backdrop = document.createElement('div');
        this.backdrop.id = 'explore-backdrop';

        this.panel = document.createElement('div');
        this.panel.id = 'explore-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'ex-header';

        this.titleEl = document.createElement('h2');
        this.titleEl.className = 'ex-title';

        this.progressEl = document.createElement('span');
        this.progressEl.className = 'ex-progress';

        header.appendChild(this.titleEl);
        header.appendChild(this.progressEl);

        // Content area
        this.contentArea = document.createElement('div');

        // Next button
        this.btnNext = document.createElement('button');
        this.btnNext.className = 'ex-btn-next';
        this.btnNext.type = 'button';

        this.panel.appendChild(header);
        this.panel.appendChild(this.contentArea);
        this.panel.appendChild(this.btnNext);
        this.backdrop.appendChild(this.panel);
        document.body.appendChild(this.backdrop);

        this._handleNext = () => this._onNextClick();
        this.btnNext.addEventListener('click', this._handleNext);

        this._setVisible(false);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    show(exploration: Exploration, onHidden?: () => void): void {
        this._exploration = exploration;
        this._currentStep = 0;
        this._onHidden = onHidden ?? null;

        this.titleEl.textContent = exploration.title;
        this._renderStep(0);
        this._setVisible(true);
    }

    hide(): void {
        this._setVisible(false);
        setTimeout(() => {
            this._exploration = null;
            this._currentStep = 0;
            const cb = this._onHidden;
            this._onHidden = null;
            cb?.();
        }, ANIM_MS);
    }

    destroy(): void {
        this.hide();
        this.btnNext.removeEventListener('click', this._handleNext);
        this.backdrop.parentNode?.removeChild(this.backdrop);
    }

    // =========================================================================
    // PRIVATE — Step rendering
    // =========================================================================

    private _renderStep(index: number): void {
        if (!this._exploration) return;

        const total = this._exploration.steps.length;
        const step = this._exploration.steps[index];

        this.progressEl.textContent = `${index + 1} / ${total}`;
        this.btnNext.textContent = index < total - 1 ? 'Lanjut →' : 'Selesai ✓';
        this.btnNext.disabled = false;

        this.contentArea.innerHTML = '';
        this.contentArea.className = 'ex-content-enter';
        void this.contentArea.offsetWidth;

        if (step.type === 'narrative') {
            this._renderNarrative(step);
        } else if (step.type === 'perimeter_trace') {
            this._renderPerimeterTrace(step);
        } else if (step.type === 'area_fill') {
            this._renderAreaFill(step);
        }
    }

    // ── Narrative ─────────────────────────────────────────────────────────────

    private _renderNarrative(step: NarrativeStep): void {
        const wrap = document.createElement('div');
        wrap.className = 'ex-narrative';

        if (step.icon) {
            const icon = document.createElement('span');
            icon.className = 'ex-narrative-icon';
            icon.textContent = step.icon;
            wrap.appendChild(icon);
        }

        const text = document.createElement('div');
        text.className = 'ex-narrative-text';
        text.textContent = step.prompt;
        wrap.appendChild(text);

        this.contentArea.appendChild(wrap);
    }

    // ── Perimeter trace ───────────────────────────────────────────────────────

    private _renderPerimeterTrace(step: PerimeterTraceStep): void {
        const { rect_w, rect_h, unit = 'm' } = step;

        const prompt = document.createElement('p');
        prompt.className = 'ex-trace-prompt';
        prompt.textContent = step.prompt;

        // SVG setup
        const svgW = 280, svgH = 200;
        const pad = 40;
        const drawW = svgW - pad * 2;
        const drawH = svgH - pad * 2;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        svg.setAttribute('width', String(svgW));
        svg.setAttribute('height', String(svgH));
        svg.setAttribute('class', 'ex-trace-svg');

        // 4 sides: top, right, bottom, left
        // Each is a clickable <line>
        const sides = [
            { id: 'top', x1: pad, y1: pad, x2: pad + drawW, y2: pad, label: `${rect_w}${unit}`, lx: pad + drawW / 2, ly: pad - 12, anchor: 'middle' },
            { id: 'right', x1: pad + drawW, y1: pad, x2: pad + drawW, y2: pad + drawH, label: `${rect_h}${unit}`, lx: pad + drawW + 16, ly: pad + drawH / 2, anchor: 'start' },
            { id: 'bottom', x1: pad + drawW, y1: pad + drawH, x2: pad, y2: pad + drawH, label: `${rect_w}${unit}`, lx: pad + drawW / 2, ly: pad + drawH + 22, anchor: 'middle' },
            { id: 'left', x1: pad, y1: pad + drawH, x2: pad, y2: pad, label: `${rect_h}${unit}`, lx: pad - 16, ly: pad + drawH / 2, anchor: 'end' },
        ];

        const traced = new Set<string>();
        const formulaValues: number[] = [];

        const formulaBar = document.createElement('div');
        formulaBar.className = 'ex-formula-bar';
        formulaBar.textContent = 'Ketuk setiap sisi!';

        const updateFormula = () => {
            const order = ['top', 'right', 'bottom', 'left'];
            const values = order
                .filter(id => traced.has(id))
                .map(id => (id === 'top' || id === 'bottom') ? rect_w : rect_h);

            if (values.length === 0) {
                formulaBar.textContent = 'Ketuk setiap sisi!';
            } else if (values.length < 4) {
                formulaBar.textContent = values.join(' + ') + ' + ...';
            } else {
                const total = rect_w * 2 + rect_h * 2;
                formulaBar.textContent = `${rect_w} + ${rect_h} + ${rect_w} + ${rect_h} = ${total} ${unit}`;
                // unlock next
                this._pulseButton();
            }
        };

        for (const s of sides) {
            // Hit area (wider, transparent)
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hit.setAttribute('x1', String(s.x1));
            hit.setAttribute('y1', String(s.y1));
            hit.setAttribute('x2', String(s.x2));
            hit.setAttribute('y2', String(s.y2));
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', '20');
            hit.style.cursor = 'pointer';

            // Visible line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(s.x1));
            line.setAttribute('y1', String(s.y1));
            line.setAttribute('x2', String(s.x2));
            line.setAttribute('y2', String(s.y2));
            line.setAttribute('class', 'ex-trace-side');
            line.id = `side-${s.id}`;

            // Side length label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(s.lx));
            label.setAttribute('y', String(s.ly));
            label.setAttribute('text-anchor', s.anchor);
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('class', 'ex-side-label');
            label.id = `label-${s.id}`;
            label.textContent = s.label;

            const onTrace = () => {
                if (traced.has(s.id)) return;
                traced.add(s.id);
                line.classList.add('traced');
                label.classList.add('visible');
                updateFormula();
            };

            hit.addEventListener('click', onTrace);
            hit.addEventListener('touchend', (e) => { e.preventDefault(); onTrace(); });

            svg.appendChild(line);
            svg.appendChild(label);
            svg.appendChild(hit);
        }

        // Corner dots
        const corners = [
            [pad, pad], [pad + drawW, pad], [pad + drawW, pad + drawH], [pad, pad + drawH]
        ];
        for (const [cx, cy] of corners) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', String(cx));
            dot.setAttribute('cy', String(cy));
            dot.setAttribute('r', '4');
            dot.setAttribute('fill', '#888');
            svg.appendChild(dot);
        }

        this.contentArea.appendChild(prompt);
        this.contentArea.appendChild(svg);
        this.contentArea.appendChild(formulaBar);

        // Lock "Lanjut" until all sides traced
        this.btnNext.disabled = true;
    }

    // ── Area fill ─────────────────────────────────────────────────────────────

    private _renderAreaFill(step: AreaFillStep): void {
        const { grid_cols, grid_rows, unit = 'm²' } = step;
        const total = grid_cols * grid_rows;

        const prompt = document.createElement('p');
        prompt.className = 'ex-fill-prompt';
        prompt.textContent = step.prompt;

        const cellSize = Math.min(48, Math.floor(260 / Math.max(grid_cols, grid_rows)));
        const svgW = grid_cols * cellSize + 2;
        const svgH = grid_rows * cellSize + 2;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        svg.setAttribute('width', String(svgW));
        svg.setAttribute('height', String(svgH));
        svg.setAttribute('class', 'ex-fill-svg');

        let filled = 0;

        const counter = document.createElement('div');
        counter.className = 'ex-fill-counter';
        counter.textContent = `0 / ${total} kotak terisi`;

        this.btnNext.disabled = true;

        for (let row = 0; row < grid_rows; row++) {
            for (let col = 0; col < grid_cols; col++) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', String(col * cellSize + 1));
                rect.setAttribute('y', String(row * cellSize + 1));
                rect.setAttribute('width', String(cellSize - 1));
                rect.setAttribute('height', String(cellSize - 1));
                rect.setAttribute('rx', '3');
                rect.setAttribute('class', 'ex-cell');

                let cellFilled = false;

                const fill = () => {
                    if (cellFilled) return;
                    cellFilled = true;
                    filled++;
                    rect.classList.add('filled-new');
                    setTimeout(() => rect.classList.replace('filled-new', 'filled'), 300);

                    if (filled === total) {
                        counter.textContent = `${total} / ${total} kotak! = ${grid_cols} × ${grid_rows} = ${total} ${unit}`;
                        this._pulseButton();
                        this.btnNext.disabled = false;
                    } else {
                        counter.textContent = `${filled} / ${total} kotak terisi`;
                    }
                };

                rect.addEventListener('click', fill);
                rect.addEventListener('touchend', (e) => { e.preventDefault(); fill(); });
                svg.appendChild(rect);
            }
        }

        this.contentArea.appendChild(prompt);
        this.contentArea.appendChild(svg);
        this.contentArea.appendChild(counter);
    }

    // =========================================================================
    // PRIVATE — Helpers
    // =========================================================================

    private _onNextClick(): void {
        if (!this._exploration) return;
        const total = this._exploration.steps.length;

        if (this._currentStep < total - 1) {
            this._currentStep++;
            this._renderStep(this._currentStep);
        } else {
            this.hide();
        }
    }

    private _pulseButton(): void {
        this.btnNext.disabled = false;
        this.btnNext.classList.remove('pulse');
        void this.btnNext.offsetWidth;
        this.btnNext.classList.add('pulse');
    }

    private _setVisible(visible: boolean): void {
        if (visible) {
            this.backdrop.style.display = 'flex';
            requestAnimationFrame(() => this.backdrop.classList.add('visible'));
        } else {
            this.backdrop.classList.remove('visible');
            setTimeout(() => { this.backdrop.style.display = 'none'; }, ANIM_MS);
        }
    }
}