import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance } from './instancing.js';
import {
  UNIT_BOX_POOL,
  UNIT_CYLINDER_POOL,
  UNIT_SPHERE_POOL,
  offsetPosition,
  rotatedEuler,
} from './primitives.js';
import { WOOD_COLOR, FIREPLACE_STONE_COLOR, FIRE_GLOW_COLOR } from './palette.js';

const BEDSHEET_COLORS = [0xaed1e0, 0xe0b8ae, 0xcfe0ae, 0xe8d9a8];

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

/**
 * ベッド：木枠＋マットレス＋枕。フェーズ21：rotationYで枕の向き（頭の位置）を変えられる。
 */
export function generateBed(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const frameColor = new THREE.Color(WOOD_COLOR);
  const sheetColor = new THREE.Color(pick(rng, BEDSHEET_COLORS));

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.2, 0.15, 0.7),
      frameColor,
      { animate },
    ),
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.15, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.1, 0.15, 0.6),
      sheetColor,
      { animate },
    ),
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.3, -0.2, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.3, 0.1, 0.2),
      new THREE.Color(0xffffff),
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}

/**
 * テーブル：天板＋4本脚（回転対称に近いが、フェーズ21のrotationYを一貫して適用する）。
 */
export function generateTable(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.45, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.0, 0.08, 0.7),
      woodColor,
      { animate },
    ),
  );

  [
    [-0.4, -0.3],
    [0.4, -0.3],
    [-0.4, 0.3],
    [0.4, 0.3],
  ].forEach(([ox, oz]) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        offsetPosition(tilePosition, ox, 0, oz, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(0.05, 0.45, 0.05),
        woodColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 椅子：座面＋背もたれ＋4本脚。フェーズ21：rotationYで背もたれの向きを変えられる。
 */
export function generateChair(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.35, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.4, 0.06, 0.4),
      woodColor,
      { animate },
    ),
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.55, -0.17, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.4, 0.4, 0.06),
      woodColor,
      { animate },
    ),
  );

  [
    [-0.15, -0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [0.15, 0.15],
  ].forEach(([ox, oz]) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        offsetPosition(tilePosition, ox, 0, oz, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(0.04, 0.35, 0.04),
        woodColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 暖炉：石積みの土台＋煙突＋オレンジ色の火。フェーズ21：rotationYで火の向く方向を変えられる。
 */
export function generateFireplace(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const stoneColor = new THREE.Color(FIREPLACE_STONE_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.9, 0.6, 0.5),
      stoneColor,
      { animate },
    ),
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.6, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.35, 0.8, 0.35),
      stoneColor,
      { animate },
    ),
  );

  const fireColor = new THREE.Color(FIRE_GLOW_COLOR);
  parts.push(
    addInstance(
      UNIT_SPHERE_POOL,
      offsetPosition(tilePosition, 0, 0.35, 0.15, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.2, 0.2, 0.2),
      fireColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}
