// Abstract class for world, which can be extended to create specific worlds
// with their own rooms, items, and interactions.

import Phaser from "phaser";
import { IsoMath } from "../core/IsoMath";
import { GridHelper } from '../core/GridHelper';
import type { TileNode, DecorConfig } from "./WorldTypes";


function isDepthSortable(child: Phaser.GameObjects.GameObject): child is Phaser.GameObjects.Image | Phaser.GameObjects.Sprite {
    return 'setDepth' in child && 'y' in child;
}

export default abstract class BaseWorld extends Phaser.Scene {
    // ! =======================================================================
    // ! CLASS PROPERTIES
    // ! =======================================================================

    protected worldRoot!: Phaser.GameObjects.Container; // container based
    // Layer-layer dalam pembuatan world
    protected groundLayer!: Phaser.GameObjects.Container;
    protected decorLayer!: Phaser.GameObjects.Container;
    protected entityLayer!: Phaser.GameObjects.Container;

    protected worldSize = 13;
    protected gridUnit = 16;

    /**
     * Grid 2D node tile — diisi oleh buildGrid().
     * Konvensi: grid[tx][ty] (column-major), bukan grid[ty][tx].
     * Tile maps di concrete world (mis. SCHOOL_MAP) row-major untuk readability.
     */
    protected grid: TileNode[][] = [];

    protected gridHelper!: GridHelper;

    protected readonly tileW: number = 32;   // lebar tile penuh (pixel)
    protected readonly tileH: number = 16;   // tinggi tile penuh (pixel)
    protected readonly originX: number = 0;  // pixel X titik awal grid
    protected readonly originY: number = 0;  // pixel Y titik awal grid

    constructor(key: string) {
        super(key);
    }

    // ! =======================================================================
    // ! PHASER SCENE LIFECYCLE
    // ! =======================================================================

    // * Object initialization when the scene just get started
    create(): void {
        this.createWorldRoot();
        this.createLayers();
        this.buildGrid();
        this.buildBaseDecorations();
        this.setupCamera();
        this.recenterWorld();
        this.scale.on("resize", this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
        this.gridHelper = new GridHelper(this.worldSize);
        this.gridHelper.setOffset(this.worldRoot.x, this.worldRoot.y);
    }

    // * Per-frame loop for depth sorting (Y-Sorting)
    update(_time: number, _delta: number): void {
        const byY = (a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject): number => {
            const ay = isDepthSortable(a) ? a.y : 0;
            const by = isDepthSortable(b) ? b.y : 0;
            return ay - by;
        };

        this.decorLayer.list.sort(byY);
        this.entityLayer.list.sort(byY);
    }

    // * Empty the resource when the scene just get closed
    shutdown(): void { }

    // ! =======================================================================
    // ! LAYOUT INITIALIZER
    // ! =======================================================================

    // * Main container or root for entire object in concrete world
    protected createWorldRoot(): void {
        this.worldRoot = this.add.container(0, 0);
    }

    // * World hierarchy of layer (ground -> decoration -> entity) in the root
    protected createLayers(): void {
        this.groundLayer = this.add.container(0, 0);
        this.decorLayer = this.add.container(0, 0);
        this.entityLayer = this.add.container(0, 0);

        this.worldRoot.add([this.groundLayer, this.decorLayer, this.entityLayer]);
    }

    // * Coordinate iteration for ground tile building
    protected buildGrid(): void {
        this.grid = [];
        for (let tx = 0; tx < this.worldSize; tx++) {
            for (let ty = 0; ty < this.worldSize; ty++) {
                const { x, y } = this.getLocalTilePosition(tx, ty);

                const tile = this.add.image(x, y, this.getBaseTileTexture(tx, ty));
                const origin = this.getBaseTileOrigin(tx, ty);

                tile.setOrigin(origin.x, origin.y);

                this.applyBaseTileStyle(tile, tx, ty);
                this.groundLayer.add(tile);

                const node: TileNode = {
                    tx,
                    ty,
                    worldX: x,
                    worldY: y,
                    base: tile,
                    occupied: false,
                    terrain: this.getTerrainType(tx, ty),
                    isTroughable: true,
                };

                if (!this.grid[tx]) this.grid[tx] = [];
                this.grid[tx][ty] = node;

                this.onTileCreated(node);
            }
        }
    }

    protected setupCamera(): void {
        this.cameras.main.setZoom(1.5);
    }

    protected recenterWorld(): void {
        const center = this.getWorldCenterLocal();
        this.worldRoot.setPosition(
            this.cameras.main.centerX - center.x,
            this.cameras.main.centerY - center.y
        );
    }

    private handleResize(): void {
        this.recenterWorld();
    }

    private onShutdown(): void {
        this.scale.off("resize", this.handleResize, this);
    }

    // ! =======================================================================
    // ! WORLD COORDINATE SYSTEM
    // ! =======================================================================

    protected getLocalTilePosition(tx: number, ty: number): { x: number; y: number } {
        const cartX = tx * this.gridUnit;
        const cartY = ty * this.gridUnit;
        const isometric = IsoMath.cartToIso(cartX, cartY);

        return { x: isometric.isoX, y: isometric.isoY };
    }

    protected getWorldCenterLocal(): { x: number; y: number } {
        const middlePoint = (this.worldSize - 1) / 2;
        return this.getLocalTilePosition(middlePoint, middlePoint);
    }

    // * Pixel coordinate to tile grid
    public worldToTile(worldX: number, worldY: number): { tx: number; ty: number } {
        // The world coordinate offset normalization
        const localX = worldX - this.worldRoot.x;
        const localY = worldY - this.worldRoot.y;

        const raw = IsoMath.screenToTile(
            localX, localY,
            this.tileW,
            this.tileH,
            this.originX,
            this.originY,
        );
        return {
            tx: Math.round(raw.tx),
            ty: Math.round(raw.ty),
        };
    }

    // * Screen pixel (input touch) to tile grid
    public screenToTile(screenX: number, screenY: number): { tx: number; ty: number } {
        const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);
        return this.worldToTile(worldPoint.x, worldPoint.y);
    }

