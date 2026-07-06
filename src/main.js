import * as THREE from 'three';
import { setTileHighlighted, TILE_SIZE } from './terrain.js';
import {
  ensureChunksAround,
  ensureChunkForGlobalTile,
  getGlobalTile,
  getLoadedChunkCount,
  forEachLoadedTile,
  updateChunkVisibility,
  getVisibleTileMeshes,
} from './chunkManager.js';
import { showBuildMenu, hideBuildMenu } from './buildMenu.js';
import { generateBuilding, generateTree } from './generators.js';
import { generateShop, generateWell, generateWarehouse } from './buildingVariants.js';
import { generateBed, generateTable, generateChair, generateFireplace } from './furniture.js';
import {
  generateFence,
  generateStreetlamp,
  generateBench,
  generateFlowerbed,
  generateSignpost,
} from './decorations.js';
import { generateRoad, computeRoadConnections } from './road.js';
import { generateWater, updateWaterTime } from './water.js';
import { getAllPoolMeshes, removeInstance, getInstanceCount, updateInstanceAnimations } from './instancing.js';
import {
  initDebugPanel,
  updateDebugStats,
  setSeedInputValue,
  setMuteButtonLabel,
  updateTimeAndSleepiness,
} from './debugPanel.js';
import { advanceGameTime, getGameTime, formatGameTime, skipTimeToMorning } from './gameTime.js';
import { advanceSleepiness, resetSleepiness, getSleepiness } from './playerStatus.js';
import { saveTownToLocalStorage, loadTownFromLocalStorage } from './save.js';
import { createCharacter } from './character.js';
import { updateDayNightCycle } from './dayNightCycle.js';
import { startAmbientAudio, setAmbientMuted } from './ambientAudio.js';
import {
  initInteriorRoom,
  getIndoorTiles,
  getIndoorSpawnPosition,
  setIndoorTileHighlighted,
  INTERIOR_OFFSET,
  ROOM_SIZE,
} from './interior.js';

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

// 建物・家具・装飾のプロシージャル生成関数レジストリ。
// 種類ごとに専用のseedソルトを与え、同じタイルに異なる種類を
// 建て直しても互いのRNG列が影響し合わないようにする。
const PROCEDURAL_GENERATORS = {
  house: { generate: (seed, pos, opts) => generateBuilding(seed, 'house', pos, opts), salt: 0 },
  shop: { generate: generateShop, salt: 600000 },
  well: { generate: generateWell, salt: 700000 },
  warehouse: { generate: generateWarehouse, salt: 800000 },
  tree: { generate: (seed, pos, opts) => generateTree(seed, undefined, pos, opts), salt: 500000 },
  bed: { generate: generateBed, salt: 900000 },
  table: { generate: generateTable, salt: 1000000 },
  chair: { generate: generateChair, salt: 1100000 },
  fireplace: { generate: generateFireplace, salt: 1200000 },
  fence: { generate: generateFence, salt: 1300000 },
  streetlamp: { generate: generateStreetlamp, salt: 1400000 },
  bench: { generate: generateBench, salt: 1500000 },
  flowerbed: { generate: generateFlowerbed, salt: 1600000 },
  signpost: { generate: generateSignpost, salt: 1700000 },
};

const BUILDING_TYPES = new Set(['house', 'shop', 'well', 'warehouse']);
const FURNITURE_TYPES = new Set(['bed', 'table', 'chair', 'fireplace']);

// ベッドが置かれているタイル（屋内外どちらも）を追跡し、
// キャラが近づいたときに「眠る」操作を出せるようにする。
const bedTiles = new Set();
// タイル間隔(TILE_SIZE=2)より広く取り、隣のタイルに置いたベッドにも反応するようにする
const SLEEP_RANGE = 2.5;

function trackBedTile(tile, type) {
  if (type === 'bed') {
    bedTiles.add(tile);
  } else {
    bedTiles.delete(tile);
  }
}

// ------------------------------------------------------------------
// 建物の内部（住居のみ）：シンプルな1部屋の室内シーン
// ------------------------------------------------------------------
initInteriorRoom(scene);
const indoorTiles = getIndoorTiles();
let indoorMode = false;
let enteredHouseTile = null;
const outdoorReturnPosition = new THREE.Vector3();
let outdoorReturnFacing = 0;

