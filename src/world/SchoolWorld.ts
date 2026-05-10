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
// Baris = ty (atas → bawah), Kolom = tx (kiri → kanan)
//
//   W W W W W W W W W W W W W
//   W G G G G G G G G G G G W
//   W G T T G G G G T T G G W
//   W G T G G K K G G G G G W
//   W G G G G K K G G G G G W
//   W G G G P P P P P G G G W
//   ! G G G P L L L P G G G W   ← tx=0 = '!' (NPC tile, walkable)
//   W G G G P L ? L P G G G W
//   W G C C P L L L P G G G W
//   W G C C G G G G G G G G W
//   W G G G G G S G G G G G W
//   W G G G G G G G G G G G W
//   W W W W W W W W W W W W W

const SCHOOL_MAP: string[][] = [
    // tx: 0    1    2    3    4    5    6    7    8    9   10   11   12
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 2 */['W', 'G', 'T', 'T', 'G', 'G', 'G', 'G', 'T', 'T', 'G', 'G', 'W'],
    /* ty 3 */['W', 'G', 'T', 'G', 'G', 'K', 'K', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 4 */['W', 'G', 'G', 'G', 'G', 'K', 'K', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty 5 */['W', 'G', 'G', 'G', 'P', 'P', 'P', 'P', 'P', 'G', 'G', 'G', 'W'],
    /* ty 6 */['!', 'G', 'G', 'G', 'P', 'L', 'L', 'L', 'P', 'G', 'G', 'G', 'W'],
    /* ty 7 */['W', 'G', 'G', 'G', 'P', 'L', '?', 'L', 'P', 'G', 'G', 'G', 'W'],
    /* ty 8 */['W', 'G', 'C', 'C', 'P', 'L', 'L', 'L', 'P', 'G', 'G', 'G', 'W'],
    /* ty 9 */['W', 'G', 'C', 'C', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty10 */['W', 'G', 'G', 'G', 'G', 'G', 'S', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty11 */['W', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'W'],
    /* ty12 */['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
];

/** Cell default kalau lookup ke SCHOOL_MAP miss (out-of-bounds, typo, dll). */
const DEFAULT_CELL = 'G';

// =============================================================================
// TILE DEFINITIONS — SINGLE SOURCE OF TRUTH
// =============================================================================
//
// Setiap char di SCHOOL_MAP didefinisikan di sini. Tambah tile type baru?
// Cukup tambah satu entry — preload, walkability, dekorasi auto ter-handle.
//
// FIELD GUIDE:
//   texture    — Phaser texture key (bebas, tapi konsisten dengan assetPath)
//   assetPath  — path file PNG; auto-loaded di preload() dengan dedupe
//   walkable   — apakah player bisa lewat
//   decoration — opsional, sprite yang di-overlay di atas ground tile
//                (pohon, sumur, dll). Co-located biar gampang tiling.

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
        assetPath: 'assets/tiles/grass.png',
        walkable: true,
    },
    W: {
        texture: 'tile_wall',
        assetPath: 'assets/tiles/wall.png',
        walkable: false,
    },
    T: {
        // Pohon = ground rumput + decor pohon di atasnya, non-walkable.
        texture: 'tile_grass',
        assetPath: 'assets/tiles/grass.png',
        walkable: false,
        decoration: {
            texture: 'decor_tree',
            assetPath: 'assets/decor/tree.png',
            ox: 0.5,
            oy: 1,
            offsetY: -8,
            scale: 0.5,
        },
    },
    K: {
        texture: 'tile_building',
        assetPath: 'assets/tiles/building.png',
        walkable: false,
    },
    P: {
        texture: 'tile_path',
        assetPath: 'assets/tiles/path.png',
        walkable: true,
    },
    L: {
        texture: 'tile_lapangan',
        assetPath: 'assets/tiles/lapangan.png',
        walkable: true,
    },
    C: {
        texture: 'tile_canteen',
        assetPath: 'assets/tiles/canteen.png',
        walkable: false,
    },
    R: {
        texture: 'tile_road',
        assetPath: 'assets/tiles/road.png',
        walkable: false,
    },
    '!': {
        // Tile gerbang tempat Pak Satpam berdiri. Sama dengan rumput visualnya;
        // NPC sprite-nya yang membedakan saat NPC di-spawn.
        texture: 'tile_grass',
        assetPath: 'assets/tiles/grass.png',
        walkable: true,
    },
    '?': {
        // Tile trigger soal lapangan. TileTriggerSystem yang men-handle event-nya.
        texture: 'tile_path',
        assetPath: 'assets/tiles/path.png',
        walkable: true,
    },
    S: {
        // Sumur = ground rumput + decor sumur, walkable agar tile trigger jalan.
        texture: 'tile_grass',
        assetPath: 'assets/tiles/grass.png',
        walkable: true,
        decoration: {
            texture: 'decor_well',
            assetPath: 'assets/decor/well.png',
            ox: 0.5,
            oy: 1,
            scale: 0.6,
        },
    },
};

// =============================================================================
// TRIGGER REGISTRY
// =============================================================================
// Memetakan terrain char → semantic triggerId. Listener (DialogManager nanti)
// resolve triggerId ke entry questions.json.

const SCHOOL_TRIGGERS: TileTriggerRegistry = {
    '?': 'lapangan_keliling',  // tile (6, 7)
    'S': 'sumur_diameter',     // tile (6, 10)
};

// =============================================================================
// HELPERS
// =============================================================================

/** Lookup cell di SCHOOL_MAP dengan fallback ke DEFAULT_CELL. */
const cellAt = (tx: number, ty: number): string =>
    SCHOOL_MAP[ty]?.[tx] ?? DEFAULT_CELL;

/** Lookup TileDef dengan fallback ke definisi DEFAULT_CELL. */
const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

/** Iterasi seluruh cell di SCHOOL_MAP. */
const forEachCell = (cb: (cell: string, tx: number, ty: number) => void): void => {
    for (let ty = 0; ty < SCHOOL_MAP.length; ty++) {
        const row = SCHOOL_MAP[ty];
        if (!row) continue;
        for (let tx = 0; tx < row.length; tx++) {
            cb(row[tx]!, tx, ty);
        }
    }
};

// =============================================================================
// SCHOOL WORLD
// =============================================================================

export default class SchoolWorld extends BaseWorld {

    // ── Entities ──────────────────────────────────────────────────────────────
    private player!: Player;
    private analogStick!: VirtualAnalog;

    // ── NPC & Systems ─────────────────────────────────────────────────────────
    private npcs: Npc[] = [];
    private proximitySystem: NpcProximitySystem | null = null;
    private triggerSystem: TileTriggerSystem | null = null;

    constructor() {
        super('SchoolWorld');
        // worldSize default 13 dari BaseWorld — sudah sesuai
    }

    // =========================================================================
    // PHASER LIFECYCLE
    // =========================================================================

    /**
     * Auto-preload semua texture yang dideklarasikan di TILE_DEFS.
     * Dedupe via Set — kalau dua TileDef pakai texture key yang sama,
     * file hanya di-load sekali.
     *
     * Tinggal isi field assetPath di TILE_DEFS, asset auto ke-load.
     */
    preload(): void {
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

        // TODO (TICKET-02): NPC spritesheet kalau sudah ada art
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

    /** Texture key per tile, di-resolve via TILE_DEFS. */
    protected override getBaseTileTexture(tx: number, ty: number): string {
        return defOf(cellAt(tx, ty)).texture;
    }

    /**
     * Set walkability + simpan terrain char di node.
     * `terrain` di-pakai TileTriggerSystem untuk lookup ke SCHOOL_TRIGGERS.
     */
    protected override onTileCreated(node: TileNode): void {
        const cell = cellAt(node.tx, node.ty);
        const def = defOf(cell);

        node.terrain = cell;
        node.isTroughable = def.walkable;

        // Tile yang gak walkable juga ditandai occupied — biar pathfinding
        // future tahu ada blocker fisik (pohon, tembok, dll), bukan cuma
        // "permukaan tidak bisa diinjak".
        if (!def.walkable) node.occupied = true;
    }

    /**
     * Auto-place dekorasi: iterasi semua cell, place sprite untuk yang
     * punya field `decoration`. Tinggal nambah `decoration` di TILE_DEFS,
     * gak perlu nambah loop manual di sini.
     */
    protected override buildBaseDecorations(): void {
        forEachCell((cell, tx, ty) => {
            const decor = defOf(cell).decoration;
            if (!decor) return;

            this.placeDecoration({
                tx,
                ty,
                texture: decor.texture,
                ox: decor.ox,
                oy: decor.oy,
                offsetX: decor.offsetX,
                offsetY: decor.offsetY,
                scale: decor.scale,
            });
        });
    }

    // =========================================================================
    // SPAWNING
    // =========================================================================

    /** Player spawn di tile (1, 6) — tepat di depan gerbang, dalam range Pak Satpam. */
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
     * Spawn 3 NPC sesuai layout SCHOOL_MAP.
     *
     * Catatan koordinat — di GDD `!` ada di (0, 6), bukan (1, 6) seperti
     * di tiket. Aku ikut layout (sumber visual lebih jujur dari tiket).
     *
     * TODO (TICKET-05): uncomment + verifikasi import Npc setelah tile art ready
     */
    private spawnNpcs(): void {
        // const pakSatpam = new Npc({
        //     id: 'npc_satpam', scene: this, tx: 0, ty: 6,
        //     gridUnit: this.gridUnit,
        //     npcId: 'pak_satpam', displayName: 'Pak Satpam',
        // });
        // const pakGuru = new Npc({
        //     id: 'npc_guru', scene: this, tx: 5, ty: 3,
        //     gridUnit: this.gridUnit,
        //     npcId: 'pak_guru', displayName: 'Pak Guru',
        // });
        // const buKantin = new Npc({
        //     id: 'npc_kantin', scene: this, tx: 2, ty: 8,
        //     gridUnit: this.gridUnit,
        //     npcId: 'bu_kantin', displayName: 'Bu Kantin',
        // });
        //
        // for (const npc of [pakSatpam, pakGuru, buKantin]) {
        //     this.placeEntityAtTile(npc.tileX, npc.tileY, npc);
        //     this.markOccupied(npc.tileX, npc.tileY);
        // }
        //
        // this.npcs = [pakSatpam, pakGuru, buKantin];
    }
}