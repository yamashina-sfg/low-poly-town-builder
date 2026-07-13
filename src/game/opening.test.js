import { describe, test, expect, beforeEach, vi } from 'vitest';
import { showOpeningSequence } from './opening.js';

describe('showOpeningSequence（フェーズ28：「はじめから」直後のオープニング演出）', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="opening-overlay" class="opening-overlay hidden">
        <div class="opening-card">
          <button type="button" id="opening-continue">はじめる</button>
        </div>
      </div>
    `;
  });

  test('呼び出すとオーバーレイが表示される', () => {
    showOpeningSequence(vi.fn());
    expect(document.getElementById('opening-overlay').classList.contains('hidden')).toBe(false);
  });

  test('「はじめる」を押すとオーバーレイが隠れ、onDoneが呼ばれる', () => {
    const onDone = vi.fn();
    showOpeningSequence(onDone);
    document.getElementById('opening-continue').click();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.getElementById('opening-overlay').classList.contains('hidden')).toBe(true);
  });

  test('対応するDOM要素が無い場合は即座にonDoneを呼ぶ', () => {
    document.body.innerHTML = '';
    const onDone = vi.fn();
    showOpeningSequence(onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
