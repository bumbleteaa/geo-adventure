// src/ui/WorldCompleteUI.ts
// Layar perayaan saat semua soal di sebuah world selesai.
//
// Usage (di setiap world, listen WORLD_COMPLETE):
//
//   EventBus.on(GameEvent.WORLD_COMPLETE, ({ worldKey }) => {
//       WorldCompleteUI.show({
//           worldName: 'Rumah',
//           stars: GameState.debug().totalStars,
//           totalStars: GameState.debug().maxStars,
//           onNext: () => this.scene.start('ClassroomWorld'),
//       });
//   });

import { GameState } from '../core/GameState';

// =============================================================================
// TYPES
// =============================================================================

export interface WorldCompleteOptions {
    worldName: string;          // ditampilkan sebagai judul, misal "Rumah"
    onNext: () => void;         // callback tombol "Lanjut"
    nextLabel?: string;         // label tombol, default "Lanjut »"
}

// =============================================================================
// CLASS
// =============================================================================

export class WorldCompleteUI {

    private static _instance: WorldCompleteUI | null = null;

    // ── DOM ──────────────────────────────────────────────────────────────────
    private readonly _backdrop: HTMLDivElement;

    // =========================================================================
    // STATIC FACTORY
    // =========================================================================

    /** Tampilkan WorldCompleteUI. Hanya satu instance aktif sekaligus. */
    public static show(opts: WorldCompleteOptions): WorldCompleteUI {
        WorldCompleteUI._instance?.destroy();
        const instance = new WorldCompleteUI(opts);
        WorldCompleteUI._instance = instance;
        return instance;
    }

    // =========================================================================
    // CONSTRUCTOR (private — pakai static show())
    // =========================================================================

    private constructor(opts: WorldCompleteOptions) {
        WorldCompleteUI._injectStyles();

        const debug = GameState.debug();
        const earned = debug.totalStars;
        const maxStars = debug.maxStars;
        const done = debug.completedCount;
        const total = debug.totalQuestions;
        const nextLabel = opts.nextLabel ?? 'Lanjut »';

        // ── Build DOM ─────────────────────────────────────────────────────────
        this._backdrop = document.createElement('div');
        this._backdrop.className = 'wc-backdrop';

        const card = document.createElement('div');
        card.className = 'wc-card';

        // confetti particles
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('div');
            p.className = 'wc-confetti';
            p.style.cssText = `
                left:${5 + Math.random() * 90}%;
                animation-delay:${Math.random() * 1.2}s;
                animation-duration:${1.2 + Math.random() * 1.2}s;
                background:${'#f5c518,#9bd009,#ff6b6b,#54c4f5,#fff'.split(',')[Math.floor(Math.random() * 5)]};
                width:${6 + Math.random() * 6}px;
                height:${6 + Math.random() * 6}px;
                border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
            `;
            this._backdrop.appendChild(p);
        }

        // badge "SELESAI!"
        const badge = document.createElement('div');
        badge.className = 'wc-badge';
        badge.textContent = 'SELESAI!';

        // title
        const title = document.createElement('h2');
        title.className = 'wc-title';
        title.textContent = opts.worldName;

        // subtitle
        const sub = document.createElement('p');
        sub.className = 'wc-sub';
        sub.textContent = 'Semua soal berhasil dijawab!';

        // stars display
        const starsRow = document.createElement('div');
        starsRow.className = 'wc-stars-row';

        const MAX_DISPLAY = 9;
        const displayMax = Math.min(maxStars, MAX_DISPLAY);
        for (let i = 0; i < displayMax; i++) {
            const star = document.createElement('span');
            star.className = `wc-star ${i < earned ? 'wc-star--filled' : 'wc-star--empty'}`;
            star.textContent = '★';
            star.style.animationDelay = `${0.4 + i * 0.08}s`;
            starsRow.appendChild(star);
        }

        // star count label
        const starLabel = document.createElement('div');
        starLabel.className = 'wc-star-label';
        starLabel.innerHTML = `<span class="wc-star-num">${earned}</span><span class="wc-star-sep">/</span><span>${maxStars}</span> bintang`;

        // progress summary
        const summary = document.createElement('div');
        summary.className = 'wc-summary';
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        summary.innerHTML = `
            <div class="wc-summary-bar">
                <div class="wc-summary-fill" style="width:0%" data-pct="${pct}"></div>
            </div>
            <div class="wc-summary-text">${done} dari ${total} soal selesai</div>
        `;

        // next button
        const btn = document.createElement('button');
        btn.className = 'wc-btn';
        btn.textContent = nextLabel;
        btn.addEventListener('click', () => {
            this.destroy();
            opts.onNext();
        });

        card.appendChild(badge);
        card.appendChild(title);
        card.appendChild(sub);
        card.appendChild(starsRow);
        card.appendChild(starLabel);
        card.appendChild(summary);
        card.appendChild(btn);
        this._backdrop.appendChild(card);
        document.body.appendChild(this._backdrop);

