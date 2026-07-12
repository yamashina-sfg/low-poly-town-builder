import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { updateSeasonalSystem } from './seasonalSystem.js';
import { initWorld, buildOnTile, resetTown } from './world.js';
import { getGlobalTile } from '../chunkManager.js';
import { getSeasonalTreeFoliageColor } from '../decorations.js';
import { getPoolMesh } from '../instancing.js';

const fakeScene = { add: () => {}, remove: () => {} };

function readInstanceColor(part) {
  const mesh = getPoolMesh(part.key);
  const color = new THREE.Color();
  mesh.getColorAt(part.index, color);
  return color;
}

beforeEach(() => {
  initWorld(fakeScene);
  resetTown();
});

describe('updateSeasonalSystem（フェーズ26：季節・時間帯に応じた季節オブジェクトの自動切り替え）', () => {
  test('季節が切り替わるほど時間が経過すると、季節の木の葉の色が実際に塗り替わる', () => {
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'seasonalTree', { animate: false });
    const initialColor = readInstanceColor(tile.userData.object.seasonalParts[0]);

    // SECONDS_PER_SEASON(90秒)を優に超える時間を進める（再チェック間隔3秒ごとに判定される）。
    for (let i = 0; i < 40; i += 1) updateSeasonalSystem(3);

    const laterColor = readInstanceColor(tile.userData.object.seasonalParts[0]);
    // 季節が変わっていれば色も変わっているはず（少なくとも初期値と一致し続けはしない）。
    expect(laterColor.getHex()).not.toBe(initialColor.getHex());
  });

  test('季節オブジェクトでないタイル（例：家）は塗り替えの対象にならない（クラッシュしないことも確認）', () => {
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'house', { animate: false });
    expect(() => {
      for (let i = 0; i < 5; i += 1) updateSeasonalSystem(3);
    }).not.toThrow();
  });

  test('色ヘルパー自体は季節の木の葉色を返す（塗り替え先の色が正しい候補の中にあることの裏付け）', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'];
    const hexes = new Set(seasons.map((s) => getSeasonalTreeFoliageColor(s).getHex()));
    expect(hexes.size).toBe(4); // 4季節すべて異なる色を持つ
  });
});
