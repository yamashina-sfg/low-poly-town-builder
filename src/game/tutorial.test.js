import { describe, test, expect, beforeEach } from 'vitest';
import {
  initTutorial,
  notifyPlayerMoved,
  notifyTileHovered,
  notifyBuildMenuOpened,
  notifyQuestCompleted,
} from './tutorial.js';

function hintText() {
  return document.getElementById('tutorial-hint').textContent;
}
function hintVisible() {
  return !document.getElementById('tutorial-hint').classList.contains('hidden');
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="tutorial-hint" class="tutorial-hint hidden"></div>';
});

describe('段階的チュートリアル（フェーズ29：旧「ようこそ」モーダルの置き換え）', () => {
  test('初回はWASD移動のヒントだけが表示される', () => {
    initTutorial();
    expect(hintVisible()).toBe(true);
    expect(hintText()).toContain('WASD');
  });

  test('実際に動くとWASDヒントが消え、次のタイルホバーのヒントはまだ出ない', () => {
    initTutorial();
    notifyPlayerMoved();
    expect(hintVisible()).toBe(false);
  });

  test('初めてタイルにマウスを乗せると、建築メニューのヒントが表示される', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyTileHovered();
    expect(hintVisible()).toBe(true);
    expect(hintText()).toContain('建築メニュー');
  });

  test('建築メニューを初めて開くと「住居を建ててみよう」が表示される（タイルホバーを経由済みの場合）', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyTileHovered();
    notifyBuildMenuOpened();
    expect(hintText()).toContain('住居を建ててみよう');
  });

  test('タイルホバーを経ずに建築メニューが開いても、手前のステップに引っかからず住居ヒントまで進む', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyBuildMenuOpened();
    expect(hintText()).toContain('住居を建ててみよう');
  });

  test('quest_build_houseが達成されると住居ヒントが消え、以後は何も表示されない', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyTileHovered();
    notifyBuildMenuOpened();
    notifyQuestCompleted('quest_build_house');
    expect(hintVisible()).toBe(false);
  });

  test('quest_build_house以外のクエスト完了通知では住居ヒントは消えない', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyTileHovered();
    notifyBuildMenuOpened();
    notifyQuestCompleted('quest_wood_10');
    expect(hintVisible()).toBe(true);
    expect(hintText()).toContain('住居を建ててみよう');
  });

  test('一度表示したヒントは、再度initTutorialを呼んでも二度と出ない', () => {
    initTutorial();
    notifyPlayerMoved();
    initTutorial();
    expect(hintText()).not.toContain('WASD');
  });

  test('全ステップ完了後は、initTutorialを呼んでも何も表示されない', () => {
    initTutorial();
    notifyPlayerMoved();
    notifyTileHovered();
    notifyBuildMenuOpened();
    notifyQuestCompleted('quest_build_house');
    initTutorial();
    expect(hintVisible()).toBe(false);
  });
});
