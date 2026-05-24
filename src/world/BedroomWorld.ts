import BaseWorld from './BaseWorld';
import { Player } from '../entities/Player';
import { VirtualAnalog } from '../core/VirtualAnalog';
import { TileTriggerSystem, type TileTriggerRegistry } from '../core/TileTriggerSystem';
import { EventBus, GameEvent } from '../core/EventBus';
import { DialogUI } from '../ui/DialogUI';
import { QuestionUI } from '../ui/QuestionUI';
import { ExplorationUI } from '../ui/ExplorationUI';
import { TutorialUI } from '../ui/TutorialUI';
import { DialogManager } from '../core/DialogManager';
import { ExplorationManager } from '../core/ExplorationManager';
import { HudUI } from '../ui/HudUI';
import { WorldCompleteUI } from '../ui/WorldCompleteUI';
import type { TileNode, DecorConfig } from './WorldTypes';

// =============================================================================
// TILE MAP — 6×6
// E = exploration trigger (walkable, one-time)
// Q = question trigger (walkable)
// =============================================================================

const BEDROOM_MAP: string[][] = [
    // tx:  0    1    2    3    4    5
    /* ty 0 */['W', 'W', 'W', 'W', 'W', 'W'],
    /* ty 1 */['W', 'F', 'F', 'Q', 'F', 'W'],
    /* ty 2 */['W', 'F', 'E', 'F', 'F', 'W'],  // E di (2,2)
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
    E: { texture: 'floor', assetPath: 'assets/floor_tile.png', walkable: true },
};

const BEDROOM_TRIGGERS: TileTriggerRegistry = {
    '>': 'portal_to_home',
    'Q': 'bedroom_q',
    'E': 'explore_luas',
};

const TILE_TRIGGER_MAP: Record<string, string> = {
    'Q': 'bedroom_q',
    'E': 'explore_luas',
};

const TOPIC_INDICATOR_COLOR: Record<'keliling' | 'luas', string> = {
    keliling: '#f5a623',
    luas: '#4a90e2',
};
const DEFAULT_INDICATOR_COLOR = '#9bd009';

// Exploration tile pakai warna berbeda dari question — ungu
const EXPLORE_INDICATOR_COLOR = '#9b59b6';

const cellAt = (tx: number, ty: number): string =>
    BEDROOM_MAP[ty]?.[tx] ?? DEFAULT_CELL;

const defOf = (cell: string): TileDef =>
    TILE_DEFS[cell] ?? TILE_DEFS[DEFAULT_CELL]!;

interface IndicatorEntry {
    indicator: Phaser.GameObjects.Text;
    triggerId: string;
    tileType: 'Q' | 'E';
}

export default class BedroomWorld extends BaseWorld {

    private player!: Player;
    private analogStick!: VirtualAnalog;
    private triggerSystem: TileTriggerSystem | null = null;

    private dialogUI!: DialogUI;
    private questionUI!: QuestionUI;
    private dialogManager!: DialogManager;

    private explorationUI!: ExplorationUI;
    private explorationManager!: ExplorationManager;

    private hud!: HudUI;
    private _onWorldComplete!: (p: { worldKey: string }) => void;

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
        console.log('player spawn at:', this.player.tileX, this.player.tileY);

        // ── Question system ───────────────────────────────────────────────────
        this.dialogUI = new DialogUI();
        this.questionUI = new QuestionUI();
        this.dialogManager = new DialogManager(this.dialogUI, this.questionUI);
        this.dialogManager.init('BedroomWorld', ['bedroom_q']).then(() => {
            if (!this.scene.isActive('BedroomWorld')) return;  // ← guard
            this.spawnQuestionIndicators();
        });

        // ── Exploration system ────────────────────────────────────────────────
        this.explorationUI = new ExplorationUI();
        this.explorationManager = new ExplorationManager(this.explorationUI);
        this.explorationManager.init(['explore_luas'], () => {
            this.updateIndicators();
        }).then(() => {
            if (!this.scene.isActive('BedroomWorld')) return;  // ← guard
            this.spawnExplorationIndicators();
        });

        this.triggerSystem = new TileTriggerSystem(
            this.grid,
            BEDROOM_TRIGGERS,
            this.player.entityId,
        );

        this._onTrigger = ({ triggerId }) => {
            console.log('trigger fired:', triggerId);
            if (triggerId === 'portal_to_home') {
                this.scene.start('HomeWorld');
            }
        };

