// フェーズ26：地形バリエーション（花畑・芝生2種）。road.jsの道路タイプとは
// 別に、水・木と同様「自由に上書きできる地形」として扱う（world.jsの
// STRUCTURE_TYPES/LAND_ROAD_TYPES/WATER_ONLY_TYPESのどれにも含めない）。
// 見た目は、地面の色を変えるBOX一枚（terrain.jsの共通地面プールは常に緑の
// ままなので、その上に敷く薄いオーバーレイとして表現する）＋散らした
// 装飾パーツで構成する。
import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance, UNIT_BOX_POOL } from './instancing.js';
import { UNIT_SPHERE_POOL, offsetPosition, rotatedEuler } from './primitives.js';
import { TILE_SIZE } from './terrain.js';
import {
  MEADOW_GROUND_COLOR,
  MEADOW_FLOWER_COLORS,
  LUSH_LAWN_COLOR,
  WILD_GRASS_GROUND_COLOR,
  WILD_GRASS_TUFT_COLOR,
} from './palette.js';

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

const GROUND_OVERLAY_HEIGHT = 0.03;

function addGroundOverlay(parts, tilePosition, color, rotationY, animate) {
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(TILE_SIZE * 0.98, GROUND_OVERLAY_HEIGHT, TILE_SIZE * 0.98),
      color,
      { animate },
    ),
  );
}

/**
 * 花畑：タイル全体を覆う野花畑。花壇（既存のflowerbed、手入れされた花壇）とは
 * 違い、タイル全面に不規則に花が散らばる、より自然な野原の見た目にする。
 */
export function generateFlowerMeadow(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  addGroundOverlay(parts, tilePosition, new THREE.Color(MEADOW_GROUND_COLOR), rotationY, animate);

  const flowerCount = 10 + Math.floor(rng() * 6);
  for (let i = 0; i < flowerCount; i += 1) {
    const color = new THREE.Color(pick(rng, MEADOW_FLOWER_COLORS));
    const ox = (rng() - 0.5) * TILE_SIZE * 0.85;
    const oz = (rng() - 0.5) * TILE_SIZE * 0.85;
    const size = 0.08 + rng() * 0.05;
    parts.push(
      addInstance(
        UNIT_SPHERE_POOL,
        offsetPosition(tilePosition, ox, GROUND_OVERLAY_HEIGHT, oz, rotationY),
        rotatedEuler(rotationY),
        new THREE.Vector3(size, size, size),
        color,
        { animate },
      ),
    );
  }

  return { kind: 'instances', parts };
}

/**
 * 手入れされた芝生：均一な明るい緑一色のオーバーレイ（バリエーション1）。
 */
export function generateLushLawn(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  addGroundOverlay(parts, tilePosition, new THREE.Color(LUSH_LAWN_COLOR), rotationY, animate);
  return { kind: 'instances', parts };
}

/**
 * 野草の茂み：やや濃い緑のオーバーレイ＋不規則に生えた草の房
 * （バリエーション2、芝生よりも自然で背の高い草地）。
 */
export function generateWildGrass(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  addGroundOverlay(parts, tilePosition, new THREE.Color(WILD_GRASS_GROUND_COLOR), rotationY, animate);

  const tuftColor = new THREE.Color(WILD_GRASS_TUFT_COLOR);
  const tuftCount = 8 + Math.floor(rng() * 5);
  for (let i = 0; i < tuftCount; i += 1) {
    const ox = (rng() - 0.5) * TILE_SIZE * 0.85;
    const oz = (rng() - 0.5) * TILE_SIZE * 0.85;
    const height = 0.12 + rng() * 0.1;
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        offsetPosition(tilePosition, ox, GROUND_OVERLAY_HEIGHT, oz, rotationY),
        new THREE.Euler(0, rotationY + rng() * Math.PI, 0),
        new THREE.Vector3(0.05, height, 0.05),
        tuftColor,
        { animate },
      ),
    );
  }

  return { kind: 'instances', parts };
}
