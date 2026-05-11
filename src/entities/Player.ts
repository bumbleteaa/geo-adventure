// main character controlled by the player, with movement, interaction, and inventory management. The player can move around the world, interact with items and NPCs, and progress through the story. The player will have a simple inventory system to keep track of items they have collected, which can be used to solve puzzles or progress through the story. The player can also have a health or energy system that adds an element of challenge to the game, requiring them to manage their resources carefully as they explore the world and interact with its inhabitants.

/**
 * Player.ts
 * src/entities/Player.ts
 *
 * UNDER THE HOOD — responsibility boundary:
 * Player.ts owns three things only:
 *   1. Reading virtual analog input and translating it to moveInDirection()
 *   2. Loading and playing the correct animation for each direction + state
 *   3. Defining what happens when the player is interacted with (nothing, for now)
 *
 * It does NOT own: tile walkability checks, scene transitions, camera follow.
 * Those belong to BaseWorld and HomeWorld respectively.
 */

import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity';
import { Direction, InteractionResult } from './EntityType';
import type { EntityConfig } from './EntityType';

// ─── Sprite Constants ─────────────────────────────────────────────────────────
// UNDER THE HOOD: centralise all sprite measurements here.
// If your frame size differs, change ONLY these two lines — nothing else breaks.
const FRAME_WIDTH = 48; // pixels per frame, horizontal
const FRAME_HEIGHT = 48; // pixels per frame, vertical

// Spritesheet keys — must match what you pass to this.load.spritesheet() in preload()
const TEXTURE_IDLE = 'player_idle';
const TEXTURE_WALK = 'player_walk';

// UNDER THE HOOD — row index map:
// Each row in the spritesheet is one direction, 4 frames wide.
// Row index starts at 0. This table is the single source of truth
// between the image layout and the animation system.
const DIRECTION_ROW: Record<Direction, number> = {
    [Direction.WEST]: 6,
    [Direction.EAST]: 5,
    [Direction.SOUTH]: 4,
    [Direction.NORTH]: 7,
    [Direction.SOUTH_WEST]: 0,
    [Direction.SOUTH_EAST]: 2,
    [Direction.NORTH_WEST]: 3,
    [Direction.NORTH_EAST]: 1,
};
const FRAMES_PER_ROW = 4;
const ANIM_FRAME_RATE = 8; // frames per second — tune for feel

const MIN_ANIM_SCALE = 0.3;

const animKey = (state: 'idle' | 'walk', dir: Direction): string =>
    `player_${state}_${dir}`;

// ─── Analog Input Interface ───────────────────────────────────────────────────
// UNDER THE HOOD: Player.ts doesn't care how the joystick is implemented —
// physical gamepad, touch virtual stick, or keyboard emulation.
// Anything that satisfies this interface can drive the player.
// Pass it in via PlayerConfig so Player.ts never imports a UI library.
export interface AnalogStick {
    /** Normalised vector, each axis in range [-1, 1] */
    getVector(): { x: number; y: number };
    /** True while the stick is being held beyond the deadzone */
    getForce(): number;
    isActive(): boolean;
}

// Config 
export interface PlayerConfig extends EntityConfig {
    analogStick: AnalogStick;
}

// Player 
export class Player extends BaseEntity {
    private readonly analog: AnalogStick;

    // UNDER THE HOOD: _currentState drives animation switching.
    // We track it here so we don't call playAnim() redundantly every frame —
    // comparing state + direction before playing prevents animation restarts.
    private _currentState: 'idle' | 'walk' = 'idle';

    constructor(config: PlayerConfig) {
        super(config);
        this.analog = config.analogStick;
        // Distinguish player from NPCs at a glance during prototyping
        this.setPlaceholderTint(0x00ffff);
    }

    // =========================================================================
    // ! PHASER ASSET LOADER
    // =========================================================================

