// src/ui/QuestionUI.ts

import { QuestionLogic, type QuestionEvent, type Question, type PolyaSubStep } from '../core/QuestionLogic';

const ANIM_DURATION_MS = 200;
const POST_CORRECT_DELAY_MS = 1800;
const SOFT_REVEAL_ADVANCE_MS = 2000;
const STAR_CHARS = ['⭐', '✨', '🌟', '💫'];

export class QuestionUI {

    // DOM — structural
    private readonly backdrop: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly guidingView: HTMLDivElement;
    private readonly questionView: HTMLDivElement;
    private readonly starsLayer: HTMLDivElement;

    // DOM — question view internals
    private readonly stepDotsRow: HTMLDivElement;
    private readonly stepLabel: HTMLSpanElement;
    private readonly subStepCounter: HTMLSpanElement;
    private readonly soalText: HTMLParagraphElement;
    private readonly polyaCard: HTMLDivElement;
    private readonly polyaPrompt: HTMLParagraphElement;
    readonly polyaInput: HTMLInputElement;
    private readonly choicesContainer: HTMLDivElement;
    private readonly feedbackArea: HTMLDivElement;
    readonly btnHint: HTMLButtonElement;
    readonly btnSubmit: HTMLButtonElement;

    // State
    private _question: Question | null = null;
    private _hintVisible = false;
    private _currentStep = 0;
    private _currentSubStep = 0;
    private _onHidden: (() => void) | null = null;
    private _softRevealTimer: ReturnType<typeof setTimeout> | null = null;

    // Logic wiring
    private _logic: QuestionLogic | null = null;
    private _onQuestionEvent: ((e: QuestionEvent) => void) | null = null;

