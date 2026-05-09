/**
 * SchoolWorld.ts
 * src/world/SchoolWorld.ts
 *
 * World pertama Geo Adventure — Halaman Sekolah SDN, grid 13×13.
 *
 * EPICS yang diimplementasikan di sini:
 *   TICKET-01  · Tilemap 13×13 (grid, tile types, isTroughable)
 *   TICKET-02  · Asset preload
 *   TICKET-04  · Proximity detection via NpcProximitySystem
 *   TICKET-05  · Spawn 3 NPC (Pak Satpam, Pak Guru, Bu Kantin)
 *
 * YANG TIDAK ADA DI SINI:
 *   Dialog / QuestionUI  → listener EventBus di scene terpisah
 *   GameState / scoring  → TICKET-10
 *   Rain effect          → TICKET-11
 */

import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { NpcProximitySystem } from '../entities/NpcProximitySystem';
import { VirtualAnalog } from '../core/VirtualAnalog';
import type { TileNode, MapConfig } from './WorldTypes';

// =============================================================================
// TILE MAP — 13×13
// =============================================================================
// Baris = ty (atas → bawah), Kolom = tx (kiri → kanan)
// Referensi layout dari GDD:
//
//   W W W W W W W W W W W W W
//   W G G G G G G G G G G G W
//   W G T T G G G G T T G G W
//   W G T G G K K G G G G G W
//   W G G G G K K G G G G G W
//   W G G G P P P P P G G G W
//   ! G G G P L L L P G G G W   ← tx=0 adalah '!' (NPC tile, walkable)
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

// ─── Tile type helpers ────────────────────────────────────────────────────────

/** Tile yang tidak bisa dilewati player. */
const NON_WALKABLE = new Set(['W', 'T', 'K', 'C', 'R']);

/** Tile yang walkable meski char-nya bukan 'G'. */
const FORCE_WALKABLE = new Set(['!', '?', 'S', 'P', 'L']);

// ─── Texture key per tile type ────────────────────────────────────────────────
// TODO (TICKET-02): ganti value string ini dengan key yang di-load di preload()
const TILE_TEXTURE: Record<string, string> = {
    G: 'tile_grass',
    W: 'tile_wall',
    T: 'tile_tree',     // dekorasi pohon
    K: 'tile_building', // ruang kelas
    P: 'tile_path',
    L: 'tile_lapangan',
    C: 'tile_canteen',
    R: 'tile_road',
    '!': 'tile_grass',  // NPC tile — sama dengan rumput
    '?': 'tile_path',   // trigger tile
    S: 'tile_grass',  // sumur — digambar sebagai dekor di buildBaseDecorations
};

// =============================================================================
// SCHOOL WORLD
// =============================================================================

export default class SchoolWorld extends BaseWorld {

    // ── Entities ──────────────────────────────────────────────────────────────
    private player!: Player;
    private analogStick!: VirtualAnalog;

    // ── NPC & Proximity (TICKET-04 / TICKET-05) ───────────────────────────────
    private npcs: Npc[] = [];
    private proximitySystem: NpcProximitySystem | null = null;

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor() {
        super('SchoolWorld');
        // worldSize default 13 dari BaseWorld — sudah sesuai
    }

    // =========================================================================
    // PHASER LIFECYCLE
    // =========================================================================

    // ── preload ───────────────────────────────────────────────────────────────

    preload(): void {
        // TODO (TICKET-02): load semua texture tile
        // this.load.image('tile_grass',    'assets/tiles/grass.png');
        // this.load.image('tile_wall',     'assets/tiles/wall.png');
        // this.load.image('tile_tree',     'assets/tiles/tree.png');
        // this.load.image('tile_building', 'assets/tiles/building.png');
        // this.load.image('tile_path',     'assets/tiles/path.png');
        // this.load.image('tile_lapangan', 'assets/tiles/lapangan.png');
        // this.load.image('tile_canteen',  'assets/tiles/canteen.png');
        // this.load.image('tile_road',     'assets/tiles/road.png');

        // TODO (TICKET-02): load NPC placeholder / spritesheet
        // Player.preloadAssets(this);
    }

    // ── create ────────────────────────────────────────────────────────────────

    override create(): void {
        super.create(); // buildGrid → layers → camera → gridHelper

        this.spawnPlayer();

        // TICKET-05: isi this.npcs
        this.spawnNpcs();

        // TICKET-04: inisialisasi proximity system
        this.proximitySystem = new NpcProximitySystem(
            this,
            this.gridHelper,
            this.npcs,
            this.worldRoot,
        );
    }

    // ── update ────────────────────────────────────────────────────────────────

