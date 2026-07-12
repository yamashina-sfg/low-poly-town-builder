// 「町の評判」を軸にしたゲームループ（フェーズ19）。フェーズ24で、評判に
// 加えて人口・建物数も加味した「町ランク」（村→町→都市）・クエスト
// （達成すると報酬を得られる短期/中期目標）・実績一覧画面を追加した。
// 建物の種類数・NPCの数・装飾の充実度からスコアを算出し、一定値に達すると
// 新しい建物・装飾が解放される。実績システムと、探索報酬（ランドマーク）の
// 発見記録もここで扱う。
import { getTownStats } from './world.js';
import { getNpcCount, getDogCount } from './populace.js';
import { getTotalWoodCollected, addWood, addMoney } from '../economy.js';
import { showStatusMessage } from './statusMessage.js';
import { triggerCelebration } from './celebrationEffect.js';
import { playCelebrationSound } from '../ambientAudio.js';

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
  // フェーズ23よりNPCの数は満足度に応じて増減するようになったが、
  // 重みは低いまま据え置き、進行の主役はプレイヤーが実際に建てた建物の
  // 種類数・装飾の充実度になるようにする（犬の数は引き続き固定）。
  return distinctBuildingTypeCount * 15 + Math.min(decorationCount, 30) * 1 + npcCount * 1 + dogCount * 1;
}

const REPUTATION_TITLES = [
  { threshold: 0, title: '静かな原っぱ' },
  { threshold: 20, title: '小さな集落' },
  { threshold: 50, title: '賑わう町' },
  { threshold: 100, title: '繁栄の町' },
];

/**
 * 評判スコアに応じた、雰囲気を表す称号を返す（町ランクとは別の、より
 * きめ細かい・演出寄りの表示用ラベル）。
 */
export function getReputationTitle(score) {
  let title = REPUTATION_TITLES[0].title;
  REPUTATION_TITLES.forEach((entry) => {
    if (score >= entry.threshold) title = entry.title;
  });
  return title;
}

// ------------------------------------------------------------------
// フェーズ24：町ランク（村→町→都市）
// ------------------------------------------------------------------
// 評判スコア単体ではなく、評判・人口・建物数を組み合わせた「町としての
// 実際の規模」を表す複合指標。評判スコアが装飾・建物種類の豊富さに
// 寄っているのに対し、町ランクはより「実際に人が住み、建物が建ち並んで
// いるか」を反映するようにする。
export function computeTownRankScore({ reputationScore = 0, npcCount = 0, buildingCount = 0 }) {
  return reputationScore + npcCount * 4 + buildingCount * 3;
}

export const RANK_ORDER = ['village', 'town', 'city'];

const TOWN_RANKS = [
  { threshold: 0, rank: 'village', label: '村' },
  { threshold: 80, rank: 'town', label: '町' },
  { threshold: 180, rank: 'city', label: '都市' },
];

/**
 * 町ランクスコアから、現在のランク（{ rank, label, threshold }）を返す。
 */
export function getTownRank(rankScore) {
  let current = TOWN_RANKS[0];
  TOWN_RANKS.forEach((entry) => {
    if (rankScore >= entry.threshold) current = entry;
  });
  return current;
}

function rankIndex(rank) {
  return RANK_ORDER.indexOf(rank);
}

// 町ランクが一定段階に達すると解放される建物・装飾（フェーズ19時点では
// 評判スコアの閾値で判定していたが、フェーズ24より「町としての規模」を
// 表す町ランクを基準にする）。
export const UNLOCKS = [
  { type: 'windmill', category: 'buildings', requiredRank: 'town', label: '風車' },
  { type: 'statue', category: 'decorations', requiredRank: 'city', label: '銅像' },
];

/**
 * 指定した種類が、現在の町ランクで解放済みかどうか。
 * UNLOCKSに載っていない種類（最初から使える建築物）は常にtrue。
 */
export function isUnlocked(type, currentRank) {
  const entry = UNLOCKS.find((u) => u.type === type);
  if (!entry) return true;
  return rankIndex(currentRank) >= rankIndex(entry.requiredRank);
}

/**
 * 現在の町ランクではまだ解放されていない種類の一覧。
 */
export function getLockedTypes(currentRank) {
  return UNLOCKS.filter((u) => rankIndex(currentRank) < rankIndex(u.requiredRank)).map((u) => u.type);
}

// ------------------------------------------------------------------
// フェーズ24：クエスト（進行目標）。達成すると実際に報酬（お金・資材）を
// 得られる点が、記録のみの実績（ACHIEVEMENTS）との違い。
// checkはgetProgressionState()が返す形（+reputationScore）を受け取る。
// ------------------------------------------------------------------
export const QUESTS = [
  {
    id: 'quest_build_house',
    term: 'short', // 'short'（短期目標） | 'mid'（中期目標）
    label: '住居を1つ建てる',
    check: (state) => (state.buildingTypeCounts.house ?? 0) >= 1,
    reward: { money: 30 },
  },
  {
    id: 'quest_wood_10',
    term: 'short',
    label: '木材を10集める',
    check: (state) => state.totalWoodCollected >= 10,
    reward: { wood: 5 },
  },
  {
    id: 'quest_population_5',
    term: 'mid',
    label: '人口5人を達成する',
    check: (state) => state.npcCount >= 5,
    reward: { money: 100 },
  },
  {
    id: 'quest_reputation_30',
    term: 'mid',
    label: '評判30を達成する',
    check: (state) => state.reputationScore >= 30,
    reward: { money: 60, wood: 15 },
  },
];

