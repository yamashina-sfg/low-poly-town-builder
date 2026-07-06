import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import {
  initInteriorRoom,
  getRoomVariantIndexForSeed,
  applyRoomVariantForSeed,
  getIndoorTiles,
  ROOM_VARIANTS,
} from './interior.js';

function makeFakeScene() {
  return { add: () => {} };
}

describe('内装バリエーション（フェーズ18: ビジュアル強化）', () => {
  test('同じseedなら常に同じバリエーションが選ばれる（決定論的）', () => {
    const seed = 12345;
    expect(getRoomVariantIndexForSeed(seed)).toBe(getRoomVariantIndexForSeed(seed));
  });

  test('バリエーションのインデックスは必ずROOM_VARIANTSの範囲内に収まる', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const index = getRoomVariantIndexForSeed(seed);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(ROOM_VARIANTS.length);
    }
  });

  test('applyRoomVariantForSeedを呼ぶと床タイルの色が実際に変わる', () => {
    initInteriorRoom(makeFakeScene());
    const tiles = getIndoorTiles();
    expect(tiles.length).toBeGreaterThan(0);

    // ROOM_VARIANTS[0]以外になる、既知のseedを探す
    let seedForVariant1 = 0;
    while (getRoomVariantIndexForSeed(seedForVariant1) === 0) seedForVariant1 += 1;

    applyRoomVariantForSeed(seedForVariant1);
    const expectedColor = new THREE.Color(ROOM_VARIANTS[getRoomVariantIndexForSeed(seedForVariant1)].floor);
    tiles.forEach((tile) => {
      expect(tile.material.color.equals(expectedColor)).toBe(true);
    });
  });
});
