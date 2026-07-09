import { describe, test, expect, beforeEach } from 'vitest';
import {
  BUILD_COSTS,
  getWood,
  getMoney,
  getFood,
  setResources,
  canAfford,
  pay,
  addWood,
  trySpendMoney,
  addMoney,
  trySpendWood,
  addFood,
  trySpendFood,
  getTotalWoodCollected,
} from './economy.js';

beforeEach(() => {
  setResources({ wood: 20, money: 100, food: 0 });
});

describe('canAfford / pay', () => {
  test('十分な資源があれば建築でき、コストが正しく引かれる', () => {
    expect(canAfford('house')).toBe(true); // house: wood20, money50 に対し wood20 money100
    expect(pay('house')).toBe(true);
    expect(getWood()).toBe(0);
    expect(getMoney()).toBe(50);
  });

  test('資源が足りなければ建築できず、何も減らない', () => {
    setResources({ wood: 1, money: 1 });
    expect(canAfford('house')).toBe(false);
    expect(pay('house')).toBe(false);
    expect(getWood()).toBe(1);
    expect(getMoney()).toBe(1);
  });

  test('コスト未設定の種類は常に無料で建築できる', () => {
    expect(canAfford('grass')).toBe(true);
    expect(pay('grass')).toBe(true);
    expect(getWood()).toBe(20);
    expect(getMoney()).toBe(100);
  });

  test('BUILD_COSTSに定義された全種類がwood/moneyの数値コストを持つ', () => {
    Object.values(BUILD_COSTS).forEach((cost) => {
      expect(typeof cost.wood).toBe('number');
      expect(typeof cost.money).toBe('number');
    });
  });
});

describe('setResources', () => {
  test('不正な値（非数値）は無視して現状を維持する', () => {
    setResources({ wood: Number.NaN, money: undefined });
    expect(getWood()).toBe(20);
    expect(getMoney()).toBe(100);
  });

  test('負の値は0にクランプする', () => {
    setResources({ wood: -5, money: -1 });
    expect(getWood()).toBe(0);
    expect(getMoney()).toBe(0);
  });
});

describe('addWood / trySpendWood / addMoney / trySpendMoney', () => {
  test('addWoodは加算するだけ', () => {
    addWood(5);
    expect(getWood()).toBe(25);
  });

  test('trySpendWoodは足りていればtrueを返し減らす。足りなければfalseで変化なし', () => {
    expect(trySpendWood(20)).toBe(true);
    expect(getWood()).toBe(0);
    expect(trySpendWood(1)).toBe(false);
    expect(getWood()).toBe(0);
  });

  test('addMoney/trySpendMoneyも同様', () => {
    addMoney(10);
    expect(getMoney()).toBe(110);
    expect(trySpendMoney(110)).toBe(true);
    expect(getMoney()).toBe(0);
    expect(trySpendMoney(1)).toBe(false);
    expect(getMoney()).toBe(0);
  });
});

describe('getTotalWoodCollected（フェーズ19: 実績「木材を100集めた」用の累計カウンター）', () => {
  test('addWoodするたびに増え続け、所持数を使っても減らない', () => {
    const before = getTotalWoodCollected();
    addWood(7);
    expect(getTotalWoodCollected()).toBe(before + 7);
    trySpendWood(7);
    expect(getTotalWoodCollected()).toBe(before + 7); // 所持数は減るが累計は変わらない
  });
});

describe('食料（フェーズ25: 畑が生産するリソース）', () => {
  test('addFood/trySpendFoodはwood/moneyと同様に動作する', () => {
    expect(getFood()).toBe(0);
    addFood(5);
    expect(getFood()).toBe(5);
    expect(trySpendFood(3)).toBe(true);
    expect(getFood()).toBe(2);
    expect(trySpendFood(10)).toBe(false);
    expect(getFood()).toBe(2);
  });

  test('setResourcesはfoodも復元できる（不正な値は無視、負の値は0にクランプ）', () => {
    setResources({ wood: 20, money: 100, food: 12 });
    expect(getFood()).toBe(12);
    setResources({ food: Number.NaN });
    expect(getFood()).toBe(12);
    setResources({ food: -5 });
    expect(getFood()).toBe(0);
  });
});

describe('BUILD_COSTS（フェーズ25: 生産施設のコスト）', () => {
  test('farm・loggingHutにもwood/moneyコストが定義されている', () => {
    expect(BUILD_COSTS.farm).toEqual({ wood: 15, money: 30 });
    expect(BUILD_COSTS.loggingHut).toEqual({ wood: 10, money: 25 });
  });
});
