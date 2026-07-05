import * as THREE from 'three';
import { createTerrain, setTileHighlighted, getTile, GROUND_SIZE, TILE_SIZE } from './terrain.js';
import { showBuildMenu, hideBuildMenu } from './buildMenu.js';
import { generateBuilding, generateTree } from './generators.js';
import { generateRoad, computeRoadConnections } from './road.js';
import { generateWater, updateWaterTime } from './water.js';
import { getAllPoolMeshes, removeInstance, getInstanceCount, updateInstanceAnimations } from './instancing.js';
import { initDebugPanel, updateDebugStats, setSeedInputValue, setMuteButtonLabel } from './debugPanel.js';
import { saveTownToLocalStorage, loadTownFromLocalStorage } from './save.js';
import { createCharacter } from './character.js';
import { updateDayNightCycle } from './dayNightCycle.js';
import { startAmbientAudio, setAmbientMuted } from './ambientAudio.js';

// ------------------------------------------------------------------
// シーン基本セットアップ
// ------------------------------------------------------------------
const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3f4); // 水色の空

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------
// ライト（低ポリらしい陰影）
// ------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x4b6b3a, 1.1);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff2d6, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ------------------------------------------------------------------
// 地面（10x10のタイルグリッド、flat shadingの緑）
// ------------------------------------------------------------------
const terrain = createTerrain();
scene.add(terrain);

// 建物・木・道路が使うInstancedMeshプールをシーンに追加
getAllPoolMeshes().forEach((mesh) => scene.add(mesh));

// ------------------------------------------------------------------
// キャラクター（腕・脚のあるローポリ人型。服・帽子の色は変更可能）
// ------------------------------------------------------------------
const characterController = createCharacter({ clothingColor: 0x3b6ea5, hatColor: 0xb5533c });
const character = characterController.group;
character.position.set(0, 0, 0);
scene.add(character);

// キャラの向き（Y軸回転）を角度で保持し、毎フレーム滑らかに補間する
let characterFacing = 0;

// ------------------------------------------------------------------
// 入力
// ------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

const isPressed = (...codes) => codes.some((code) => keys[code]);

// ------------------------------------------------------------------
// カメラ（三人称・キャラ追従）
// ------------------------------------------------------------------
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, 7);
const cameraCurrentPosition = new THREE.Vector3()
  .copy(character.position)
  .add(CAMERA_OFFSET);
camera.position.copy(cameraCurrentPosition);

// ------------------------------------------------------------------
// 建築システム（レイキャストでタイル選択 → ホバー表示 → クリックで建築メニュー）
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredTile = null;

// ワールドシード：建物・木の配色パターンをタイル座標と組み合わせて決定論的に決める。
// 同じ座標でもシードを変えれば見た目が一括で変わり、同じシードなら常に同じ町になる。
let worldSeed = 1;

function computeSeed(gridX, gridY, salt = 0) {
  return (worldSeed * 7919 + gridX * 1000 + gridY + salt) >>> 0;
}

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedTile(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(terrain.children, false);
  return intersects.length > 0 ? intersects[0].object : null;
}

/**
 * タイルに置かれているオブジェクトを解放する。
 * 家・木・道路はInstancedMeshのインスタンスなのでプールに返却し、
 * 水は専用メッシュなのでシーンから削除してジオメトリを破棄する
 * （マテリアルは全水タイルで共有しているため破棄しない）。
 */
function clearTileObject(tile) {
  const entry = tile.userData.object;
  if (!entry) return;

  if (entry.kind === 'instances') {
    entry.parts.forEach((part) => removeInstance(part));
  } else if (entry.kind === 'mesh') {
    scene.remove(entry.object3D);
    entry.object3D.geometry.dispose();
  }

  tile.userData.object = null;
}

function getNeighborTiles(tile) {
  const { gridX, gridY } = tile.userData;
  return [
    getTile(terrain, gridX, gridY - 1),
    getTile(terrain, gridX, gridY + 1),
    getTile(terrain, gridX - 1, gridY),
    getTile(terrain, gridX + 1, gridY),
  ].filter(Boolean);
}

