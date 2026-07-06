import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { createChunkTiles, CHUNK_SIZE, TILE_SIZE, CHUNK_WORLD_SIZE } from './terrain.js';

const TREE_SCATTER_CHANCE = 0.06;
// キャラクターの初期スポーン地点(ワールド原点)にあたるグローバルタイル座標。
// ここには自然生成の木を生やさないようにする。
const SPAWN_GLOBAL_X = 5;
const SPAWN_GLOBAL_Y = 5;

const chunks = new Map();
const globalTileIndex = new Map();
let visibleTiles = [];

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
 * 生成しなくても呼び出せる純粋関数で、セーブ時の差分判定にも使う。
 */
export function getProceduralTileType(worldSeed, globalX, globalY) {
  if (globalX === SPAWN_GLOBAL_X && globalY === SPAWN_GLOBAL_Y) return 'grass';
  const seed = ((worldSeed * 486187739) ^ (globalX * 374761393) ^ (globalY * 668265263)) >>> 0;
  const rng = mulberry32(seed);
  return rng() < TREE_SCATTER_CHANCE ? 'tree' : 'grass';
}

/**
 * 指定チャンクが未生成なら生成してシーンに追加する。
 * 生成済みなら何もせず既存のチャンクを返す（何度呼んでも安全）。
 * onProceduralTile(tile, type)は、自然生成で木などが配置されるタイルに対して呼ばれる。
 */
export function ensureChunkExists(cx, cy, { scene, worldSeed, onProceduralTile }) {
  const key = chunkKey(cx, cy);
  const existing = chunks.get(key);
  if (existing) return existing;

  const tiles = createChunkTiles(cx, cy);
  const group = new THREE.Group();
  tiles.forEach((tile) => {
    group.add(tile);
    globalTileIndex.set(tileKey(tile.userData.globalX, tile.userData.globalY), tile);
  });
  scene.add(group);

  const record = { cx, cy, group, tiles };
  chunks.set(key, record);

  tiles.forEach((tile) => {
    const baseType = getProceduralTileType(worldSeed, tile.userData.globalX, tile.userData.globalY);
    if (baseType !== 'grass' && onProceduralTile) {
      onProceduralTile(tile, baseType);
    }
  });

  return record;
}

/**
 * キャラクター周辺(半径radiusチャンク)がすべて生成済みであることを保証する。
 * チャンクの端に近づいても隣が必ず存在するよう、常に3x3ブロックを維持する。
 * @returns 現在キャラクターがいるチャンク座標
 */
export function ensureChunksAround(worldX, worldZ, { scene, worldSeed, onProceduralTile }, radius = 1) {
  const { cx, cy } = worldToChunkCoords(worldX, worldZ);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      ensureChunkExists(cx + dx, cy + dy, { scene, worldSeed, onProceduralTile });
    }
  }
  return { cx, cy };
}

export function getGlobalTile(gx, gy) {
  return globalTileIndex.get(tileKey(gx, gy)) ?? null;
}

/**
 * グローバルタイル座標からチャンクを特定し、未生成なら生成する。
 * セーブデータの読込時、まだ訪れていない場所のセルを復元するために使う。
 */
export function ensureChunkForGlobalTile(gx, gy, { scene, worldSeed, onProceduralTile }) {
  const { cx, cy } = globalTileToChunkCoords(gx, gy);
  return ensureChunkExists(cx, cy, { scene, worldSeed, onProceduralTile });
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

/**
 * キャラクターから離れすぎたチャンクは非表示にして描画をスキップする
 * （データはメモリに保持したまま）。
 */
export function updateChunkVisibility(characterWorldX, characterWorldZ, viewDistanceInChunks = 1) {
  const { cx, cy } = worldToChunkCoords(characterWorldX, characterWorldZ);
  visibleTiles = [];
  chunks.forEach((chunk) => {
    const visible =
      Math.abs(chunk.cx - cx) <= viewDistanceInChunks && Math.abs(chunk.cy - cy) <= viewDistanceInChunks;
    chunk.group.visible = visible;
    if (visible) visibleTiles.push(...chunk.tiles);
  });
}

export function getVisibleTileMeshes() {
  return visibleTiles;
}

export { CHUNK_SIZE, TILE_SIZE, CHUNK_WORLD_SIZE };
