import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import { EventBus, GameEvent } from '../core/EventBus';
import { DialogUI } from '../ui/DialogUI';
import { QuestionUI } from '../ui/QuestionUI';
import { DialogManager } from '../core/DialogManager';
import type { TileNode, DecorConfig } from './WorldTypes';

const BEDROOM_MAP: string[][] = [
    // tx:  0    1    2    3    4    5
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'F', 'F', 'Q', 'F', 'W'],
    /* ty 2 */['W', 'F', 'F', 'F', 'F', 'W'],
    /* ty 3 */['W', 'F', 'F', 'F', 'F', 'W'],
    /* ty 4 */['W', 'F', 'F', 'F', 'F', 'W'],
    /* ty 5 */['W', 'W', '>', '>', 'W', 'W'],
];

const DEFAULT_CELL = 'F';

interface TileDef {
    texture: string;
    assetPath: string;
    walkable: boolean;
}

const TILE_DEFS: Record<string, TileDef> = {
    F: { texture: 'floor', assetPath: 'assets/floor_tile.png', walkable: true },
    W: { texture: 'floor', assetPath: 'assets/floor_tile.png', walkable: false },
    '>': { texture: 'floor', assetPath: 'assets/floor_tile.png', walkable: true },
    Q: { texture: 'floor', assetPath: 'assets/floor_tile.png', walkable: true },
};

const BEDROOM_TRIGGERS: TileTriggerRegistry = {
    '>': 'portal_to_home',
    'Q': 'bedroom_q',
};

// Mapping tile char → triggerId untuk indicator
const TILE_TRIGGER_MAP: Record<string, string> = {
    'Q': 'bedroom_q',
};

const cellAt = (tx: number, ty: number): string =>
    BEDROOM_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

// Indicator entry — simpan indicator + triggerId-nya
interface IndicatorEntry {
    indicator: Phaser.GameObjects.Text;
    triggerId: string;
}

export default class BedroomWorld extends BaseWorld {

    private player!: Player;
    private analogStick!: VirtualAnalog;
    private triggerSystem: TileTriggerSystem | null = null;
    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;

    // Indicator dengan info triggerId-nya
    private questionIndicators: IndicatorEntry[] = [];

    private _onTrigger!: (p: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    constructor() {
        super('BedroomWorld');
        this.worldSize = 6;
    }

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
        this.load.image('desk', 'assets/desk.png');
        this.load.image('chair', 'assets/chair.png');
        this.load.image('bed', 'assets/bed.png');

        Player.preloadAssets(this);
    }

    override create(): void {
        super.create();

        this.spawnPlayer();

        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('BedroomWorld');

        this.spawnQuestionIndicators();

        this.triggerSystem = new TileTriggerSystem(
            this.grid,
            BEDROOM_TRIGGERS,
            this.player.entityId,
        );

        this._onTrigger = ({ triggerId }) => {
            if (triggerId === 'portal_to_home') {
                this.scene.start('HomeWorld');
            }
        };

        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);
    }

    private readonly _onQuestionAnswered = ({ correct }: { questionId: string; correct: boolean; attempts: number; stars: number }) => {
        if (correct) this.updateIndicators();
    };

    override update(_time: number, delta: number): void {
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
    }

    override shutdown(): void {
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.off(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);
        this.dialogManager?.destroy();
        this.dialogUI?.destroy();
        this.questionUI?.destroy();
        this.triggerSystem?.destroy();
        this.triggerSystem = null;
        this.analogStick?.destroy();
        this.questionIndicators.forEach(e => e.indicator.destroy());
        this.questionIndicators = [];
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
                const cell = cellAt(tx, ty);
                const triggerId = TILE_TRIGGER_MAP[cell];
                if (!triggerId) continue;

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
                this.questionIndicators.push({ indicator, triggerId });
            }
        }
    }

    // Sembunyikan indikator hanya kalau semua soal untuk triggerId itu sudah selesai
    private updateIndicators(): void {
        for (const entry of this.questionIndicators) {
            if (this.dialogManager.isTileComplete(entry.triggerId)) {
                entry.indicator.setVisible(false);
            }
        }
    }

    // =========================================================================
    // DECORATIONS
    // =========================================================================

    private placeDecorations(): void {
        const placement: DecorConfig[] = [
            { tx: 2, ty: 1, texture: 'desk', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
            { tx: 2, ty: 2, texture: 'chair', ox: 0.2, oy: 1.45, offsetY: 0, scale: 0.5 },
            { tx: 1, ty: 5, texture: 'bed', ox: 0.5, oy: 1, offsetY: 0, scale: 1 },
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

        for (let tx = 0; tx <= 8; tx++) {
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
                if (deco) (deco as any)._isoDepth = depth;
            }
        }

        for (let ty = 0; ty <= 7; ty++) {
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
                if (deco) (deco as any)._isoDepth = depth;
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
            ty: 4,
            gridUnit: this.gridUnit,
            analogStick: this.analogStick,
            walkabilityChecker: (tx, ty) => this.isWalkable(tx, ty),
        });

        this.player.initSprite();
        this.placeEntityAtTile(3, 4, this.player);
    }
}