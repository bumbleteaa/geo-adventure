// src/core/DialogManager.ts
//
// Orchestrator alur interaksi: NPC / tile trigger → dialog sapaan → soal → selesai.
//
// Perubahan dari versi sebelumnya:
//   - _byNpc, _byTile, _loadQuestions(), _pickNextByNpc() DIHAPUS — semua pindah ke QuestionLogic.
//   - QuestionLogic menjadi satu-satunya sumber kebenaran tentang soal dan sesi.
//   - DialogManager hanya mengorkestrasi URUTAN: greeting (opsional) → sesi soal → selesai.
//   - _busy dilepas berdasarkan event SESSION_COMPLETE dari QuestionLogic, bukan callback QuestionUI.
//
// Catatan untuk QuestionLogic.ts:
//   Tambahkan method berikut agar DialogManager bisa cek tanpa harus memulai sesi:
//
//   hasRemaining(triggerId: string): boolean {
//       return this._pickNext(triggerId) !== null;
//   }
//
// Catatan untuk QuestionUI.ts:
//   show() perlu menerima QuestionLogic agar bisa memanggil submitStep() dan getHint()
//   sebagai ganti logika internalnya sendiri. Lihat bagian SESSION_STARTED di bawah.

import { EventBus, GameEvent } from './EventBus';
import { QuestionLogic } from './QuestionLogic';
import type { QuestionEvent } from './QuestionLogic';
import type { DialogUI } from '../ui/DialogUI';
import type { QuestionUI } from '../ui/QuestionUI';

// =============================================================================
// CONFIG — Sapaan per NPC
//
// Tile trigger tidak punya greeting karena tidak ada karakter yang berbicara.
// Untuk menambah NPC baru, cukup tambahkan entry di sini — tidak perlu menyentuh
// logika apapun di bawah.
// =============================================================================

interface NpcConfig {
    name: string;
    greeting: string;  // ditampilkan sebelum soal pertama atau setiap interaksi
    allDone: string;   // ditampilkan ketika semua soal sudah selesai
}

const NPC_CONFIG: Record<string, NpcConfig> = {
    pak_guru: {
        name: 'Pak Guru',
        greeting: 'Selamat datang! Pak Guru punya soal matematika menarik untukmu.',
        allDone: 'Bagus sekali! Semua soal Pak Guru sudah kamu jawab. Terus belajar ya!',
    },
    // Tambahkan NPC baru di sini tanpa menyentuh logika lain:
    // pak_kepala_sekolah: { name: '...', greeting: '...', allDone: '...' },
};

// =============================================================================
// CLASS
// =============================================================================

export class DialogManager {

    private readonly _dialog: DialogUI;
    private readonly _question: QuestionUI;

    // QuestionLogic adalah satu-satunya yang tahu tentang soal, sesi, dan skor.
    // DialogManager hanya perlu tahu "mulai sesi" dan "sesi selesai".
    private readonly _logic: QuestionLogic;

    // Guard untuk mencegah dua interaksi berjalan bersamaan.
    // Diset true di awal interaksi, dilepas saat SESSION_COMPLETE diterima.
    private _busy = false;
    private _destroyed = false;

    // Referensi handler yang di-bind, diperlukan untuk cleanup di destroy().
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

