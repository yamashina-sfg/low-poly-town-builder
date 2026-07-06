import { describe, test, expect, beforeEach } from 'vitest';
import { advanceGameTime, getGameTime, formatGameTime, skipTimeToMorning } from './gameTime.js';

beforeEach(() => {
  skipTimeToMorning(); // 06:00 に揃えてから各テストを開始する
});

describe('advanceGameTime / getGameTime', () => {
  test('時間経過に応じてhours/minutes/dayFractionが進む', () => {
    advanceGameTime(60); // 現実1秒=ゲーム内1分なので60秒で1時間進む
    const { hours, minutes, dayFraction } = getGameTime();
    expect(hours).toBe(7);
    expect(minutes).toBe(0);
    expect(dayFraction).toBeCloseTo(7 / 24, 5);
  });

  test('24分（1440ゲーム内分）経過すると1日が経過して同じ時刻に戻る', () => {
    const before = getGameTime();
    advanceGameTime(24 * 60); // 24分 x 60ゲーム内分/秒 = 1440分 = 24時間
    const after = getGameTime();
    expect(after.hours).toBe(before.hours);
    expect(after.minutes).toBe(before.minutes);
  });

  test('マイナス方向には進まない（deltaは常に正の想定）が、0を渡しても変化しない', () => {
    const before = getGameTime();
    advanceGameTime(0);
    expect(getGameTime()).toEqual(before);
  });
});

describe('formatGameTime', () => {
  test('時・分を2桁ゼロ埋めでHH:MM形式にする', () => {
    expect(formatGameTime()).toBe('06:00');
    advanceGameTime(5 * 60 + 9); // +5時間9分
    expect(formatGameTime()).toBe('11:09');
  });
});

describe('skipTimeToMorning', () => {
  test('呼ぶと時刻がちょうど朝6時になる', () => {
    advanceGameTime(500);
    skipTimeToMorning();
    const { hours, minutes } = getGameTime();
    expect(hours).toBe(6);
    expect(minutes).toBe(0);
  });
});
