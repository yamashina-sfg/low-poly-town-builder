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
import { generateBuilding, generateTree, generateSpecialTree } from '../generators.js';
import {
  generateShop,
  generateWell,
  generateWarehouse,
  generateWindmill,
  generateRuins,
  generateFarm,
  generateLoggingHut,
  generateTownHall,
  generatePlaza,
  generateFountainStructure,
} from '../buildingVariants.js';
import { generateBed, generateTable, generateChair, generateFireplace } from '../furniture.js';
import {
  generateFence,
  generateStreetlamp,
  generateBench,
  generateFlowerbed,
  generateSignpost,
  generateStatue,
  generateSeasonalTree,
  generateLantern,
  generateSnowman,
} from '../decorations.js';
import { generateFlowerMeadow, generateLushLawn, generateWildGrass } from '../terrainVariants.js';
import { generateRoad, computeRoadConnections, ROAD_TYPES, getBridgeSurfaceHeight } from '../road.js';
import { generateWater } from '../water.js';
import { removeInstance } from '../instancing.js';
import { getWood, getMoney, getFood, setResources } from '../economy.js';
import { saveTownToLocalStorage, loadTownFromLocalStorage, hasSaveData } from '../save.js';
import { getIndoorTiles, getIndoorSpawnPosition, applyRoomVariantForSeed } from '../interior.js';
import { getCurrentSeason } from '../season.js';
import { getGameTime, isNightHours } from '../gameTime.js';

// 内装バリエーション選択専用のsalt（他の用途のseedと衝突しないようにするため）。
const ROOM_VARIANT_SALT = 1800000;
// フェーズ26：噴水の水面（buildingVariants.generateFountainStructureの
// 石組みの水盤の高さに合わせる）。
const FOUNTAIN_WATER_Y = 0.23;

// 建物・家具・装飾のプロシージャル生成関数レジストリ。
// 種類ごとに専用のseedソルトを与え、同じタイルに異なる種類を
// 建て直しても互いのRNG列が影響し合わないようにする。
const PROCEDURAL_GENERATORS = {
  house: { generate: (seed, pos, opts) => generateBuilding(seed, 'house', pos, opts), salt: 0 },
  shop: { generate: generateShop, salt: 600000 },
  well: { generate: generateWell, salt: 700000 },
  warehouse: { generate: generateWarehouse, salt: 800000 },
  windmill: { generate: generateWindmill, salt: 1900000 },
  farm: { generate: generateFarm, salt: 2200000 },
  loggingHut: { generate: generateLoggingHut, salt: 2300000 },
  tree: { generate: (seed, pos, opts) => generateTree(seed, undefined, pos, opts), salt: 500000 },
  specialTree: { generate: generateSpecialTree, salt: 2000000 },
  ruins: { generate: generateRuins, salt: 2100000 },
  bed: { generate: generateBed, salt: 900000 },
  table: { generate: generateTable, salt: 1000000 },
  chair: { generate: generateChair, salt: 1100000 },
  fireplace: { generate: generateFireplace, salt: 1200000 },
  fence: { generate: generateFence, salt: 1300000 },
  streetlamp: { generate: generateStreetlamp, salt: 1400000 },
  bench: { generate: generateBench, salt: 1500000 },
  flowerbed: { generate: generateFlowerbed, salt: 1600000 },
  signpost: { generate: generateSignpost, salt: 1700000 },
  statue: { generate: generateStatue, salt: 1800000 },
  // フェーズ26：地形バリエーション（花畑・芝生2種）。自由に上書きできる
  // 地形として扱う（BUILDING_TYPES/DECORATION_TYPESのどちらにも含めない）。
  flowerMeadow: { generate: generateFlowerMeadow, salt: 2400000 },
  lushLawn: { generate: generateLushLawn, salt: 2500000 },
  wildGrass: { generate: generateWildGrass, salt: 2600000 },
  // フェーズ26：公共施設（維持費のかかる建物として管理する）。
  townHall: { generate: generateTownHall, salt: 2700000 },
  plaza: { generate: generatePlaza, salt: 2800000 },
  // 噴水の石組み部分のみ。水面はbuildOnTile側でgenerateWaterを重ねて
  // compositeにする（フェーズ22の橋と同じパターン）。
  fountain: { generate: generateFountainStructure, salt: 2900000 },
  // フェーズ26：季節オブジェクト。季節・時間帯は、建てた瞬間の値を
  // クロージャ経由で注入する（以後はgame/seasonalSystem.jsが定期的に
  // 塗り替える）。
  seasonalTree: {
    generate: (seed, pos, opts) => generateSeasonalTree(seed, pos, { ...opts, season: getCurrentSeason() }),
    salt: 3000000,
  },
  lantern: {
    generate: (seed, pos, opts) =>
      generateLantern(seed, pos, { ...opts, isNight: isNightHours(getGameTime().hours) }),
    salt: 3100000,
  },
  snowman: {
    generate: (seed, pos, opts) => generateSnowman(seed, pos, { ...opts, season: getCurrentSeason() }),
    salt: 3200000,
  },
};