    override update(time: number, delta: number): void {
        super.update(time, delta); // Y-sort depth

        // NPC idle tick (TICKET-13)
        for (const npc of this.npcs) {
            npc.tick(time, delta);
        }

        // Proximity detection setiap frame (TICKET-04)
        this.proximitySystem?.update(this.player);
    }

    // ── shutdown ──────────────────────────────────────────────────────────────

    override shutdown(): void {
        this.proximitySystem?.destroy();
        this.proximitySystem = null;
        this.analogStick?.destroy();
        super.shutdown();
    }

    // =========================================================================
    // BASEWORLD OVERRIDES — tile system (TICKET-01)
    // =========================================================================

    /**
     * Kembalikan texture key untuk setiap tile berdasarkan SCHOOL_MAP.
     * Dipanggil BaseWorld.buildGrid() untuk setiap koordinat (tx, ty).
     */
    protected override getBaseTileTexture(tx: number, ty: number): string {
        const cell = SCHOOL_MAP[ty]?.[tx] ?? 'G';
        return TILE_TEXTURE[cell] ?? 'tile_grass';
    }

    /**
     * Hook setelah tile dibuat — set isTroughable dan terrain berdasarkan tipe.
     * Dipanggil BaseWorld.buildGrid() untuk setiap TileNode setelah tile di-render.
     *
     * TODO (TICKET-01): lengkapi logic isTroughable untuk semua tile type
     */
    protected override onTileCreated(node: TileNode): void {
        const cell = SCHOOL_MAP[node.ty]?.[node.tx] ?? 'G';

        node.terrain = cell;

        if (NON_WALKABLE.has(cell)) {
            node.isTroughable = false;
            node.occupied = true;
        } else if (FORCE_WALKABLE.has(cell)) {
            node.isTroughable = true;
        } else {
            // Default 'G' dan tile lain = walkable
            node.isTroughable = true;
        }
    }

    /**
     * Tempatkan dekorasi statis (pohon, sumur, dll) di atas tile yang sesuai.
     *
     * TODO (TICKET-01): tambahkan dekorasi berdasarkan posisi T, S di SCHOOL_MAP
     * Referensi pola dari HomeWorld.buildBaseDecorations()
     */
    protected override buildBaseDecorations(): void {
        // TODO: iterasi SCHOOL_MAP, temukan tile T → placeDecoration pohon
        // TODO: tile S (tx=6, ty=10) → placeDecoration sumur
        // Contoh:
        // this.placeDecoration({ tx: 2, ty: 2, texture: 'tile_tree', ox: 0.5, oy: 1, scale: 0.5 });
    }

    /**
     * Required abstract dari BaseWorld — SchoolWorld pakai SCHOOL_MAP,
     * bukan MapConfig object. Kembalikan dummy config; semua logic ada di
     * getBaseTileTexture() dan onTileCreated().
     *
     * TODO (TICKET-01): hapus atau isi jika BaseWorld butuh MapConfig penuh
     */
    protected getMapConfig(): MapConfig {
        return {
            worldSize: 13,
            tileWidth: this.tileW,
            tileHeight: this.tileH,
            originX: this.originX,
            originY: this.originY,
            getBaseTileTexture: (tx, ty) => this.getBaseTileTexture(tx, ty),
            tileModification: [],
        };
    }

    // =========================================================================
    // SPAWNING
    // =========================================================================

    /**
     * Spawn player di tile gerbang (1, 6).
     *
     * TODO (TICKET-01): konfirmasi koordinat spawn sesuai layout final
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
     * Spawn 3 NPC sesuai posisi di GDD.
     *
     * TODO (TICKET-05): implementasi penuh (markOccupied, npcId, displayName)
     */
    private spawnNpcs(): void {
        // TODO (TICKET-05):
        // const pakSatpam = new Npc({ id: 'npc_satpam', scene: this, tx: 1,  ty: 6, gridUnit: this.gridUnit, npcId: 'pak_satpam', displayName: 'Pak Satpam' });
        // const pakGuru   = new Npc({ id: 'npc_guru',   scene: this, tx: 5,  ty: 3, gridUnit: this.gridUnit, npcId: 'pak_guru',   displayName: 'Pak Guru'   });
        // const buKantin  = new Npc({ id: 'npc_kantin', scene: this, tx: 2,  ty: 8, gridUnit: this.gridUnit, npcId: 'bu_kantin',  displayName: 'Bu Kantin'  });
        //
        // for (const npc of [pakSatpam, pakGuru, buKantin]) {
        //     this.placeEntityAtTile(npc.tileX, npc.tileY, npc);
        //     this.markOccupied(npc.tileX, npc.tileY);
        // }
        //
        // this.npcs = [pakSatpam, pakGuru, buKantin];
    }
}