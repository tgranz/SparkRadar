import Modal from '../ui/modal.js';
import WeatherInformation from '../backend/weatherinformation.js';

class RightClickHandler {
	constructor(mapInstance, enabled = true) {
		this.enabled = enabled;
		this.longPressDelayMs = 550;
		this.longPressMoveTolerancePx = 10;
		this.menuCloseAnimationMs = 140;
		this.menuCloseTimerId = null;
		this.longPressHandlers = { main: null, split: null };

		this.mapInstance = mapInstance;
		this.menuElement = null;
		this.boundMainContextMenu = null;
		this.boundDualContextMenu = null;
		this.boundCloseOnPointerDown = this._handleOutsidePointerDown.bind(this);
		this.boundCloseOnResize = this.closeMenu.bind(this);
		this.boundCloseOnEscape = (event) => {
			if (event.key === 'Escape') {
				this.closeMenu();
			}
		};

		this.attachMainMap();
		document.addEventListener('pointerdown', this.boundCloseOnPointerDown, true);
		document.addEventListener('touchstart', this.boundCloseOnPointerDown, true);
		window.addEventListener('resize', this.boundCloseOnResize);
		document.addEventListener('keydown', this.boundCloseOnEscape);
	}

	_ensureMenuElement() {
		if (this.menuElement) return;

		const menu = document.createElement('div');
		menu.id = 'map-rightclick-menu';
		menu.className = 'map-rightclick-menu hidden';
		document.body.appendChild(menu);
		menu.addEventListener('click', (event) => {
			event.stopPropagation();
		});
		menu.addEventListener('animationend', (event) => {
			if (event.animationName === 'map-rightclick-pop-in') {
				menu.classList.remove('opening');
				return;
			}

			if (event.animationName === 'map-rightclick-pop-out') {
				menu.classList.remove('closing');
				menu.classList.add('hidden');
			}
		});

		this.menuElement = menu;
	}

	attachMainMap() {
		const map = this.mapInstance?.map;
		if (!map || this.boundMainContextMenu) return;

		this.boundMainContextMenu = (event) => {
			this._showForEvent(event, 'main');
		};

		map.on('contextmenu', this.boundMainContextMenu);
		this._attachLongPressListeners(map, 'main');
	}

	attachDualMap() {
		const dualMap = this.mapInstance?.dualMap;
		if (!dualMap || this.boundDualContextMenu) return;

		this.boundDualContextMenu = (event) => {
			this._showForEvent(event, 'split');
		};

		dualMap.on('contextmenu', this.boundDualContextMenu);
		this._attachLongPressListeners(dualMap, 'split');
	}

	detachDualMap(dualMapRef = null) {
		const dualMap = dualMapRef || this.mapInstance?.dualMap;
		if (!dualMap || !this.boundDualContextMenu) return;

		dualMap.off('contextmenu', this.boundDualContextMenu);
		this._detachLongPressListeners('split');
		this.boundDualContextMenu = null;
		this.closeMenu();
	}

	_attachLongPressListeners(mapRef, target) {
		if (!mapRef || this.longPressHandlers[target]) return;

		const canvas = mapRef.getCanvas?.();
		if (!canvas) return;

		const state = {
			timerId: null,
			startX: 0,
			startY: 0,
			point: null,
			lngLat: null,
		};

		const cancelLongPress = () => {
			if (state.timerId !== null) {
				clearTimeout(state.timerId);
				state.timerId = null;
			}
		};

		const onTouchStart = (event) => {
			if (!event?.touches || event.touches.length !== 1) {
				cancelLongPress();
				return;
			}

			const touch = event.touches[0];
			const rect = canvas.getBoundingClientRect();
			const point = {
				x: touch.clientX - rect.left,
				y: touch.clientY - rect.top,
			};

			state.startX = touch.clientX;
			state.startY = touch.clientY;
			state.point = point;
			state.lngLat = mapRef.unproject([point.x, point.y]);

			cancelLongPress();
			state.timerId = setTimeout(() => {
				state.timerId = null;
				if (!state.point || !state.lngLat) return;
				this._showForEvent({ point: state.point, lngLat: state.lngLat }, target);
			}, this.longPressDelayMs);
		};

		const onTouchMove = (event) => {
			if (state.timerId === null || !event?.touches || event.touches.length !== 1) {
				return;
			}

			const touch = event.touches[0];
			const deltaX = Math.abs(touch.clientX - state.startX);
			const deltaY = Math.abs(touch.clientY - state.startY);
			if (deltaX > this.longPressMoveTolerancePx || deltaY > this.longPressMoveTolerancePx) {
				cancelLongPress();
			}
		};

		const onTouchEnd = () => {
			cancelLongPress();
		};

		const onTouchCancel = () => {
			cancelLongPress();
		};

		canvas.addEventListener('touchstart', onTouchStart, { passive: true });
		canvas.addEventListener('touchmove', onTouchMove, { passive: true });
		canvas.addEventListener('touchend', onTouchEnd, { passive: true });
		canvas.addEventListener('touchcancel', onTouchCancel, { passive: true });

		this.longPressHandlers[target] = {
			canvas,
			onTouchStart,
			onTouchMove,
			onTouchEnd,
			onTouchCancel,
			cancelLongPress,
		};
	}