export const BUILDING_TYPES = new Set([
  'house',
  'shop',
  'well',
  'warehouse',
  'windmill',
  'farm',
  'loggingHut',
  // フェーズ26：公共施設。
  'townHall',
  'plaza',
  'fountain',
]);
// フェーズ25：維持費がかかる（払えないと老朽化する）建物の種類と、
// 一定時間ごとに資材を生産する種類。どちらもBUILDING_TYPESの部分集合。
// フェーズ26：役場・広場・噴水（公共施設）も維持費の対象に含める。
export const MAINTAINED_BUILDING_TYPES = new Set([
  'house',
  'shop',
  'well',
  'warehouse',
  'windmill',
  'farm',
  'loggingHut',
  'townHall',
  'plaza',
  'fountain',
]);
export const PRODUCTION_TYPES = new Set(['farm', 'loggingHut']);
// 建物の状態(condition)・お店の在庫(shopInventory)の初期値であり、同時に
// それぞれの取りうる最大値でもある（economySystem.jsの生産・補充・修繕の
// 上限として再利用する）。
export const DEFAULT_BUILDING_CONDITION = 100;
export const DEFAULT_SHOP_INVENTORY = 30;
export const FURNITURE_TYPES = new Set(['bed', 'table', 'chair', 'fireplace']);
export const DECORATION_TYPES = new Set([
  'fence',
  'streetlamp',
  'bench',
  'flowerbed',
  'signpost',
  'statue',
  // フェーズ26：季節オブジェクト（季節・時間帯に応じて見た目が自動で切り替わる）。
  'seasonalTree',
  'lantern',
  'snowman',
]);
// 建物・装飾（＝地形ではないもの）は、既に何か置かれているタイルには重ねて
// 設置できない（フェーズ21：建築プレビューの重なりチェック）。木・道路・水・
// 更地に戻すといった地形系の変更は、これまで通り上書きを許可する。
const STRUCTURE_TYPES = new Set([...BUILDING_TYPES, ...DECORATION_TYPES]);
// フェーズ22：橋は水の上にだけ架けられる。逆に、橋以外の道（土の道・石畳・
// 通常の道・砂利道）は水タイルには敷けない（水を渡すには橋を使う必要がある）。
const WATER_ONLY_TYPES = new Set(['bridge']);
const LAND_ROAD_TYPES = new Set(['road', 'dirtRoad', 'cobblestone', 'gravelPath']);

/**
 * type種類のオブジェクトをtileに設置できるか（重なりチェック）。
 * - 橋は水タイルにしか架けられない
 * - 橋以外の道は水タイルには敷けない
 * - 建物・装飾は、対象タイルが更地(grass)のときだけ設置できる
 * - それ以外の地形系（木・水・更地に戻す等）は常に設置可能（上書き）
 */
export function isTilePlaceable(tile, type) {
  if (!tile) return false;
  if (WATER_ONLY_TYPES.has(type)) return tile.userData.tileType === 'water';
  if (LAND_ROAD_TYPES.has(type) && tile.userData.tileType === 'water') return false;
  if (!STRUCTURE_TYPES.has(type)) return true;
  return tile.userData.tileType === 'grass';
}

/**
 * tileに現在置かれているのが「建物・装飾」（フェーズ21の移動/撤去メニューの
 * 対象）かどうか。地形系（木・道・水・橋など）はここではfalseになり、
 * クリックすると（移動/撤去メニューではなく）建築メニューが開いて
 * 上書きできる＝地形の塗り直しや、水タイルに橋を架ける操作が可能になる。
 */
export function isStructureTile(tile) {
  return !!tile && STRUCTURE_TYPES.has(tile.userData.tileType);
}

/**
 * tileが（4方向のいずれかで）道に隣接しているか。フェーズ22：経済システムと
 * 連携するための土台として、建物が道に接続されているかを判定できるようにする。
 */
