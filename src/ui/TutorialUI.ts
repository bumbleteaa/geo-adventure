// src/ui/TutorialUI.ts
//
// Standalone tutorial overlay — 3 halaman, navigasi prev/next.
// Tidak bergantung pada Phaser, GameState, atau DialogManager.
//
// PENGGUNAAN:
//   // Sekali per sesi (untuk spawn awal):
//   TutorialUI.showOnce(() => { /* game dimulai */ });
//
//   // Selalu tampil (untuk tombol "CARA MAIN" di MainMenu):
//   const ui = new TutorialUI();
//   ui.show(() => { /* kembali ke menu */ });

// =============================================================================
// KONTEN HALAMAN
// =============================================================================

interface TutorialPage {
    icon: string;
    title: string;
    body: string;
}

const PAGES: TutorialPage[] = [
    {
        icon: '🕹️',
        title: 'CARA BERGERAK',
        body: 'Gunakan joystick di pojok kanan bawah layar. Geser ke segala arah untuk menggerakkan karakter!',
    },
    {
        icon: '💬',
        title: 'TEMUKAN SOAL',
        body: 'Dekati NPC atau injak tanda ! di lantai. Soal matematika akan muncul dan kamu bisa mulai menjawab!',
    },
    {
        icon: '✏️',
        title: 'JAWAB SOAL',
        body: 'Ikuti 4 langkah:\n① Apa yang diketahui?\n② Apa yang ditanyakan?\n③ Rumus apa yang dipakai?\n④ Hitung jawabannya!',
    },
];

const ANIM_MS = 220;

// =============================================================================
// CLASS
// =============================================================================

export class TutorialUI {

    // ── Static: once-per-session guard ───────────────────────────────────────

    private static _shown = false;

    /**
     * Tampilkan tutorial sekali per sesi browser.
     * Kalau sudah pernah tampil, `onDone` langsung dipanggil tanpa membuka UI.
     * Dipakai BedroomWorld.create() agar tutorial tidak muncul lagi
     * saat player kembali dari world lain.
     */
    static showOnce(onDone: () => void): void {
        if (TutorialUI._shown) {
            onDone();
            return;
        }
        TutorialUI._shown = true;
        new TutorialUI().show(onDone);
    }

    /** Reset flag — berguna untuk testing atau skenario "lihat lagi". */
    static resetFlag(): void {
        TutorialUI._shown = false;
    }

    // ── Instance ──────────────────────────────────────────────────────────────

    private _overlay: HTMLDivElement | null = null;
    private _onDone: (() => void) | null = null;
    private _page = 0;

    // DOM refs yang di-update saat ganti halaman
    private _iconEl!: HTMLDivElement;
    private _titleEl!: HTMLHeadingElement;
    private _bodyEl!: HTMLParagraphElement;
    private _dotsEl!: HTMLDivElement;
    private _prevBtn!: HTMLButtonElement;
    private _nextBtn!: HTMLButtonElement;

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /** Tampilkan tutorial. `onDone` dipanggil setelah player klik "Mulai!" di halaman terakhir. */
    show(onDone: () => void): void {
        this._onDone = onDone;
        this._page = 0;
        this._injectStyles();
        this._buildDOM();
        this._renderPage(0, false);
        this._setVisible(true);
    }

    hide(): void {
        this._setVisible(false);
        setTimeout(() => this._destroy(), ANIM_MS);
    }

    // =========================================================================
    // PRIVATE — DOM builder
    // =========================================================================