	_detachLongPressListeners(target) {
		const handler = this.longPressHandlers[target];
		if (!handler?.canvas) return;

		handler.cancelLongPress();
		handler.canvas.removeEventListener('touchstart', handler.onTouchStart);
		handler.canvas.removeEventListener('touchmove', handler.onTouchMove);
		handler.canvas.removeEventListener('touchend', handler.onTouchEnd);
		handler.canvas.removeEventListener('touchcancel', handler.onTouchCancel);
		this.longPressHandlers[target] = null;
	}

	_showForEvent(event, target) {
		if (!this.enabled) return;
		if (!event?.lngLat || !event?.point) {
			return;
		}

		this._ensureMenuElement();

		const nearestStations = this._findNearestStations(event.lngLat, 2);
		this._renderMenu(nearestStations, event.lngLat, target);
		this._positionMenu(event, target);
	}

	_findNearestStations(lngLat, maxCount = 2) {
		const sourceStations = this.mapInstance?.radarStationsLayer?.getStations?.() || window.radarStationFeatures || [];
		const filtered = [];

		for (let i = 0; i < sourceStations.length; i++) {
			const station = sourceStations[i];
			const id = station?.properties?.id;
			const coordinates = station?.geometry?.coordinates;
			if (!id || !Array.isArray(coordinates) || coordinates.length < 2) continue;
			if (!/^[KPR]?[A-Z]{3}$/.test(id)) continue;

			const distanceKm = this._distanceKm(
				lngLat.lat,
				lngLat.lng,
				Number(coordinates[1]),
				Number(coordinates[0])
			);

			filtered.push({
				id,
				distanceKm,
			});
		}

		filtered.sort((a, b) => a.distanceKm - b.distanceKm);
		return filtered.slice(0, maxCount);
	}

	_distanceKm(lat1, lon1, lat2, lon2) {
		const toRad = (value) => value * (Math.PI / 180);
		const dLat = toRad(lat2 - lat1);
		const dLon = toRad(lon2 - lon1);
		const radLat1 = toRad(lat1);
		const radLat2 = toRad(lat2);

		const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
			+ Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return 6371 * c;
	}

	_renderMenu(nearestStations, lngLat, target) {
		if (!this.menuElement) return;

		if (this.menuCloseTimerId !== null) {
			clearTimeout(this.menuCloseTimerId);
			this.menuCloseTimerId = null;
		}

		this.menuElement.innerHTML = '';

		if (nearestStations.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'map-rightclick-empty';
			empty.textContent = 'No station data loaded yet';
			this.menuElement.appendChild(empty);
		} else {
            const wrapper = document.createElement('div');
            wrapper.className = 'map-rightclick-stations-wrapper';
            this.menuElement.appendChild(wrapper);

			nearestStations.forEach((station) => {
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'map-rightclick-button';
				button.innerHTML = `<i class="ti ti-radar-2"></i> <p>${station.id}</p>`;
				button.addEventListener('click', () => {
					this._selectStation(station.id, target);
					this.closeMenu();
				});
				wrapper.appendChild(button);
			});
		}

		const divider = document.createElement('div');
		divider.className = 'map-rightclick-divider';
		this.menuElement.appendChild(divider);

		const weatherButton = document.createElement('button');
		weatherButton.type = 'button';
		weatherButton.className = 'map-rightclick-button';
		weatherButton.style.marginBottom = '6px';
		weatherButton.innerHTML = '<i class="ti ti-sun"></i> <p>Weather here</p>';
		weatherButton.addEventListener('click', () => {
			this._handleWeatherAction({ lngLat, target });
			this.closeMenu();
		});
		this.menuElement.appendChild(weatherButton);

		const shareButton = document.createElement('button');
		shareButton.type = 'button';
		shareButton.className = 'map-rightclick-button map-rightclick-share';
		shareButton.innerHTML = '<i class="ti ti-share"></i> <p>Share</p>';
		shareButton.addEventListener('click', () => {
			this._handleShareAction({ lngLat, target });
			this.closeMenu();
		});
		this.menuElement.appendChild(shareButton);

		this.menuElement.classList.remove('hidden', 'closing', 'opening');
		// Force a style flush so reopening retriggers the pop-in animation.
		void this.menuElement.offsetWidth;
		this.menuElement.classList.add('opening');
	}

