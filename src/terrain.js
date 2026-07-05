import * as THREE from 'three';

export const GRID_SIZE = 10;
export const TILE_SIZE = 2; // world units per tile (grid covers 20x20)
export const GROUND_SIZE = GRID_SIZE * TILE_SIZE;

const BASE_COLOR = 0x6fae5c;
const HOVER_COLOR = 0x9bdb8a;

/**
 * 10x10のタイルグリッドを生成する。
 * 各タイルは個別のPlaneGeometryを持ち、レイキャストで識別できる。
 */
export function createTerrain() {
  const group = new THREE.Group();
  const half = GROUND_SIZE / 2;

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color: BASE_COLOR,
        flatShading: true,
      });
      const tile = new THREE.Mesh(geometry, material);
      tile.position.set(
        -half + TILE_SIZE * gx + TILE_SIZE / 2,
        0,
        -half + TILE_SIZE * gy + TILE_SIZE / 2
      );
      tile.userData = { gridX: gx, gridY: gy, tileType: 'grass', object: null };
      group.add(tile);
    }
  }
  return group;
}

export function setTileHighlighted(tile, highlighted) {
  tile.material.color.set(highlighted ? HOVER_COLOR : BASE_COLOR);
}
