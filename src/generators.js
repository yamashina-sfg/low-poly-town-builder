import * as THREE from 'three';
import { mulberry32 } from './random.js';
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

/**
 * 立方体を1〜3段積み重ねた低ポリ建物を生成する。
 * 同じseedを渡せば常に同じ建物になる（決定論的）。
 */
export function generateBuilding(seed, type = 'house') {
  const rng = mulberry32(seed);
  const group = new THREE.Group();

  const floors = 1 + Math.floor(rng() * 3); // 1〜3段
  let currentY = 0;
  let topWidth = FOOTPRINT;

  for (let i = 0; i < floors; i++) {
    const width = FOOTPRINT - i * 0.15;
    const geometry = new THREE.BoxGeometry(width, FLOOR_HEIGHT, width);
    const material = new THREE.MeshStandardMaterial({
      color: pick(rng, BUILDING_WALL_COLORS),
      flatShading: true,
    });
    const floorMesh = new THREE.Mesh(geometry, material);
    floorMesh.position.y = currentY + FLOOR_HEIGHT / 2;
    group.add(floorMesh);
    currentY += FLOOR_HEIGHT;
    topWidth = width;
  }

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: pick(rng, BUILDING_ROOF_COLORS),
    flatShading: true,
  });

  if (rng() < 0.5) {
    // 三角屋根
    const roofHeight = 0.8;
    const roofGeometry = new THREE.ConeGeometry(topWidth * 0.75, roofHeight, 4);
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = currentY + roofHeight / 2;
    group.add(roof);
  } else {
    // 平屋根
    const roofGeometry = new THREE.BoxGeometry(
      topWidth * 1.05,
      0.15,
      topWidth * 1.05
    );
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = currentY + 0.075;
    group.add(roof);
  }

  group.userData.generatorType = 'building';
  group.userData.buildingType = type;
  group.userData.seed = seed;
  return group;
}

/**
 * 針葉樹（円柱＋円錐2〜3段）または広葉樹（円柱＋球3〜4個）を生成する。
 * typeを省略するとseedに基づき決定論的にどちらかが選ばれる。
 */
export function generateTree(seed, type) {
  const rng = mulberry32(seed);
  const resolvedType = type ?? (rng() < 0.5 ? 'conifer' : 'broadleaf');
  const group = new THREE.Group();

  const trunkHeight = 0.6 + rng() * 0.3;
  const trunkGeometry = new THREE.CylinderGeometry(0.08, 0.13, trunkHeight, 6);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: TRUNK_COLOR,
    flatShading: true,
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = trunkHeight / 2;
  group.add(trunk);

  if (resolvedType === 'conifer') {
    const tiers = 2 + Math.floor(rng() * 2); // 2〜3段
    let baseY = trunkHeight * 0.6;
    let radius = 0.55;

    for (let i = 0; i < tiers; i++) {
      const coneHeight = 0.7 - i * 0.1;
      const geometry = new THREE.ConeGeometry(Math.max(radius, 0.15), coneHeight, 7);
      const material = new THREE.MeshStandardMaterial({
        color: pick(rng, TREE_CONIFER_COLORS),
        flatShading: true,
      });
      const cone = new THREE.Mesh(geometry, material);
      cone.position.y = baseY + coneHeight / 2;
      group.add(cone);
      baseY += coneHeight * 0.55;
      radius -= 0.13;
    }
  } else {
    const blobCount = 3 + Math.floor(rng() * 2); // 3〜4個

    for (let i = 0; i < blobCount; i++) {
      const radius = 0.35 + rng() * 0.15;
      const geometry = new THREE.SphereGeometry(radius, 6, 5);
      const material = new THREE.MeshStandardMaterial({
        color: pick(rng, TREE_BROADLEAF_COLORS),
        flatShading: true,
      });
      const blob = new THREE.Mesh(geometry, material);
      const offsetX = (rng() - 0.5) * 0.5;
      const offsetZ = (rng() - 0.5) * 0.5;
      const offsetY = rng() * 0.4;
      blob.position.set(offsetX, trunkHeight + 0.2 + offsetY, offsetZ);
      group.add(blob);
    }
  }

  group.userData.generatorType = 'tree';
  group.userData.treeType = resolvedType;
  group.userData.seed = seed;
  return group;
}
