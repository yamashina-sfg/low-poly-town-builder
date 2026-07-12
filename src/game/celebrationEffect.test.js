import { describe, test, expect, beforeEach, vi } from 'vitest';
import { triggerCelebration } from './celebrationEffect.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="celebration-overlay" class="celebration-overlay hidden">
      <div id="celebration-text" class="celebration-text"></div>
    </div>
  `;
});

describe('triggerCelebration（フェーズ27：評判・町ランク昇格時の画面中央の祝福演出）', () => {
  test('呼び出すとテキストが設定され、hiddenが外れてアニメーション用クラスが付く', () => {
    triggerCelebration('テスト祝福');
    const overlay = document.getElementById('celebration-overlay');
    const text = document.getElementById('celebration-text');
    expect(text.textContent).toBe('テスト祝福');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.classList.contains('celebration-animate')).toBe(true);
  });

  test('一定時間後に自動的にhiddenへ戻る（画面に残り続けない）', () => {
    vi.useFakeTimers();
    try {
      triggerCelebration('テスト');
      const overlay = document.getElementById('celebration-overlay');
      expect(overlay.classList.contains('hidden')).toBe(false);
      vi.advanceTimersByTime(2500);
      expect(overlay.classList.contains('hidden')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('対象のDOM要素が無い場合は何もせずクラッシュしない', () => {
    document.body.innerHTML = '';
    expect(() => triggerCelebration('x')).not.toThrow();
  });
});
