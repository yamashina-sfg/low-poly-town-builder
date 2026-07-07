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
import {
  WOOD_COLOR,
  DARK_METAL_COLOR,
  LAMP_HEAD_COLOR,
  FLOWER_COLORS,
  SOIL_COLOR,
  SIGN_BOARD_COLOR,
  STATUE_COLOR,
  STATUE_BASE_COLOR,
} from './palette.js';

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

/**
 * 柵：2本の支柱＋2段の横木。フェーズ21：rotationYで壁の向きを変えられる。
 */
export function generateFence(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  [-0.9, 0.9].forEach((ox) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        offsetPosition(tilePosition, ox, 0, 0, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(0.05, 0.5, 0.05),
        woodColor,
        { animate },
      ),
    );
  });

  [0.2, 0.4].forEach((y) => {
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        offsetPosition(tilePosition, 0, y, 0, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(1.8, 0.06, 0.06),
        woodColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 街灯：細い柱＋光る球のランプ（見た目は回転対称のため、rotationYは記録のみ）。
 */
export function generateStreetlamp(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const poleColor = new THREE.Color(DARK_METAL_COLOR);

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.05, 1.6, 0.05),
      poleColor,
      { animate },
    ),
  );

  const lampColor = new THREE.Color(LAMP_HEAD_COLOR);
  parts.push(
    addInstance(
      UNIT_SPHERE_POOL,
      offsetPosition(tilePosition, 0, 1.65, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.18, 0.18, 0.18),
      lampColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}

/**
 * ベンチ：座面＋背もたれ＋金属脚。フェーズ21：rotationYで背もたれの向きを変えられる。
 */
export function generateBench(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);
  const legColor = new THREE.Color(DARK_METAL_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.3, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.2, 0.08, 0.4),
      woodColor,
      { animate },
    ),
  );
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.55, -0.17, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.2, 0.35, 0.06),
      woodColor,
      { animate },
    ),
  );

  [-0.5, 0.5].forEach((ox) => {
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        offsetPosition(tilePosition, ox, 0, 0, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(0.08, 0.3, 0.35),
        legColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 花壇：土台＋ランダムに散らした色とりどりの花（ほぼ点対称のため、rotationYは記録のみ）。
 */
export function generateFlowerbed(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const soilColor = new THREE.Color(SOIL_COLOR);
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.5, 0.15, 1.5),
      soilColor,
      { animate },
    ),
  );

  const flowerCount = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < flowerCount; i += 1) {
    const color = new THREE.Color(pick(rng, FLOWER_COLORS));
    const ox = (rng() - 0.5) * 1.2;
    const oz = (rng() - 0.5) * 1.2;
    parts.push(
      addInstance(
        UNIT_SPHERE_POOL,
        offsetPosition(tilePosition, ox, 0.2, oz, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(0.12, 0.12, 0.12),
        color,
        { animate },
      ),
    );
  }

  return { kind: 'instances', parts };
}

/**
 * 看板：細い支柱＋板。フェーズ21：rotationYで板が向く方向を変えられる。
 */
export function generateSignpost(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const woodColor = new THREE.Color(WOOD_COLOR);

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.06, 1.0, 0.06),
      woodColor,
      { animate },
    ),
  );

  const boardColor = new THREE.Color(SIGN_BOARD_COLOR);
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0.9, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.5, 0.35, 0.05),
      boardColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}

/**
 * 銅像：四角い台座＋人型を単純化した胴体・頭のシルエット。
 * フェーズ19で「町の評判」が一定値に達すると解放される装飾（回転対称のためrotationYは記録のみ）。
 */
export function generateStatue(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const baseColor = new THREE.Color(STATUE_BASE_COLOR);
  const statueColor = new THREE.Color(STATUE_COLOR);

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.7, 0.25, 0.7),
      baseColor,
      { animate },
    ),
  );

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0.25, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.22, 0.75, 0.22),
      statueColor,
      { animate },
    ),
  );

  parts.push(
    addInstance(
      UNIT_SPHERE_POOL,
      offsetPosition(tilePosition, 0, 1.05, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.18, 0.18, 0.18),
      statueColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}