    /**
     * Call this from your scene's preload() — NOT from the constructor.
     *
     * UNDER THE HOOD — why static:
     * Assets are loaded by the scene before any entity is instantiated.
     * A static method lets the scene call Player.preloadAssets(this) during
     * preload() without needing a Player instance to exist yet.
     * This keeps the asset key namespace owned by Player.ts, not the scene.
     */
    public static preloadAssets(scene: Phaser.Scene): void {
        scene.load.spritesheet(TEXTURE_IDLE, 'assets/player_idle.png', {
            frameWidth: FRAME_WIDTH,
            frameHeight: FRAME_HEIGHT,
        });
        scene.load.spritesheet(TEXTURE_WALK, 'assets/player_walking.png', {
            frameWidth: FRAME_WIDTH,
            frameHeight: FRAME_HEIGHT,
        });
    }

    /**
     * Call this from your scene's create(), after super.create().
     * Registers all animations and swaps in the real sprite.
     *
     * UNDER THE HOOD — why separate from constructor:
     * Phaser's animation manager requires assets to be fully loaded before
     * animations can be registered. Assets finish loading between preload()
     * and create(). Calling this in the constructor (which runs during create)
     * is fine — but only if preloadAssets() was called in preload() first.
     * The two-step pattern makes that dependency explicit and hard to violate.
     */
    public initSprite(): void {
        this.createAnims();
        // Build the sprite at local (0,0) — relative to the Container.
        // UNDER THE HOOD: The Container is already positioned in world-space.
        // The sprite's position is relative to the container's origin.
        // offsetY = -(FRAME_HEIGHT / 2) lifts the sprite so the character's
        // feet sit on the tile center rather than the sprite's center floating above it.
        const sprite = this.scene.add.sprite(0, -(FRAME_HEIGHT / 2), TEXTURE_IDLE, 0);
        sprite.setScale(0.5);
        this.replaceWithSprite(sprite);
        // Start in idle facing south
        this.playAnim(animKey('idle', Direction.SOUTH));
    }

    // =========================================================================
    // ! TICK — called every frame by the scene's update()
    // =========================================================================

    /* *
    * UNDER THE HOOD — updated pipeline:
     *
     * 1. Read analog vector (screen-space, normalised)
     * 2. Apply isometric transform inside vectorToDirection()
     * 3. Move and switch to walk anim
     * 4. Read force → scale anim playback speed so legs sync with stick push
     *
     * Force scaling: full push (force=1) → timeScale=1.0 (normal speed)
     *               slight push (force≈0) → timeScale=MIN_ANIM_SCALE (slow shuffle)
     * Formula: MIN + force * (1 - MIN)  maps [0,1] → [MIN, 1]
     */
    public tick(delta: number): void {
        if (this.analog.isActive()) {
            const dir = this.vectorToDirection(this.analog.getVector());
            if (dir !== null) {
                const moved = this.moveInDirection(dir);
                if (moved) this.updateAnimState('walk');

                const force = this.analog.getForce();
                const timeScale = MIN_ANIM_SCALE + force * (1 - MIN_ANIM_SCALE);
                this.setAnimTimeScale(timeScale);
            }
        } else {
            // Stick released — entity will finish its current tween,
            // then sit idle. We only switch to idle anim when fully stopped.
            if (!this.isMoving) {
                this.updateAnimState('idle');
                // Reset to normal speed so idle anim doesn't play in slow-mo
                this.setAnimTimeScale(1);
            }
        }
    }

    // =========================================================================
    // ! PLAYER INTERACTION
    // =========================================================================

    /* *
     * UNDER THE HOOD: The player can't be "interacted with" by other entities —
     * the player is the initiator, never the target. Returning PASSIVE signals
     * "I acknowledged the call but have nothing to offer." REJECTED would be
     * semantically wrong here — the player isn't refusing, it just isn't a target.
     */
    protected onInteract(_initiatorId: string): InteractionResult {
        return InteractionResult.PASSIVE;
    }

    // =========================================================================
    // ! ANIMATION HOOKS
    // =========================================================================

    /* *
     * Fires whenever setFacing() changes direction — wired up in BaseEntity.
     *
     * UNDER THE HOOD: We don't call playAnim() directly from tick().
     * Instead, moveInDirection() calls setFacing() which triggers this hook.
     * This means animation changes are driven by facing state, not by movement
     * input directly — the two are decoupled. A cutscene can call setFacing()
     * and animations respond correctly without touching movement logic.
     */
    protected onFacingChanged(dir: Direction): void {
        this.playAnim(animKey(this._currentState, dir));
    }

