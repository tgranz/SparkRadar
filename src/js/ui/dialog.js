/*

> dialog.js
This module handles dialogs.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

class Dialog {
    // Constructor function
    constructor(title, icon, htmlContent, callbacks = {}, scrollable = false) {
        this.callbacks = callbacks;
        this.dialog = document.createElement('div');
        this.dialog.id = `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // Unique ID
        this.dialog.style.overflow = 'hidden'; // Prevent scrollbars on the dialog itself
        this.dialog.style.display = 'flex';
        this.dialog.style.flexDirection = 'column';
        this.dialog.style.boxSizing = 'border-box';
        this.dialog.style.width = 'calc(100% - 20px)';
        this.dialog.style.height = 'calc(100% - 90px)';
        this.dialog.classList.add('menu'); // Use menu styling
        this.dialog.classList.add('menu-hidden'); // Use same transition as menu

        // Create dialog header with close button
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.flexShrink = '0';
        header.style.marginBottom = '20px';

        const logo = document.createElement('i');
        logo.style.fontSize = '2em';
        logo.classList.add(`ti-${icon}`);
        logo.classList.add('ti');

        const titleObj = document.createElement('h2');
        titleObj.innerHTML = title;
        titleObj.id = 'dialog-title';

        const closeBtn = document.createElement('button');
        closeBtn.classList.add('menu-close-btn');
        closeBtn.classList.add('dialog-close');
        closeBtn.innerHTML = '<i class="ti ti-x"></i>';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(logo);
        header.appendChild(titleObj);
        header.appendChild(closeBtn);
        this.dialog.appendChild(header);

        // Create content
        this.content = document.createElement('div');
        this.content.id = 'dialog-content';
        this.content.innerHTML = htmlContent;
        this.content.style.flex = '1 1 auto';
        this.content.style.minHeight = '0';
        this.content.style.overflowX = 'hidden';
        if (scrollable) {
            this.content.style.overflowY = 'auto';
        } else {
            this.content.style.overflowY = 'hidden';
        }
        this.dialog.appendChild(this.content);

        document.body.appendChild(this.dialog);

        // Trigger animation by removing menu-hidden on next frame
        setTimeout(() => this.dialog.classList.remove('menu-hidden'), 10);

        // Remove the dialog if esc is pressed
        this.escListener = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escListener);
    }

    getContentElement() {
        return this.content;
    }

    close() {
        this.dialog.classList.add('menu-hidden');
        document.removeEventListener('keydown', this.escListener);
        
        // Remove the dialog from DOM after animation completes
        setTimeout(() => {
            if (this.dialog.parentNode) {
                this.dialog.parentNode.removeChild(this.dialog);
            }
        }, 300); // Match the CSS transition duration
    }

    toggle() {
        this.dialog.classList.toggle('menu-hidden');
    }
}

// Export the dialog class
export default Dialog;