        EventBus.on(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        EventBus.on(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);

        this.game.canvas.focus();
        TutorialUI.showOnce(() => { this.game.canvas.focus(); });

        this.hud = new HudUI();
        this.hud.show();

        this._onWorldComplete = ({ worldKey }) => {
            if (worldKey !== 'BedroomWorld') return;
            WorldCompleteUI.show({
                worldName: 'Kamar',
                onNext: () => this.scene.start('HomeWorld'),
                nextLabel: 'Ke Halaman Rumah »',
            });
        };
        EventBus.on(GameEvent.WORLD_COMPLETE, this._onWorldComplete);
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
        console.log('[BW.shutdown] before off | count:', EventBus.listenerCount(GameEvent.TILE_TRIGGER_ENTERED));
        EventBus.off(GameEvent.TILE_TRIGGER_ENTERED, this._onTrigger);
        console.log('[BW.shutdown] after off  | count:', EventBus.listenerCount(GameEvent.TILE_TRIGGER_ENTERED));

        EventBus.off(GameEvent.QUESTION_ANSWERED, this._onQuestionAnswered);

        this.dialogManager?.destroy();
        this.dialogUI?.destroy();
        this.questionUI?.destroy();

        this.explorationManager?.destroy();
        this.explorationUI?.destroy();

        this.triggerSystem?.destroy();
        this.triggerSystem = null;

        this.analogStick?.destroy();
        this.questionIndicators.forEach(e => e.indicator.destroy());
        this.questionIndicators = [];

        EventBus.off(GameEvent.WORLD_COMPLETE, this._onWorldComplete);
        this.hud.destroy();
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

    // INDICATORS
    private spawnQuestionIndicators(): void {
        for (let ty = 0; ty < this.worldSize; ty++) {
            for (let tx = 0; tx < this.worldSize; tx++) {
                const cell = cellAt(tx, ty);
                if (cell !== 'Q') continue;

                const triggerId = TILE_TRIGGER_MAP[cell];
                const tile = this.getTileNode(tx, ty);
                if (!tile || !triggerId) continue;

                const topic = this.dialogManager.getTopicForTrigger(triggerId);
                const color = topic ? TOPIC_INDICATOR_COLOR[topic] : DEFAULT_INDICATOR_COLOR;

                const indicator = this._makeIndicator(tile, '!', color);
                this.questionIndicators.push({ indicator, triggerId, tileType: 'Q' });
            }
        }
    }

    /**
     * Exploration indicators — ungu, pakai '?' sebagai tanda eksplorasi.
     * Muncul setelah explorationManager.init() selesai.
     */
    private spawnExplorationIndicators(): void {
        for (let ty = 0; ty < this.worldSize; ty++) {
            for (let tx = 0; tx < this.worldSize; tx++) {
                const cell = cellAt(tx, ty);
                if (cell !== 'E') continue;

                const triggerId = TILE_TRIGGER_MAP[cell];
                const tile = this.getTileNode(tx, ty);
                if (!tile || !triggerId) continue;

                const indicator = this._makeIndicator(tile, '?', EXPLORE_INDICATOR_COLOR);
                this.questionIndicators.push({ indicator, triggerId, tileType: 'E' });
            }
        }
    }

    private _makeIndicator(
        tile: TileNode,
        char: string,
        color: string,
    ): Phaser.GameObjects.Text {
        const indicator = this.add.text(
            tile.worldX,
            tile.worldY + 12,
            char,
            {
                fontSize: '14px',
                fontFamily: 'monospace',
                color: '#ffffff',
                backgroundColor: color,
                padding: { x: 5, y: 2 },
                resolution: 2,
            }
        )
            .setOrigin(0.5, 1)
            .setDepth(10_000);

        this.entityLayer.add(indicator);
        return indicator;
    }

    private updateIndicators(): void {
        console.log('[updateIndicators] total entries:', this.questionIndicators.length);
        for (const entry of this.questionIndicators) {
            const done = entry.tileType === 'Q'
                ? this.dialogManager.isTileComplete(entry.triggerId)
                : this.explorationManager.isComplete(entry.triggerId);
            console.log(' entry:', entry.triggerId, '| tileType:', entry.tileType, '| done:', done);
            if (done) entry.indicator.setVisible(false);
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
        const NE_OFFSET_X = 8, NE_OFFSET_Y = 13;
        const NW_OFFSET_X = -8, NW_OFFSET_Y = 16;

        const getIsoDepth = (tx: number, ty: number, level: number) =>
            (tx + ty) * 10 + level;

        for (let tx = 0; tx <= 8; tx++) {
            for (let level = 0; level < LEVELS; level++) {
                const depth = getIsoDepth(tx, 0, level);
                const deco = this.placeWallDeco({
                    tx, ty: 0, texture: 'wall_ne',
                    ox: 0.5, oy: 1, offsetX: NE_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NE_OFFSET_Y, scale: 1,
                });
                if (deco) (deco as any)._isoDepth = depth;
            }
        }

        for (let ty = 0; ty <= 7; ty++) {
            for (let level = 0; level < LEVELS; level++) {
                const depth = getIsoDepth(0, ty, level) + 0.5;
                const deco = this.placeWallDeco({
                    tx: 0, ty, texture: 'wall_nw',
                    ox: 0.5, oy: 1, offsetX: NW_OFFSET_X,
                    offsetY: -(level * WALL_HEIGHT) + NW_OFFSET_Y, scale: 1,
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