export function isConnectedToRoad(tile) {
  if (!tile) return false;
  return getNeighborTiles(tile).some((neighbor) => ROAD_TYPES.has(neighbor.userData.tileType));
}

// 建物数・木の数・装飾数・建物の種類ごとの内訳は毎回全タイルを舐めて数え直す
// のではなく、タイル種別が変わった瞬間に増減させるインクリメンタルな
// カウンターで管理する（チャンクが増えても集計コストが増えないようにするため）。
let liveTreeCount = 0;
let liveDecorationCount = 0;
const liveBuildingTypeCounts = new Map(); // type -> count（house/shop/well/warehouse/windmill）

function trackTileTypeAdded(type) {
  if (BUILDING_TYPES.has(type)) {
    liveBuildingTypeCounts.set(type, (liveBuildingTypeCounts.get(type) ?? 0) + 1);
  }
  if (type === 'tree' || type === 'specialTree') liveTreeCount += 1;
  if (DECORATION_TYPES.has(type)) liveDecorationCount += 1;
}

function trackTileTypeRemoved(type) {
  if (BUILDING_TYPES.has(type)) {
    liveBuildingTypeCounts.set(type, (liveBuildingTypeCounts.get(type) ?? 0) - 1);
  }
  if (type === 'tree' || type === 'specialTree') liveTreeCount -= 1;
  if (DECORATION_TYPES.has(type)) liveDecorationCount -= 1;
}

// ベッド・木・お店・住居が置かれているタイル（屋内外どちらも）を追跡し、
// キャラが近づいたときに「眠る/伐採する/お店を開く」操作を出せるようにしたり
// （フェーズ22）NPCの家・勤務先の割り当てに使ったりする。
const bedTiles = new Set();
const treeTiles = new Set();
const shopTiles = new Set();
const houseTiles = new Set();
// 水面のきらめきパーティクルをたまに出すための水タイル一覧
const waterTiles = new Set();

