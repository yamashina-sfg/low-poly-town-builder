import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  getDesiredLocation,
  computeTargetSatisfaction,
  initPopulace,
  updatePopulace,
  getNpcCount,
} from './populace.js';
import { initWorld, buildOnTile, resetTown } from './world.js';
import { getGlobalTile } from '../chunkManager.js';

describe('getDesiredLocation（フェーズ22：NPCの通勤先を時刻から決める）', () => {
  test('8時〜18時未満は勤務先(work)にいるべき', () => {
    expect(getDesiredLocation(8)).toBe('work');
    expect(getDesiredLocation(12)).toBe('work');
    expect(getDesiredLocation(17)).toBe('work');
  });

  test('それ以外の時間帯は家(home)にいるべき', () => {
    expect(getDesiredLocation(18)).toBe('home');
    expect(getDesiredLocation(23)).toBe('home');
    expect(getDesiredLocation(0)).toBe('home');
    expect(getDesiredLocation(7)).toBe('home');
  });
});

describe('computeTargetSatisfaction（フェーズ23：満足度が向かう目標値）', () => {
  const fakeScene = { add: () => {} };

  test('家が無い（null）場合は低い目標値になる（住居が見つからないと不満が募る）', () => {
    initWorld(fakeScene);
    const homeless = computeTargetSatisfaction(null);
    const withNothingNearby = computeTargetSatisfaction(
      (() => {
        buildOnTile(getGlobalTile(5, 5), 'house');
        return getGlobalTile(5, 5);
      })(),
    );
    expect(homeless).toBeLessThan(withNothingNearby);
  });

  test('近くにお店・装飾が増えるほど目標値が上がる', () => {
    initWorld(fakeScene);
    const homeTile = getGlobalTile(5, 5);
    buildOnTile(homeTile, 'house');
    const baseline = computeTargetSatisfaction(homeTile);

    buildOnTile(getGlobalTile(6, 5), 'shop');
    const withShop = computeTargetSatisfaction(homeTile);
    expect(withShop).toBeGreaterThan(baseline);

    buildOnTile(getGlobalTile(4, 5), 'flowerbed');
    const withShopAndDecoration = computeTargetSatisfaction(homeTile);
    expect(withShopAndDecoration).toBeGreaterThan(withShop);
  });

  test('道に接続されていると目標値がさらに上がる', () => {
    initWorld(fakeScene);
    const homeTile = getGlobalTile(5, 5);
    buildOnTile(homeTile, 'house');
    const withoutRoad = computeTargetSatisfaction(homeTile);

    buildOnTile(getGlobalTile(6, 5), 'road');
    const withRoad = computeTargetSatisfaction(homeTile);
    expect(withRoad).toBeGreaterThan(withoutRoad);
  });

  test('目標値は常に0〜100の範囲に収まる', () => {
    initWorld(fakeScene);
    const homeTile = getGlobalTile(5, 5);
    buildOnTile(homeTile, 'house');
    // 近隣タイルを片っ端からお店・装飾で埋めても100を超えない。
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        buildOnTile(getGlobalTile(5 + dx, 5 + dy), 'shop');
      }
    }
    const saturated = computeTargetSatisfaction(homeTile);
    expect(saturated).toBeLessThanOrEqual(100);
    expect(saturated).toBeGreaterThanOrEqual(0);
  });
});

describe('満足度に応じた移住・人口増加（フェーズ23の重点確認事項）', () => {
  const fakeScene = { add: () => {}, remove: () => {} };

  // 移住・入居時にshowStatusMessageがトースト表示用のDOM要素を参照するため、
  // 本番のindex.htmlと同様に#status-messageを用意しておく。
  beforeEach(() => {
    if (!document.getElementById('status-message')) {
      const el = document.createElement('div');
      el.id = 'status-message';
      el.classList.add('hidden');
      document.body.appendChild(el);
    }
  });

  test('住居が無いまま（ホームレス）満足度が低い状態が続くと、NPCが実際に移住して人口が減る', () => {
    // 確率判定（移住・成長のどちらも）を常に「発生する」側に固定し、
    // 期待する挙動そのもの（低満足度が続けば減る）を決定論的に検証する。
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      initWorld(fakeScene);
      resetTown(); // 他のテストで建てた住居・お店などの残留状態を一掃する
      initPopulace(fakeScene);
      const initialCount = getNpcCount();
      expect(initialCount).toBeGreaterThan(0);

      // ASSIGNMENT_INTERVAL(2秒)ごとに満足度・移住判定が走る。住居が無い間は
      // 目標満足度が低いままなので、いずれ全員が閾値を下回り移住していく。
      for (let i = 0; i < 100; i += 1) {
        updatePopulace(2, i * 2);
      }

      expect(getNpcCount()).toBeLessThan(initialCount);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test('人口が0になっても、空いている住居があれば新しい住民が実際に入居し、人口が回復する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      initWorld(fakeScene);
      resetTown(); // 他のテストで建てた住居・お店などの残留状態を一掃する
      initPopulace(fakeScene);
      // まず住居無しのまま全員を移住させ、人口0の状態を作る。
      for (let i = 0; i < 100; i += 1) {
        updatePopulace(2, i * 2);
      }
      expect(getNpcCount()).toBe(0);

      // ここで住居を1つ建てると、住民が誰もいない状態からでも
      // 新しい住民が自動でその住居に入居できるはず。
      buildOnTile(getGlobalTile(5, 5), 'house');
      for (let i = 0; i < 5; i += 1) {
        updatePopulace(2, i * 2);
      }
      expect(getNpcCount()).toBe(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test('満足度が閾値をまたいで変化しても（フェーズ27：頭上アイコンの生成/消滅を含め）クラッシュしない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 移住・入居の抽選には当たらない値
    try {
      initWorld(fakeScene);
      resetTown();
      initPopulace(fakeScene);
      expect(() => {
        // 住居が無いままなので満足度は下がり続け、低満足度アイコンの
        // 生成・フェードイン/アウト・消滅の一連の流れを踏む。
        for (let i = 0; i < 60; i += 1) {
          updatePopulace(2, i * 2);
        }
      }).not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });

  test('確率が0（発生しない）に固定されていれば、住居が無くても人口は減らない（極端に一瞬で変化しないことの裏付け）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
      initWorld(fakeScene);
      resetTown(); // 他のテストで建てた住居・お店などの残留状態を一掃する
      initPopulace(fakeScene);
      const initialCount = getNpcCount();
      for (let i = 0; i < 100; i += 1) {
        updatePopulace(2, i * 2);
      }
      // 満足度自体は下がるが、移住の確率抽選に外れ続ける限り人口は変化しない。
      expect(getNpcCount()).toBe(initialCount);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