/**
 * 道路タイルの見た目（直線・角・T字・十字）を隣接状況から再計算する。
 * 道路以外のタイルには何もしない。
 */
function refreshRoadTile(tile) {
  if (tile.userData.tileType !== 'road') return;
  clearTileObject(tile);
  const connections = computeRoadConnections(terrain, tile.userData.gridX, tile.userData.gridY);
  tile.userData.object = generateRoad(tile.position, connections);
}

/**
 * 選択された種類に応じたオブジェクトをタイル中心に配置する。
 * 家・木・道路はInstancedMeshのインスタンス、水は波アニメーション付きの専用メッシュ。
 * seedはタイル座標から決定論的に算出するため、再構築しても同じ見た目になる。
 */
function buildOnTile(tile, type) {
  clearTileObject(tile);
  tile.userData.tileType = type === 'clear' ? 'grass' : type;

  if (type === 'house') {
    const seed = computeSeed(tile.userData.gridX, tile.userData.gridY);
    tile.userData.object = generateBuilding(seed, type, tile.position);
  } else if (type === 'tree') {
    const seed = computeSeed(tile.userData.gridX, tile.userData.gridY, 500000);
    tile.userData.object = generateTree(seed, undefined, tile.position);
  } else if (type === 'water') {
    const object3D = generateWater(tile.position, TILE_SIZE);
    scene.add(object3D);
    tile.userData.object = { kind: 'mesh', object3D };
  } else if (type === 'road') {
    const connections = computeRoadConnections(terrain, tile.userData.gridX, tile.userData.gridY);
    tile.userData.object = generateRoad(tile.position, connections, { animate: true });
  }

  // このタイルの変化で隣接する道路タイルの接続形状が変わるかもしれないため更新する
  getNeighborTiles(tile).forEach(refreshRoadTile);
}

function getTownStats() {
  let buildingCount = 0;
  let treeCount = 0;
  terrain.children.forEach((tile) => {
    if (tile.userData.tileType === 'house') buildingCount += 1;
    if (tile.userData.tileType === 'tree') treeCount += 1;
  });
  return { tileCount: terrain.children.length, buildingCount, treeCount };
}

function resetTown() {
  terrain.children.forEach((tile) => {
    if (tile.userData.tileType !== 'grass') buildOnTile(tile, 'clear');
  });
}

/**
 * 現在配置されている家・木だけを、現在のワールドシードで作り直す。
 * シード値入力欄が変更されたときに呼ばれる。
 */
function regenerateProceduralTiles() {
  terrain.children.forEach((tile) => {
    const { tileType } = tile.userData;
    if (tileType === 'house' || tileType === 'tree') buildOnTile(tile, tileType);
  });
}

function handleSave() {
  saveTownToLocalStorage(terrain, worldSeed);
}

function handleLoad() {
  const data = loadTownFromLocalStorage();
  if (!data) return;

  resetTown();
  worldSeed = Number.isFinite(data.seed) ? data.seed : 1;
  setSeedInputValue(worldSeed);
  data.cells.forEach((cell) => {
    const tile = getTile(terrain, cell.x, cell.y);
    if (tile) buildOnTile(tile, cell.type);
  });
}

function handleSeedChange(newSeed) {
  worldSeed = newSeed;
  regenerateProceduralTiles();
}

let ambientMuted = false;

function handleToggleMute() {
  ambientMuted = !ambientMuted;
  setAmbientMuted(ambientMuted);
  setMuteButtonLabel(ambientMuted);
}

initDebugPanel({
  onSave: handleSave,
  onLoad: handleLoad,
  onReset: resetTown,
  onSeedChange: handleSeedChange,
  onToggleMute: handleToggleMute,
  onClothingColorChange: (hex) => characterController.setClothingColor(hex),
  onHatColorChange: (hex) => characterController.setHatColor(hex),
});