/**
 * 報酬オブジェクトを「木材+5・お金+30」のような表示用文字列にする。
 */
export function formatReward(reward) {
  const parts = [];
  if (reward.wood) parts.push(`木材+${reward.wood}`);
  if (reward.money) parts.push(`お金+${reward.money}`);
  return parts.join('・');
}

/**
 * 現在の統計と既に達成済みのクエストIDの集合から、新たに達成された
 * クエストを返す（既に達成済みのものは含めない）。
 */
export function evaluateNewlyCompletedQuests(state, completedIds) {
  return QUESTS.filter((quest) => !completedIds.has(quest.id) && quest.check(state));
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
  {
    id: 'population_10',
    label: '賑わう町（住民が10人になった）',
    check: (state) => state.npcCount >= 10,
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
const completedQuestIds = new Set();
let landmarksDiscovered = 0;
let latestRank = TOWN_RANKS[0].rank;

function getProgressionState() {
  const stats = getTownStats();
  return {
    distinctBuildingTypeCount: stats.distinctBuildingTypeCount,
    decorationCount: stats.decorationCount,
    buildingCount: stats.buildingCount,
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

function updateReputationPanel(score, rankEntry) {
  const panelEl = document.getElementById('reputation-title');
  const scoreEl = document.getElementById('reputation-score');
  const rankEl = document.getElementById('town-rank-label');
  if (panelEl) panelEl.textContent = getReputationTitle(score);
  if (scoreEl) scoreEl.textContent = score;
  if (rankEl) rankEl.textContent = rankEntry.label;
}

function renderQuestList(term) {
  const listEl = document.getElementById(`progression-quests-${term}`);
  if (!listEl) return;
  listEl.innerHTML = '';
  QUESTS.filter((quest) => quest.term === term).forEach((quest) => {
    const done = completedQuestIds.has(quest.id);
    const li = document.createElement('li');
    li.className = done ? 'progression-item done' : 'progression-item';
    li.textContent = `${done ? '✅' : '⬜'} ${quest.label}（報酬: ${formatReward(quest.reward)}）`;
    listEl.appendChild(li);
  });
}

function renderAchievementList() {
  const listEl = document.getElementById('progression-achievements');
  if (!listEl) return;
  listEl.innerHTML = '';
  ACHIEVEMENTS.forEach((achievement) => {
    const done = unlockedAchievementIds.has(achievement.id);
    const li = document.createElement('li');
    li.className = done ? 'progression-item done' : 'progression-item locked';
    li.textContent = `${done ? '🏆' : '🔒'} ${achievement.label}`;
    listEl.appendChild(li);
  });
}

function renderProgressionModal(rankEntry) {
  const rankLabelEl = document.getElementById('progression-rank-label');
  if (rankLabelEl) rankLabelEl.textContent = `${rankEntry.label}（町ランク）`;
  renderQuestList('short');
  renderQuestList('mid');
  renderAchievementList();
}

/**
 * 評判スコア・町ランク・クエスト・実績を最新の状態に更新し、変化があれば
 * UI・通知を更新する。main.jsのメインループから間引いて呼ばれる想定。
 */
export function updateProgression() {
  const state = getProgressionState();
  const score = computeReputationScore(state);

  const rankScore = computeTownRankScore({
    reputationScore: score,
    npcCount: state.npcCount,
    buildingCount: state.buildingCount,
  });
  const rankEntry = getTownRank(rankScore);
  const previousRank = latestRank;
  latestRank = rankEntry.rank;

  updateReputationPanel(score, rankEntry);
  renderProgressionModal(rankEntry);

  if (rankIndex(latestRank) > rankIndex(previousRank)) {
    showStatusMessage(`町ランクが「${rankEntry.label}」に昇格しました！🏙️`);
    triggerCelebration(`🎉 町ランク「${rankEntry.label}」に昇格！ 🎉`);
    playCelebrationSound();
  }

  const fullState = { ...state, reputationScore: score };

  const newQuests = evaluateNewlyCompletedQuests(fullState, completedQuestIds);
  newQuests.forEach((quest) => {
    completedQuestIds.add(quest.id);
    if (quest.reward.wood) addWood(quest.reward.wood);
    if (quest.reward.money) addMoney(quest.reward.money);
    showStatusMessage(`クエスト達成: ${quest.label}（報酬: ${formatReward(quest.reward)}）🎯`);
  });

  const newAchievements = evaluateNewAchievements(fullState, unlockedAchievementIds);
  newAchievements.forEach((achievement) => {
    unlockedAchievementIds.add(achievement.id);
    showStatusMessage(`実績解除: ${achievement.label} 🏆`);
  });
}

/**
 * 現在の町ランクに基づく、まだ解放されていない建築種類の一覧
 * （建築メニューのボタンをグレーアウトするために使う）。
 */
export function getCurrentLockedTypes() {
  return getLockedTypes(latestRank);
}

/**
 * 進行状況モーダル（町ランク・クエスト・実績一覧）の開閉ボタンを配線する。
 * main.jsの初期化処理から一度だけ呼ぶ想定（onboarding.jsと同じ自己完結パターン）。
 */
export function initProgressionPanel() {
  const modal = document.getElementById('progression-modal');
  const toggleButton = document.getElementById('progression-panel-toggle');
  const closeButton = document.getElementById('progression-modal-close');
  if (!modal || !toggleButton) return;

  toggleButton.addEventListener('click', () => {
    modal.classList.toggle('hidden');
  });
  closeButton?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}
