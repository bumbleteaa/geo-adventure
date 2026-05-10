import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { NpcProximitySystem } from '../entities/NpcProximitySystem';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import type { TileNode } from './WorldTypes';

// =============================================================================
// TILE MAP — 13×13
// =============================================================================
//
//   Tile key:
//     W = dinding / boundary (non-walkable)
//     G = rumput / halaman kosong (walkable)
//     K = footprint bangunan sekolah (non-walkable, sprite di-place manual)
//     ! = tile gerbang — posisi spawn Pak Satpam (walkable, visual = rumput)
//
//   Layout:
//
//     W W W W W W W W W W W W W
//     W G G G G G G G G G G G W
//     W G K K K K K K G G G G W   ← baris atas footprint gedung (ty=2)
//     W G K K K K K K G G G G W   ← baris bawah footprint gedung (ty=3)
//     W G G G G G G G G G G G W   ← halaman depan sekolah
//     W G G G G G G G G G G G W
//     ! G G G G G G G G G G G W   ← tx=0 = tile gerbang, Pak Satpam berdiri di sini
//     W G G G G G G G G G G G W
//     W G G G G G G G G G G G W
//     W G G G G G G G G G G G W
//     W G G G G G G G G G G G W
//     W G G G G G G G G G G G W
//     W W W W W W W W W W W W W

