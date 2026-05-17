// src/core/GameState.ts
import { EventBus, GameEvent } from './EventBus';

interface QuestionRecord {
    stars: number;
    attempts: number;
    completedAt: number;
}

interface _InternalState {
    completedQuestions: Map<string, QuestionRecord>;
    totalStars: number;
    completedWorlds: Set<string>;
    worldRegistry: Map<string, Set<string>>;
}

function _freshState(): _InternalState {
    return {
        completedQuestions: new Map(),
        totalStars: 0,
        completedWorlds: new Set(),
        worldRegistry: new Map(),
    };
}

let _state: _InternalState = _freshState();

export const GameState = {

    // Call this in SchoolWorld.create() before any NPC interaction.
    registerWorld(worldKey: string, questionIds: string[]): void {
        if (_state.worldRegistry.has(worldKey)) {
            console.warn(`[GameState] registerWorld: '${worldKey}' already registered. Overwriting.`);
        }
        _state.worldRegistry.set(worldKey, new Set(questionIds));
    },

    // Idempotent — safe to call twice for the same questionId.
    markComplete(questionId: string, stars: number = 1, attempts: number = 1): void {
        if (_state.completedQuestions.has(questionId)) return;

        const clampedStars = Math.max(0, Math.min(3, stars));

        _state.completedQuestions.set(questionId, {
            stars: clampedStars,
            attempts,
            completedAt: Date.now(),
        });
        _state.totalStars += clampedStars;

        EventBus.emit(GameEvent.QUESTION_ANSWERED, {
            questionId,
            correct: true,
            attempts,
            stars: clampedStars,
        });

        // Check if any world just became complete.
        _state.worldRegistry.forEach((questionSet, worldKey) => {
            if (_state.completedWorlds.has(worldKey)) return;
            const allDone = [...questionSet].every(qid => _state.completedQuestions.has(qid));
            if (allDone) {
                _state.completedWorlds.add(worldKey);
                EventBus.emit(GameEvent.WORLD_COMPLETE, { worldKey });
            }
        });
    },

    isComplete(questionId: string): boolean {
        return _state.completedQuestions.has(questionId);
    },

    getStars(): number {
        return _state.totalStars;
    },

    isWorldComplete(worldKey: string): boolean {
        return _state.completedWorlds.has(worldKey);
    },

    // Returns { done, total } — useful for HUD progress bar.
    getWorldProgress(worldKey: string): { done: number; total: number } {
        const registered = _state.worldRegistry.get(worldKey);
        if (!registered) return { done: 0, total: 0 };
        const done = [...registered].filter(qid => _state.completedQuestions.has(qid)).length;
        return { done, total: registered.size };
    },

    getRecord(questionId: string): QuestionRecord | null {
        return _state.completedQuestions.get(questionId) ?? null;
    },

    serialise(): object {
        return {
            completedQuestions: [..._state.completedQuestions.entries()].map(([id, rec]) => ({ id, ...rec })),
            totalStars: _state.totalStars,
            completedWorlds: [..._state.completedWorlds],
        };
    },

    hydrate(snapshot: {
        completedQuestions: Array<{ id: string; stars: number; attempts: number; completedAt: number }>;
        totalStars: number;
        completedWorlds: string[];
    }): void {
        _state.completedQuestions = new Map(
            snapshot.completedQuestions.map(({ id, stars, attempts, completedAt }) => [id, { stars, attempts, completedAt }])
        );
        _state.totalStars = snapshot.totalStars;
        _state.completedWorlds = new Set(snapshot.completedWorlds);
    },

    // Clears progress but keeps worldRegistry (scenes re-register on create).
    reset(): void {
        const registry = _state.worldRegistry;
        _state = _freshState();
        _state.worldRegistry = registry;
    },

    hardReset(): void {
        _state = _freshState();
    },

    debug(): {
        totalStars: number;
        completedCount: number;
        totalQuestions: number;
        maxStars: number;
    } {
        const totalQuestions = Array.from(_state.worldRegistry.values())
            .reduce((sum, ids) => sum + ids.size, 0);
        return {
            totalStars: _state.totalStars,
            completedCount: _state.completedQuestions.size,
            totalQuestions,
            maxStars: totalQuestions * 3,
        };
    },

} as const;

// Auto-wire: QuestionUI just needs to emit QUESTION_ANSWERED — no manual markComplete() call needed.
EventBus.on(GameEvent.QUESTION_ANSWERED, ({ questionId, correct, attempts, stars }) => {
    if (correct) GameState.markComplete(questionId, stars, attempts);
});