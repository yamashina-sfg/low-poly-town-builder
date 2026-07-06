import { mulberry32 } from './random.js';
import { createChunkTiles, disposeTileGround, CHUNK_SIZE, TILE_SIZE, CHUNK_WORLD_SIZE } from './terrain.js';

const TREE_SCATTER_CHANCE = 0.06;
// キャラクターの初期スポーン地点(ワールド原点)にあたるグローバルタイル座標。
// ここには自然生成の木を生やさないようにする。
const SPAWN_GLOBAL_X = 5;
const SPAWN_GLOBAL_Y = 5;

// キャラの周囲このチャンク半径だけ読み込んだ状態を維持する（3x3）。
// これより外側のチャンクは訪問後すぐにアンロード（破棄）される。
const LOAD_RADIUS = 1;

const chunks = new Map();
const globalTileIndex = new Map();
// アンロードしたチャンクのうち、プレイヤーが手を加えたタイルの差分だけを
// 一時的に退避しておく（再訪時に同じ内容を復元するため）。
const chunkDiffCache = new Map();

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function tileKey(gx, gy) {
  return `${gx},${gy}`;
}

export function worldToChunkCoords(worldX, worldZ) {
  return {
    cx: Math.floor((worldX + CHUNK_WORLD_SIZE / 2) / CHUNK_WORLD_SIZE),
    cy: Math.floor((worldZ + CHUNK_WORLD_SIZE / 2) / CHUNK_WORLD_SIZE),
  };
}

export function worldToGlobalTileCoords(worldX, worldZ) {
  return {
    gx: Math.floor((worldX + CHUNK_WORLD_SIZE / 2) / TILE_SIZE),
    gy: Math.floor((worldZ + CHUNK_WORLD_SIZE / 2) / TILE_SIZE),
  };
}

export function globalTileToChunkCoords(gx, gy) {
  return {
    cx: Math.floor(gx / CHUNK_SIZE),
    cy: Math.floor(gy / CHUNK_SIZE),
  };
}

/**
 * ワールドシードとグローバルタイル座標だけから、そのタイルの「自然生成の
 * 下地」を決定論的に求める（木をまばらに散らす）。チャンクを実際に
 * 生成しなくても呼び出せる純粋関数で、セーブ時・アンロード時の差分判定にも使う。
 */
export function getProceduralTileType(worldSeed, globalX, globalY) {
  if (globalX === SPAWN_GLOBAL_X && globalY === SPAWN_GLOBAL_Y) return 'grass';
  const seed = ((worldSeed * 486187739) ^ (globalX * 374761393) ^ (globalY * 668265263)) >>> 0;
  const rng = mulberry32(seed);
  return rng() < TREE_SCATTER_CHANCE ? 'tree' : 'grass';
}

/**
 * チャンク内のタイルのうち、自然生成の下地と異なるものだけを
 * { x, y, type, furniture? } の配列として抜き出す。
 */
function computeChunkDiff(chunk, worldSeed) {
  const cells = [];
  chunk.tiles.forEach((tile) => {
    const { globalX, globalY, tileType, indoorFurniture } = tile.userData;
    const baseType = getProceduralTileType(worldSeed, globalX, globalY);
    if (tileType !== baseType) {
      const cell = { x: globalX, y: globalY, type: tileType };
      if (tileType === 'house' && Array.isArray(indoorFurniture) && indoorFurniture.some(Boolean)) {
        cell.furniture = indoorFurniture;
      }
      cells.push(cell);
    }
  });
  return cells;
}

/**
 * 指定チャンクが未生成なら生成する。生成済みなら何もせず既存のチャンクを返す
 * （何度呼んでも安全）。
 * onProceduralTile(tile, type)は自然生成で木などが配置されるタイルに対して呼ばれる。
 * onRestoreTile(tile, type, furniture)は、以前アンロードされ差分キャッシュに
 * 残っていたタイル（プレイヤーが手を加えたもの）を復元するときに呼ばれる。
 */