const SCHOOL_MAP: string[][] = [
    // tx:  0    1    2    3    4    5    6    7    8    9   10   11   12
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 2 */['W', 'G', 'K', 'K', 'K', 'K', 'K', 'K', 'G', 'G', 'G', 'G', 'W'],
    /* ty 3 */['W', 'G', 'K', 'K', 'K', 'K', 'K', 'K', 'G', 'G', 'G', 'G', 'W'],
    /* ty 4 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 5 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 6 */['!', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 7 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 8 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 9 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty10 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty11 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty12 */['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
];

/** Fallback cell kalau lookup ke SCHOOL_MAP out-of-bounds. */
const DEFAULT_CELL = 'G';

// =============================================================================
// TILE DEFINITIONS
// =============================================================================
//
// Hanya tile yang benar-benar muncul di SCHOOL_MAP didefinisikan di sini.
// Ini menjaga daftar ini sebagai "single source of truth" — kalau suatu tile
// tidak ada di sini, berarti tidak boleh dipakai di map.
//
// Catatan untuk tile K:
//   Tile K hanya menandai footprint bangunan secara logika (walkability,
//   pathfinding). Visual bangunannya di-handle sebagai satu sprite besar
//   di buildBaseDecorations() — bukan lewat field `decoration` di sini.
//   Kalau kita taruh decoration di entry K, setiap tile K akan spawn
//   satu instance sprite bangunan, yang jelas salah.

interface TileDef {
    texture: string;
    assetPath: string;
    walkable: boolean;
    decoration?: {
        texture: string;
        assetPath: string;
        ox?: number;
        oy?: number;
        offsetX?: number;
        offsetY?: number;
        scale?: number;
    };
}

const TILE_DEFS: Record<string, TileDef> = {
    G: {
        texture: 'tile_grass',
        assetPath: 'assets/tile_022.png',
        walkable: true,
    },
    W: {
        texture: 'tile_wall',
        assetPath: 'assets/wall.png',
        walkable: false,
    },
    K: {
        // Underneath tile untuk footprint bangunan.
        // Pakai grass supaya kalau building sprite belum ada, tile ini tidak aneh
        // (terlihat seperti halaman biasa, bukan warna error).
        texture: 'tile_grass',
        assetPath: 'assets/tiles/grass.png',
        walkable: false,
        // Tidak ada `decoration` di sini — building sprite di-place
        // satu kali secara manual di buildBaseDecorations().
    },
    '!': {
        // Tile gerbang — visual sama dengan rumput,
        // tapi secara semantik ini adalah posisi Pak Satpam.
        texture: 'tile_grass',
        assetPath: 'assets/tiles/grass.png',
        walkable: true,
    },
};

// =============================================================================
// TRIGGER REGISTRY
// =============================================================================
//
// Kosong untuk sekarang — tidak ada tile interaktif di world ini.
// TileTriggerSystem tetap dibuat (di create()) supaya strukturnya siap
// kalau nanti mau ditambah trigger baru tanpa refactor besar.

const SCHOOL_TRIGGERS: TileTriggerRegistry = {};

// =============================================================================
// HELPERS
// =============================================================================

const cellAt = (tx: number, ty: number): string =>
    SCHOOL_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

// =============================================================================
// SCHOOL WORLD
// =============================================================================

export default class SchoolWorld extends BaseWorld {

    // ── Entities ──────────────────────────────────────────────────────────────
    private player!: Player;
    private analogStick!: VirtualAnalog;

    // ── Systems ───────────────────────────────────────────────────────────────
    private npcs: Npc[] = [];
    private proximitySystem: NpcProximitySystem | null = null;
    private triggerSystem: TileTriggerSystem | null = null;

    constructor() {
        super('SchoolWorld');
    }

    // =========================================================================
    // PHASER LIFECYCLE
    // =========================================================================

    preload(): void {
        // ── Tile textures — auto-load dari TILE_DEFS, dedupe via Set ──────────
        const loaded = new Set<string>();
        const tryLoad = (key: string, path: string): void => {
            if (loaded.has(key)) return;
            loaded.add(key);
            this.load.image(key, path);
        };

        for (const def of Object.values(TILE_DEFS)) {
            tryLoad(def.texture, def.assetPath);
            if (def.decoration) {
                tryLoad(def.decoration.texture, def.decoration.assetPath);
            }
        }

        // ── Building asset — di-load manual karena bukan bagian TILE_DEFS ────
        // Sprite ini menutup seluruh footprint K (6×2 tile) sebagai satu gambar.
        this.load.image('school', 'assets/school.png');

        // ── Player spritesheet ────────────────────────────────────────────────
        Player.preloadAssets(this);
    }

    override create(): void {
        super.create(); // buildGrid → layers → camera → gridHelper

        this.spawnPlayer();
        this.spawnNpcs();

        this.proximitySystem = new NpcProximitySystem(
            this,
            this.gridHelper,
            this.npcs,
            this.worldRoot,
        );

        this.triggerSystem = new TileTriggerSystem(
            this.grid,
            SCHOOL_TRIGGERS,
            this.player.entityId,
        );
    }

    override update(time: number, delta: number): void {
        super.update(time, delta); // Y-sort depth
        this.player.tick(delta);

        for (const npc of this.npcs) {
            npc.tick(time, delta);
        }

        this.proximitySystem?.update(this.player);
    }

    override shutdown(): void {
        this.triggerSystem?.destroy();
        this.triggerSystem = null;
        this.proximitySystem?.destroy();
        this.proximitySystem = null;
        this.analogStick?.destroy();
        super.shutdown();
    }

    // =========================================================================
    // BASEWORLD OVERRIDES — TILE SYSTEM
    // =========================================================================

    protected override getBaseTileTexture(tx: number, ty: number): string {
        return defOf(cellAt(tx, ty)).texture;
    }

    protected override onTileCreated(node: TileNode): void {
        const cell = cellAt(node.tx, node.ty);
        const def = defOf(cell);

        node.terrain = cell;
        node.isTroughable = def.walkable;

        // Tile non-walkable juga ditandai occupied supaya pathfinding
        // tahu ada blocker fisik, bukan sekadar "permukaan tidak bisa diinjak".
        if (!def.walkable) node.occupied = true;
    }

    /**
     * Place semua dekorasi world.
     *
     * Dua tahap:
     *   1. Dekorasi generik dari TILE_DEFS.decoration (per-tile, auto-iterasi)
     *      — saat ini kosong karena TILE_DEFS yang baru tidak ada decoration.
     *      Tetap dipanggil via super() supaya kalau nanti ditambah, langsung jalan.
     *
     *   2. Bangunan sekolah — satu sprite besar, di-place manual ke tile anchor.
     *      Tidak bisa lewat TILE_DEFS.decoration karena akan spawn 12 instance
     *      (satu per tile K). Di sini kita taruh tepat satu kali.
     */
    protected override buildBaseDecorations(): void {
        super.buildBaseDecorations();
        this.placeSchoolBuilding();
    }

    // =========================================================================
    // SCHOOL BUILDING PLACEMENT
    // =========================================================================

    /**
     * Tempatkan sprite bangunan sekolah sebagai satu objek yang menutupi
     * seluruh footprint K (tx 2–7, ty 2–3).
     *
     * CARA KERJA ANCHOR ISOMETRIC:
     *   Dalam isometric view, "depan" bangunan (sisi menghadap kamera) ada di
     *   baris ty paling besar. Center dari front edge footprint kita adalah
     *   tx=4, ty=3 — itu yang jadi tile anchor.
     *
     *   origin (ox: 0.5, oy: 1) meletakkan pivot di tengah-bawah sprite,
     *   sehingga "kaki" bangunan pas di atas tile anchor dan sprite
     *   tumbuh ke atas menutupi tile K di belakangnya.
     *
     * TUNING offsetY dan scale:
     *   Nilai awal offsetY: -16 dan scale: 1.0 adalah starting point.
     *   Setelah game dijalankan:
     *     - Bangunan terlalu kecil / besar → adjust scale
     *     - Bangunan terlalu tinggi / rendah → adjust offsetY (lebih negatif = naik)
     *     - Bangunan geser horizontal → adjust offsetX
     *   Ini normal — tuning visual selalu iteratif.
     */
    private placeSchoolBuilding(): void {
        this.placeDecoration({
            tx: 5,       // center dari front edge footprint (tx 2–7 → tengah = 4–5, pilih 4)
            ty: 10,       // ty paling besar dari footprint = baris paling "depan" di isometric
            texture: 'school',
            ox: 0.5,     // pivot horizontal di tengah sprite
            oy: 1,       // pivot vertikal di bawah sprite ("kaki bangunan")
            offsetX: 0,  // fine-tune horizontal kalau perlu
            offsetY: -16, // angkat sedikit supaya atap tidak terpotong tile di atasnya
            scale: 0.5,  // sesuaikan setelah melihat hasil vs gridUnit
        });
    }

    // =========================================================================
    // SPAWNING
    // =========================================================================

    /**
     * Player spawn di tile (1, 6) — tepat di dalam gerbang, satu langkah
     * dari Pak Satpam yang berdiri di (0, 6). Jarak Chebyshev = 1,
     * artinya indikator '!' Pak Satpam langsung muncul saat game dimulai.
     * Ini memang disengaja sebagai tutorial hook — NPC pertama yang ditemui
     * player adalah Pak Satpam.
     */
    private spawnPlayer(): void {
        this.analogStick = new VirtualAnalog(this, this.worldRoot);

        this.player = new Player({
            id: 'player_01',
            scene: this,
            tx: 1,
            ty: 6,
            gridUnit: this.gridUnit,
            analogStick: this.analogStick,
            walkabilityChecker: (tx, ty) => this.isWalkable(tx, ty),
        });

        this.player.initSprite();
        this.placeEntityAtTile(1, 6, this.player);
    }

    /**
     * Spawn 2 NPC:
     *   - Pak Satpam di tile gerbang (0, 6)
     *   - Pak Guru di depan gedung (4, 4)
     *
     * Bu Kantin tidak ada di world ini.
     *
     * Placeholder rectangle kuning sudah aktif dari Npc constructor —
     * tidak perlu memanggil initSprite() karena Npc tidak punya spritesheet
     * yang perlu di-register (berbeda dengan Player).
     */
    private spawnNpcs(): void {
        const pakSatpam = new Npc({
            id: 'npc_satpam',
            scene: this,
            tx: 0,   // tile '!' di SCHOOL_MAP
            ty: 6,
            gridUnit: this.gridUnit,
            npcId: 'pak_satpam',
            displayName: 'Pak Satpam',
        });

        const pakGuru = new Npc({
            id: 'npc_guru',
            scene: this,
            tx: 4,   // depan gedung — tile G di ty=4, center dari footprint
            ty: 4,
            gridUnit: this.gridUnit,
            npcId: 'pak_guru',
            displayName: 'Pak Guru',
        });

        for (const npc of [pakSatpam, pakGuru]) {
            this.placeEntityAtTile(npc.tileX, npc.tileY, npc);
            this.markOccupied(npc.tileX, npc.tileY);
        }

        this.npcs = [pakSatpam, pakGuru];
    }
}