    private _buildDOM(): void {
        const overlay = document.createElement('div');
        overlay.id = 'tut-backdrop';

        const panel = document.createElement('div');
        panel.id = 'tut-panel';

        // ── Icon ──────────────────────────────────────────────────────────────
        this._iconEl = document.createElement('div');
        this._iconEl.id = 'tut-icon';

        // ── Title ─────────────────────────────────────────────────────────────
        this._titleEl = document.createElement('h2');
        this._titleEl.id = 'tut-title';

        // ── Body ──────────────────────────────────────────────────────────────
        this._bodyEl = document.createElement('p');
        this._bodyEl.id = 'tut-body';

        // ── Page dots ─────────────────────────────────────────────────────────
        this._dotsEl = document.createElement('div');
        this._dotsEl.id = 'tut-dots';
        for (let i = 0; i < PAGES.length; i++) {
            const dot = document.createElement('span');
            dot.className = 'tut-dot';
            dot.dataset.i = String(i);
            this._dotsEl.appendChild(dot);
        }

        // ── Actions ───────────────────────────────────────────────────────────
        const actions = document.createElement('div');
        actions.id = 'tut-actions';

        this._prevBtn = document.createElement('button');
        this._prevBtn.id = 'tut-prev';
        this._prevBtn.textContent = '‹ Kembali';
        this._prevBtn.type = 'button';

        this._nextBtn = document.createElement('button');
        this._nextBtn.id = 'tut-next';
        this._nextBtn.type = 'button';

        actions.appendChild(this._prevBtn);
        actions.appendChild(this._nextBtn);

        panel.appendChild(this._iconEl);
        panel.appendChild(this._titleEl);
        panel.appendChild(this._bodyEl);
        panel.appendChild(this._dotsEl);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this._overlay = overlay;

        // ── Event listeners ───────────────────────────────────────────────────
        this._prevBtn.addEventListener('click', () => this._goTo(this._page - 1));
        this._nextBtn.addEventListener('click', () => {
            if (this._page < PAGES.length - 1) {
                this._goTo(this._page + 1);
            } else {
                this._finish();
            }
        });
    }

    // =========================================================================
    // PRIVATE — Page rendering
    // =========================================================================

    private _renderPage(index: number, animate: boolean): void {
        const page = PAGES[index];
        const isLast = index === PAGES.length - 1;

        if (animate) {
            // Slide-out lama, slide-in baru
            this._iconEl.classList.add('tut-slide-out');
            setTimeout(() => {
                this._setContent(page, isLast);
                this._iconEl.classList.remove('tut-slide-out');
                this._iconEl.classList.add('tut-slide-in');
                setTimeout(() => this._iconEl.classList.remove('tut-slide-in'), ANIM_MS);
            }, ANIM_MS / 2);
        } else {
            this._setContent(page, isLast);
        }

        // Dots
        this._dotsEl.querySelectorAll<HTMLSpanElement>('.tut-dot').forEach((d, i) => {
            d.classList.toggle('tut-dot-active', i === index);
        });

        // Tombol Kembali hanya tampil ab halaman 2+
        this._prevBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    }

    private _setContent(page: TutorialPage, isLast: boolean): void {
        this._iconEl.textContent = page.icon;
        this._titleEl.textContent = page.title;
        // Preserve newlines dari konten
        this._bodyEl.innerHTML = page.body
            .split('\n')
            .map(line => `<span>${line}</span>`)
            .join('<br>');
        this._nextBtn.textContent = isLast ? 'Mulai! ›' : 'Lanjut ›';
        this._nextBtn.classList.toggle('tut-btn-start', isLast);
    }

    private _goTo(index: number): void {
        if (index < 0 || index >= PAGES.length) return;
        this._page = index;
        this._renderPage(index, true);
    }

    private _finish(): void {
        const cb = this._onDone;
        this.hide();
        // Delay agar animasi keluar selesai sebelum game aktif
        setTimeout(() => cb?.(), ANIM_MS);
    }

    private _destroy(): void {
        this._overlay?.remove();
        this._overlay = null;
    }

    // =========================================================================
    // PRIVATE — Visibility
    // =========================================================================

    private _setVisible(visible: boolean): void {
        if (!this._overlay) return;
        if (visible) {
            this._overlay.style.display = 'flex';
            requestAnimationFrame(() => {
                this._overlay?.classList.add('tut-visible');
            });
        } else {
            this._overlay.classList.remove('tut-visible');
            setTimeout(() => {
                if (this._overlay) this._overlay.style.display = 'none';
            }, ANIM_MS);
        }
    }

    // =========================================================================
    // PRIVATE — CSS injection (idempotent)
    // =========================================================================

    private static _stylesInjected = false;