        // animate progress bar
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._backdrop.classList.add('wc-visible');
                const fill = this._backdrop.querySelector<HTMLDivElement>('.wc-summary-fill');
                if (fill) fill.style.width = `${pct}%`;
            });
        });
    }

    // =========================================================================
    // PUBLIC
    // =========================================================================

    public destroy(): void {
        this._backdrop.classList.remove('wc-visible');
        setTimeout(() => {
            this._backdrop.parentNode?.removeChild(this._backdrop);
        }, 400);
        if (WorldCompleteUI._instance === this) {
            WorldCompleteUI._instance = null;
        }
    }

    // =========================================================================
    // STATIC — CSS
    // =========================================================================

    private static _injected = false;

    private static _injectStyles(): void {
        if (WorldCompleteUI._injected) return;
        WorldCompleteUI._injected = true;

        const style = document.createElement('style');
        style.textContent = /* css */ `
            @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

            /* ── Backdrop ── */
            .wc-backdrop {
                position: fixed;
                inset: 0;
                z-index: 3500;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.82);
                backdrop-filter: blur(4px);
                opacity: 0;
                transition: opacity 400ms ease;
                overflow: hidden;
            }
            .wc-backdrop.wc-visible { opacity: 1; }

            /* ── Card ── */
            .wc-card {
                position: relative;
                background: #1a1a2e;
                border: 3px solid #f5c518;
                border-radius: 16px;
                padding: 32px 28px 28px;
                max-width: 340px;
                width: calc(100% - 40px);
                text-align: center;
                box-shadow:
                    0 0 0 1px rgba(245,197,24,0.2),
                    0 0 40px rgba(245,197,24,0.15),
                    0 20px 60px rgba(0,0,0,0.6);
                transform: translateY(24px) scale(0.95);
                transition: transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .wc-backdrop.wc-visible .wc-card {
                transform: translateY(0) scale(1);
            }

            /* ── Badge ── */
            .wc-badge {
                font-family: 'Press Start 2P', monospace;
                font-size: 9px;
                color: #1a1a2e;
                background: #f5c518;
                border-radius: 99px;
                padding: 5px 14px;
                display: inline-block;
                margin-bottom: 16px;
                letter-spacing: 1px;
                box-shadow: 0 0 12px rgba(245,197,24,0.5);
            }

            /* ── Title ── */
            .wc-title {
                font-family: 'Press Start 2P', monospace;
                font-size: 15px;
                color: #fff;
                margin: 0 0 8px;
                line-height: 1.4;
                text-shadow: 0 0 20px rgba(245,197,24,0.4);
            }

            /* ── Sub ── */
            .wc-sub {
                font-family: system-ui, sans-serif;
                font-size: 13px;
                color: rgba(255,255,255,0.6);
                margin: 0 0 24px;
            }

            /* ── Stars ── */
            .wc-stars-row {
                display: flex;
                justify-content: center;
                gap: 4px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }

            .wc-star {
                font-size: 22px;
                opacity: 0;
                transform: scale(0) rotate(-30deg);
                animation: wc-star-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                display: inline-block;
            }
            .wc-star--filled { color: #f5c518; text-shadow: 0 0 10px rgba(245,197,24,0.8); }
            .wc-star--empty  { color: rgba(255,255,255,0.2); }

            @keyframes wc-star-pop {
                0%   { opacity: 0; transform: scale(0) rotate(-30deg); }
                60%  { opacity: 1; transform: scale(1.3) rotate(5deg); }
                100% { opacity: 1; transform: scale(1) rotate(0deg); }
            }

            /* ── Star label ── */
            .wc-star-label {
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                color: rgba(255,255,255,0.5);
                margin-bottom: 20px;
                letter-spacing: 0.5px;
            }
            .wc-star-num {
                color: #f5c518;
                font-size: 11px;
            }
            .wc-star-sep { margin: 0 2px; }

            /* ── Summary bar ── */
            .wc-summary {
                margin-bottom: 24px;
            }
            .wc-summary-bar {
                height: 10px;
                background: rgba(255,255,255,0.1);
                border-radius: 99px;
                overflow: hidden;
                margin-bottom: 8px;
            }
            .wc-summary-fill {
                height: 100%;
                background: linear-gradient(90deg, #9bd009, #c8f535);
                border-radius: 99px;
                transition: width 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 600ms;
                box-shadow: 0 0 8px rgba(155,208,9,0.6);
            }
            .wc-summary-text {
                font-family: system-ui, sans-serif;
                font-size: 12px;
                color: rgba(255,255,255,0.5);
            }

            /* ── Button ── */
            .wc-btn {
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                color: #1a1a2e;
                background: #f5c518;
                border: none;
                border-radius: 10px;
                padding: 14px 28px;
                cursor: pointer;
                width: 100%;
                letter-spacing: 0.5px;
                transition: background 120ms, transform 80ms, box-shadow 120ms;
                box-shadow: 0 4px 0 #b8911a, 0 0 20px rgba(245,197,24,0.3);
            }
            .wc-btn:hover {
                background: #ffe066;
                box-shadow: 0 4px 0 #b8911a, 0 0 30px rgba(245,197,24,0.5);
            }
            .wc-btn:active {
                transform: translateY(3px);
                box-shadow: 0 1px 0 #b8911a;
            }

            /* ── Confetti ── */
            .wc-confetti {
                position: absolute;
                top: -12px;
                animation: wc-fall linear forwards;
                opacity: 0.9;
            }
            @keyframes wc-fall {
                0%   { top: -12px; opacity: 1; transform: rotate(0deg) translateX(0); }
                100% { top: 110%; opacity: 0; transform: rotate(360deg) translateX(${20 - Math.random() * 40}px); }
            }
        `;
        document.head.appendChild(style);
    }
}