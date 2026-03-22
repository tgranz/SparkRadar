export default class LocationServices {
    constructor({ enabled = true } = {}) {
        this.enabled = false;
        this.latitude = null;
        this.longitude = null;
        this.altitude = null;

        this._watchId = null;

        if (enabled) {
            this.getLocation();
        }
    }

    getLocation() {
        if (this._watchId !== null) {
            return;
        }

        if (navigator.geolocation) {
            this._watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.enabled = true;
                    this.latitude = position.coords.latitude;
                    this.longitude = position.coords.longitude;
                    this.altitude = position.coords.altitude;
                },
                (error) => {
                    console.error('Error getting location:', error);
                    this.enabled = false;
                },
                { enableHighAccuracy: true }
            );
        } else {
            console.error('Geolocation is not supported by this browser.');
            this.enabled = false;
        }
    }

    stopLocation() {
        if (this._watchId !== null) {
            navigator.geolocation.clearWatch(this._watchId);
            this._watchId = null;
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(newState) {
        const shouldEnable = Boolean(newState);

        if (shouldEnable) {
            this.getLocation();
            return;
        }

        this.enabled = false;
        this.latitude = null;
        this.longitude = null;
        this.altitude = null;
        this.stopLocation();
    }
}