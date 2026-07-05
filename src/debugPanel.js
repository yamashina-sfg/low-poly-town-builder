const tilesEl = document.getElementById('stat-tiles');
const buildingsEl = document.getElementById('stat-buildings');
const treesEl = document.getElementById('stat-trees');
const fpsEl = document.getElementById('stat-fps');
const instancesEl = document.getElementById('stat-instances');
const seedInput = document.getElementById('seed-input');
const saveButton = document.getElementById('save-button');
const loadButton = document.getElementById('load-button');
const resetButton = document.getElementById('reset-button');
const muteButton = document.getElementById('mute-button');
const clothingColorInput = document.getElementById('clothing-color-input');
const hatColorInput = document.getElementById('hat-color-input');

/**
 * デバッグパネルのボタン・シード入力欄・キャラ色選択にイベントを登録する。
 */
export function initDebugPanel({
  onSave,
  onLoad,
  onReset,
  onSeedChange,
  onToggleMute,
  onClothingColorChange,
  onHatColorChange,
}) {
  saveButton.addEventListener('click', onSave);
  loadButton.addEventListener('click', onLoad);
  resetButton.addEventListener('click', onReset);
  seedInput.addEventListener('change', () => {
    const value = parseInt(seedInput.value, 10);
    onSeedChange(Number.isFinite(value) ? value : 1);
  });
  muteButton.addEventListener('click', onToggleMute);
  clothingColorInput.addEventListener('input', () => onClothingColorChange(clothingColorInput.value));
  hatColorInput.addEventListener('input', () => onHatColorChange(hatColorInput.value));
}

export function setMuteButtonLabel(muted) {
  muteButton.textContent = muted ? '🔇' : '🔊';
}

export function updateDebugStats({ tileCount, buildingCount, treeCount, fps, instanceCount }) {
  tilesEl.textContent = tileCount;
  buildingsEl.textContent = buildingCount;
  treesEl.textContent = treeCount;
  fpsEl.textContent = fps;
  instancesEl.textContent = instanceCount;
}

export function setSeedInputValue(seed) {
  seedInput.value = seed;
}
