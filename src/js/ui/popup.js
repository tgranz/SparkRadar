export default class Popup {
  constructor(htmlContent, options = {}) {
    this.htmlContent = htmlContent;
    this.options = options;
    this.map = null;
    this.lngLat = null;
    this._mapClickListener = null;
    this._outsideClickCloseArmed = false;
    this._outsideClickArmTimer = null;

    const popup = document.createElement('div');
    popup.classList.add('popup');
    popup.style.position = 'absolute';
    popup.style.transform = 'translate(-50%, calc(-100% - 10px))';

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const popupInner = document.createElement('div');
    popupInner.classList.add('popup-inner');
    popupInner.innerHTML = htmlContent;
    popup.appendChild(popupInner);

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

    this._outsideClickCloseArmed = false;
    this._outsideClickArmTimer = setTimeout(() => {
      this._outsideClickCloseArmed = true;
      this._outsideClickArmTimer = null;
    }, 0);

    this._mapClickListener = (event) => {
      if (!this._outsideClickCloseArmed) return;
      const canvas = this.map?.getCanvas?.();
      if (!canvas) return;
      if (event?.originalEvent?.target === canvas) {
        this.removeFromMap();
      }
    };
    map.on('click', this._mapClickListener);
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
    if (this._outsideClickArmTimer) {
      clearTimeout(this._outsideClickArmTimer);
      this._outsideClickArmTimer = null;
    }

    if (this.map && this._mapClickListener) {
      this.map.off('click', this._mapClickListener);
      this._mapClickListener = null;
    }

    this._outsideClickCloseArmed = false;

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
