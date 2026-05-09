// src/ui/QuestionUI.ts — TICKET-07
// Docs: ticket07.md

import { EventBus, GameEvent } from '../core/EventBus';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Question {
    id: string;
    npc_id: string;
    teks_soal: string;
    jawaban: number;
    hint: string;
    polya_steps: string[];
}

type OnCorrectCallback = () => void;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maksimum percobaan salah di step akhir sebelum tampil jawaban */
const MAX_ATTEMPTS = 3;

/** Durasi transisi masuk/keluar panel — harus cocok dengan CSS */
const ANIM_DURATION_MS = 300;

/**
 * Delay setelah animasi bintang sebelum hide() + onCorrect() dipanggil.
 * Cukup lama agar player menikmati momen, tidak terlalu lama agar tidak bosan.
 */
const POST_CORRECT_DELAY_MS = 2400;

/** Bintang yang didapat berdasarkan percobaan ke-N (1-indexed) */
const STARS_BY_ATTEMPT: Readonly<Record<number, number>> = {
    1: 3,
    2: 2,
    3: 1,
};

/** Emoji bintang yang berputar saat animasi benar */
const STAR_CHARS = ['⭐', '🌟', '✨', '💫'] as const;

// ─── Class ────────────────────────────────────────────────────────────────────

export class QuestionUI {

    // ── DOM refs ──────────────────────────────────────────────────────────────

    private readonly backdrop: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly stepDots: HTMLDivElement;
    private readonly stepLabel: HTMLDivElement;
    private readonly soalText: HTMLParagraphElement;
    private readonly polyaCard: HTMLDivElement;
    private readonly polyaLabel: HTMLDivElement;
    private readonly polyaInput: HTMLInputElement;
    private readonly feedbackArea: HTMLDivElement;
    private readonly btnHint: HTMLButtonElement;
    private readonly btnSubmit: HTMLButtonElement;
    private readonly starsLayer: HTMLDivElement;

    // ── State ─────────────────────────────────────────────────────────────────

    private _question: Question | null = null;
    private _onCorrect: OnCorrectCallback | null = null;
    private _currentStep = 0;

    private _attempts = 0;       // hanya di step terakhir
    private _gaveUp = false;     // true setelah MAX_ATTEMPTS habis
    private _solved = false;     // guard double-fire di _handleCorrect
    private _hintVisible = false;
    private readonly _stepInputs: string[] = [];

    // ── Static ────────────────────────────────────────────────────────────────

    private static _stylesInjected = false;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        QuestionUI._injectStyles();

