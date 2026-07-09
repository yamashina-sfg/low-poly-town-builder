import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { addInstance } from './instancing.js';
import {
  UNIT_BOX_POOL,
  UNIT_CONE_SQUARE_POOL,
  UNIT_CYLINDER_POOL,
  UNIT_SPHERE_POOL,
  offsetPosition,
  rotatedEuler,
} from './primitives.js';
import {
  BUILDING_ROOF_COLORS,
  SHOP_WALL_COLORS,
  SHOP_AWNING_COLORS,
  WELL_STONE_COLORS,
  WAREHOUSE_WALL_COLORS,
  WOOD_COLOR,
  WINDMILL_TOWER_COLOR,
  WINDMILL_BLADE_COLOR,
  WINDMILL_ROOF_COLOR,
  RUINS_COLOR,
  RUINS_MOSS_COLOR,
  SOIL_COLOR,
  FARM_CROP_COLORS,
  LOGGING_HUT_WALL_COLOR,
  LOGGING_HUT_ROOF_COLOR,
  LOG_PILE_COLOR,
} from './palette.js';

const FLOOR_HEIGHT = 0.7;

function pick(rng, colors) {
  return colors[Math.floor(rng() * colors.length)];
}

/**
 * お店：1〜2階建て＋色鮮やかなオーニング（庇）＋平屋根。
 */
export function generateShop(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const width = 1.3;
  const floors = 1 + Math.floor(rng() * 2); // 1〜2階
  let currentY = 0;

  for (let i = 0; i < floors; i++) {
    const color = new THREE.Color(pick(rng, SHOP_WALL_COLORS));
    const position = offsetPosition(tilePosition, 0, currentY, 0, rotationY);
    const scale = new THREE.Vector3(width, FLOOR_HEIGHT, width);
    parts.push(addInstance(UNIT_BOX_POOL, position, rotatedEuler(rotationY), scale, color, { animate }));
    currentY += FLOOR_HEIGHT;
  }

  const awningColor = new THREE.Color(pick(rng, SHOP_AWNING_COLORS));
  const awningPosition = offsetPosition(tilePosition, 0, FLOOR_HEIGHT * 0.85, width * 0.55, rotationY);
  const awningScale = new THREE.Vector3(width * 1.1, 0.08, width * 0.5);
  parts.push(
    addInstance(UNIT_BOX_POOL, awningPosition, rotatedEuler(rotationY), awningScale, awningColor, {
      animate,
    }),
  );

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  const roofPosition = offsetPosition(tilePosition, 0, currentY, 0, rotationY);
  const roofScale = new THREE.Vector3(width * 1.05, 0.15, width * 1.05);
  parts.push(
    addInstance(UNIT_BOX_POOL, roofPosition, rotatedEuler(rotationY), roofScale, roofColor, { animate }),
  );

  return { kind: 'instances', parts };
}

/**
 * 井戸：石積みの土台＋木の支柱2本＋三角屋根。
 */
export function generateWell(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const stoneColor = new THREE.Color(pick(rng, WELL_STONE_COLORS));
  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
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
        offsetPosition(tilePosition, offset, 0.5, 0, rotationY),
        rotatedEuler(rotationY),
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
      offsetPosition(tilePosition, 0, 1.1, 0, rotationY),
      rotatedEuler(rotationY, 0, Math.PI / 4, 0),
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
export function generateWarehouse(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const width = 1.8;
  const depth = 1.5;
  const height = 1.1;

  const wallColor = new THREE.Color(pick(rng, WAREHOUSE_WALL_COLORS));
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(width, height, depth),
      wallColor,
      { animate },
    ),
  );

  const roofColor = new THREE.Color(pick(rng, BUILDING_ROOF_COLORS));
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, height, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(width * 1.05, 0.2, depth * 1.05),
      roofColor,
      { animate },
    ),
  );

  return { kind: 'instances', parts };
}

/**
 * 風車：円柱の塔＋三角屋根＋十字に組んだ4枚の羽根。
 * フェーズ19で「町の評判」が一定値に達すると解放される建物。
 */
