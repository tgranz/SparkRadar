import Dialog from '../ui/dialog.js';

var isWeatherInformationOpenedAlready = () => {
    const dialogTitle = document.querySelector('#dialog-title');
    if (dialogTitle && dialogTitle.textContent === "Weather at a Point") {
        return true;
    } else {
        return false;
    }
};

export default class WeatherInformation extends Dialog {
    constructor(lngLat) {
        if (isWeatherInformationOpenedAlready()) {
            return;
        }

        super("Weather at a Point", "sun", "<p>Loading...</p>", {}, true);
        this.lngLat = lngLat;

        this._fetchWeatherData(lngLat).then(data => {
            this._renderContent(data);
        });
    }

    _fetchWeatherData(lngLat) {
        const settings = window.settingsInstance;
        const tempUnit = settings?.getSetting('weatherTempUnit') || 'F';
        const pressureUnit = settings?.getSetting('weatherPressureUnit') || 'MB';
        const windUnit = settings?.getSetting('weatherWindUnit') || 'MPH';
        const precipUnit = settings?.getSetting('weatherPrecipUnit') || 'IN';
        const distanceUnit = settings?.getSetting('weatherDistanceUnit') || 'MI';

        const buildURL = (lat, lon) => {
            const url = new URL(`https://wxnow.sparkradar.app/weather`);
            url.searchParams.append('lat', lat);
            url.searchParams.append('lon', lon);
            url.searchParams.append('tempUnit', tempUnit);
            url.searchParams.append('pressureUnit', pressureUnit);
            url.searchParams.append('windUnit', windUnit);
            url.searchParams.append('precipUnit', precipUnit);
            url.searchParams.append('distanceUnit', distanceUnit);
            console.log('Built weather API URL:', url.toString());
            return url;
        }

        return fetch(buildURL(lngLat.lat, lngLat.lng))
        .then(response => response.json())
        .then(data => {
            console.log('Weather data:', data);
            return data;
        })
        .catch(error => {
            console.error('Error fetching weather data:', error);
            return {};
        });
    }

