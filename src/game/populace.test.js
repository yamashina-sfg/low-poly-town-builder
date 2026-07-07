import { describe, test, expect } from 'vitest';
import { getDesiredLocation } from './populace.js';

describe('getDesiredLocation（フェーズ22：NPCの通勤先を時刻から決める）', () => {
  test('8時〜18時未満は勤務先(work)にいるべき', () => {
    expect(getDesiredLocation(8)).toBe('work');
    expect(getDesiredLocation(12)).toBe('work');
    expect(getDesiredLocation(17)).toBe('work');
  });

  test('それ以外の時間帯は家(home)にいるべき', () => {
    expect(getDesiredLocation(18)).toBe('home');
    expect(getDesiredLocation(23)).toBe('home');
    expect(getDesiredLocation(0)).toBe('home');
    expect(getDesiredLocation(7)).toBe('home');
  });
});
