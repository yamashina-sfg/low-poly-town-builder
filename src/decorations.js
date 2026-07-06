import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance } from './instancing.js';
import { UNIT_BOX_POOL, UNIT_CYLINDER_POOL, UNIT_SPHERE_POOL, ZERO_ROTATION } from './primitives.js';
import { WOOD_COLOR, DARK_METAL_COLOR, LAMP_HEAD_COLOR, FLOWER_COLORS, SOIL_COLOR, SIGN_BOARD_COLOR } from './palette.js';

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

/**
 * 柵：2本の支柱＋2段の横木。
 */
export function generateFence(seed, tilePosition, { animate = true } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  [-0.9, 0.9].forEach((ox) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        new THREE.Vector3(tilePosition.x + ox, 0, tilePosition.z),
        ZERO_ROTATION,
        new THREE.Vector3(0.05, 0.5, 0.05),
        woodColor,
        { animate }
      )
    );
  });

  [0.2, 0.4].forEach((y) => {
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        new THREE.Vector3(tilePosition.x, y, tilePosition.z),
        ZERO_ROTATION,
        new THREE.Vector3(1.8, 0.06, 0.06),
        woodColor,
        { animate }
      )
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 街灯：細い柱＋光る球のランプ。
 */
export function generateStreetlamp(seed, tilePosition, { animate = true } = {}) {
  const parts = [];
  const poleColor = new THREE.Color(DARK_METAL_COLOR);

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      new THREE.Vector3(tilePosition.x, 0, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(0.05, 1.6, 0.05),
      poleColor,
      { animate }
    )
  );

  const lampColor = new THREE.Color(LAMP_HEAD_COLOR);
  parts.push(
    addInstance(
      UNIT_SPHERE_POOL,
      new THREE.Vector3(tilePosition.x, 1.65, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(0.18, 0.18, 0.18),
      lampColor,
      { animate }
    )
  );

  return { kind: 'instances', parts };
}

/**
 * ベンチ：座面＋背もたれ＋金属脚。
 */
export function generateBench(seed, tilePosition, { animate = true } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);
  const legColor = new THREE.Color(DARK_METAL_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, 0.3, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(1.2, 0.08, 0.4),
      woodColor,
      { animate }
    )
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, 0.55, tilePosition.z - 0.17),
      ZERO_ROTATION,
      new THREE.Vector3(1.2, 0.35, 0.06),
      woodColor,
      { animate }
    )
  );

  [-0.5, 0.5].forEach((ox) => {
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        new THREE.Vector3(tilePosition.x + ox, 0, tilePosition.z),
        ZERO_ROTATION,
        new THREE.Vector3(0.08, 0.3, 0.35),
        legColor,
        { animate }
      )
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 花壇：土台＋ランダムに散らした色とりどりの花。
 */
export function generateFlowerbed(seed, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const soilColor = new THREE.Color(SOIL_COLOR);
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, 0, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(1.5, 0.15, 1.5),
      soilColor,
      { animate }
    )
  );

  const flowerCount = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < flowerCount; i += 1) {
    const color = new THREE.Color(pick(rng, FLOWER_COLORS));
    const ox = (rng() - 0.5) * 1.2;
    const oz = (rng() - 0.5) * 1.2;
    parts.push(
      addInstance(
        UNIT_SPHERE_POOL,
        new THREE.Vector3(tilePosition.x + ox, 0.2, tilePosition.z + oz),
        ZERO_ROTATION,
        new THREE.Vector3(0.12, 0.12, 0.12),
        color,
        { animate }
      )
    );
  }

  return { kind: 'instances', parts };
}

/**
 * 看板：細い支柱＋板。
 */
export function generateSignpost(seed, tilePosition, { animate = true } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      new THREE.Vector3(tilePosition.x, 0, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(0.06, 1.0, 0.06),
      woodColor,
      { animate }
    )
  );

  const boardColor = new THREE.Color(SIGN_BOARD_COLOR);
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, 0.9, tilePosition.z),
      ZERO_ROTATION,
      new THREE.Vector3(0.5, 0.35, 0.05),
      boardColor,
      { animate }
    )
  );

  return { kind: 'instances', parts };
}
