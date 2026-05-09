import Phaser from 'phaser';
import type { Npc } from '../entities/Npc';
import type { GridHelper } from '../core/GridHelper';

// Constants 
/** Jarak Chebyshev maksimum agar NPC dianggap "dapat diinteraksi". */
const INTERACT_RANGE = 1;

/**
 * Offset Y indikator relatif terhadap center NPC container (px, isometric space).
 * Nilai negatif = di atas. Sesuaikan jika sprite NPC lebih tinggi.
 * TICKET-13 akan override nilai ini dengan tween bobbing.
 */
const INDICATOR_OFFSET_Y = -22;

/** Style teks indikator. TICKET-13 akan ganti ini dengan sprite. */
const INDICATOR_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: '14px',
    fontFamily: 'monospace',
    color: '#ffffff',
    backgroundColor: '#cc2200',
    padding: { x: 5, y: 2 },
    resolution: 2, // crisp pada layar HiDPI
};

// Player Interface 
/**
 * Minimal interface yang dibutuhkan ProximitySystem dari Player.
 * Lebih fleksibel daripada import langsung Player.ts — testable tanpa mock.
 */
export interface ProximityPlayer {
    readonly tileX: number;
    readonly tileY: number;
    readonly entityId: string;
}

//System 

export class NpcProximitySystem {

    //  Dependencies 
    private readonly scene: Phaser.Scene;
    private readonly gridHelper: GridHelper;
    private readonly npcs: readonly Npc[];

    //State 
    /** NPC yang sedang dalam range player. Null jika tidak ada. */
    private activeNpc: Npc | null = null;

    /**
     * entityId player yang terakhir di-update.
     * Disimpan agar tap handler (yang berjalan di luar update loop) bisa
     * mengakses player.entityId tanpa menyimpan referensi ke Player object.
     */
    private playerEntityId: string = '';

    // ── Visuals 

    /**
     * Map NPC → Text indicator game object.
     * Text di-add ke scene langsung (bukan ke worldRoot) supaya kita bisa
     * atur depth lebih mudah. Posisi di-sync setiap frame via syncIndicatorPos().
     *
     * TICKET-13: ganti Text dengan sprite + tween loop di sini.
     */
    private readonly indicators = new Map<Npc, Phaser.GameObjects.Text>();

    /**
     * Container parent dari NPC layer — diperlukan untuk konversi local → world coords.
     * Kita butuh ini karena Text indicator hidup di scene-space, bukan di worldRoot-space.
     */
    private readonly worldRoot: Phaser.GameObjects.Container;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param scene      Scene yang sedang aktif (SchoolWorld)
     * @param gridHelper Instance GridHelper dari BaseWorld
     * @param npcs       Array semua NPC yang sudah di-spawn di world
     * @param worldRoot  Container root dari BaseWorld (untuk transform konversi)
     */
    constructor(
        scene: Phaser.Scene,
        gridHelper: GridHelper,
        npcs: Npc[],
        worldRoot: Phaser.GameObjects.Container,
    ) {
        this.scene = scene;
        this.gridHelper = gridHelper;
        this.npcs = npcs;
        this.worldRoot = worldRoot;

        // ── Per-NPC setup ─────────────────────────────────────────────────────
        for (const npc of npcs) {
            this.setupNpcInteraction(npc);
            this.createIndicator(npc);
        }
    }

    // =========================================================================
    // SETUP HELPERS
    // =========================================================================

    /**
     * Daftarkan pointer (tap) listener pada NPC container.
     *
     * UNDER THE HOOD — kenapa setInteractive() butuh Rectangle eksplisit:
     * Phaser.GameObjects.Container tidak punya bounds bawaan untuk hit-test.
     * Tanpa Rectangle, klik tidak akan pernah ter-detect meskipun pointer
     * tepat di atas NPC. Ukuran 24×24 cukup besar untuk jari touch screen.
     */
    private setupNpcInteraction(npc: Npc): void {
        npc.setSize(24, 24);
        npc.setInteractive(
            new Phaser.Geom.Rectangle(-12, -12, 24, 24),
            Phaser.Geom.Rectangle.Contains,
        );

        npc.on(Phaser.Input.Events.POINTER_DOWN, () => {
            /*
             * Tap hanya memicu interact jika NPC ini sedang aktif (dalam range).
             * Guard ini mencegah player mengetuk NPC yang jauh dan memaksa
             * trigger interaksi tanpa proximity.
             */
            if (this.activeNpc === npc) {
                this.triggerInteract(npc);
            }
        });
    }

