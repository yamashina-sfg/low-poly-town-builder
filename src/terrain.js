import * as THREE from 'three';

export const TILE_SIZE = 2; // world units per tile
export const CHUNK_SIZE = 10; // 1チャンク = 10x10タイル
export const CHUNK_WORLD_SIZE = TILE_SIZE * CHUNK_SIZE;

const BASE_COLOR = 0x6fae5c;
const HOVER_COLOR = 0x9bdb8a;

/**
 * チャンク座標(chunkX, chunkY)の10x10タイルを生成する。
 * 各タイルのワールド座標はチャンク座標から一意に決まり、
 * 隣接するチャンクとの継ぎ目が完全に一致するようになっている。
 * 各タイルはさらにグローバルなタイル座標(globalX, globalY)を持ち、
 * チャンクをまたいだ隣接判定に使われる。
 */
export function createChunkTiles(chunkX, chunkY) {
  const originX = chunkX * CHUNK_WORLD_SIZE - CHUNK_WORLD_SIZE / 2;
  const originZ = chunkY * CHUNK_WORLD_SIZE - CHUNK_WORLD_SIZE / 2;
  const tiles = [];

  for (let localY = 0; localY < CHUNK_SIZE; localY++) {
    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
      const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color: BASE_COLOR,
        flatShading: true,
      });
      const tile = new THREE.Mesh(geometry, material);
      tile.position.set(
        originX + TILE_SIZE * localX + TILE_SIZE / 2,
        0,
        originZ + TILE_SIZE * localY + TILE_SIZE / 2
      );
      tile.userData = {
        chunkX,
        chunkY,
        localX,
        localY,
        globalX: chunkX * CHUNK_SIZE + localX,
        globalY: chunkY * CHUNK_SIZE + localY,
        tileType: 'grass',
        object: null,
      };
      tiles.push(tile);
    }
  }
  return tiles;
}

export function setTileHighlighted(tile, highlighted) {
  tile.material.color.set(highlighted ? HOVER_COLOR : BASE_COLOR);
}
