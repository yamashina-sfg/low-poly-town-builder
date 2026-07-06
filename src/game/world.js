import { TILE_SIZE } from '../terrain.js';
import {
  ensureChunkForGlobalTile,
  updateChunkStreaming,
  getGlobalTile,
  getLoadedChunkCount,
  forEachLoadedTile,
  worldToChunkCoords,
  worldToGlobalTileCoords,
  CHUNK_SIZE,
} from '../chunkManager.js';
import { resolveCollisionAgainstTiles } from '../collision.js';
import { generateBuilding, generateTree } from '../generators.js';
import { generateShop, generateWell, generateWarehouse } from '../buildingVariants.js';
import { generateBed, generateTable, generateChair, generateFireplace } from '../furniture.js';
import {
  generateFence,
  generateStreetlamp,
  generateBench,
  generateFlowerbed,
  generateSignpost,
} from '../decorations.js';
import { generateRoad, computeRoadConnections } from '../road.js';
import { generateWater } from '../water.js';
import { removeInstance } from '../instancing.js';
import { getWood, getMoney, setResources } from '../economy.js';
import { saveTownToLocalStorage, loadTownFromLocalStorage } from '../save.js';
import { getIndoorTiles, getIndoorSpawnPosition } from '../interior.js';

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

export const BUILDING_TYPES = new Set(['house', 'shop', 'well', 'warehouse']);
export const FURNITURE_TYPES = new Set(['bed', 'table', 'chair', 'fireplace']);

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

export function getBedTiles() {
  return bedTiles;
}
export function getTreeTiles() {
  return treeTiles;
}
export function getShopTiles() {
  return shopTiles;
}
export function getWaterTiles() {
  return waterTiles;
}

let sceneRef = null;
// ワールドシード：チャンクの自然生成・建物・木の配色パターンを
// タイル座標と組み合わせて決定論的に決める。
let worldSeed = 1;
let lastCharacterChunk = { cx: 0, cy: 0 };

const indoorTiles = getIndoorTiles();
let indoorMode = false;
let enteredHouseTile = null;

export function getWorldSeed() {
  return worldSeed;
}

export function isIndoorMode() {
  return indoorMode;
}

export function getIndoorTilesList() {
  return indoorTiles;
}

export function getEnteredHouseTile() {
  return enteredHouseTile;
}

function computeSeed(globalX, globalY, salt = 0) {
  return (worldSeed * 7919 + globalX * 1000 + globalY + salt) >>> 0;
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
    sceneRef.remove(entry.object3D);
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
export function buildOnTile(tile, type, { animate = true } = {}) {
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
    sceneRef.add(object3D);
    tile.userData.object = { kind: 'mesh', object3D };
  } else if (type === 'road') {
    const connections = computeRoadConnections(getGlobalTile, globalX, globalY);
    tile.userData.object = generateRoad(tile.position, connections, { animate });
  }

  trackInteractiveTile(tile, type);

  // このタイルの変化で隣接する道路タイルの接続形状が変わるかもしれないため更新する
  getNeighborTiles(tile).forEach(refreshRoadTile);
}

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
        generatorEntry.salt + indoorTile.userData.localIndex,
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
 * 住居に入室する。室内の家具レイアウトを作り直し、スポーン地点を返す。
 */
export function enterIndoorSession(houseTile) {
  enteredHouseTile = houseTile;
  indoorMode = true;
  rebuildIndoorFurniture(houseTile);
  return getIndoorSpawnPosition();
}

export function exitIndoorSession() {
  indoorMode = false;
  enteredHouseTile = null;
}

/**
 * 室内の家具配置を変更する（家具カテゴリのみ、または更地に戻す）。
 */
export function buildOnIndoorTile(indoorTile, type) {
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
      generatorEntry.salt + indoorTile.userData.localIndex,
    );
    indoorTile.userData.tileType = type;
    indoorTile.userData.object = generatorEntry.generate(seed, indoorTile.position, { animate: true });
  } else {
    indoorTile.userData.tileType = 'grass';
  }
  trackInteractiveTile(indoorTile, type === 'clear' ? null : type);
}

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

export function resolveOutdoorCollision(position, radius) {
  resolveCollisionAgainstTiles(position, radius, getNearbyOutdoorTiles(position.x, position.z));
}

export function resolveIndoorCollision(position, radius) {
  resolveCollisionAgainstTiles(position, radius, indoorTiles);
}

export function getTownStats() {
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

export function resetTown() {
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

export function changeWorldSeed(newSeed) {
  worldSeed = newSeed;
  regenerateProceduralTiles();
}

/**
 * 建物・木・地面・道路が使うInstancedMeshプールをシーンに登録し、
 * キャラの初期位置周辺のチャンクを読み込む。
 */
export function initWorld(scene) {
  sceneRef = scene;
  lastCharacterChunk = updateChunkStreaming(0, 0, {
    worldSeed,
    onProceduralTile: handleProceduralTile,
    onRestoreTile: handleRestoreTile,
    onTileDispose: handleTileDispose,
  });
}

/**
 * キャラが今いるチャンクが変わったときだけ、周囲3x3チャンクの生成漏れを
 * 埋め、それより外側のチャンクは実際にアンロード（破棄）する。
 * 毎フレーム呼んでも安価なチャンク座標比較のみ行う。
 */
export function updateWorldStreaming(worldX, worldZ) {
  const currentChunkCoords = worldToChunkCoords(worldX, worldZ);
  if (currentChunkCoords.cx === lastCharacterChunk.cx && currentChunkCoords.cy === lastCharacterChunk.cy) {
    return;
  }
  lastCharacterChunk = updateChunkStreaming(worldX, worldZ, {
    worldSeed,
    onProceduralTile: handleProceduralTile,
    onRestoreTile: handleRestoreTile,
    onTileDispose: handleTileDispose,
  });
}

export function saveWorld() {
  saveTownToLocalStorage(forEachLoadedTile, worldSeed, { wood: getWood(), money: getMoney() });
}

/**
 * @returns {{ seed: number } | null} 読込に成功した場合は反映後のシード値、
 * セーブデータが存在しなければnull。
 */
export function loadWorld() {
  const data = loadTownFromLocalStorage();
  if (!data) return null;

  resetTown();
  worldSeed = Number.isFinite(data.seed) ? data.seed : 1;

  if (data.economy) setResources(data.economy);

  data.cells.forEach((cell) => {
    ensureChunkForGlobalTile(cell.x, cell.y, { worldSeed, onProceduralTile: handleProceduralTile });
    const tile = getGlobalTile(cell.x, cell.y);
    if (!tile) return;
    handleRestoreTile(tile, cell.type, cell.furniture);
  });

  return { seed: worldSeed };
}

export { PROCEDURAL_GENERATORS };
