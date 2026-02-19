export default class Popup {
  constructor(htmlContent, options = {}) {
    this.htmlContent = htmlContent;
    this.options = options;

    const popup = document.createElement('div');
    popup.classList.add('popup');
    popup.innerHTML = htmlContent;

    this.popup = popup;
  }

  get() {
    return this.popup;
  }

  addToMap(map) {
    map.getContainer().appendChild(this.popup);
  }

  removeFromMap() {
    if (this.popup.parentNode) {
      this.popup.parentNode.removeChild(this.popup);
    }
  }
}
