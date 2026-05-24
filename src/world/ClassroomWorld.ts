import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import { EventBus, GameEvent } from '../core/EventBus';
import { DialogUI } from '../ui/DialogUI';
import { QuestionUI } from '../ui/QuestionUI';
import { DialogManager } from '../core/DialogManager';
import { Npc } from '../entities/Npc';
import { NpcProximitySystem } from '../entities/NpcProximitySystem';
import { HudUI } from '../ui/HudUI';
import { WorldCompleteUI } from '../ui/WorldCompleteUI';
import type { TileNode, DecorConfig } from './WorldTypes';

// =============================================================================
// TILE MAP — 6×8
// =============================================================================
//
//   W = wall (non-walkable)
//   F = floor (walkable)
//   Q = question tile (walkable, trigger soal)
//   > = portal ke SchoolWorld

const CLASSROOM_MAP: string[][] = [
    // tx:  0    1    2    3    4    5
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'F', 'F', 'F', 'F', 'W'],
    /* ty 2 */['W', 'W', 'F', 'W', 'F', 'W'],
    /* ty 3 */['W', 'W', 'F', 'W', 'F', 'W'],
    /* ty 4 */['W', 'W', 'F', 'W', 'F', 'W'],
    /* ty 5 */['W', 'W', 'F', 'W', 'F', 'W'],
    /* ty 6 */['W', 'W', 'F', 'W', 'F', 'W'],
    /* ty 7 */['W', '>', 'W', '>', 'W', 'W'],
];

const DEFAULT_CELL = 'F';

interface TileDef {
    texture: string;
    assetPath: string;
    walkable: boolean;
}

const TILE_DEFS: Record<string, TileDef> = {
    F: { texture: 'classroom_floor', assetPath: 'assets/floor_tile.png', walkable: true },
    W: { texture: 'classroom_floor', assetPath: 'assets/floor_tile.png', walkable: false },
    '>': { texture: 'classroom_floor', assetPath: 'assets/floor_tile.png', walkable: true },
    Q: { texture: 'classroom_floor', assetPath: 'assets/floor_tile.png', walkable: true },
};

const CLASSROOM_TRIGGERS: TileTriggerRegistry = {
    '>': 'portal_to_home',
    'Q': 'classroom_q',
};

const cellAt = (tx: number, ty: number): string =>
    CLASSROOM_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

// =============================================================================
// CLASSROOM WORLD
// =============================================================================

export default class ClassroomWorld extends BaseWorld {

    private player!: Player;
    private analogStick!: VirtualAnalog;
    private triggerSystem: TileTriggerSystem | null = null;
    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;
    private questionIndicators: Phaser.GameObjects.Text[] = [];
    private hud!: HudUI;
    private _onWorldComplete!: (p: { worldKey: string }) => void;

    // Pak Guru NPC
    private pakGuru!: Npc;
    private npcs: Npc[] = [];
    private proximitySystem: NpcProximitySystem | null = null;

