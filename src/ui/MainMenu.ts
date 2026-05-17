// src/scenes/MainMenu.ts
//
// Scene pertama yang di-load saat game berjalan.
// Menampilkan layar judul dengan estetika arcade retro 90s via DOM overlay.
//
// CARA PAKAI:
//   Di main.ts, tambahkan MainMenu sebagai scene pertama:
//   scene: [MainMenu, BedroomWorld, HomeWorld, ClassroomWorld]
//
// UNTUK MENAMBAH GAMBAR:
//   Taruh PNG di public/assets/, lalu uncomment bagian
//   "// ── ILUSTRASI ──" di _buildUI() dan isi nama file-nya.

import Phaser from 'phaser';

// =============================================================================
// CONSTANTS
// =============================================================================

const SCENE_KEY = 'MainMenu';

// Durasi fade-out overlay sebelum scene beralih (ms)
const TRANSITION_MS = 600;

// =============================================================================
// SCENE
// =============================================================================

export default class MainMenu extends Phaser.Scene {

    // Referensi ke DOM overlay — disimpan agar bisa di-destroy saat shutdown
    private _overlay: HTMLDivElement | null = null;

    constructor() {
        super(SCENE_KEY);
    }

    // =========================================================================
    // PRELOAD — muat asset gambar kalau sudah ada
    // =========================================================================

    preload(): void {
        // Uncomment baris ini setelah file PNG siap:
        // this.load.image('menu_bg', 'assets/menu_bg.png');
    }

    // =========================================================================
    // CREATE
    // =========================================================================

    create(): void {
        // Latar belakang hitam dari Phaser (canvas di bawah overlay)
        this.cameras.main.setBackgroundColor('#000000');

        this._injectFont();
        this._buildUI();
    }

    // =========================================================================
    // SHUTDOWN — bersihkan DOM agar tidak bocor ke scene lain
    // =========================================================================

    shutdown(): void {
        this._destroyUI();
    }

    // =========================================================================
    // PRIVATE — Font injection
    // =========================================================================

    private _injectFont(): void {
        // Cegah inject duplikat kalau scene di-restart
        if (document.getElementById('geo-font-press-start')) return;

        const link = document.createElement('link');
        link.id = 'geo-font-press-start';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(link);
    }

    // =========================================================================
    // PRIVATE — UI builder
    // =========================================================================