        // ── Backdrop (full-screen scrim) ──────────────────────────────────────
        this.backdrop = document.createElement('div');
        this.backdrop.id = 'question-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');

        // ── Panel (kartu utama) ───────────────────────────────────────────────
        this.panel = document.createElement('div');
        this.panel.id = 'question-panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-labelledby', 'q-soal-text');

        // ── Header: step dots + label ─────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'q-header';

        this.stepDots = document.createElement('div');
        this.stepDots.className = 'q-step-dots';

        this.stepLabel = document.createElement('div');
        this.stepLabel.className = 'q-step-label';

        header.appendChild(this.stepDots);
        header.appendChild(this.stepLabel);

        // ── Soal text ─────────────────────────────────────────────────────────
        this.soalText = document.createElement('p');
        this.soalText.id = 'q-soal-text';
        this.soalText.className = 'q-soal-text';

        // ── Polya card (langkah aktif) ────────────────────────────────────────
        this.polyaCard = document.createElement('div');
        this.polyaCard.className = 'q-polya-card';

        this.polyaLabel = document.createElement('div');
        this.polyaLabel.className = 'q-polya-label';

        this.polyaInput = document.createElement('input');
        this.polyaInput.type = 'number';
        this.polyaInput.className = 'q-polya-input';
        this.polyaInput.setAttribute('inputmode', 'numeric');
        this.polyaInput.setAttribute('aria-label', 'Input jawabanmu di sini');
        this.polyaInput.placeholder = '0';

        this.polyaCard.appendChild(this.polyaLabel);
        this.polyaCard.appendChild(this.polyaInput);

        // ── Feedback area (hint / error / correct message) ────────────────────
        this.feedbackArea = document.createElement('div');
        this.feedbackArea.className = 'q-feedback';
        this.feedbackArea.setAttribute('role', 'status');
        this.feedbackArea.setAttribute('aria-live', 'polite');

        // ── Action row ────────────────────────────────────────────────────────
        const actions = document.createElement('div');
        actions.className = 'q-actions';

        this.btnHint = document.createElement('button');
        this.btnHint.className = 'q-btn q-btn-hint';
        this.btnHint.textContent = '💡 Hint';
        this.btnHint.setAttribute('aria-label', 'Tampilkan petunjuk');
        this.btnHint.type = 'button';

        this.btnSubmit = document.createElement('button');
        this.btnSubmit.className = 'q-btn q-btn-submit';
        this.btnSubmit.textContent = 'Lanjut ›';
        this.btnSubmit.type = 'button';

        actions.appendChild(this.btnHint);
        actions.appendChild(this.btnSubmit);

        // ── Stars layer (absolutely positioned, rendered on top) ──────────────
        this.starsLayer = document.createElement('div');
        this.starsLayer.className = 'q-stars-layer';
        this.starsLayer.setAttribute('aria-hidden', 'true');

        // ── Assemble DOM tree ─────────────────────────────────────────────────
        this.panel.appendChild(header);
        this.panel.appendChild(this.soalText);
        this.panel.appendChild(this.polyaCard);
        this.panel.appendChild(this.feedbackArea);
        this.panel.appendChild(actions);
        this.panel.appendChild(this.starsLayer);

        this.backdrop.appendChild(this.panel);
        document.body.appendChild(this.backdrop);

        // Attach event listeners (bound arrow functions sebagai property class)
        this.btnHint.addEventListener('click', this._handleHint);
        this.btnSubmit.addEventListener('click', this._handleSubmit);
        this.polyaInput.addEventListener('keydown', this._handleKeyDown);

        this._setVisible(false);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    public show(question: Question, onCorrect?: OnCorrectCallback): void {
        // Jika sedang tampil, tutup state lama tanpa memicu callback
        if (this._isVisible()) this._clearState();

        this._question = question;
        this._onCorrect = onCorrect ?? null;

        this._clearState();
        this._buildStepDots(question.polya_steps.length);
        this._renderStep(0);
        this._setVisible(true);

        requestAnimationFrame(() => this.polyaInput.focus());
    }

    /** Tutup tanpa memicu callback. */
    public hide(): void {
        this._setVisible(false);
        // Delay clear agar transition keluar selesai dulu
        setTimeout(() => this._clearState(), ANIM_DURATION_MS);
        this._onCorrect = null;
        this._question = null;
    }

    /** Hapus DOM node. Panggil saat scene SHUTDOWN. */
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
        this._currentStep = 0;
        this._attempts = 0;
        this._gaveUp = false;
        this._solved = false;
        this._hintVisible = false;
        this._stepInputs.length = 0;

        this.polyaInput.value = '';
        this.polyaInput.disabled = false;
        this.polyaInput.classList.remove('q-input-correct', 'q-input-error');

        this.btnSubmit.disabled = false;
        this.btnSubmit.textContent = 'Lanjut ›';

        this.feedbackArea.textContent = '';
        this.feedbackArea.className = 'q-feedback';

        this.panel.classList.remove('q-shake');
        this.starsLayer.innerHTML = '';
        this.starsLayer.classList.remove('q-stars-active');
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

        this._currentStep = step;

        // Restore input value jika player sebelumnya sudah mengisi step ini
        this.polyaInput.value = this._stepInputs[step] ?? '';
        this.polyaInput.disabled = false;
        this.polyaInput.classList.remove('q-input-correct', 'q-input-error');

        // Step indicator label & dots
        this.stepLabel.textContent = `Langkah ${step + 1} dari ${totalSteps}`;
        this._updateStepDots(step);

        // Soal text selalu tampil
        this.soalText.textContent = q.teks_soal;

        // Polya step label untuk step saat ini
        this.polyaLabel.textContent = q.polya_steps[step];

        // Tombol Lanjut → Jawab! di step terakhir
        const isLastStep = step === totalSteps - 1;
        this.btnSubmit.textContent = isLastStep ? 'Jawab! ›' : 'Lanjut ›';
        this.btnSubmit.disabled = false;

        // Reset feedback, kecuali hint yang sudah ditampilkan tetap muncul
        if (this._hintVisible) {
            this._showHint();
        } else {
            this.feedbackArea.textContent = '';
            this.feedbackArea.className = 'q-feedback';
        }

        // Animate polya card masuk dari kanan
        this.polyaCard.classList.remove('q-card-enter');
        void this.polyaCard.offsetWidth; // force reflow
        this.polyaCard.classList.add('q-card-enter');

        requestAnimationFrame(() => this.polyaInput.focus());
    }

    // =========================================================================
    // PRIVATE — Event handlers (bound arrow functions)
    // =========================================================================

    // Bound arrow functions — referensi identik untuk removeEventListener (lihat ticket07.md)

    private readonly _handleHint = (): void => {
        this._hintVisible = true;
        this._showHint();
    };

    private readonly _handleSubmit = (): void => {
        // Guard: player sudah solve atau give-up
        if (this._solved) return;

        if (this._gaveUp) {
            this._emitSkipped();
            this.hide();
            return;
        }

        const raw = this.polyaInput.value.trim();

        if (raw === '') {
            this._showFeedback('warning', '⚠️  Isi dulu ya, jangan dikosongkan!');
            this._wiggleInput();
            return;
        }

        this._stepInputs[this._currentStep] = raw;

        const isLastStep = this._currentStep === (this._question!.polya_steps.length - 1);

        if (!isLastStep) {
            // Step 1-3: cukup non-kosong, langsung lanjut
            this._renderStep(this._currentStep + 1);
        } else {
            // Step 4: validasi terhadap jawaban
            const value = parseFloat(raw);
            this._validateFinalAnswer(value);
        }
    };

    private readonly _handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this._handleSubmit();
        }
    };

    // =========================================================================
    // PRIVATE — Validation
    // =========================================================================

    private _validateFinalAnswer(value: number): void {
        const q = this._question!;

        if (value === q.jawaban) {
            this._handleCorrect();
        } else {
            this._handleWrong();
        }
    }

    private _handleCorrect(): void {
        if (this._solved) return; // guard double-fire
        this._solved = true;

        const stars = STARS_BY_ATTEMPT[Math.min(this._attempts + 1, MAX_ATTEMPTS)] ?? 1;

        // Lock UI
        this.polyaInput.disabled = true;
        this.polyaInput.classList.add('q-input-correct');
        this.btnSubmit.disabled = true;
        this.btnHint.disabled = true;

        this._showFeedback('correct', '🎉  Benar! Kamu hebat!');
        this._triggerStarAnimation(stars);

        // Emit ke EventBus — GameState.ts auto-wires markComplete()
        EventBus.emit(GameEvent.QUESTION_ANSWERED, {
            questionId: this._question!.id,
            correct: true,
            attempts: this._attempts + 1,
            stars,
        });

        // Beri waktu player menikmati animasi, lalu tutup dan panggil callback
        setTimeout(() => {
            const cb = this._onCorrect;
            this.hide();
            cb?.();
        }, POST_CORRECT_DELAY_MS);
    }

    private _handleWrong(): void {
        this._attempts++;

        this.polyaInput.classList.add('q-input-error');
        this._triggerShake();

        // Hint otomatis muncul sejak percobaan pertama yang salah
        this._hintVisible = true;
        this._showHint();

        if (this._attempts >= MAX_ATTEMPTS) {
            // Habis percobaan — tampilkan jawaban benar
            this._gaveUp = true;

            this.polyaInput.disabled = true;
            this._showFeedback(
                'error',
                `❌  Jawaban yang benar adalah ${this._question!.jawaban}. Semangat untuk soal berikutnya!`,
            );

            this.btnSubmit.textContent = 'Lewati →';
            this.btnSubmit.disabled = false;
            this.btnHint.disabled = true;
        } else {
            const remaining = MAX_ATTEMPTS - this._attempts;
            this._showFeedback(
                'error',
                `❌  Belum tepat. Coba lagi! (${remaining}× kesempatan tersisa)`,
            );

            // Clear input, siap coba lagi
            this.polyaInput.value = '';
            this.polyaInput.classList.remove('q-input-error');
            setTimeout(() => this.polyaInput.focus(), 60);
        }
    }

    // =========================================================================
    // PRIVATE — EventBus emissions
    // =========================================================================

    private _emitSkipped(): void {
        EventBus.emit(GameEvent.QUESTION_SKIPPED, {
            questionId: this._question!.id,
        });

        EventBus.emit(GameEvent.QUESTION_ANSWERED, {
            questionId: this._question!.id,
            correct: false,
            attempts: this._attempts,
            stars: 0,
        });
    }

    // =========================================================================
    // PRIVATE — UI feedback helpers
    // =========================================================================

    private _showHint(): void {
        const hint = this._question!.hint;
        // innerHTML aman karena hint berasal dari questions.json (data internal)
        this.feedbackArea.innerHTML =
            `<span class="q-hint-icon">💡</span><span class="q-hint-body"><strong>Petunjuk:</strong> ${hint}</span>`;
        this.feedbackArea.className = 'q-feedback q-feedback-hint';
    }

    private _showFeedback(type: 'correct' | 'error' | 'warning', text: string): void {
        // Jika hint sudah tampil + error, tumpuk di atas hint (bukan hapus hint)
        if (type === 'error' && this._hintVisible) {
            // Prepend error badge ke feedback yang sudah ada hint
            const errBadge = document.createElement('div');
            errBadge.className = 'q-error-badge';
            errBadge.textContent = text;

            // Hapus badge lama jika ada
            this.feedbackArea.querySelector('.q-error-badge')?.remove();
            this.feedbackArea.prepend(errBadge);
            this.feedbackArea.classList.add('q-feedback-hint-with-error');
        } else {
            this.feedbackArea.textContent = text;
            this.feedbackArea.className = `q-feedback q-feedback-${type}`;
        }
    }

    /** Shake seluruh panel — jawaban salah */
    private _triggerShake(): void {
        this.panel.classList.remove('q-shake');
        void this.panel.offsetWidth; // force reflow agar animasi bisa re-trigger
        this.panel.classList.add('q-shake');
    }

    /** Animasi kecil pada input field saja (untuk warning kosong) */
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

            const leftPct = 5 + Math.random() * 90;   // 5%–95% horizontal
            const delayS = Math.random() * 0.5;       // 0–0.5s stagger
            const durationS = 0.8 + Math.random() * 0.7; // 0.8–1.5s
            const sizePx = 22 + Math.random() * 16;   // 22–38px

            el.style.cssText =
                `left:${leftPct}%;` +
                `animation-delay:${delayS.toFixed(2)}s;` +
                `animation-duration:${durationS.toFixed(2)}s;` +
                `font-size:${sizePx}px;`;

            this.starsLayer.appendChild(el);
        }
    }

    // =========================================================================
    // PRIVATE — Visibility
    // =========================================================================

    private _setVisible(visible: boolean): void {
        if (visible) {
            this.backdrop.style.display = 'flex';
            this.backdrop.setAttribute('aria-hidden', 'false');
            // rAF agar display:flex applied sebelum class ditambah (perlu reflow)
            requestAnimationFrame(() => {
                this.backdrop.classList.add('question-visible');
            });
        } else {
            this.backdrop.classList.remove('question-visible');
            this.backdrop.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                if (!this._isVisible()) this.backdrop.style.display = 'none';
            }, ANIM_DURATION_MS);
        }
    }

    private _isVisible(): boolean {
        return this.backdrop.classList.contains('question-visible');
    }

    // =========================================================================
    // PRIVATE — CSS (injeksi sekali, lalu di-cache via static flag)
    // =========================================================================

    private static _injectStyles(): void {
        if (QuestionUI._stylesInjected) return;
        QuestionUI._stylesInjected = true;

        const style = document.createElement('style');
        style.id = 'geo-question-styles';

        // Gunakan CSS custom property dari DialogUI agar palet konsisten.
        style.textContent = /* css */`

            /* ── Backdrop ──────────────────────────────────────────────────── */

            #question-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 1010;              /* di atas DialogUI (z:1000) */
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                background: rgba(0, 0, 0, 0.6);
                opacity: 0;
                transition: opacity ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible {
                opacity: 1;
            }

            /* ── Panel ─────────────────────────────────────────────────────── */

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
                /* Masuk dari bawah + sedikit scale */
                transform: scale(0.9) translateY(24px);
                transition:
                    transform ${ANIM_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity   ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible #question-panel {
                transform: scale(1) translateY(0);
            }

            /* ── Shake (jawaban salah) ──────────────────────────────────────── */

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

            /* ── Wiggle (input kosong) ──────────────────────────────────────── */

            @keyframes q-wiggle {
                0%, 100% { transform: translateX(0); }
                25%       { transform: translateX(-5px); }
                75%       { transform: translateX( 5px); }
            }
            .q-polya-input.q-wiggle {
                animation: q-wiggle 0.28s ease both;
            }

            /* ── Polya card slide-in ────────────────────────────────────────── */

            @keyframes q-card-enter {
                from { opacity: 0.4; transform: translateX(18px); }
                to   { opacity: 1;   transform: translateX(0); }
            }
            .q-polya-card.q-card-enter {
                animation: q-card-enter 0.22s ease-out both;
            }

            /* ── Header ─────────────────────────────────────────────────────── */

            .q-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 16px;
            }

            /* Step dots */
            .q-step-dots {
                display: flex;
                gap: 6px;
            }
            .q-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ddd;
                transition: background 200ms ease, transform 200ms ease;
            }
            .q-dot.q-dot-done {
                background: #2d7a3a;
            }
            .q-dot.q-dot-active {
                background: #2d7a3a;
                transform: scale(1.35);
                box-shadow: 0 0 0 3px rgba(45, 122, 58, 0.2);
            }

            /* Step label "Langkah N dari 4" */
            .q-step-label {
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.7px;
                text-transform: uppercase;
                color: #2d7a3a;
                margin-left: auto;
            }

            /* ── Soal text ──────────────────────────────────────────────────── */

            .q-soal-text {
                margin: 0 0 16px;
                padding: 12px 14px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.6;
                color: #1a1a1a;
                background: #f0f7f1;
                border-left: 4px solid #2d7a3a;
                border-radius: 4px 10px 10px 4px;
            }

            /* ── Polya card ─────────────────────────────────────────────────── */

            .q-polya-card {
                background: #fff;
                border: 2px solid #e0e0e0;
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 12px;
                transition: border-color 160ms ease;
            }
            .q-polya-card:focus-within {
                border-color: #2d7a3a;
                box-shadow: 0 0 0 3px rgba(45, 122, 58, 0.1);
            }

            .q-polya-label {
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                color: #555;
                line-height: 1.5;
                margin-bottom: 12px;
            }

            .q-polya-input {
                display: block;
                width: 100%;
                padding: 10px 14px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 22px;
                font-weight: 700;
                color: #1a1a1a;
                text-align: center;
                background: #f8f8f8;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                box-sizing: border-box;
                outline: none;
                transition:
                    border-color 160ms ease,
                    box-shadow   160ms ease,
                    background   160ms ease;
                /* Sembunyikan spinner panah angka */
                -moz-appearance: textfield;
            }
            .q-polya-input::-webkit-outer-spin-button,
            .q-polya-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            .q-polya-input:focus {
                border-color: #2d7a3a;
                box-shadow: 0 0 0 3px rgba(45, 122, 58, 0.18);
                background: #fff;
            }
            .q-polya-input:disabled {
                opacity: 0.55;
                cursor: not-allowed;
            }
            .q-polya-input.q-input-correct {
                border-color: #2e7d32;
                background: #e8f5e9;
                color: #1b5e20;
            }
            .q-polya-input.q-input-error {
                border-color: #c62828;
                background: #fdecea;
                color: #b71c1c;
            }

            /* ── Feedback area ──────────────────────────────────────────────── */

            .q-feedback {
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 13.5px;
                line-height: 1.5;
                border-radius: 10px;
                min-height: 0;
                margin-bottom: 12px;
                transition: all 180ms ease;
            }
            .q-feedback:not(:empty) {
                padding: 10px 14px;
            }

            .q-feedback-correct {
                background: #e8f5e9;
                color: #1b5e20;
                font-weight: 700;
                font-size: 15px;
                text-align: center;
            }
            .q-feedback-error {
                background: #fdecea;
                color: #b71c1c;
            }
            .q-feedback-warning {
                background: #fff8e1;
                color: #e65100;
            }
            .q-feedback-hint {
                background: #fff8e1;
                color: #5d4037;
                display: flex;
                gap: 8px;
                align-items: flex-start;
            }
            .q-hint-icon { flex-shrink: 0; }
            .q-hint-body { line-height: 1.5; }

            /* Error badge ditumpuk di atas hint */
            .q-feedback-hint-with-error { padding-top: 8px; }
            .q-error-badge {
                background: #fdecea;
                color: #b71c1c;
                padding: 7px 12px;
                border-radius: 6px;
                margin-bottom: 8px;
                font-size: 13px;
            }

            /* ── Action row ─────────────────────────────────────────────────── */

            .q-actions {
                display: flex;
                gap: 10px;
            }

            .q-btn {
                flex: 1;
                padding: 13px 16px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 15px;
                font-weight: 700;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                transition:
                    background  120ms ease,
                    transform    80ms ease,
                    opacity     120ms ease;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
            }
            .q-btn:active:not(:disabled) { transform: scale(0.97); }
            .q-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                transform: none;
            }
            .q-btn:focus-visible {
                outline: 3px solid #2d7a3a;
                outline-offset: 3px;
            }

            /* Hint button — lebih kecil, di kiri */
            .q-btn-hint {
                flex: 0 0 auto;
                padding: 13px 14px;
                background: #fff8e1;
                color: #8d6e00;
                border: 2px solid #ffe082;
                font-size: 14px;
            }
            .q-btn-hint:hover:not(:disabled) { background: #fff3cd; }

            /* Submit button — primary, penuh lebar sisa */
            .q-btn-submit {
                background: #2d7a3a;
                color: #fff;
            }
            .q-btn-submit:hover:not(:disabled)  { background: #246630; }
            .q-btn-submit:active:not(:disabled) { background: #1d5429; }

            /* ── Stars layer ────────────────────────────────────────────────── */

            .q-stars-layer {
                position: absolute;
                inset: 0;
                pointer-events: none;
                overflow: hidden;
                border-radius: 20px;
            }

            @keyframes q-star-float {
                0%   {
                    opacity: 0;
                    transform: translateY(0) scale(0.4) rotate(-10deg);
                }
                18%  {
                    opacity: 1;
                    transform: translateY(-24px) scale(1.2) rotate(8deg);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-130px) scale(0.7) rotate(25deg);
                }
            }

            .q-star {
                position: absolute;
                bottom: 15%;
                line-height: 1;
                opacity: 0;
                animation: q-star-float linear forwards;
                /* font-size + animation-delay + animation-duration diset inline */
            }

            /* ── Responsive ─────────────────────────────────────────────────── */

            @media (max-width: 380px) {
                #question-panel  { padding: 18px 14px 22px; border-radius: 16px; }
                .q-soal-text     { font-size: 14px; }
                .q-polya-input   { font-size: 20px; }
                .q-btn           { font-size: 14px; padding: 12px 12px; }
            }
        `;

        document.head.appendChild(style);
    }
}