    // =========================================================================
    // ! PRIVATE HELPERS
    // =========================================================================

    /* *
     * Register all idle and walk animations for every direction.
     *
     * UNDER THE HOOD — frame index math:
     * Phaser numbers spritesheet frames left-to-right, top-to-bottom, from 0.
     * For a 4-column sheet, row N starts at frame (N * 4) and ends at (N * 4 + 3).
     * generateFrameNumbers({ start, end }) produces [start, start+1, ..., end].
     * We generate this range from DIRECTION_ROW[dir] to keep it data-driven —
     * adding a new direction means adding one entry to DIRECTION_ROW, not
     * touching this loop.
     */
    private createAnims(): void {
        const directions = Object.values(Direction) as Direction[];

        for (const dir of directions) {
            const row = DIRECTION_ROW[dir];
            const start = row * FRAMES_PER_ROW;
            const end = start + FRAMES_PER_ROW - 1;

            if (!this.scene.anims.exists(animKey('idle', dir))) {
                this.scene.anims.create({
                    key: animKey('idle', dir),
                    frames: this.scene.anims.generateFrameNumbers(TEXTURE_IDLE, { start, end }),
                    frameRate: ANIM_FRAME_RATE,
                    repeat: -1,
                });
            }

            if (!this.scene.anims.exists(animKey('walk', dir))) {
                this.scene.anims.create({
                    key: animKey('walk', dir),
                    frames: this.scene.anims.generateFrameNumbers(TEXTURE_WALK, { start, end }),
                    frameRate: ANIM_FRAME_RATE,
                    repeat: -1,
                });
            }
        }
    }

    /* *
     * Switch animation state without restarting if already in that state.
     *
     * UNDER THE HOOD — why the guard:
     * playAnim() in BaseEntity passes ignoreIfPlaying: true — so the same
     * animation key won't restart. But if _currentState changes (idle → walk),
     * we need to play the new key. This method updates state then fires the anim,
     * keeping _currentState and the visible animation always in sync.
     */
    private updateAnimState(state: 'idle' | 'walk'): void {
        if (this._currentState === state) return;
        this._currentState = state;
        this.playAnim(animKey(state, this.facing));
    }

    /* *
     * Convert a normalised analog vector to the nearest isometric Direction.
     *
     * UNDER THE HOOD — the 8-sector mapping:
     * We divide the 360° input space into 8 sectors of 45° each.
     * atan2(y, x) gives us the angle in radians from the positive x-axis.
     * We convert to degrees and rotate by 22.5° so sector boundaries fall
     * between the cardinal/diagonal directions — giving each direction an
     * equal 45° window. Returns null if the vector magnitude is below deadzone.
     *
     *         NW   N   NE
     *           \  |  /
     *        W --[you]-- E
     *           /  |  \
     *         SW   S   SE
     */
    private vectorToDirection(vec: { x: number; y: number }): Direction | null {
        const DEADZONE = 0.2;
        if (Math.abs(vec.x) < DEADZONE && Math.abs(vec.y) < DEADZONE) return null;

        // atan2 returns angle from positive-x axis, counter-clockwise
        // We add 22.5° offset so sectors are centred on cardinal directions
        let angle = Phaser.Math.RadToDeg(Math.atan2(vec.y, vec.x));
        angle = Phaser.Math.Wrap(angle + 22.5, 0, 360);

        // Each sector is 45° wide; index 0 = East, going clockwise
        const sector = Math.floor(angle / 45);

        const sectors: Direction[] = [
            Direction.EAST,
            Direction.SOUTH_EAST,
            Direction.SOUTH,
            Direction.SOUTH_WEST,
            Direction.WEST,
            Direction.NORTH_WEST,
            Direction.NORTH,
            Direction.NORTH_EAST,
        ];

        return sectors[sector] ?? Direction.SOUTH;
    }
}