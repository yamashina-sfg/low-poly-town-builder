import * as THREE from 'three';
import { setTileHighlighted, getGroundInstancedMesh, getTileByGroundInstanceId } from '../terrain.js';
import { setIndoorTileHighlighted } from '../interior.js';
import { showBuildMenu, hideBuildMenu } from '../buildMenu.js';
import { canAfford, pay } from '../economy.js';
import { isIndoorMode, getIndoorTilesList, buildOnTile, buildOnIndoorTile } from './world.js';
import { getCurrentLockedTypes } from './progression.js';
import { showStatusMessage } from './statusMessage.js';
import { updateResourcePanel } from './resourcePanel.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredTile = null;
let rendererRef = null;
let cameraRef = null;
let onEnterHouseCallback = null;

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

function handlePointerMove(event) {
  const tile = getIntersectedTile(event);
  if (tile !== hoveredTile) {
    if (hoveredTile) highlightTile(hoveredTile, false);
    hoveredTile = tile;
    if (hoveredTile) highlightTile(hoveredTile, true);
  }
}

function handlePointerLeave() {
  clearHoveredTile();
}

function handleClick(event) {
  const tile = getIntersectedTile(event);
  if (!tile) {
    hideBuildMenu();
    return;
  }

  if (!isIndoorMode() && tile.userData.tileType === 'house') {
    onEnterHouseCallback(tile);
    return;
  }

  showBuildMenu(event.clientX, event.clientY, (type) => {
    if (getCurrentLockedTypes().includes(type)) {
      showStatusMessage('まだ解放されていません');
      return;
    }
    if (!canAfford(type)) {
      showStatusMessage('木材またはお金が足りない');
      return;
    }
    pay(type);
    updateResourcePanel();

    if (isIndoorMode()) {
      buildOnIndoorTile(tile, type);
    } else {
      buildOnTile(tile, type);
    }
  });
}

/**
 * レイキャストによるタイル選択（ホバー表示・クリックで建築メニュー）を
 * 有効化する。住居タイルをクリックした場合はonEnterHouseが呼ばれる。
 */
export function initBuildSystem({ renderer, camera, onEnterHouse }) {
  rendererRef = renderer;
  cameraRef = camera;
  onEnterHouseCallback = onEnterHouse;

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('click', handleClick);
}
