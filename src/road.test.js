import * as THREE from 'three';
import { describe, test, expect } from 'vitest';
import { ROAD_TYPES, computeRoadConnections, findRoadPath, generateRoad } from './road.js';
import { UNIT_BOX_POOL } from './instancing.js';
import { UNIT_CYLINDER_POOL } from './primitives.js';

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

  function countByPool(parts, poolKey) {
    return parts.filter((part) => part.key === poolKey).length;
  }

  test('接続の無い孤立した橋タイルは、4面ではなく2面（進行方向の左右）だけに欄干を持つ（箱型にならない）', () => {
    const { parts } = generateRoad(tilePosition, noConnections, { type: 'bridge', rotationY: 0 });
    // デッキ1枚 + 欄干2本（左右のみ、前後は開けておく）
    expect(countByPool(parts, UNIT_BOX_POOL)).toBe(1 + 2);
    // 欄干2本 × 両端の柱2本 = 4本
    expect(countByPool(parts, UNIT_CYLINDER_POOL)).toBe(4);
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
    // 接続方向(N/S)は開けたまま、E/Wのみ欄干（デッキ1 + 欄干2本）
    expect(countByPool(parts, UNIT_BOX_POOL)).toBe(1 + 2);
  });
});
