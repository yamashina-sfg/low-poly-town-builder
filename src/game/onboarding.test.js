import { describe, test, expect, beforeEach } from 'vitest';
import { shouldShowOnboarding, markOnboardingSeen } from './onboarding.js';

describe('オンボーディング表示判定（フェーズ20）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('初回は表示すべきと判定される', () => {
    expect(shouldShowOnboarding()).toBe(true);
  });

  test('markOnboardingSeenを呼ぶと、以後は表示すべきでないと判定される', () => {
    markOnboardingSeen();
    expect(shouldShowOnboarding()).toBe(false);
  });
});
