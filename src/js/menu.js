/*

> menu.js
This module handles the menu component.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

class Menu {
    // Constructor function
    constructor() {
        this.menu = document.createElement('div');
        this.menu.id = 'menu';
        this.menu.classList.add('hidden');

        // Create menu header with close button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const title = document.createElement('h2');
        title.textContent = 'Menu';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'menu-close-btn';
        closeBtn.innerHTML = '<i class="ti ti-x"></i>';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this.menu.appendChild(header);

        // Create menu items
        const menuList = document.createElement('ul');
        const menuItems = [
            { label: 'Home', href: '#' },
            { label: 'Settings', href: '#' },
            { label: 'Weather Data', href: '#' },
            { label: 'Alerts', href: '#' },
            { label: 'About', href: '#' },
            { label: 'Help', href: '#' },
        ];

        menuItems.forEach(item => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;
            li.appendChild(a);
            menuList.appendChild(li);
        });

        this.menu.appendChild(menuList);
        document.body.appendChild(this.menu);
    }

    open() {
        this.menu.classList.remove('hidden');
    }

    close() {
        this.menu.classList.add('hidden');
    }

    toggle() {
        this.menu.classList.toggle('hidden');
    }
}

// Export the menu class
export default Menu;