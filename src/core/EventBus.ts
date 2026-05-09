// src/core/EventBus.ts
// Interclass communication — typed EventEmitter wrapping Phaser.Events.EventEmitter.
// TICKET-08: added NPC_INTERACT, QUESTION_ANSWERED, QUESTION_SKIPPED, WORLD_COMPLETE

import Phaser from 'phaser';

// ─── Event Registry ───────────────────────────────────────────────────────────
// UNDER THE HOOD: add every new event here first, then its payload below.
// Never use raw string literals elsewhere in the codebase — always reference
// GameEvent.SOMETHING so typos are caught at compile time.

export const GameEvent = {
    // ── Entity lifecycle ──────────────────────────────────────────────────────
    ENTITY_SPAWNED: 'entity:spawned',
    ENTITY_DESTROYED: 'entity:destroyed',
    ENTITY_MOVE_START: 'entity:move_start',
    ENTITY_MOVE_END: 'entity:move_end',
    ENTITY_INTERACT: 'entity:interact',
    ENTITY_INTERACT_END: 'entity:interact_end',
    STATE_CHANGED: 'state:changed',

    // ── NPC ───────────────────────────────────────────────────────────────────
    // Fired by Npc.onInteract() when the player triggers an NPC conversation.
    NPC_INTERACT: 'npc:interact',

    // ── Questions ─────────────────────────────────────────────────────────────
    // Fired by QuestionUI after the student submits an answer (right or wrong).
    QUESTION_ANSWERED: 'question:answered',
    // Fired when the student closes the QuestionUI without answering.
    QUESTION_SKIPPED: 'question:skipped',

    // ── World progression ─────────────────────────────────────────────────────
    // Fired by GameState when all registered questions for a world are complete.
    WORLD_COMPLETE: 'world:complete',
} as const;

export type GameEvent = (typeof GameEvent)[keyof typeof GameEvent];

// ─── Payload Map ─────────────────────────────────────────────────────────────
// Every event key above must have a corresponding payload type here.
// TypeScript will error at the emit/on call-sites if payloads don't match.

export interface EventPayloadMap {
    // entity lifecycle
    [GameEvent.ENTITY_SPAWNED]: { entityId: string; tx: number; ty: number };
    [GameEvent.ENTITY_DESTROYED]: { entityId: string };
    [GameEvent.ENTITY_MOVE_START]: { entityId: string; fromTx: number; fromTy: number; toTx: number; toTy: number };
    [GameEvent.ENTITY_MOVE_END]: { entityId: string; tx: number; ty: number };
    [GameEvent.ENTITY_INTERACT]: { entityId: string; initiatorId: string };
    [GameEvent.ENTITY_INTERACT_END]: { entityId: string };
    [GameEvent.STATE_CHANGED]: { key: string; value: unknown };

    // NPC
    /** npcId — the NpcConfig.npcId, e.g. 'pak_satpam' */
    [GameEvent.NPC_INTERACT]: { npcId: string; playerId: string };

    // questions
    /**
     * questionId — matches Question.id from questions.json
     * correct    — true if the student answered correctly
     * attempts   — how many tries before this outcome (1 = first try)
     * stars      — stars awarded (0 if wrong, 1–3 depending on attempts)
     */
    [GameEvent.QUESTION_ANSWERED]: { questionId: string; correct: boolean; attempts: number; stars: number };
    [GameEvent.QUESTION_SKIPPED]: { questionId: string };

    // world progression
    /** worldKey — matches Phaser scene key, e.g. 'SchoolWorld' */
    [GameEvent.WORLD_COMPLETE]: { worldKey: string };
}

// ─── Typed Emitter ────────────────────────────────────────────────────────────
// Wraps Phaser's emitter with generics so every emit/on call is type-checked.

class TypedEventEmitter extends Phaser.Events.EventEmitter {
    emit<K extends GameEvent>(event: K, payload: EventPayloadMap[K]): boolean {
        return super.emit(event, payload);
    }

    on<K extends GameEvent>(
        event: K,
        fn: (payload: EventPayloadMap[K]) => void,
        context?: unknown,
    ): this {
        return super.on(event, fn, context);
    }

    once<K extends GameEvent>(
        event: K,
        fn: (payload: EventPayloadMap[K]) => void,
        context?: unknown,
    ): this {
        return super.once(event, fn, context);
    }

    off<K extends GameEvent>(
        event: K,
        fn: (payload: EventPayloadMap[K]) => void,
        context?: unknown,
    ): this {
        return super.off(event, fn, context);
    }
}

export const EventBus = new TypedEventEmitter();