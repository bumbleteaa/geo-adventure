import { EventBus, GameEvent } from './EventBus';
import { GameState } from './GameState';
import type { DialogUI } from '../ui/DialogUI';
import type { QuestionUI, Question } from '../ui/QuestionUI';

const PAK_GURU_ID = 'pak_guru';
const PAK_GURU_GREETING = 'Selamat datang! Pak Guru punya soal matematika menarik untukmu.';
const PAK_GURU_ALL_DONE = 'Bagus sekali! Semua soal Pak Guru sudah kamu jawab. Terus belajar ya!';

export class DialogManager {

    private readonly _dialog: DialogUI;
    private readonly _question: QuestionUI;

    private _byNpc: Map<string, Question[]> = new Map();
    private _byTile: Map<string, Question> = new Map();
    private _busy = false;

    private readonly _onNpcInteract: (payload: { npcId: string; playerId: string }) => void;
    private readonly _onTileTriggered: (payload: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    constructor(dialog: DialogUI, question: QuestionUI) {
        this._dialog = dialog;
        this._question = question;
        this._onNpcInteract = ({ npcId }) => this._handleNpcInteract(npcId);
        this._onTileTriggered = ({ triggerId }) => this._handleTileInteract(triggerId);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async init(worldKey: string): Promise<void> {
        const questions = await this._loadQuestions();

        for (const q of questions) {
            const npcList = this._byNpc.get(q.npc_id) ?? [];
            npcList.push(q);
            this._byNpc.set(q.npc_id, npcList);

            if (q.tile_trigger_id) {
                this._byTile.set(q.tile_trigger_id, q);
            }
        }

        GameState.registerWorld(worldKey, questions.map(q => q.id));
        EventBus.on(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
    }

    destroy(): void {
        EventBus.off(GameEvent.NPC_INTERACT, this._onNpcInteract);
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTileTriggered);
        this._busy = false;
    }

    // =========================================================================
    // NPC FLOW
    // =========================================================================

    private _handleNpcInteract(npcId: string): void {
        if (this._busy) return;

        const next = this._pickNextByNpc(npcId);

        if (!next) {
            // All done
            if (npcId === PAK_GURU_ID) {
                this._busy = true;
                this._dialog.show('Pak Guru', PAK_GURU_ALL_DONE, () => {
                    this._busy = false;
                });
            }
            return;
        }

        // Pak Guru: dialog dulu baru soal
        if (npcId === PAK_GURU_ID) {
            this._busy = true;
            this._dialog.show('Pak Guru', PAK_GURU_GREETING, () => {
                this._showQuestion(next);
            });
            return;
        }

        // NPC lain: langsung soal
        this._showQuestion(next);
    }

    // =========================================================================
    // TILE FLOW
    // =========================================================================

    private _handleTileInteract(triggerId: string): void {
        if (this._busy) return;

        const question = this._byTile.get(triggerId);
        if (!question) return;
        if (GameState.isComplete(question.id)) return;

        this._showQuestion(question);
    }

    // =========================================================================
    // SHARED
    // =========================================================================

    private _showQuestion(question: Question): void {
        this._busy = true;

        this._question.show(question, () => {
            this._busy = false;
        });

        const onSkip = ({ questionId }: { questionId: string }) => {
            if (questionId === question.id) {
                this._busy = false;
                EventBus.off(GameEvent.QUESTION_SKIPPED, onSkip);
            }
        };
        EventBus.on(GameEvent.QUESTION_SKIPPED, onSkip);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private _pickNextByNpc(npcId: string): Question | null {
        const questions = this._byNpc.get(npcId) ?? [];
        return questions.find(q => !GameState.isComplete(q.id)) ?? null;
    }

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

    private _toDisplayName(npcId: string): string {
        return npcId
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }
}