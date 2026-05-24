// src/core/ExplorationManager.ts
//
// Handle tile trigger 'E' → tampilkan ExplorationUI one-time.
// State disimpan di Set internal (per session game).
// Tidak butuh GameState karena exploration tidak masuk scoring.

import { EventBus, GameEvent } from './EventBus';
import { ExplorationUI, type Exploration } from '../ui/ExplorationUI';

export class ExplorationManager {

    private readonly _ui: ExplorationUI;
    private readonly _completed = new Set<string>();
    private _busy = false;
    private _destroyed = false;
    private _explorations: Map<string, Exploration> = new Map();
    private _onComplete?: (triggerId: string) => void;

    private readonly _onTileTriggered: (p: { triggerId: string }) => void;

    constructor(ui: ExplorationUI) {
        this._ui = ui;
        this._onTileTriggered = ({ triggerId }) => this._handleTrigger(triggerId);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async init(triggerIds: string[], onComplete?: (triggerId: string) => void): Promise<void> {
        this._onComplete = onComplete;
        const all = await this._load();
        for (const exp of all) {
            if (triggerIds.includes(exp.trigger_id)) {
                this._explorations.set(exp.trigger_id, exp);
            }
        }
        if (!this._destroyed) {
            EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        }
    }

    destroy(): void {
        this._destroyed = true;
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        this._busy = false;
    }

    isComplete(triggerId: string): boolean {
        return this._completed.has(triggerId);
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private _handleTrigger(triggerId: string): void {
        if (this._busy) return;
        if (this._completed.has(triggerId)) return;

        const exploration = this._explorations.get(triggerId);
        if (!exploration) return;

        this._busy = true;
        this._ui.show(exploration, () => {
            this._completed.add(triggerId);
            this._busy = false;
            this._onComplete?.(triggerId);
        });
    }

    private async _load(): Promise<Exploration[]> {
        try {
            const res = await fetch('/data/explorationguide.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json() as Exploration[];
        } catch (err) {
            console.error('[ExplorationManager] Gagal load explorationsguide.json:', err);
            return [];
        }
    }
}