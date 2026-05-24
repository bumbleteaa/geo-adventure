// src/core/DialogManager.ts
//
// Orchestrator alur interaksi: NPC / tile trigger → dialog sapaan → soal → selesai.
//
// Perubahan dari versi sebelumnya (feedback validator):
//   - NpcConfig: tambah field opsional `triggerId` untuk decoupling NPC id dari trigger soal.
//     pak_guru (NPC id) sekarang memetakan ke 'classroom_q' (trigger soal).
//   - _handleNpcInteract(): pakai config.triggerId ?? npcId untuk startSession() dan hasRemaining().
//   - getTopicForTrigger(): proxy ke QuestionLogic — digunakan World untuk warna indikator '!'.

import { EventBus, GameEvent } from './EventBus';
import { QuestionLogic } from './QuestionLogic';
import type { QuestionEvent } from './QuestionLogic';
import type { DialogUI } from '../ui/DialogUI';
import type { QuestionUI } from '../ui/QuestionUI';

// =============================================================================
// CONFIG — Sapaan per NPC
// =============================================================================

interface NpcConfig {
    name: string;
    greeting: string;
    allDone: string;
    /**
     * Trigger id soal yang dipakai NPC ini.
     * Jika tidak diset, fallback ke npcId.
     * Contoh: pak_guru (NPC id) → 'classroom_q' (trigger soal).
     */
    triggerId?: string;
}

const NPC_CONFIG: Record<string, NpcConfig> = {
    pak_guru: {
        name: 'Pak Guru',
        greeting: 'Selamat datang! Pak Guru punya soal matematika menarik untukmu.',
        allDone: 'Bagus sekali! Semua soal Pak Guru sudah kamu jawab. Terus belajar ya!',
        triggerId: 'classroom_q',
    },
    pak_satpam: {
        name: 'Pak Satpam',
        greeting: 'Hei, ada soal seru nih! Yuk coba jawab dulu sebelum masuk.',
        allDone: 'Kamu sudah menjawab semua soal. Silakan masuk!',
        triggerId: 'school_q',
    },
};

// =============================================================================
// CLASS
// =============================================================================

export class DialogManager {

    private readonly _dialog: DialogUI;
    private readonly _question: QuestionUI;
    private readonly _logic: QuestionLogic;

    private _busy = false;
    private _destroyed = false;

    private readonly _onNpcInteract: (payload: { npcId: string; playerId: string }) => void;
    private readonly _onTileTriggered: (payload: { triggerId: string; tx: number; ty: number; entityId: string }) => void;
    private readonly _onQuestionEvent: (event: QuestionEvent) => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(dialog: DialogUI, question: QuestionUI) {
        this._dialog = dialog;
        this._question = question;
        this._logic = new QuestionLogic();

        this._onNpcInteract = ({ npcId }) => this._handleNpcInteract(npcId);
        this._onTileTriggered = ({ triggerId }) => this._handleTileInteract(triggerId);
        this._onQuestionEvent = (event) => this._handleQuestionEvent(event);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async init(worldKey: string, triggerIds: string[]): Promise<void> {
        await this._logic.init(worldKey, triggerIds);
        if (this._destroyed) return;
        this._logic.on(this._onQuestionEvent);
        EventBus.on(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
    }

    destroy(): void {
        this._destroyed = true;
        this._logic.off(this._onQuestionEvent);
        EventBus.off(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        this._busy = false;
        console.log('[DM.destroy] listeners cleaned up');
    }

    /**
     * Cek apakah semua soal untuk sebuah tile trigger sudah selesai.
     * Dipakai World untuk mengubah tampilan tile ('?' → '✓').
     */
    isTileComplete(triggerId: string): boolean {
        return !this._logic.hasRemaining(triggerId);
    }

    /**
     * Expose topik soal untuk suatu triggerId.
     * Digunakan World untuk menentukan warna indikator '!' per topik.
     * Kembalikan null jika trigger belum diload atau tidak ditemukan.
     */
    getTopicForTrigger(triggerId: string): 'keliling' | 'luas' | null {
        return this._logic.getTopicForTrigger(triggerId);
    }

    // =========================================================================
    // PRIVATE — Handler event dari World
    // =========================================================================

    /**
     * Alur:
     *   Ada soal + ada config NPC → tampilkan greeting → startSession(triggerId)
     *   Ada soal + tidak ada config → langsung startSession(npcId)
     *   Tidak ada soal → tampilkan pesan allDone
     *
     * Key change: startSession() sekarang menggunakan config.triggerId ?? npcId,
     * bukan npcId langsung. Ini memisahkan NPC sebagai entitas visual
     * dari trigger sebagai mekanisme soal.
     */
    private _handleNpcInteract(npcId: string): void {
        if (this._busy) return;

        const config = NPC_CONFIG[npcId];
        const triggerId = config?.triggerId ?? npcId;

        if (!this._logic.hasRemaining(triggerId)) {
            if (config) {
                this._busy = true;
                this._dialog.show(config.name, config.allDone, () => {
                    this._busy = false;
                });
            }
            return;
        }

        this._busy = true;

        if (config) {
            this._dialog.show(config.name, config.greeting, () => {
                this._logic.startSession(triggerId); // ← triggerId, bukan npcId
            });
        } else {
            this._logic.startSession(triggerId);
        }
    }

    private _handleTileInteract(triggerId: string): void {
        console.log('[DM] _handleTileInteract | triggerId:', triggerId, '| busy:', this._busy);
        if (this._busy) return;
        if (!this._logic.hasRemaining(triggerId)) return;

        this._busy = true;
        this._logic.startSession(triggerId);
    }

    // =========================================================================
    // PRIVATE — Handler event dari QuestionLogic
    // =========================================================================

    private _handleQuestionEvent(event: QuestionEvent): void {
        switch (event.type) {

            case 'SESSION_STARTED':
                this._question.show(event.question, this._logic, () => {
                    this._busy = false;
                });
                break;

            case 'SESSION_COMPLETE':
                // _busy dilepas oleh onHidden callback di SESSION_STARTED.
                break;

            case 'ALL_DONE':
                this._busy = false;
                break;
        }
    }
}