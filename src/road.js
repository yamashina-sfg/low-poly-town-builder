import * as THREE from 'three';
import { addInstance, UNIT_BOX_POOL } from './instancing.js';
import { UNIT_CYLINDER_POOL } from './primitives.js';
import { TILE_SIZE } from './terrain.js';
import { WOOD_COLOR, GRAVEL_PATH_COLOR, GRAVEL_PEBBLE_COLOR } from './palette.js';

const ZERO_ROTATION = new THREE.Euler(0, 0, 0);

const DIRECTIONS = [
  { key: 'N', dx: 0, dz: -1 },
  { key: 'S', dx: 0, dz: 1 },
  { key: 'E', dx: 1, dz: 0 },
  { key: 'W', dx: -1, dz: 0 },
];

// 道として扱う（＝互いに接続し、NPCの経路探索が辿れる）タイル種別。
// フェーズ22：土の道・石畳・橋を追加。フェーズ26：砂利道を追加。
// 見た目が違っても接続・経路探索は共通にする。
export const ROAD_TYPES = new Set(['road', 'dirtRoad', 'cobblestone', 'bridge', 'gravelPath']);

const ROAD_PALETTES = {
  road: { base: new THREE.Color(0x777777), line: new THREE.Color(0xf2f2f2) },
  dirtRoad: { base: new THREE.Color(0x8a6a4a), line: null },
  cobblestone: { base: new THREE.Color(0xa8a196), line: new THREE.Color(0x8a8478) },
  gravelPath: { base: new THREE.Color(GRAVEL_PATH_COLOR), line: null },
};

