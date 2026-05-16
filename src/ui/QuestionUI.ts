// src/ui/QuestionUI.ts
//
// Pure renderer untuk sesi soal Polya.

import { QuestionLogic, type QuestionEvent, type Question } from '../core/QuestionLogic'
// =============================================================================
// CONSTANTS
// =============================================================================

const ANIM_DURATION_MS = 200;
const POST_CORRECT_DELAY_MS = 1800;
const STAR_CHARS = ['⭐', '✨', '🌟', '💫'];

// =============================================================================
// CLASS
// =============================================================================

export class QuestionUI {

    // DOM elements 
    private readonly backdrop: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly soalText: HTMLParagraphElement;
    private readonly polyaCard: HTMLDivElement;
    private readonly polyaPrompt: HTMLParagraphElement;
    readonly polyaInput: HTMLInputElement;
    private readonly stepDots: HTMLDivElement;
    private readonly stepLabel: HTMLSpanElement;
    private readonly feedbackArea: HTMLDivElement;
    readonly btnHint: HTMLButtonElement;
    readonly btnSubmit: HTMLButtonElement;
    private readonly starsLayer: HTMLDivElement;

    // Session state (UI-only) 

    private _question: Question | null = null;
    private _hintVisible: boolean = false;

    // QuestionLogic wiring 

    /** Referensi ke QuestionLogic aktif selama sesi. Null di luar sesi. */
    private _logic: QuestionLogic | null = null;

    /**
     * Referensi handler yang di-bind per sesi.
     * Disimpan supaya bisa di-off() dengan referensi yang sama saat sesi berakhir.
     * Tanpa ini, setiap sesi akan menambah listener baru tanpa pernah membersihkan yang lama.
     */
    private _onQuestionEvent: ((event: QuestionEvent) => void) | null = null;

