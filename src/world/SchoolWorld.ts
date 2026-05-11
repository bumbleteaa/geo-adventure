import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { NpcProximitySystem } from '../entities/NpcProximitySystem';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import { DialogUI } from '../ui/DialogUI';
import { QuestionUI } from '../ui/QuestionUI';
import { DialogManager } from '../core/DialogManager';
import type { TileNode } from './WorldTypes';
import { EventBus, GameEvent } from '../core/EventBus';

// =============================================================================
// TILE MAP — 13×13
// =============================================================================

const SCHOOL_MAP: string[][] = [
    // tx:      0    1    2    3    4    5    6    7    8    9   10   11   12
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

const DEFAULT_CELL = 'G';

// =============================================================================
// TILE DEFINITIONS
// =============================================================================

interface TileDef {
    texture: string;
    assetPath: string;
    walkable: boolean;
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
        texture: 'tile_grass',
        assetPath: 'assets/tile_022.png',
        walkable: true,
    },
    '!': {
        texture: 'tile_grass',
        assetPath: 'assets/tile_022.png',
        walkable: true,
    },
};

// =============================================================================
// TRIGGER REGISTRY
// =============================================================================

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
    private pakGuru!: Npc;

    // ── Systems ───────────────────────────────────────────────────────────────
    private npcs: Npc[] = [];
    private proximitySystem: NpcProximitySystem | null = null;
    private triggerSystem: TileTriggerSystem | null = null;

    // ── UI ────────────────────────────────────────────────────────────────────
    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;

    private _onTrigger!: (p: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    constructor() {
        super('SchoolWorld');
    }

    // =========================================================================
    // PHASER LIFECYCLE
    // =========================================================================

    preload(): void {
        // ── Tile textures ─────────────────────────────────────────────────────
        const loaded = new Set<string>();
        const tryLoad = (key: string, path: string): void => {
            if (loaded.has(key)) return;
            loaded.add(key);
            this.load.image(key, path);
        };

        for (const def of Object.values(TILE_DEFS)) {
            tryLoad(def.texture, def.assetPath);
        }

        // ── Building ──────────────────────────────────────────────────────────
        //this.load.image('school', 'assets/school.png');

        // ── Player ────────────────────────────────────────────────────────────
        Player.preloadAssets(this);

        // ── NPC spritesheets ──────────────────────────────────────────────────
        this.load.spritesheet('pak_guru_idle', 'assets/pak_guru.png', {
            frameWidth: 48,
            frameHeight: 48,
        });
    }

    override create(): void {
        super.create();
        this.spawnPlayer();
        console.log('cameras count:', this.cameras.cameras.length);
        this.spawnNpcs();

        // ── UI & Dialog ───────────────────────────────────────────────────────
        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('SchoolWorld');

        // ── Systems ───────────────────────────────────────────────────────────
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

        this._onTrigger = ({ triggerId }) => {
            if (triggerId === 'portal_to_home') {
                this.scene.start('HomeWorld');
            }
        };
        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
    }

    override update(time: number, delta: number): void {
        super.update(time, delta);
        this.player.tick(delta);

        for (const npc of this.npcs) {
            npc.tick(delta);
        }

        this.proximitySystem?.update(this.player);
    }

    override shutdown(): void {
        this.dialogManager?.destroy();
        this.dialogUI?.destroy();
        this.questionUI?.destroy();
        this.triggerSystem?.destroy();
        this.triggerSystem = null;
        this.proximitySystem?.destroy();
        this.proximitySystem = null;
        this.analogStick?.destroy();
        super.shutdown();
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
    }

    // =========================================================================
    // BASEWORLD OVERRIDES
    // =========================================================================

    protected override getBaseTileTexture(tx: number, ty: number): string {
        return defOf(cellAt(tx, ty)).texture;
    }

    protected override onTileCreated(node: TileNode): void {
        const cell = cellAt(node.tx, node.ty);
        const def = defOf(cell);
        node.terrain = cell;
        node.isThroughable = def.walkable;
        if (!def.walkable) node.occupied = true;
    }

    protected override buildBaseDecorations(): void {
        super.buildBaseDecorations();
        this.placeSchoolBuilding();
    }

    // =========================================================================
    // SCHOOL BUILDING
    // =========================================================================

    private placeSchoolBuilding(): void {
        this.placeDecoration({
            tx: 5,
            ty: 10,
            texture: 'school',
            ox: 0.5,
            oy: 1,
            offsetX: 0,
            offsetY: -16,
            scale: 0.5,
        });
    }

    // =========================================================================
    // SPAWNING
    // =========================================================================

    private spawnPlayer(): void {
        this.analogStick = new VirtualAnalog(this, this.worldRoot);

        this.player = new Player({
            id: 'player_01',
            scene: this,
            tx: 6,
            ty: 6,
            gridUnit: this.gridUnit,
            analogStick: this.analogStick,
            walkabilityChecker: (tx, ty) => this.isWalkable(tx, ty),
        });

        this.player.initSprite();
        this.placeEntityAtTile(6, 6, this.player);
    }

    private spawnNpcs(): void {

        // ── Pak Guru — depan gedung (4, 4) ────────────────────────────────────
        this.pakGuru = new Npc({
            id: 'npc_guru',
            scene: this,
            tx: 4,
            ty: 4,
            gridUnit: this.gridUnit,
            npcId: 'pak_guru',
            displayName: 'Pak Guru',
        });

        // Place + mark occupied
        for (const npc of [this.pakGuru]) {
            this.placeEntityAtTile(npc.tileX, npc.tileY, npc);
            this.markOccupied(npc.tileX, npc.tileY);
        }

        // Pak Guru pakai sprite row 2 (SE facing, wajah kelihatan)
        this.pakGuru.initSprite('pak_guru_idle', 2);
        this.npcs = [this.pakGuru];
    }
}