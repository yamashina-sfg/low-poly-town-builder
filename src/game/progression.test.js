import { describe, test, expect } from 'vitest';
import {
  computeReputationScore,
  getReputationTitle,
  isUnlocked,
  getLockedTypes,
  UNLOCKS,
  ACHIEVEMENTS,
  evaluateNewAchievements,
  computeTownRankScore,
  getTownRank,
  RANK_ORDER,
  QUESTS,
  evaluateNewlyCompletedQuests,
  formatReward,
} from './progression.js';

describe('computeReputationScore（フェーズ19: 町の評判）', () => {
  test('建物の種類数・装飾・人口が多いほどスコアが上がる', () => {
    const low = computeReputationScore({
      distinctBuildingTypeCount: 1,
      decorationCount: 0,
      npcCount: 0,
      dogCount: 0,
    });
    const high = computeReputationScore({
      distinctBuildingTypeCount: 4,
      decorationCount: 10,
      npcCount: 6,
      dogCount: 2,
    });
    expect(high).toBeGreaterThan(low);
  });

  test('装飾の充実度は上限（30個）で頭打ちになる', () => {
    const at30 = computeReputationScore({
      distinctBuildingTypeCount: 0,
      decorationCount: 30,
      npcCount: 0,
      dogCount: 0,
    });
    const at100 = computeReputationScore({
      distinctBuildingTypeCount: 0,
      decorationCount: 100,
      npcCount: 0,
      dogCount: 0,
    });
    expect(at100).toBe(at30);
  });

  test('何もない状態ではスコアは0', () => {
    expect(computeReputationScore({})).toBe(0);
  });
});

describe('getReputationTitle', () => {
  test('スコアが上がるほど、より賑やかな町名になる', () => {
    expect(getReputationTitle(0)).toBe('静かな原っぱ');
    expect(getReputationTitle(20)).toBe('小さな集落');
    expect(getReputationTitle(50)).toBe('賑わう町');
    expect(getReputationTitle(100)).toBe('繁栄の町');
    expect(getReputationTitle(19)).toBe('静かな原っぱ');
  });
});

describe('アンロック（フェーズ24: 町ランクで解放される建物・装飾）', () => {
  test('必要な町ランク未満の建築物はロックされている', () => {
    const windmillEntry = UNLOCKS.find((u) => u.type === 'windmill');
    const requiredIndex = RANK_ORDER.indexOf(windmillEntry.requiredRank);
    const rankBelow = RANK_ORDER[requiredIndex - 1];
    expect(isUnlocked('windmill', rankBelow)).toBe(false);
    expect(isUnlocked('windmill', windmillEntry.requiredRank)).toBe(true);
  });

  test('UNLOCKSに載っていない種類（既存の建築物）は常に解放済み', () => {
    expect(isUnlocked('house', 'village')).toBe(true);
    expect(isUnlocked('fence', 'village')).toBe(true);
  });

  test('getLockedTypesは町ランクに応じて解放済みの種類を除外する', () => {
    expect(getLockedTypes('village')).toEqual(expect.arrayContaining(['windmill', 'statue']));
    expect(getLockedTypes('city')).toEqual([]);
  });
});

describe('computeTownRankScore / getTownRank（フェーズ24: 村→町→都市の町ランク）', () => {
  test('評判・人口・建物数が多いほどスコアが上がる', () => {
    const low = computeTownRankScore({ reputationScore: 0, npcCount: 0, buildingCount: 0 });
    const high = computeTownRankScore({ reputationScore: 30, npcCount: 5, buildingCount: 10 });
    expect(high).toBeGreaterThan(low);
  });

  test('スコアが上がるほど、村→町→都市とランクが上がる', () => {
    expect(getTownRank(0).rank).toBe('village');
    expect(getTownRank(0).label).toBe('村');
    expect(getTownRank(100).rank).toBe('town');
    expect(getTownRank(250).rank).toBe('city');
  });

  test('ランクは村→町→都市の順に並んでいる（RANK_ORDER）', () => {
    expect(RANK_ORDER).toEqual(['village', 'town', 'city']);
  });
});

describe('クエスト（フェーズ24: 達成すると報酬が得られる短期/中期目標）', () => {
  test('全クエストが一意なidを持ち、短期(short)/中期(mid)のどちらかに分類される', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    QUESTS.forEach((q) => expect(['short', 'mid']).toContain(q.term));
  });

  test('条件を満たすと未達成のクエストだけが新規達成として返る', () => {
    const state = {
      buildingTypeCounts: { house: 1 },
      totalWoodCollected: 0,
      npcCount: 0,
      reputationScore: 0,
    };
    const completed = evaluateNewlyCompletedQuests(state, new Set());
    const ids = completed.map((q) => q.id);
    expect(ids).toContain('quest_build_house');
    expect(ids).not.toContain('quest_wood_10');
  });

  test('既に達成済みのクエストは再度返さない', () => {
    const state = {
      buildingTypeCounts: { house: 1 },
      totalWoodCollected: 0,
      npcCount: 0,
      reputationScore: 0,
    };
    const alreadyCompleted = new Set(['quest_build_house']);
    const completed = evaluateNewlyCompletedQuests(state, alreadyCompleted);
    expect(completed.map((q) => q.id)).not.toContain('quest_build_house');
  });

  test('formatRewardは木材・お金の報酬を読みやすい文字列にする', () => {
    expect(formatReward({ money: 30 })).toBe('お金+30');
    expect(formatReward({ wood: 5, money: 100 })).toBe('木材+5・お金+100');
  });
});

describe('実績システム（フェーズ19）', () => {
  test('条件を満たすと未解除の実績だけが新規解除として返る', () => {
    const state = {
      buildingTypeCounts: { house: 1 },
      distinctBuildingTypeCount: 1,
      totalWoodCollected: 5,
      landmarksDiscovered: 0,
    };
    const unlocked = evaluateNewAchievements(state, new Set());
    const ids = unlocked.map((a) => a.id);
    expect(ids).toContain('first_house');
    expect(ids).not.toContain('wood_100');
  });

  test('既に解除済みの実績は再度返さない', () => {
    const state = {
      buildingTypeCounts: { house: 1 },
      distinctBuildingTypeCount: 1,
      totalWoodCollected: 0,
      landmarksDiscovered: 0,
    };
    const alreadyUnlocked = new Set(['first_house']);
    const unlocked = evaluateNewAchievements(state, alreadyUnlocked);
    expect(unlocked.map((a) => a.id)).not.toContain('first_house');
  });

  test('全実績が一意なidを持つ', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
