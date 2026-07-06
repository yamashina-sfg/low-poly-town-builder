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

// 住居ごとにseedから決定論的に選ばれる内装バリエーション（壁紙・床材の色違い）。
export const ROOM_VARIANTS = [
  { floor: 0xc9a66b, floorHover: 0xe0c48a, wall: 0xe8dcc0, ceiling: 0xd8cdb0 }, // 木目調（既定）
  { floor: 0x8a97a8, floorHover: 0xa8b6c9, wall: 0xd8e2e8, ceiling: 0xc5d0d8 }, // 青みがかったモダン内装
  { floor: 0x9c6b5a, floorHover: 0xc08a76, wall: 0xf0e2c9, ceiling: 0xe0cfa8 }, // 赤みの強い暖色内装
];

let indoorTiles = [];
const floorMaterials = [];
let wallMaterial = null;
let ceilingMaterial = null;
let activeFloorColor = ROOM_VARIANTS[0].floor;
let activeFloorHoverColor = ROOM_VARIANTS[0].floorHover;

function addBox(group, w, h, d, x, y, z, material) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
      const material = new THREE.MeshStandardMaterial({ color: activeFloorColor, flatShading: true });
      floorMaterials.push(material);
      const tile = new THREE.Mesh(geometry, material);
      tile.receiveShadow = true;
      tile.position.set(
        ox - half + tx * TILE_SIZE + TILE_SIZE / 2,
        0,
        oz - half + ty * TILE_SIZE + TILE_SIZE / 2,
      );
      tile.userData = {
        localIndex: ty * ROOM_TILES + tx,
        tileType: 'grass',
        object: null,
      };
      group.add(tile);
      indoorTiles.push(tile);
    }
  }

  wallMaterial = new THREE.MeshStandardMaterial({ color: ROOM_VARIANTS[0].wall, flatShading: true });
  ceilingMaterial = new THREE.MeshStandardMaterial({ color: ROOM_VARIANTS[0].ceiling, flatShading: true });

  // 北壁・東壁・西壁
  addBox(
    group,
    ROOM_SIZE,
    WALL_HEIGHT,
    WALL_THICKNESS,
    ox,
    WALL_HEIGHT / 2,
    oz - half - WALL_THICKNESS / 2,
    wallMaterial,
  );
  addBox(
    group,
    WALL_THICKNESS,
    WALL_HEIGHT,
    ROOM_SIZE,
    ox + half + WALL_THICKNESS / 2,
    WALL_HEIGHT / 2,
    oz,
    wallMaterial,
  );
  addBox(
    group,
    WALL_THICKNESS,
    WALL_HEIGHT,
    ROOM_SIZE,
    ox - half - WALL_THICKNESS / 2,
    WALL_HEIGHT / 2,
    oz,
    wallMaterial,
  );

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
    wallMaterial,
  );
  addBox(
    group,
    segmentWidth,
    WALL_HEIGHT,
    WALL_THICKNESS,
    ox + (DOOR_WIDTH / 2 + segmentWidth / 2),
    WALL_HEIGHT / 2,
    oz + half + WALL_THICKNESS / 2,
    wallMaterial,
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
  tile.material.color.set(highlighted ? activeFloorHoverColor : activeFloorColor);
}

/**
 * seed（住居タイルのグローバル座標などから決定論的に算出した値）から
 * 内装バリエーションのインデックスを求める純粋関数（テスト用に公開）。
 */
export function getRoomVariantIndexForSeed(seed) {
  return seed % ROOM_VARIANTS.length;
}

/**
 * 指定したseedに対応する内装バリエーション（壁紙・床材の色）を、既存の
 * 部屋（床タイル・壁・天井）へ適用する。部屋は住居ごとに作り直すのではなく
 * 使い回す1つのシーンなので、入室のたびに配色だけを塗り替える。
 */
export function applyRoomVariantForSeed(seed) {
  const variant = ROOM_VARIANTS[getRoomVariantIndexForSeed(seed)];
  activeFloorColor = variant.floor;
  activeFloorHoverColor = variant.floorHover;
  floorMaterials.forEach((material) => material.color.set(variant.floor));
  wallMaterial?.color.set(variant.wall);
  ceilingMaterial?.color.set(variant.ceiling);
}
