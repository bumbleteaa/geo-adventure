import Phaser from 'phaser';

// =============================================================================
// CONFIG
// =============================================================================

const BGM_KEY = 'bgm';
const BGM_PATH = 'assets/music/kirby.mp3';   // ← ganti path sesuai lokasi file

const DEFAULT_VOLUME = 0.4;   // 0.0 – 1.0

// =============================================================================
// MANAGER
// =============================================================================

class MusicManagerClass {

    private _track: Phaser.Sound.BaseSound | null = null;
    private _started = false;

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    /**
     * Preload file audio.
     * Panggil dari scene.preload() yang pertama kali jalan (MainMenu).
     */
    preload(scene: Phaser.Scene): void {
        // Jangan load ulang kalau sudah ada di cache.
        if (scene.cache.audio.has(BGM_KEY)) return;
        scene.load.audio(BGM_KEY, BGM_PATH);
    }

    /**
     * Mulai putar BGM. Aman dipanggil berkali-kali — hanya play sekali.
     * Harus dipanggil dari event user (klik/tap) agar browser autoplay policy terpenuhi.
     *
     * @param scene  Scene yang sedang aktif saat play pertama kali dipanggil.
     */
    play(scene: Phaser.Scene): void {
        if (this._started) return;
        this._started = true;

        // Buat sound object lewat global sound manager.
        // Object ini tidak ikut destroy saat scene shutdown.
        this._track = scene.sound.add(BGM_KEY, {
            loop: true,
            volume: DEFAULT_VOLUME,
        });

        this._track.play();
    }

    /** Pause BGM (misal: saat dialog penting atau pause menu). */
    pause(): void {
        if (this._track && this._track.isPlaying) {
            (this._track as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).pause();
        }
    }

    /** Resume BGM setelah pause. */
    resume(): void {
        if (this._track && !this._track.isPlaying) {
            (this._track as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).resume();
        }
    }

    /** Atur volume. 0.0 = bisu, 1.0 = penuh. */
    setVolume(vol: number): void {
        if (!this._track) return;
        (this._track as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(
            Math.max(0, Math.min(1, vol))
        );
    }

    /** Stop dan reset — biasanya tidak perlu, musik dimaksudkan terus jalan. */
    stop(): void {
        this._track?.stop();
        this._started = false;
    }
}

// Export satu instance global — tidak perlu instantiasi ulang di manapun.
export const MusicManager = new MusicManagerClass();