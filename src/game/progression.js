// 「町の評判」を軸にしたゲームループ（フェーズ19）。
// 建物の種類数・NPCの数・装飾の充実度からスコアを算出し、一定値に達すると
// 新しい建物・装飾が解放される。実績システムと、探索報酬（ランドマーク）の
// 発見記録もここで扱う。
import { getTownStats } from './world.js';
import { getNpcCount, getDogCount } from './populace.js';
import { getTotalWoodCollected } from '../economy.js';
import { showStatusMessage } from './statusMessage.js';

// ------------------------------------------------------------------
// 純粋関数（テストしやすいよう、DOM/他モジュールの状態に依存しない形で分離）
// ------------------------------------------------------------------

/**
 * 建物の種類数・装飾の充実度・人口から「町の評判」スコアを算出する。
 */
export function computeReputationScore({
  distinctBuildingTypeCount = 0,
  decorationCount = 0,
  npcCount = 0,
  dogCount = 0,
}) {
  // NPC・犬の数は現状固定（プレイヤーの行動では増減しない）なので、重みを
  // 低くして常に一定の下駄（baseline）程度に留め、進行の主役はプレイヤーが
  // 実際に建てた建物の種類数・装飾の充実度になるようにする。
  return distinctBuildingTypeCount * 15 + Math.min(decorationCount, 30) * 1 + npcCount * 1 + dogCount * 1;
}

const REPUTATION_TITLES = [
  { threshold: 0, title: '静かな原っぱ' },
  { threshold: 20, title: '小さな集落' },
  { threshold: 50, title: '賑わう町' },
  { threshold: 100, title: '繁栄の町' },
];

/**
 * 評判スコアに応じた町のランク名を返す。
 */
export function getReputationTitle(score) {
  let title = REPUTATION_TITLES[0].title;
  REPUTATION_TITLES.forEach((entry) => {
    if (score >= entry.threshold) title = entry.title;
  });
  return title;
}

// 評判スコアが一定値に達すると解放される建物・装飾。
export const UNLOCKS = [
  { type: 'windmill', category: 'buildings', threshold: 30, label: '風車' },
  { type: 'statue', category: 'decorations', threshold: 50, label: '銅像' },
];

/**
 * 指定した種類が、現在の評判スコアで解放済みかどうか。
 * UNLOCKSに載っていない種類（最初から使える建築物）は常にtrue。
 */
export function isUnlocked(type, score) {
  const entry = UNLOCKS.find((u) => u.type === type);
  if (!entry) return true;
  return score >= entry.threshold;
}

/**
 * 現在のスコアではまだ解放されていない種類の一覧。
 */
export function getLockedTypes(score) {
  return UNLOCKS.filter((u) => score < u.threshold).map((u) => u.type);
}

// 実績一覧。checkはgetProgressionState()が返す形の統計を受け取る純粋関数。
export const ACHIEVEMENTS = [
  {
    id: 'first_house',
    label: '初めての住居',
    check: (state) => (state.buildingTypeCounts.house ?? 0) >= 1,
  },
  {
    id: 'wood_100',
    label: '働き者（木材を100集めた）',
    check: (state) => state.totalWoodCollected >= 100,
  },
  {
    id: 'three_building_types',
    label: '小さな町（建物3種類）',
    check: (state) => state.distinctBuildingTypeCount >= 3,
  },
  {
    id: 'explorer',
    label: '探検家（ランドマークを発見）',
    check: (state) => state.landmarksDiscovered >= 1,
  },
];

/**
 * 現在の統計と既に解除済みの実績IDの集合から、新たに解除された実績を返す
 * （既に解除済みのものは含めない）。
 */
export function evaluateNewAchievements(state, unlockedIds) {
  return ACHIEVEMENTS.filter((achievement) => !unlockedIds.has(achievement.id) && achievement.check(state));
}

// ------------------------------------------------------------------
// ステートフルな部分（ワールド・経済・NPCの実際の状態を読み、DOM/通知を更新する）
// ------------------------------------------------------------------

const unlockedAchievementIds = new Set();
let landmarksDiscovered = 0;
let latestScore = 0;

function getProgressionState() {
  const stats = getTownStats();
  return {
    distinctBuildingTypeCount: stats.distinctBuildingTypeCount,
    decorationCount: stats.decorationCount,
    buildingTypeCounts: stats.buildingTypeCounts,
    npcCount: getNpcCount(),
    dogCount: getDogCount(),
    totalWoodCollected: getTotalWoodCollected(),
    landmarksDiscovered,
  };
}

/**
 * ランドマーク（廃墟・特殊な木）が発見されたときに呼ぶ。
 * world.jsのsetLandmarkDiscoveredHandlerからmain.js経由で配線される。
 */
export function recordLandmarkDiscovered() {
  landmarksDiscovered += 1;
}

function updateReputationPanel(score) {
  const panelEl = document.getElementById('reputation-title');
  const scoreEl = document.getElementById('reputation-score');
  if (panelEl) panelEl.textContent = getReputationTitle(score);
  if (scoreEl) scoreEl.textContent = score;
}

/**
 * 評判スコア・実績を最新の状態に更新し、変化があればUI・通知を更新する。
 * main.jsのメインループから間引いて呼ばれる想定。
 */
export function updateProgression() {
  const state = getProgressionState();
  const score = computeReputationScore(state);
  latestScore = score;
  updateReputationPanel(score);

  const newAchievements = evaluateNewAchievements(state, unlockedAchievementIds);
  newAchievements.forEach((achievement) => {
    unlockedAchievementIds.add(achievement.id);
    showStatusMessage(`実績解除: ${achievement.label} 🏆`);
  });
}

/**
 * 現在のスコアに基づく、まだ解放されていない建築種類の一覧
 * （建築メニューのボタンをグレーアウトするために使う）。
 */
export function getCurrentLockedTypes() {
  return getLockedTypes(latestScore);
}
