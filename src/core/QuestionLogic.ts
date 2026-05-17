// src/logic/QuestionLogic.ts
//
// Pure state machine untuk seluruh logika soal:
//   - Fetch & indexing questions.json
//   - Session lifecycle per trigger (NPC atau tile)
//   - Polya 4-step engine (step 0-2: understanding, step 3: kalkulasi + validasi)
//   - Scoring & pemanggilan GameState.markComplete()
//   - Observer pattern sendiri (bukan EventBus Phaser) agar bisa di-test tanpa DOM
//
// CATATAN MIGRASI:
//   - Interface `Question` dipindah ke sini dari QuestionUI.ts.
//   - Auto-wire di bawah GameState.ts (EventBus.on QUESTION_ANSWERED → markComplete)
//     menjadi dead code. Aman dibiarkan karena markComplete() idempotent,
//     tapi sebaiknya dihapus saat cleanup.
//   - DialogManager: _byNpc, _loadQuestions(), _pickNext() dipindah ke sini.

import { GameState } from '../core/GameState';

// =============================================================================
// TYPES
// =============================================================================

export interface Question {
    id: string;
    trigger_id: string;    // generik: bisa NPC id atau tile trigger id
    teks_soal: string;
    jawaban: number;       // hanya divalidasi di step terakhir (index 3)
    hint: string;
    polya_steps: string[]; // 4 prompt teks, satu per Polya step
}

export interface ScoreResult {
    stars: 0 | 1 | 2 | 3;
    attempts: number;
    hintUsed: boolean;
    timeSeconds: number;
}

/**
 * State satu sesi yang sedang aktif — plain object agar bisa di-JSON.stringify()
 * langsung untuk session saving ke localStorage.
 */
export interface SessionState {
    triggerId: string;
    questionId: string;
    currentStep: number;  // 0–3
    attempts: number;     // hanya bertambah di step terakhir
    hintUsed: boolean;
    startedAt: number;    // Date.now()
    stepInputs: string[]; // input user per step — untuk debug & review
}

/**
 * Union type event — TypeScript bisa narrow per branch sehingga caller
 * selalu tahu field apa yang tersedia di setiap event type.
 */
export type QuestionEvent =
    | { type: 'SESSION_STARTED'; question: Question; session: SessionState }
    | { type: 'STEP_ADVANCED'; newStep: number; session: SessionState }
    | { type: 'ANSWER_WRONG'; attempts: number; maxAttempts: number }
    | { type: 'ANSWER_REVEALED' }
    | { type: 'SESSION_COMPLETE'; score: ScoreResult; session: SessionState }
    | { type: 'ALL_DONE'; triggerId: string };

type EventListener = (event: QuestionEvent) => void;

// =============================================================================
// CLASS
// =============================================================================

export class QuestionLogic {

    private static readonly MAX_ATTEMPTS = 3;
    private static readonly TOTAL_STEPS = 4;

    private _byTrigger: Map<string, Question[]> = new Map();
    private _session: SessionState | null = null;
    private _listeners: Set<EventListener> = new Set();

    // =========================================================================
    // PUBLIC API — Inisialisasi
    // =========================================================================

    async init(worldKey: string): Promise<void> {
        const questions = await this._loadQuestions();

        for (const q of questions) {
            const list = this._byTrigger.get(q.trigger_id) ?? [];
            list.push(q);
            this._byTrigger.set(q.trigger_id, list);
        }

        GameState.registerWorld(worldKey, questions.map(q => q.id));
    }

    // =========================================================================
    // PUBLIC API — Session lifecycle
    // =========================================================================

    /**
     * Cek apakah masih ada soal yang belum selesai untuk triggerId ini,
     * tanpa memulai sesi. Dipakai DialogManager untuk routing awal.
     */
    hasRemaining(triggerId: string): boolean {
        return this._pickNext(triggerId) !== null;
    }

    /**
     * Mulai sesi soal baru.
     * Return 'started' jika ada soal; 'all_done' jika semua sudah selesai.
     * Dipanggil DialogManager setelah greeting selesai ditampilkan.
     */
    startSession(triggerId: string): 'started' | 'all_done' {
        const next = this._pickNext(triggerId);

        if (!next) {
            this._emit({ type: 'ALL_DONE', triggerId });
            return 'all_done';
        }

        this._session = {
            triggerId,
            questionId: next.id,
            currentStep: 0,
            attempts: 0,
            hintUsed: false,
            startedAt: Date.now(),
            stepInputs: [],
        };

        // Spread untuk immutability — listener tidak bisa mutasi state internal.
        this._emit({ type: 'SESSION_STARTED', question: next, session: { ...this._session } });
        return 'started';
    }

