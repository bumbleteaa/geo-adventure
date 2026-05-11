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
    // tx:  0    1    2    3    4    5    6    7
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
    /* ty 2 */['W', 'F', 'F', 'Q', 'F', 'F', 'F', 'W'],
    /* ty 3 */['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
    /* ty 4 */['W', 'F', 'F', 'F', 'F', 'Q', 'F', 'W'],
    /* ty 5 */['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
    /* ty 6 */['W', 'F', 'F', 'F', 'F', 'F', 'F', 'W'],
    /* ty 7 */['W', 'W', 'W', '>', 'W', 'W', 'W', 'W'],
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

// Q tiles → triggerId → tile_trigger_id di questions.json
const BEDROOM_TRIGGERS: TileTriggerRegistry = {
    '>': 'portal_to_home',
    'Q': 'bedroom_q',        // semua Q pakai triggerId yang sama,
    // bedakan lewat posisi kalau perlu pakai tile berbeda
};

type WallType = 'wall_nw' | 'wall_ne';

const cellAt = (tx: number, ty: number): string =>
    BEDROOM_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

export default class BedroomWorld extends BaseWorld {

    private player!: Player;
    private analogStick!: VirtualAnalog;
    private triggerSystem: TileTriggerSystem | null = null;
    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;

    private _onTrigger!: (p: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    // Indikator '!' di atas Q tile
    private questionIndicators: Phaser.GameObjects.Text[] = [];

    constructor() {
        super('BedroomWorld');
        this.worldSize = 8;
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

        Player.preloadAssets(this);
    }

    override create(): void {
        super.create();

        this.spawnPlayer();
        this.spawnQuestionIndicators();

        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('BedroomWorld');

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

        // Sembunyikan indikator kalau soal sudah selesai
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);
    }

    private readonly _onQuestionAnswered = ({ questionId, correct }: { questionId: string; correct: boolean; attempts: number; stars: number }) => {
        if (correct) this.updateIndicators();
    };

    override update(_time: number, delta: number): void {
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
        this.questionIndicators.forEach(i => i.destroy());
        this.questionIndicators = [];
        super.shutdown();
    }

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
                    tile.worldY - 12,
                    '!',
                    {
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        color: '#ffffff',
                        backgroundColor: '#cc2200',
                        padding: { x: 5, y: 2 },
                        resolution: 2,
                    }
                )
                    .setOrigin(0.5, 1)
                    .setDepth(10_000);

                // Taruh di entityLayer supaya ikut worldRoot transform
                this.entityLayer.add(indicator);
                this.questionIndicators.push(indicator);
            }
        }
    }

    private updateIndicators(): void {
        // Sembunyikan semua indikator yang soalnya sudah selesai
        // Untuk sekarang sembunyikan semua kalau 'bedroom_q' selesai
        // Nanti bisa di-extend per-tile kalau ada multiple trigger ID
        this.questionIndicators.forEach(i => i.setVisible(false));
    }

    // =========================================================================
    // WALL PLACEMENT
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
                const deco = this.placeWallDeco({
                    tx, ty: 0,
                    texture: 'wall_ne',
                    ox: 0.5, oy: 1,
                    offsetX: NE_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NE_OFFSET_Y,
                    scale: 1,
                });
                if (deco) deco.setDepth(getIsoDepth(tx, 0, level));
            }
        }

        for (let ty = 0; ty <= 7; ty++) {
            for (let level = 0; level < LEVELS; level++) {
                const deco = this.placeWallDeco({
                    tx: 0, ty,
                    texture: 'wall_nw',
                    ox: 0.5, oy: 1,
                    offsetX: NW_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NW_OFFSET_Y,
                    scale: 1,
                });
                if (deco) deco.setDepth(getIsoDepth(0, ty, level) + 0.5);
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
            ty: 5,
            gridUnit: this.gridUnit,
            analogStick: this.analogStick,
            walkabilityChecker: (tx, ty) => this.isWalkable(tx, ty),
        });

        this.player.initSprite();
        this.placeEntityAtTile(3, 5, this.player);
    }
}