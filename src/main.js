import * as THREE from 'three';
import {
  setTileHighlighted,
  getGroundInstancedMesh,
  getTileByGroundInstanceId,
  TILE_SIZE,
} from './terrain.js';
import {
  ensureChunkForGlobalTile,
  updateChunkStreaming,
  getGlobalTile,
  getLoadedChunkCount,
  forEachLoadedTile,
  worldToChunkCoords,
  worldToGlobalTileCoords,
  CHUNK_SIZE,
} from './chunkManager.js';
import { resolveCollisionAgainstTiles, pushEntitiesApart } from './collision.js';
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
import {
  getAllPoolMeshes,
  removeInstance,
  getInstanceCount,
  updateInstanceAnimations,
  setInstancingScene,
} from './instancing.js';
import {
  initDebugPanel,
  updateDebugStats,
  setSeedInputValue,
  setMuteButtonLabel,
  updateTimeAndSleepiness,
} from './debugPanel.js';
import { advanceGameTime, getGameTime, formatGameTime, skipTimeToMorning } from './gameTime.js';
import { advanceSleepiness, resetSleepiness, getSleepiness } from './playerStatus.js';
import {
  getWood,
  getMoney,
  canAfford,
  pay,
  addWood,
  trySpendMoney,
  trySpendWood,
  addMoney,
  setResources,
} from './economy.js';
import { saveTownToLocalStorage, loadTownFromLocalStorage } from './save.js';
import { createCharacter } from './character.js';
import { createNPC } from './npc.js';
import { createBird, createDog } from './creatures.js';
import { updateDayNightCycle } from './dayNightCycle.js';
import { startAmbientAudio, setAmbientMuted, playFootstep } from './ambientAudio.js';
import { spawnParticleBurst, spawnSparkle, updateParticles } from './particles.js';
import { initMinimap, updateMinimap } from './minimap.js';
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

// 建物数・木の数は毎回全タイルを舐めて数え直すのではなく、
// タイル種別が変わった瞬間に増減させるインクリメンタルなカウンターで管理する
// （チャンクが増えても集計コストが増えないようにするため）。
let liveBuildingCount = 0;
let liveTreeCount = 0;

function trackTileTypeAdded(type) {
  if (BUILDING_TYPES.has(type)) liveBuildingCount += 1;
  if (type === 'tree') liveTreeCount += 1;
}

function trackTileTypeRemoved(type) {
  if (BUILDING_TYPES.has(type)) liveBuildingCount -= 1;
  if (type === 'tree') liveTreeCount -= 1;
}

// ベッド・木・お店が置かれているタイル（屋内外どちらも）を追跡し、
// キャラが近づいたときに「眠る/伐採する/お店を開く」操作を出せるようにする。
const bedTiles = new Set();
const treeTiles = new Set();
const shopTiles = new Set();
// 水面のきらめきパーティクルをたまに出すための水タイル一覧
const waterTiles = new Set();
// タイル間隔(TILE_SIZE=2)より広く取り、隣のタイルに置いたものにも反応するようにする
const INTERACTION_RANGE = 2.5;

function trackInteractiveTile(tile, type) {
  bedTiles.delete(tile);
  treeTiles.delete(tile);
  shopTiles.delete(tile);
  waterTiles.delete(tile);
  if (type === 'bed') bedTiles.add(tile);
  else if (type === 'tree') treeTiles.add(tile);
  else if (type === 'shop') shopTiles.add(tile);
  else if (type === 'water') waterTiles.add(tile);
}

function findNearestTile(tileSet) {
  let nearest = null;
  let nearestDistance = Infinity;
  tileSet.forEach((tile) => {
    const distance = character.position.distanceTo(tile.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = tile;
    }
  });
  return { tile: nearest, distance: nearestDistance };
}

// ------------------------------------------------------------------
// 衝突判定：建物・木・水・家具などにぶつかって歩けないようにする
// ------------------------------------------------------------------
const PLAYER_COLLISION_RADIUS = 0.35;
const NPC_COLLISION_RADIUS = 0.35;
const DOG_COLLISION_RADIUS = 0.22;

/**
 * ワールド座標(x, z)周辺3x3タイル分をグローバルタイル座標から直接引く。
 * チャンク数に関係なく常に高々9回のルックアップで済む
 * （全タイルを舐めるO(n)処理を避けるため）。
 */
function getNearbyOutdoorTiles(x, z) {
  const { gx, gy } = worldToGlobalTileCoords(x, z);
  const tiles = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      tiles.push(getGlobalTile(gx + dx, gy + dy));
    }
  }
  return tiles;
}

function resolveOutdoorCollision(position, radius) {
  resolveCollisionAgainstTiles(position, radius, getNearbyOutdoorTiles(position.x, position.z));
}

