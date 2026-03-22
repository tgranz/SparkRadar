// https://spotternetwork.docs.apiary.io/#reference/authenticate-spotter

// Interface for Spotter Network API

export default class SpotterNetwork {
    constructor() {
        // Read in the settings
        const snSettings = localStorage.getItem('spotterNetworkSettings') ? JSON.parse(localStorage.getItem('spotterNetworkSettings')) : null;

        // Initialize properties
        this.username = snSettings?.username || null;
        this.password = snSettings?.password || null;
        this.token = snSettings?.token || null;
        this.shareLocation = false; // Default to not sharing location
        this.highAccuracy = false; // Default to extra privacy
        this.lastLocationSent = null;
    }

    get isLoggedIn() {
        return this.token != null;
    }

    _isLocationAllowedBySettings() {
        return window.settingsInstance?.getSetting('enableLocation') !== false;
    }

    async login(username, password) {
        // Use provided credentials if available
        if (username && password) {
            this.username = username;
            this.password = password;
        }

        // See if we have credentials stored
        if (!this.username || !this.password) {
            console.warn('Spotter Network credentials not set. Please enter them in the settings.');
            return false;
        }

        const loginController = new AbortController();
        const loginTimeout = setTimeout(() => loginController.abort(), 5000);

        try {
            const response = await fetch('https://www.spotternetwork.org/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: this.username,
                    password: this.password
                }),
                signal: loginController.signal
            });
            clearTimeout(loginTimeout);

            const data = await response.json();
            if (data.success) {
                this.token = data.id; // No idea why it is called id but it is the token
                localStorage.setItem('spotterNetworkSettings', JSON.stringify({
                    username: this.username,
                    password: this.password,
                    token: this.token
                }));
                console.log('Spotter Network login successful');
                return true;
            } else {
                console.error('Spotter Network login failed:', data.message);
                return false;
            }
        } catch (error) {
            clearTimeout(loginTimeout);
            console.error('Error logging into Spotter Network:', error);
            return false;
        }
    }

    logout() {
        this.token = null;
        this.password = null;
        localStorage.setItem('spotterNetworkSettings', JSON.stringify({
            username: this.username,
            token: null
        }));
        console.log('Spotter Network logged out');
    }

    async _getLocation() {
        return new Promise((resolve, reject) => {
            if (!this._isLocationAllowedBySettings()) {
                reject(new Error('Location services are disabled in settings.'));
                return;
            }

            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser.'));
            } else {
                navigator.geolocation.getCurrentPosition(
                    position => resolve(position),
                    error => reject(error),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }
        });
    }

    async _sendLocation(disable = false) {
        // Disable bypasses safety checks
        if (!disable) {
            if (!this.token) {
                console.warn('Cannot send location: Not logged in to Spotter Network.');
                return;
            }

            if (!navigator.geolocation) {
                console.warn('Cannot send location: Geolocation is not supported by this browser.');
                return;
            }
        }
        
        this._getLocation()
            .then(position => {
                fetch('https://www.spotternetwork.org/positions/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        "id": this.token,
                        "report_at": new Date().toISOString().replace('T', ' ').substring(0, 19), // Format: "YYYY-MM-DD HH:MM:SS"
                        "lat": position.coords.latitude.toFixed(this.highAccuracy ? 6 : 1) || 0,
                        "lon": position.coords.longitude.toFixed(this.highAccuracy ? 6 : 1) || 0,
                        "elev": position.coords.altitude || 0,
                        "mph": position.coords.speed || 0,
                        "dir": position.coords.heading || 0,
                        "active": disable ? 0 : 1, // 0 to disable, 1 to enable
                        "gps": 1
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.lastLocationSent = new Date();
                        console.log('Location sent to Spotter Network successfully');
                    } else {
                        console.error('Failed to send location to Spotter Network:', data.message);
                    }
                })
                .catch(error => {
                    console.error('Error sending location to Spotter Network:', error);
                });
            })
            .catch(error => {
                console.error('Error getting location:', error);
            });
    }

    async validateToken() {
        if (!this.token) return;

        // Test by getting spotter positions
        const validateController = new AbortController();
        const validateTimeout = setTimeout(() => validateController.abort(), 5000);

        try {
            const response = await fetch('https://www.spotternetwork.org/positions', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: this.token
                }),
                signal: validateController.signal
            });
            clearTimeout(validateTimeout);

            if (!response.ok) {
                throw new Error(`Spotter Network token validation failed with status ${response.status}`);
            }
            console.log('Spotter Network token is valid');
        } catch (error) {
            clearTimeout(validateTimeout);
            console.error('Error validating Spotter Network token:', error);
        }
    }

    setLocationSharing(enabled) {
        if (enabled && !this._isLocationAllowedBySettings()) {
            console.warn('Spotter Network location sharing blocked because location services are disabled in settings.');
            this.shareLocation = false;
            clearInterval(this.locationInterval);
            return;
        }

        this.shareLocation = enabled;
        console.log(`Spotter Network location sharing ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            this._sendLocation(); // Send immediately when enabled
            this.locationInterval = setInterval(() => this._sendLocation(), 5 * 60 * 1000); // Then every 5 minutes
        } else {
            this._sendLocation(true); // Send to disable location
            clearInterval(this.locationInterval);
        }
    }

    setHighAccuracy(enabled) {
        this.highAccuracy = enabled;
    }
}