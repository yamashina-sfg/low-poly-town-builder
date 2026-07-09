// 所持リソース（木材・お金・食料）と建築コストを管理する。
let wood = 20;
let money = 100;
// フェーズ25：畑が生産する食料。現時点では消費先（人口の食事など）は
// 無く、生産施設の成果を示す蓄積型のリソースとして扱う。
let food = 0;
// 実績（フェーズ19）用に、これまで伐採・入手した木材の累計を別途記録する
// （現在の所持数とは異なり、使っても減らない一方向のカウンター）。
let totalWoodCollected = 0;

export const BUILD_COSTS = {
  house: { wood: 20, money: 50 },
  shop: { wood: 15, money: 80 },
  well: { wood: 5, money: 10 },
  warehouse: { wood: 30, money: 40 },
  windmill: { wood: 25, money: 60 },
  // フェーズ25：生産施設。伐採小屋は木材で作るのに木材を生み出す
  // （元は取れる）投資、畑は安価だが食料しか生まない。
  farm: { wood: 15, money: 30 },
  loggingHut: { wood: 10, money: 25 },
  bed: { wood: 10, money: 0 },
  table: { wood: 6, money: 0 },
  chair: { wood: 3, money: 0 },
  fireplace: { wood: 8, money: 5 },
  fence: { wood: 3, money: 0 },
  streetlamp: { wood: 2, money: 15 },
  bench: { wood: 6, money: 0 },
  flowerbed: { wood: 0, money: 5 },
  signpost: { wood: 4, money: 0 },
  statue: { wood: 5, money: 40 },
  // 通常の道(road)は無料（従来通り）。土の道はさらに手軽、石畳・橋は
  // 少し立派な分コストをかける（フェーズ22：道の拡充）。
  dirtRoad: { wood: 1, money: 0 },
  cobblestone: { wood: 2, money: 5 },
  bridge: { wood: 10, money: 20 },
};

export function getWood() {
  return wood;
}

export function getMoney() {
  return money;
}

export function getFood() {
  return food;
}

/**
 * セーブデータからの復元用。不正な値は無視して現状を維持する。
 */
export function setResources({ wood: nextWood, money: nextMoney, food: nextFood } = {}) {
  if (Number.isFinite(nextWood)) wood = Math.max(0, nextWood);
  if (Number.isFinite(nextMoney)) money = Math.max(0, nextMoney);
  if (Number.isFinite(nextFood)) food = Math.max(0, nextFood);
}

/**
 * その種類を建てるのに必要なコストを払えるか（コスト未設定の種類は常に無料）。
 */
export function canAfford(type) {
  const cost = BUILD_COSTS[type];
  if (!cost) return true;
  return wood >= cost.wood && money >= cost.money;
}

/**
 * コストを支払う。足りなければ何も減らさずfalseを返す。
 */
export function pay(type) {
  const cost = BUILD_COSTS[type];
  if (!cost) return true;
  if (!canAfford(type)) return false;
  wood -= cost.wood;
  money -= cost.money;
  return true;
}

export function addWood(amount) {
  wood += amount;
  totalWoodCollected += amount;
}

/**
 * これまでに伐採・入手した木材の累計（所持数と違い、使っても減らない）。
 * 実績「木材を100集めた」の判定に使う。
 */
export function getTotalWoodCollected() {
  return totalWoodCollected;
}

export function trySpendMoney(amount) {
  if (money < amount) return false;
  money -= amount;
  return true;
}

export function addMoney(amount) {
  money += amount;
}

export function trySpendWood(amount) {
  if (wood < amount) return false;
  wood -= amount;
  return true;
}

export function addFood(amount) {
  food += amount;
}

export function trySpendFood(amount) {
  if (food < amount) return false;
  food -= amount;
  return true;
}
