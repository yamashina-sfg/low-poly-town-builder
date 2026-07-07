import * as THREE from 'three';
import { describe, test, expect } from 'vitest';
import {
  ROAD_TYPES,
  computeRoadConnections,
  findRoadPath,
  generateRoad,
  getBridgeSurfaceHeight,
} from './road.js';
import { UNIT_BOX_POOL } from './instancing.js';
import { UNIT_CYLINDER_POOL } from './primitives.js';
import { TILE_SIZE } from './terrain.js';

// road.js の接続・経路探索はgetGlobalTile(gx,gy)という関数にしか依存しないため、
// 実際のchunkManagerを使わず、シンプルなインメモリのタイル格子でテストできる。
function makeGrid(cells) {
  const map = new Map();
  cells.forEach(({ x, y, type }) => {
    map.set(`${x},${y}`, { userData: { globalX: x, globalY: y, tileType: type } });
  });
  return (gx, gy) => map.get(`${gx},${gy}`) ?? null;
}

describe('ROAD_TYPES', () => {
  test('道として扱う4種類（road/dirtRoad/cobblestone/bridge）を含む', () => {
    expect(ROAD_TYPES.has('road')).toBe(true);
    expect(ROAD_TYPES.has('dirtRoad')).toBe(true);
    expect(ROAD_TYPES.has('cobblestone')).toBe(true);
    expect(ROAD_TYPES.has('bridge')).toBe(true);
    expect(ROAD_TYPES.has('house')).toBe(false);
  });
});

describe('computeRoadConnections', () => {
  test('見た目が違う道同士（road/dirtRoad/cobblestone/bridge）も互いに接続とみなす', () => {
    const getGlobalTile = makeGrid([
      { x: 5, y: 5, type: 'road' },
      { x: 6, y: 5, type: 'dirtRoad' },
      { x: 4, y: 5, type: 'cobblestone' },
      { x: 5, y: 4, type: 'bridge' },
      { x: 5, y: 6, type: 'grass' },
    ]);
    const connections = computeRoadConnections(getGlobalTile, 5, 5);
    expect(connections.E).toBe(true); // dirtRoad
    expect(connections.W).toBe(true); // cobblestone
    expect(connections.N).toBe(true); // bridge
    expect(connections.S).toBe(false); // grass
  });

  test('隣接タイルが存在しない（未読込チャンク）場合はfalseになる', () => {
    const getGlobalTile = makeGrid([{ x: 0, y: 0, type: 'road' }]);
    const connections = computeRoadConnections(getGlobalTile, 0, 0);
    expect(connections.N).toBe(false);
    expect(connections.S).toBe(false);
  });
});

describe('findRoadPath', () => {
  test('道でつながっている場合、経路を返す', () => {
    // house(0,0) - road(1,0) - road(2,0) - road(3,0) - shop(4,0)
    const getGlobalTile = makeGrid([
      { x: 0, y: 0, type: 'house' },
      { x: 1, y: 0, type: 'road' },
      { x: 2, y: 0, type: 'dirtRoad' },
      { x: 3, y: 0, type: 'bridge' },
      { x: 4, y: 0, type: 'shop' },
    ]);
    const houseTile = getGlobalTile(0, 0);
    const shopTile = getGlobalTile(4, 0);
    const path = findRoadPath(getGlobalTile, houseTile, shopTile);
    expect(path).not.toBeNull();
    expect(path[0].userData.globalX).toBe(1);
    expect(path[path.length - 1].userData.globalX).toBe(3);
  });

  test('道が繋がっていない（孤立した店）場合はnullを返す', () => {
    const getGlobalTile = makeGrid([
      { x: 0, y: 0, type: 'house' },
      { x: 1, y: 0, type: 'road' },
      // 道が途切れている
      { x: 10, y: 10, type: 'road' },
      { x: 11, y: 10, type: 'shop' },
    ]);
    const houseTile = getGlobalTile(0, 0);
    const shopTile = getGlobalTile(11, 10);
    expect(findRoadPath(getGlobalTile, houseTile, shopTile)).toBeNull();
  });

  test('出発地・目的地のどちらかが道に隣接していない場合はnullを返す', () => {
    const getGlobalTile = makeGrid([
      { x: 0, y: 0, type: 'house' }, // 道に隣接していない
      { x: 5, y: 5, type: 'road' },
      { x: 6, y: 5, type: 'shop' },
    ]);
    const houseTile = getGlobalTile(0, 0);
    const shopTile = getGlobalTile(6, 5);
    expect(findRoadPath(getGlobalTile, houseTile, shopTile)).toBeNull();
  });
});