    _renderContent(data) {
        const settings = window.settingsInstance;
        const tempUnit = settings?.getSetting('weatherTempUnit') || 'F';
        const pressureUnit = settings?.getSetting('weatherPressureUnit') || 'MB';
        const windUnit = settings?.getSetting('weatherWindUnit') || 'MPH';
        const precipUnit = settings?.getSetting('weatherPrecipUnit') || 'IN';
        const distanceUnit = settings?.getSetting('weatherDistanceUnit') || 'MI';

        const tempLabel = tempUnit === 'K' ? 'K' : `°${tempUnit}`;
        const pressureLabel = pressureUnit === 'INHG'
            ? 'inHg'
            : pressureUnit === 'MMHG'
                ? 'mmHg'
                : 'mb';
        const windUnitLabel = windUnit === 'KPH'
            ? 'kph'
            : windUnit === 'MPS'
                ? 'm/s'
                : 'mph';
        const precipUnitLabel = precipUnit === 'MM'
            ? 'mm'
            : precipUnit === 'IN'
                ? 'in'
                : precipUnit.toLowerCase();
        const distanceUnitLabel = distanceUnit === 'KM'
            ? 'km'
            : distanceUnit === 'M'
                ? 'm'
                : distanceUnit.toLowerCase();

        const getIconForConditionCode = (code) => {
            var newcode = code.toString();
            const lastChar = newcode.at(-1);

            if (['1', '2', '3'].includes(lastChar)) {
                newcode = newcode.slice(0, -1) + '0';
            }

            const conditionMap = {
                100: 'sun',
                200: 'sun',
                300: 'cloud',
                400: 'cloud',
                500: 'cloud',
                610: 'cloud-rain',
                620: 'cloud-rain',
                630: 'snowflake',
                640: 'snowflake',
                650: 'cloud-storm',
                710: 'cloud-fog',
                720: 'cloud-fog',
                800: 'question-mark',
            };

            return conditionMap[newcode] || 'question-mark';
        }

        const color = ((code) => {
            var newcode = code.toString();
            const lastChar = newcode.at(-1);

            if (['1', '2', '3'].includes(lastChar)) {
                newcode = newcode.slice(0, -1) + '0';
            }

            const conditionMap = {
                100: '#ffcc00',
                200: '#ffcc00',
                300: '#cccccc',
                400: '#cccccc',
                500: '#cccccc',
                610: '#27beff',
                620: '#27beff',
                630: '#ffffff',
                640: '#ffffff',
                650: '#ff2121',
                710: '#999999',
                720: '#999999',
                800: '#cccccc',
            };

            return conditionMap[newcode] || '#cccccc';
        });

        const formatHourLabel = (timeString) => {
            if (!timeString) {
                return '';
            }

            const date = new Date(timeString);
            if (Number.isNaN(date.getTime())) {
                return '';
            }

            return date.toLocaleTimeString([], {
                hour: 'numeric',
                hour12: true,
            });
        };

        const hourly24 = Array.isArray(data?.hourly)
            ? data.hourly
                .slice(0, 24)
                .filter(hour => Number.isFinite(Number(hour?.temperature)))
            : [];

        const chartSection = (() => {
            if (!hourly24.length) {
                return '';
            }

            const chartWidth = 760;
            const chartHeight = 180;
            const padX = 12;
            const padY = 14;
            const temps = hourly24.map(hour => Number(hour.temperature));
            const minTemp = Math.min(...temps);
            const maxTemp = Math.max(...temps);
            const tempRange = maxTemp - minTemp;
            const safeRange = tempRange === 0 ? 1 : tempRange;

            const points = hourly24.map((hour, idx) => {
                const x = padX + (idx * (chartWidth - (padX * 2))) / Math.max(hourly24.length - 1, 1);
                const y = padY + ((maxTemp - Number(hour.temperature)) / safeRange) * (chartHeight - (padY * 2));
                return {
                    x,
                    y,
                    hour,
                };
            });

            const polylinePoints = points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
            const pointDots = points.map(point => `
                <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.5" fill="${color(point.hour.conditionCode)}" />
            `).join('');

            const labelsToShow = Math.min(8, hourly24.length);
            const labelIndexes = (() => {
                if (labelsToShow <= 1) {
                    return [0];
                }

                const indexes = [];
                for (let i = 0; i < labelsToShow; i++) {
                    const index = Math.round((i * (hourly24.length - 1)) / (labelsToShow - 1));
                    if (!indexes.includes(index)) {
                        indexes.push(index);
                    }
                }
                return indexes;
            })();

            const labelMap = new Map(labelIndexes.map(index => [index, hourly24[index]]));

            const hourlyLabels = hourly24.map((hour, index) => {
                if (!labelMap.has(index)) {
                    return '<div style="flex: 1;"></div>';
                }

                const icon = getIconForConditionCode(hour.conditionCode);
                return `
                    <div style="flex: 1; text-align: center; min-width: 0;">
                        <div style="font-size: 0.75em; opacity: 0.8;">${formatHourLabel(hour.time)}</div>
                        <i class="ti ti-${icon}" style="font-size: 1.1em; color: ${color(hour.conditionCode)};"></i>
                        <div style="font-size: 0.8em; font-weight: 600;">${Number(hour.temperature).toFixed(0)}</div>
                    </div>
                `;
            }).join('');

            return `
                <div style="margin-top: 16px; padding: 12px; background: #ffffff08; border: 1px solid #ffffff20; border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>Temperature Next 24 Hours</strong>
                    </div>
                    <div style="width: 100%; overflow-x: auto;">
                        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" style="width: 100%; min-width: 420px; height: 170px; overflow: visible;">
                            <line x1="${padX}" y1="${chartHeight - padY}" x2="${chartWidth - padX}" y2="${chartHeight - padY}" stroke="#ffffff40" stroke-width="1" />
                            <polyline fill="none" stroke="${color(data.current.conditionCode)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${polylinePoints}" />
                            ${pointDots}
                        </svg>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 0; margin-top: 8px;">
                        ${hourlyLabels}
                    </div>
                </div>
            `;
        })();

        const threeDayForecastSection = (() => {
            const daily3 = Array.isArray(data?.daily) ? data.daily.slice(0, 3) : [];
            if (!daily3.length) {
                return '';
            }

            const cards = daily3.map(day => {
                const conditionCode = day?.day?.conditionCode ?? day?.night?.conditionCode ?? 800;
                const conditionText = day?.day?.condition ?? day?.night?.condition ?? 'Unknown';
                const pop = day?.day?.pop ?? day?.night?.pop;
                const popLabel = Number.isFinite(Number(pop)) ? `${Math.round(Number(pop))}%` : 'N/A';
                const icon = getIconForConditionCode(conditionCode);

                return `
                    <div style="padding: 12px; background: #ffffff08; border: 1px solid #ffffff20; border-radius: 10px; min-width: 0; flex: 1 1 180px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                            <strong style="font-size: 0.95em;">${day?.dayName || 'Day'}</strong>
                            <i class="ti ti-${icon}" style="font-size: 1.2em; color: ${color(conditionCode)};"></i>
                        </div>
                        <div style="font-size: 0.95em; font-weight: 600; margin-bottom: 4px;">${Number(day?.high).toFixed(0)} / ${Number(day?.low).toFixed(0)} ${tempLabel}</div>
                        <div style="font-size: 0.8em; opacity: 0.8;">${popLabel}</div>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-bottom: 2px;">${conditionText}</div>
                    </div>
                `;
            }).join('');

            return `
                <div style="margin-top: 16px; padding: 12px; background: #ffffff08; border: 1px solid #ffffff20; border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>3 Day Forecast</strong>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch;">
                        ${cards}
                    </div>
                </div>
            `;
        })();

        document.getElementById('dialog-content').innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: ${color(data.current.conditionCode)}30; border-left: 4px solid ${color(data.current.conditionCode)}; border-radius: 10px;">
                <h3 style="margin: 0 0 10px 0; text-align: left; margin-bottom: 20px; color: ${color(data.current.conditionCode)};">${data.location.lat}, ${data.location.lon} ${data?.location?.wfo ? `in ${data.location.wfo}` : ''}</h3>
                <div style="margin-bottom: 20px; display: flex; flex-direction: row; justify-content: space-evenly; align-content: center;">
                    <i class="ti ti-${getIconForConditionCode(data.current.conditionCode)}" style="font-size: 3em; color: ${color(data.current.conditionCode)};"></i>
                    <div style="display: flex; flex-direction: column; justify-content: center; align-items: flex-start;">
                        ${data?.current?.condition ? `<strong style="font-size: 1.2em;">${data.current.condition}</strong>` : ''}
                        ${data?.current?.temperature ? `<p style="margin: 5px 0 0 0; font-size: 1.5em;">${data.current.temperature} ${tempLabel}</p>` : ''}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                    ${data?.current?.windSpeed ? `<strong>Wind:</strong> <span>${data.current.windSpeed} ${windUnitLabel} from the ${data.current.windDirectionCardinal}${data?.current?.windGust ? `, gusting to ${data.current.windGust} ${windUnitLabel}` : ''}</span>` : ''}
                    ${data?.current?.dewpoint ? `<strong>Dew Point:</strong> <span>${data.current.dewpoint} ${tempLabel}</span>` : ''}
                    ${data?.current?.visibility ? `<strong>Visibility:</strong> <span>${data.current.visibility} ${distanceUnitLabel}</span>` : ''}
                    ${data?.current?.humidity ? `<strong>Humidity:</strong> <span>${data.current.humidity}%</span>` : ''}
                    ${data?.current?.pressure ? `<strong>Pressure:</strong> <span>${data.current.pressure} ${pressureLabel}</span>` : ''}
                    ${data?.current?.uv ? `<strong>UV Index:</strong> <span>${data.current.uv}</span>` : ''}
                </div>
            </div>

            ${chartSection}

            ${threeDayForecastSection}

            <p style="margin: 16px; width: calc(100% - 40px); text-align: center; font-size: 0.9em;">${data?.info?.creditString || ''}</p>
       
            <p style="margin: 16px; width: calc(100% - 40px); text-align: center; font-size: 0.8em; opacity: 0.7;">Powered by <a href="https://wxnow.sparkradar.app" target="_blank" style="color: ${color(data.current.conditionCode)}; text-decoration: underline;">WxNOW</a></p>
        `;
    }
}