    private _injectStyles(): void {
        if (TutorialUI._stylesInjected) return;
        TutorialUI._stylesInjected = true;

        const s = document.createElement('style');
        s.id = 'geo-tutorial-styles';
        s.textContent = /* css */`

            /* ── Backdrop ── */
            #tut-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 3000;          /* di atas MainMenu (2000) dan QuestionUI (1010) */
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                background: rgba(0, 0, 0, 0.55);
                opacity: 0;
                transition: opacity ${ANIM_MS}ms ease;
            }
            #tut-backdrop.tut-visible { opacity: 1; }

            /* ── Panel ── */
            #tut-panel {
                width: 100%;
                max-width: 400px;
                background: #fffdf5;
                border: 3px solid #2d7a3a;
                /* Pixel drop-shadow — aksen retro tanpa kehilangan keterbacaan */
                box-shadow:
                    5px 5px 0 #1a5427,
                    0 12px 40px rgba(0,0,0,0.25);
                border-radius: 4px;     /* minimal radius = lebih kotak, lebih retro */
                padding: 28px 24px 22px;
                box-sizing: border-box;
                transform: scale(0.9) translateY(20px);
                transition:
                    transform ${ANIM_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity   ${ANIM_MS}ms ease;
                text-align: center;
            }
            #tut-backdrop.tut-visible #tut-panel {
                transform: scale(1) translateY(0);
            }

            /* ── Icon ── */
            #tut-icon {
                font-size: 52px;
                line-height: 1;
                margin-bottom: 14px;
                display: block;
                transition: opacity ${ANIM_MS / 2}ms ease, transform ${ANIM_MS / 2}ms ease;
            }
            #tut-icon.tut-slide-out {
                opacity: 0;
                transform: translateX(-16px);
            }
            #tut-icon.tut-slide-in {
                animation: tut-enter ${ANIM_MS}ms ease-out both;
            }
            @keyframes tut-enter {
                from { opacity: 0; transform: translateX(16px); }
                to   { opacity: 1; transform: translateX(0); }
            }

            /* ── Title ── */
            #tut-title {
                font-family: 'Press Start 2P', monospace, sans-serif;
                font-size: clamp(10px, 2.5vw, 13px);
                color: #2d7a3a;
                letter-spacing: 1px;
                margin: 0 0 14px;
                line-height: 1.6;
            }

            /* ── Body ── */
            #tut-body {
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                line-height: 1.8;
                color: #333;
                margin: 0 0 20px;
                text-align: left;
            }

            /* ── Page dots ── */
            #tut-dots {
                display: flex;
                justify-content: center;
                gap: 8px;
                margin-bottom: 20px;
            }
            .tut-dot {
                width: 8px;
                height: 8px;
                border-radius: 0;       /* kotak = lebih pixel-art */
                background: #ccc;
                transition: background 200ms ease, transform 200ms ease;
            }
            .tut-dot.tut-dot-active {
                background: #2d7a3a;
                transform: scale(1.4);
            }

            /* ── Actions ── */
            #tut-actions {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }

            /* ── Tombol shared ── */
            #tut-prev,
            #tut-next {
                padding: 10px 18px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 13px;
                font-weight: 700;
                border: 2px solid currentColor;
                border-radius: 4px;
                cursor: pointer;
                transition: background 100ms ease, transform 80ms ease, box-shadow 80ms ease;
            }
            #tut-prev:active,
            #tut-next:active { transform: translate(2px, 2px); box-shadow: none; }

            /* ── Kembali (ghost) ── */
            #tut-prev {
                background: transparent;
                color: #777;
                border-color: #ccc;
                box-shadow: 2px 2px 0 #bbb;
            }
            #tut-prev:hover { background: #f0f0f0; }

            /* ── Lanjut (filled) ── */
            #tut-next {
                background: #2d7a3a;
                color: #fff;
                border-color: #2d7a3a;
                box-shadow: 3px 3px 0 #1a5427;
                flex: 1;
            }
            #tut-next:hover { background: #246630; }

            /* ── Mulai! — warna berbeda supaya terasa special ── */
            #tut-next.tut-btn-start {
                background: #e67e22;
                border-color: #e67e22;
                box-shadow: 3px 3px 0 #a85713;
            }
            #tut-next.tut-btn-start:hover { background: #d35400; }

            @media (max-width: 360px) {
                #tut-panel  { padding: 20px 16px 18px; }
                #tut-title  { font-size: 10px; }
                #tut-body   { font-size: 13px; }
            }
        `;
        document.head.appendChild(s);
    }
}