describe('generateRoad（橋の見た目、バグ修正の回帰テスト）', () => {
  const noConnections = { N: false, S: false, E: false, W: false };
  const tilePosition = new THREE.Vector3(0, 0, 0);
  // road.js内部のSEGMENTS_PER_TILE(=4)に合わせた期待値。
  const SEGMENTS_PER_TILE = 4;

  function countByPool(parts, poolKey) {
    return parts.filter((part) => part.key === poolKey).length;
  }

  test('接続の無い孤立した橋タイルは、4面ではなく2面（進行方向の左右）だけに欄干を持つ（箱型にならない）', () => {
    const { parts } = generateRoad(tilePosition, noConnections, { type: 'bridge', rotationY: 0 });
    // デッキ(区画分割) + 欄干2本（左右のみ、前後は開けておく）× 区画分割
    expect(countByPool(parts, UNIT_BOX_POOL)).toBe(SEGMENTS_PER_TILE + 2 * SEGMENTS_PER_TILE);
    // 欄干2本 × (区画数+1)本の柱
    expect(countByPool(parts, UNIT_CYLINDER_POOL)).toBe(2 * (SEGMENTS_PER_TILE + 1));
  });

  test('90度回転すると、欄干が付く辺（開いている進行方向）が入れ替わる', () => {
    const straight = generateRoad(tilePosition, noConnections, { type: 'bridge', rotationY: 0 });
    const rotated = generateRoad(tilePosition, noConnections, {
      type: 'bridge',
      rotationY: Math.PI / 2,
    });
    // どちらも欄干の数自体は変わらない（常に2面だけ）
    expect(countByPool(rotated.parts, UNIT_BOX_POOL)).toBe(countByPool(straight.parts, UNIT_BOX_POOL));
    expect(countByPool(rotated.parts, UNIT_CYLINDER_POOL)).toBe(
      countByPool(straight.parts, UNIT_CYLINDER_POOL),
    );
  });

  test('実際に道・橋が接続している方向は、回転にかかわらず常に開ける（通行の妨げにしない）', () => {
    // 南北(N/S)に道が繋がっている橋：回転していなくても、この方向には欄干を付けない。
    const connectedNS = { N: true, S: true, E: false, W: false };
    const { parts } = generateRoad(tilePosition, connectedNS, { type: 'bridge', rotationY: 0 });
    // 接続方向(N/S)は開けたまま、E/Wのみ欄干
    expect(countByPool(parts, UNIT_BOX_POOL)).toBe(SEGMENTS_PER_TILE + 2 * SEGMENTS_PER_TILE);
  });
});

