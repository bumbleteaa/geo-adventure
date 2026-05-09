// src/ui/DialogUI.ts — TICKET-06
// Docs: TICKET-06-DialogUI.md

type OnCompleteCallback = () => void;

const ANIM_DURATION_MS = 280;

export class DialogUI {

    // ── DOM ───────────────────────────────────────────────────────────────────

    private readonly backdrop: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly nameLabel: HTMLDivElement;
    private readonly bodyText: HTMLParagraphElement;
    private readonly nextButton: HTMLButtonElement;

    // ── State ─────────────────────────────────────────────────────────────────

    private _onComplete: OnCompleteCallback | null = null;
    private _completed = false;

    // ── Bound handlers ────────────────────────────────────────────────────────

    private readonly _handleBackdropClick: (e: MouseEvent) => void;
    private readonly _handleNextClick: () => void;
    private readonly _handleKeyDown: (e: KeyboardEvent) => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        DialogUI._injectStyles();

        this.backdrop = document.createElement('div');
        this.backdrop.id = 'dialog-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');

        this.panel = document.createElement('div');
        this.panel.id = 'dialog-panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-labelledby', 'dialog-npc-name');

        this.nameLabel = document.createElement('div');
        this.nameLabel.id = 'dialog-npc-name';
        this.nameLabel.className = 'dialog-name';

        this.bodyText = document.createElement('p');
        this.bodyText.className = 'dialog-body';

        this.nextButton = document.createElement('button');
        this.nextButton.className = 'dialog-btn-next';
        this.nextButton.textContent = 'Lanjut ›';
        this.nextButton.setAttribute('aria-label', 'Lanjutkan ke pertanyaan');

        this.panel.appendChild(this.nameLabel);
        this.panel.appendChild(this.bodyText);
        this.panel.appendChild(this.nextButton);
        this.backdrop.appendChild(this.panel);
        document.body.appendChild(this.backdrop);

        // Simpan referensi fungsi — removeEventListener butuh referensi yang sama persis.
        // Lihat docs: "Kenapa bound handlers disimpan ke property"
        this._handleBackdropClick = (e: MouseEvent) => {
            if (e.target === this.backdrop) this._complete();
        };
        this._handleNextClick = () => this._complete();
        this._handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                this._complete();
            }
        };

        this._setVisible(false);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /** Tampilkan dialog NPC. `onComplete` dipanggil setelah player dismiss. */
    public show(
        npcName: string,
        dialogText: string,
        onComplete: OnCompleteCallback
    ): void {
        // Jika dialog sudah terbuka, tutup dulu tanpa trigger callback lama.
        if (this._isVisible()) this._detachListeners();

        this._completed = false;
        this._onComplete = onComplete;

        this.nameLabel.textContent = npcName;
        this.bodyText.textContent = dialogText;

        this._attachListeners();
        this._setVisible(true);

        requestAnimationFrame(() => this.nextButton.focus());
    }

    /** Tutup dialog tanpa memanggil callback. */
    public hide(): void {
        this._detachListeners();
        this._setVisible(false);
        this._onComplete = null;
        this._completed = false;
    }

    /**
     * Hapus DOM node sepenuhnya.
     * Panggil di SchoolWorld saat scene `SHUTDOWN`.
     */
    public destroy(): void {
        this.hide();
        this.backdrop.parentNode?.removeChild(this.backdrop);
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    /** Guard double-fire — lihat docs: "Race condition: double-fire" */
    private _complete(): void {
        if (this._completed) return;
        this._completed = true;

        const cb = this._onComplete;
        this.hide();

        // Delay agar slide-out selesai sebelum QuestionUI muncul.
        if (cb) setTimeout(cb, ANIM_DURATION_MS);
    }

    private _attachListeners(): void {
        this.backdrop.addEventListener('click', this._handleBackdropClick);
        this.nextButton.addEventListener('click', this._handleNextClick);
        document.addEventListener('keydown', this._handleKeyDown);
    }

    private _detachListeners(): void {
        this.backdrop.removeEventListener('click', this._handleBackdropClick);
        this.nextButton.removeEventListener('click', this._handleNextClick);
        document.removeEventListener('keydown', this._handleKeyDown);
    }

    private _isVisible(): boolean {
        return this.backdrop.style.display !== 'none';
    }

    /** Dua-step visibility — lihat docs: "Dua-step visibility" */
    private _setVisible(visible: boolean): void {
        if (visible) {
            this.backdrop.style.display = 'flex';
            requestAnimationFrame(() => this.backdrop.classList.add('dialog-visible'));
        } else {
            this.backdrop.classList.remove('dialog-visible');
            setTimeout(() => { this.backdrop.style.display = 'none'; }, ANIM_DURATION_MS);
        }
    }

    // =========================================================================
    // STATIC — CSS INJECTION
    // =========================================================================

    private static _stylesInjected = false;

    /** Self-contained styles — lihat docs: "Kenapa CSS di-inject inline" */
    private static _injectStyles(): void {
        if (DialogUI._stylesInjected) return;
        DialogUI._stylesInjected = true;

        const style = document.createElement('style');
        style.id = 'geo-dialog-styles';
        style.textContent = /* css */`
            #dialog-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 1000;
                align-items: flex-end;
                justify-content: center;
                background: rgba(0, 0, 0, 0.35);
                opacity: 0;
                transition: opacity ${ANIM_DURATION_MS}ms ease;
            }
            #dialog-backdrop.dialog-visible { opacity: 1; }

            #dialog-panel {
                width: 100%;
                max-width: 480px;
                padding: 20px 24px 28px;
                margin: 0 12px;
                box-sizing: border-box;
                background: #fffdf5;
                border-radius: 16px 16px 0 0;
                box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
                transform: translateY(100%);
                transition: transform ${ANIM_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #dialog-backdrop.dialog-visible #dialog-panel { transform: translateY(0); }

            .dialog-name {
                display: inline-block;
                padding: 4px 12px;
                margin-bottom: 12px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                color: #fff;
                background: #2d7a3a;
                border-radius: 99px;
            }

            .dialog-body {
                margin: 0 0 20px;
                padding: 0;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: #2c2c2c;
            }

            .dialog-btn-next {
                display: block;
                width: 100%;
                padding: 14px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 15px;
                font-weight: 700;
                color: #fff;
                text-align: center;
                background: #2d7a3a;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                transition: background 120ms ease, transform 80ms ease;
            }
            .dialog-btn-next:hover  { background: #246630; }
            .dialog-btn-next:active { transform: scale(0.97); background: #1d5429; }
            .dialog-btn-next:focus-visible { outline: 3px solid #2d7a3a; outline-offset: 3px; }

            @media (max-width: 360px) {
                #dialog-panel  { padding: 16px 16px 24px; margin: 0; }
                .dialog-body   { font-size: 15px; }
            }
        `;

        document.head.appendChild(style);
    }
}