	_handleOutsidePointerDown(event) {
		if (!this.menuElement) return;
		if (this.menuElement.contains(event.target)) return;
		this.closeMenu();
	}

	_positionMenu(event, target) {
		if (!this.menuElement) return;
		const mapRef = target === 'split' ? this.mapInstance?.dualMap : this.mapInstance?.map;
		const canvas = mapRef?.getCanvas?.();
		const rect = canvas?.getBoundingClientRect?.();
		if (!rect) return;

		const menu = this.menuElement;
		const pad = 12;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		menu.style.left = '0px';
		menu.style.top = '0px';
		const provisionalWidth = menu.offsetWidth || 220;
		const provisionalHeight = menu.offsetHeight || 180;

		let left = rect.left + event.point.x;
		let top = rect.top + event.point.y;

		if (left + provisionalWidth + pad > viewportWidth) {
			left = viewportWidth - provisionalWidth - pad;
		}
		if (top + provisionalHeight + pad > viewportHeight) {
			top = viewportHeight - provisionalHeight - pad;
		}
		if (left < pad) left = pad;
		if (top < pad) top = pad;

		menu.style.left = `${Math.round(left)}px`;
		menu.style.top = `${Math.round(top)}px`;
	}

	_selectStation(stationId, target) {
		const callbacks = this.mapInstance?.callbacks || {};
		if (target === 'split' && typeof callbacks.onSelectStationSplit === 'function') {
			callbacks.onSelectStationSplit(stationId);
			return;
		}
		if (typeof callbacks.onSelectStation === 'function') {
			callbacks.onSelectStation(stationId);
		}
	}

	_handleShareAction(context) {
        const nearestStation = this._findNearestStations(context.lngLat, 1)[0];

        const modal = new Modal("Share this Point", `<p class="code">https://sparkradar.app?lat=${context.lngLat.lat.toFixed(6)}&lon=${context.lngLat.lng.toFixed(6)}&zoom=12&station=${nearestStation.id}</p><br><p class="code">${context.lngLat.lat.toFixed(6)}, ${context.lngLat.lng.toFixed(6)}</p><br><p id="copied-to-clipboard-success" style="opacity: 0; text-align: center; width: 100%; transition: opacity 0.2s ease;">Copied to clipboard!</p>`, [
            {
                text: "Copy URL",
                className: "",
                click: () => {
                    navigator.clipboard.writeText(`https://sparkradar.app?lat=${context.lngLat.lat.toFixed(6)}&lon=${context.lngLat.lng.toFixed(6)}&zoom=12&station=${nearestStation.id}`).then(() => {
                        const successMessage = document.getElementById('copied-to-clipboard-success');
                        if (successMessage) {
                            successMessage.textContent = 'URL copied to clipboard!';
                            successMessage.style.opacity = '1';
                            setTimeout(() => {
                                successMessage.style.opacity = '0';
                            }, 2000);
                        }
                    }).catch(() => {
                        const successMessage = document.getElementById('copied-to-clipboard-success');
                        if (successMessage) {
                            successMessage.textContent = 'Failed to copy to clipboard.';
                            successMessage.style.opacity = '1';
                            setTimeout(() => {
                                successMessage.style.opacity = '0';
                            }, 2000);
                        }
                    });
                }
            },
            {
                text: "Dismiss",
                className: "",
                click: (modalInstance) => {
                    modalInstance.close();
                }
            }
        ]);
        modal.open();
	}

	_handleWeatherAction(context) {
		new WeatherInformation(context.lngLat);
	}

	closeMenu() {
		if (!this.menuElement) return;
		if (this.menuElement.classList.contains('hidden') || this.menuElement.classList.contains('closing')) {
			return;
		}

		if (this.menuCloseTimerId !== null) {
			clearTimeout(this.menuCloseTimerId);
			this.menuCloseTimerId = null;
		}

		this.menuElement.classList.remove('opening');
		this.menuElement.classList.add('closing');

		// Fallback in case animationend does not fire.
		this.menuCloseTimerId = setTimeout(() => {
			this.menuCloseTimerId = null;
			if (!this.menuElement) return;
			this.menuElement.classList.remove('closing');
			this.menuElement.classList.add('hidden');
		}, this.menuCloseAnimationMs + 50);
	}

	destroyMenu() {
		if (this.menuCloseTimerId !== null) {
			clearTimeout(this.menuCloseTimerId);
			this.menuCloseTimerId = null;
		}
		if (!this.menuElement) return;
		try {
			this.menuElement.remove();
		} catch {
			this.menuElement.classList.add('hidden');
		}
		this.menuElement = null;
	}
}

export default RightClickHandler;
