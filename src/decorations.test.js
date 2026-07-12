import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import {
  getSeasonalTreeFoliageColor,
  getLanternGlowColor,
  getSnowmanBodyColor,
  generateSeasonalTree,
  generateLantern,
  generateSnowman,
} from './decorations.js';

describe('季節オブジェクトの色ヘルパー（フェーズ26：季節・時間帯に応じて見た目が切り替わる）', () => {
  test('季節の木の葉は、季節ごとに異なる色になる（少なくとも夏と冬は別の色）', () => {
    const summer = getSeasonalTreeFoliageColor('summer');
    const winter = getSeasonalTreeFoliageColor('winter');
    expect(summer).toBeInstanceOf(THREE.Color);
    expect(summer.getHex()).not.toBe(winter.getHex());
  });

  test('季節の木は未知の季節名でもクラッシュせず、夏相当にフォールバックする', () => {
    const unknown = getSeasonalTreeFoliageColor('nonexistent-season');
    const summer = getSeasonalTreeFoliageColor('summer');
    expect(unknown.getHex()).toBe(summer.getHex());
  });

  test('提灯は夜に灯り、昼は消えた色になる（別の色）', () => {
    const lit = getLanternGlowColor(true);
    const unlit = getLanternGlowColor(false);
    expect(lit.getHex()).not.toBe(unlit.getHex());
  });

  test('雪だるまは冬は白く、それ以外の季節は溶けた色になる', () => {
    const winter = getSnowmanBodyColor('winter');
    const summer = getSnowmanBodyColor('summer');
    const autumn = getSnowmanBodyColor('autumn');
    expect(winter.getHex()).not.toBe(summer.getHex());
    // 冬以外はどの季節でも同じ「溶けた」色になる。
    expect(summer.getHex()).toBe(autumn.getHex());
  });
});

describe('季節オブジェクトの生成（フェーズ26）', () => {
  const tilePosition = new THREE.Vector3(0, 0, 0);

  test('generateSeasonalTreeはseasonalPartsに葉のパーツを含める', () => {
    const { parts, seasonalParts } = generateSeasonalTree(1, tilePosition, { season: 'autumn' });
    expect(parts.length).toBeGreaterThan(seasonalParts.length); // 幹はseasonalPartsに含まれない
    expect(seasonalParts.length).toBe(3); // 葉の房3つ
  });

  test('generateLanternはseasonalPartsに灯りのパーツだけを含める', () => {
    const { parts, seasonalParts } = generateLantern(1, tilePosition, { isNight: true });
    expect(seasonalParts.length).toBe(1);
    expect(parts.length).toBeGreaterThan(seasonalParts.length); // 柱はseasonalPartsに含まれない
  });

  test('generateSnowmanはseasonalPartsに雪玉3段を含める（腕は含まない）', () => {
    const { parts, seasonalParts } = generateSnowman(1, tilePosition, { season: 'winter' });
    expect(seasonalParts.length).toBe(3);
    expect(parts.length).toBeGreaterThan(seasonalParts.length);
  });
});
