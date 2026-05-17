// src/ui/MainMenu.ts

import Phaser from 'phaser';
import { TutorialUI } from './TutorialUI';

const SCENE_KEY = 'MainMenu';
const TRANSITION_MS = 600;

export default class MainMenu extends Phaser.Scene {

    private _overlay: HTMLDivElement | null = null;

    constructor() { super(SCENE_KEY); }

    preload(): void {
        // this.load.image('menu_bg', 'assets/menu_bg.png');
    }

    create(): void {
        this.cameras.main.setBackgroundColor('#000000');
        this._injectFont();
        this._buildUI();
    }

    shutdown(): void {
        this._destroyUI();
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private _injectFont(): void {
        if (document.getElementById('geo-font-press-start')) return;
        const link = document.createElement('link');
        link.id = 'geo-font-press-start';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(link);
    }

    private _buildUI(): void {

        // ── CSS ───────────────────────────────────────────────────────────────

        const style = document.createElement('style');
        style.id = 'geo-mainmenu-styles';
        style.textContent = /* css */`

            @keyframes mm-blink {
                0%, 49% { opacity: 1; }
                50%, 100% { opacity: 0; }
            }
            @keyframes mm-glow-pulse {
                0%, 100% { text-shadow: 0 0 8px #00fff7, 0 0 20px #00fff7, 0 0 40px #00fff7; }
                50%       { text-shadow: 0 0 4px #00fff7, 0 0 10px #00fff7, 0 0 20px #00fff7; }
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
                padding-bottom: 64px;
                box-sizing: border-box;
                overflow: hidden;
                font-family: 'Press Start 2P', monospace, sans-serif;
            }
            #geo-mainmenu::before {
                content: '';
                position: absolute;
                inset: 0;
                background: repeating-linear-gradient(
                    to bottom,
                    transparent 0px, transparent 3px,
                    rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px
                );
                pointer-events: none;
                z-index: 1;
            }
            #geo-mainmenu::after {
                content: '';
                position: absolute;
                left: 0; right: 0;
                height: 60px;
                background: linear-gradient(to bottom, transparent, rgba(0,255,247,0.04), transparent);
                animation: mm-scanline 6s linear infinite;
                pointer-events: none;
                z-index: 2;
            }

            #geo-mainmenu-art {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 3;
                -webkit-mask-image: linear-gradient(to bottom, black 0%, black 50%, transparent 90%);
                mask-image: linear-gradient(to bottom, black 0%, black 50%, transparent 90%);
            }
            #geo-mainmenu-art img {
                max-width: 100%;
                max-height: 70vh;
                object-fit: contain;
                image-rendering: pixelated;
            }

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
                text-shadow: 0 0 6px #ffdd00, 0 0 16px #ffdd00;
                animation: none;
                margin-top: 8px;
            }

            /* ── Wrapper tombol — stack vertikal di tengah ── */
            #geo-mainmenu-actions {
                position: relative;
                z-index: 5;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
            }

            /* ── MAINKAN ── */
            #geo-mainmenu-btn {
                background: transparent;
                border: 3px solid #00fff7;
                color: #00fff7;
                font-family: 'Press Start 2P', monospace, sans-serif;
                font-size: clamp(10px, 2.5vw, 14px);
                letter-spacing: 4px;
                padding: 16px 36px;
                cursor: pointer;
                outline: none;
                box-shadow: 4px 4px 0 #007a73, 8px 8px 0 rgba(0,255,247,0.12);
                transition: color 80ms ease, background-color 80ms ease,
                            box-shadow 80ms ease, transform 80ms ease;
            }
            #geo-mainmenu-btn::before {
                content: '▶ ';
                animation: mm-blink 1s step-end infinite;
            }
            #geo-mainmenu-btn:hover,
            #geo-mainmenu-btn:focus-visible {
                background-color: #00fff7;
                color: #000;
                box-shadow: 4px 4px 0 #007a73, 0 0 24px rgba(0,255,247,0.6);
            }
            #geo-mainmenu-btn:active {
                transform: translate(4px, 4px);
                box-shadow: none;
            }

            /* ── CARA MAIN — lebih kecil dan subtle ── */
            #geo-mainmenu-tutorial {
                background: transparent;
                border: 2px solid #555;
                color: #666;
                font-family: 'Press Start 2P', monospace, sans-serif;
                font-size: clamp(7px, 1.8vw, 10px);
                letter-spacing: 3px;
                padding: 10px 24px;
                cursor: pointer;
                outline: none;
                transition: color 80ms ease, border-color 80ms ease;
            }
            #geo-mainmenu-tutorial:hover,
            #geo-mainmenu-tutorial:focus-visible {
                color: #00fff7;
                border-color: #00fff7;
            }
            #geo-mainmenu-tutorial:active {
                transform: translate(2px, 2px);
            }

            #geo-mainmenu-copy {
                position: absolute;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 5;
                color: #333;
                font-size: 8px;
                letter-spacing: 2px;
                white-space: nowrap;
            }

            #geo-mainmenu.mm-exit {
                animation: mm-fadeout ${TRANSITION_MS}ms ease forwards;
            }
        `;
        document.head.appendChild(style);

        // ── DOM ───────────────────────────────────────────────────────────────

        const overlay = document.createElement('div');
        overlay.id = 'geo-mainmenu';

        const art = document.createElement('div');
        art.id = 'geo-mainmenu-art';
        // const img = document.createElement('img');
        // img.src = 'assets/menu_bg.png';
        // img.alt = 'Geo Adventure';
        // art.appendChild(img);

        const title = document.createElement('div');
        title.id = 'geo-mainmenu-title';
        title.innerHTML = 'GEO<br>ADVENTURE<small>MATEMATIKA UNTUK SEMUA</small>';

        // Wrapper tombol
        const actions = document.createElement('div');
        actions.id = 'geo-mainmenu-actions';

        const btn = document.createElement('button');
        btn.id = 'geo-mainmenu-btn';
        btn.textContent = 'MAINKAN';
        btn.setAttribute('aria-label', 'Mulai bermain');

        const btnTutorial = document.createElement('button');
        btnTutorial.id = 'geo-mainmenu-tutorial';
        btnTutorial.textContent = '? CARA MAIN';
        btnTutorial.setAttribute('aria-label', 'Lihat petunjuk cara bermain');

        actions.appendChild(btn);
        actions.appendChild(btnTutorial);

        const copy = document.createElement('div');
        copy.id = 'geo-mainmenu-copy';
        copy.textContent = '© 2026 DAMAR DIMAS | PGSD UKSW';

        overlay.appendChild(art);
        overlay.appendChild(title);
        overlay.appendChild(actions);
        overlay.appendChild(copy);
        document.body.appendChild(overlay);

        this._overlay = overlay;

        // ── Event handlers ────────────────────────────────────────────────────

        btn.addEventListener('click', () => this._onPlay(), { once: true });

        btnTutorial.addEventListener('click', () => {
            // Buka tutorial dari menu — show() bukan showOnce()
            // agar selalu bisa dibuka ulang dari sini.
            const ui = new TutorialUI();
            ui.show(() => {
                // Tutorial selesai — kembali ke MainMenu, tidak perlu apa-apa.
                // Overlay MainMenu masih ada karena scene belum berpindah.
            });
        });
    }

    private _onPlay(): void {
        const overlay = this._overlay;
        if (!overlay) return;

        overlay.style.pointerEvents = 'none';
        overlay.classList.add('mm-exit');

        setTimeout(() => {
            this.scene.start('BedroomWorld');
        }, TRANSITION_MS);
    }

    private _destroyUI(): void {
        this._overlay?.remove();
        this._overlay = null;
        document.getElementById('geo-mainmenu-styles')?.remove();
    }
}