    /**
     * Dipanggil QuestionUI setiap user submit input.
     *
     * Step 0-2: input apapun diterima, langsung advance ke step berikutnya.
     * Step 3:   validasi numerik terhadap question.jawaban.
     *
     * Kenapa QuestionUI tidak boleh validasi sendiri?
     * Karena "input harus angka dan cocok dengan jawaban" adalah domain logic,
     * bukan domain presentasi.
     */
    submitStep(inputText: string): void {
        if (!this._session) return;

        this._session.stepInputs[this._session.currentStep] = inputText;

        const isLastStep = this._session.currentStep === QuestionLogic.TOTAL_STEPS - 1;

        if (!isLastStep) {
            this._session.currentStep += 1;
            this._emit({
                type: 'STEP_ADVANCED',
                newStep: this._session.currentStep,
                session: { ...this._session },
            });
        } else {
            this._validateFinalAnswer(inputText);
        }
    }

    /**
     * Dipanggil QuestionUI saat user klik Hint.
     * QuestionLogic yang mencatat hintUsed (bukan QuestionUI) karena
     * ini data scoring — bukan urusan presentasi.
     */
    getHint(): string {
        if (!this._session) return '';
        this._session.hintUsed = true;
        return this._getActiveQuestion()?.hint ?? '';
    }

    // =========================================================================
    // PUBLIC API — Session persistence
    // =========================================================================

    serializeSession(): SessionState | null {
        return this._session ? { ...this._session } : null;
    }

    restoreSession(saved: SessionState): void {
        this._session = { ...saved };
    }

    // =========================================================================
    // PUBLIC API — Observer
    // =========================================================================

    on(listener: EventListener): void { this._listeners.add(listener); }
    off(listener: EventListener): void { this._listeners.delete(listener); }

    // =========================================================================
    // PRIVATE — Polya validation engine
    // =========================================================================

    private _validateFinalAnswer(inputText: string): void {
        if (!this._session) return;

        const question = this._getActiveQuestion();

        console.log('[QLogic] validateFinalAnswer | session:', this._session?.questionId, '| question found:', !!question);
        if (!question) return;

        const parsed = parseInt(inputText.trim(), 10);
        const isCorrect = !isNaN(parsed) && parsed === question.jawaban;

        if (isCorrect) {
            this._completeSession(true);
        } else {
            this._session.attempts += 1;

            if (this._session.attempts >= QuestionLogic.MAX_ATTEMPTS) {
                this._emit({ type: 'ANSWER_REVEALED' });
                this._completeSession(false);
            } else {
                this._emit({
                    type: 'ANSWER_WRONG',
                    attempts: this._session.attempts,
                    maxAttempts: QuestionLogic.MAX_ATTEMPTS,
                });
            }
        }
    }

    /**
     * Tutup sesi dan catat ke GameState.
     * _session di-null SEBELUM emit — agar listener yang langsung memanggil
     * startSession() di dalam callback tidak menyebabkan konflik state.
     */
    private _completeSession(answeredCorrectly: boolean): void {
        if (!this._session) return;

        const score = this._calculateScore(answeredCorrectly);
        const sessionSnapshot = { ...this._session };

        GameState.markComplete(this._session.questionId, score.stars, score.attempts);

        this._session = null;
        this._emit({ type: 'SESSION_COMPLETE', score, session: sessionSnapshot });
    }

    /**
     * Benar attempt ke-1 → 3 bintang
     * Benar attempt ke-2 → 2 bintang
     * Benar attempt ke-3 → 1 bintang
     * Attempts habis     → 0 bintang
     * Hint tidak mengurangi bintang — tercatat untuk statistik saja.
     */
    private _calculateScore(answeredCorrectly: boolean): ScoreResult {
        if (!this._session) {
            return { stars: 0, attempts: 0, hintUsed: false, timeSeconds: 0 };
        }

        const stars = answeredCorrectly
            ? (Math.max(1, 3 - this._session.attempts) as 1 | 2 | 3)
            : 0;

        return {
            stars,
            attempts: this._session.attempts,
            hintUsed: this._session.hintUsed,
            timeSeconds: (Date.now() - this._session.startedAt) / 1000,
        };
    }

    private _pickNext(triggerId: string): Question | null {
        const questions = this._byTrigger.get(triggerId) ?? [];
        return questions.find(q => !GameState.isComplete(q.id)) ?? null;
    }

    private _getActiveQuestion(): Question | null {
        if (!this._session) return null;
        const questions = this._byTrigger.get(this._session.triggerId) ?? [];
        return questions.find(q => q.id === this._session!.questionId) ?? null;
    }

    private async _loadQuestions(): Promise<Question[]> {
        try {
            const res = await fetch('/data/questions.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json() as Question[];
        } catch (err) {
            console.error('[QuestionLogic] Gagal load questions.json:', err);
            return [];
        }
    }

    // Copy Set sebelum iterasi — aman jika listener memanggil off() di dalam callback.
    private _emit(event: QuestionEvent): void {
        for (const listener of [...this._listeners]) {
            listener(event);
        }
    }
}