// ------------------------------------------------------------------
// 建物の内部（住居のみ）：シンプルな1部屋の室内シーン
// ------------------------------------------------------------------
initInteriorRoom(scene);
initMinimap();
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

/**
 * 以前アンロードされ差分キャッシュに残っていたタイル（プレイヤーが手を
 * 加えたもの）を、チャンク再訪時に復元する。セーブデータ読込時のセル
 * 復元とも共通のロジック。
 */
function handleRestoreTile(tile, type, furniture) {
  buildOnTile(tile, type, { animate: false });
  if (type === 'house' && Array.isArray(furniture)) {
    tile.userData.indoorFurniture = furniture.slice();
  }
}

/**
 * チャンクがアンロードされる際、タイルに置かれていた建物・木などの
 * InstancedMeshインスタンスを解放し、集計カウンターからも取り除く。
 */
function handleTileDispose(tile) {
  trackTileTypeRemoved(tile.userData.tileType);
  clearTileObject(tile);
}

// 建物・木・道路・地面タイルが使うInstancedMeshプールをシーンに追加し、
// 以後プールが動的に拡張されたときも自動でシーンに反映されるようにする
setInstancingScene(scene);
getAllPoolMeshes().forEach((mesh) => scene.add(mesh));

let lastCharacterChunk = updateChunkStreaming(0, 0, {
  worldSeed,
  onProceduralTile: handleProceduralTile,
  onRestoreTile: handleRestoreTile,
  onTileDispose: handleTileDispose,
});

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
// NPC・小動物：プレイヤーと同じ生成ロジックを色違いで流用し、
// 決まった範囲をゆっくり徘徊するだけのシンプルな挙動
// ------------------------------------------------------------------
const NPC_CLOTHING_COLORS = [0xc94c4c, 0x4c7ac9, 0xc9a94c, 0x4cae7a, 0x8a5fd9, 0xe07a9a];
const NPC_HAT_COLORS = [0x5c5c5c, 0x7a4a3a, 0x3f6b3a, 0x455a64];

const npcs = [];
for (let i = 0; i < 6; i += 1) {
  const angle = (i / 6) * Math.PI * 2;
  const homeDistance = 8 + Math.random() * 10;
  const npc = createNPC({
    homeX: Math.cos(angle) * homeDistance,
    homeZ: Math.sin(angle) * homeDistance,
    clothingColor: NPC_CLOTHING_COLORS[i % NPC_CLOTHING_COLORS.length],
    hatColor: NPC_HAT_COLORS[i % NPC_HAT_COLORS.length],
    radius: 4 + Math.random() * 2,
    speed: 1 + Math.random() * 0.6,
  });
  scene.add(npc.group);
  npcs.push(npc);
}

const birds = [];
for (let i = 0; i < 3; i += 1) {
  const bird = createBird({
    centerX: (Math.random() - 0.5) * 20,
    centerZ: (Math.random() - 0.5) * 20,
    height: 5 + Math.random() * 2,
    radius: 3 + Math.random() * 3,
    speed: 0.5 + Math.random() * 0.4,
  });
  scene.add(bird.group);
  birds.push(bird);
}

