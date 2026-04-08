import Notification from "../ui/notification";
var recentNotificationHasBeenShown = false;

class DebugConsole {
    constructor() {
        // Store original console methods
        this.originalLog = console.log;
        this.originalWarn = console.warn;
        this.originalError = console.error;
        
        // Message storage
        this.messages = [];
        this.maxMessages = 200;
        this.autoScroll = true;
        this.scrollBottomThreshold = 24;
        
        // Start intercepting immediately
        this.startIntercepting();
        
        // UI elements
        this.container = null;
        this.messageList = null;
        this.scrollStatus = null;
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

            const errormsg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
            const truncatedmsg = errormsg.length > 300 ? errormsg.slice(0, 300) + "... (see console for full error)" : errormsg;

            if (errormsg.toLowerCase().includes('error getting location') ||
                errormsg.toLowerCase().includes('error loading chunk listing') ||
                errormsg.toLowerCase().includes('fetch timeout')) {
                return;
            }

            if (!recentNotificationHasBeenShown) {
                new Notification(
                    "Error",
                    truncatedmsg,
                    'exclamation-circle',
                    'ff2121',
                    10000
                );
            }

            recentNotificationHasBeenShown = true;
            setTimeout(() => {
                recentNotificationHasBeenShown = false;
            }, 10000);
        };
    }
    
    captureMessage(type, args) {
        const timestamp = new Date().toLocaleTimeString();
        const message = this.formatMessageParts(args);
        
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

    formatMessageParts(args) {
        if (!Array.isArray(args) || args.length === 0) {
            return [{ text: '', style: '' }];
        }

        const [firstArg, ...restArgs] = args;
        if (typeof firstArg !== 'string' || !firstArg.includes('%c')) {
            return [{ text: this.stringifyArgs(args), style: '' }];
        }

        const parts = [];
        const segments = firstArg.split('%c');
        const styleArgs = [];
        let remainingArgs = [...restArgs];

        for (let i = 1; i < segments.length; i++) {
            styleArgs.push(typeof remainingArgs[0] === 'string' ? remainingArgs.shift() : '');
        }

        for (let i = 0; i < segments.length; i++) {
            if (!segments[i]) continue;
            parts.push({
                text: segments[i],
                style: i === 0 ? '' : this.sanitizeInlineStyle(styleArgs[i - 1]),
            });
        }

        if (remainingArgs.length > 0) {
            parts.push({ text: ` ${this.stringifyArgs(remainingArgs)}`, style: '' });
        }

        return parts.length > 0 ? parts : [{ text: this.stringifyArgs(args), style: '' }];
    }

    stringifyArgs(args) {
        return args.map((arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (error) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    sanitizeInlineStyle(styleText) {
        if (typeof styleText !== 'string') return '';

        const allowed = new Set([
            'background',
            'background-color',
            'border',
            'border-color',
            'border-radius',
            'color',
            'display',
            'font-style',
            'font-weight',
            'font-size',
            'margin',
            'margin-left',
            'margin-right',
            'padding',
            'text-decoration',
            'text-transform',
        ]);

        return styleText
            .split(';')
            .map((rule) => rule.trim())
            .filter(Boolean)
            .map((rule) => {
                const separatorIndex = rule.indexOf(':');
                if (separatorIndex === -1) return '';

                const property = rule.slice(0, separatorIndex).trim().toLowerCase();
                const value = rule.slice(separatorIndex + 1).trim();
                if (!allowed.has(property) || /url\(|expression\(|javascript:/i.test(value)) {
                    return '';
                }

                return `${property}: ${value}`;
            })
            .filter(Boolean)
            .join('; ')
            .replace('%s', '');
    }

    isNearBottom() {
        if (!this.messageList) return true;
        const distanceFromBottom = this.messageList.scrollHeight - this.messageList.scrollTop - this.messageList.clientHeight;
        return distanceFromBottom <= this.scrollBottomThreshold;
    }

    handleScroll() {
        this.autoScroll = this.isNearBottom();
        this.updateScrollStatus();
    }

    updateScrollStatus() {
        if (!this.scrollStatus) return;

        this.scrollStatus.textContent = this.autoScroll ? 'Autoscroll enabled' : 'Scroll locked';
        this.scrollStatus.style.color = this.autoScroll ? '#00af00' : '#ffcc00';
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
            color: #27beff;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
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
            color: #27beff;
        `;

        this.scrollStatus = document.createElement('div');
        this.scrollStatus.style.cssText = `
            margin-left: 12px;
            font-size: 0.85em;
            color: #6ee7b7;
        `;

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.appendChild(title);
        titleContainer.appendChild(this.scrollStatus);
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: #333;
            color: #27beff;
            border: 1px solid #27beff;
            padding: 5px 10px;
            cursor: pointer;
            font-size: 1em;
        `;
        closeBtn.addEventListener('click', () => this.hide());
        
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = `
            background: #333;
            width: auto;
            color: #27beff;
            border: 1px solid #27beff;
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
        
        header.appendChild(titleContainer);
        header.appendChild(buttonContainer);
        
        // Create message list
        this.messageList = document.createElement('div');
        this.messageList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            font-size: 0.9em;
            line-height: 1.4;
        `;
        this.messageList.addEventListener('scroll', () => this.handleScroll());
        
        this.container.appendChild(header);
        this.container.appendChild(this.messageList);
        document.body.appendChild(this.container);
        this.autoScroll = true;
        this.updateScrollStatus();
        
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
        this.scrollStatus = null;
    }
    
    clear() {
        this.messages = [];
        this.updateMessageList();
    }
    
    updateMessageList() {
        if (!this.messageList) return;

        const scrollBottomOffset = this.messageList.scrollHeight - this.messageList.scrollTop;
        
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
            timestamp.style.fontFamily = "'Courier New', monospace";
            
            const type = document.createElement('span');
            type.textContent = `[${msg.type.toUpperCase()}] `;
            type.style.color = this.getColorForType(msg.type);
            type.style.fontWeight = 'bold';
            type.style.fontFamily = "'Courier New', monospace";
            
            const message = document.createElement('span');
            message.style.color = '#ccc';

            msg.message.forEach((part) => {
                const partSpan = document.createElement('span');
                partSpan.textContent = part.text;
                if (part.style) {
                    partSpan.style.cssText = part.style;
                    partSpan.style.fontFamily = "'Courier New', monospace";
                }
                message.appendChild(partSpan);
            });
            
            div.appendChild(timestamp);
            div.appendChild(type);
            div.appendChild(message);
            
            this.messageList.appendChild(div);
        });
        
        if (this.autoScroll) {
            this.messageList.scrollTop = this.messageList.scrollHeight;
        } else {
            this.messageList.scrollTop = Math.max(0, this.messageList.scrollHeight - scrollBottomOffset);
        }

        this.updateScrollStatus();
    }
    
    getColorForType(type) {
        switch (type) {
            case 'log': return '#27beff';
            case 'warn': return '#ffaa00';
            case 'error': return '#ff0000';
            default: return '#27beff';
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
