// フェーズ25：経済システムの深化。
// - 生産施設（畑・伐採小屋）が時間経過で食料・木材を自動生産する
// - お店に在庫の概念を持たせ、尽きると（老朽化していても）一時的に
//   取引できなくする。在庫は時間経過で少しずつ補充される
// - 維持費のかかる建物は、払えないと状態(condition)が悪化し、老朽化する
//   （見た目がくすみ、生産施設・お店は機能を停止する）。払える間は
//   少しずつ修繕され元に戻る
// - 人口・平均満足度に応じた税収を得る（極端に振れないよう緩やかな
//   係数で変動させる）
import * as THREE from 'three';
import { forEachLoadedTile } from '../chunkManager.js';
import { setInstanceColor } from '../instancing.js';
import { MAINTAINED_BUILDING_TYPES, DEFAULT_BUILDING_CONDITION, DEFAULT_SHOP_INVENTORY } from './world.js';
import { addFood, addWood, trySpendMoney, addMoney } from '../economy.js';
import { getNpcCount, getAverageSatisfaction } from './populace.js';
import { showStatusMessage } from './statusMessage.js';
import { DECAY_TINT_COLOR } from '../palette.js';

// ------------------------------------------------------------------
// 生産施設：畑→食料、伐採小屋→木材
// ------------------------------------------------------------------
const PRODUCTION_INTERVAL = 12; // 秒（実時間。ゲーム内時計は1秒=1分なので約12分ごと）
const PRODUCTION_SPECS = {
  farm: { addResource: addFood, amount: 3 },
  loggingHut: { addResource: addWood, amount: 3 },
};

// ------------------------------------------------------------------
// お店の在庫補充
// ------------------------------------------------------------------
const SHOP_REPLENISH_INTERVAL = 10;
const SHOP_REPLENISH_AMOUNT = 3;

// ------------------------------------------------------------------
// 建物の維持費・老朽化
// ------------------------------------------------------------------
const UPKEEP_INTERVAL = 18;
const MAINTENANCE_COSTS = {
  house: 2,
  shop: 4,
  well: 1,
  warehouse: 3,
  windmill: 3,
  farm: 2,
  loggingHut: 2,
  // フェーズ26：公共施設。役場は町の規模に見合った高めの維持費とする。
  townHall: 5,
  plaza: 2,
  fountain: 3,
};
const CONDITION_REPAIR_STEP = 12; // 維持費を払えたときに回復する量
const CONDITION_DECAY_STEP = 15; // 維持費を払えなかったときに悪化する量
// この状態を下回ると「非稼働」（お店は取引不可、生産施設は生産停止）になる。
const FUNCTIONAL_CONDITION_THRESHOLD = 30;
// 状態0のときでも元の色味が完全には消えないよう、くすませる強さに上限を設ける。
const MAX_DECAY_TINT_STRENGTH = 0.65;

// ------------------------------------------------------------------
// 税収：人口・平均満足度に応じて変動する（フェーズ23の住民シミュレーションと連携）
// ------------------------------------------------------------------
const TAX_INTERVAL = 15;
const TAX_PER_RESIDENT = 2;

let productionTimer = 0;
let shopReplenishTimer = 0;
let upkeepTimer = 0;
let taxTimer = 0;

/**
 * 建物が正常に機能している（お店なら取引でき、生産施設なら生産する）か。
 * conditionを持たない種類（維持費の対象外）は常にtrue扱いにする。
 */
export function isBuildingFunctional(tile) {
  const condition = tile?.userData?.condition;
  return condition === undefined || condition >= FUNCTIONAL_CONDITION_THRESHOLD;
}

/**
 * 建物のInstancedMeshパーツの色を、現在のconditionに応じてくすませる。
 * パーツごとの「元の色」はaddInstanceの戻り値に保持されている
 * （instancing.jsのaddInstanceがcolorも一緒に返すようにしてある）ため、
 * 何度呼んでも色が累積して暗くなり続けることはない。
 */
function applyDecayVisual(tile) {
  const entry = tile.userData.object;
  if (!entry || entry.kind !== 'instances') return;
  const condition = tile.userData.condition ?? DEFAULT_BUILDING_CONDITION;
  const strength = (1 - condition / DEFAULT_BUILDING_CONDITION) * MAX_DECAY_TINT_STRENGTH;
  const decayColor = new THREE.Color(DECAY_TINT_COLOR);
  entry.parts.forEach((part) => {
    if (!part.color) return;
    const tinted = strength <= 0 ? part.color : part.color.clone().lerp(decayColor, strength);
    setInstanceColor(part, tinted);
  });
}

