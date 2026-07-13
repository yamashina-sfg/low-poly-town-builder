import * as THREE from 'three';
import { setTileHighlighted, getGroundInstancedMesh, getTileByGroundInstanceId } from '../terrain.js';
import { setIndoorTileHighlighted } from '../interior.js';
import { showBuildMenu, hideBuildMenu } from '../buildMenu.js';
import { canAfford, pay, BUILD_COSTS, getWood, getMoney } from '../economy.js';
import { getGlobalTile } from '../chunkManager.js';
import {
  isIndoorMode,
  getIndoorTilesList,
  buildOnTile,
  buildOnIndoorTile,
  isTilePlaceable,
  isStructureTile,
  moveTileContent,
  removeTileContent,
} from './world.js';
import { getCurrentLockedTypes } from './progression.js';
import { showStatusMessage } from './statusMessage.js';
import { updateResourcePanel } from './resourcePanel.js';
import { spawnFloatingNumber } from './floatingNumbers.js';
import { playBuildSound, playRemoveSound, playDeniedSound } from '../ambientAudio.js';
import { notifyTileHovered, notifyBuildMenuOpened } from './tutorial.js';
import {
  initBuildPreview,
  startPreview,
  stopPreview,
  isPreviewActive,
  rotatePreview,
  setRotationSteps,
  getPreviewRotationY,
  updatePreviewPosition,
  setPreviewValid,
} from './buildPreview.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredTile = null;
let rendererRef = null;
let cameraRef = null;
let onEnterHouseCallback = null;

// フェーズ21：建築プレビュー（選んだ種類・「移動」中なら移動元タイル・
// 現在プレビューが乗っているタイル）。
let pendingBuildType = null;
let moveSourceTile = null;
let hoveredPreviewTile = null;

// 既存の建物・装飾をクリックしたときの「入る/移動/撤去」コンテキストメニュー。
const contextMenuEl = document.getElementById('tile-context-menu');
const contextEnterBtn = document.getElementById('context-enter');
const contextMoveBtn = document.getElementById('context-move');
const contextRemoveBtn = document.getElementById('context-remove');
const contextCancelBtn = document.getElementById('context-cancel');
let contextMenuTile = null;

// 建築コスト表示（プレビュー中、マウス付近に必要な木材・お金を表示する）。
const previewCostEl = document.getElementById('build-preview-cost');

// フェーズ21：複数タイルをドラッグ範囲選択して一括撤去するモード。
const rangeSelectToggleBtn = document.getElementById('range-select-toggle');
const rangeSelectConfirmEl = document.getElementById('range-select-confirm');
const rangeSelectCountEl = document.getElementById('range-select-count');
const rangeSelectYesBtn = document.getElementById('range-select-yes');
const rangeSelectNoBtn = document.getElementById('range-select-no');
let rangeSelectMode = false;
let rangeSelectStartTile = null;
let rangeSelectHighlightedTiles = [];
let rangeSelectPendingTiles = [];

function updatePointerFromEvent(event) {
  const rect = rendererRef.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedTile(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, cameraRef);

  if (isIndoorMode()) {
    const intersects = raycaster.intersectObjects(getIndoorTilesList(), false);
    return intersects.length > 0 ? intersects[0].object : null;
  }

  // 屋外の地面はチャンクをまたいだ1つのInstancedMeshなので、
  // レイキャスト結果のinstanceIdから対応するタイルを逆引きする。
  const groundMesh = getGroundInstancedMesh();
  if (!groundMesh) return null;
  const intersects = raycaster.intersectObject(groundMesh, false);
  if (intersects.length === 0) return null;
  return getTileByGroundInstanceId(intersects[0].instanceId);
}

function highlightTile(tile, highlighted) {
  if (isIndoorMode()) {
    setIndoorTileHighlighted(tile, highlighted);
  } else {
    setTileHighlighted(tile, highlighted);
  }
}

/**
 * 入退室などモードが切り替わる直前に呼ぶ。切り替え前のモードに対応した
 * ハイライト関数でホバー状態を消灯してから参照をリセットする
 * （そのまま残すと、次のホバー時に誤ったモードのハイライト関数が
 * 呼ばれてクラッシュする）。
 */