// ------------------------------------------------------------------
// 地面（10x10タイル単位のチャンクが、歩いた先に自動生成される）
// ------------------------------------------------------------------
// ワールドシード：チャンクの自然生成・建物・木の配色パターンを
// タイル座標と組み合わせて決定論的に決める。
// 同じ座標でもシードを変えれば見た目が一括で変わり、
// 同じシードなら同じ場所に戻ったとき常に同じ内容が再現される。
let worldSeed = 1;

// 自然生成でタイルに木などが配置されたときに呼ばれる（ポップアップ演出なし）
function handleProceduralTile(tile, type) {
  buildOnTile(tile, type, { animate: false });
}

let lastCharacterChunk = ensureChunksAround(
  0,
  0,
  { scene, worldSeed, onProceduralTile: handleProceduralTile },
  1
);
updateChunkVisibility(0, 0);

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
const INDOOR_CAMERA_OFFSET = new THREE.Vector3(0, 2.4, 3.2);
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

function computeSeed(globalX, globalY, salt = 0) {
  return (worldSeed * 7919 + globalX * 1000 + globalY + salt) >>> 0;
}

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedTile(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const candidates = indoorMode ? indoorTiles : getVisibleTileMeshes();
  const intersects = raycaster.intersectObjects(candidates, false);
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
  const { globalX, globalY } = tile.userData;
  return [
    getGlobalTile(globalX, globalY - 1),
    getGlobalTile(globalX, globalY + 1),
    getGlobalTile(globalX - 1, globalY),
    getGlobalTile(globalX + 1, globalY),
  ].filter(Boolean);
}

/**
 * 道路タイルの見た目（直線・角・T字・十字）を隣接状況から再計算する。
 * 道路以外のタイルには何もしない。チャンクをまたいだ隣接タイルも参照できる。
 */
function refreshRoadTile(tile) {
  if (tile.userData.tileType !== 'road') return;
  clearTileObject(tile);
  const connections = computeRoadConnections(getGlobalTile, tile.userData.globalX, tile.userData.globalY);
  tile.userData.object = generateRoad(tile.position, connections);
}

/**
 * 選択された種類に応じたオブジェクトをタイル中心に配置する。
 * ほとんどの種類はInstancedMeshのインスタンス、水は波アニメーション付きの専用メッシュ。
 * seedはグローバルタイル座標から決定論的に算出するため、
 * 再構築しても・チャンクを再訪しても同じ見た目になる。
 * animate: falseにすると、自然生成・読込・シード変更時などポップアップ演出を出さない。
 */
function buildOnTile(tile, type, { animate = true } = {}) {
  clearTileObject(tile);
  tile.userData.tileType = type === 'clear' ? 'grass' : type;

  if (type === 'house') {
    // 住居タイルは室内の家具配置(9マス分)を保持する。既存の住居を建て直しても消えない。
    tile.userData.indoorFurniture = tile.userData.indoorFurniture ?? new Array(indoorTiles.length).fill(null);
  } else {
    tile.userData.indoorFurniture = undefined;
  }

  const { globalX, globalY } = tile.userData;
  const generatorEntry = PROCEDURAL_GENERATORS[type];

  if (generatorEntry) {
    const seed = computeSeed(globalX, globalY, generatorEntry.salt);
    tile.userData.object = generatorEntry.generate(seed, tile.position, { animate });
  } else if (type === 'water') {
    const object3D = generateWater(tile.position, TILE_SIZE, { animate });
    scene.add(object3D);
    tile.userData.object = { kind: 'mesh', object3D };
  } else if (type === 'road') {
    const connections = computeRoadConnections(getGlobalTile, globalX, globalY);
    tile.userData.object = generateRoad(tile.position, connections, { animate });
  }

  trackBedTile(tile, type);

  // このタイルの変化で隣接する道路タイルの接続形状が変わるかもしれないため更新する
  getNeighborTiles(tile).forEach(refreshRoadTile);
}

/**
 * 住居タイルに保存されている家具レイアウトから、室内の3x3タイルを作り直す。
 */
function rebuildIndoorFurniture(houseTile) {
  const layout = houseTile.userData.indoorFurniture;
  indoorTiles.forEach((indoorTile) => {
    clearTileObject(indoorTile);
    trackBedTile(indoorTile, null);
    const type = layout[indoorTile.userData.localIndex];
    const generatorEntry = type ? PROCEDURAL_GENERATORS[type] : null;
    if (generatorEntry) {
      const seed = computeSeed(
        houseTile.userData.globalX,
        houseTile.userData.globalY,
        generatorEntry.salt + indoorTile.userData.localIndex
      );
      indoorTile.userData.tileType = type;
      indoorTile.userData.object = generatorEntry.generate(seed, indoorTile.position, { animate: false });
      trackBedTile(indoorTile, type);
    } else {
      indoorTile.userData.tileType = 'grass';
    }
  });
}

