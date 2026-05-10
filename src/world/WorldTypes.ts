export type TileNode = {
    tx: number;
    ty: number;
    worldX: number;
    worldY: number;
    base: Phaser.GameObjects.Image;
    occupied: boolean;
    terrain?: string;
    isTroughable: boolean;
};

export type DecorConfig = {
    tx: number;
    ty: number;
    texture: string;
    frame?: string | number;
    ox?: number;         // origin X
    oy?: number;         // origin Y
    offsetX?: number;    // pixel nudge from tile center
    offsetY?: number;
    depthOffset?: number;
    scale?: number;
};
