import * as THREE from 'three';
import { TILE_SIZE } from './terrain.js';

// 室内シーンは、カメラのfar(1000)よりずっと遠いワールド座標に常設しておく。
// こうすることで、外の世界を明示的に隠す処理をせずに済む
// （屋外のチャンクはこの距離まで絶対に描画されない）。
export const INTERIOR_OFFSET = new THREE.Vector3(3000, 0, 3000);

const ROOM_TILES = 3; // 3x3タイルの1部屋
export const ROOM_SIZE = ROOM_TILES * TILE_SIZE;
const WALL_HEIGHT = 2.4;
const WALL_THICKNESS = 0.15;
const DOOR_WIDTH = TILE_SIZE;

const FLOOR_COLOR = 0xc9a66b;
const FLOOR_HOVER_COLOR = 0xe0c48a;
const WALL_COLOR = 0xe8dcc0;
const CEILING_COLOR = 0xd8cdb0;

let indoorTiles = [];

function addBox(group, w, h, d, x, y, z, material) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

/**
 * シンプルな1部屋の室内シーン（床・壁・天井）を1度だけ生成してシーンに追加する。
 * 床は3x3タイルに分かれており、家具をクリックで配置できる。
 */
export function initInteriorRoom(scene) {
  const group = new THREE.Group();
  const half = ROOM_SIZE / 2;
  const ox = INTERIOR_OFFSET.x;
  const oz = INTERIOR_OFFSET.z;

  for (let ty = 0; ty < ROOM_TILES; ty += 1) {
    for (let tx = 0; tx < ROOM_TILES; tx += 1) {
      const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, flatShading: true });
      const tile = new THREE.Mesh(geometry, material);
      tile.position.set(ox - half + tx * TILE_SIZE + TILE_SIZE / 2, 0, oz - half + ty * TILE_SIZE + TILE_SIZE / 2);
      tile.userData = {
        localIndex: ty * ROOM_TILES + tx,
        tileType: 'grass',
        object: null,
      };
      group.add(tile);
      indoorTiles.push(tile);
    }
  }

  const wallMaterial = new THREE.MeshStandardMaterial({ color: WALL_COLOR, flatShading: true });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: CEILING_COLOR, flatShading: true });

  // 北壁・東壁・西壁
  addBox(group, ROOM_SIZE, WALL_HEIGHT, WALL_THICKNESS, ox, WALL_HEIGHT / 2, oz - half - WALL_THICKNESS / 2, wallMaterial);
  addBox(group, WALL_THICKNESS, WALL_HEIGHT, ROOM_SIZE, ox + half + WALL_THICKNESS / 2, WALL_HEIGHT / 2, oz, wallMaterial);
  addBox(group, WALL_THICKNESS, WALL_HEIGHT, ROOM_SIZE, ox - half - WALL_THICKNESS / 2, WALL_HEIGHT / 2, oz, wallMaterial);

  // 南壁（中央に出入り口の隙間を空ける）
  const segmentWidth = (ROOM_SIZE - DOOR_WIDTH) / 2;
  addBox(
    group,
    segmentWidth,
    WALL_HEIGHT,
    WALL_THICKNESS,
    ox - (DOOR_WIDTH / 2 + segmentWidth / 2),
    WALL_HEIGHT / 2,
    oz + half + WALL_THICKNESS / 2,
    wallMaterial
  );
  addBox(
    group,
    segmentWidth,
    WALL_HEIGHT,
    WALL_THICKNESS,
    ox + (DOOR_WIDTH / 2 + segmentWidth / 2),
    WALL_HEIGHT / 2,
    oz + half + WALL_THICKNESS / 2,
    wallMaterial
  );

  // 天井
  addBox(group, ROOM_SIZE, WALL_THICKNESS, ROOM_SIZE, ox, WALL_HEIGHT, oz, ceilingMaterial);

  scene.add(group);
  return group;
}

export function getIndoorTiles() {
  return indoorTiles;
}

export function getIndoorSpawnPosition() {
  return new THREE.Vector3(INTERIOR_OFFSET.x, 0, INTERIOR_OFFSET.z + ROOM_SIZE / 2 - TILE_SIZE * 0.6);
}

export function setIndoorTileHighlighted(tile, highlighted) {
  tile.material.color.set(highlighted ? FLOOR_HOVER_COLOR : FLOOR_COLOR);
}
