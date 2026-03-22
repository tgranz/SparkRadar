/*

> debug_console.js
Secret debug console for mobile debugging
Shows captured logs, warnings, and errors

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

class DebugConsole {
    constructor() {
        // Store original console methods
        this.originalLog = console.log;
        this.originalWarn = console.warn;
        this.originalError = console.error;
        
        // Message storage
        this.messages = [];
        this.maxMessages = 200;
        
        // Start intercepting immediately
        this.startIntercepting();
        
        // UI elements
        this.container = null;
        this.messageList = null;
        this.isVisible = false;
    }
    
    startIntercepting() {
        const self = this;
        
        console.log = function(...args) {
            self.originalLog.apply(console, args);
            self.captureMessage('log', args);
        };
        
        console.warn = function(...args) {
            self.originalWarn.apply(console, args);
            self.captureMessage('warn', args);
        };
        
        console.error = function(...args) {
            self.originalError.apply(console, args);
            self.captureMessage('error', args);
        };
    }
    
    captureMessage(type, args) {
        const timestamp = new Date().toLocaleTimeString();
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        this.messages.push({ type, timestamp, message });
        
        // Limit message storage
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        
        // Update UI if visible
        if (this.isVisible && this.messageList) {
            this.updateMessageList();
        }
    }
    
    show() {
        if (this.isVisible) return;
        
        this.isVisible = true;
        
        // Create container
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            bottom: 10px;
            background: rgba(0, 0, 0, 0.95);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            border: 1px solid #333;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        `;
        
        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 10px;
            background: #1a1a1a;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const title = document.createElement('div');
        title.textContent = 'Debug Console';
        title.style.cssText = `
            font-weight: bold;
            color: #00ff00;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: #333;
            color: #00ff00;
            border: 1px solid #00ff00;
            padding: 5px 10px;
            cursor: pointer;
            font-size: 14px;
        `;
        closeBtn.addEventListener('click', () => this.hide());
        
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = `
            background: #333;
            color: #00ff00;
            border: 1px solid #00ff00;
            padding: 5px 10px;
            cursor: pointer;
            margin-right: 10px;
        `;
        clearBtn.addEventListener('click', () => this.clear());
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'row';
        buttonContainer.appendChild(clearBtn);
        buttonContainer.appendChild(closeBtn);
        
        header.appendChild(title);
        header.appendChild(buttonContainer);
        
        // Create message list
        this.messageList = document.createElement('div');
        this.messageList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            font-size: 10px;
            line-height: 1.4;
        `;
        
        this.container.appendChild(header);
        this.container.appendChild(this.messageList);
        document.body.appendChild(this.container);
        
        // Populate with existing messages
        this.updateMessageList();
    }
    
    hide() {
        if (!this.isVisible) return;
        
        this.isVisible = false;
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.messageList = null;
    }
    
    clear() {
        this.messages = [];
        this.updateMessageList();
    }
    
    updateMessageList() {
        if (!this.messageList) return;
        
        this.messageList.innerHTML = '';
        
        this.messages.forEach(msg => {
            const div = document.createElement('div');
            div.style.cssText = `
                margin-bottom: 5px;
                padding: 5px;
                border-left: 3px solid ${this.getColorForType(msg.type)};
                background: rgba(255, 255, 255, 0.05);
                word-wrap: break-word;
                white-space: pre-wrap;
            `;
            
            const timestamp = document.createElement('span');
            timestamp.textContent = `[${msg.timestamp}] `;
            timestamp.style.color = '#666';
            
            const type = document.createElement('span');
            type.textContent = `[${msg.type.toUpperCase()}] `;
            type.style.color = this.getColorForType(msg.type);
            type.style.fontWeight = 'bold';
            
            const message = document.createElement('span');
            message.textContent = msg.message;
            message.style.color = '#ccc';
            
            div.appendChild(timestamp);
            div.appendChild(type);
            div.appendChild(message);
            
            this.messageList.appendChild(div);
        });
        
        // Auto-scroll to bottom
        this.messageList.scrollTop = this.messageList.scrollHeight;
    }
    
    getColorForType(type) {
        switch (type) {
            case 'log': return '#00ff00';
            case 'warn': return '#ffaa00';
            case 'error': return '#ff0000';
            default: return '#00ff00';
        }
    }
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

// Create singleton instance
const debugConsole = new DebugConsole();

export default debugConsole;