    private _onTrigger!: (p: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    constructor() {
        super('ClassroomWorld');
        this.worldSize = 9;
    }

    // =========================================================================
    // PHASER LIFECYCLE
    // =========================================================================

    preload(): void {
        const loaded = new Set<string>();
        const tryLoad = (key: string, path: string): void => {
            if (loaded.has(key)) return;
            loaded.add(key);
            this.load.image(key, path);
        };

        for (const def of Object.values(TILE_DEFS)) {
            tryLoad(def.texture, def.assetPath);
        }

        this.load.image('wall_nw', 'assets/wall_nw.png');
        this.load.image('wall_ne', 'assets/wall_ne.png');
        this.load.image('pak_guru_idle', 'assets/pak_guru.png');
        this.load.image('desk', 'assets/desk.png');
        this.load.image('chair', 'assets/chair.png');

        Player.preloadAssets(this);
    }

    override create(): void {
        super.create();

        this.spawnPlayer();
        this.spawnNpcs();
        this.spawnQuestionIndicators();

        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('ClassroomWorld', ['classroom_q']).then(() => {
            if (!this.scene.isActive('ClassroomWorld')) return;
            this.spawnQuestionIndicators();
        });

        this.triggerSystem = new TileTriggerSystem(
            this.grid,
            CLASSROOM_TRIGGERS,
            this.player.entityId,
        );

        this.proximitySystem = new NpcProximitySystem(
            this,
            this.gridHelper,
            this.npcs,
            this.worldRoot,
        );

        this._onTrigger = ({ triggerId }) => {
            if (triggerId === 'portal_to_home') {
                this.scene.start('HomeWorld');
            }
        };

        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);

        this.hud = new HudUI();
        this.hud.show();

        this._onWorldComplete = ({ worldKey }) => {
            if (worldKey !== 'ClassroomWorld') return;
            WorldCompleteUI.show({
                worldName: 'Ruang Kelas',
                onNext: () => this.scene.start('MainMenu'),
                nextLabel: 'Ke Main Menu»',
            });
        };
        EventBus.on(GameEvent.WORLD_COMPLETE, this._onWorldComplete);

    }

    private readonly _onQuestionAnswered = ({ correct }: { questionId: string; correct: boolean; attempts: number; stars: number }) => {
        if (correct) this.updateIndicators();
    };



    override update(_time: number, delta: number): void {
        // Custom sort — wall selalu di belakang furniture
        this.decorLayer.list.sort((a: any, b: any) => {
            const aWall = a._isWall === true;
            const bWall = b._isWall === true;
            if (aWall && !bWall) return -1;
            if (!aWall && bWall) return 1;
            if (aWall && bWall) return (a._isoDepth ?? 0) - (b._isoDepth ?? 0);
            return (a.y ?? 0) - (b.y ?? 0);
        });

        this.entityLayer.list.sort((a: any, b: any) =>
            ('y' in a ? (a as any).y : 0) - ('y' in b ? (b as any).y : 0)
        );

        this.player.tick(delta);
        for (const npc of this.npcs) npc.tick(delta);
        this.proximitySystem?.update(this.player);
    }

    override shutdown(): void {
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.off(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);
        this.dialogManager?.destroy();
        this.dialogUI?.destroy();
        this.questionUI?.destroy();
        this.triggerSystem?.destroy();
        this.triggerSystem = null;
        this.proximitySystem?.destroy();
        this.proximitySystem = null;
        this.analogStick?.destroy();
        this.questionIndicators.forEach(i => i.destroy());
        this.questionIndicators = [];
        EventBus.off(GameEvent.WORLD_COMPLETE, this._onWorldComplete);
        super.shutdown();
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
        this.placeWalls();
        this.placeDecorations();
    }

    // =========================================================================
    // QUESTION INDICATORS
    // =========================================================================

    private spawnQuestionIndicators(): void {
        for (let ty = 0; ty < this.worldSize; ty++) {
            for (let tx = 0; tx < this.worldSize; tx++) {
                if (cellAt(tx, ty) !== 'Q') continue;

                const tile = this.getTileNode(tx, ty);
                if (!tile) continue;

                const indicator = this.add.text(
                    tile.worldX,
                    tile.worldY + 12,
                    '!',
                    {
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        color: '#ffffff',
                        backgroundColor: '#9bd009',
                        padding: { x: 5, y: 2 },
                        resolution: 2,
                    }
                )
                    .setOrigin(0.5, 1)
                    .setDepth(10_000);

                this.entityLayer.add(indicator);
                this.questionIndicators.push(indicator);
            }
        }
    }

    private updateIndicators(): void {
        this.questionIndicators.forEach(i => i.setVisible(false));
    }

    // =========================================================================
    // DECORATIONS
    // =========================================================================

