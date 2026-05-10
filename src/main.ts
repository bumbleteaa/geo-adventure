import 'phaser';
import MeadowWorld from './world/MeadowWorld';
import HomeWorld from './world/HomeWorld';
import BedroomWorld from './world/BedroomWorld';
import SchoolWorld from './world/SchoolWorld';

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
    scene: [SchoolWorld], // Kita masukin MeadowWorld sebagai scene pertama
    physics: {
        default: 'arcade',
        arcade: {
            debug: false // Set true kalau nanti mau liat hitbox
        }
    }
};

// Inisialisasi Game
new Phaser.Game(config);