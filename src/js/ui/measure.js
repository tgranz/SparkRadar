const EARTH_RADIUS_MILES = 3958.7613;
const CIRCLE_SEGMENTS = 96;

const toRadians = (degrees) => degrees * (Math.PI / 180);
const toDegrees = (radians) => radians * (180 / Math.PI);

function normalizeLngLat(lngLat) {
	if (!lngLat) return null;
	return {
		lng: Number(lngLat.lng),
		lat: Number(lngLat.lat),
	};
}

function haversineMiles(start, end) {
	const startLngLat = normalizeLngLat(start);
	const endLngLat = normalizeLngLat(end);
	if (!startLngLat || !endLngLat) return 0;

	const lat1 = toRadians(startLngLat.lat);
	const lat2 = toRadians(endLngLat.lat);
	const deltaLat = toRadians(endLngLat.lat - startLngLat.lat);
	const deltaLng = toRadians(endLngLat.lng - startLngLat.lng);

	const a = Math.sin(deltaLat / 2) ** 2
		+ Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_MILES * c;
}

function destinationPoint(start, bearingDegrees, distanceMiles) {
	const startLngLat = normalizeLngLat(start);
	if (!startLngLat) return null;

	const angularDistance = distanceMiles / EARTH_RADIUS_MILES;
	const bearing = toRadians(bearingDegrees);
	const lat1 = toRadians(startLngLat.lat);
	const lng1 = toRadians(startLngLat.lng);

	const lat2 = Math.asin(
		Math.sin(lat1) * Math.cos(angularDistance)
		+ Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
	);

	const lng2 = lng1 + Math.atan2(
		Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
		Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
	);

	return {
		lng: ((toDegrees(lng2) + 540) % 360) - 180,
		lat: toDegrees(lat2),
	};
}

export default class Measure {
	static instance = null;

	constructor(mapInstance) {
		if (Measure.instance) {
			return Measure.instance;
		}

		Measure.instance = this;
		this.mapInstance = mapInstance;
		this.isDragging = false;
		this.activePointerId = null;
		this.measurement = null;
		this.lockedMaps = [];

		this.canvas = document.createElement('canvas');
		this.canvas.id = 'measure-overlay';
		this.canvas.style.position = 'fixed';
		this.canvas.style.inset = '0';
		this.canvas.style.width = '100vw';
		this.canvas.style.height = '100vh';
		this.canvas.style.zIndex = '998';
		this.canvas.style.pointerEvents = 'auto';
		this.canvas.style.cursor = 'crosshair';
		this.canvas.style.touchAction = 'none';
		document.body.appendChild(this.canvas);

		this.label = document.createElement('div');
		this.label.id = 'measure-distance-label';
		this.label.style.position = 'fixed';
		this.label.style.zIndex = '999';
		this.label.style.pointerEvents = 'none';
		this.label.style.display = 'none';
		this.label.style.padding = '6px 10px';
		this.label.style.borderRadius = '999px';
		this.label.style.background = 'rgba(0, 0, 0, 0.72)';
		this.label.style.backdropFilter = 'blur(10px)';
		this.label.style.border = '1px solid var(--border-color)';
		this.label.style.color = '#ffffff';
		this.label.style.fontWeight = '700';
		this.label.style.fontSize = '0.9rem';
		this.label.style.transform = 'translateX(-50%)';
		this.label.style.whiteSpace = 'nowrap';
		document.body.appendChild(this.label);

		this.ctx = this.canvas.getContext('2d');
		this.pointerDownHandler = (e) => this.onPointerDown(e);
		this.pointerMoveHandler = (e) => this.onPointerMove(e);
		this.pointerUpHandler = (e) => this.onPointerUp(e);
		this.keydownHandler = (e) => {
			if (e.key === 'Escape') this.close();
		};
		this.resizeHandler = () => {
			this.resize();
			this.redraw();
		};

		this.canvas.addEventListener('pointerdown', this.pointerDownHandler);
		window.addEventListener('pointermove', this.pointerMoveHandler);
		window.addEventListener('pointerup', this.pointerUpHandler);
		window.addEventListener('pointercancel', this.pointerUpHandler);
		window.addEventListener('resize', this.resizeHandler);
		document.addEventListener('keydown', this.keydownHandler);

		this.lockMaps();
		this.resize();
		this.updateButtonState(true);
	}

	updateButtonState(active) {
		const button = document.getElementById('measure-button');
		if (button) {
			button.classList.toggle('selected', active);
		}
	}

	getMapRef(mapKey) {
		return mapKey === 'dual' ? this.mapInstance?.dualMap : this.mapInstance?.map;
	}

	getMapAtClientPoint(clientX, clientY) {
		const candidates = [
			{ key: 'dual', map: this.mapInstance?.dualMap },
			{ key: 'main', map: this.mapInstance?.map },
		];

		for (const candidate of candidates) {
			const mapRef = candidate.map;
			if (!mapRef?.getCanvas) continue;
			const rect = mapRef.getCanvas().getBoundingClientRect();
			if (
				clientX >= rect.left && clientX <= rect.right
				&& clientY >= rect.top && clientY <= rect.bottom
			) {
				return candidate;
			}
		}

		return null;
	}

	clientPointToLngLat(mapRef, clientX, clientY) {
		const rect = mapRef.getCanvas().getBoundingClientRect();
		return mapRef.unproject([clientX - rect.left, clientY - rect.top]);
	}

	projectToViewport(mapRef, lngLat) {
		const point = mapRef.project(lngLat);
		const rect = mapRef.getCanvas().getBoundingClientRect();
		return {
			x: rect.left + point.x,
			y: rect.top + point.y,
		};
	}