    // Bound handlers
    private readonly _handleHint: () => void;
    private readonly _handleSubmit: () => void;
    private readonly _handleKeyDown: (e: KeyboardEvent) => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        const style = document.createElement('style');
        style.textContent = /* css */`
            #question-backdrop {
                display: none;
                position: fixed; inset: 0; z-index: 1010;
                align-items: center; justify-content: center;
                padding: 16px; box-sizing: border-box;
                background: rgba(0,0,0,0.6);
                opacity: 0;
                transition: opacity ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible { display: flex; opacity: 1; }

            #question-panel {
                position: relative;
                width: 100%; max-width: 460px; max-height: 92vh;
                overflow-y: auto;
                background: #fffdf5;
                border-radius: 20px;
                box-shadow: 0 10px 48px rgba(0,0,0,0.28);
                padding: 22px 22px 26px; box-sizing: border-box;
                transform: scale(0.9) translateY(24px);
                transition: transform ${ANIM_DURATION_MS}ms cubic-bezier(0.34,1.56,0.64,1),
                            opacity   ${ANIM_DURATION_MS}ms ease;
            }
            #question-backdrop.question-visible #question-panel {
                transform: scale(1) translateY(0);
            }

            @keyframes q-shake {
                0%,100%{ transform:translateX(0) scale(1); }
                15%    { transform:translateX(-9px) scale(1.01); }
                30%    { transform:translateX(9px) scale(1.01); }
                45%    { transform:translateX(-6px); }
                60%    { transform:translateX(6px); }
                75%    { transform:translateX(-3px); }
                90%    { transform:translateX(3px); }
            }
            #question-panel.q-shake { animation: q-shake 0.46s cubic-bezier(0.36,0.07,0.19,0.97) both; }

            @keyframes q-card-enter {
                from { opacity:0.4; transform:translateX(18px); }
                to   { opacity:1;   transform:translateX(0); }
            }
            .q-polya-card.q-card-enter { animation: q-card-enter 0.22s ease-out both; }

            /* Guiding view */
            .q-guiding-view { display:none; }
            .q-guiding-view.active { display:block; }
            .q-guiding-title { font-size:14px; font-weight:700; color:#2d4a31; margin:0 0 12px; }
            .q-guiding-list { list-style:none; padding:0; margin:0 0 18px; }
            .q-guiding-list li {
                font-size:14px; color:#333;
                padding:7px 10px; margin-bottom:6px;
                background:#f0f7f1; border-left:3px solid #2d7a3a;
                border-radius:6px; line-height:1.4;
            }
            .q-guiding-list li::before { content:'🤔  '; }
            .q-btn-ready {
                width:100%; padding:11px;
                background:#2d7a3a; color:#fff;
                border:none; border-radius:10px;
                font-size:15px; font-weight:700;
                cursor:pointer; transition:opacity 150ms ease;
            }
            .q-btn-ready:active { opacity:0.85; }

            /* Question view */
            .q-question-view { display:none; }
            .q-question-view.active { display:block; }

            /* Step dots — 4 phase indicators */
            .q-header { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
            .q-step-dots { display:flex; gap:6px; }
            .q-dot {
                width:10px; height:10px; border-radius:50%; background:#ddd;
                transition: background 200ms ease, transform 200ms ease;
            }
            .q-dot.done   { background:#2d7a3a; }
            .q-dot.active {
                background:#2d7a3a; transform:scale(1.35);
                box-shadow:0 0 0 3px rgba(45,122,58,0.2);
            }
            .q-step-label { font-size:12px; color:#888; margin-left:auto; }

            /* Sub-step counter — smaller, below header */
            .q-substep-counter {
                font-size:11px; color:#aaa;
                margin-bottom:12px; display:block;
            }

            .q-soal-text {
                font-size:15px; line-height:1.55; color:#222; margin:0 0 14px;
            }

            .q-polya-card {
                background:#f0f7f1; border-left:4px solid #2d7a3a;
                border-radius:10px; padding:12px 14px; margin-bottom:12px;
            }
            .q-polya-card.soft-error { border-left-color:#e67e22; background:#fff8f0; }
            .q-polya-card.soft-revealed { border-left-color:#e74c3c; background:#fff0ef; }

            .q-polya-prompt { font-size:14px; color:#2d4a31; margin:0 0 10px; font-style:italic; }

            .q-polya-input {
                width:100%; padding:9px 12px; font-size:15px;
                border:2px solid #b5d4b9; border-radius:8px;
                box-sizing:border-box; outline:none;
                transition:border-color 150ms ease;
            }
            .q-polya-input:focus         { border-color:#2d7a3a; }
            .q-polya-input.correct        { border-color:#2d7a3a; background:#e8f5ea; }
            .q-polya-input.error          { border-color:#c0392b; background:#fdf0ef; }
            .q-polya-input.soft-error     { border-color:#e67e22; background:#fff8f0; }

            @keyframes q-wiggle {
                0%,100%{ transform:translateX(0); }
                25%    { transform:translateX(-5px); }
                75%    { transform:translateX(5px); }
            }
            .q-polya-input.wiggle { animation: q-wiggle 0.28s ease both; }

            /* Choice buttons */
            .q-choices { display:flex; flex-direction:column; gap:8px; }
            .q-choice-btn {
                padding:9px 14px; background:#fff;
                border:2px solid #b5d4b9; border-radius:8px;
                font-size:14px; color:#2d4a31;
                cursor:pointer; text-align:left;
                transition: border-color 150ms ease, background 150ms ease;
            }
            .q-choice-btn:hover   { border-color:#2d7a3a; background:#f0f7f1; }
            .q-choice-btn.selected { border-color:#2d7a3a; background:#e8f5ea; font-weight:600; }
            .q-choice-btn:disabled { opacity:0.5; cursor:not-allowed; }

            /* Soft-reveal answer badge */
            .q-soft-reveal-badge {
                display:inline-block; margin-top:8px;
                background:#fdf3e3; color:#c0392b;
                border:1px solid #f5c6a0; border-radius:6px;
                padding:4px 10px; font-size:13px; font-weight:600;
            }

            .q-feedback { font-size:13px; min-height:20px; margin-bottom:10px; color:#555; }
            .q-feedback.correct { color:#2d7a3a; font-weight:600; }
            .q-feedback.error   { color:#c0392b; }
            .q-feedback.hint    { color:#555; }
            .q-error-badge {
                display:inline-block; background:#fdf0ef; color:#c0392b;
                border:1px solid #f5c6c2; border-radius:6px;
                padding:2px 8px; font-size:12px; margin-bottom:6px;
            }
            .q-feedback.hint-with-error { display:flex; flex-direction:column; gap:4px; }

            .q-actions { display:flex; gap:10px; justify-content:flex-end; }
            .q-btn {
                padding:9px 20px; border-radius:10px; border:none;
                cursor:pointer; font-size:14px; font-weight:600;
                transition: opacity 150ms ease, transform 100ms ease;
            }
            .q-btn:active   { transform:scale(0.96); }
            .q-btn:disabled { opacity:0.45; cursor:not-allowed; }
            .q-btn-hint   { background:#f0f0f0; color:#555; }
            .q-btn-submit { background:#2d7a3a; color:#fff; }

            .q-stars-layer {
                position:absolute; inset:0;
                pointer-events:none; overflow:hidden; border-radius:20px;
            }
            @keyframes q-star-fly {
                0%   { transform:translateY(0) scale(0.5); opacity:1; }
                100% { transform:translateY(-90px) scale(1.2); opacity:0; }
            }
            .q-star {
                position:absolute; bottom:30%; font-size:24px;
                animation: q-star-fly var(--dur) var(--delay) ease-out both;
            }
        `;
        document.head.appendChild(style);

