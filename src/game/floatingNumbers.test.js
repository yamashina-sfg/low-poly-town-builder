import { describe, test, expect, beforeEach } from 'vitest';
import { spawnFloatingNumber } from './floatingNumbers.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="resource-panel">
      <div><span id="resource-wood">0</span></div>
      <div><span id="resource-money">0</span></div>
      <div><span id="resource-food">0</span></div>
    </div>
  `;
});

describe('spawnFloatingNumber（フェーズ27：資材・お金増減のふわっと浮く数値表示）', () => {
  test('正の値は+付きで、該当リソースの親要素に追加される', () => {
    spawnFloatingNumber('wood', 15);
    const parent = document.getElementById('resource-wood').parentElement;
    const el = parent.querySelector('.floating-number');
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('+15');
    expect(el.classList.contains('floating-number-positive')).toBe(true);
  });

  test('負の値はそのままマイナス表記になる', () => {
    spawnFloatingNumber('money', -20);
    const parent = document.getElementById('resource-money').parentElement;
    const el = parent.querySelector('.floating-number');
    expect(el.textContent).toBe('-20');
    expect(el.classList.contains('floating-number-negative')).toBe(true);
  });

  test('deltaが0の場合は何も追加されない（無関係な変化でうるさくしないため）', () => {
    spawnFloatingNumber('food', 0);
    const parent = document.getElementById('resource-food').parentElement;
    expect(parent.querySelector('.floating-number')).toBeNull();
  });

  test('存在しないリソース種別を指定してもクラッシュしない', () => {
    expect(() => spawnFloatingNumber('unknown', 5)).not.toThrow();
  });

  test('連続して呼ぶと複数の数値が同時に積み重なって表示される', () => {
    spawnFloatingNumber('wood', 3);
    spawnFloatingNumber('wood', 4);
    const parent = document.getElementById('resource-wood').parentElement;
    expect(parent.querySelectorAll('.floating-number').length).toBe(2);
  });
});
