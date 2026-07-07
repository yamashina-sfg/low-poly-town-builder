import { describe, test, expect } from 'vitest';
import { isTilePlaceable, isConnectedToRoad, initWorld, buildOnTile } from './world.js';
import { getGlobalTile } from '../chunkManager.js';

function makeTile(tileType) {
  return { userData: { tileType } };
}

describe('isTilePlaceable（フェーズ21の重なりチェック＋フェーズ22の橋のルール）', () => {
  test('橋は水タイルにしか設置できない', () => {
    expect(isTilePlaceable(makeTile('water'), 'bridge')).toBe(true);
    expect(isTilePlaceable(makeTile('grass'), 'bridge')).toBe(false);
    expect(isTilePlaceable(makeTile('road'), 'bridge')).toBe(false);
  });

  test('橋以外の道（road/dirtRoad/cobblestone）は水タイルには敷けない', () => {
    expect(isTilePlaceable(makeTile('water'), 'road')).toBe(false);
    expect(isTilePlaceable(makeTile('water'), 'dirtRoad')).toBe(false);
    expect(isTilePlaceable(makeTile('water'), 'cobblestone')).toBe(false);
    expect(isTilePlaceable(makeTile('grass'), 'dirtRoad')).toBe(true);
  });

  test('建物・装飾は更地(grass)にしか設置できない', () => {
    expect(isTilePlaceable(makeTile('grass'), 'house')).toBe(true);
    expect(isTilePlaceable(makeTile('house'), 'shop')).toBe(false);
    expect(isTilePlaceable(makeTile('road'), 'fence')).toBe(false);
  });

  test('地形系（木・水・更地に戻す等）は常に設置可能', () => {
    expect(isTilePlaceable(makeTile('house'), 'tree')).toBe(true);
    expect(isTilePlaceable(makeTile('road'), 'water')).toBe(true);
    expect(isTilePlaceable(makeTile('house'), 'clear')).toBe(true);
  });

  test('タイルがnull（未読込チャンク）の場合はfalse', () => {
    expect(isTilePlaceable(null, 'house')).toBe(false);
  });
});

describe('isConnectedToRoad（フェーズ22：建物が道に接続されているか）', () => {
  test('隣接タイルに道があれば接続とみなす', () => {
    initWorld({ add: () => {} });
    const spawnTile = getGlobalTile(5, 5); // スポーン地点は常にgrass
    buildOnTile(spawnTile, 'road');
    const neighborOfSpawn = getGlobalTile(5, 6);
    expect(isConnectedToRoad(neighborOfSpawn)).toBe(true);
  });

  test('隣接タイルに道がなければ未接続', () => {
    initWorld({ add: () => {} });
    const farTile = getGlobalTile(-3, -3);
    expect(isConnectedToRoad(farTile)).toBe(false);
  });
});
