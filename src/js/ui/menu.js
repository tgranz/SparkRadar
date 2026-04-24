/*

> menu.js
This module handles the menu component.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import about from '../frontend/about.js';
import debugConsole from '../frontend/debug_console.js';
import version from '../../VERSION.js';
import EmbedPlayer from '../frontend/activities/embed_player.js';
import Glossary from '../frontend/activities/glossary.js';
import NEXRADStatus from '../frontend/activities/nexradstatus.js';
import { Changelog } from '../frontend/changelog.js';

class Menu {
    // Constructor function
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.menu = document.createElement('div');
        this.menu.classList.add('menu');
        this.menu.classList.add('menu-hidden');

        // Create menu header with close button
        const header = document.createElement('div');
        header.classList.add('menu-header');

        const logo = document.createElement('img');
        logo.src = 'https://lite.sparkradar.app/assets/logo-rounded.webp';

        const title = document.createElement('h2');
        title.innerHTML = 'SparkRadar.app';
        title.id = 'menu-title';

        const closeBtn = document.createElement('button');
        closeBtn.classList.add('menu-close-btn');
        closeBtn.innerHTML = '<i class="ti ti-x"></i>';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(logo);
        header.appendChild(title);
        header.appendChild(closeBtn);
        this.menu.appendChild(header);

        const menuContent = document.createElement('div');
        menuContent.classList.add('menu-content');

        // Create menu items
        const menuList = document.createElement('ul');
        const menuItems = [
            { label: 'Archive Browser (BETA)', icon: 'archive', onClick: () => { this.close(); setTimeout(() => { callbacks.onArchiveBrowser?.(); }, 250); } },
            { label: 'Upload Radar File', icon: 'upload', onClick: () => { this.close(); setTimeout(() => { callbacks.onRadarFileUpload?.(); }, 250); } },
            { label: 'Settings', icon: 'settings', onClick: () => { this.close(); setTimeout(() => { window.settingsInstance.showSettingsMenu(); }, 250); } },
            { label: 'About', icon: 'info-circle', onClick: () => { this.close(); setTimeout(() => { about(); }, 250); } },
            { label: 'Changelog', icon: 'book', onClick: () => { this.close(); setTimeout(() => { new Changelog(); }, 250); } },
            { label: 'Help', icon: 'help-circle', onClick: () => { window.location = 'https://wiki.sparkradar.app/'; } },
        ];

        const activityItems = [
            { icon: 'video', label: 'PiP Embed Player', onClick: () => { new EmbedPlayer(`<p style="color: white; padding: 10px;">Open a YouTube video or livestream, click share > embed > copy; then paste above and click "Go".</p>`); } },
            { icon: 'book', label: 'Glossary', onClick: () => { new Glossary(); } },
            { icon: 'radar-2', label: 'Level-II Status', onClick: () => { new NEXRADStatus(); } },
        ]

        // Before menu items add data selection
        const dataSelectionWrapper = document.createElement('div');
        dataSelectionWrapper.classList.add('menu-data-selection');
        
        const radarMode = document.createElement('button');
        radarMode.classList.add('menu-data-selection-item');
        radarMode.classList.add('active');
        radarMode.innerHTML = `<i class="ti ti-radar-2"></i><span>Radar</span>`;

        const satelliteMode = document.createElement('button');
        satelliteMode.classList.add('menu-data-selection-item');
        satelliteMode.innerHTML = `<i class="ti ti-satellite"></i><span>Satellite</span>`;

        const setMode = (mode) => {
            if (typeof window !== 'undefined') {
                window.appmode = mode === 'satellite' ? 'satellite' : 'radar';
            }
            radarMode.classList.toggle('active', mode === 'radar');
            satelliteMode.classList.toggle('active', mode === 'satellite');
            document.dispatchEvent(new CustomEvent('dataModeChanged', { detail: { mode } }));
        };

        radarMode.addEventListener('click', () => setMode('radar'));
        satelliteMode.addEventListener('click', () => setMode('satellite'));

        menuContent.appendChild(dataSelectionWrapper);
        dataSelectionWrapper.appendChild(radarMode);
        dataSelectionWrapper.appendChild(satelliteMode);

        menuItems.forEach((item, index) => {
            const li = document.createElement('li');
            const div = document.createElement('div');
            div.innerHTML = `<i class="ti ti-${item.icon}"></i> ${item.label}`;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.addEventListener('click', item.onClick);
            
            // Add secret debug console trigger on Settings item
            if (item.label === 'Settings') {
                let longPressTimer = null;
                
                // Long press handler for touch devices
                div.addEventListener('touchstart', (e) => {
                    longPressTimer = setTimeout(() => {
                        e.preventDefault();
                        console.log('[Menu] Opening debug console');
                        this.close();
                        setTimeout(() => debugConsole.toggle(), 100);
                    }, 1000); // 1 second long press
                });
                
                div.addEventListener('touchend', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });
                
                div.addEventListener('touchcancel', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                });
                
                // Right-click handler for desktop
                div.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    console.log('[Menu] Opening debug console');
                    this.close();
                    setTimeout(() => debugConsole.toggle(), 100);
                });
            }
            
            li.appendChild(div);
            menuList.appendChild(li);
        });

        // Activity starter bar
        const activityHeader = document.createElement('div');
        activityHeader.classList.add('menu-header-object');
        activityHeader.textContent = 'Activities';
        menuList.appendChild(activityHeader);

        const activityBar = document.createElement('div');
        activityBar.classList.add('menu-activity-starter-bar');

        activityItems.forEach((item) => {
            const activityButton = document.createElement('button');
            activityButton.type = 'button';
            activityButton.classList.add('menu-activity-starter-item');
            activityButton.innerHTML = `<i class="ti ti-${item.icon}"></i><span>${item.label}</span>`;
            activityButton.addEventListener('click', () => {
                this.close();
                setTimeout(() => item.onClick?.(), 200);
            });
            activityBar.appendChild(activityButton);
        });

        menuList.appendChild(activityBar);

        // External links
        const linksHeader = document.createElement('div');
        linksHeader.classList.add('menu-header-object');
        linksHeader.textContent = 'More Apps';
        menuList.appendChild(linksHeader);

        const wrapper = document.createElement('div');
        wrapper.classList.add('menu-external-links');

        const div = document.createElement('div');
        div.innerHTML = `SparkRadar Lite <i class="ti ti-external-link"></i>`;
        div.title = "Launch SparkRadar Lite"
        div.style.fontWeight = 'bold';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.addEventListener('click', () => { window.location = 'https://lite.sparkradar.app'; });
        wrapper.appendChild(div);

        const div2 = document.createElement('div');
        div2.innerHTML = `SparkDAT <i class="ti ti-external-link"></i> `;
        div2.title = "Launch the SparkDAT (Spark Damage Assessment Toolkit)"
        div2.style.fontWeight = 'bold';
        div2.style.display = 'flex';
        div2.style.alignItems = 'center';
        div2.addEventListener('click', () => { window.location = 'https://dat.sparkradar.app'; });
        wrapper.appendChild(div2);

        menuList.appendChild(wrapper);

        const info = document.createElement('div');
        info.style.fontSize = '0.8em';
        info.style.color = 'rgba(255, 255, 255, 0.7)';
        info.style.marginTop = '20px';
        info.innerHTML = `SparkRadar v${version}`;
        menuList.appendChild(info);
        menuContent.appendChild(menuList);
        this.menu.appendChild(menuContent);
        document.body.appendChild(this.menu);
    }

    open() {
        this.menu.classList.remove('menu-hidden');

        // Remove the dialog if esc is pressed
        this.escListener = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escListener);
    }

    close() {
        this.menu.classList.add('menu-hidden');
        document.removeEventListener('keydown', this.escListener);
    }

    toggle() {
        this.menu.classList.toggle('menu-hidden');
    }
}

// Export the menu class
export default Menu;