    // ! =======================================================================
    // ! GRID & NAVIGATION
    // ! =======================================================================

    protected getTileNode(tx: number, ty: number): TileNode | null {
        if (tx < 0 || ty < 0 || tx >= this.worldSize || ty >= this.worldSize) {
            return null;
        }
        return this.grid[tx]?.[ty] ?? null;
    }

    protected markOccupied(tx: number, ty: number, value = true): void {
        const tile = this.getTileNode(tx, ty);
        if (tile) tile.occupied = value;
    }

    protected isOccupied(tx: number, ty: number): boolean {
        const tile = this.getTileNode(tx, ty);
        return tile ? tile.occupied : true;
    }

    // * Can the entity pass the tile?
    public isWalkable(tx: number, ty: number): boolean {
        if (tx < 0 || ty < 0 || tx >= this.worldSize || ty >= this.worldSize) {
            return false;
        }

        const tile = this.getTileNode(tx, ty);
        if (!tile) return false;
        return tile.isTroughable && !tile.occupied;
    }

    // ! =======================================================================
    // ! OBJECT & ENTITY PLACEMENT
    // ! =======================================================================

    protected placeDecoration(config: DecorConfig): Phaser.GameObjects.Image | null {
        const tile = this.getTileNode(config.tx, config.ty);
        if (!tile) return null;

        const object = this.add.image(
            tile.worldX + (config.offsetX ?? 0),
            tile.worldY + this.tileH + (config.offsetY ?? 0),
            config.texture,
            config.frame
        );

        object.setOrigin(config.ox ?? 0.5, config.oy ?? 1);

        if (config.scale !== undefined) {
            object.setScale(config.scale);
        }

        this.decorLayer.add(object);

        return object;
    }

    protected placeEntityAtTile(
        tx: number,
        ty: number,
        entity: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth
    ): void {
        const tile = this.getTileNode(tx, ty);
        if (!tile) return;

        entity.setPosition(tile.worldX, tile.worldY);
        entity.setDepth(entity.y);
        this.entityLayer.add(entity);
    }

    // ! =======================================================================
    // ! OVERRIDEABLE CONFIG (CONCRETE WORLD CONTEXT)
    // ! =======================================================================

    protected getBaseTileTexture(_tx: number, _ty: number): string {
        return "tile";
    }

    protected getBaseTileOrigin(_tx: number, _ty: number): { x: number; y: number } {
        return { x: 0.5, y: 0 };
    }

    protected getTerrainType(_tx: number, _ty: number): string {
        return "ground";
    }

    protected applyBaseTileStyle(
        _tile: Phaser.GameObjects.Image,
        _tx: number,
        _ty: number
    ): void { }

    protected onTileCreated(_tile: TileNode): void { }

    protected buildBaseDecorations(): void { }
}