export function generateWindmill(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const towerColor = new THREE.Color(WINDMILL_TOWER_COLOR);
  const towerHeight = 1.6;

  parts.push(
    addInstance(
      UNIT_CYLINDER_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(0.45, towerHeight, 0.45),
      towerColor,
      { animate },
    ),
  );

  const roofColor = new THREE.Color(WINDMILL_ROOF_COLOR);
  parts.push(
    addInstance(
      UNIT_CONE_SQUARE_POOL,
      offsetPosition(tilePosition, 0, towerHeight, 0, rotationY),
      rotatedEuler(rotationY, 0, Math.PI / 4, 0),
      new THREE.Vector3(0.5, 0.5, 0.5),
      roofColor,
      { animate },
    ),
  );

  const bladeColor = new THREE.Color(WINDMILL_BLADE_COLOR);
  const bladeCenter = offsetPosition(tilePosition, 0, towerHeight * 0.85, 0.5, rotationY);
  [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((angle) => {
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        bladeCenter,
        rotatedEuler(rotationY, 0, 0, angle),
        new THREE.Vector3(0.12, 0.9, 0.04),
        bladeColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 畑：耕した土のタイルに、色違いの作物を3x3の格子状に植える
 * （フェーズ25：生産施設。時間経過で食料を生産する）。
 */
export function generateFarm(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];

  const soilColor = new THREE.Color(SOIL_COLOR);
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, 0, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(1.7, 0.06, 1.7),
      soilColor,
      { animate },
    ),
  );

  const rows = [-0.5, 0, 0.5];
  rows.forEach((offsetZ) => {
    rows.forEach((offsetX) => {
      const cropColor = new THREE.Color(pick(rng, FARM_CROP_COLORS));
      const cropHeight = 0.14 + rng() * 0.08;
      parts.push(
        addInstance(
          UNIT_SPHERE_POOL,
          offsetPosition(tilePosition, offsetX, 0.06, offsetZ, rotationY),
          rotatedEuler(rotationY),
          new THREE.Vector3(0.16, cropHeight, 0.16),
          cropColor,
          { animate },
        ),
      );
    });
  });

  return { kind: 'instances', parts };
}

/**
 * 伐採小屋：木造の小さな小屋＋積み上げた丸太の山
 * （フェーズ25：生産施設。時間経過で木材を生産する）。
 */
export function generateLoggingHut(seed, tilePosition, { animate = true, rotationY = 0 } = {}) {
  const parts = [];
  const wallColor = new THREE.Color(LOGGING_HUT_WALL_COLOR);
  const width = 0.9;
  const height = 0.6;

  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      offsetPosition(tilePosition, -0.35, 0, 0, rotationY),
      rotatedEuler(rotationY),
      new THREE.Vector3(width, height, width),
      wallColor,
      { animate },
    ),
  );

  const roofColor = new THREE.Color(LOGGING_HUT_ROOF_COLOR);
  parts.push(
    addInstance(
      UNIT_CONE_SQUARE_POOL,
      offsetPosition(tilePosition, -0.35, height, 0, rotationY),
      rotatedEuler(rotationY, 0, Math.PI / 4, 0),
      new THREE.Vector3(width * 1.1, 0.4, width * 1.1),
      roofColor,
      { animate },
    ),
  );

  // 積み上げた丸太（水平に寝かせた円柱を2段）。
  const logColor = new THREE.Color(LOG_PILE_COLOR);
  [0.12, 0.24].forEach((logY) => {
    parts.push(
      addInstance(
        UNIT_CYLINDER_POOL,
        offsetPosition(tilePosition, 0.45, logY, 0, rotationY),
        rotatedEuler(rotationY, 0, 0, Math.PI / 2),
        new THREE.Vector3(0.1, 0.7, 0.1),
        logColor,
        { animate },
      ),
    );
  });

  return { kind: 'instances', parts };
}

/**
 * 廃墟：拠点から離れた場所に低確率で自然生成されるランドマーク。
 * 崩れかけた壁の断片＋苔むした瓦礫で構成する（プレイヤーは建築できない）。
 */
export function generateRuins(seed, tilePosition, { animate = true } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const stoneColor = new THREE.Color(RUINS_COLOR);
  const mossColor = new THREE.Color(RUINS_MOSS_COLOR);

  // 崩れた壁の断片を数枚、高さ・傾きをばらつかせて配置する
  const fragmentCount = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < fragmentCount; i += 1) {
    const angle = (i / fragmentCount) * Math.PI * 2 + rng() * 0.6;
    const distance = 0.35 + rng() * 0.3;
    const height = 0.4 + rng() * 0.5;
    const tilt = (rng() - 0.5) * 0.3;
    const color = rng() < 0.5 ? stoneColor : mossColor;
    parts.push(
      addInstance(
        UNIT_BOX_POOL,
        new THREE.Vector3(
          tilePosition.x + Math.cos(angle) * distance,
          0,
          tilePosition.z + Math.sin(angle) * distance,
        ),
        new THREE.Euler(tilt, angle, 0),
        new THREE.Vector3(0.5, height, 0.15),
        color,
        { animate },
      ),
    );
  }

  return { kind: 'instances', parts };
}
