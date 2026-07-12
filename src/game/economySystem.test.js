import { describe, test, expect, beforeEach } from 'vitest';
import {
  isBuildingFunctional,
  computeTaxAmount,
  updateEconomySystem,
  getShopInventory,
  canBuyFromShop,
  buyFromShop,
  sellToShop,
} from './economySystem.js';
import {
  initWorld,
  buildOnTile,
  resetTown,
  DEFAULT_SHOP_INVENTORY,
  DEFAULT_BUILDING_CONDITION,
} from './world.js';
import { getGlobalTile } from '../chunkManager.js';
import { getFood, getWood, getMoney, setResources } from '../economy.js';

const fakeScene = { add: () => {}, remove: () => {} };

function resetWorldAndEconomy() {
  // 老朽化・修繕時にshowStatusMessageがトースト表示用のDOM要素を参照するため、
  // 本番のindex.htmlと同様に#status-messageを用意しておく。
  if (!document.getElementById('status-message')) {
    const el = document.createElement('div');
    el.id = 'status-message';
    el.classList.add('hidden');
    document.body.appendChild(el);
  }
  initWorld(fakeScene);
  resetTown(); // 他のテストで建てた建物の残留状態を一掃する
  setResources({ wood: 20, money: 100, food: 0 });
}

describe('isBuildingFunctional（フェーズ25: 老朽化した建物は非稼働になる）', () => {
  test('conditionを持たないタイルは常にtrue', () => {
    expect(isBuildingFunctional({ userData: {} })).toBe(true);
  });

  test('conditionが閾値以上ならtrue、未満ならfalse', () => {
    expect(isBuildingFunctional({ userData: { condition: 100 } })).toBe(true);
    expect(isBuildingFunctional({ userData: { condition: 30 } })).toBe(true);
    expect(isBuildingFunctional({ userData: { condition: 29 } })).toBe(false);
    expect(isBuildingFunctional({ userData: { condition: 0 } })).toBe(false);
  });
});

describe('computeTaxAmount（フェーズ25: 人口・満足度に応じた税収）', () => {
  test('人口0なら税収も0', () => {
    expect(computeTaxAmount(0, 80)).toBe(0);
  });

  test('人口が多いほど、満足度が高いほど税収が増える', () => {
    const lowPopulation = computeTaxAmount(2, 50);
    const highPopulation = computeTaxAmount(10, 50);
    expect(highPopulation).toBeGreaterThan(lowPopulation);

    const lowSatisfaction = computeTaxAmount(5, 10);
    const highSatisfaction = computeTaxAmount(5, 90);
    expect(highSatisfaction).toBeGreaterThan(lowSatisfaction);
  });

  test('満足度が0でも税収は0や負にならない（極端に振れすぎない：0.5倍が下限）', () => {
    const amount = computeTaxAmount(5, 0);
    expect(amount).toBeGreaterThan(0);
  });

  test('満足度が100を超える・0未満の異常値でもクランプされ、極端な値にならない', () => {
    const overMax = computeTaxAmount(5, 500);
    const atMax = computeTaxAmount(5, 100);
    expect(overMax).toBe(atMax);
    const underMin = computeTaxAmount(5, -500);
    const atMin = computeTaxAmount(5, 0);
    expect(underMin).toBe(atMin);
  });
});

describe('生産施設（フェーズ25: 畑・伐採小屋が時間経過で資材を生産する）', () => {
  beforeEach(resetWorldAndEconomy);

  test('畑は食料を、伐採小屋は木材を、時間経過で生産する', () => {
    buildOnTile(getGlobalTile(5, 5), 'farm');
    buildOnTile(getGlobalTile(5, 6), 'loggingHut');
    const foodBefore = getFood();
    const woodBefore = getWood();

    // 生産間隔(PRODUCTION_INTERVAL)を1回分だけ確実に超える大きさのdeltaを渡す。
    updateEconomySystem(20);

    expect(getFood()).toBeGreaterThan(foodBefore);
    expect(getWood()).toBeGreaterThan(woodBefore);
  });

  test('老朽化して非稼働（condition < 30）の生産施設は生産しない', () => {
    const farmTile = getGlobalTile(5, 5);
    buildOnTile(farmTile, 'farm');
    farmTile.userData.condition = 10; // 非稼働にする
    const foodBefore = getFood();

    updateEconomySystem(20);

    expect(getFood()).toBe(foodBefore);
  });
});

