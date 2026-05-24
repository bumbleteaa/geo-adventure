// src/core/QuestionLogic.ts

import { GameState } from '../core/GameState';

// =============================================================================
// TYPES
// =============================================================================

export interface PolyaSubStep {
    prompt: string;
    input_type: 'number' | 'text' | 'choice' | 'none';
    choices?: string[];
    expected?: number | string;  // soft validation — salah max 2x lalu advance
    validates_answer?: boolean;  // hard validation — cocokkan ke question.jawaban
}

export interface PolyaStep {
    phase: 1 | 2 | 3 | 4;
    label: string;
    sub_steps: PolyaSubStep[];
}

export interface Question {
    id: string;
    trigger_id: string;
    order: number;
    topic: 'keliling' | 'luas';
    shape: 'persegi_panjang';
    teks_soal: string;
    jawaban: number;
    hint: string;
    guiding_questions: string[];
    polya_steps: PolyaStep[];
}

export interface ScoreResult {
    stars: 0 | 1 | 2 | 3;
    attempts: number;
    hintUsed: boolean;
    timeSeconds: number;
}

export interface SessionState {
    triggerId: string;
    questionId: string;
    currentStep: number;      // 0–3 (Polya phase)
    currentSubStep: number;   // index dalam sub_steps phase aktif
    softAttempts: number;     // percobaan untuk sub-step ber-expected
    attempts: number;         // percobaan untuk validates_answer
    hintUsed: boolean;
    startedAt: number;
    stepInputs: Record<string, string>;  // key: `${step}-${subStep}`
}