describe('getBridgeSurfaceHeight（橋のアーチ：中央が高く、両端は隣接する地面と揃う高さ）', () => {
  function makeBridgeGrid(cells) {
    const map = new Map();
    cells.forEach(({ x, y, type, rotationY = 0 }) => {
      map.set(`${x},${y}`, {
        position: new THREE.Vector3(x * TILE_SIZE, 0, y * TILE_SIZE),
        userData: { globalX: x, globalY: y, tileType: type, rotationY },
      });
    });
    return (gx, gy) => map.get(`${gx},${gy}`) ?? null;
  }

  test('橋タイルでなければ常に0を返す（通常の地面の高さ）', () => {
    const getGlobalTile = makeBridgeGrid([{ x: 0, y: 0, type: 'grass' }]);
    const tile = getGlobalTile(0, 0);
    expect(getBridgeSurfaceHeight(getGlobalTile, tile, 0, 0)).toBe(0);
  });

  test('孤立した橋タイル1枚は、中央が最も高く、両端（タイルの縁）は低い（隣接する地面と揃う高さ）', () => {
    const getGlobalTile = makeBridgeGrid([
      { x: 0, y: 0, type: 'bridge' },
      { x: 0, y: -1, type: 'road' },
      { x: 0, y: 1, type: 'road' },
    ]);
    const tile = getGlobalTile(0, 0);
    const center = getBridgeSurfaceHeight(getGlobalTile, tile, tile.position.x, tile.position.z);
    const nearEdge = getBridgeSurfaceHeight(
      getGlobalTile,
      tile,
      tile.position.x,
      tile.position.z - TILE_SIZE / 2,
    );
    const farEdge = getBridgeSurfaceHeight(
      getGlobalTile,
      tile,
      tile.position.x,
      tile.position.z + TILE_SIZE / 2,
    );
    expect(center).toBeGreaterThan(nearEdge);
    expect(center).toBeGreaterThan(farEdge);
    // 両端は道タイルの高さに近い低い値になっているはず（大きな段差がない）。
    expect(nearEdge).toBeLessThan(0.2);
    expect(farEdge).toBeLessThan(0.2);
  });

  test('複数タイルにまたがる橋は、タイルごとではなく橋全体で1つの滑らかなアーチになる', () => {
    // road - bridge(0,0) - bridge(0,1) - bridge(0,2) - road という3タイル分の橋。
    const getGlobalTile = makeBridgeGrid([
      { x: 0, y: -1, type: 'road' },
      { x: 0, y: 0, type: 'bridge' },
      { x: 0, y: 1, type: 'bridge' },
      { x: 0, y: 2, type: 'bridge' },
      { x: 0, y: 3, type: 'road' },
    ]);
    const firstTile = getGlobalTile(0, 0);
    const middleTile = getGlobalTile(0, 1);
    const lastTile = getGlobalTile(0, 2);

    // スパイン全体の最高点は真ん中のタイルの中心にあるはずで、両端タイル
    // 自身の中心よりも高い（＝タイルごとに山があるのではなく、全体で1つの
    // アーチになっている）。
    const middleCenterHeight = getBridgeSurfaceHeight(
      getGlobalTile,
      middleTile,
      middleTile.position.x,
      middleTile.position.z,
    );
    const firstCenterHeight = getBridgeSurfaceHeight(
      getGlobalTile,
      firstTile,
      firstTile.position.x,
      firstTile.position.z,
    );
    const lastCenterHeight = getBridgeSurfaceHeight(
      getGlobalTile,
      lastTile,
      lastTile.position.x,
      lastTile.position.z,
    );
    expect(middleCenterHeight).toBeGreaterThan(firstCenterHeight);
    expect(middleCenterHeight).toBeGreaterThan(lastCenterHeight);

    // スパインの両端（road に接する側）は低い（段差が目立たない高さ）。
    const spanStartHeight = getBridgeSurfaceHeight(
      getGlobalTile,
      firstTile,
      firstTile.position.x,
      firstTile.position.z - TILE_SIZE / 2,
    );
    const spanEndHeight = getBridgeSurfaceHeight(
      getGlobalTile,
      lastTile,
      lastTile.position.x,
      lastTile.position.z + TILE_SIZE / 2,
    );
    expect(spanStartHeight).toBeLessThan(0.2);
    expect(spanEndHeight).toBeLessThan(0.2);

    // 隣接タイルの境界では、どちら側のタイルから計算しても同じ高さになる
    // （継ぎ目で段差が出ない＝滑らかにつながっている）。
    const boundaryFromFirst = getBridgeSurfaceHeight(
      getGlobalTile,
      firstTile,
      firstTile.position.x,
      firstTile.position.z + TILE_SIZE / 2,
    );
    const boundaryFromMiddle = getBridgeSurfaceHeight(
      getGlobalTile,
      middleTile,
      middleTile.position.x,
      middleTile.position.z - TILE_SIZE / 2,
    );
    expect(boundaryFromFirst).toBeCloseTo(boundaryFromMiddle, 10);
  });
});
