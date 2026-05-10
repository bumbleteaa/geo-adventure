// src/entities/TileTriggerSystem.ts
//
// Translates ENTITY_MOVE_END (physics event from BaseEntity) into
// TILE_TRIGGER_ENTERED (semantic event consumed by game/UI layer).
//
// Mirrors NpcProximitySystem: extracts a single concern out of the World
// scene so SchoolWorld stays a composition root, not a logic kitchen sink.

import { EventBus, GameEvent } from '../core/EventBus';
import type { EventPayloadMap } from '../core/EventBus';
import type { TileNode } from '../world/WorldTypes';

/**
 * Maps tile terrain char (from world map) → semantic triggerId.
 * Each world defines its own registry. Terrain chars not in the registry
 * are silently ignored (they're walkable tiles, not triggers).
 */
export type TileTriggerRegistry = Record<string, string>;

export class TileTriggerSystem {
    private readonly grid: TileNode[][];
    private readonly registry: TileTriggerRegistry;
    private readonly playerEntityId: string;

    // Bound reference for proper unsubscribe
    private readonly _onMoveEnd: (p: EventPayloadMap[typeof GameEvent.ENTITY_MOVE_END]) => void;

    /**
     * @param grid           From BaseWorld.grid — already populated post-buildGrid()
     * @param registry       Mapping terrain → semantic triggerId
     * @param playerEntityId Only this entity's moves will fire triggers.
     *                       Others (NPCs, future entities) are silently ignored.
     */
    constructor(
        grid: TileNode[][],
        registry: TileTriggerRegistry,
        playerEntityId: string,
    ) {
        this.grid = grid;
        this.registry = registry;
        this.playerEntityId = playerEntityId;

        this._onMoveEnd = this.handleMoveEnd.bind(this);
        EventBus.on(GameEvent.ENTITY_MOVE_END, this._onMoveEnd);
    }

    private handleMoveEnd(payload: EventPayloadMap[typeof GameEvent.ENTITY_MOVE_END]): void {
        // Filter: only player's moves. NPCs walking later (idle bobbing,
        // patrol, etc.) must not fire question modals.
        if (payload.entityId !== this.playerEntityId) return;

        const node = this.grid[payload.tx]?.[payload.ty];
        if (!node?.terrain) return;

        const triggerId = this.registry[node.terrain];
        if (!triggerId) return; // Tile bukan trigger — ignore

        EventBus.emit(GameEvent.TILE_TRIGGER_ENTERED, {
            triggerId,
            tx: payload.tx,
            ty: payload.ty,
            entityId: payload.entityId,
        });
    }

    /** Unsubscribe. Call from World.shutdown(). */
    public destroy(): void {
        EventBus.off(GameEvent.ENTITY_MOVE_END, this._onMoveEnd);
    }
}