// ブラウザの自動再生ポリシーのため、最初のキー入力/クリックで環境音を開始する
function beginAudioOnFirstInteraction() {
  startAmbientAudio();
  window.removeEventListener('keydown', beginAudioOnFirstInteraction);
  window.removeEventListener('click', beginAudioOnFirstInteraction);
}
window.addEventListener('keydown', beginAudioOnFirstInteraction, { once: true });
window.addEventListener('click', beginAudioOnFirstInteraction, { once: true });

renderer.domElement.addEventListener('pointermove', (event) => {
  const tile = getIntersectedTile(event);
  if (tile !== hoveredTile) {
    if (hoveredTile) setTileHighlighted(hoveredTile, false);
    hoveredTile = tile;
    if (hoveredTile) setTileHighlighted(hoveredTile, true);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (hoveredTile) setTileHighlighted(hoveredTile, false);
  hoveredTile = null;
});

renderer.domElement.addEventListener('click', (event) => {
  const tile = getIntersectedTile(event);
  if (!tile) {
    hideBuildMenu();
    return;
  }
  showBuildMenu(event.clientX, event.clientY, (type) => {
    buildOnTile(tile, type);
  });
});

// ------------------------------------------------------------------
// メインループ
// ------------------------------------------------------------------
const MOVE_SPEED = 5; // units / sec
const TURN_SMOOTHING = 10; // 大きいほど素早く向きを変える
const CAMERA_SMOOTHING = 4; // 大きいほど素早くカメラが追従する

const clock = new THREE.Clock();
const moveDirection = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();

let fpsFrameCount = 0;
let fpsElapsed = 0;

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);

  updateWaterTime(clock.elapsedTime);
  updateInstanceAnimations(clock.elapsedTime);
  updateDayNightCycle({ elapsed: clock.elapsedTime, scene, dirLight, hemiLight });

  fpsFrameCount += 1;
  fpsElapsed += delta;
  if (fpsElapsed >= 0.5) {
    const fps = Math.round(fpsFrameCount / fpsElapsed);
    const stats = getTownStats();
    updateDebugStats({
      tileCount: stats.tileCount,
      buildingCount: stats.buildingCount,
      treeCount: stats.treeCount,
      fps,
      instanceCount: getInstanceCount(),
    });
    fpsFrameCount = 0;
    fpsElapsed = 0;
  }

  // 入力から移動方向（ワールド座標系）を決定
  moveDirection.set(0, 0, 0);
  if (isPressed('KeyW', 'ArrowUp')) moveDirection.z -= 1;
  if (isPressed('KeyS', 'ArrowDown')) moveDirection.z += 1;
  if (isPressed('KeyA', 'ArrowLeft')) moveDirection.x -= 1;
  if (isPressed('KeyD', 'ArrowRight')) moveDirection.x += 1;

  const isMoving = moveDirection.lengthSq() > 0;
  if (isMoving) {
    moveDirection.normalize();

    character.position.addScaledVector(moveDirection, MOVE_SPEED * delta);

    // 移動方向を向くようにキャラを回転（滑らかに補間）
    const targetFacing = Math.atan2(moveDirection.x, moveDirection.z);
    let angleDiff = targetFacing - characterFacing;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    characterFacing += angleDiff * Math.min(1, TURN_SMOOTHING * delta);
    character.rotation.y = characterFacing;
  }
  characterController.updateWalkAnimation(isMoving, delta);

  // 地面の範囲内にキャラを収める
  const half = GROUND_SIZE / 2 - 0.5;
  character.position.x = THREE.MathUtils.clamp(character.position.x, -half, half);
  character.position.z = THREE.MathUtils.clamp(character.position.z, -half, half);

  // カメラをキャラの向きに応じて斜め後ろ上空に滑らかに追従させる
  const rotatedOffset = CAMERA_OFFSET.clone().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    characterFacing
  );
  desiredCameraPosition.copy(character.position).add(rotatedOffset);
  cameraCurrentPosition.lerp(
    desiredCameraPosition,
    1 - Math.exp(-CAMERA_SMOOTHING * delta)
  );
  camera.position.copy(cameraCurrentPosition);

  const lookTarget = character.position.clone().add(new THREE.Vector3(0, 1, 0));
  camera.lookAt(lookTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