const dogs = [];
for (let i = 0; i < 2; i += 1) {
  const dog = createDog({
    homeX: (Math.random() - 0.5) * 16,
    homeZ: (Math.random() - 0.5) * 16,
    radius: 3 + Math.random() * 2,
  });
  scene.add(dog.group);
  dogs.push(dog);
}

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
// Z成分は負（キャラの進行方向=forwardの逆側）にすることで、
// カメラが常にキャラの「後方」に位置するようにする。
// （+forward*dist は前方に回り込んでしまい、前進するとキャラがカメラに
// 近づいて見える不具合の原因だった）
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, -7);
const INDOOR_CAMERA_OFFSET = new THREE.Vector3(0, 2.4, -3.2);
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

  if (indoorMode) {
    const intersects = raycaster.intersectObjects(indoorTiles, false);
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
  trackTileTypeRemoved(tile.userData.tileType);
  tile.userData.tileType = type === 'clear' ? 'grass' : type;
  trackTileTypeAdded(tile.userData.tileType);

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

  trackInteractiveTile(tile, type);

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
    trackInteractiveTile(indoorTile, null);
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
      trackInteractiveTile(indoorTile, type);
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
  trackInteractiveTile(indoorTile, type === 'clear' ? null : type);
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
  // ホバー中のタイル参照を、切り替わる前の（屋外の）ハイライト関数で
  // きちんと消灯してからリセットする（そのまま残すと、次にホバーが
  // 動いたときに屋内のハイライト関数が屋外タイルへ誤って呼ばれてしまう）
  if (hoveredTile) {
    setTileHighlighted(hoveredTile, false);
    hoveredTile = null;
  }

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
  if (hoveredTile) {
    setIndoorTileHighlighted(hoveredTile, false);
    hoveredTile = null;
  }

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

// 現在キャラが操作できる対象（ベッド/木/お店のうち最も近いもの）
let interactionTarget = null;

const ACTION_PROMPT_LABELS = {
  bed: 'Eキーで眠る',
  tree: 'Eキーで伐採する',
  shop: 'Eキーでお店を開く',
};

function updateActionPrompt() {
  const promptEl = document.getElementById('action-prompt');
  if (interactionTarget) {
    promptEl.textContent = ACTION_PROMPT_LABELS[interactionTarget.type];
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }
}

function showStatusMessage(text) {
  const el = document.getElementById('status-message');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(showStatusMessage.timeoutId);
  showStatusMessage.timeoutId = setTimeout(() => el.classList.add('hidden'), 2000);
}

/**
 * ベッドに近づいて眠る：時間を朝まで進め、眠気をリセットする。
 */
function sleep() {
  skipTimeToMorning();
  resetSleepiness();
  showStatusMessage('ぐっすり眠った。朝になった。');
}

/**
 * 木に近づいて伐採する：木材を入手し、タイルを更地に戻す。
 */
function chopTree(tile) {
  const amount = 3 + Math.floor(Math.random() * 4);
  addWood(amount);
  const leafPosition = tile.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  spawnParticleBurst(scene, {
    position: leafPosition,
    count: 10,
    color: 0x6b8e3d,
    size: 0.1,
    speed: 2.2,
    life: 1,
    gravity: -3,
  });
  buildOnTile(tile, 'clear');
  showStatusMessage(`木材を${amount}個手に入れた`);
}

function updateResourcePanel() {
  document.getElementById('resource-wood').textContent = getWood();
  document.getElementById('resource-money').textContent = getMoney();
}

function openShop() {
  document.getElementById('shop-wood').textContent = getWood();
  document.getElementById('shop-money').textContent = getMoney();
  document.getElementById('shop-panel').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shop-panel').classList.add('hidden');
}

function handleActionKey() {
  if (!interactionTarget) return;
  if (interactionTarget.type === 'bed') sleep();
  else if (interactionTarget.type === 'tree') chopTree(interactionTarget.tile);
  else if (interactionTarget.type === 'shop') openShop();
}

function getTownStats() {
  // 全タイルを舐めるO(n)処理ではなく、チャンク数からの計算とインクリメンタルな
  // カウンターだけで求める（探索が進んでも集計コストが増えない）。
  const chunkCount = getLoadedChunkCount();
  return {
    tileCount: chunkCount * CHUNK_SIZE * CHUNK_SIZE,
    buildingCount: liveBuildingCount,
    treeCount: liveTreeCount,
    chunkCount,
  };
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
  saveTownToLocalStorage(forEachLoadedTile, worldSeed, { wood: getWood(), money: getMoney() });
  showStatusMessage('セーブしました');
}

function handleLoad() {
  const data = loadTownFromLocalStorage();
  if (!data) {
    showStatusMessage('セーブデータが見つからない');
    return;
  }

  resetTown();
  worldSeed = Number.isFinite(data.seed) ? data.seed : 1;
  setSeedInputValue(worldSeed);

  if (data.economy) {
    setResources(data.economy);
    updateResourcePanel();
  }

  data.cells.forEach((cell) => {
    ensureChunkForGlobalTile(cell.x, cell.y, { worldSeed, onProceduralTile: handleProceduralTile });
    const tile = getGlobalTile(cell.x, cell.y);
    if (!tile) return;
    handleRestoreTile(tile, cell.type, cell.furniture);
  });
  showStatusMessage('読み込みました');
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
    if (!canAfford(type)) {
      showStatusMessage('木材またはお金が足りない');
      return;
    }
    pay(type);
    updateResourcePanel();

    if (indoorMode) {
      buildOnIndoorTile(tile, type);
    } else {
      buildOnTile(tile, type);
    }
  });
});

document.getElementById('exit-building-button').addEventListener('click', exitHouse);
document.getElementById('action-prompt').addEventListener('click', handleActionKey);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && indoorMode) exitHouse();
  if (event.code === 'KeyE') handleActionKey();
});