export function clearHoveredTile() {
  if (hoveredTile) {
    highlightTile(hoveredTile, false);
    hoveredTile = null;
  }
}

// ------------------------------------------------------------------
// 建築プレビュー：吸着・回転・重なり判定・キャンセル
// ------------------------------------------------------------------

function isContextMenuOpen() {
  return contextMenuTile !== null;
}

function closeContextMenu() {
  contextMenuTile = null;
  contextMenuEl.classList.add('hidden');
}

function openContextMenu(tile, screenX, screenY) {
  contextMenuTile = tile;
  contextEnterBtn.classList.toggle('hidden', tile.userData.tileType !== 'house');

  const menuWidth = 140;
  const menuHeight = 170;
  const clampedX = Math.min(screenX, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(screenY, window.innerHeight - menuHeight - 8);
  contextMenuEl.style.left = `${Math.max(8, clampedX)}px`;
  contextMenuEl.style.top = `${Math.max(8, clampedY)}px`;
  contextMenuEl.classList.remove('hidden');
}

/**
 * 新規設置・移動どちらの場合でも、指定タイルへ現在のプレビューを
 * 設置できるか（重なり・移動元自身への戻し・資金）を判定する。
 */
function isPlacementValid(tile, type) {
  if (!tile) return false;
  if (moveSourceTile) {
    if (tile === moveSourceTile) return true;
    return isTilePlaceable(tile, type);
  }
  return isTilePlaceable(tile, type) && canAfford(type);
}

function updatePreviewCostLabel(type, event) {
  const cost = BUILD_COSTS[type];
  if (!cost || moveSourceTile) {
    previewCostEl.classList.add('hidden');
    return;
  }
  const insufficient = getWood() < cost.wood || getMoney() < cost.money;
  previewCostEl.textContent = `🪵${cost.wood} 💰${cost.money}`;
  previewCostEl.classList.toggle('insufficient', insufficient);
  previewCostEl.classList.remove('hidden');
  previewCostEl.style.left = `${event.clientX + 18}px`;
  previewCostEl.style.top = `${event.clientY + 18}px`;
}

function stopBuildPreview() {
  stopPreview();
  pendingBuildType = null;
  moveSourceTile = null;
  hoveredPreviewTile = null;
  previewCostEl.classList.add('hidden');
}

function cancelBuildPreview() {
  stopBuildPreview();
  showStatusMessage('キャンセルしました');
}

function beginNewBuildPreview(type) {
  clearHoveredTile();
  moveSourceTile = null;
  pendingBuildType = type;
  startPreview(type);
}

function beginMovePreview(tile) {
  clearHoveredTile();
  moveSourceTile = tile;
  pendingBuildType = tile.userData.tileType;
  startPreview(pendingBuildType);
  const steps = Math.round((tile.userData.rotationY ?? 0) / (Math.PI / 2));
  setRotationSteps(steps);
}

function confirmPreviewPlacement() {
  const tile = hoveredPreviewTile;
  const type = pendingBuildType;
  if (!isPlacementValid(tile, type)) {
    showStatusMessage(moveSourceTile ? 'ここには移動できません' : 'ここには置けません');
    playDeniedSound();
    return;
  }

  const rotationY = getPreviewRotationY();

  if (moveSourceTile) {
    if (tile !== moveSourceTile) {
      moveTileContent(moveSourceTile, tile, rotationY);
    } else {
      buildOnTile(tile, tile.userData.tileType, { rotationY, animate: false });
    }
    showStatusMessage('移動しました');
  } else {
    if (getCurrentLockedTypes().includes(type)) {
      showStatusMessage('まだ解放されていません');
      playDeniedSound();
      stopBuildPreview();
      return;
    }
    if (!canAfford(type)) {
      showStatusMessage('木材またはお金が足りない');
      playDeniedSound();
      return;
    }
    const cost = BUILD_COSTS[type];
    pay(type);
    updateResourcePanel();
    buildOnTile(tile, type, { rotationY });
    playBuildSound();
    if (cost?.wood) spawnFloatingNumber('wood', -cost.wood);
    if (cost?.money) spawnFloatingNumber('money', -cost.money);
    showStatusMessage('設置しました');
  }

  stopBuildPreview();
}

// ------------------------------------------------------------------
// 範囲選択モード：ドラッグで矩形範囲を選び、まとめて撤去する
// ------------------------------------------------------------------

function clearRangeSelectHighlight() {
  rangeSelectHighlightedTiles.forEach((tile) => setTileHighlighted(tile, false));
  rangeSelectHighlightedTiles = [];
}

function clearRangeSelectPending() {
  rangeSelectPendingTiles.forEach((tile) => setTileHighlighted(tile, false));
  rangeSelectPendingTiles = [];
  rangeSelectConfirmEl.classList.add('hidden');
}

function getTilesInRange(tileA, tileB) {
  const { globalX: ax, globalY: ay } = tileA.userData;
  const { globalX: bx, globalY: by } = tileB.userData;
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  const tiles = [];
  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const tile = getGlobalTile(gx, gy);
      if (tile) tiles.push(tile);
    }
  }
  return tiles;
}