        // ── DOM construction ──────────────────────────────────────────────────

        this.backdrop = document.createElement('div');
        this.backdrop.id = 'question-backdrop';

        this.panel = document.createElement('div');
        this.panel.id = 'question-panel';

        // Guiding view
        this.guidingView = document.createElement('div');
        this.guidingView.className = 'q-guiding-view';

        // Question view
        this.questionView = document.createElement('div');
        this.questionView.className = 'q-question-view';

        // Header: 4 phase dots + phase label
        const header = document.createElement('div');
        header.className = 'q-header';

        this.stepDotsRow = document.createElement('div');
        this.stepDotsRow.className = 'q-step-dots';

        this.stepLabel = document.createElement('span');
        this.stepLabel.className = 'q-step-label';

        header.appendChild(this.stepDotsRow);
        header.appendChild(this.stepLabel);

        // Sub-step counter (smaller, below header)
        this.subStepCounter = document.createElement('span');
        this.subStepCounter.className = 'q-substep-counter';

        // Soal text
        this.soalText = document.createElement('p');
        this.soalText.className = 'q-soal-text';

        // Polya card
        this.polyaCard = document.createElement('div');
        this.polyaCard.className = 'q-polya-card';

        this.polyaPrompt = document.createElement('p');
        this.polyaPrompt.className = 'q-polya-prompt';

        this.polyaInput = document.createElement('input');
        this.polyaInput.className = 'q-polya-input';
        this.polyaInput.type = 'text';

        this.choicesContainer = document.createElement('div');
        this.choicesContainer.className = 'q-choices';

        this.polyaCard.appendChild(this.polyaPrompt);
        this.polyaCard.appendChild(this.polyaInput);
        this.polyaCard.appendChild(this.choicesContainer);

        this.feedbackArea = document.createElement('div');
        this.feedbackArea.className = 'q-feedback';

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

        this.questionView.appendChild(header);
        this.questionView.appendChild(this.subStepCounter);
        this.questionView.appendChild(this.soalText);
        this.questionView.appendChild(this.polyaCard);
        this.questionView.appendChild(this.feedbackArea);
        this.questionView.appendChild(actions);

        this.starsLayer = document.createElement('div');
        this.starsLayer.className = 'q-stars-layer';
        this.starsLayer.setAttribute('aria-hidden', 'true');

        this.panel.appendChild(this.guidingView);
        this.panel.appendChild(this.questionView);
        this.panel.appendChild(this.starsLayer);
        this.backdrop.appendChild(this.panel);
        document.body.appendChild(this.backdrop);

