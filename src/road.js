import * as THREE from 'three';
import { addInstance, UNIT_BOX_POOL } from './instancing.js';
import { UNIT_CYLINDER_POOL } from './primitives.js';
import { TILE_SIZE } from './terrain.js';
import { WOOD_COLOR } from './palette.js';

const ZERO_ROTATION = new THREE.Euler(0, 0, 0);

const DIRECTIONS = [
  { key: 'N', dx: 0, dz: -1 },
  { key: 'S', dx: 0, dz: 1 },
  { key: 'E', dx: 1, dz: 0 },
  { key: 'W', dx: -1, dz: 0 },
];

// 道として扱う（＝互いに接続し、NPCの経路探索が辿れる）タイル種別。
// フェーズ22：土の道・石畳・橋を追加し、見た目違いでも接続・経路探索は共通にする。
export const ROAD_TYPES = new Set(['road', 'dirtRoad', 'cobblestone', 'bridge']);

const ROAD_PALETTES = {
  road: { base: new THREE.Color(0x777777), line: new THREE.Color(0xf2f2f2) },
  dirtRoad: { base: new THREE.Color(0x8a6a4a), line: null },
  cobblestone: { base: new THREE.Color(0xa8a196), line: new THREE.Color(0x8a8478) },
};

/**
 * 上下左右の隣接タイルが道（ROAD_TYPESのいずれか）かどうかを判定する。
 * これにより直線・角・T字・十字の見た目が自動的に決まる。
 * チャンクをまたいでも隣接判定できるよう、グローバルタイル座標と
 * ルックアップ関数getGlobalTile(gx, gy)を受け取る。
 */
export function computeRoadConnections(getGlobalTile, globalX, globalY) {
  const connections = {};
  DIRECTIONS.forEach(({ key, dx, dz }) => {
    const neighbor = getGlobalTile(globalX + dx, globalY + dz);
    connections[key] = !!neighbor && ROAD_TYPES.has(neighbor.userData.tileType);
  });
  return connections;
}

function generatePlainRoad(tilePosition, connections, { animate = false, type = 'road' } = {}) {
  const parts = [];
  const palette = ROAD_PALETTES[type] ?? ROAD_PALETTES.road;

  const basePosition = new THREE.Vector3(tilePosition.x, 0.02, tilePosition.z);
  const baseScale = new THREE.Vector3(TILE_SIZE, 0.02, TILE_SIZE);
  parts.push(addInstance(UNIT_BOX_POOL, basePosition, ZERO_ROTATION, baseScale, palette.base, { animate }));

  if (type === 'cobblestone') {
    // 石畳：接続方向に関係なく、常に格子状の目地を描いて石畳らしさを出す。
    [-0.35, 0.35].forEach((t) => {
      parts.push(
        addInstance(
          UNIT_BOX_POOL,
          new THREE.Vector3(tilePosition.x + TILE_SIZE * t, 0.04, tilePosition.z),
          ZERO_ROTATION,
          new THREE.Vector3(0.05, 0.03, TILE_SIZE),
          palette.line,
          { animate },
        ),
      );
      parts.push(
        addInstance(
          UNIT_BOX_POOL,
          new THREE.Vector3(tilePosition.x, 0.04, tilePosition.z + TILE_SIZE * t),
          ZERO_ROTATION,
          new THREE.Vector3(TILE_SIZE, 0.03, 0.05),
          palette.line,
          { animate },
        ),
      );
    });
    return { kind: 'instances', parts };
  }

  if (!palette.line) {
    // 土の道：舗装の白線は引かない（未舗装のため）。
    return { kind: 'instances', parts };
  }

  DIRECTIONS.forEach(({ key, dx, dz }) => {
    if (!connections[key]) return;

    const isHorizontal = dx !== 0;
    const dashLength = TILE_SIZE * 0.22;
    const scale = isHorizontal
      ? new THREE.Vector3(dashLength, 0.03, 0.12)
      : new THREE.Vector3(0.12, 0.03, dashLength);

    for (let i = 0; i < 2; i++) {
      const t = 0.2 + i * 0.28; // タイル中心から端へ向かう2つの破線マーク
      const position = new THREE.Vector3(
        tilePosition.x + dx * TILE_SIZE * t,
        0.04,
        tilePosition.z + dz * TILE_SIZE * t,
      );
      parts.push(addInstance(UNIT_BOX_POOL, position, ZERO_ROTATION, scale, palette.line, { animate }));
    }
  });

  return { kind: 'instances', parts };
}