// 砂利道の小石の散らし方（固定オフセット。石畳の目地と同様、乱数無しで
// 常に同じ見た目にする）。
const GRAVEL_PEBBLE_OFFSETS = [
  [-0.28, -0.22],
  [0.18, -0.3],
  [0.3, 0.15],
  [-0.12, 0.28],
  [0.05, -0.05],
];

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

  if (type === 'gravelPath') {
    // 砂利道：接続方向に関係なく、常に小石を散らして砂利らしさを出す
    // （土の道より粒立った質感にする）。
    const pebbleColor = new THREE.Color(GRAVEL_PEBBLE_COLOR);
    GRAVEL_PEBBLE_OFFSETS.forEach(([tx, tz]) => {
      parts.push(
        addInstance(
          UNIT_BOX_POOL,
          new THREE.Vector3(tilePosition.x + TILE_SIZE * tx, 0.04, tilePosition.z + TILE_SIZE * tz),
          ZERO_ROTATION,
          new THREE.Vector3(0.1, 0.03, 0.1),
          pebbleColor,
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
// デッキの「低い端」は道路の土台(y=0〜0.02)に近い高さにして、隣接する道・
// 地面との段差が目立たないようにする。中央はBRIDGE_ARCH_HEIGHTぶん高くなる。
const DECK_BOTTOM_Y = 0.02;
const DECK_HEIGHT = 0.08;
const RAIL_HEIGHT = 0.34;
const RAIL_THICKNESS = 0.07;
const BRIDGE_ARCH_HEIGHT = 0.6; // 橋の中央が、両端よりどれだけ高く盛り上がるか
const SEGMENTS_PER_TILE = 4; // デッキ・欄干をこの数の板に分割し、少しずつ角度・高さを変えてアーチにする
const SEGMENT_OVERLAP = 0.05; // 板同士の継ぎ目に隙間ができないよう、わずかに重ねる
const RAIL_INSET = 0.08; // 欄干をタイル端から少しだけ内側に置く

function archHeightAtT(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return BRIDGE_ARCH_HEIGHT * Math.sin(Math.PI * clamped);
}

/**
 * 橋の「進行方向」（アーチが登る軸、かつ欄干を付けない前後）を決める。
 * 実際に道・橋が接続している方向があればそれを優先し（両方の軸に接続が
 * ある交差点はNS優先の固定扱い）、どこにも接続されていない孤立したタイル
 * ではrotationY（フェーズ21のRキー回転）から決める。
 */
function resolveBridgeAxis(connections, rotationY) {
  const hasNS = connections.N || connections.S;
  const hasEW = connections.E || connections.W;
  if (hasNS && !hasEW) return 'NS';
  if (hasEW && !hasNS) return 'EW';
  if (hasNS && hasEW) return 'NS';
  const steps = Math.round(rotationY / (Math.PI / 2)) % 4;
  return steps % 2 === 0 ? 'NS' : 'EW';
}

/**
 * axis方向に連続している橋タイルの中で、このタイルが何番目か・全体で
 * 何タイル分あるかを、実際のタイルオブジェクトは取得せず隣接判定だけで
 * 数える。橋が複数タイルにまたがる場合、タイル単体ではなく橋全体
 * （スパン）を1つの滑らかなアーチにするために使う。
 * getGlobalTileが無い（グリッド情報を持たない）場合は、このタイル単体を
 * 長さ1のスパンとして扱う。
 */
function walkBridgeSpan(getGlobalTile, globalX, globalY, axis) {
  if (!getGlobalTile) return { indexInSpan: 0, spanLength: 1 };

  const dx = axis === 'EW' ? 1 : 0;
  const dz = axis === 'NS' ? 1 : 0;

  let back = 0;
  for (;;) {
    const neighbor = getGlobalTile(globalX - dx * (back + 1), globalY - dz * (back + 1));
    if (!neighbor || neighbor.userData.tileType !== 'bridge') break;
    back += 1;
  }
  let forward = 0;
  for (;;) {
    const neighbor = getGlobalTile(globalX + dx * (forward + 1), globalY + dz * (forward + 1));
    if (!neighbor || neighbor.userData.tileType !== 'bridge') break;
    forward += 1;
  }
  return { indexInSpan: back, spanLength: back + forward + 1 };
}

/**
 * このタイルが属する橋スパイン全体の、ワールド座標上の開始位置(axis方向)と
 * 全長を求める。他のタイルのpositionを取得しなくても、タイルは等間隔の
 * グリッド上に並ぶという前提だけで計算できる（どのタイルから計算しても
 * 同じ値になる）。
 */
function computeSpanRange(tilePosition, axis, indexInSpan, spanLength) {
  const axisCoord = axis === 'NS' ? tilePosition.z : tilePosition.x;
  const start = axisCoord - indexInSpan * TILE_SIZE - TILE_SIZE / 2;
  const length = spanLength * TILE_SIZE;
  return { start, length };
}

/**
 * 橋：水の上に架ける道。1タイルの中でも、さらに橋全体（連続する橋タイルの
 * スパン）の中でも、中央が高く両端が低いなだらかなアーチになるよう、
 * デッキ・欄干をSEGMENTS_PER_TILE枚の板に分割し、少しずつ高さ・角度を
 * 変えて並べる。デッキは水面よりはっきり高い位置に来るため、下に隙間が
 * でき水面が透けて見える。進行方向（アーチが登る軸）の前後は常に開けて
 * おき、左右の縁にだけ低い欄干を立てる。実際に道・橋が接続している方向は
 * 回転にかかわらず常に開けておく。
 */
function generateBridge(
  tilePosition,
  connections,
  { animate = false, rotationY = 0, getGlobalTile = null, globalX = 0, globalY = 0 } = {},
) {
  const parts = [];
  const axis = resolveBridgeAxis(connections, rotationY);
  const axisIsNS = axis === 'NS';
  const { indexInSpan, spanLength } = walkBridgeSpan(getGlobalTile, globalX, globalY, axis);
  const { start: spanStart, length: spanTotalLength } = computeSpanRange(
    tilePosition,
    axis,
    indexInSpan,
    spanLength,
  );

  const tileAxisCenter = axisIsNS ? tilePosition.z : tilePosition.x;
  const segmentLength = TILE_SIZE / SEGMENTS_PER_TILE;

  function heightAt(worldAxisPos) {
    return archHeightAtT((worldAxisPos - spanStart) / spanTotalLength);
  }

  // 傾いた板（デッキ・欄干共通）を1枚追加する。baseYはこの板の「低い端の
  // 高さ0のときの」基準Y（デッキ自身ならDECK_BOTTOM_Y、デッキの上に乗る
  // 欄干ならデッキ表面の高さ）。localStart/localEndはタイル中心からの
  // axis方向オフセット。
  function addSlopedBox(perpOffset, baseY, scaleAcross, thickness, color, localStart, localEnd) {
    const hStart = heightAt(tileAxisCenter + localStart);
    const hEnd = heightAt(tileAxisCenter + localEnd);
    const hMid = (hStart + hEnd) / 2;
    const axisCenter = (localStart + localEnd) / 2;
    const tilt = Math.atan2(hEnd - hStart, localEnd - localStart);

    const position = new THREE.Vector3(
      tilePosition.x + (axisIsNS ? perpOffset : axisCenter),
      baseY + hMid,
      tilePosition.z + (axisIsNS ? axisCenter : perpOffset),
    );
    // 単位ボックスは底面ピボット。傾きは、進行方向に伸びる辺を軸と直交する
    // 水平回転軸で回すことで表現する（NS軸ならX軸回り、EW軸ならZ軸回り）。
    const rotation = axisIsNS ? new THREE.Euler(-tilt, 0, 0) : new THREE.Euler(0, 0, tilt);
    const length = localEnd - localStart + SEGMENT_OVERLAP;
    const scale = axisIsNS
      ? new THREE.Vector3(scaleAcross, thickness, length)
      : new THREE.Vector3(length, thickness, scaleAcross);
    parts.push(addInstance(UNIT_BOX_POOL, position, rotation, scale, color, { animate }));
  }

  // デッキ：区画ごとに高さ・傾きを変えた板を並べ、中央が高いなだらかな
  // アーチにする。
  for (let i = 0; i < SEGMENTS_PER_TILE; i += 1) {
    const localStart = -TILE_SIZE / 2 + i * segmentLength;
    const localEnd = localStart + segmentLength;
    addSlopedBox(0, DECK_BOTTOM_Y, TILE_SIZE, DECK_HEIGHT, BRIDGE_DECK_COLOR, localStart, localEnd);
  }

  // 欄干：進行方向（開けておく軸）と直交する左右の縁にだけ、デッキと同じ
  // 傾きの低い手すりを並べる。実際に道・橋が接続している側は開けておく。
  DIRECTIONS.forEach(({ key, dx, dz }) => {
    const isNorthSouth = dx === 0;
    const isOpenSide = isNorthSouth === axisIsNS;
    if (isOpenSide || connections[key]) return;

    const sign = dx !== 0 ? dx : dz;
    const perpOffset = sign * (TILE_SIZE / 2 - RAIL_INSET);
    const railBaseY = DECK_BOTTOM_Y + DECK_HEIGHT;

    for (let i = 0; i < SEGMENTS_PER_TILE; i += 1) {
      const localStart = -TILE_SIZE / 2 + i * segmentLength;
      const localEnd = localStart + segmentLength;
      addSlopedBox(
        perpOffset,
        railBaseY,
        RAIL_THICKNESS,
        RAIL_HEIGHT,
        BRIDGE_RAIL_COLOR,
        localStart,
        localEnd,
      );
    }

    // 区画の境目ごとに柱を立てる（隣接タイルの柱とも高さがきちんとそろう）。
    for (let i = 0; i <= SEGMENTS_PER_TILE; i += 1) {
      const localPos = -TILE_SIZE / 2 + i * segmentLength;
      const h = heightAt(tileAxisCenter + localPos);
      const postPosition = new THREE.Vector3(
        tilePosition.x + (axisIsNS ? perpOffset : localPos),
        railBaseY + h,
        tilePosition.z + (axisIsNS ? localPos : perpOffset),
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
    }
  });

  return { kind: 'instances', parts };
}

/**
 * tileが橋タイルであれば、そのアーチに沿った「歩行面の高さ」
 * （worldX, worldZ地点でのデッキ表面のY座標）を返す。橋でなければ0
 * （通常の地面の高さ）を返す。プレイヤー/NPCが橋を渡るとき、移動後の
 * X/Z座標からこの高さを求めてY座標に反映することで、アーチに沿って
 * 実際に高さが変化しながら歩けるようにする。
 */
export function getBridgeSurfaceHeight(getGlobalTile, tile, worldX, worldZ) {
  if (!tile || tile.userData.tileType !== 'bridge') return 0;
  const { globalX, globalY, rotationY = 0 } = tile.userData;
  const connections = computeRoadConnections(getGlobalTile, globalX, globalY);
  const axis = resolveBridgeAxis(connections, rotationY);
  const { indexInSpan, spanLength } = walkBridgeSpan(getGlobalTile, globalX, globalY, axis);
  const { start, length } = computeSpanRange(tile.position, axis, indexInSpan, spanLength);
  const worldAxisPos = axis === 'NS' ? worldZ : worldX;
  return DECK_BOTTOM_Y + DECK_HEIGHT + archHeightAtT((worldAxisPos - start) / length);
}

/**
 * 道タイルを生成する。type（'road'|'dirtRoad'|'cobblestone'|'bridge'）に応じて
 * 見た目を切り替える。いずれも接続方向(connections)から自動的に見た目が決まる。
 * 橋はさらに、getGlobalTile/globalX/globalYから連続する橋タイルのスパンを
 * 求め、アーチの形状に反映する。
 * @returns {{ kind: 'instances', parts: Array<{key: string, index: number}> }}
 */
export function generateRoad(
  tilePosition,
  connections,
  { animate = false, type = 'road', rotationY = 0, getGlobalTile = null, globalX = 0, globalY = 0 } = {},
) {
  if (type === 'bridge') {
    return generateBridge(tilePosition, connections, { animate, rotationY, getGlobalTile, globalX, globalY });
  }
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
