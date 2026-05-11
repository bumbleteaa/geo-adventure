import { BaseEntity } from './BaseEntity';
import { EventBus, GameEvent } from '../core/EventBus';
import { InteractionResult } from './EntityType';
import type { EntityConfig } from './EntityType';

export interface NpcConfig extends EntityConfig {
    npcId: string;
    displayName: string;
}

const NPC_PLACEHOLDER_TINT = 0xffff00;

export class Npc extends BaseEntity {

    public readonly npcId: string;
    public readonly displayName: string;

    // Kita simpan animKey yang sedang aktif supaya
    // kalau dipanggil dua kali tidak error
    private _activeAnimKey: string | null = null;

    constructor(config: NpcConfig) {
        super(config);
        this.npcId = config.npcId;
        this.displayName = config.displayName;

        // Warna kuning = penanda visual bahwa ini NPC,
        // beda dari player yang cyan
        this.setPlaceholderTint(NPC_PLACEHOLDER_TINT);
        this.setInteractable(true);
    }

    // =========================================================================
    // SPRITE — panggil ini dari SchoolWorld setelah spawn
    // =========================================================================

    /**
     * Ganti placeholder kuning dengan sprite animasi sungguhan.
     *
     * @param textureKey  - key yang sudah di-load di preload(), misal 'pak_guru_idle'
     * @param row         - baris mana di sprite sheet yang dipakai (0-indexed)
     *                      setiap baris berisi 4 frame animasi idle
     * @param frameRate   - kecepatan animasi, default 4 = lambat seperti nafas
     * @param frameHeight - tinggi satu frame dalam pixel, default 48
     */
    public initSprite(textureKey: string, frameHeight: number = 48): void {
        const sprite = this.scene.add.sprite(0, -(frameHeight / 2), textureKey);
        sprite.setScale(0.5);
        this.replaceWithSprite(sprite);
    }
    // =========================================================================
    // TICK
    // =========================================================================

    // NPC statis tidak perlu logic apapun di tick.
    // Animasi nafas sudah jalan otomatis dari sprite.play() di initSprite().
    public tick(_delta: number): void { }

    // =========================================================================
    // INTERACTION
    // =========================================================================

    protected onInteract(initiatorId: string): InteractionResult {
        EventBus.emit(GameEvent.NPC_INTERACT, {
            npcId: this.npcId,
            playerId: initiatorId,
        });
        return InteractionResult.SUCCESS;
    }

    protected override onFacingChanged(): void {
        // NPC statis tidak perlu ganti arah —
        // dia selalu menghadap ke satu arah yang di-set via initSprite()
    }
}