function trackInteractiveTile(tile, type) {
  bedTiles.delete(tile);
  treeTiles.delete(tile);
  shopTiles.delete(tile);
  waterTiles.delete(tile);
  houseTiles.delete(tile);
  if (type === 'bed') bedTiles.add(tile);
  else if (type === 'tree' || type === 'specialTree') treeTiles.add(tile);
  else if (type === 'shop') shopTiles.add(tile);
  else if (type === 'water') waterTiles.add(tile);
  else if (type === 'house') houseTiles.add(tile);
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
export function getHouseTiles() {
  return houseTiles;
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
  } else if (entry.kind === 'composite') {
    // 橋：InstancedMeshのパーツ（デッキ・欄干）と、下に見える水面の専用
    // メッシュの両方を保持するため、両方まとめて解放する。
    entry.parts.forEach((part) => removeInstance(part));
    entry.meshes.forEach((object3D) => {
      sceneRef.remove(object3D);
      object3D.geometry.dispose();
    });
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
 * 道タイルの見た目（直線・角・T字・十字、橋なら開いている方向やアーチの
 * 形）を隣接状況から再計算する。道以外のタイルには何もしない。
 * チャンクをまたいだ隣接タイルも参照できる。
 * 橋（複数タイルにまたがるスパン）は、隣に橋タイルが増えたときも
 * 既存タイル側のアーチの形が古いままにならないよう、ROAD_TYPES全種類
 * （土の道・石畳・橋も含む）を対象にする（以前はplain roadのみが対象で、
 * 他の道種別は隣接変化時に再描画されない不具合があった）。
 */
function refreshRoadTile(tile) {
  if (!ROAD_TYPES.has(tile.userData.tileType)) return;
  const { globalX, globalY, tileType, rotationY = 0 } = tile.userData;
  const connections = computeRoadConnections(getGlobalTile, globalX, globalY);
  const roadResult = generateRoad(tile.position, connections, {
    type: tileType,
    rotationY,
    getGlobalTile,
    globalX,
    globalY,
  });

  // InstancedMeshのパーツ（デッキ・欄干）だけを差し替える。橋の場合、下に
  // 見える水面メッシュは隣接状況が変わっても見た目が変わらないため、
  // 破棄・再生成せずそのまま使い回す（clearTileObjectを使うと水面ごと
  // 消えて再ポップインしてしまうため、ここでは使わない）。
  const previousEntry = tile.userData.object;
  if (previousEntry?.kind === 'instances' || previousEntry?.kind === 'composite') {
    previousEntry.parts.forEach((part) => removeInstance(part));
  }

  if (tileType === 'bridge') {
    const reusedWaterMesh = previousEntry?.kind === 'composite' ? previousEntry.meshes[0] : null;
    const waterMesh = reusedWaterMesh ?? generateWater(tile.position, TILE_SIZE, { animate: false });
    if (!reusedWaterMesh) sceneRef.add(waterMesh);
    tile.userData.object = { kind: 'composite', parts: roadResult.parts, meshes: [waterMesh] };
  } else {
    tile.userData.object = roadResult;
  }
}

/**
 * 選択された種類に応じたオブジェクトをタイル中心に配置する。
 * ほとんどの種類はInstancedMeshのインスタンス、水は波アニメーション付きの専用メッシュ。
 * seedはグローバルタイル座標から決定論的に算出するため、
 * 再構築しても・チャンクを再訪しても同じ見た目になる。
 * animate: falseにすると、自然生成・読込・シード変更時などポップアップ演出を出さない。
 */
export function buildOnTile(tile, type, { animate = true, rotationY = 0 } = {}) {
  clearTileObject(tile);
  trackTileTypeRemoved(tile.userData.tileType);
  tile.userData.tileType = type === 'clear' ? 'grass' : type;
  tile.userData.rotationY = type === 'clear' ? 0 : rotationY;
  trackTileTypeAdded(tile.userData.tileType);

  if (type === 'house') {
    // 住居タイルは室内の家具配置(9マス分)を保持する。既存の住居を建て直しても消えない。
    tile.userData.indoorFurniture = tile.userData.indoorFurniture ?? new Array(indoorTiles.length).fill(null);
  } else {
    tile.userData.indoorFurniture = undefined;
  }

  // フェーズ25：維持費のかかる建物は「状態(condition, 0〜100)」を持ち、
  // お店はさらに「在庫(shopInventory)」を持つ。既存の値があれば
  // 引き継ぐ（建て直しても老朽化・在庫の状態はリセットされない）。
  if (MAINTAINED_BUILDING_TYPES.has(type)) {
    tile.userData.condition = tile.userData.condition ?? DEFAULT_BUILDING_CONDITION;
  } else {
    tile.userData.condition = undefined;
  }
  if (type === 'shop') {
    tile.userData.shopInventory = tile.userData.shopInventory ?? DEFAULT_SHOP_INVENTORY;
  } else {
    tile.userData.shopInventory = undefined;
  }

  const { globalX, globalY } = tile.userData;
  const generatorEntry = PROCEDURAL_GENERATORS[type];

  if (generatorEntry) {
    const seed = computeSeed(globalX, globalY, generatorEntry.salt);
    const result = generatorEntry.generate(seed, tile.position, { animate, rotationY });
    if (type === 'fountain') {
      // 噴水：石組み部分（result）に、小さな水面メッシュを重ねて
      // compositeにする（フェーズ22の橋と同じパターン）。
      const waterMesh = generateWater(tile.position, TILE_SIZE * 0.55, { animate });
      waterMesh.position.y = FOUNTAIN_WATER_Y;
      sceneRef.add(waterMesh);
      tile.userData.object = { kind: 'composite', parts: result.parts, meshes: [waterMesh] };
    } else {
      tile.userData.object = result;
    }
  } else if (type === 'water') {
    const object3D = generateWater(tile.position, TILE_SIZE, { animate });
    sceneRef.add(object3D);
    tile.userData.object = { kind: 'mesh', object3D };
  } else if (ROAD_TYPES.has(type)) {
    const connections = computeRoadConnections(getGlobalTile, globalX, globalY);
    const roadResult = generateRoad(tile.position, connections, {
      animate,
      type,
      rotationY,
      getGlobalTile,
      globalX,
      globalY,
    });
    if (type === 'bridge') {
      // 橋は必ず水タイルの上に架けるもの（isTilePlaceable）なので、下に
      // 見える水面メッシュも合わせて生成し、デッキ・欄干とまとめて保持する
      // （橋を撤去/移動すると、この水面ごと消える＝跡地は水タイルに戻る）。
      const waterMesh = generateWater(tile.position, TILE_SIZE, { animate });
      sceneRef.add(waterMesh);
      tile.userData.object = { kind: 'composite', parts: roadResult.parts, meshes: [waterMesh] };
    } else {
      tile.userData.object = roadResult;
    }
  }

  trackInteractiveTile(tile, type);

  // このタイルの変化で隣接する道路タイルの接続形状が変わるかもしれないため更新する
  getNeighborTiles(tile).forEach(refreshRoadTile);
  // 橋は複数タイルにまたがる1つのアーチとして描画されるため、直接の隣接
  // タイルだけでなく、四方向に連続する橋タイルを端まで辿って全て再描画する
  // （でないと、スパンの端から離れた位置にある橋タイルの形状が、スパンの
  // 長さが変わった後も古いまま取り残されてしまう）。
  refreshBridgeSpansNear(tile);
}

function refreshBridgeSpansNear(tile) {
  const { globalX, globalY } = tile.userData;
  [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ].forEach(([dx, dy]) => {
    let x = globalX + dx;
    let y = globalY + dy;
    for (;;) {
      const neighbor = getGlobalTile(x, y);
      if (!neighbor || neighbor.userData.tileType !== 'bridge') break;
      refreshRoadTile(neighbor);
      x += dx;
      y += dy;
    }
  });
}

/**
 * タイルの中身を取り除いた後、下地として何に戻すべきかを返す。
 * 橋は元々水タイルの上に架けたものなので、撤去・移動元の後始末では
 * 更地(grass)ではなく水(water)に戻す（フェーズ22）。
 */
function getVacatedType(tileType) {
  return tileType === 'bridge' ? 'water' : 'clear';
}

/**
 * 設置済みの建物・装飾・道を撤去する（フェーズ21：撤去メニュー／範囲選択）。
 * 橋を撤去した場合は水タイルに戻る。
 */
export function removeTileContent(tile) {
  buildOnTile(tile, getVacatedType(tile.userData.tileType));
}

/**
 * 設置済みの建物・装飾を別のタイルへ移動する（フェーズ21：移動メニュー）。
 * 住居の場合は室内の家具レイアウトも引き継ぐ。rotationYOverrideを渡すと、
 * 移動と同時に向きも変更できる（省略時は元の向きを引き継ぐ）。
 * 移動元が橋だった場合は、そこは水タイルに戻る（フェーズ22）。
 */
export function moveTileContent(fromTile, toTile, rotationYOverride) {
  const { tileType, rotationY, indoorFurniture, condition, shopInventory } = fromTile.userData;
  const finalRotationY = rotationYOverride ?? rotationY ?? 0;
  buildOnTile(fromTile, getVacatedType(tileType));
  buildOnTile(toTile, tileType, { rotationY: finalRotationY });
  if (tileType === 'house' && Array.isArray(indoorFurniture)) {
    toTile.userData.indoorFurniture = indoorFurniture.slice();
  }
  // 老朽化の状態・お店の在庫は、移動しても引き継ぐ（建て直しではないため）。
  if (MAINTAINED_BUILDING_TYPES.has(tileType) && Number.isFinite(condition)) {
    toTile.userData.condition = condition;
  }
  if (tileType === 'shop' && Number.isFinite(shopInventory)) {
    toTile.userData.shopInventory = shopInventory;
  }
}

const LANDMARK_TYPES = new Set(['ruins', 'specialTree']);
let landmarkDiscoveredHandler = null;

/**
 * ランドマーク（廃墟・特殊な木）が自然生成されたときに通知するハンドラーを
 * 登録する。チャンクはキャラの周囲だけに生成されるため、生成イベント＝
 * プレイヤーがその場所を「発見した」タイミングとみなせる。
 */
export function setLandmarkDiscoveredHandler(handler) {
  landmarkDiscoveredHandler = handler;
}

// 自然生成でタイルに木などが配置されたときに呼ばれる（ポップアップ演出なし）
function handleProceduralTile(tile, type) {
  buildOnTile(tile, type, { animate: false });
  if (LANDMARK_TYPES.has(type)) {
    landmarkDiscoveredHandler?.(type);
  }
}

/**
 * 以前アンロードされ差分キャッシュに残っていたタイル（プレイヤーが手を
 * 加えたもの）を、チャンク再訪時に復元する。セーブデータ読込時のセル
 * 復元とも共通のロジック。
 */
function handleRestoreTile(tile, cell) {
  const { type, furniture, rotationY = 0, condition, shopInventory } = cell;
  buildOnTile(tile, type, { animate: false, rotationY });
  if (type === 'house' && Array.isArray(furniture)) {
    tile.userData.indoorFurniture = furniture.slice();
  }
  if (MAINTAINED_BUILDING_TYPES.has(type) && Number.isFinite(condition)) {
    tile.userData.condition = condition;
  }
  if (type === 'shop' && Number.isFinite(shopInventory)) {
    tile.userData.shopInventory = shopInventory;
  }
}

/**
 * チャンクがアンロードされる際、タイルに置かれていた建物・木などの
 * InstancedMeshインスタンスを解放し、集計カウンターからも取り除く。
 */
function handleTileDispose(tile) {
  trackTileTypeRemoved(tile.userData.tileType);
  // アンロード時にインタラクティブタイル集合（ベッド/木/お店/住居/水）からも
  // 取り除いておかないと、古いタイル参照がSetに残り続けてしまう
  // （フェーズ22：NPCの家・勤務先割り当てで参照するため、特に重要になった）。
  trackInteractiveTile(tile, null);
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
  const variantSeed = computeSeed(houseTile.userData.globalX, houseTile.userData.globalY, ROOM_VARIANT_SALT);
  applyRoomVariantForSeed(variantSeed);
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

/**
 * (worldX, worldZ)地点に立っているキャラクター/NPCの足元の高さを返す。
 * 通常の地面・道の上では0（従来通り）。橋のアーチの上にいる場合だけ、
 * そのアーチの形状に沿った高さを返す。屋外の移動処理から毎フレーム
 * 呼ばれ、Y座標に反映することで橋を実際に登り降りしながら渡れるようにする。
 */
export function getGroundHeightAt(worldX, worldZ) {
  const { gx, gy } = worldToGlobalTileCoords(worldX, worldZ);
  const tile = getGlobalTile(gx, gy);
  return getBridgeSurfaceHeight(getGlobalTile, tile, worldX, worldZ);
}

export function resolveIndoorCollision(position, radius) {
  resolveCollisionAgainstTiles(position, radius, indoorTiles);
}

export function getTownStats() {
  // 全タイルを舐めるO(n)処理ではなく、チャンク数からの計算とインクリメンタルな
  // カウンターだけで求める（探索が進んでも集計コストが増えない）。
  const chunkCount = getLoadedChunkCount();
  let buildingCount = 0;
  let distinctBuildingTypeCount = 0;
  const buildingTypeCounts = {};
  liveBuildingTypeCounts.forEach((count, type) => {
    buildingTypeCounts[type] = count;
    buildingCount += count;
    if (count > 0) distinctBuildingTypeCount += 1;
  });
  return {
    tileCount: chunkCount * CHUNK_SIZE * CHUNK_SIZE,
    buildingCount,
    treeCount: liveTreeCount,
    decorationCount: liveDecorationCount,
    distinctBuildingTypeCount,
    buildingTypeCounts,
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

/**
 * getPopulaceSnapshotは、populace.jsのserializePopulace（NPCの家・満足度
 * などの配列）を呼ぶための関数。world.jsはpopulace.jsに依存できない
 * （populace.jsが既にworld.jsを使っているため、循環参照になる）ため、
 * 呼び出し側(main.js)から注入してもらう。
 */
export function saveWorld(getPopulaceSnapshot) {
  saveTownToLocalStorage(
    forEachLoadedTile,
    worldSeed,
    { wood: getWood(), money: getMoney(), food: getFood() },
    getPopulaceSnapshot?.(),
  );
}

/**
 * フェーズ28：タイトル画面の「つづきから」ボタンを有効化してよいか
 * （＝読み込めるセーブデータが存在するか）の判定に使う。
 */
export { hasSaveData };

/**
 * restorePopulaceは、populace.jsのrestorePopulace（保存されていたNPCの
 * 家・満足度から住民を作り直す関数）を呼び出し側(main.js)から注入する
 * （saveWorldと同じ理由で、world.jsから直接populace.jsは呼べない）。
 * @returns {{ seed: number } | null} 読込に成功した場合は反映後のシード値、
 * セーブデータが存在しなければnull。
 */
export function loadWorld(restorePopulace) {
  const data = loadTownFromLocalStorage();
  if (!data) return null;

  resetTown();
  worldSeed = Number.isFinite(data.seed) ? data.seed : 1;

  if (data.economy) setResources(data.economy);

  data.cells.forEach((cell) => {
    ensureChunkForGlobalTile(cell.x, cell.y, { worldSeed, onProceduralTile: handleProceduralTile });
    const tile = getGlobalTile(cell.x, cell.y);
    if (!tile) return;
    handleRestoreTile(tile, cell);
  });

  // 住居セルが復元された後に呼ぶ必要がある（NPCの家をグローバルタイル
  // 座標から引き直す際、対象タイルが既に復元済みでなければならないため）。
  restorePopulace?.(data.populace);

  return { seed: worldSeed };
}

export { PROCEDURAL_GENERATORS };
