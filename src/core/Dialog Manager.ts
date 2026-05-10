import { EventBus, GameEvent } from './EventBus';
import { GameState } from './GameState';
import type { DialogUI } from '../ui/DialogUI';
import type { QuestionUI, Question } from '../ui/QuestionUI';

// =============================================================================
// TYPES
// =============================================================================

/** Teks sapaan NPC sebelum soal muncul. Bisa diperluas ke JSON nanti. */
const NPC_GREETINGS: Record<string, string> = {
    pak_satpam: 'Coba jawab pertanyaan Pak Satpam dulu ya!',
    pak_guru: 'Selamat datang! Pak Guru punya soal matematika menarik untukmu.',
};

const GREETING_ALL_DONE: Record<string, string> = {
    pak_satpam: 'Hebat! Kamu sudah menjawab semua pertanyaan Pak Satpam',
    pak_guru: 'Bagus sekali! Semua soal Pak Guru sudah kamu jawab. Terus belajar ya!',
};

// =============================================================================
// CLASS
// =============================================================================

export class DialogManager {

    private readonly _dialog: DialogUI;
    private readonly _question: QuestionUI;

    /** Semua soal dari questions.json, di-index per npcId. */
    private _byNpc: Map<string, Question[]> = new Map();

    /** Guard supaya satu interaksi selesai dulu sebelum bisa trigger lagi. */
    private _busy = false;

    /** Referensi handler yang di-bind ke EventBus, untuk cleanup di destroy(). */
    private readonly _onNpcInteract: (payload: { npcId: string; playerId: string }) => void;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(dialog: DialogUI, question: QuestionUI) {
        this._dialog = dialog;
        this._question = question;

        // Bind sekali supaya removeListener bisa pakai referensi yang sama.
        this._onNpcInteract = ({ npcId }) => this._handleInteract(npcId);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Load questions.json dan daftarkan ke GameState.
     * Harus di-await sebelum player bisa berinteraksi dengan NPC.
     *
     * @param worldKey - kunci world untuk GameState.registerWorld()
     */
    async init(worldKey: string): Promise<void> {
        const questions = await this._loadQuestions();

        // Index per npcId
        for (const q of questions) {
            const list = this._byNpc.get(q.npc_id) ?? [];
            list.push(q);
            this._byNpc.set(q.npc_id, list);
        }

        // Daftarkan semua question ID ke GameState supaya world progress terlacak.
        GameState.registerWorld(worldKey, questions.map(q => q.id));

        // Mulai dengarkan interaksi NPC.
        EventBus.on(GameEvent.NPC_INTERACT, this._onNpcInteract);
    }

    /**
     * Bersihkan listener. Panggil dari SchoolWorld.shutdown().
     */
    destroy(): void {
        EventBus.off(GameEvent.NPC_INTERACT, this._onNpcInteract);
        this._busy = false;
    }

    // =========================================================================
    // PRIVATE — core flow
    // =========================================================================

    /**
     * Entry point saat player menyentuh NPC.
     *
     * Flow:
     *   1. Guard: kalau sedang busy, abaikan
     *   2. Cari soal berikutnya yang belum selesai untuk npcId ini
     *   3a. Ada soal → DialogUI intro → QuestionUI
     *   3b. Semua selesai → DialogUI "all done"
     */
    private _handleInteract(npcId: string): void {
        if (this._busy) return;

        const nextQuestion = this._pickNext(npcId);

        if (nextQuestion) {
            this._runQuestionFlow(npcId, nextQuestion);
        } else {
            this._runAllDoneFlow(npcId);
        }
    }

    /** Jalankan alur normal: intro dialog → soal. */
    private _runQuestionFlow(npcId: string, question: Question): void {
        this._busy = true;

        const greeting = NPC_GREETINGS[npcId] ?? 'Ada soal yang perlu kamu jawab.';

        // Konversi npcId ke display name (kapital + ganti underscore).
        const npcName = this._toDisplayName(npcId);

        this._dialog.show(npcName, greeting, () => {
            // Dialog selesai → tampilkan soal.
            this._question.show(question, () => {
                // Soal selesai (benar) → bebas interaksi lagi.
                this._busy = false;
            });
        });

        // Handle jika player skip QuestionUI (QUESTION_SKIPPED) → tetap unbusy.
        const onSkip = ({ questionId }: { questionId: string }) => {
            if (questionId === question.id) {
                this._busy = false;
                EventBus.off(GameEvent.QUESTION_SKIPPED, onSkip);
            }
        };
        EventBus.on(GameEvent.QUESTION_SKIPPED, onSkip);
    }

    /** Jalankan alur "semua soal sudah selesai" — cukup dialog, tidak ada soal. */
    private _runAllDoneFlow(npcId: string): void {
        this._busy = true;

        const text = GREETING_ALL_DONE[npcId] ?? 'Kamu sudah menjawab semua soal!';
        const npcName = this._toDisplayName(npcId);

        this._dialog.show(npcName, text, () => {
            this._busy = false;
        });
    }

    // =========================================================================
    // PRIVATE — helpers
    // =========================================================================

    /**
     * Pilih soal pertama (urut) yang belum di-complete untuk npcId ini.
     * Return null kalau semua sudah selesai atau npcId tidak dikenal.
     */
    private _pickNext(npcId: string): Question | null {
        const questions = this._byNpc.get(npcId) ?? [];
        return questions.find(q => !GameState.isComplete(q.id)) ?? null;
    }

    /**
     * Load questions.json dari /data/questions.json.
     * Vite meng-handle JSON import sebagai module, tapi dynamic fetch
     * lebih portable dan tidak butuh konfigurasi assetsInclude.
     */
    private async _loadQuestions(): Promise<Question[]> {
        try {
            const res = await fetch('/data/questions.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as Question[];
        } catch (err) {
            console.error('[DialogManager] Gagal load questions.json:', err);
            return [];
        }
    }

    /** 'pak_satpam' → 'Pak Satpam' */
    private _toDisplayName(npcId: string): string {
        return npcId
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
}