const BRIDGE_DECK_COLOR = new THREE.Color(WOOD_COLOR);
const BRIDGE_RAIL_COLOR = new THREE.Color(0x5c3c26); // デッキよりやや濃い木の色
// デッキは道路の土台(y=0〜0.02)に近い高さにして、隣接する道・地面との
// 段差が目立たないようにする。
const DECK_BOTTOM_Y = 0.02;
const DECK_HEIGHT = 0.08;
const DECK_TOP_Y = DECK_BOTTOM_Y + DECK_HEIGHT;
const RAIL_HEIGHT = 0.34;
const RAIL_THICKNESS = 0.07;

/**
 * 橋：水の上に架ける道。タイル全面を覆う薄い板張りの床（隣接する道・地面と
 * 高さが揃うよう低めに配置）に、進行方向の左右にだけ低い欄干を立てる
 * （前後＝道が続く方向は開けておき、歩いて通り抜けられるようにする）。
 * どちらを「左右」とするかはrotationY（フェーズ21のRキー回転）で決まり、
 * 実際に道・橋が接続している方向は、回転にかかわらず常に開けておく。
 */
function generateBridge(tilePosition, connections, { animate = false, rotationY = 0 } = {}) {
  const parts = [];

  // 床（デッキ）：正方形なので回転させても見た目は変わらないが、
  // 他のジェネレーターとの一貫性のためrotationYはそのまま渡しておく。
  parts.push(
    addInstance(
      UNIT_BOX_POOL,
      new THREE.Vector3(tilePosition.x, DECK_BOTTOM_Y, tilePosition.z),
      new THREE.Euler(0, rotationY, 0),
      new THREE.Vector3(TILE_SIZE, DECK_HEIGHT, TILE_SIZE),
      BRIDGE_DECK_COLOR,
      { animate },
    ),
  );

  // rotationYを90度刻みのステップ数に変換し、南北(N/S)方向が「進行方向
  // （＝欄干を付けない前後）」になるのを基準に、90度回転するごとに
  // 東西(E/W)方向と入れ替える。
  const rotationSteps = Math.round(rotationY / (Math.PI / 2)) % 4;
  const isNorthSouthOpenByDefault = rotationSteps % 2 === 0;

  DIRECTIONS.forEach(({ key, dx, dz }) => {
    const isNorthSouth = dx === 0;
    const isOpenByRotation = isNorthSouth === isNorthSouthOpenByDefault;
    // 道・橋が実際に接続している方向は、回転の向きに関係なく常に開けておく
    // （通行の妨げにならないようにする）。
    if (isOpenByRotation || connections[key]) return;

    const isHorizontalEdge = dx !== 0; // 東西の縁＝南北方向に伸びる欄干
    const railScale = isHorizontalEdge
      ? new THREE.Vector3(RAIL_THICKNESS, RAIL_HEIGHT, TILE_SIZE * 0.92)
      : new THREE.Vector3(TILE_SIZE * 0.92, RAIL_HEIGHT, RAIL_THICKNESS);
    const railPosition = new THREE.Vector3(
      tilePosition.x + dx * TILE_SIZE * 0.46,
      DECK_TOP_Y,
      tilePosition.z + dz * TILE_SIZE * 0.46,
    );
    parts.push(
      addInstance(UNIT_BOX_POOL, railPosition, ZERO_ROTATION, railScale, BRIDGE_RAIL_COLOR, { animate }),
    );

    // 欄干の両端に、細い柱を1本ずつ立てて橋らしいディテールを加える。
    const postOffset = isHorizontalEdge
      ? new THREE.Vector3(0, 0, TILE_SIZE * 0.46)
      : new THREE.Vector3(TILE_SIZE * 0.46, 0, 0);
    [-1, 1].forEach((sign) => {
      const postPosition = new THREE.Vector3(
        railPosition.x + postOffset.x * sign,
        DECK_TOP_Y,
        railPosition.z + postOffset.z * sign,
      );
      parts.push(
        addInstance(
          UNIT_CYLINDER_POOL,
          postPosition,
          ZERO_ROTATION,
          new THREE.Vector3(0.06, RAIL_HEIGHT * 1.15, 0.06),
          BRIDGE_RAIL_COLOR,
          { animate },
        ),
      );
    });
  });

  return { kind: 'instances', parts };
}

