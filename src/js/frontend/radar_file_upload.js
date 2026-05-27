import { Buffer } from 'buffer';
import Dialog from '../ui/dialog.js';
import { hideLoadingAnimation, showLoadingAnimation } from '../ui/loader.js';

const inferStationFromUploadedFileName = (fileName, fallbackStation = 'KTLX') => {
  if (!fileName || typeof fileName !== 'string') return fallbackStation;

  const upper = fileName.toUpperCase();
  const direct = upper.match(/\bK[A-Z0-9]{3}\b/);
  if (direct) return direct[0];

  const level2Prefix = upper.match(/^([A-Z0-9]{4})\d{8}_\d{6}/);
  if (level2Prefix) return level2Prefix[1];

  const token = upper.split(/[^A-Z0-9]+/).find((part) => /^[A-Z0-9]{3,4}$/.test(part));
  if (token) return token.length === 3 ? `K${token}` : token;

  return fallbackStation;
};

const createUploadDialogHtml = () => `
  <div style="display:flex;flex-direction:column;gap:12px;">
    <div style="display: flex; flex-direction: row; gap: 10px;">
      <button id="l2select" style="width: 100%; font-size: 1em;" class="active">Level II Archive/Chunk</button>
      <button id="l3select" style="width: 100%; font-size: 1em;">Level III File</button>
    </div>
    <input id="radar-file-input" type="file" style="padding:6px 0;" />
    <button id="radar-file-render" style="width: 100%; font-size: 1em; font-weight: bold;">
      <i class="ti ti-check" style="margin-right: 10px; font-size: 1.5em;"></i>
      Render File
    </button>
  </div>
`;

export const openRadarFileUploadDialog = ({
  map,
  setRadar,
  getMainStation,
  setAutoUpdateEnabled,
  setArchiveMode,
  setLocalFileMode,
  setLocalFileToolbarState,
  enableAutoUpdates,
}) => {
  const dialog = new Dialog('Radar File Upload', 'upload', createUploadDialogHtml());
  const fileInput = document.getElementById('radar-file-input');
  const renderButton = document.getElementById('radar-file-render');

  let selectedFile = null;

  const setSelectedFile = (file) => {
    selectedFile = file || null;
  };

  document.getElementById('l2select')?.addEventListener('click', () => {
    document.getElementById('l2select').classList.add('active');
    document.getElementById('l3select').classList.remove('active');
  });

  document.getElementById('l3select')?.addEventListener('click', () => {
    document.getElementById('l3select').classList.add('active');
    document.getElementById('l2select').classList.remove('active');
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    setSelectedFile(file);
  });

  renderButton?.addEventListener('click', async () => {
    if (!selectedFile) {
      alert('Please select or drop a radar file first.');
      return;
    }

    try {
      showLoadingAnimation();
      renderButton.disabled = true;
      renderButton.textContent = 'Rendering...';

      const l2select = document.getElementById('l2select');
      const selectedLevel = l2select.classList.contains('active') ? 'L2' : 'L3';
      const product = selectedLevel === 'L3' ? 'N0B' : 'REF';
      const rawData = Buffer.from(await selectedFile.arrayBuffer());
      const localFile = {
        rawData,
        fileName: selectedFile.name,
        level: selectedLevel,
        isUploadedArchive: true,
      };
      const station = inferStationFromUploadedFileName(selectedFile.name, getMainStation());

      if (map.crossSection?.enabled) {
        map.disableCrossSection();
      }
      if (map.isSplit()) {
        map.stopSplit();
      }

      setAutoUpdateEnabled(false);
      setArchiveMode('main', null);
      setLocalFileMode('main', localFile);

      // Uploaded files force the picker into archive mode because the data source is fixed.
      map.rebuildRadarPicker('main', selectedLevel === 'L2');
      map.radarPicker.setArchiveMode(true, enableAutoUpdates, 'Viewing local file');
      map.radarPicker.setPickerLocked(selectedLevel === 'L3');
      setLocalFileToolbarState(selectedLevel === 'L3');

      await setRadar(station, product, 'main', {
        rawData,
        fileName: selectedFile.name,
        localFileLevel: selectedLevel,
        isUploadedArchive: true,
        gate_limit: -30,
      });

      dialog.close();
    } catch (error) {
      console.error('Failed to render uploaded radar file:', error);
      alert(`Unable to render file: ${error?.message || 'Unknown error'}`);
    } finally {
      hideLoadingAnimation();
      renderButton.disabled = false;
      renderButton.textContent = 'Render File';
    }
  });
};