/**
 * 室内の家具配置を変更する（家具カテゴリのみ、または更地に戻す）。
 */
function buildOnIndoorTile(indoorTile, type) {
  if (!enteredHouseTile) return;
  if (type !== 'clear' && !FURNITURE_TYPES.has(type)) return;

  const layout = enteredHouseTile.userData.indoorFurniture;
  layout[indoorTile.userData.localIndex] = type === 'clear' ? null : type;

  clearTileObject(indoorTile);
  const generatorEntry = type === 'clear' ? null : PROCEDURAL_GENERATORS[type];
  if (generatorEntry) {
    const seed = computeSeed(
      enteredHouseTile.userData.globalX,
      enteredHouseTile.userData.globalY,
      generatorEntry.salt + indoorTile.userData.localIndex
    );
    indoorTile.userData.tileType = type;
    indoorTile.userData.object = generatorEntry.generate(seed, indoorTile.position, { animate: true });
  } else {
    indoorTile.userData.tileType = 'grass';
  }
  trackBedTile(indoorTile, type === 'clear' ? null : type);
}

/**
 * テレポート（入室・退室）直後にカメラが古い位置から緩やかに追従してしまい
 * 何も見えない空白フレームが出ないよう、カメラを即座にキャラの背後へスナップする。
 */
function snapCameraToCharacter() {
  const offset = indoorMode ? INDOOR_CAMERA_OFFSET : CAMERA_OFFSET;
  const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), characterFacing);
  cameraCurrentPosition.copy(character.position).add(rotatedOffset);
  camera.position.copy(cameraCurrentPosition);
  camera.lookAt(character.position.clone().add(new THREE.Vector3(0, 1, 0)));
}

function enterHouse(houseTile) {
  if (indoorMode) return;
  outdoorReturnPosition.copy(character.position);
  outdoorReturnFacing = characterFacing;
  enteredHouseTile = houseTile;
  indoorMode = true;

  rebuildIndoorFurniture(houseTile);
  const spawn = getIndoorSpawnPosition();
  character.position.copy(spawn);
  characterFacing = 0;
  character.rotation.y = 0;
  characterController.group.scale.setScalar(0.7);
  snapCameraToCharacter();

  document.getElementById('exit-building-button').classList.remove('hidden');
}

function exitHouse() {
  if (!indoorMode) return;
  indoorMode = false;
  enteredHouseTile = null;

  character.position.copy(outdoorReturnPosition);
  characterFacing = outdoorReturnFacing;
  character.rotation.y = outdoorReturnFacing;
  characterController.group.scale.setScalar(1);
  snapCameraToCharacter();

  hideBuildMenu();
  document.getElementById('exit-building-button').classList.add('hidden');
}

let nearBed = false;

/**
 * ベッドに近づいて眠る：時間を朝まで進め、眠気をリセットする。
 */
function sleep() {
  if (!nearBed) return;
  skipTimeToMorning();
  resetSleepiness();
}

function getTownStats() {
  let buildingCount = 0;
  let treeCount = 0;
  let tileCount = 0;
  forEachLoadedTile((tile) => {
    tileCount += 1;
    if (BUILDING_TYPES.has(tile.userData.tileType)) buildingCount += 1;
    if (tile.userData.tileType === 'tree') treeCount += 1;
  });
  return { tileCount, buildingCount, treeCount, chunkCount: getLoadedChunkCount() };
}

function resetTown() {
  forEachLoadedTile((tile) => {
    if (tile.userData.tileType !== 'grass') buildOnTile(tile, 'clear', { animate: false });
  });
}

/**
 * 現在配置されている家・木だけを、現在のワールドシードで作り直す。
 * シード値入力欄が変更されたときに呼ばれる。
 */
function regenerateProceduralTiles() {
  forEachLoadedTile((tile) => {
    const { tileType } = tile.userData;
    if (PROCEDURAL_GENERATORS[tileType]) buildOnTile(tile, tileType, { animate: false });
  });
}

function handleSave() {
  saveTownToLocalStorage(forEachLoadedTile, worldSeed);
}

