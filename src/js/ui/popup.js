export default class Popup {
  constructor(htmlContent, options = {}) {
    this.htmlContent = htmlContent;
    this.options = options;
    this.map = null;
    this.lngLat = null;

    const popup = document.createElement('div');
    popup.classList.add('popup');
    popup.innerHTML = htmlContent;

    this.popup = popup;
  }

  get() {
    return this.popup;
  }

  addToMap(map) {
    this.map = map;
    map.getContainer().appendChild(this.popup);

    // Remove when escape key is pressed
    this._escapeListener = (e) => {
      if (e.key === 'Escape') {
        this.removeFromMap();
      }
    };

    document.addEventListener('keydown', this._escapeListener);
  }

  setLngLat(lngLat) {
    this.lngLat = lngLat;
    this._updatePosition();
  }

  _updatePosition() {
    if (!this.map || !this.lngLat) return;
    
    const point = this.map.project(this.lngLat);
    const el = this.popup;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
  }

  removeFromMap() {
    if (this.popup.parentNode) {
      this.popup.parentNode.removeChild(this.popup);
    }

    if (this._escapeListener) {
      document.removeEventListener('keydown', this._escapeListener);
      this._escapeListener = null;
    }

    this.map = null;
    this.lngLat = null;
  }
}
