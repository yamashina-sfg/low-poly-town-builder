import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { registerPool, addInstance, UNIT_BOX_POOL } from './instancing.js';
import {
  BUILDING_WALL_COLORS,
  BUILDING_ROOF_COLORS,
  TRUNK_COLOR,
  TREE_CONIFER_COLORS,
  TREE_BROADLEAF_COLORS,
} from './palette.js';

const FLOOR_HEIGHT = 0.7;
const FOOTPRINT = 1.4;

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

// 底面を原点に置いた単位ジオメトリ。すべてのインスタンスで共有し、
// 位置・回転・非一様スケール・インスタンスカラーだけで見た目を変える。
const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitConeSquareGeometry = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
const unitConeRoundGeometry = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const unitTrunkGeometry = new THREE.CylinderGeometry(0.08, 0.13, 1, 6).translate(0, 0.5, 0);
const unitSphereGeometry = new THREE.SphereGeometry(1, 6, 5);

function makeInstancedMaterial() {
  // material.colorは白のままにして、インスタンスカラーをそのまま反映させる
  return new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
}

export const UNIT_CONE_SQUARE_POOL = 'unit-cone-square';
const UNIT_CONE_ROUND_POOL = 'unit-cone-round';
const UNIT_TRUNK_POOL = 'unit-trunk';
const UNIT_SPHERE_POOL = 'unit-sphere';

registerPool(UNIT_BOX_POOL, unitBoxGeometry, makeInstancedMaterial());
registerPool(UNIT_CONE_SQUARE_POOL, unitConeSquareGeometry, makeInstancedMaterial());
registerPool(UNIT_CONE_ROUND_POOL, unitConeRoundGeometry, makeInstancedMaterial());
registerPool(UNIT_TRUNK_POOL, unitTrunkGeometry, makeInstancedMaterial());
registerPool(UNIT_SPHERE_POOL, unitSphereGeometry, makeInstancedMaterial());

const ZERO_ROTATION = new THREE.Euler(0, 0, 0);

/**
 * 立方体を1〜3段積み重ねた低ポリ建物を、InstancedMeshのインスタンスとして配置する。
 * 同じseedを渡せば常に同じ建物になる（決定論的）。
 * @returns {{ kind: 'instances', parts: Array<{key: string, index: number}> }}
 */
export function generateBuilding(seed, type = 'house', tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const floors = 1 + Math.floor(rng() * 3); // 1〜3段
  let currentY = 0;
  let topWidth = FOOTPRINT;

  for (let i = 0; i < floors; i++) {
    const width = FOOTPRINT - i * 0.15;
    const color = new THREE.Color(pick(rng, BUILDING_WALL_COLORS));
    const position = new THREE.Vector3(tilePosition.x, currentY, tilePosition.z);
    const scale = new THREE.Vector3(width, FLOOR_HEIGHT, width);
    parts.push(addInstance(UNIT_BOX_POOL, position, ZERO_ROTATION, scale, color, { animate }));
    currentY += FLOOR_HEIGHT;
    topWidth = width;
  }

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  const roofPosition = new THREE.Vector3(tilePosition.x, currentY, tilePosition.z);

  if (rng() < 0.5) {
    // 三角屋根
    const roofHeight = 0.8;
    const rotation = new THREE.Euler(0, Math.PI / 4, 0);
    const scale = new THREE.Vector3(topWidth * 0.75, roofHeight, topWidth * 0.75);
    parts.push(addInstance(UNIT_CONE_SQUARE_POOL, roofPosition, rotation, scale, roofColor, { animate }));
  } else {
    // 平屋根
    const scale = new THREE.Vector3(topWidth * 1.05, 0.15, topWidth * 1.05);
    parts.push(addInstance(UNIT_BOX_POOL, roofPosition, ZERO_ROTATION, scale, roofColor, { animate }));
  }

  return { kind: 'instances', parts };
}

/**
 * 針葉樹（円柱＋円錐2〜3段）または広葉樹（円柱＋球3〜4個）をInstancedMeshで配置する。
 * typeを省略するとseedに基づき決定論的にどちらかが選ばれる。
 * @returns {{ kind: 'instances', parts: Array<{key: string, index: number}> }}
 */
export function generateTree(seed, type, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const resolvedType = type ?? (rng() < 0.5 ? 'conifer' : 'broadleaf');
  const parts = [];

  const trunkHeight = 0.6 + rng() * 0.3;
  const trunkColor = new THREE.Color(TRUNK_COLOR);
  const trunkPosition = new THREE.Vector3(tilePosition.x, 0, tilePosition.z);
  const trunkScale = new THREE.Vector3(1, trunkHeight, 1);
  parts.push(
    addInstance(UNIT_TRUNK_POOL, trunkPosition, ZERO_ROTATION, trunkScale, trunkColor, { animate })
  );

  if (resolvedType === 'conifer') {
    const tiers = 2 + Math.floor(rng() * 2); // 2〜3段
    let baseY = trunkHeight * 0.6;
    let radius = 0.55;

    for (let i = 0; i < tiers; i++) {
      const coneHeight = 0.7 - i * 0.1;
      const clampedRadius = Math.max(radius, 0.15);
      const color = new THREE.Color(pick(rng, TREE_CONIFER_COLORS));
      const position = new THREE.Vector3(tilePosition.x, baseY, tilePosition.z);
      const scale = new THREE.Vector3(clampedRadius, coneHeight, clampedRadius);
      parts.push(addInstance(UNIT_CONE_ROUND_POOL, position, ZERO_ROTATION, scale, color, { animate }));
      baseY += coneHeight * 0.55;
      radius -= 0.13;
    }
  } else {
    const blobCount = 3 + Math.floor(rng() * 2); // 3〜4個

    for (let i = 0; i < blobCount; i++) {
      const radius = 0.35 + rng() * 0.15;
      const color = new THREE.Color(pick(rng, TREE_BROADLEAF_COLORS));
      const offsetX = (rng() - 0.5) * 0.5;
      const offsetZ = (rng() - 0.5) * 0.5;
      const offsetY = rng() * 0.4;
      const position = new THREE.Vector3(
        tilePosition.x + offsetX,
        trunkHeight + 0.2 + offsetY,
        tilePosition.z + offsetZ
      );
      const scale = new THREE.Vector3(radius, radius, radius);
      parts.push(addInstance(UNIT_SPHERE_POOL, position, ZERO_ROTATION, scale, color, { animate }));
    }
  }

  return { kind: 'instances', parts };
}