    // Bound DOM handlers 
    private readonly _handleHint: () => void;
    private readonly _handleSubmit: () => void;
    private readonly _handleKeyDown: (e: KeyboardEvent) => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {

        // CSS injection 
        const style = document.createElement('style');
        style.textContent = /* css */`

            #question-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 1010;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                background: rgba(0, 0, 0, 0.6);
                opacity: 0;
                transition: opacity ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible {
                display: flex;
                opacity: 1;
            }

            #question-panel {
                position: relative;
                width: 100%;
                max-width: 460px;
                max-height: 92vh;
                overflow-y: auto;
                background: #fffdf5;
                border-radius: 20px;
                box-shadow: 0 10px 48px rgba(0, 0, 0, 0.28);
                padding: 22px 22px 26px;
                box-sizing: border-box;
                transform: scale(0.9) translateY(24px);
                transition:
                    transform ${ANIM_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity   ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible #question-panel {
                transform: scale(1) translateY(0);
            }

            @keyframes q-shake {
                0%, 100% { transform: translateX(0) scale(1); }
                15%       { transform: translateX(-9px) scale(1.01); }
                30%       { transform: translateX( 9px) scale(1.01); }
                45%       { transform: translateX(-6px); }
                60%       { transform: translateX( 6px); }
                75%       { transform: translateX(-3px); }
                90%       { transform: translateX( 3px); }
            }
            #question-panel.q-shake {
                animation: q-shake 0.46s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
            }

            @keyframes q-wiggle {
                0%, 100% { transform: translateX(0); }
                25%       { transform: translateX(-5px); }
                75%       { transform: translateX( 5px); }
            }
            .q-polya-input.q-wiggle {
                animation: q-wiggle 0.28s ease both;
            }

            @keyframes q-card-enter {
                from { opacity: 0.4; transform: translateX(18px); }
                to   { opacity: 1;   transform: translateX(0); }
            }
            .q-polya-card.q-card-enter {
                animation: q-card-enter 0.22s ease-out both;
            }

            .q-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 16px;
            }
            .q-step-dots { display: flex; gap: 6px; }
            .q-dot {
                width: 10px; height: 10px;
                border-radius: 50%;
                background: #ddd;
                transition: background 200ms ease, transform 200ms ease;
            }
            .q-dot.q-dot-done   { background: #2d7a3a; }
            .q-dot.q-dot-active {
                background: #2d7a3a;
                transform: scale(1.35);
                box-shadow: 0 0 0 3px rgba(45, 122, 58, 0.2);
            }
            .q-step-label { font-size: 12px; color: #888; margin-left: auto; }

            .q-soal-text {
                font-size: 15px;
                line-height: 1.55;
                color: #222;
                margin: 0 0 14px;
            }

            .q-polya-card {
                background: #f0f7f1;
                border-left: 4px solid #2d7a3a;
                border-radius: 10px;
                padding: 12px 14px;
                margin-bottom: 12px;
            }
            .q-polya-prompt {
                font-size: 14px;
                color: #2d4a31;
                margin: 0 0 10px;
                font-style: italic;
            }
            .q-polya-input {
                width: 100%;
                padding: 9px 12px;
                font-size: 15px;
                border: 2px solid #b5d4b9;
                border-radius: 8px;
                box-sizing: border-box;
                outline: none;
                transition: border-color 150ms ease;
            }
            .q-polya-input:focus        { border-color: #2d7a3a; }
            .q-polya-input.q-input-correct { border-color: #2d7a3a; background: #e8f5ea; }
            .q-polya-input.q-input-error   { border-color: #c0392b; background: #fdf0ef; }

            .q-feedback { font-size: 13px; min-height: 20px; margin-bottom: 10px; color: #555; }
            .q-feedback-correct { color: #2d7a3a; font-weight: 600; }
            .q-feedback-error   { color: #c0392b; }
            .q-feedback-hint    { color: #555; }
            .q-error-badge {
                display: inline-block;
                background: #fdf0ef;
                color: #c0392b;
                border: 1px solid #f5c6c2;
                border-radius: 6px;
                padding: 2px 8px;
                font-size: 12px;
                margin-bottom: 6px;
            }
            .q-feedback-hint-with-error { display: flex; flex-direction: column; gap: 4px; }

            .q-actions { display: flex; gap: 10px; justify-content: flex-end; }
            .q-btn {
                padding: 9px 20px;
                border-radius: 10px;
                border: none;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: opacity 150ms ease, transform 100ms ease;
            }
            .q-btn:active    { transform: scale(0.96); }
            .q-btn:disabled  { opacity: 0.45; cursor: not-allowed; }
            .q-btn-hint   { background: #f0f0f0; color: #555; }
            .q-btn-submit { background: #2d7a3a; color: #fff; }

            .q-stars-layer {
                position: absolute;
                inset: 0;
                pointer-events: none;
                overflow: hidden;
                border-radius: 20px;
            }
            @keyframes q-star-fly {
                0%   { transform: translateY(0)   scale(0.5); opacity: 1; }
                100% { transform: translateY(-90px) scale(1.2); opacity: 0; }
            }
            .q-star {
                position: absolute;
                bottom: 30%;
                font-size: 24px;
                animation: q-star-fly var(--dur) var(--delay) ease-out both;
            }
        `;
        document.head.appendChild(style);

        // DOM construction 

        this.backdrop = document.createElement('div');
        this.backdrop.id = 'question-backdrop';

        this.panel = document.createElement('div');
        this.panel.id = 'question-panel';

        // Header: step dots + label
        const header = document.createElement('div');
        header.className = 'q-header';

        this.stepDots = document.createElement('div');
        this.stepDots.className = 'q-step-dots';

        this.stepLabel = document.createElement('span');
        this.stepLabel.className = 'q-step-label';

        header.appendChild(this.stepDots);
        header.appendChild(this.stepLabel);

        // Soal text
        this.soalText = document.createElement('p');
        this.soalText.className = 'q-soal-text';

        // Polya card: prompt + input
        this.polyaCard = document.createElement('div');
        this.polyaCard.className = 'q-polya-card';

        this.polyaPrompt = document.createElement('p');
        this.polyaPrompt.className = 'q-polya-prompt';

        this.polyaInput = document.createElement('input');
        this.polyaInput.className = 'q-polya-input';
        this.polyaInput.type = 'text';
        this.polyaInput.inputMode = 'numeric';
        this.polyaInput.placeholder = 'Ketik jawabanmu di sini...';

        this.polyaCard.appendChild(this.polyaPrompt);
        this.polyaCard.appendChild(this.polyaInput);

        // Feedback area
        this.feedbackArea = document.createElement('div');
        this.feedbackArea.className = 'q-feedback';

        // Actions
        const actions = document.createElement('div');
        actions.className = 'q-actions';

        this.btnHint = document.createElement('button');
        this.btnHint.className = 'q-btn q-btn-hint';
        this.btnHint.textContent = '💡 Hint';
        this.btnHint.type = 'button';

        this.btnSubmit = document.createElement('button');
        this.btnSubmit.className = 'q-btn q-btn-submit';
        this.btnSubmit.textContent = 'Lanjut ›';
        this.btnSubmit.type = 'button';

        actions.appendChild(this.btnHint);
        actions.appendChild(this.btnSubmit);

        // Stars layer
        this.starsLayer = document.createElement('div');
        this.starsLayer.className = 'q-stars-layer';
        this.starsLayer.setAttribute('aria-hidden', 'true');

        // Assemble
        this.panel.appendChild(header);
        this.panel.appendChild(this.soalText);
        this.panel.appendChild(this.polyaCard);
        this.panel.appendChild(this.feedbackArea);
        this.panel.appendChild(actions);
        this.panel.appendChild(this.starsLayer);
        this.backdrop.appendChild(this.panel);
        document.body.appendChild(this.backdrop);

        // ── Bound event handlers ──────────────────────────────────────────────

        // Disimpan sebagai property agar removeEventListener di destroy() bisa pakai
        // referensi yang sama — anonymous function tidak bisa di-remove.
        this._handleHint = () => this._onHintClick();
        this._handleSubmit = () => this._onSubmitClick();
        this._handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); this._onSubmitClick(); }
        };

        this.btnHint.addEventListener('click', this._handleHint);
        this.btnSubmit.addEventListener('click', this._handleSubmit);
        this.polyaInput.addEventListener('keydown', this._handleKeyDown);

        this._setVisible(false);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Tampilkan panel soal dan mulai mendengarkan event dari QuestionLogic.
     *
     * Signature berubah dari show(question, onCorrect) menjadi show(question, logic).
     * Tidak ada lagi callback — DialogManager bereaksi ke SESSION_COMPLETE dari QuestionLogic,
     * bukan dari QuestionUI secara langsung.
     */
    public show(question: Question, logic: QuestionLogic): void {
        if (this._isVisible()) this._clearState();

        this._question = question;
        this._logic = logic;
        this._hintVisible = false;

        // Subscribe ke event QuestionLogic untuk sesi ini.
        // Handler baru dibuat per sesi agar bisa di-off() dengan tepat.
        this._onQuestionEvent = (event) => this._handleQuestionEvent(event);
        this._logic.on(this._onQuestionEvent);

        this._resetDom();
        this._buildStepDots(question.polya_steps.length);
        this.soalText.textContent = question.teks_soal;
        this._renderStep(0);
        this._setVisible(true);

        requestAnimationFrame(() => this.polyaInput.focus());
    }

    public hide(): void {
        this._setVisible(false);
        // Delay clear agar transisi keluar selesai dulu sebelum DOM direset.
        setTimeout(() => this._clearState(), ANIM_DURATION_MS);
    }

    public destroy(): void {
        this.hide();
        this.btnHint.removeEventListener('click', this._handleHint);
        this.btnSubmit.removeEventListener('click', this._handleSubmit);
        this.polyaInput.removeEventListener('keydown', this._handleKeyDown);
        this.backdrop.parentNode?.removeChild(this.backdrop);
    }

    // =========================================================================
    // PRIVATE — State management
    // =========================================================================

    private _clearState(): void {
        // Penting: unsubscribe dari QuestionLogic sebelum null-kan referensi.
        // Tanpa ini, handler yang sudah "mati" tetap terdaftar dan akan fire
        // di sesi berikutnya → double-render dan potensi stale closure bug.
        if (this._logic && this._onQuestionEvent) {
            this._logic.off(this._onQuestionEvent);
        }
        this._logic = null;
        this._onQuestionEvent = null;
        this._question = null;
        this._hintVisible = false;

        this._resetDom();
    }

    private _resetDom(): void {
        this.polyaInput.value = '';
        this.polyaInput.disabled = false;
        this.polyaInput.classList.remove('q-input-correct', 'q-input-error');

        this.btnSubmit.disabled = false;
        this.btnHint.disabled = false;
        this.btnSubmit.textContent = 'Lanjut ›';

        this.feedbackArea.textContent = '';
        this.feedbackArea.className = 'q-feedback';

        this.panel.classList.remove('q-shake');
        this.starsLayer.innerHTML = '';
        this.starsLayer.classList.remove('q-stars-active');
    }

    // =========================================================================
    // PRIVATE — QuestionLogic event handler
    //
    // Inilah "jantung" baru QuestionUI setelah refactor.
    // Semua perubahan state yang sebelumnya tersebar di _handleCorrect()
    // dan _handleWrong() sekarang terpusat di sini, dikontrol oleh QuestionLogic.
    // =========================================================================

    private _handleQuestionEvent(event: QuestionEvent): void {
        switch (event.type) {

            case 'STEP_ADVANCED':
                // QuestionLogic sudah validasi input step sebelumnya — lanjut render.
                this._renderStep(event.newStep);
                break;

            case 'ANSWER_WRONG':
                this.polyaInput.classList.add('q-input-error');
                this._triggerShake();

                // Hint otomatis muncul setelah jawaban pertama kali salah.
                // Tidak perlu panggil logic.getHint() karena ini auto-show,
                // bukan user request — hintUsed tracking tetap akurat di QuestionLogic.
                if (!this._hintVisible) {
                    this._hintVisible = true;
                    this._showHint(this._question?.hint ?? '');
                }

                this._showFeedback(
                    'error',
                    `Coba lagi! Sisa ${event.maxAttempts - event.attempts} kesempatan.`,
                );
                break;

            case 'ANSWER_REVEALED':
                // Attempts habis — tampilkan jawaban benar, kunci UI.
                // JANGAN panggil hide() di sini: SESSION_COMPLETE akan menyusul
                // langsung setelah ini (synchronous di QuestionLogic) dan
                // SESSION_COMPLETE yang bertanggung jawab menutup panel.
                this.polyaInput.disabled = true;
                this.btnSubmit.disabled = true;
                this.btnHint.disabled = true;
                this._showFeedback(
                    'error',
                    `❌ Jawaban yang benar adalah ${this._question!.jawaban}.`,
                );
                break;

            case 'SESSION_COMPLETE':
                if (event.score.stars > 0) {
                    // Jawaban benar — tampilkan selebrasi.
                    this.polyaInput.disabled = true;
                    this.btnSubmit.disabled = true;
                    this.btnHint.disabled = true;
                    this.polyaInput.classList.add('q-input-correct');
                    this._showFeedback('correct', '🎉 Benar! Kamu hebat!');
                    this._triggerStarAnimation(event.score.stars);
                }
                // Baik benar (stars > 0) maupun attempts habis (stars = 0):
                // tutup panel setelah delay agar player sempat melihat feedback.
                setTimeout(() => this.hide(), POST_CORRECT_DELAY_MS);
                break;
        }
    }

    // =========================================================================
    // PRIVATE — DOM event handlers (delegate ke QuestionLogic)
    // =========================================================================

    private _onSubmitClick(): void {
        const raw = this.polyaInput.value.trim();
        if (!raw) {
            // Input kosong — wiggle saja, jangan submit ke logic.
            this._wiggleInput();
            return;
        }
        // Delegasi penuh ke QuestionLogic.
        // QuestionUI tidak tahu apakah ini step terakhir atau bukan —
        // itu adalah domain logic, bukan domain presentasi.
        this._logic?.submitStep(raw);
    }

    private _onHintClick(): void {
        // Guard: jika hint sudah tampil atau tidak ada sesi aktif, abaikan.
        if (!this._logic || this._hintVisible) return;

        // getHint() sekaligus mencatat hintUsed = true di QuestionLogic.
        const hintText = this._logic.getHint();
        this._hintVisible = true;
        this._showHint(hintText);
    }

    // =========================================================================
    // PRIVATE — Rendering
    // =========================================================================

    private _buildStepDots(total: number): void {
        this.stepDots.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('span');
            dot.className = 'q-dot';
            dot.dataset.index = String(i);
            this.stepDots.appendChild(dot);
        }
    }

    private _updateStepDots(activeStep: number): void {
        this.stepDots.querySelectorAll<HTMLSpanElement>('.q-dot').forEach((dot, i) => {
            dot.classList.toggle('q-dot-done', i < activeStep);
            dot.classList.toggle('q-dot-active', i === activeStep);
        });
    }

    private _renderStep(step: number): void {
        const q = this._question!;
        const totalSteps = q.polya_steps.length;
        const isLast = step === totalSteps - 1;

        // Reset input untuk step baru.
        // stepInputs kini ada di SessionState (QuestionLogic) — QuestionUI
        // tidak perlu menyimpan ini lagi. Tidak ada restore, cukup clear.
        this.polyaInput.value = '';
        this.polyaInput.classList.remove('q-input-error');

        // Update prompt teks Polya
        this.polyaPrompt.textContent = q.polya_steps[step];

        // Update label dan tombol
        this.stepLabel.textContent = `Langkah ${step + 1} dari ${totalSteps}`;
        this.btnSubmit.textContent = isLast ? 'Jawab ✓' : 'Lanjut ›';

        this._updateStepDots(step);

        // Slide-in animation
        this.polyaCard.classList.remove('q-card-enter');
        void this.polyaCard.offsetWidth; // force reflow agar animasi bisa re-trigger
        this.polyaCard.classList.add('q-card-enter');

        requestAnimationFrame(() => this.polyaInput.focus());
    }

    private _showHint(hintText: string): void {
        const hintEl = document.createElement('div');
        hintEl.className = 'q-feedback q-feedback-hint';
        hintEl.textContent = `💡 ${hintText}`;

        this.feedbackArea.innerHTML = '';
        this.feedbackArea.appendChild(hintEl);
        this.feedbackArea.className = 'q-feedback';
    }

    private _showFeedback(type: 'correct' | 'error', text: string): void {
        if (type === 'error' && this._hintVisible) {
            // Tampilkan error sebagai badge di atas hint yang sudah ada.
            const errBadge = document.createElement('span');
            errBadge.className = 'q-error-badge';
            errBadge.textContent = text;

            this.feedbackArea.querySelector('.q-error-badge')?.remove();
            this.feedbackArea.prepend(errBadge);
            this.feedbackArea.classList.add('q-feedback-hint-with-error');
        } else {
            this.feedbackArea.textContent = text;
            this.feedbackArea.className = `q-feedback q-feedback-${type}`;
        }
    }

    private _triggerShake(): void {
        this.panel.classList.remove('q-shake');
        void this.panel.offsetWidth; // force reflow
        this.panel.classList.add('q-shake');
    }

    private _wiggleInput(): void {
        this.polyaInput.classList.remove('q-wiggle');
        void this.polyaInput.offsetWidth;
        this.polyaInput.classList.add('q-wiggle');
    }

    private _triggerStarAnimation(starCount: number): void {
        this.starsLayer.innerHTML = '';
        this.starsLayer.classList.add('q-stars-active');

        const particleCount = starCount * 5;

        for (let i = 0; i < particleCount; i++) {
            const el = document.createElement('span');
            el.className = 'q-star';
            el.textContent = STAR_CHARS[i % STAR_CHARS.length];

            const leftPct = 5 + Math.random() * 90;
            const delayS = Math.random() * 0.5;
            const durationS = 0.8 + Math.random() * 0.7;

            el.style.cssText =
                `left: ${leftPct}%;` +
                `--delay: ${delayS}s;` +
                `--dur: ${durationS}s;` +
                `font-size: ${22 + Math.random() * 16}px;`;

            this.starsLayer.appendChild(el);
        }
    }

    // =========================================================================
    // PRIVATE — Visibility helpers
    // =========================================================================

    private _setVisible(visible: boolean): void {
        if (visible) {
            this.backdrop.style.display = 'flex';
            // rAF untuk memastikan display:flex sudah aktif sebelum class ditambah
            // — ini yang memungkinkan CSS transition berjalan.
            requestAnimationFrame(() => {
                this.backdrop.classList.add('question-visible');
            });
        } else {
            this.backdrop.classList.remove('question-visible');
            // Sembunyikan sepenuhnya setelah transisi selesai.
            setTimeout(() => {
                this.backdrop.style.display = 'none';
            }, ANIM_DURATION_MS);
        }
    }

    private _isVisible(): boolean {
        return this.backdrop.classList.contains('question-visible');
    }
}