/**
 * 道タイルを生成する。type（'road'|'dirtRoad'|'cobblestone'|'bridge'）に応じて
 * 見た目を切り替える。いずれも接続方向(connections)から自動的に見た目が決まる。
 * @returns {{ kind: 'instances', parts: Array<{key: string, index: number}> }}
 */
export function generateRoad(
  tilePosition,
  connections,
  { animate = false, type = 'road', rotationY = 0 } = {},
) {
  if (type === 'bridge') return generateBridge(tilePosition, connections, { animate, rotationY });
  return generatePlainRoad(tilePosition, connections, { animate, type });
}

const MAX_PATH_SEARCH_STEPS = 600;

function tileKeyOf(tile) {
  return `${tile.userData.globalX},${tile.userData.globalY}`;
}

/**
 * startTileの隣接4タイルのうち、道(ROAD_TYPES)であるものを返す
 * （建物・住居自体は道ではないため、そこに隣接する道タイルを探す）。
 */
function findAdjacentRoadTile(getGlobalTile, tile) {
  const { globalX, globalY } = tile.userData;
  const candidates = [
    getGlobalTile(globalX, globalY - 1),
    getGlobalTile(globalX, globalY + 1),
    getGlobalTile(globalX - 1, globalY),
    getGlobalTile(globalX + 1, globalY),
  ];
  return candidates.find((neighbor) => neighbor && ROAD_TYPES.has(neighbor.userData.tileType)) ?? null;
}

/**
 * fromTile付近の道からtoTile付近の道まで、道タイルだけを辿る単純な
 * 幅優先探索（A*等の複雑な経路探索は行わない）。どちらかが道に接していない
 * 場合や、道でつながっていない場合はnullを返す（呼び出し側は直線移動に
 * フォールバックする想定）。
 * @returns {Array<tile>|null} 出発地点付近の道から到着地点付近の道までの、
 *   道タイルの配列（fromTile/toTile自体は含まない）。
 */
export function findRoadPath(getGlobalTile, fromTile, toTile) {
  if (!fromTile || !toTile) return null;

  const startRoadTile = findAdjacentRoadTile(getGlobalTile, fromTile);
  const endRoadTile = findAdjacentRoadTile(getGlobalTile, toTile);
  if (!startRoadTile || !endRoadTile) return null;

  if (tileKeyOf(startRoadTile) === tileKeyOf(endRoadTile)) {
    return [startRoadTile];
  }

  const visited = new Set([tileKeyOf(startRoadTile)]);
  const queue = [[startRoadTile]];
  let stepsExplored = 0;

  while (queue.length > 0 && stepsExplored < MAX_PATH_SEARCH_STEPS) {
    const path = queue.shift();
    const current = path[path.length - 1];

    const { globalX, globalY } = current.userData;
    const neighbors = [
      getGlobalTile(globalX, globalY - 1),
      getGlobalTile(globalX, globalY + 1),
      getGlobalTile(globalX - 1, globalY),
      getGlobalTile(globalX + 1, globalY),
    ];

    for (const neighbor of neighbors) {
      if (!neighbor || !ROAD_TYPES.has(neighbor.userData.tileType)) continue;
      const key = tileKeyOf(neighbor);
      if (visited.has(key)) continue;
      visited.add(key);
      stepsExplored += 1;

      const nextPath = [...path, neighbor];
      if (key === tileKeyOf(endRoadTile)) {
        return nextPath;
      }
      queue.push(nextPath);
    }
  }

  return null; // 経路が見つからなかった（未接続、または探索上限に到達）
}