export type QuestionEvent =
    | { type: 'SESSION_STARTED'; question: Question; session: SessionState }
    | { type: 'SUBSTEP_ADVANCED'; newSubStep: number; session: SessionState }
    | { type: 'STEP_ADVANCED'; newStep: number; session: SessionState }
    | { type: 'SOFT_ERROR'; attempts: number }
    | { type: 'SOFT_REVEALED'; correct: number | string }
    | { type: 'INPUT_ERROR'; message: string }
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
    private static readonly MAX_SOFT_ATTEMPTS = 2;
    static readonly TOTAL_STEPS = 4;

    private _byTrigger: Map<string, Question[]> = new Map();
    private _session: SessionState | null = null;
    private _listeners: Set<EventListener> = new Set();

    // =========================================================================
    // PUBLIC API — Init
    // =========================================================================

    async init(worldKey: string, triggerIds: string[]): Promise<void> {
        const all = await this._loadQuestions();
        const questions = all.filter(q => triggerIds.includes(q.trigger_id));

        for (const q of questions) {
            const list = this._byTrigger.get(q.trigger_id) ?? [];
            list.push(q);
            this._byTrigger.set(q.trigger_id, list);
        }

        GameState.registerWorld(worldKey, questions.map(q => q.id));
    }

    // =========================================================================
    // PUBLIC API — Session
    // =========================================================================

    hasRemaining(triggerId: string): boolean {
        return this._pickNext(triggerId) !== null;
    }

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
            currentSubStep: 0,
            softAttempts: 0,
            attempts: 0,
            hintUsed: false,
            startedAt: Date.now(),
            stepInputs: {},
        };

        this._emit({ type: 'SESSION_STARTED', question: next, session: { ...this._session } });
        return 'started';
    }

    /**
     * Submit input untuk sub-step aktif.
     *
     * Tiga jalur:
     *   validates_answer — hard: cocokkan ke question.jawaban, MAX_ATTEMPTS, scoring
     *   expected         — soft: cocokkan ke nilai expected, maks 2 percobaan
     *   (lainnya)        — bebas: langsung advance tanpa validasi
     */
    submitStep(inputText: string): void {
        if (!this._session) return;

        const question = this._getActiveQuestion();
        if (!question) return;

        const subStep = this._getActiveSubStep(question);
        if (!subStep) return;

        const key = `${this._session.currentStep}-${this._session.currentSubStep}`;
        this._session.stepInputs[key] = inputText;

        if (subStep.validates_answer) {
            this._validateFinalAnswer(inputText);
            return;
        }

        if (subStep.expected !== undefined) {
            this._validateSoft(inputText, subStep.expected, question);
            return;
        }

        this._advanceSubStep(question);
    }

    /**
     * Dipanggil QuestionUI setelah SOFT_REVEALED tampil ke siswa.
     * Melanjutkan ke sub-step berikutnya tanpa input tambahan.
     */
    advanceSubStep(): void {
        if (!this._session) return;
        const question = this._getActiveQuestion();
        if (!question) return;
        this._session.softAttempts = 0;
        this._advanceSubStep(question);
    }

    getHint(): string {
        if (!this._session) return '';
        this._session.hintUsed = true;
        return this._getActiveQuestion()?.hint ?? '';
    }

    getTopicForTrigger(triggerId: string): 'keliling' | 'luas' | null {
        const questions = this._byTrigger.get(triggerId) ?? [];
        return questions[0]?.topic ?? null;
    }

    serializeSession(): SessionState | null {
        return this._session ? { ...this._session } : null;
    }

    restoreSession(saved: SessionState): void {
        this._session = { ...saved };
    }

    on(listener: EventListener): void { this._listeners.add(listener); }
    off(listener: EventListener): void { this._listeners.delete(listener); }

    // =========================================================================
    // PRIVATE — Advancement
    // =========================================================================

    private _advanceSubStep(question: Question): void {
        if (!this._session) return;

        const currentPhase = question.polya_steps[this._session.currentStep];
        const isLastSubStep = this._session.currentSubStep >= currentPhase.sub_steps.length - 1;
        const isLastPhase = this._session.currentStep >= QuestionLogic.TOTAL_STEPS - 1;

        if (!isLastSubStep) {
            this._session.currentSubStep += 1;
            this._emit({
                type: 'SUBSTEP_ADVANCED',
                newSubStep: this._session.currentSubStep,
                session: { ...this._session },
            });
        } else if (!isLastPhase) {
            this._session.currentStep += 1;
            this._session.currentSubStep = 0;
            this._session.softAttempts = 0;
            this._emit({
                type: 'STEP_ADVANCED',
                newStep: this._session.currentStep,
                session: { ...this._session },
            });
        }
        // last sub-step of last phase → selalu validates_answer, ditangani _validateFinalAnswer
    }

    // =========================================================================
    // PRIVATE — Validation
    // =========================================================================

    private _validateFinalAnswer(inputText: string): void {
        if (!this._session) return;

        const question = this._getActiveQuestion();
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

    private _validateSoft(inputText: string, expected: number | string, question: Question): void {
        if (!this._session) return;

        const isCorrect = this._checkExpected(inputText, expected);

        if (isCorrect) {
            this._session.softAttempts = 0;
            this._advanceSubStep(question);
        } else {
            this._session.softAttempts += 1;

            if (this._session.softAttempts >= QuestionLogic.MAX_SOFT_ATTEMPTS) {
                // UI akan tampilkan jawaban benar, lalu panggil advanceSubStep()
                this._emit({ type: 'SOFT_REVEALED', correct: expected });
            } else {
                this._emit({ type: 'SOFT_ERROR', attempts: this._session.softAttempts });
            }
        }
    }

    private _checkExpected(input: string, expected: number | string): boolean {
        if (typeof expected === 'number') {
            return parseInt(input.trim(), 10) === expected;
        }
        return input.trim().toLowerCase() === expected.toString().toLowerCase();
    }

    private _completeSession(answeredCorrectly: boolean): void {
        if (!this._session) return;

        const score = this._calculateScore(answeredCorrectly);
        const snapshot = { ...this._session };

        GameState.markComplete(this._session.questionId, score.stars, score.attempts);
        this._session = null;
        this._emit({ type: 'SESSION_COMPLETE', score, session: snapshot });
    }

    private _calculateScore(answeredCorrectly: boolean): ScoreResult {
        if (!this._session) return { stars: 0, attempts: 0, hintUsed: false, timeSeconds: 0 };
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

    // =========================================================================
    // PRIVATE — Helpers
    // =========================================================================

    private _pickNext(triggerId: string): Question | null {
        const questions = this._byTrigger.get(triggerId) ?? [];
        return questions.find(q => !GameState.isComplete(q.id)) ?? null;
    }

    private _getActiveQuestion(): Question | null {
        if (!this._session) return null;
        const questions = this._byTrigger.get(this._session.triggerId) ?? [];
        return questions.find(q => q.id === this._session!.questionId) ?? null;
    }

    private _getActiveSubStep(question: Question): PolyaSubStep | null {
        const phase = question.polya_steps[this._session?.currentStep ?? 0];
        return phase?.sub_steps[this._session?.currentSubStep ?? 0] ?? null;
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

    private _emit(event: QuestionEvent): void {
        for (const listener of [...this._listeners]) listener(event);
    }
}