function setRangeSelectMode(enabled) {
  rangeSelectMode = enabled;
  rangeSelectToggleBtn.classList.toggle('active', rangeSelectMode);
  rangeSelectStartTile = null;
  clearRangeSelectHighlight();
  clearRangeSelectPending();
  if (rangeSelectMode) {
    stopBuildPreview();
    closeContextMenu();
    hideBuildMenu();
  }
}

// ------------------------------------------------------------------
// ポインター・キーボードイベント
// ------------------------------------------------------------------

function handlePointerMove(event) {
  const tile = getIntersectedTile(event);
  if (tile) notifyTileHovered();

  if (rangeSelectMode) {
    if (rangeSelectStartTile && tile) {
      clearRangeSelectHighlight();
      rangeSelectHighlightedTiles = getTilesInRange(rangeSelectStartTile, tile);
      rangeSelectHighlightedTiles.forEach((t) => setTileHighlighted(t, true));
    }
    return;
  }

  if (isPreviewActive()) {
    hoveredPreviewTile = tile;
    if (tile) {
      updatePreviewPosition(tile.position);
      setPreviewValid(isPlacementValid(tile, pendingBuildType));
    }
    updatePreviewCostLabel(pendingBuildType, event);
    return;
  }

  if (tile !== hoveredTile) {
    if (hoveredTile) highlightTile(hoveredTile, false);
    hoveredTile = tile;
    if (hoveredTile) highlightTile(hoveredTile, true);
  }
}

function handlePointerLeave() {
  clearHoveredTile();
}

function handlePointerDown(event) {
  if (!rangeSelectMode || event.button !== 0) return;
  const tile = getIntersectedTile(event);
  if (!tile) return;
  rangeSelectStartTile = tile;
}

function handlePointerUp(event) {
  if (!rangeSelectMode || !rangeSelectStartTile) return;
  const endTile = getIntersectedTile(event) ?? rangeSelectStartTile;
  const tiles = getTilesInRange(rangeSelectStartTile, endTile);
  rangeSelectStartTile = null;
  clearRangeSelectHighlight();

  rangeSelectPendingTiles = tiles.filter((tile) => tile.userData.tileType !== 'grass');
  if (rangeSelectPendingTiles.length === 0) return;
  rangeSelectPendingTiles.forEach((tile) => setTileHighlighted(tile, true));
  rangeSelectCountEl.textContent = rangeSelectPendingTiles.length;
  rangeSelectConfirmEl.classList.remove('hidden');
}