export function ensureChunkExists(cx, cy, { worldSeed, onProceduralTile, onRestoreTile }) {
  const key = chunkKey(cx, cy);
  const existing = chunks.get(key);
  if (existing) return existing;

  const tiles = createChunkTiles(cx, cy);
  tiles.forEach((tile) => {
    globalTileIndex.set(tileKey(tile.userData.globalX, tile.userData.globalY), tile);
  });

  const record = { cx, cy, tiles };
  chunks.set(key, record);

  tiles.forEach((tile) => {
    const baseType = getProceduralTileType(worldSeed, tile.userData.globalX, tile.userData.globalY);
    if (baseType !== 'grass' && onProceduralTile) {
      onProceduralTile(tile, baseType);
    }
  });

  const cachedDiff = chunkDiffCache.get(key);
  if (cachedDiff) {
    chunkDiffCache.delete(key);
    cachedDiff.forEach((cell) => {
      const tile = globalTileIndex.get(tileKey(cell.x, cell.y));
      if (tile && onRestoreTile) {
        onRestoreTile(tile, cell.type, cell.furniture);
      }
    });
  }

  return record;
}

/**
 * チャンクをアンロードする。プレイヤーが手を加えたタイルは差分キャッシュへ
 * 退避してから、地面のInstancedMeshインスタンスを解放する。
 * onTileDispose(tile)は、タイルに建物・木などが置かれていた場合に
 * そのオブジェクト（InstancedMeshインスタンス等）を解放するために呼ばれる。
 */
function unloadChunk(cx, cy, { worldSeed, onTileDispose }) {
  const key = chunkKey(cx, cy);
  const chunk = chunks.get(key);
  if (!chunk) return;

  const diff = computeChunkDiff(chunk, worldSeed);
  if (diff.length > 0) chunkDiffCache.set(key, diff);

  chunk.tiles.forEach((tile) => {
    onTileDispose?.(tile);
    globalTileIndex.delete(tileKey(tile.userData.globalX, tile.userData.globalY));
    disposeTileGround(tile);
  });

  chunks.delete(key);
}

/**
 * キャラクター周辺(半径LOAD_RADIUSチャンク=3x3)を読み込み、
 * それより外側のチャンクはアンロードする。チャンクの端に近づいても
 * 隣が必ず存在するようにしつつ、離れたチャンクのメモリ・描画コストは
 * 実際に解放される。
 * @returns 現在キャラクターがいるチャンク座標
 */
export function updateChunkStreaming(
  worldX,
  worldZ,
  { worldSeed, onProceduralTile, onRestoreTile, onTileDispose },
) {
  const { cx, cy } = worldToChunkCoords(worldX, worldZ);

  for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy += 1) {
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx += 1) {
      ensureChunkExists(cx + dx, cy + dy, { worldSeed, onProceduralTile, onRestoreTile });
    }
  }

  Array.from(chunks.values()).forEach((chunk) => {
    if (Math.abs(chunk.cx - cx) > LOAD_RADIUS || Math.abs(chunk.cy - cy) > LOAD_RADIUS) {
      unloadChunk(chunk.cx, chunk.cy, { worldSeed, onTileDispose });
    }
  });

  return { cx, cy };
}

export function getGlobalTile(gx, gy) {
  return globalTileIndex.get(tileKey(gx, gy)) ?? null;
}

/**
 * グローバルタイル座標からチャンクを特定し、未生成なら生成する。
 * セーブデータの読込時、まだ訪れていない場所のセルを復元するために使う。
 */
export function ensureChunkForGlobalTile(gx, gy, { worldSeed, onProceduralTile, onRestoreTile }) {
  const { cx, cy } = globalTileToChunkCoords(gx, gy);
  return ensureChunkExists(cx, cy, { worldSeed, onProceduralTile, onRestoreTile });
}

export function getChunk(cx, cy) {
  return chunks.get(chunkKey(cx, cy)) ?? null;
}

export function getLoadedChunkCount() {
  return chunks.size;
}

export function forEachLoadedTile(callback) {
  chunks.forEach((chunk) => chunk.tiles.forEach(callback));
}

export { CHUNK_SIZE, TILE_SIZE, CHUNK_WORLD_SIZE };
