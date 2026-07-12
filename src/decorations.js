import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance } from './instancing.js';
import {
  UNIT_BOX_POOL,
  UNIT_CYLINDER_POOL,
  UNIT_SPHERE_POOL,
  UNIT_TRUNK_POOL,
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
  SEASONAL_TREE_TRUNK_COLOR,
  SEASONAL_TREE_FOLIAGE_COLORS,
  LANTERN_POST_COLOR,
  LANTERN_LIT_COLOR,
  LANTERN_UNLIT_COLOR,
  SNOWMAN_WINTER_COLOR,
  SNOWMAN_MELTED_COLOR,
  SNOWMAN_ACCENT_COLOR,
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

// ------------------------------------------------------------------
// フェーズ26：季節オブジェクト。季節・時間帯に応じて見た目（色）が自動で
// 切り替わる装飾。色そのものはここでまとめて計算し、生成時（初期の見た目）と
// game/seasonalSystem.jsの定期的な塗り替え（時間経過での切り替え）の
// 両方から同じロジックを使う。
// ------------------------------------------------------------------

/**
 * 季節の木の葉の色を、現在の季節から求める（春=桜, 夏=新緑, 秋=紅葉, 冬=雪化粧）。
 */
export function getSeasonalTreeFoliageColor(season) {
  return new THREE.Color(SEASONAL_TREE_FOLIAGE_COLORS[season] ?? SEASONAL_TREE_FOLIAGE_COLORS.summer);
}

/**
 * 提灯の灯りの色を、夜かどうかから求める（夜=灯った暖色、昼=消えた紙色）。
 */
export function getLanternGlowColor(isNight) {
  return new THREE.Color(isNight ? LANTERN_LIT_COLOR : LANTERN_UNLIT_COLOR);
}

/**
 * 雪だるまの色を、現在の季節から求める（冬=白い雪、それ以外=溶けた土色）。
 */
export function getSnowmanBodyColor(season) {
  return new THREE.Color(season === 'winter' ? SNOWMAN_WINTER_COLOR : SNOWMAN_MELTED_COLOR);
}

/**
 * 季節の木：幹＋3つ葉の房。葉の色は季節ごとに自動で切り替わる
 * （初期の見た目はseasonで指定した季節、以後はgame/seasonalSystem.jsが
 * 時間経過に応じて塗り替える）。返り値のseasonalPartsが、塗り替え対象の
 * パーツ（葉）を示す。
 */
export function generateSeasonalTree(
  seed,
  tilePosition,
  { animate = true, rotationY = 0, season = 'summer' } = {},
) {
  const parts = [];
  const seasonalParts = [];

  const trunkColor = new THREE.Color(SEASONAL_TREE_TRUNK_COLOR);
  parts.push(
    addInstance(
      UNIT_TRUNK_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.22, 0.75, 0.22),
      trunkColor,
      { animate },
    ),
  );

  const foliageColor = getSeasonalTreeFoliageColor(season);
  [
    { x: 0, y: 0.75, z: 0, s: 0.42 },
    { x: 0.22, y: 0.95, z: 0.1, s: 0.3 },
    { x: -0.18, y: 1.0, z: -0.15, s: 0.28 },
  ].forEach((offset) => {
    const part = addInstance(
      UNIT_SPHERE_POOL,
      offsetPosition(tilePosition, offset.x, offset.y, offset.z, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(offset.s, offset.s, offset.s),
      foliageColor,
      { animate },
    );
    parts.push(part);
    seasonalParts.push(part);
  });

  return { kind: 'instances', parts, seasonalParts };
}

/**
 * 提灯：木の柱＋灯り部分。灯りの色は夜かどうかで自動的に切り替わる。
 */
export function generateLantern(seed, tilePosition, { animate = true, rotationY = 0, isNight = false } = {}) {
  const parts = [];
  const seasonalParts = [];

  const postColor = new THREE.Color(LANTERN_POST_COLOR);
  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.05, 1.1, 0.05),
      postColor,
      { animate },
    ),
  );

  const glowColor = getLanternGlowColor(isNight);
  const glowPart = addInstance(
    UNIT_SPHERE_POOL,
    offsetPosition(tilePosition, 0, 1.15, 0, rotationY),
    rotatedEuler(rotationY),
    new THREE.Vector3(0.22, 0.28, 0.22),
    glowColor,
    { animate },
  );
  parts.push(glowPart);
  seasonalParts.push(glowPart);

  return { kind: 'instances', parts, seasonalParts };
}

/**
 * 雪だるま：3段に積んだ雪玉＋小枝の腕。冬は白い雪、それ以外の季節は
 * 溶けた（土っぽい）色に自動で切り替わる。
 */
export function generateSnowman(
  seed,
  tilePosition,
  { animate = true, rotationY = 0, season = 'winter' } = {},
) {
  const parts = [];
  const seasonalParts = [];

  const bodyColor = getSnowmanBodyColor(season);
  [
    { y: 0, s: 0.4 },
    { y: 0.55, s: 0.3 },
    { y: 0.95, s: 0.22 },
  ].forEach(({ y, s }) => {
    const part = addInstance(
      UNIT_SPHERE_POOL,
      offsetPosition(tilePosition, 0, y, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(s, s, s),
      bodyColor,
      { animate },
    );
    parts.push(part);
    seasonalParts.push(part);
  });

  const accentColor = new THREE.Color(SNOWMAN_ACCENT_COLOR);
  [-1, 1].forEach((side) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        offsetPosition(tilePosition, 0.2 * side, 0.6, 0, rotationY),
        rotatedEuler(rotationY, 0, 0, side * (Math.PI / 3)),
        new THREE.Vector3(0.03, 0.35, 0.03),
        accentColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts, seasonalParts };
}
