import { describe, test, expect, beforeEach, vi } from 'vitest';
import { initTitleScreen, hideTitleScreen, isTitleScreenVisible } from './titleScreen.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="title-screen" class="title-screen">
      <div class="title-screen-content">
        <div class="title-menu">
          <button type="button" id="title-new-game">はじめから</button>
          <button type="button" id="title-continue" disabled>つづきから</button>
          <button type="button" id="title-settings-open">設定</button>
        </div>
      </div>
      <div id="title-settings-panel" class="title-settings-panel hidden">
        <button type="button" id="title-settings-close">閉じる</button>
      </div>
    </div>
  `;
});

describe('initTitleScreen（フェーズ28：タイトル画面のメニュー配線）', () => {
  test('セーブデータが無い場合、つづきからボタンは無効化される', () => {
    initTitleScreen({ hasSaveData: false, onNewGame: vi.fn(), onContinue: vi.fn() });
    expect(document.getElementById('title-continue').disabled).toBe(true);
  });

  test('セーブデータがある場合、つづきからボタンは有効化される', () => {
    initTitleScreen({ hasSaveData: true, onNewGame: vi.fn(), onContinue: vi.fn() });
    expect(document.getElementById('title-continue').disabled).toBe(false);
  });

  test('はじめからボタンを押すと、タイトル画面が隠れonNewGameが呼ばれる', () => {
    const onNewGame = vi.fn();
    initTitleScreen({ hasSaveData: false, onNewGame, onContinue: vi.fn() });
    document.getElementById('title-new-game').click();
    expect(onNewGame).toHaveBeenCalledTimes(1);
    expect(isTitleScreenVisible()).toBe(false);
  });

  test('つづきからボタンが有効な場合、押すとonContinueが呼ばれる', () => {
    const onContinue = vi.fn();
    initTitleScreen({ hasSaveData: true, onNewGame: vi.fn(), onContinue });
    document.getElementById('title-continue').click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(isTitleScreenVisible()).toBe(false);
  });

  test('つづきからボタンが無効な場合、押してもonContinueは呼ばれない', () => {
    const onContinue = vi.fn();
    initTitleScreen({ hasSaveData: false, onNewGame: vi.fn(), onContinue });
    document.getElementById('title-continue').click();
    expect(onContinue).not.toHaveBeenCalled();
    expect(isTitleScreenVisible()).toBe(true);
  });

  test('設定ボタンで設定パネルが開閉する', () => {
    initTitleScreen({ hasSaveData: false, onNewGame: vi.fn(), onContinue: vi.fn() });
    const panel = document.getElementById('title-settings-panel');
    document.getElementById('title-settings-open').click();
    expect(panel.classList.contains('hidden')).toBe(false);
    document.getElementById('title-settings-close').click();
    expect(panel.classList.contains('hidden')).toBe(true);
  });
});

describe('hideTitleScreen', () => {
  test('タイトル画面と設定パネルの両方を隠す', () => {
    document.getElementById('title-settings-panel').classList.remove('hidden');
    hideTitleScreen();
    expect(isTitleScreenVisible()).toBe(false);
    expect(document.getElementById('title-settings-panel').classList.contains('hidden')).toBe(true);
  });
});
