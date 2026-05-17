import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { IsoMath } from '../core/IsoMath';
import type { TileNode, DecorConfig } from './WorldTypes';
import { EventBus, GameEvent } from '../core/EventBus';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import { DialogUI } from '../ui/DialogUI';
import { QuestionUI } from '../ui/QuestionUI';
import { DialogManager } from '../core/DialogManager';
import { HudUI } from '../ui/HudUI';
import { WorldCompleteUI } from '../ui/WorldCompleteUI';

// =============================================================================
// TILE MAP — 11×11
// =============================================================================

const HOME_MAP: string[][] = [
    // tx:  0    1    2    3    4    5    6    7    8    9   10
    /* ty 0 */['NF', 'NF', 'NF', 'G', 'G', 'NF', 'NF', 'NF', 'NF', 'NF', 'G'],
    /* ty 1 */['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
    /* ty 2 */['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
    /* ty 3 */['FL', 'FL', 'G', 'G', 'G', 'G', 'G', 'F', 'F', 'F', 'G'],
    /* ty 4 */['FL', 'FL', 'G', 'G', 'G', 'G', 'G', 'F', 'F', 'F', 'G'],
    /* ty 5 */['FL', 'FL', 'G', 'FL', 'FL', '<', 'G', 'F', 'F', 'F', 'G'],
    /* ty 6 */['P1', 'P1', 'P2', 'P1', 'P1', 'P2', 'P2', 'P1', 'P1', 'P1', 'P2'],
    /* ty 7 */['>', 'P2', 'P1', 'P2', 'P2', 'P1', 'P2', 'P2', 'Q', 'P2', 'P1'],
    /* ty 8 */['NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'G'],
    /* ty 9 */['NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'NF', 'G'],
    /* ty10 */['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
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
    G: { texture: 'tile', assetPath: 'assets/tile_037.png', walkable: false },
    F: { texture: 'farm-tiles', assetPath: 'assets/tile_025.png', walkable: false },
    FL: { texture: 'flower-base', assetPath: 'assets/tile_035.png', walkable: false },
    NF: { texture: 'natural-fence', assetPath: 'assets/tile_036.png', walkable: false },
    P1: { texture: 'pave-tiles-1', assetPath: 'assets/pave_tiles_1.png', walkable: true },
    P2: { texture: 'pave-tiles-2', assetPath: 'assets/pave_tiles_2.png', walkable: true },
    '>': { texture: 'pave-tiles-2', assetPath: 'assets/pave_tiles_2.png', walkable: true },
    '<': { texture: 'pave-tiles-1', assetPath: 'assets/pave_tiles_1.png', walkable: true },
    Q: { texture: 'pave-tiles-1', assetPath: 'assets/pave_tiles_1.png', walkable: true },
};

// =============================================================================
// TRIGGER REGISTRY
// =============================================================================

const HOME_TRIGGERS: TileTriggerRegistry = {
    '>': 'portal_to_classroom',
    '<': 'portal_to_bedroom',
    'Q': 'home_q',
};

// =============================================================================
// HELPERS
// =============================================================================

const cellAt = (tx: number, ty: number): string =>
    HOME_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

// =============================================================================
// HOME WORLD
// =============================================================================

export default class HomeWorld extends BaseWorld {

    private player!: Player;
    private analogStick!: VirtualAnalog;

    private debugGraphics?: Phaser.GameObjects.Graphics;
    private debugTexts: Phaser.GameObjects.Text[] = [];
    private debugVisible = false;

    private triggerSystem: TileTriggerSystem | null = null;
    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;
    private hud!: HudUI;
    private _onWorldComplete!: (p: { worldKey: string }) => void;

    private questionIndicators: Phaser.GameObjects.Text[] = [];

    private _onTrigger!: (p: { triggerId: string; tx: number; ty: number; entityId: string }) => void;

    constructor() {
        super('HomeWorld');
        this.worldSize = 11;
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


        //Decor asset loader
        this.load.image('flower', 'assets/tile_041.png');
        this.load.image('tree', 'assets/tile_116.png');
        this.load.image('cherry-tree', 'assets/cherry_tree.png');
        this.load.image('flower-bed-1', 'assets/flower_bed_01.png');
        this.load.image('house', 'assets/house.png');
        this.load.image('fence-h', 'assets/fence_h.png');
        this.load.image('fence-v', 'assets/fence_v.png');

        Player.preloadAssets(this);
    }

    override async create(): Promise<void> {
        super.create();

        this.spawnPlayer();
        this.hud = new HudUI();
        this.hud.show();
        this.spawnQuestionIndicators();

        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('HomeWorld', ['home_q']);

        this.triggerSystem = new TileTriggerSystem(
            this.grid,
            HOME_TRIGGERS,
            this.player.entityId,
        );

        this._onTrigger = ({ triggerId }) => {
            if (triggerId === 'portal_to_classroom') {
                this.scene.start('ClassroomWorld');
            } else if (triggerId === 'portal_to_bedroom') {
                this.scene.start('BedroomWorld');
            }
        };

        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);

        this.setupDebugOverlay();
        this.bindDebugToggle();

        this._onWorldComplete = ({ worldKey }) => {
            if (worldKey !== 'HomeWorld') return;
            WorldCompleteUI.show({
                worldName: 'Ruang Kelas',
                onNext: () => this.scene.start('ClassroomWorld'),
                nextLabel: 'Ke Sekolah»',
            });
        };
        EventBus.on(GameEvent.WORLD_COMPLETE, this._onWorldComplete);
    }

    private readonly _onQuestionAnswered = ({ correct }: { questionId: string; correct: boolean; attempts: number; stars: number }) => {
        if (correct) this.updateIndicators();
    };

    override update(_time: number, delta: number): void {
        super.update(_time, delta);
        this.player.tick(delta);
    }

    override shutdown(): void {
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.off(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);
        EventBus.off(GameEvent.WORLD_COMPLETE, this._onWorldComplete);  // ← naik ke sini
        this.dialogManager?.destroy();
        this.dialogUI?.destroy();
        this.questionUI?.destroy();
        this.hud?.destroy();
        this.triggerSystem?.destroy();
        this.triggerSystem = null;
        this.debugTexts.forEach(t => t.destroy());
        this.debugTexts = [];
        this.debugGraphics?.destroy();
        this.questionIndicators.forEach(i => i.destroy());
        this.questionIndicators = [];
        this.analogStick?.destroy();
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
        if (cell === 'G') node.base.setTint(0x5a8a3c);
    }

    protected override buildBaseDecorations(): void {
        super.buildBaseDecorations();
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
        for (const indicator of this.questionIndicators) {
            if (this.dialogManager.isTileComplete('home_q')) {
                indicator.setVisible(false);
            }
        }
    }

    // =========================================================================
    // DECORATIONS
    // =========================================================================

    private placeDecorations(): void {
        const placement: DecorConfig[] = [
            { tx: 7, ty: 4, texture: 'cherry-tree', ox: 0.5, oy: 1, offsetY: -10, scale: 0.7 },
            { tx: 0, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 0, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 1, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 1, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 2, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 2, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 3, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 4, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 5, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 6, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 7, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 7, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 8, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 8, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 9, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 9, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 10, ty: 6, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 3, scale: 1 },
            { tx: 10, ty: 8, texture: 'fence-h', ox: -0.1, oy: 1, offsetY: 8, scale: 1 },
            { tx: 2, ty: 5, texture: 'fence-v', ox: 0.5, oy: 1, offsetY: 6, scale: 1 },
            { tx: 3, ty: 5, texture: 'flower', ox: 0.5, oy: 1, offsetY: 4, scale: 0.5 },
            { tx: 4, ty: 5, texture: 'flower', ox: 0.5, oy: 1, offsetY: 2, scale: 0.5 },
            { tx: 0, ty: 3, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 0, ty: 4, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 0, ty: 5, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 1, ty: 3, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 1, ty: 4, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 1, ty: 5, texture: 'flower-bed-1', ox: 0.5, oy: 1, offsetY: 3, scale: 0.5 },
            { tx: 6, ty: 5, texture: 'house', ox: 0.5, oy: 1, offsetY: -3, scale: 0.5 },
        ];

        for (const config of placement) {
            const deco = this.placeDecoration(config);
            if (deco) deco.setDepth(deco.y);
        }
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

    // =========================================================================
    // DEBUG OVERLAY
    // =========================================================================

    private bindDebugToggle(): void {
        this.input.keyboard
            ?.addKey(Phaser.Input.Keyboard.KeyCodes.D)
            .on('down', () => {
                this.debugVisible = !this.debugVisible;
                this.debugGraphics?.setVisible(this.debugVisible);
                this.debugTexts.forEach(t => t.setVisible(this.debugVisible));
            });
    }

    private setupDebugOverlay(): void {
        this.debugGraphics = this.add.graphics();
        this.debugGraphics.setVisible(false);
        this.entityLayer.add(this.debugGraphics);

        for (let ty = 0; ty < this.worldSize; ty++) {
            for (let tx = 0; tx < this.worldSize; tx++) {
                this.drawDebugTile(tx, ty);
            }
        }

        this.debugTexts.forEach(t => t.setVisible(false));
    }

    private drawDebugTile(tx: number, ty: number): void {
        const info = this.gridHelper.getTileInfo(tx, ty);
        const { x, y } = IsoMath.tileToScreen(tx, ty, this.tileW, this.tileH, this.originX, this.originY);
        const cx = x;
        const cy = y + this.tileH / 2;

        const color = info.isCorner ? 0x7f77dd : info.isBorder ? 0x1d9e75 : 0x888780;
        this.debugGraphics!.fillStyle(color, 0.8).fillCircle(cx, cy, 3);

        const label = this.add.text(cx, cy - 14, `${tx},${ty}`, {
            fontSize: '9px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
            resolution: 2,
        }).setOrigin(0.5, 1).setVisible(false);

        this.debugTexts.push(label);
        this.entityLayer.add(label);

        const mid = Math.floor(this.worldSize / 2);
        if (tx === mid && ty === mid) this.drawCompassArrows(tx, ty, x, y);
    }

    private drawCompassArrows(tx: number, ty: number, sx: number, sy: number): void {
        for (const { tx: nx, ty: ny, dir } of this.gridHelper.getNeighborsAll(tx, ty)) {
            const { x: nx2, y: ny2 } = IsoMath.tileToScreen(nx, ny, this.tileW, this.tileH, this.originX, this.originY);
            this.debugGraphics!.lineStyle(1, 0xef9f27, 0.6).lineBetween(sx, sy, nx2, ny2);

            const t = this.add.text((sx + nx2) / 2, (sy + ny2) / 2, dir, {
                fontSize: '8px',
                color: '#cf0000',
                stroke: '#000000',
                strokeThickness: 2,
                resolution: 2,
            }).setOrigin(0.5).setVisible(false);

            this.debugTexts.push(t);
            this.entityLayer.add(t);
        }
    }
}