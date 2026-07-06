import * as THREE from 'three';
import { registerPool, addInstance, removeInstance, setInstanceColor, getPoolMesh } from './instancing.js';

export const TILE_SIZE = 2; // world units per tile
export const CHUNK_SIZE = 10; // 1チャンク = 10x10タイル
export const CHUNK_WORLD_SIZE = TILE_SIZE * CHUNK_SIZE;

const BASE_COLOR = new THREE.Color(0x6fae5c);
const HOVER_COLOR = new THREE.Color(0x9bdb8a);
const ZERO_ROTATION = new THREE.Euler(0, 0, 0);

export const GROUND_TILE_POOL = 'ground-tile';

// 地面タイルは全チャンク共通の1つのInstancedMeshにまとめる
// （タイル1枚ごとに個別のGeometry/Materialを作らないことで、
// チャンクが増えても描画コールとメモリが線形に増えないようにする）。
const groundGeometry = new THREE.PlaneGeometry(1, 1);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
registerPool(GROUND_TILE_POOL, groundGeometry, groundMaterial);

// InstancedMeshのinstanceId（レイキャスト結果）からタイルを逆引きするためのマップ。
// インデックスは削除・再利用されるため、常に「今そのインデックスを使っている
// タイル」で上書きしておく。
const tileByGroundIndex = new Map();

/**
 * チャンク座標(chunkX, chunkY)の10x10タイルを生成する。
 * 各タイルのワールド座標はチャンク座標から一意に決まり、
 * 隣接するチャンクとの継ぎ目が完全に一致するようになっている。
 * 各タイルはさらにグローバルなタイル座標(globalX, globalY)を持ち、
 * チャンクをまたいだ隣接判定に使われる。
 *
 * タイルは（描画自体はInstancedMeshが担うため）THREE.Objectではなく、
 * 既存コード（tile.userData.xxx, tile.position）とそのまま互換性のある
 * 形の素のオブジェクトとして返す。
 */
export function createChunkTiles(chunkX, chunkY) {
  const originX = chunkX * CHUNK_WORLD_SIZE - CHUNK_WORLD_SIZE / 2;
  const originZ = chunkY * CHUNK_WORLD_SIZE - CHUNK_WORLD_SIZE / 2;
  const tiles = [];
  const scale = new THREE.Vector3(TILE_SIZE, 1, TILE_SIZE);

  for (let localY = 0; localY < CHUNK_SIZE; localY++) {
    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
      const position = new THREE.Vector3(
        originX + TILE_SIZE * localX + TILE_SIZE / 2,
        0,
        originZ + TILE_SIZE * localY + TILE_SIZE / 2
      );
      const groundHandle = addInstance(GROUND_TILE_POOL, position, ZERO_ROTATION, scale, BASE_COLOR);

      const tile = {
        position,
        groundHandle,
        userData: {
          chunkX,
          chunkY,
          localX,
          localY,
          globalX: chunkX * CHUNK_SIZE + localX,
          globalY: chunkY * CHUNK_SIZE + localY,
          tileType: 'grass',
          object: null,
        },
      };
      tileByGroundIndex.set(groundHandle.index, tile);
      tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * タイルが不要になったとき（チャンクのアンロード時）に、地面のインスタンスを
 * プールへ返却する。
 */
export function disposeTileGround(tile) {
  tileByGroundIndex.delete(tile.groundHandle.index);
  removeInstance(tile.groundHandle);
}

export function setTileHighlighted(tile, highlighted) {
  setInstanceColor(tile.groundHandle, highlighted ? HOVER_COLOR : BASE_COLOR);
}

/**
 * レイキャストで得たinstanceIdから、対応するタイルを取得する。
 */
export function getTileByGroundInstanceId(instanceId) {
  return tileByGroundIndex.get(instanceId) ?? null;
}

export function getGroundInstancedMesh() {
  return getPoolMesh(GROUND_TILE_POOL);
}
