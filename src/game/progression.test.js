import { describe, test, expect } from 'vitest';
import {
  computeReputationScore,
  getReputationTitle,
  isUnlocked,
  getLockedTypes,
  UNLOCKS,
  ACHIEVEMENTS,
  evaluateNewAchievements,
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

describe('アンロック（フェーズ19: 評判で解放される建物・装飾）', () => {
  test('しきい値未満の建築物はロックされている', () => {
    const windmillThreshold = UNLOCKS.find((u) => u.type === 'windmill').threshold;
    expect(isUnlocked('windmill', windmillThreshold - 1)).toBe(false);
    expect(isUnlocked('windmill', windmillThreshold)).toBe(true);
  });

  test('UNLOCKSに載っていない種類（既存の建築物）は常に解放済み', () => {
    expect(isUnlocked('house', 0)).toBe(true);
    expect(isUnlocked('fence', 0)).toBe(true);
  });

  test('getLockedTypesはスコアに応じて解放済みの種類を除外する', () => {
    expect(getLockedTypes(0)).toEqual(expect.arrayContaining(['windmill', 'statue']));
    const highestThreshold = Math.max(...UNLOCKS.map((u) => u.threshold));
    expect(getLockedTypes(highestThreshold)).toEqual([]);
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