function handleLoad() {
  const data = loadTownFromLocalStorage();
  if (!data) return;

  resetTown();
  worldSeed = Number.isFinite(data.seed) ? data.seed : 1;
  setSeedInputValue(worldSeed);
  data.cells.forEach((cell) => {
    ensureChunkForGlobalTile(cell.x, cell.y, { scene, worldSeed, onProceduralTile: handleProceduralTile });
    const tile = getGlobalTile(cell.x, cell.y);
    if (tile) buildOnTile(tile, cell.type, { animate: false });
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

function highlightTile(tile, highlighted) {
  if (indoorMode) {
    setIndoorTileHighlighted(tile, highlighted);
  } else {
    setTileHighlighted(tile, highlighted);
  }
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const tile = getIntersectedTile(event);
  if (tile !== hoveredTile) {
    if (hoveredTile) highlightTile(hoveredTile, false);
    hoveredTile = tile;
    if (hoveredTile) highlightTile(hoveredTile, true);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (hoveredTile) highlightTile(hoveredTile, false);
  hoveredTile = null;
});

renderer.domElement.addEventListener('click', (event) => {
  const tile = getIntersectedTile(event);
  if (!tile) {
    hideBuildMenu();
    return;
  }

  if (!indoorMode && tile.userData.tileType === 'house') {
    enterHouse(tile);
    return;
  }

  showBuildMenu(event.clientX, event.clientY, (type) => {
    if (indoorMode) {
      buildOnIndoorTile(tile, type);
    } else {
      buildOnTile(tile, type);
    }
  });
});

document.getElementById('exit-building-button').addEventListener('click', exitHouse);
document.getElementById('sleep-prompt').addEventListener('click', sleep);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && indoorMode) exitHouse();
  if (event.code === 'KeyE') sleep();
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

  advanceGameTime(delta);
  advanceSleepiness(delta);
  const { dayFraction } = getGameTime();
  updateDayNightCycle({ dayFraction, scene, dirLight, hemiLight });

  // ベッドに近づいたら「眠る」プロンプトを表示する
  let nearestBedDistance = Infinity;
  bedTiles.forEach((bedTile) => {
    nearestBedDistance = Math.min(nearestBedDistance, character.position.distanceTo(bedTile.position));
  });
  const wasNearBed = nearBed;
  nearBed = nearestBedDistance <= SLEEP_RANGE;
  if (nearBed !== wasNearBed) {
    document.getElementById('sleep-prompt').classList.toggle('hidden', !nearBed);
  }

  fpsFrameCount += 1;
  fpsElapsed += delta;
  if (fpsElapsed >= 0.5) {
    const fps = Math.round(fpsFrameCount / fpsElapsed);
    const stats = getTownStats();
    updateDebugStats({
      tileCount: stats.tileCount,
      buildingCount: stats.buildingCount,
      treeCount: stats.treeCount,
      chunkCount: stats.chunkCount,
      fps,
      instanceCount: getInstanceCount(),
    });
    updateTimeAndSleepiness(formatGameTime(), Math.round(getSleepiness()));
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

  if (indoorMode) {
    // 室内では部屋の範囲内にキャラを収める（チャンクの生成・可視化更新は行わない）
    const roomHalf = ROOM_SIZE / 2 - 0.4;
    character.position.x = THREE.MathUtils.clamp(
      character.position.x,
      INTERIOR_OFFSET.x - roomHalf,
      INTERIOR_OFFSET.x + roomHalf
    );
    character.position.z = THREE.MathUtils.clamp(
      character.position.z,
      INTERIOR_OFFSET.z - roomHalf,
      INTERIOR_OFFSET.z + roomHalf
    );
  } else if (isMoving) {
    // キャラが今いるチャンクが変わったら、周囲3x3チャンクの生成漏れを埋め、
    // 遠くのチャンクは非表示にして描画をスキップする
    const currentChunk = ensureChunksAround(
      character.position.x,
      character.position.z,
      { scene, worldSeed, onProceduralTile: handleProceduralTile }
    );
    if (currentChunk.cx !== lastCharacterChunk.cx || currentChunk.cy !== lastCharacterChunk.cy) {
      updateChunkVisibility(character.position.x, character.position.z);
      lastCharacterChunk = currentChunk;
    }
  }

  // カメラをキャラの向きに応じて斜め後ろ上空に滑らかに追従させる（室内では近め）
  const activeCameraOffset = indoorMode ? INDOOR_CAMERA_OFFSET : CAMERA_OFFSET;
  const rotatedOffset = activeCameraOffset.clone().applyAxisAngle(
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
