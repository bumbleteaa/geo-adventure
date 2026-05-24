import 'phaser';
import HomeWorld from './world/HomeWorld';
import BedroomWorld from './world/BedroomWorld';
import ClassroomWorld from './world/ClassroomWorld';
import MainMenu from './ui/MainMenu';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#6990b8',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BedroomWorld, HomeWorld],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false // Set true kalau nanti mau liat hitbox
        }
    }
};

// Inisialisasi Game
new Phaser.Game(config);