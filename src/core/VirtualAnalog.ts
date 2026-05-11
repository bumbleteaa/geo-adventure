import Phaser, { Scale } from "phaser";

import VirtualJoystic from "phaser3-rex-plugins/plugins/virtualjoystick.js"
import type { AnalogStick } from "../entities/Player";

// * Layout Constraint
const STICK_X_OFFSET = 100;
const STICK_Y_OFFSET = 100;
const STICK_RADIUS = 50;
const FORCE_MIN = 15;

// * Virtual analog
export class VirtualAnalog implements AnalogStick {
    private readonly Joystick: VirtualJoystic;
    private readonly _scene: Phaser.Scene;
    private _uiCamera!: Phaser.Cameras.Scene2D.Camera;



    constructor(scene: Phaser.Scene, worldRoot: Phaser.GameObjects.Container) {
        const stickX = scene.scale.width - STICK_X_OFFSET;
        const stickY = scene.scale.height - STICK_Y_OFFSET;
        this._scene = scene;

        this._uiCamera = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height);
        this._uiCamera.setScroll(0, 0);
        this._uiCamera.ignore(worldRoot);
        this.Joystick = new VirtualJoystic(scene, {
            x: stickX,
            y: stickY,
            radius: STICK_RADIUS,
            forceMin: FORCE_MIN,
            dir: '8dir',
            fixed: true,
            enable: true,
        });

        scene.cameras.main.ignore(this.Joystick.thumb);
        scene.cameras.main.ignore(this.Joystick.base!);
    }

    getVector(): { x: number; y: number; } {
        const force = this.Joystick.force;
        const angle = Phaser.Math.DegToRad(this.Joystick.angle);

        //Polar conversion to cartesian
        const rawX = Math.cos(angle) * force;
        const rawY = Math.sin(angle) * force;

        const x = Phaser.Math.Clamp(rawX / STICK_RADIUS, -1, 1);
        const y = Phaser.Math.Clamp(rawY / STICK_RADIUS, -1, 1);

        return { x, y };
    }

    getForce(): number {
        return Phaser.Math.Clamp(this.Joystick.force / STICK_RADIUS, 0, 1);
    }

    isActive(): boolean {
        return this.Joystick.pointer !== null && this.Joystick.force > FORCE_MIN;

    }

    public setVisible(value: boolean): void {
        this.Joystick.setVisible(value);
    }



    public destroy(): void {
        this.Joystick.destroy();
    }
}