    private placeDecorations(): void {
        const placement: DecorConfig[] = [
            { tx: 2, ty: 3, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 2, ty: 4, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 2, ty: 5, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 2, ty: 6, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 2, ty: 7, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 2, ty: 8, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },

            { tx: 4, ty: 3, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 4, ty: 4, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 4, ty: 5, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 4, ty: 6, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 4, ty: 7, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 4, ty: 8, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },

            { tx: 6, ty: 3, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 6, ty: 4, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 6, ty: 5, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 6, ty: 6, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 6, ty: 7, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 6, ty: 8, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
        ];

        for (const config of placement) {
            const deco = this.placeDecoration(config);
            if (deco) deco.setDepth(deco.y);
        }
    }

    // =========================================================================
    // WALLS
    // =========================================================================

    private placeWalls(): void {
        const WALL_HEIGHT = 16;
        const LEVELS = 3;
        const NE_OFFSET_X = 8;
        const NE_OFFSET_Y = 13;
        const NW_OFFSET_X = -8;
        const NW_OFFSET_Y = 16;

        const getIsoDepth = (tx: number, ty: number, level: number) =>
            (tx + ty) * 10 + level;

        for (let tx = 0; tx <= 9; tx++) {
            for (let level = 0; level < LEVELS; level++) {
                const depth = getIsoDepth(tx, 0, level);
                const deco = this.placeWallDeco({
                    tx, ty: 0,
                    texture: 'wall_ne',
                    ox: 0.5, oy: 1,
                    offsetX: NE_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NE_OFFSET_Y,
                    scale: 1,
                });
                if (deco) {
                    (deco as any)._isoDepth = depth;
                }
            }
        }

        for (let ty = 0; ty <= 9; ty++) {
            for (let level = 0; level < LEVELS; level++) {
                const depth = getIsoDepth(0, ty, level) + 0.5;
                const deco = this.placeWallDeco({
                    tx: 0, ty,
                    texture: 'wall_nw',
                    ox: 0.5, oy: 1,
                    offsetX: NW_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NW_OFFSET_Y,
                    scale: 1,
                });
                if (deco) {
                    (deco as any)._isoDepth = depth;
                }
            }
        }
    }

    private placeWallDeco(config: DecorConfig): Phaser.GameObjects.Image | null {
        const tile = this.getTileNode(config.tx, config.ty);
        if (!tile) return null;

        const obj = this.add.image(
            tile.worldX + (config.offsetX ?? 0),
            tile.worldY + (config.offsetY ?? 0),
            config.texture,
        );

        obj.setOrigin(config.ox ?? 0.5, config.oy ?? 1);
        if (config.scale !== undefined) obj.setScale(config.scale);
        (obj as any)._isWall = true;
        this.decorLayer.add(obj);
        return obj;
    }

    // =========================================================================
    // SPAWNING
    // =========================================================================

    private spawnPlayer(): void {
        this.analogStick = new VirtualAnalog(this, this.worldRoot);

        this.player = new Player({
            id: 'player_01',
            scene: this,
            tx: 3,
            ty: 6,
            gridUnit: this.gridUnit,
            analogStick: this.analogStick,
            walkabilityChecker: (tx, ty) => this.isWalkable(tx, ty),
        });

        this.player.initSprite();
        this.placeEntityAtTile(3, 6, this.player);
    }

    private spawnNpcs(): void {
        this.pakGuru = new Npc({
            id: 'npc_guru',
            scene: this,
            tx: 3,
            ty: 1,
            gridUnit: this.gridUnit,
            npcId: 'pak_guru',
            displayName: 'Pak Guru',
        });

        this.placeEntityAtTile(this.pakGuru.tileX, this.pakGuru.tileY, this.pakGuru);
        this.markOccupied(this.pakGuru.tileX, this.pakGuru.tileY);
        this.pakGuru.initSprite('pak_guru_idle', 2);

        this.npcs = [this.pakGuru];
    }


}