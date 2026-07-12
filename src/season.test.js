import { describe, test, expect } from 'vitest';
import {
  getSeasonAt,
  advanceSeason,
  getCurrentSeason,
  getSeasonLabel,
  getElapsedSeasonSeconds,
} from './season.js';

describe('getSeasonAt（フェーズ26：季節の移り変わり、純粋関数）', () => {
  test('経過秒数0は春から始まる', () => {
    expect(getSeasonAt(0)).toBe('spring');
  });

  test('90秒ごとに春→夏→秋→冬の順に切り替わる', () => {
    expect(getSeasonAt(89)).toBe('spring');
    expect(getSeasonAt(90)).toBe('summer');
    expect(getSeasonAt(179)).toBe('summer');
    expect(getSeasonAt(180)).toBe('autumn');
    expect(getSeasonAt(270)).toBe('winter');
  });

  test('冬の次はまた春に戻る（周期的）', () => {
    expect(getSeasonAt(360)).toBe('spring');
    expect(getSeasonAt(360 + 90)).toBe('summer');
  });
});

describe('getSeasonLabel', () => {
  test('各季節に対応する日本語ラベルを返す', () => {
    expect(getSeasonLabel('spring')).toBe('春');
    expect(getSeasonLabel('summer')).toBe('夏');
    expect(getSeasonLabel('autumn')).toBe('秋');
    expect(getSeasonLabel('winter')).toBe('冬');
  });
});

describe('advanceSeason / getCurrentSeason（状態を持つ側）', () => {
  test('advanceSeasonで進めた分だけgetElapsedSeasonSecondsが増え、季節も切り替わる', () => {
    const before = getElapsedSeasonSeconds();
    const beforeSeason = getCurrentSeason();
    advanceSeason(90);
    expect(getElapsedSeasonSeconds()).toBe(before + 90);
    // 90秒進めると必ず次の季節（または同じ季節をまたいで一周）になっている。
    expect(getCurrentSeason()).toBe(getSeasonAt(before + 90));
    expect(typeof beforeSeason).toBe('string');
  });
});
