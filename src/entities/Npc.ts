// Interactiveable NPCs that can provide information, quests, or items to the player. They can be placed in various rooms and have different dialogue options based on the player's progress in the story. The NPCs can also have their own unique personalities and backstories, adding depth to the game world and making interactions more engaging for the player.

/**
 * Npc.ts
 * src/entities/Npc.ts
 *
 * Base class untuk semua NPC di Geo Adventure.
 * Setiap NPC yang bisa diajak interaksi (Pak Satpam, Pak Guru, Bu Kantin)
 * adalah subclass dari Npc, atau langsung menggunakan class ini jika
 * behaviour-nya cukup sederhana.
 *
 * TANGGUNG JAWAB:
 *   - Menyimpan identitas NPC (npcId, displayName)
 *   - Menampilkan placeholder kuning sebelum sprite pixel art di-load
 *   - Merespons interaksi player dengan emit NPC_INTERACT ke EventBus
 *   - Menyediakan hook tick() untuk subclass (idle bobbing, AI sederhana, dll)
 *
 * YANG TIDAK DILAKUKAN DI SINI:
 *   - Memilih soal dari questions.json → tanggung jawab SchoolWorld / QuestionService
 *   - Menampilkan DialogUI / QuestionUI → tanggung jawab listener di EventBus
 *   - Proximity detection → tanggung jawab SchoolWorld.update()
 *   - Indikator "!" di atas kepala → TICKET-13
 *
 * DEPENDENCY NOTE:
 *   NPC_INTERACT ditambahkan ke EventBus.ts bersamaan dengan ticket ini.
 *   TICKET-08 akan menyempurnakan event set (QUESTION_ANSWERED, dll) —
 *   tidak akan konflik karena kita pakai key string yang berbeda.
 */

import { BaseEntity } from './BaseEntity';
import { EventBus, GameEvent } from '../core/EventBus';
import { InteractionResult } from './EntityType';
import type { EntityConfig } from './EntityType';

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Config untuk instansiasi Npc.
 *
 * UNDER THE HOOD — kenapa interface ini ada di Npc.ts dan bukan EntityType.ts:
 * Pola yang sama dipakai Player.ts untuk PlayerConfig.
 * Setiap entity "owns" config-nya sendiri — kalau Npc nambah field baru
 * (misal `dialogueKey: string`), tidak perlu menyentuh EntityType.ts
 * yang dipakai semua entity lain.
 */
export interface NpcConfig extends EntityConfig {
    /** Identifier unik NPC — dipakai sebagai key lookup di questions.json */
    npcId: string;          // 'pak_satpam' | 'pak_guru' | 'bu_kantin'
    /** Nama tampilan di DialogUI */
    displayName: string;
}

// ─── Visual Constants ─────────────────────────────────────────────────────────

/**
 * Tint kuning untuk placeholder rectangle.
 * Beda dari player (0x00ffff cyan) supaya mudah dibedakan di debug session.
 */
const NPC_PLACEHOLDER_TINT = 0xffff00;

// ─── Class ───────────────────────────────────────────────────────────────────

export class Npc extends BaseEntity {

    /** Identifier unik NPC. Immutable setelah constructor. */
    public readonly npcId: string;

    /** Nama tampilan, dipakai DialogUI sebagai label header. */
    public readonly displayName: string;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(config: NpcConfig) {
        super(config);

        this.npcId = config.npcId;
        this.displayName = config.displayName;

        /*
         * UNDER THE HOOD — kenapa setPlaceholderTint() dipanggil di sini:
         * BaseEntity membuat placeholder putih (0xffffff) di constructor-nya.
         * setPlaceholderTint() hanya mengubah fill color rectangle itu —
         * tidak ada reallocation atau re-add ke scene. Aman dipanggil
         * setelah super() selesai.
         */
        this.setPlaceholderTint(NPC_PLACEHOLDER_TINT);

        /*
         * NPC selalu bisa diinteraksi sejak spawn.
         * SchoolWorld bisa memanggil setInteractable(false) kalau ada
         * kondisi khusus (misal: soal sudah selesai, NPC "pergi", dll).
         */
        this.setInteractable(true);
    }

    // =========================================================================
    // TICK — dipanggil dari world update loop setiap frame
    // =========================================================================

    /**
     * Game loop hook. Dipanggil dari SchoolWorld.update() setiap frame.
     *
     * Saat ini: no-op — placeholder untuk idle animation di TICKET-13.
     *
     * UNDER THE HOOD — kenapa tick() dan bukan Phaser preUpdate():
     * BaseEntity adalah Container, bukan GameObject dengan update loop
     * otomatis. World mengontrol urutan tick() semua entity-nya secara
     * eksplisit — ini memberi kita kendali penuh atas execution order
     * tanpa bergantung pada Phaser's scene update sequence.
     *
     * Untuk subclass yang butuh bobbing/patrol, override method ini:
     * ```ts
     * override tick(time: number, delta: number): void {
     *     super.tick(time, delta);
     *     this.doBobAnimation(time);
     * }
     * ```
     */
    public tick(_time: number, _delta: number): void {
        // TODO (TICKET-13): trigger idle bob tween di sini
        // Contoh: this.updateIdleBob(_time);
    }

    // =========================================================================
    // INTERACTION — kontrak dari BaseEntity
    // =========================================================================

    /**
     * Dipanggil oleh BaseEntity.interact() setelah guard interactable lolos.
     *
     * UNDER THE HOOD — flow interaksi lengkap:
     *   1. Player.ts mendeteksi tombol E / tap
     *   2. SchoolWorld memanggil npc.interact(player.entityId)
     *   3. BaseEntity.interact() cek isInteractable → memanggil onInteract()
     *   4. onInteract() emit NPC_INTERACT → EventBus broadcast
     *   5. Listener di SchoolWorld / DialogManager menangkap event → buka UI
     *
     * Kenapa onInteract() tidak langsung buka DialogUI?
     * Karena Npc.ts tidak boleh tahu tentang UI. Kalau Npc.ts import DialogUI,
     * kita ciptakan coupling yang membuat unit test, hot-reload, dan future
     * refactor jadi menyakitkan. EventBus adalah batas pemisah yang bersih.
     *
     * @param initiatorId  entityId dari entity yang memulai interaksi (biasanya player)
     * @returns InteractionResult.SUCCESS selalu — NPC tidak pernah menolak interaksi
     */
    protected onInteract(initiatorId: string): InteractionResult {
        EventBus.emit(GameEvent.NPC_INTERACT, {
            npcId: this.npcId,
            playerId: initiatorId,
        });

        return InteractionResult.SUCCESS;
    }

    // =========================================================================
    // LIFECYCLE HOOKS — optional overrides untuk subclass
    // =========================================================================

    /**
     * Dipanggil BaseEntity saat facing direction berubah.
     * Untuk Npc statis: no-op. Subclass yang punya sprite bisa swap
     * animation key di sini.
     */
    protected override onFacingChanged(): void {
        // no-op — NPC statis tidak butuh directional sprite
        // Override di subclass yang punya walking animation
    }
}