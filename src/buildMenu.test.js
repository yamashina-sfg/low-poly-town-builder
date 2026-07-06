import { describe, test, expect, beforeEach, vi } from 'vitest';

// buildMenu.jsはモジュール読込時にdocument.getElementById('build-menu')などへ
// アクセスするため、テスト用の最小限のDOMを用意してからdynamic importする。
function setupFakeBuildMenuDom() {
  document.body.innerHTML = `
    <div id="build-menu" class="hidden">
      <div class="build-menu-tabs">
        <button type="button" class="tab-button active" data-tab="buildings">建物</button>
      </div>
      <div class="build-menu-panel" data-panel="buildings">
        <button type="button" data-type="house">住居</button>
        <button type="button" data-type="windmill">風車</button>
      </div>
    </div>
  `;
}

describe('buildMenu.updateButtonStates（フェーズ20: コスト表示・グレーアウト）', () => {
  beforeEach(() => {
    setupFakeBuildMenuDom();
    vi.resetModules();
  });

  test('コストが足りない種類はdisabledになり、unaffordableクラスが付く', async () => {
    const { updateButtonStates } = await import('./buildMenu.js');
    updateButtonStates({ lockedTypes: [], wood: 0, money: 0 });
    const houseBtn = document.querySelector('button[data-type="house"]');
    expect(houseBtn.disabled).toBe(true);
    expect(houseBtn.classList.contains('unaffordable')).toBe(true);
    expect(houseBtn.classList.contains('locked')).toBe(false);
  });

  test('コストを満たしていればdisabledにならない', async () => {
    const { updateButtonStates } = await import('./buildMenu.js');
    updateButtonStates({ lockedTypes: [], wood: 999, money: 999 });
    const houseBtn = document.querySelector('button[data-type="house"]');
    expect(houseBtn.disabled).toBe(false);
    expect(houseBtn.classList.contains('unaffordable')).toBe(false);
  });

  test('lockedTypesに含まれる種類は、コストを満たしていてもlockedとして無効化される', async () => {
    const { updateButtonStates } = await import('./buildMenu.js');
    updateButtonStates({ lockedTypes: ['windmill'], wood: 999, money: 999 });
    const windmillBtn = document.querySelector('button[data-type="windmill"]');
    expect(windmillBtn.disabled).toBe(true);
    expect(windmillBtn.classList.contains('locked')).toBe(true);
    expect(windmillBtn.classList.contains('unaffordable')).toBe(false);
  });

  test('各建築可能ボタンには必要な木材・お金を示すコストラベルが表示される', async () => {
    await import('./buildMenu.js');
    const houseBtn = document.querySelector('button[data-type="house"]');
    expect(houseBtn.querySelector('.cost-label')).not.toBeNull();
  });
});