describe('お店の在庫（フェーズ25: 在庫が尽きると買えなくなり、時間経過で補充される）', () => {
  beforeEach(resetWorldAndEconomy);

  test('お店は満タンの在庫を持って建つ', () => {
    const shopTile = getGlobalTile(5, 5);
    buildOnTile(shopTile, 'shop');
    expect(getShopInventory(shopTile)).toBe(DEFAULT_SHOP_INVENTORY);
  });

  test('在庫が尽きると買えなくなり、在庫がある間は買える', () => {
    const shopTile = getGlobalTile(5, 5);
    buildOnTile(shopTile, 'shop');
    expect(canBuyFromShop(shopTile, 10)).toBe(true);

    buyFromShop(shopTile, DEFAULT_SHOP_INVENTORY); // 在庫を使い切る
    expect(getShopInventory(shopTile)).toBe(0);
    expect(canBuyFromShop(shopTile, 10)).toBe(false);
  });

  test('売ると在庫が増える（上限を超えない）', () => {
    const shopTile = getGlobalTile(5, 5);
    buildOnTile(shopTile, 'shop');
    buyFromShop(shopTile, 20);
    expect(getShopInventory(shopTile)).toBe(DEFAULT_SHOP_INVENTORY - 20);

    sellToShop(shopTile, 5);
    expect(getShopInventory(shopTile)).toBe(DEFAULT_SHOP_INVENTORY - 15);

    sellToShop(shopTile, 100); // 上限を超えて売ろうとしても頭打ちになる
    expect(getShopInventory(shopTile)).toBe(DEFAULT_SHOP_INVENTORY);
  });

  test('在庫は時間経過で徐々に補充される', () => {
    const shopTile = getGlobalTile(5, 5);
    buildOnTile(shopTile, 'shop');
    buyFromShop(shopTile, DEFAULT_SHOP_INVENTORY); // 在庫を使い切る
    expect(getShopInventory(shopTile)).toBe(0);

    updateEconomySystem(15); // 補充間隔(SHOP_REPLENISH_INTERVAL)を超える

    expect(getShopInventory(shopTile)).toBeGreaterThan(0);
    expect(getShopInventory(shopTile)).toBeLessThanOrEqual(DEFAULT_SHOP_INVENTORY);
  });

  test('老朽化した（非稼働の）お店は取引できない', () => {
    const shopTile = getGlobalTile(5, 5);
    buildOnTile(shopTile, 'shop');
    shopTile.userData.condition = 10; // 非稼働にする
    expect(canBuyFromShop(shopTile, 10)).toBe(false);
  });
});

describe('維持費・老朽化（フェーズ25: 払えない建物は劣化し、払えれば修繕される）', () => {
  beforeEach(resetWorldAndEconomy);

  test('維持費を払えないと、建物のconditionが実際に下がる', () => {
    const houseTile = getGlobalTile(5, 5);
    buildOnTile(houseTile, 'house');
    expect(houseTile.userData.condition).toBe(DEFAULT_BUILDING_CONDITION);

    setResources({ wood: 0, money: 0 }); // 維持費を払えない状態にする
    updateEconomySystem(20); // 維持費ティック(UPKEEP_INTERVAL)を超える

    expect(houseTile.userData.condition).toBeLessThan(DEFAULT_BUILDING_CONDITION);
  });

  test('維持費を払い続けられれば、下がったconditionが元に戻っていく', () => {
    const houseTile = getGlobalTile(5, 5);
    buildOnTile(houseTile, 'house');
    houseTile.userData.condition = 20; // あらかじめ老朽化させておく

    setResources({ wood: 999, money: 999 }); // 維持費を十分払える状態にする
    updateEconomySystem(20);

    expect(houseTile.userData.condition).toBeGreaterThan(20);
    expect(getMoney()).toBeLessThan(999); // 維持費が実際にお金から差し引かれている
  });

  test('conditionが下がりすぎても0未満にはならず、上がりすぎても上限を超えない', () => {
    const houseTile = getGlobalTile(5, 5);
    buildOnTile(houseTile, 'house');

    setResources({ wood: 0, money: 0 });
    for (let i = 0; i < 10; i += 1) updateEconomySystem(20);
    expect(houseTile.userData.condition).toBeGreaterThanOrEqual(0);

    setResources({ wood: 999, money: 999 });
    for (let i = 0; i < 10; i += 1) updateEconomySystem(20);
    expect(houseTile.userData.condition).toBeLessThanOrEqual(DEFAULT_BUILDING_CONDITION);
  });

  test('一度に極端に劣化・回復しすぎない（1回のティックでの変化量が上限に収まる）', () => {
    const houseTile = getGlobalTile(5, 5);
    buildOnTile(houseTile, 'house');

    setResources({ wood: 0, money: 0 });
    updateEconomySystem(20);
    // 1ティックでは老朽化しても大きく変化しすぎない（半分未満の減少に収まる）。
    expect(houseTile.userData.condition).toBeGreaterThan(DEFAULT_BUILDING_CONDITION / 2);
  });

  test('フェーズ26：公共施設（役場・広場・噴水）も維持費を払えないと老朽化する', () => {
    const coords = [
      [5, 5],
      [5, 6],
      [5, 7],
    ];
    ['townHall', 'plaza', 'fountain'].forEach((type, i) => {
      const [gx, gy] = coords[i];
      const tile = getGlobalTile(gx, gy);
      buildOnTile(tile, type);
      expect(tile.userData.condition).toBe(DEFAULT_BUILDING_CONDITION);
    });

    setResources({ wood: 0, money: 0 });
    updateEconomySystem(20);

    coords.forEach(([gx, gy]) => {
      const tile = getGlobalTile(gx, gy);
      expect(tile.userData.condition).toBeLessThan(DEFAULT_BUILDING_CONDITION);
    });
  });
});
