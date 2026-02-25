/*

> menu.js
This module handles the menu component.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import about from '../../components/about.js';
import Settings from './settings.js';
import debugConsole from './debug_console.js';

class Menu {
    // Constructor function
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.menu = document.createElement('div');
        this.menu.classList.add('menu');
        this.menu.classList.add('menu-hidden');

        // Create menu header with close button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

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

        // Create menu items
        const menuList = document.createElement('ul');
        const menuItems = [
            { label: 'Settings', icon: 'settings', onClick: () => { this.close(); setTimeout(() => { new Settings().showSettingsMenu(); }, 250); } },
            { label: 'About', icon: 'info-circle', onClick: () => { this.close(); setTimeout(() => { about(); }, 250); } },
            { label: 'Help', icon: 'help-circle', onClick: () => { window.location = 'https://wiki.sparkradar.app/'; } },
            { label: 'Switch to Lite Version', icon: 'logout', onClick: () => { window.location = 'https://lite.sparkradar.app/'; } },
            { label: 'Buy Me a Coffee', icon: 'cup', onClick: () => { window.location = 'https://www.buymeacoffee.com/tgranz'; } },
        ];


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

        this.menu.appendChild(menuList);
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