    private _buildUI(): void {
        // ── CSS ──────────────────────────────────────────────────────────────

        const style = document.createElement('style');
        style.id = 'geo-mainmenu-styles';
        style.textContent = /* css */`

            @keyframes mm-blink {
                0%, 49% { opacity: 1; }
                50%, 100% { opacity: 0; }
            }

            @keyframes mm-glow-pulse {
                0%, 100% { text-shadow:
                    0 0 8px  #00fff7,
                    0 0 20px #00fff7,
                    0 0 40px #00fff7; }
                50% { text-shadow:
                    0 0 4px  #00fff7,
                    0 0 10px #00fff7,
                    0 0 20px #00fff7; }
            }

            @keyframes mm-scanline {
                0%   { transform: translateY(-100%); }
                100% { transform: translateY(100vh); }
            }

            @keyframes mm-fadeout {
                to { opacity: 0; }
            }

            #geo-mainmenu {
                position: fixed;
                inset: 0;
                z-index: 2000;
                background: #000;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-end;
                padding-bottom: 80px;
                box-sizing: border-box;
                overflow: hidden;
                font-family: 'Press Start 2P', monospace, sans-serif;
            }

            /* CRT scanline sweep — satu garis tipis yang turun perlahan */
            #geo-mainmenu::before {
                content: '';
                position: absolute;
                inset: 0;
                background: repeating-linear-gradient(
                    to bottom,
                    transparent 0px,
                    transparent 3px,
                    rgba(0, 0, 0, 0.18) 3px,
                    rgba(0, 0, 0, 0.18) 4px
                );
                pointer-events: none;
                z-index: 1;
            }

            /* CRT scanline moving bar */
            #geo-mainmenu::after {
                content: '';
                position: absolute;
                left: 0; right: 0;
                height: 60px;
                background: linear-gradient(
                    to bottom,
                    transparent,
                    rgba(0, 255, 247, 0.04),
                    transparent
                );
                animation: mm-scanline 6s linear infinite;
                pointer-events: none;
                z-index: 2;
            }

            /* ── Area ilustrasi PNG ── */
            #geo-mainmenu-art {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 3;
                /* Fade gradient supaya tombol di bawah tetap terbaca */
                -webkit-mask-image: linear-gradient(
                    to bottom,
                    black 0%,
                    black 50%,
                    transparent 90%
                );
                mask-image: linear-gradient(
                    to bottom,
                    black 0%,
                    black 50%,
                    transparent 90%
                );
            }

            #geo-mainmenu-art img {
                max-width: 100%;
                max-height: 70vh;
                object-fit: contain;
                image-rendering: pixelated; /* jagain estetika pixel art */
            }

            /* ── Judul — tampil kalau belum ada PNG ── */
            #geo-mainmenu-title {
                position: absolute;
                top: 18%;
                left: 50%;
                transform: translateX(-50%);
                z-index: 4;
                text-align: center;
                color: #00fff7;
                font-size: clamp(14px, 3vw, 22px);
                line-height: 2.2;
                letter-spacing: 4px;
                animation: mm-glow-pulse 2.4s ease-in-out infinite;
                white-space: nowrap;
            }

            #geo-mainmenu-title small {
                display: block;
                font-size: 0.45em;
                color: #ffdd00;
                letter-spacing: 6px;
                text-shadow:
                    0 0 6px #ffdd00,
                    0 0 16px #ffdd00;
                animation: none;
                margin-top: 8px;
            }

            /* ── Tombol MAINKAN ── */
            #geo-mainmenu-btn {
                position: relative;
                z-index: 5;
                background: transparent;
                border: 3px solid #00fff7;
                color: #00fff7;
                font-family: 'Press Start 2P', monospace, sans-serif;
                font-size: clamp(10px, 2.5vw, 14px);
                letter-spacing: 4px;
                padding: 16px 36px;
                cursor: pointer;
                outline: none;

                /* Pixel drop-shadow — gaya kotak tanpa border-radius */
                box-shadow:
                    4px  4px 0 #007a73,
                    8px  8px 0 rgba(0, 255, 247, 0.12);

                transition:
                    color            80ms ease,
                    background-color 80ms ease,
                    box-shadow       80ms ease,
                    transform        80ms ease;
            }

            #geo-mainmenu-btn::before {
                content: '▶ ';
                animation: mm-blink 1s step-end infinite;
            }

            #geo-mainmenu-btn:hover,
            #geo-mainmenu-btn:focus-visible {
                background-color: #00fff7;
                color: #000;
                box-shadow:
                    4px  4px 0 #007a73,
                    0 0 24px rgba(0, 255, 247, 0.6);
            }

            #geo-mainmenu-btn:active {
                transform: translate(4px, 4px);
                box-shadow: none;
            }

            /* ── Copyright kecil di paling bawah ── */
            #geo-mainmenu-copy {
                position: absolute;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 5;
                color: #444;
                font-size: 8px;
                letter-spacing: 2px;
                white-space: nowrap;
            }

            /* ── Transisi keluar ── */
            #geo-mainmenu.mm-exit {
                animation: mm-fadeout ${TRANSITION_MS}ms ease forwards;
            }
        `;
        document.head.appendChild(style);

        // ── DOM ───────────────────────────────────────────────────────────────

        const overlay = document.createElement('div');
        overlay.id = 'geo-mainmenu';

        // Area ilustrasi — uncomment img setelah PNG siap
        const art = document.createElement('div');
        art.id = 'geo-mainmenu-art';
        // ── ILUSTRASI ──
        // const img = document.createElement('img');
        // img.src = 'assets/menu_bg.png';
        // img.alt = 'Geo Adventure';
        // art.appendChild(img);

        // Judul — visible kalau belum ada PNG, bisa di-hide setelah PNG ada
        const title = document.createElement('div');
        title.id = 'geo-mainmenu-title';
        title.innerHTML = 'GEO<br>ADVENTURE<small>MATEMATIKA UNTUK SEMUA</small>';

        // Tombol
        const btn = document.createElement('button');
        btn.id = 'geo-mainmenu-btn';
        btn.textContent = 'MAINKAN';
        btn.setAttribute('aria-label', 'Mulai bermain');

        // Copyright
        const copy = document.createElement('div');
        copy.id = 'geo-mainmenu-copy';
        copy.textContent = '© 2026 DAMAR DIMAS | PGSD UKSW';

        overlay.appendChild(art);
        overlay.appendChild(title);
        overlay.appendChild(btn);
        overlay.appendChild(copy);
        document.body.appendChild(overlay);

        this._overlay = overlay;

        // ── Event handler ─────────────────────────────────────────────────────

        btn.addEventListener('click', () => this._onPlay(), { once: true });
    }

    // =========================================================================
    // PRIVATE — Transisi ke BedroomWorld
    // =========================================================================

    private _onPlay(): void {
        const overlay = this._overlay;
        if (!overlay) return;

        // Tambah class exit untuk animasi fade-out
        overlay.classList.add('mm-exit');

        // Setelah animasi selesai, baru pindah scene
        setTimeout(() => {
            this.scene.start('BedroomWorld');
            // shutdown() akan dipanggil otomatis oleh Phaser setelah start()
        }, TRANSITION_MS);
    }

    // =========================================================================
    // PRIVATE — Cleanup
    // =========================================================================

    private _destroyUI(): void {
        this._overlay?.remove();
        this._overlay = null;

        // Hapus style tag agar tidak menumpuk kalau scene di-restart
        document.getElementById('geo-mainmenu-styles')?.remove();
    }
}