function handleClick(event) {
  if (rangeSelectMode) return;

  if (isPreviewActive()) {
    confirmPreviewPlacement();
    return;
  }

  if (isContextMenuOpen()) {
    closeContextMenu();
    return;
  }

  const tile = getIntersectedTile(event);
  if (!tile) {
    hideBuildMenu();
    return;
  }

  if (isIndoorMode()) {
    // 屋内の家具は既存の即時設置フローのまま（プレビュー・移動/撤去メニューは屋外のみ）。
    notifyBuildMenuOpened();
    showBuildMenu(event.clientX, event.clientY, (type) => {
      if (!canAfford(type)) {
        showStatusMessage('木材またはお金が足りない');
        playDeniedSound();
        return;
      }
      const cost = BUILD_COSTS[type];
      pay(type);
      updateResourcePanel();
      buildOnIndoorTile(tile, type);
      playBuildSound();
      if (cost?.wood) spawnFloatingNumber('wood', -cost.wood);
      if (cost?.money) spawnFloatingNumber('money', -cost.money);
    });
    return;
  }

  if (isStructureTile(tile)) {
    openContextMenu(tile, event.clientX, event.clientY);
    return;
  }

  // 地形系（更地・木・道・水・橋など）は、これまで通りクリックで建築メニューが
  // 開き、上書きできる（水タイルに橋を架ける操作もここを通る）。
  notifyBuildMenuOpened();
  showBuildMenu(event.clientX, event.clientY, (type) => {
    if (getCurrentLockedTypes().includes(type)) {
      showStatusMessage('まだ解放されていません');
      return;
    }
    beginNewBuildPreview(type);
  });
}

function handleContextMenuEvent(event) {
  event.preventDefault();
  if (isPreviewActive()) cancelBuildPreview();
}

function handleKeyDown(event) {
  if (event.code === 'KeyR') {
    if (isPreviewActive()) rotatePreview();
    return;
  }
  if (event.code === 'Escape') {
    if (isContextMenuOpen()) {
      closeContextMenu();
      event.stopImmediatePropagation();
    } else if (isPreviewActive()) {
      cancelBuildPreview();
      event.stopImmediatePropagation();
    } else if (rangeSelectMode) {
      setRangeSelectMode(false);
      event.stopImmediatePropagation();
    }
  }
}

/**
 * レイキャストによるタイル選択（ホバー表示・クリックで建築メニュー）、
 * 建築プレビュー（吸着・Rキー回転・重なり判定・Esc/右クリックでキャンセル）、
 * 既存物の移動/撤去メニュー、範囲選択による一括撤去を有効化する。
 * 住居タイルをクリックした場合はonEnterHouseが呼ばれる。
 */
export function initBuildSystem({ scene, renderer, camera, onEnterHouse }) {
  rendererRef = renderer;
  cameraRef = camera;
  onEnterHouseCallback = onEnterHouse;

  initBuildPreview(scene);

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('click', handleClick);
  renderer.domElement.addEventListener('contextmenu', handleContextMenuEvent);
  window.addEventListener('keydown', handleKeyDown);

  contextEnterBtn.addEventListener('click', () => {
    if (!contextMenuTile) return;
    const tile = contextMenuTile;
    closeContextMenu();
    onEnterHouseCallback(tile);
  });
  contextMoveBtn.addEventListener('click', () => {
    if (!contextMenuTile) return;
    const tile = contextMenuTile;
    closeContextMenu();
    beginMovePreview(tile);
  });
  contextRemoveBtn.addEventListener('click', () => {
    if (!contextMenuTile) return;
    const tile = contextMenuTile;
    closeContextMenu();
    removeTileContent(tile);
    playRemoveSound();
    showStatusMessage('撤去しました');
  });
  contextCancelBtn.addEventListener('click', () => closeContextMenu());

  rangeSelectToggleBtn.addEventListener('click', () => setRangeSelectMode(!rangeSelectMode));
  rangeSelectYesBtn.addEventListener('click', () => {
    const count = rangeSelectPendingTiles.length;
    rangeSelectPendingTiles.forEach((tile) => removeTileContent(tile));
    // 複数タイルでも音は1回だけ鳴らす（タイル数だけ連打すると耳障りなため）。
    if (count > 0) playRemoveSound();
    clearRangeSelectPending();
    showStatusMessage(`${count}個のタイルを撤去しました`);
  });
  rangeSelectNoBtn.addEventListener('click', () => clearRangeSelectPending());
}