    /**
     * Buat Text object indikator `!` untuk satu NPC.
     * Disembunyikan (visible: false) sampai player masuk range.
     *
     * UNDER THE HOOD — kenapa tidak pakai Container.add() untuk indicator:
     * Kalau indicator di-add sebagai child Container NPC, depth indicator
     * ikut Y-sort world yang dilakukan BaseWorld. Ini menyebabkan NPC lain
     * bisa "menutupi" indicator karena depth-nya lebih tinggi.
     * Solusi: indicator hidup di scene root dengan depth sangat tinggi,
     * posisi di-sync manual setiap frame via syncIndicatorPos().
     */
    private createIndicator(npc: Npc): void {
        const text = this.scene.add
            .text(0, 0, '!', INDICATOR_STYLE)
            .setOrigin(0.5, 1)
            .setDepth(10_000) // selalu di atas semua entity
            .setVisible(false);

        this.indicators.set(npc, text);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Dipanggil dari SchoolWorld.update() setiap frame.
     *
     * Urutan operasi per frame:
     *   1. Simpan player entityId untuk tap handler
     *   2. Cari NPC terdekat dalam range
     *   3. Update activeNpc + indicator visibility
     *   4. Sync posisi indicator aktif ke screen coords
     */
    public update(player: ProximityPlayer): void {
        this.playerEntityId = player.entityId;

        // ── Step 1-2: cari NPC terdekat dalam range ───────────────────────────
        const newActiveNpc = this.findNearestInRange(player);

        // ── Step 3: toggle indicators kalau activeNpc berubah ─────────────────
        if (newActiveNpc !== this.activeNpc) {
            this.onActiveNpcChanged(this.activeNpc, newActiveNpc);
            this.activeNpc = newActiveNpc;
        }

        // ── Step 4: sync posisi indicator setiap frame ────────────────────────
        // (worldRoot bisa berpindah karena resize / recentering)
        if (this.activeNpc !== null) {
            this.syncIndicatorPos(this.activeNpc);
        }

    }

    /** Lepas semua resource. Panggil dari SchoolWorld.onShutdown(). */
    public destroy(): void {
        for (const [npc, indicator] of this.indicators) {
            indicator.destroy();
            npc.removeInteractive();
            npc.off(Phaser.Input.Events.POINTER_DOWN);
        }
        this.indicators.clear();
    }

    // =========================================================================
    // PRIVATE — proximity logic
    // =========================================================================

    /**
     * Iterasi semua NPC, kembalikan yang terdekat dengan player (Chebyshev <= 1).
     * Kalau ada dua NPC di jarak yang sama, yang pertama dalam array yang menang.
     *
     * UNDER THE HOOD — kenapa Chebyshev, bukan Manhattan / Euclidean:
     * Chebyshev = "king moves" — satu langkah diagonal dihitung 1, bukan √2.
     * Ini cocok untuk grid isometrik di mana player bisa bergerak 8 arah.
     * Manhattan akan membuat diagonal terasa "jauh" padahal satu langkah.
     */
    private findNearestInRange(player: ProximityPlayer): Npc | null {
        let nearestNpc: Npc | null = null;
        let nearestDist = Infinity;

        for (const npc of this.npcs) {
            const dist = this.gridHelper.distanceChebyshev(
                { tx: player.tileX, ty: player.tileY },
                { tx: npc.tileX, ty: npc.tileY },
            );

            if (dist <= INTERACT_RANGE && dist < nearestDist) {
                nearestDist = dist;
                nearestNpc = npc;
            }
        }

        return nearestNpc;
    }

    /**
     * Dipanggil ketika NPC aktif berubah (termasuk jadi null / dari null).
     * Sembunyikan indicator lama, tampilkan indicator baru.
     */
    private onActiveNpcChanged(
        prev: Npc | null,
        next: Npc | null,
    ): void {
        // Sembunyikan indikator NPC sebelumnya
        if (prev !== null) {
            this.indicators.get(prev)?.setVisible(false);
        }

        // Tampilkan indikator NPC baru
        if (next !== null) {
            this.indicators.get(next)?.setVisible(true);
            // Langsung sync posisi supaya tidak flash di (0,0) selama satu frame
            this.syncIndicatorPos(next);
        }
    }

    /**
     * Update posisi layar Text indicator agar mengikuti NPC container.
     *
     * UNDER THE HOOD — konversi local → world → screen:
     * NPC container punya koordinat lokal relatif ke entityLayer.
     * entityLayer punya koordinat lokal relatif ke worldRoot.
     * worldRoot punya koordinat lokal relatif ke scene (screen-space).
     *
     * getWorldTransformMatrix() mengakumulasi semua transform (position,
     * scale, rotation) dari seluruh rantai parent — hasilnya adalah
     * matrix yang memetakan NPC local (0,0) ke screen coords.
     *
     * Ini lebih robust daripada npc.x + worldRoot.x + entityLayer.x
     * karena juga memperhitungkan scale dan rotation kalau ada.
     */
    private syncIndicatorPos(npc: Npc): void {
        const indicator = this.indicators.get(npc);
        if (indicator === undefined) return;

        // Matrix world transform NPC container
        const matrix = npc.getWorldTransformMatrix();

        // (0, INDICATOR_OFFSET_Y) adalah titik di atas center NPC dalam local space
        // transformPoint mengkonversi ke screen coords
        const screenPos = matrix.transformPoint(0, INDICATOR_OFFSET_Y);

        indicator.setPosition(screenPos.x, screenPos.y);
    }

    // =========================================================================
    // PRIVATE — input
    // =========================================================================

    /**
     * Fire interaksi ke NPC target.
     */
    private triggerInteract(npc: Npc): void {
        npc.interact(this.playerEntityId);
    }
}