        // 4 phase dots (static — selalu 4)
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('span');
            dot.className = 'q-dot';
            dot.dataset.index = String(i);
            this.stepDotsRow.appendChild(dot);
        }

        // Bound handlers
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

    public show(question: Question, logic: QuestionLogic, onHidden?: () => void): void {
        if (this._isVisible()) this._clearState();

        this._question = question;
        this._logic = logic;
        this._hintVisible = false;
        this._currentStep = 0;
        this._currentSubStep = 0;
        this._onHidden = onHidden ?? null;

        this._onQuestionEvent = (e) => this._handleQuestionEvent(e);
        this._logic.on(this._onQuestionEvent);

        this._resetDom();
        this._setVisible(true);

        if (question.guiding_questions?.length) {
            this._renderGuidingScreen(question.guiding_questions, () => this._renderQuestionScreen());
        } else {
            this._renderQuestionScreen();
        }
    }

    public hide(): void {
        if (this._softRevealTimer) {
            clearTimeout(this._softRevealTimer);
            this._softRevealTimer = null;
        }
        this._setVisible(false);
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
    // PRIVATE — Guiding screen
    // =========================================================================

    private _renderGuidingScreen(questions: string[], onReady: () => void): void {
        this.guidingView.innerHTML = '';
        this.guidingView.classList.add('active');
        this.questionView.classList.remove('active');

        const title = document.createElement('p');
        title.className = 'q-guiding-title';
        title.textContent = '🧠 Sebelum menjawab, pikirkan dulu...';

        const list = document.createElement('ul');
        list.className = 'q-guiding-list';
        for (const q of questions) {
            const li = document.createElement('li');
            li.textContent = q;
            list.appendChild(li);
        }

        const btnReady = document.createElement('button');
        btnReady.className = 'q-btn-ready';
        btnReady.textContent = 'Siap Menjawab →';
        btnReady.addEventListener('click', () => {
            this.guidingView.classList.remove('active');
            onReady();
        }, { once: true });

        this.guidingView.appendChild(title);
        this.guidingView.appendChild(list);
        this.guidingView.appendChild(btnReady);
    }

    // =========================================================================
    // PRIVATE — Question screen
    // =========================================================================

    private _renderQuestionScreen(): void {
        this.guidingView.classList.remove('active');
        this.questionView.classList.add('active');
        this.soalText.textContent = this._question!.teks_soal;
        this._renderSubStep(0, 0);
        requestAnimationFrame(() => this.polyaInput.focus());
    }

    /**
     * Render satu sub-step.
     * step     = Polya phase (0–3)
     * subStep  = index dalam sub_steps phase itu
     */
    private _renderSubStep(step: number, subStep: number): void {
        const q = this._question!;
        const phase = q.polya_steps[step];
        const sub = phase.sub_steps[subStep];
        const totalSubSteps = phase.sub_steps.length;
        const isLastPhase = step === 3;
        const isLastSubStep = subStep === totalSubSteps - 1;

        this._currentStep = step;
        this._currentSubStep = subStep;

        // Reset input state
        this.polyaInput.value = '';
        this.polyaInput.classList.remove('error', 'soft-error', 'correct');
        this.polyaCard.classList.remove('soft-error', 'soft-revealed');
        this.feedbackArea.textContent = '';
        this.feedbackArea.className = 'q-feedback';
        this.btnSubmit.disabled = false;

        // Phase dots — 4 dots, active = current step
        this.stepDotsRow.querySelectorAll<HTMLSpanElement>('.q-dot').forEach((dot, i) => {
            dot.classList.toggle('done', i < step);
            dot.classList.toggle('active', i === step);
        });

        // Labels
        this.stepLabel.textContent = phase.label;

        // Sub-step counter — tampilkan hanya jika ada lebih dari 1 sub-step
        if (totalSubSteps > 1) {
            this.subStepCounter.textContent = `Pertanyaan ${subStep + 1} dari ${totalSubSteps}`;
        } else {
            this.subStepCounter.textContent = '';
        }

        // Prompt
        this.polyaPrompt.textContent = sub.prompt;

        // Submit button text
        const isVeryLast = isLastPhase && isLastSubStep;
        this.btnSubmit.textContent = isVeryLast ? 'Jawab ✓' : 'Lanjut ›';

        // Hint — hanya tampilkan di phase terakhir (jawaban sesungguhnya)
        this.btnHint.style.display = isLastPhase ? '' : 'none';

        // Render input type
        if (sub.input_type === 'choice') {
            this._renderChoices(sub.choices ?? [], sub);
        } else if (sub.input_type === 'none') {
            this.polyaInput.style.display = 'none';
            this.choicesContainer.style.display = 'none';
        } else {
            this.polyaInput.style.display = '';
            this.polyaInput.inputMode = sub.input_type === 'number' ? 'numeric' : 'text';
            this.polyaInput.placeholder = sub.input_type === 'number'
                ? 'Tulis angka...'
                : 'Tulis jawabanmu...';
            this.choicesContainer.innerHTML = '';
            this.choicesContainer.style.display = 'none';
        }

        // Slide-in animation
        this.polyaCard.classList.remove('q-card-enter');
        void this.polyaCard.offsetWidth;
        this.polyaCard.classList.add('q-card-enter');
    }

    private _renderChoices(choices: string[], sub: PolyaSubStep): void {
        this.polyaInput.style.display = 'none';
        this.choicesContainer.innerHTML = '';
        this.choicesContainer.style.display = 'flex';

        for (const choice of choices) {
            const btn = document.createElement('button');
            btn.className = 'q-choice-btn';
            btn.textContent = choice;
            btn.type = 'button';
            btn.addEventListener('click', () => {
                // highlight
                this.choicesContainer.querySelectorAll('.q-choice-btn').forEach(b =>
                    b.classList.remove('selected')
                );
                btn.classList.add('selected');
                this._logic?.submitStep(choice);
            });
            this.choicesContainer.appendChild(btn);
        }
    }

    // =========================================================================
    // PRIVATE — QuestionLogic event handler
    // =========================================================================

    private _handleQuestionEvent(event: QuestionEvent): void {
        switch (event.type) {

            case 'SUBSTEP_ADVANCED':
                this._renderSubStep(event.session.currentStep, event.newSubStep);
                break;

            case 'STEP_ADVANCED':
                this._hintVisible = false;
                this._renderSubStep(event.newStep, 0);
                break;

            case 'SOFT_ERROR':
                // Jawaban salah tapi masih ada kesempatan — highlight ringan
                this.polyaInput.classList.add('soft-error');
                this.polyaCard.classList.add('soft-error');
                this._wiggleInput();
                this._showFeedback('error', '🔍 Perhatikan soalnya lagi, coba sekali lagi!');
                break;

            case 'SOFT_REVEALED': {
                // Kesempatan habis — tampilkan jawaban benar, lalu auto-advance
                this.polyaCard.classList.add('soft-revealed');
                this._disableAllInputs();

                const badge = document.createElement('span');
                badge.className = 'q-soft-reveal-badge';
                badge.textContent = `Jawaban yang benar: ${event.correct}`;
                this.feedbackArea.innerHTML = '';
                this.feedbackArea.appendChild(badge);

                this._softRevealTimer = setTimeout(() => {
                    this._softRevealTimer = null;
                    this._logic?.advanceSubStep();
                }, SOFT_REVEAL_ADVANCE_MS);
                break;
            }

            case 'INPUT_ERROR':
                this._wiggleInput();
                break;

            case 'ANSWER_WRONG':
                this.polyaInput.classList.add('error');
                this._triggerShake();
                if (!this._hintVisible) {
                    this._hintVisible = true;
                    this._showHint(this._question?.hint ?? '');
                }
                this._showFeedback('error', `Coba lagi! Sisa ${event.maxAttempts - event.attempts} kesempatan.`);
                break;

            case 'ANSWER_REVEALED':
                this._disableAllInputs();
                this._showFeedback('error', `❌ Jawaban yang benar adalah ${this._question!.jawaban}.`);
                break;

            case 'SESSION_COMPLETE':
                if (event.score.stars > 0) {
                    this._disableAllInputs();
                    this.polyaInput.classList.add('correct');
                    this._showFeedback('correct', '🎉 Benar! Kamu hebat!');
                    this._triggerStarAnimation(event.score.stars);
                }
                setTimeout(() => this.hide(), POST_CORRECT_DELAY_MS);
                break;
        }
    }

    // =========================================================================
    // PRIVATE — DOM handlers
    // =========================================================================

    private _onSubmitClick(): void {
        const q = this._question;
        if (!q) return;

        const phase = q.polya_steps[this._currentStep];
        const sub: PolyaSubStep | undefined = phase?.sub_steps[this._currentSubStep];

        if (sub?.input_type === 'none') {
            this._logic?.submitStep('');
            return;
        }

        if (sub?.input_type === 'choice') {
            // choice diklik via _renderChoices — Submit tidak aktif di sini
            return;
        }

        const raw = this.polyaInput.value.trim();
        if (!raw) { this._wiggleInput(); return; }
        this._logic?.submitStep(raw);
    }

    private _onHintClick(): void {
        if (!this._logic || this._hintVisible) return;
        const hintText = this._logic.getHint();
        this._hintVisible = true;
        this._showHint(hintText);
    }

    // =========================================================================
    // PRIVATE — Feedback helpers
    // =========================================================================

    private _showHint(hintText: string): void {
        this.feedbackArea.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'q-feedback hint';
        el.textContent = `💡 ${hintText}`;
        this.feedbackArea.appendChild(el);
        this.feedbackArea.className = 'q-feedback';
    }

    private _showFeedback(type: 'correct' | 'error', text: string): void {
        if (type === 'error' && this._hintVisible) {
            const badge = document.createElement('span');
            badge.className = 'q-error-badge';
            badge.textContent = text;
            this.feedbackArea.querySelector('.q-error-badge')?.remove();
            this.feedbackArea.prepend(badge);
            this.feedbackArea.classList.add('hint-with-error');
        } else {
            this.feedbackArea.textContent = text;
            this.feedbackArea.className = `q-feedback ${type}`;
        }
    }

    private _disableAllInputs(): void {
        this.polyaInput.disabled = true;
        this.btnSubmit.disabled = true;
        this.btnHint.disabled = true;
        this.choicesContainer.querySelectorAll<HTMLButtonElement>('.q-choice-btn').forEach(b => {
            b.disabled = true;
        });
    }

    // =========================================================================
    // PRIVATE — State management
    // =========================================================================

    private _clearState(): void {
        if (this._softRevealTimer) {
            clearTimeout(this._softRevealTimer);
            this._softRevealTimer = null;
        }
        if (this._logic && this._onQuestionEvent) {
            this._logic.off(this._onQuestionEvent);
        }
        this._logic = null;
        this._onQuestionEvent = null;
        this._question = null;
        this._hintVisible = false;
        this._currentStep = 0;
        this._currentSubStep = 0;
        this._resetDom();

        const cb = this._onHidden;
        this._onHidden = null;
        cb?.();
    }

    private _resetDom(): void {
        this.polyaInput.value = '';
        this.polyaInput.disabled = false;
        this.polyaInput.classList.remove('correct', 'error', 'soft-error', 'wiggle');
        this.polyaInput.style.display = '';
        this.choicesContainer.innerHTML = '';
        this.choicesContainer.style.display = 'none';
        this.btnSubmit.disabled = false;
        this.btnHint.disabled = false;
        this.btnHint.style.display = '';
        this.btnSubmit.textContent = 'Lanjut ›';
        this.feedbackArea.textContent = '';
        this.feedbackArea.className = 'q-feedback';
        this.polyaCard.classList.remove('soft-error', 'soft-revealed', 'q-card-enter');
        this.panel.classList.remove('q-shake');
        this.starsLayer.innerHTML = '';
        this.guidingView.classList.remove('active');
        this.questionView.classList.remove('active');
    }

    // =========================================================================
    // PRIVATE — Animations
    // =========================================================================

    private _triggerShake(): void {
        this.panel.classList.remove('q-shake');
        void this.panel.offsetWidth;
        this.panel.classList.add('q-shake');
    }

    private _wiggleInput(): void {
        this.polyaInput.classList.remove('wiggle');
        void this.polyaInput.offsetWidth;
        this.polyaInput.classList.add('wiggle');
    }

    private _triggerStarAnimation(starCount: number): void {
        this.starsLayer.innerHTML = '';
        const count = starCount * 5;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('span');
            el.className = 'q-star';
            el.textContent = STAR_CHARS[i % STAR_CHARS.length];
            const left = 5 + Math.random() * 90;
            const delay = Math.random() * 0.5;
            const dur = 0.8 + Math.random() * 0.7;
            el.style.cssText = `left:${left}%;--delay:${delay}s;--dur:${dur}s;font-size:${22 + Math.random() * 16}px;`;
            this.starsLayer.appendChild(el);
        }
    }

    // =========================================================================
    // PRIVATE — Visibility
    // =========================================================================

    private _setVisible(visible: boolean): void {
        if (visible) {
            this.backdrop.style.display = 'flex';
            requestAnimationFrame(() => this.backdrop.classList.add('question-visible'));
        } else {
            this.backdrop.classList.remove('question-visible');
            setTimeout(() => { this.backdrop.style.display = 'none'; }, ANIM_DURATION_MS);
        }
    }

    private _isVisible(): boolean {
        return this.backdrop.classList.contains('question-visible');
    }
}