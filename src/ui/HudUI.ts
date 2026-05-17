// src/ui/HudUI.ts
// HUD bintang + progress — muncul di pojok kanan atas selama gameplay.
//
// Usage (di setiap world):
//   create()   → this.hud = new HudUI(); this.hud.show();
//   shutdown() → this.hud.destroy();
//
// HUD update otomatis via QUESTION_ANSWERED listener.

import { EventBus, GameEvent } from '../core/EventBus';
import { GameState } from '../core/GameState';

// =============================================================================
// HUD UI
// =============================================================================

export class HudUI {

    private readonly _root: HTMLDivElement;
    private readonly _starCount: HTMLSpanElement;
    private readonly _progressBar: HTMLDivElement;
    private readonly _progressFill: HTMLDivElement;
    private readonly _progressLabel: HTMLSpanElement;

    private readonly _onAnswered: () => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        HudUI._injectStyles();

        // ── Root container ────────────────────────────────────────────────────
        this._root = document.createElement('div');
        this._root.id = 'geo-hud';
        this._root.setAttribute('aria-label', 'Skor permainan');

        // ── Stars row ─────────────────────────────────────────────────────────
        const starRow = document.createElement('div');
        starRow.className = 'hud-star-row';

        const starIcon = document.createElement('span');
        starIcon.className = 'hud-star-icon';
        starIcon.textContent = '★';

        this._starCount = document.createElement('span');
        this._starCount.className = 'hud-star-count';
        this._starCount.textContent = '0';

        starRow.appendChild(starIcon);
        starRow.appendChild(this._starCount);

        // ── Progress bar ──────────────────────────────────────────────────────
        const progressWrapper = document.createElement('div');
        progressWrapper.className = 'hud-progress-wrapper';

        this._progressBar = document.createElement('div');
        this._progressBar.className = 'hud-progress-bar';

        this._progressFill = document.createElement('div');
        this._progressFill.className = 'hud-progress-fill';

        this._progressLabel = document.createElement('span');
        this._progressLabel.className = 'hud-progress-label';

        this._progressBar.appendChild(this._progressFill);
        progressWrapper.appendChild(this._progressBar);
        progressWrapper.appendChild(this._progressLabel);

        this._root.appendChild(starRow);
        this._root.appendChild(progressWrapper);
        document.body.appendChild(this._root);

        // ── Event listener ────────────────────────────────────────────────────
        this._onAnswered = () => this._refresh();
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onAnswered);

        this._refresh();
        this._setVisible(false);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    public show(): void {
        this._refresh();
        this._setVisible(true);
    }

    public destroy(): void {
        EventBus.off(GameEvent.QUESTION_ANSWERED, this._onAnswered);
        this._root.parentNode?.removeChild(this._root);
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private _refresh(): void {
        const debug = GameState.debug();
        const stars = debug.totalStars;
        const done = debug.completedCount;
        const total = debug.totalQuestions;
        const pct = total > 0 ? (done / total) * 100 : 0;

        this._starCount.textContent = String(stars);
        this._progressFill.style.width = `${pct}%`;
        this._progressLabel.textContent = `${done}/${total}`;

        // Flash animation saat update
        this._starCount.classList.remove('hud-pop');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._starCount.classList.add('hud-pop');
            });
        });
    }

    private _setVisible(v: boolean): void {
        this._root.style.opacity = v ? '1' : '0';
        this._root.style.pointerEvents = v ? 'none' : 'none';
    }

    // =========================================================================
    // STATIC — CSS
    // =========================================================================

    private static _injected = false;

    private static _injectStyles(): void {
        if (HudUI._injected) return;
        HudUI._injected = true;

        const style = document.createElement('style');
        style.textContent = /* css */ `
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

            #geo-hud {
                position: fixed;
                top: 14px;
                right: 14px;
                z-index: 2000;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
                opacity: 0;
                transition: opacity 300ms ease;
                pointer-events: none;
                user-select: none;
            }

            /* ── Star row ── */
            .hud-star-row {
                display: flex;
                align-items: center;
                gap: 5px;
                background: rgba(0, 0, 0, 0.72);
                border: 2px solid #f5c518;
                border-radius: 8px;
                padding: 5px 10px 5px 8px;
                box-shadow: 0 0 10px rgba(245, 197, 24, 0.35), inset 0 0 6px rgba(0,0,0,0.5);
            }

            .hud-star-icon {
                font-size: 14px;
                color: #f5c518;
                text-shadow: 0 0 6px #f5c518;
                line-height: 1;
            }

            .hud-star-count {
                font-family: 'Press Start 2P', monospace;
                font-size: 11px;
                color: #fff;
                min-width: 18px;
                text-align: right;
                line-height: 1;
                transition: transform 150ms ease;
            }

            .hud-star-count.hud-pop {
                animation: hud-pop 300ms ease;
            }

            @keyframes hud-pop {
                0%   { transform: scale(1); color: #f5c518; }
                40%  { transform: scale(1.5); color: #ffe066; }
                100% { transform: scale(1); color: #fff; }
            }

            /* ── Progress ── */
            .hud-progress-wrapper {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .hud-progress-bar {
                width: 80px;
                height: 8px;
                background: rgba(0, 0, 0, 0.72);
                border: 2px solid rgba(255,255,255,0.25);
                border-radius: 99px;
                overflow: hidden;
            }

            .hud-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #9bd009 0%, #c8f535 100%);
                border-radius: 99px;
                transition: width 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 0 6px rgba(155, 208, 9, 0.5);
            }

            .hud-progress-label {
                font-family: 'Press Start 2P', monospace;
                font-size: 7px;
                color: rgba(255,255,255,0.7);
                line-height: 1;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    }
}