    /**
     * Load soal via QuestionLogic dan mulai mendengarkan event.
     * Harus di-await dari SchoolWorld.create() sebelum player bisa berinteraksi.
     */
    async init(worldKey: string, triggerIds: string[]): Promise<void> {
        await this._logic.init(worldKey, triggerIds);
        if (this._destroyed) return;
        this._logic.on(this._onQuestionEvent);
        EventBus.on(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
    }

    /**
     * Bersihkan semua listener. Panggil dari SchoolWorld.shutdown().
     */
    destroy(): void {
        this._destroyed = true;

        this._logic.off(this._onQuestionEvent);
        EventBus.off(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        console.log('[DM.destroy] before off | count:', EventBus.listenerCount(GameEvent.TILE_TRIGGER_ENTERED));
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        console.log('[DM.destroy] after off  | count:', EventBus.listenerCount(GameEvent.TILE_TRIGGER_ENTERED));
        this._busy = false;
        console.log('[DM.destroy] | TILE listeners after:', EventBus.listenerCount(GameEvent.TILE_TRIGGER_ENTERED));
    }

    /**
     * Cek apakah semua soal untuk sebuah tile trigger sudah selesai.
     * Dipakai SchoolWorld untuk mengubah tampilan tile (misal: ganti ikon `?` → `✓`).
     */
    public isTileComplete(triggerId: string): boolean {
        return !this._logic.hasRemaining(triggerId);
    }

    // =========================================================================
    // PRIVATE — Handler event dari World
    // =========================================================================

    /**
     * Dipanggil ketika player menyentuh NPC.
     *
     * Alur:
     *   Ada soal + ada config NPC → tampilkan greeting → mulai sesi
     *   Ada soal + tidak ada config → langsung mulai sesi (tanpa greeting)
     *   Tidak ada soal → tampilkan pesan "semua sudah selesai"
     */
    private _handleNpcInteract(npcId: string): void {
        if (this._busy) return;

        const config = NPC_CONFIG[npcId];

        if (!this._logic.hasRemaining(npcId)) {
            // Semua soal NPC ini sudah dikerjakan.
            if (config) {
                this._busy = true;
                this._dialog.show(config.name, config.allDone, () => {
                    this._busy = false;
                });
            }
            return;
        }

        // Masih ada soal — set busy dulu agar tidak bisa di-trigger ulang.
        this._busy = true;

        if (config) {
            // Tampilkan greeting dulu, baru mulai sesi setelah player klik "Lanjut".
            // startSession() tidak dipanggil sebelum greeting selesai karena
            // SESSION_STARTED akan langsung emit dan QuestionUI akan muncul.
            this._dialog.show(config.name, config.greeting, () => {
                this._logic.startSession(npcId);
                // SESSION_STARTED → _handleQuestionEvent → _question.show()
            });
        } else {
            // NPC tanpa konfigurasi greeting — langsung ke soal.
            this._logic.startSession(npcId);
        }
    }

    /**
     * Dipanggil ketika player menginjak tile trigger.
     *
     * Tile trigger tidak punya greeting — langsung ke soal.
     * Jika semua soal sudah selesai, tidak ada yang terjadi (tile diam saja).
     */
    private _handleTileInteract(triggerId: string): void {
        console.log('[DM] _handleTileInteract | triggerId:', triggerId, '| busy:', this._busy);
        if (this._busy) return;
        if (!this._logic.hasRemaining(triggerId)) return;

        this._busy = true;
        this._logic.startSession(triggerId);
        // SESSION_STARTED → _handleQuestionEvent → _question.show()
    }

    // =========================================================================
    // PRIVATE — Handler event dari QuestionLogic
    // =========================================================================

    /**
     * Bereaksi terhadap semua event yang di-emit QuestionLogic.
     *
     * DialogManager hanya peduli tiga event:
     *   SESSION_STARTED  → tampilkan QuestionUI dengan soal yang dipilih QuestionLogic
     *   SESSION_COMPLETE → lepas _busy; interaksi berikutnya sudah bisa dimulai
     *   ALL_DONE         → safety net; seharusnya sudah ditangani lewat hasRemaining()
     *
     * Event lain (STEP_ADVANCED, ANSWER_WRONG, ANSWER_REVEALED) adalah urusan
     * internal antara QuestionLogic dan QuestionUI — DialogManager tidak perlu tahu.
     */
    private _handleQuestionEvent(event: QuestionEvent): void {
        switch (event.type) {

            case 'SESSION_STARTED':
                // _busy dilepas hanya setelah QuestionUI benar-benar hilang dari layar,
                // bukan saat SESSION_COMPLETE — supaya tidak ada interaksi baru
                // yang bisa dimulai selama star animation / fade-out masih berjalan.
                this._question.show(event.question, this._logic, () => {
                    this._busy = false;
                });
                break;

            case 'SESSION_COMPLETE':
                // Tidak perlu lepas _busy di sini.
                // Sudah dihandle oleh onHidden callback di SESSION_STARTED.
                break;

            case 'ALL_DONE':
                // ALL_DONE tidak membuka QuestionUI sama sekali,
                // jadi tidak ada onHidden callback — lepas _busy langsung.
                this._busy = false;
                break;
        }
    }
}