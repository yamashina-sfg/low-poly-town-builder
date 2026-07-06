import { describe, test, expect, beforeEach } from 'vitest';
import {
  BUILD_COSTS,
  getWood,
  getMoney,
  setResources,
  canAfford,
  pay,
  addWood,
  trySpendMoney,
  addMoney,
  trySpendWood,
} from './economy.js';

beforeEach(() => {
  setResources({ wood: 20, money: 100 });
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
