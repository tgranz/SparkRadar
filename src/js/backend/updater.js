export function initializeIntervalUpdates({
  map,
  radar,
  inferLevelFromProduct,
  setRadar,
  getMainRadar,
  getSplitRadar,
  getArchiveMode,
  getLocalFileMode,
}) {
  let updateInProgress = false;
  let lastStationChangeTime = { main: 0, split: 0 };
  let lastCheckedRadar = { main: null, split: null };
  let baselineCheckCount = { main: 0, split: 0 };
  const STATION_CHANGE_DEBOUNCE = 5000;
  const BASELINE_CHECKS_REQUIRED = 2;
  let updateTimes = 10;
  let autoUpdateEnabled = true;

  const initialMainProduct = getMainRadar()?.product || 'N0B';
  const initialSplitProduct = getSplitRadar()?.product || 'N0G';
  const selectedProduct = { main: initialMainProduct, split: initialSplitProduct };

  const originalSetRadar = setRadar;

  const markManualChange = (target) => {
    if (target !== 'main' && target !== 'split') return;
    lastStationChangeTime[target] = Date.now();
    lastCheckedRadar[target] = null;
    baselineCheckCount[target] = 0;
  };

  const trackedSetRadar = async (station, product, mainOrSplit, options) => {
    const mainRadar = getMainRadar();
    const splitRadar = getSplitRadar();
    const stationChanged = station && (
      (mainOrSplit === 'main' && station !== mainRadar?.station) ||
      (mainOrSplit === 'split' && station !== splitRadar?.station)
    );

    const productChanged = product && (
      (mainOrSplit === 'main' && product !== mainRadar?.product) ||
      (mainOrSplit === 'split' && product !== splitRadar?.product)
    );

    if (stationChanged || productChanged) {
      markManualChange(mainOrSplit);
    }

    if (product && (mainOrSplit === 'main' || mainOrSplit === 'split')) {
      selectedProduct[mainOrSplit] = product;
    }

    return originalSetRadar(station, product, mainOrSplit, options);
  };

  const realtimeChunkRefreshState = {
    main: { timerId: null, inFlight: false, pendingChunkUrl: null, lastProcessedChunkUrl: null },
    split: { timerId: null, inFlight: false, pendingChunkUrl: null, lastProcessedChunkUrl: null },
  };

  const MANUAL_CHANGE_DEBOUNCE_MS = 2000;

  const scheduleRealtimeChunkRefresh = (target, chunkUrl = null) => {
    const state = realtimeChunkRefreshState[target];
    if (!state || state.inFlight) return;

    const timeSinceManualChange = Date.now() - lastStationChangeTime[target];
    if (timeSinceManualChange < MANUAL_CHANGE_DEBOUNCE_MS) {
      console.log(`[L2ChunkRender] Skipping chunk refresh (${target}) - recent manual change (${timeSinceManualChange}ms ago)`);
      return;
    }

    if (chunkUrl && state.lastProcessedChunkUrl === chunkUrl) {
      return;
    }

    state.pendingChunkUrl = chunkUrl || state.pendingChunkUrl;
    if (state.timerId) clearTimeout(state.timerId);

    state.timerId = setTimeout(async () => {
      state.timerId = null;
      if (state.inFlight) return;
      state.inFlight = true;

      try {
        const mainRadar = getMainRadar();
        const splitRadar = getSplitRadar();
        const archiveMode = getArchiveMode();
        const localFileMode = getLocalFileMode();

        const station = target === 'main' ? mainRadar?.station : splitRadar?.station;
        const fallbackProduct = target === 'main' ? mainRadar?.product : splitRadar?.product;
        const mapProduct = target === 'main' ? map.currentRadarProduct : map.currentRadarProductSplit;
        const product = selectedProduct[target] || fallbackProduct || mapProduct;

        const isL2 = inferLevelFromProduct(product) === 'L2';
        const isArchive = !!archiveMode[target];
        const isLocal = !!localFileMode[target];
        if (!isL2 || isArchive || isLocal) {
          state.pendingChunkUrl = null;
          return;
        }

        await originalSetRadar(station, product, target, {
          gate_limit: -30,
          skipLoading: true,
        });

        state.lastProcessedChunkUrl = state.pendingChunkUrl;
        state.pendingChunkUrl = null;
      } catch (error) {
        console.error(`[L2ChunkRender] Realtime chunk refresh failed (${target}):`, error);
      } finally {
        state.inFlight = false;
      }
    }, 200);
  };

  const onL2ChunkUpdate = (event) => {
    const station = event?.detail?.station || null;
    const chunkUrl = event?.detail?.chunkUrl || null;
    if (!station) return;

    const mainRadar = getMainRadar();
    const splitRadar = getSplitRadar();

    if (station === mainRadar?.station) {
      scheduleRealtimeChunkRefresh('main', chunkUrl);
    }

    if (map.hasSplitMap && map.hasSplitMap() && station === splitRadar?.station) {
      scheduleRealtimeChunkRefresh('split', chunkUrl);
    }
  };

  window.addEventListener('sparkradar:l2-chunk-update', onL2ChunkUpdate);

  const update = async () => {
    if (!autoUpdateEnabled || updateInProgress) return;
    updateInProgress = true;
    updateTimes++;

    try {
      console.log('Running routine update.');
      const mainRadar = getMainRadar();
      const splitRadar = getSplitRadar();
      const archiveMode = getArchiveMode();
      const localFileMode = getLocalFileMode();

      if (Date.now() - lastStationChangeTime.main > STATION_CHANGE_DEBOUNCE) {
        const mainProduct = selectedProduct.main || map.currentRadarProduct || mainRadar?.product;
        const isRealtimeChunkL2Main = inferLevelFromProduct(mainProduct) === 'L2' && !archiveMode.main && !localFileMode.main;

        if (!isRealtimeChunkL2Main && mainRadar?.station) {
          const currentMainRadarKey = `${mainRadar.station}_${mainProduct}_${inferLevelFromProduct(mainProduct)}`;
          const lastMainRadarKey = lastCheckedRadar.main;

          let shouldCheckMain = false;
          if (lastMainRadarKey === currentMainRadarKey) {
            baselineCheckCount.main++;
            if (baselineCheckCount.main >= BASELINE_CHECKS_REQUIRED) {
              shouldCheckMain = true;
            }
          } else {
            lastCheckedRadar.main = currentMainRadarKey;
            if (lastMainRadarKey === null) {
              // Initial page load — skip baseline wait and check immediately
              baselineCheckCount.main = BASELINE_CHECKS_REQUIRED;
              shouldCheckMain = true;
            } else {
              baselineCheckCount.main = 1;
            }
          }
          if (shouldCheckMain) {
            try {
              const updateAvailable = await radar.isUpdateAvailable(mainRadar.station, mainProduct);
              if (updateAvailable) {
                console.log(`[Main Map] Update available for ${currentMainRadarKey}`);
                await originalSetRadar(null, mainProduct, 'main', { gate_limit: -30 });
                baselineCheckCount.main = 0;
              }
            } catch (error) {
              console.error('Error checking main map update:', error);
            }
          }
        }
      }

      if (map.hasSplitMap() && Date.now() - lastStationChangeTime.split > STATION_CHANGE_DEBOUNCE) {
        const splitProduct = selectedProduct.split || map.currentRadarProductSplit || splitRadar?.product;
        const isRealtimeChunkL2Split = inferLevelFromProduct(splitProduct) === 'L2' && !archiveMode.split && !localFileMode.split;

        if (!isRealtimeChunkL2Split && splitRadar?.station) {
          const currentSplitRadarKey = `${splitRadar.station}_${splitProduct}_${inferLevelFromProduct(splitProduct)}`;
          const lastSplitRadarKey = lastCheckedRadar.split;

          let shouldCheckSplit = false;
          if (lastSplitRadarKey === currentSplitRadarKey) {
            baselineCheckCount.split++;
            if (baselineCheckCount.split >= BASELINE_CHECKS_REQUIRED) {
              shouldCheckSplit = true;
            }
          } else {
            lastCheckedRadar.split = currentSplitRadarKey;
            if (lastSplitRadarKey === null) {
              // Initial page load — skip baseline wait and check immediately
              baselineCheckCount.split = BASELINE_CHECKS_REQUIRED;
              shouldCheckSplit = true;
            } else {
              baselineCheckCount.split = 1;
            }
          }
          if (shouldCheckSplit) {
            try {
              const updateAvailable = await radar.isUpdateAvailable(splitRadar.station, splitProduct);
              if (updateAvailable) {
                console.log(`[Split Map] Update available for ${currentSplitRadarKey}`);
                await originalSetRadar(null, splitProduct, 'split', { gate_limit: -30 });
                baselineCheckCount.split = 0;
              }
            } catch (error) {
              console.error('Error checking split map update:', error);
            }
          }
        }
      }

      if (updateTimes >= 12) {
        console.log('Running secondary updates...');
        map.updateRadarStations();
        map.fetchOutlooks();

        try {
          const layerSettings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
          if (layerSettings.mesoscaleDiscussionsEnabled === true) {
            map.fetchDiscussions();
          }
          if (layerSettings.lightningEnabled === true) {
            map.fetchLightning();
          }
          if (layerSettings.spotterNetworkPositionsEnabled === true) {
            map.fetchSpotterNetworkPositions();
          }
          if (layerSettings.metarStationsEnabled === true) {
            map.fetchMetarStations();
          }
          if (layerSettings.nwsTornadoReportsEnabled === true || layerSettings.nwsWindReportsEnabled === true || layerSettings.nwsHailReportsEnabled === true) {
            map.fetchNwsStormReports();
          }
        } catch (error) {
          console.error('Error loading layer settings for periodic updates:', error);
        }

        updateTimes = 0;
      }

      console.log('[Debug] invoking periodic fetches: alerts, watches, storm-centers');
      map.fetchAlerts();
      map.fetchWatches();
      map.fetchStormCenters();

      console.log('UPDATETIMES:', updateTimes);
    } finally {
      updateInProgress = false;
    }
  };

  // Run immediately on init so layers don't wait for the first 10s tick
  update();

  const updateIntervalId = setInterval(async () => {
    await update();
  }, 10 * 1000);

  const enableAutoUpdates = () => {
    const archiveMode = getArchiveMode();
    const localFileMode = getLocalFileMode();

    autoUpdateEnabled = true;
    archiveMode.main = null;
    archiveMode.split = null;
    localFileMode.main = null;
    localFileMode.split = null;
  };

  const disableAutoUpdates = () => {
    autoUpdateEnabled = false;
  };

  const isAutoUpdateEnabled = () => autoUpdateEnabled;

  const cleanup = () => {
    clearInterval(updateIntervalId);
    window.removeEventListener('sparkradar:l2-chunk-update', onL2ChunkUpdate);

    Object.values(realtimeChunkRefreshState).forEach((state) => {
      if (state.timerId) {
        clearTimeout(state.timerId);
      }
    });
  };

  return {
    setRadar: trackedSetRadar,
    markManualChange,
    enableAutoUpdates,
    disableAutoUpdates,
    isAutoUpdateEnabled,
    cleanup,
    forceUpdate: async () => {
      if (!autoUpdateEnabled) {
        console.warn('Cannot force update while auto-updates are disabled.');
        return;
      }
      await update();
    }
  };
}