document.getElementById('shop-close').addEventListener('click', closeShop);
document.getElementById('shop-sell-wood').addEventListener('click', () => {
  if (trySpendWood(10)) {
    addMoney(15);
    showStatusMessage('木材10を売って15円手に入れた');
  } else {
    showStatusMessage('木材が足りない');
  }
  openShop();
});
document.getElementById('shop-buy-wood').addEventListener('click', () => {
  if (trySpendMoney(20)) {
    addWood(10);
    showStatusMessage('木材10を買った');
  } else {
    showStatusMessage('お金が足りない');
  }
  openShop();
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
let footstepTimer = 0;
let sparkleTimer = 0;
let minimapTimer = 0;

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);

  updateParticles(delta);

  updateWaterTime(clock.elapsedTime);
  updateInstanceAnimations(clock.elapsedTime);

  advanceGameTime(delta);
  advanceSleepiness(delta);
  const { dayFraction } = getGameTime();
  updateDayNightCycle({ dayFraction, scene, dirLight, hemiLight });

  // ベッド・木・お店のうち最も近いものを操作対象にする（優先度: ベッド＞木＞お店）
  const bedNear = findNearestTile(bedTiles);
  const treeNear = findNearestTile(treeTiles);
  const shopNear = findNearestTile(shopTiles);

  let newTarget = null;
  if (bedNear.distance <= INTERACTION_RANGE) newTarget = { type: 'bed', tile: bedNear.tile };
  else if (treeNear.distance <= INTERACTION_RANGE) newTarget = { type: 'tree', tile: treeNear.tile };
  else if (shopNear.distance <= INTERACTION_RANGE) newTarget = { type: 'shop', tile: shopNear.tile };

  if (newTarget?.type !== interactionTarget?.type || newTarget?.tile !== interactionTarget?.tile) {
    interactionTarget = newTarget;
    updateActionPrompt();
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
    updateResourcePanel();
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

  // 歩いている間、一定間隔で足音を鳴らす
  if (isMoving) {
    footstepTimer += delta;
    if (footstepTimer >= 0.35) {
      playFootstep();
      footstepTimer = 0;
    }
  } else {
    footstepTimer = 0;
  }

  // 水タイルにときどききらめきパーティクルを出す
  sparkleTimer += delta;
  if (sparkleTimer >= 0.4 && waterTiles.size > 0) {
    sparkleTimer = 0;
    const index = Math.floor(Math.random() * waterTiles.size);
    let i = 0;
    for (const waterTile of waterTiles) {
      if (i === index) {
        spawnSparkle(scene, waterTile.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
        break;
      }
      i += 1;
    }
  }

  // ミニマップは毎フレームではなく間引いて更新する
  minimapTimer += delta;
  if (minimapTimer >= 0.15) {
    minimapTimer = 0;
    updateMinimap({ characterPosition: character.position, characterFacing, forEachLoadedTile });
  }

  npcs.forEach((npc) => npc.update(delta));
  dogs.forEach((dog) => dog.update(delta));
  birds.forEach((bird) => bird.update(clock.elapsedTime));

  // NPC・犬も建物や木にぶつかって歩けないようにする（屋外専用、常に屋外にいる）
  npcs.forEach((npc) => resolveOutdoorCollision(npc.group.position, NPC_COLLISION_RADIUS));
  dogs.forEach((dog) => resolveOutdoorCollision(dog.group.position, DOG_COLLISION_RADIUS));

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
    resolveCollisionAgainstTiles(character.position, PLAYER_COLLISION_RADIUS, indoorTiles);
  } else {
    resolveOutdoorCollision(character.position, PLAYER_COLLISION_RADIUS);

    if (isMoving) {
      // キャラが今いるチャンクが変わったときだけ、周囲3x3チャンクの生成漏れを
      // 埋め、それより外側のチャンクは実際にアンロード（破棄）する
      const currentChunkCoords = worldToChunkCoords(character.position.x, character.position.z);
      if (currentChunkCoords.cx !== lastCharacterChunk.cx || currentChunkCoords.cy !== lastCharacterChunk.cy) {
        lastCharacterChunk = updateChunkStreaming(character.position.x, character.position.z, {
          worldSeed,
          onProceduralTile: handleProceduralTile,
          onRestoreTile: handleRestoreTile,
          onTileDispose: handleTileDispose,
        });
      }
    }

    // プレイヤー・NPC・犬同士がすり抜けないよう、ゆるく押し出し合う
    const creatures = [
      ...npcs.map((npc) => ({ position: npc.group.position, radius: NPC_COLLISION_RADIUS })),
      ...dogs.map((dog) => ({ position: dog.group.position, radius: DOG_COLLISION_RADIUS })),
    ];
    creatures.forEach((creature) => {
      pushEntitiesApart(character.position, PLAYER_COLLISION_RADIUS, creature.position, creature.radius);
    });
    for (let i = 0; i < creatures.length; i += 1) {
      for (let j = i + 1; j < creatures.length; j += 1) {
        pushEntitiesApart(creatures[i].position, creatures[i].radius, creatures[j].position, creatures[j].radius);
      }
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

updateResourcePanel();
requestAnimationFrame(animate);
