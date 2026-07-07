import { describe, test, expect } from 'vitest';
import { ROAD_TYPES, computeRoadConnections, findRoadPath } from './road.js';

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
