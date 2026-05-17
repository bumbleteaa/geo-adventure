import 'phaser';
import SchoolWorld from './world/SchoolWorld';
import HomeWorld from './world/HomeWorld';
import BedroomWorld from './world/BedroomWorld';
import ClassroomWorld from './world/ClassroomWorld';
import MainMenu from './ui/MainMenu';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container', // Pastikan ada <div id="game-container"> di index.html
    pixelArt: true,           // WAJIB: Biar aset 32px lo tetep tajam, gak blur
    backgroundColor: '#6990b8', // Langit malam Deep Purple
    scale: {
        mode: Phaser.Scale.RESIZE, // Biar pas di semua ukuran layar HP
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MainMenu, BedroomWorld, HomeWorld, ClassroomWorld], // Kita masukin MeadowWorld sebagai scene pertama
    physics: {
        default: 'arcade',
        arcade: {
            debug: false // Set true kalau nanti mau liat hitbox
        }
    }
};

// Inisialisasi Game
new Phaser.Game(config);