	lockMaps() {
		const disableInteractions = (mapRef) => {
			if (!mapRef) return;
			this.lockedMaps.push(mapRef);
			mapRef.dragPan?.disable?.();
			mapRef.scrollZoom?.disable?.();
			mapRef.boxZoom?.disable?.();
			mapRef.doubleClickZoom?.disable?.();
			mapRef.touchZoomRotate?.disable?.();
			mapRef.dragRotate?.disable?.();
			mapRef.keyboard?.disable?.();
			const canvas = mapRef.getCanvas?.();
			if (canvas) canvas.style.cursor = 'crosshair';
		};

		disableInteractions(this.mapInstance?.map);
		disableInteractions(this.mapInstance?.dualMap);
	}

	unlockMaps() {
		for (const mapRef of this.lockedMaps) {
			mapRef.dragPan?.enable?.();
			mapRef.scrollZoom?.enable?.();
			mapRef.boxZoom?.enable?.();
			mapRef.doubleClickZoom?.enable?.();
			mapRef.touchZoomRotate?.enable?.();
			mapRef.dragRotate?.enable?.();
			mapRef.keyboard?.enable?.();
			const canvas = mapRef.getCanvas?.();
			if (canvas) canvas.style.cursor = '';
		}
		this.lockedMaps = [];
	}

	resize() {
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.floor(window.innerWidth * dpr);
		this.canvas.height = Math.floor(window.innerHeight * dpr);
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	clearMeasurement() {
		this.measurement = null;
		this.label.style.display = 'none';
		this.redraw();
	}

	onPointerDown(event) {
		if (event.button !== 0 && event.pointerType !== 'touch') return;

		const targetMap = this.getMapAtClientPoint(event.clientX, event.clientY);
		if (!targetMap?.map) return;

		event.preventDefault();
		event.stopPropagation();

		this.activePointerId = event.pointerId;
		this.canvas.setPointerCapture?.(event.pointerId);
		this.isDragging = true;

		const centerLngLat = this.clientPointToLngLat(targetMap.map, event.clientX, event.clientY);
		this.measurement = {
			mapKey: targetMap.key,
			centerLngLat,
			endLngLat: centerLngLat,
		};

		this.redraw();
	}

	onPointerMove(event) {
		if (!this.isDragging || this.activePointerId !== event.pointerId || !this.measurement) return;

		const mapRef = this.getMapRef(this.measurement.mapKey);
		if (!mapRef) return;

		event.preventDefault();
		this.measurement.endLngLat = this.clientPointToLngLat(mapRef, event.clientX, event.clientY);
		this.redraw();
	}

	onPointerUp(event) {
		if (!this.isDragging || this.activePointerId !== event.pointerId) return;

		this.isDragging = false;
		this.activePointerId = null;
		this.canvas.releasePointerCapture?.(event.pointerId);
		this.redraw();
	}

	redraw() {
		this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

		if (!this.measurement) {
			this.label.style.display = 'none';
			return;
		}

		const mapRef = this.getMapRef(this.measurement.mapKey);
		if (!mapRef) {
			this.clearMeasurement();
			return;
		}

		const center = this.projectToViewport(mapRef, this.measurement.centerLngLat);
		const end = this.projectToViewport(mapRef, this.measurement.endLngLat);
		const radiusMiles = haversineMiles(this.measurement.centerLngLat, this.measurement.endLngLat);

		const circlePoints = [];
		for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
			const bearing = (i / CIRCLE_SEGMENTS) * 360;
			const destination = destinationPoint(this.measurement.centerLngLat, bearing, radiusMiles);
			if (!destination) continue;
			circlePoints.push(this.projectToViewport(mapRef, destination));
		}

		if (circlePoints.length > 1) {
			this.ctx.beginPath();
			this.ctx.moveTo(circlePoints[0].x, circlePoints[0].y);
			for (let i = 1; i < circlePoints.length; i++) {
				this.ctx.lineTo(circlePoints[i].x, circlePoints[i].y);
			}
			this.ctx.closePath();
			this.ctx.fillStyle = '#27beff33';
			this.ctx.fill();
			this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
			this.ctx.lineWidth = 4;
			this.ctx.stroke();
			this.ctx.strokeStyle = '#27beff';
			this.ctx.lineWidth = 2;
			this.ctx.stroke();
		}

		this.ctx.beginPath();
		this.ctx.moveTo(center.x, center.y);
		this.ctx.lineTo(end.x, end.y);
		this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
		this.ctx.lineWidth = 4;
		this.ctx.stroke();
		this.ctx.strokeStyle = '#27beff';
		this.ctx.lineWidth = 2;
		this.ctx.stroke();

		this.ctx.beginPath();
		this.ctx.arc(center.x, center.y, 7, 0, Math.PI * 2);
		this.ctx.fillStyle = '#000000';
		this.ctx.fill();
		this.ctx.beginPath();
		this.ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
		this.ctx.fillStyle = '#27beff';
		this.ctx.fill();

		this.label.textContent = `${radiusMiles.toFixed(radiusMiles >= 100 ? 0 : 1)} mi`;
		this.label.style.left = `${end.x}px`;
		this.label.style.top = `${end.y + 14}px`;
		this.label.style.display = 'block';
	}

	close() {
		this.isDragging = false;
		this.activePointerId = null;
		this.clearMeasurement();
		this.unlockMaps();
		this.updateButtonState(false);

		this.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
		window.removeEventListener('pointermove', this.pointerMoveHandler);
		window.removeEventListener('pointerup', this.pointerUpHandler);
		window.removeEventListener('pointercancel', this.pointerUpHandler);
		window.removeEventListener('resize', this.resizeHandler);
		document.removeEventListener('keydown', this.keydownHandler);

		this.canvas.remove();
		this.label.remove();
		Measure.instance = null;
	}

	destroy() {
		this.close();
	}
}