import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance } from './instancing.js';
import { UNIT_BOX_POOL, UNIT_CONE_SQUARE_POOL, UNIT_CYLINDER_POOL, ZERO_ROTATION } from './primitives.js';
import {
  BUILDING_ROOF_COLORS,
  SHOP_WALL_COLORS,
  SHOP_AWNING_COLORS,
  WELL_STONE_COLORS,
  WAREHOUSE_WALL_COLORS,
  WOOD_COLOR,
} from './palette.js';

const FLOOR_HEIGHT = 0.7;

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

/**
 * お店：1〜2階建て＋色鮮やかなオーニング（庇）＋平屋根。
 */
export function generateShop(seed, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const width = 1.3;
  const floors = 1 + Math.floor(rng() * 2); // 1〜2階
  let currentY = 0;

  for (let i = 0; i < floors; i++) {
    const color = new THREE.Color(pick(rng, SHOP_WALL_COLORS));
    const position = new THREE.Vector3(tilePosition.x, currentY, tilePosition.z);
    const scale = new THREE.Vector3(width, FLOOR_HEIGHT, width);
    parts.push(addInstance(UNIT_BOX_POOL, position, ZERO_ROTATION, scale, color, { animate }));
    currentY += FLOOR_HEIGHT;
  }

  const awningColor = new THREE.Color(pick(rng, SHOP_AWNING_COLORS));
  const awningPosition = new THREE.Vector3(
    tilePosition.x,
    FLOOR_HEIGHT * 0.85,
    tilePosition.z + width * 0.55,
  );
  const awningScale = new THREE.Vector3(width * 1.1, 0.08, width * 0.5);
  parts.push(
    addInstance(UNIT_BOX_POOL, awningPosition, ZERO_ROTATION, awningScale, awningColor, { animate }),
  );

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  const roofPosition = new THREE.Vector3(tilePosition.x, currentY, tilePosition.z);
  const roofScale = new THREE.Vector3(width * 1.05, 0.15, width * 1.05);
  parts.push(addInstance(UNIT_BOX_POOL, roofPosition, ZERO_ROTATION, roofScale, roofColor, { animate }));

  return { kind: 'instances', parts };
}

/**
 * 井戸：石積みの土台＋木の支柱2本＋三角屋根。
 */
export function generateWell(seed, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const stoneColor = new THREE.Color(pick(rng, WELL_STONE_COLORS));
  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      new THREE.Vector3(tilePosition.x, 0, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(0.5, 0.5, 0.5),
      stoneColor,
      { animate },
    ),
  );

  const postColor = new THREE.Color(WOOD_COLOR);
  [-0.35, 0.35].forEach((offset) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        new THREE.Vector3(tilePosition.x + offset, 0.5, tilePosition.z),
        ZERO_ROTATION,
        new THREE.Vector3(0.06, 0.6, 0.06),
        postColor,
        { animate },
      ),
    );
  });

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  parts.push(
    addInstance(
      UNIT_CONE_SQUARE_POOL,
      new THREE.Vector3(tilePosition.x, 1.1, tilePosition.z),
      new THREE.Euler(0, Math.PI / 4, 0),
      new THREE.Vector3(0.6, 0.4, 0.6),
      roofColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}

/**
 * 倉庫：大きめの箱＋緩やかな片流れ屋根。実用的な配色。
 */
export function generateWarehouse(seed, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const width = 1.8;
  const depth = 1.5;
  const height = 1.1;

  const wallColor = new THREE.Color(pick(rng, WAREHOUSE_WALL_COLORS));
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, 0, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(width, height, depth),
      wallColor,
      { animate },
    ),
  );

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, height, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(width * 1.05, 0.2, depth * 1.05),
      roofColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}