function runProductionTick() {
  forEachLoadedTile((tile) => {
    const spec = PRODUCTION_SPECS[tile.userData.tileType];
    if (!spec) return;
    if (!isBuildingFunctional(tile)) return; // 老朽化した生産施設は稼働しない
    spec.addResource(spec.amount);
  });
}

function runShopReplenishTick() {
  forEachLoadedTile((tile) => {
    if (tile.userData.tileType !== 'shop') return;
    const current = tile.userData.shopInventory ?? DEFAULT_SHOP_INVENTORY;
    tile.userData.shopInventory = Math.min(DEFAULT_SHOP_INVENTORY, current + SHOP_REPLENISH_AMOUNT);
  });
}

function runUpkeepTick() {
  forEachLoadedTile((tile) => {
    const type = tile.userData.tileType;
    if (!MAINTAINED_BUILDING_TYPES.has(type)) return;
    const cost = MAINTENANCE_COSTS[type];
    if (!cost) return;

    const wasFunctional = isBuildingFunctional(tile);
    const currentCondition = tile.userData.condition ?? DEFAULT_BUILDING_CONDITION;

    if (trySpendMoney(cost)) {
      tile.userData.condition = Math.min(
        DEFAULT_BUILDING_CONDITION,
        currentCondition + CONDITION_REPAIR_STEP,
      );
    } else {
      tile.userData.condition = Math.max(0, currentCondition - CONDITION_DECAY_STEP);
    }

    applyDecayVisual(tile);

    const isFunctionalNow = isBuildingFunctional(tile);
    if (wasFunctional && !isFunctionalNow) {
      showStatusMessage('維持費が払えず、建物が老朽化しています…🔧');
    } else if (!wasFunctional && isFunctionalNow) {
      showStatusMessage('建物が修繕されました✨');
    }
  });
}

/**
 * 人口・平均満足度から税収額を算出する純粋関数。
 * 満足度は0〜100を0.5倍〜1.5倍の係数にマップし（低くても税収が0や
 * マイナスにはならない、高くても際限なく増えない）、人口と掛け合わせる
 * ことで、両者が急変しない限り税収も緩やかにしか変化しないようにする。
 */
export function computeTaxAmount(population, averageSatisfaction) {
  if (population <= 0) return 0;
  const clampedSatisfaction = Math.min(100, Math.max(0, averageSatisfaction ?? 50));
  const satisfactionFactor = 0.5 + clampedSatisfaction / 100;
  return Math.round(population * TAX_PER_RESIDENT * satisfactionFactor);
}

function runTaxTick() {
  const amount = computeTaxAmount(getNpcCount(), getAverageSatisfaction());
  if (amount > 0) addMoney(amount);
}

/**
 * 生産・お店の在庫補充・維持費/老朽化・税収の4つのティックを進める。
 * それぞれ独立した間引きタイマーを持ち、main.jsのメインループから
 * 毎フレームdelta（実時間の経過秒数）を渡して呼ぶ想定。
 */
export function updateEconomySystem(delta) {
  productionTimer += delta;
  if (productionTimer >= PRODUCTION_INTERVAL) {
    productionTimer = 0;
    runProductionTick();
  }

  shopReplenishTimer += delta;
  if (shopReplenishTimer >= SHOP_REPLENISH_INTERVAL) {
    shopReplenishTimer = 0;
    runShopReplenishTick();
  }

  upkeepTimer += delta;
  if (upkeepTimer >= UPKEEP_INTERVAL) {
    upkeepTimer = 0;
    runUpkeepTick();
  }

  taxTimer += delta;
  if (taxTimer >= TAX_INTERVAL) {
    taxTimer = 0;
    runTaxTick();
  }
}

export function getShopInventory(tile) {
  return tile?.userData?.shopInventory ?? DEFAULT_SHOP_INVENTORY;
}

/**
 * amount分の商品を、このお店から買えるか（老朽化で非稼働なら常に不可）。
 */
export function canBuyFromShop(tile, amount) {
  return isBuildingFunctional(tile) && getShopInventory(tile) >= amount;
}

/**
 * お店から購入した分だけ在庫を減らす（支払い自体はinteractions.js側で行う）。
 */
export function buyFromShop(tile, amount) {
  tile.userData.shopInventory = Math.max(0, getShopInventory(tile) - amount);
}

/**
 * お店に売った分だけ在庫を増やす（上限DEFAULT_SHOP_INVENTORYで頭打ち）。
 * 売却は在庫切れでも常に可能（在庫切れで止まるのは「買う」側だけ）。
 */
export function sellToShop(tile, amount) {
  tile.userData.shopInventory = Math.min(DEFAULT_SHOP_INVENTORY, getShopInventory(tile) + amount);
}
