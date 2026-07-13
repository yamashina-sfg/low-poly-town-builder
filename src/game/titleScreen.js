// フェーズ28：タイトル画面。「はじめから」「つづきから」「設定」の3つの
// メニューを表示する。既存の設定UI（シード入力・服/帽子の色選択、
// debugPanel.jsが配線する#seed-input等）はDOM要素ごとこの画面の設定パネルへ
// 移動しただけで、配線ロジック自体は変更していない（IDが同じなら
// document.getElementById経由の配線はどこに置いても動くため）。
// カメラ演出（背景で町をゆっくり映す）やゲーム状態の切り替え自体は
// main.js側の責務とし、ここでは選択結果をコールバックで通知するだけに留める。
// DOM要素はモジュール読み込み時ではなく呼び出しのたびに取得する
// （テストでbeforeEachごとにDOMを組み直せるようにするため）。

/**
 * @param {{ hasSaveData: boolean, onNewGame: () => void, onContinue: () => void }} options
 */
export function initTitleScreen({ hasSaveData, onNewGame, onContinue }) {
  const overlayEl = document.getElementById('title-screen');
  if (!overlayEl) return;
  const newGameButton = document.getElementById('title-new-game');
  const continueButton = document.getElementById('title-continue');
  const settingsOpenButton = document.getElementById('title-settings-open');
  const settingsPanelEl = document.getElementById('title-settings-panel');
  const settingsCloseButton = document.getElementById('title-settings-close');

  continueButton.disabled = !hasSaveData;

  newGameButton.addEventListener('click', () => {
    hideTitleScreen();
    onNewGame();
  });
  continueButton.addEventListener('click', () => {
    if (continueButton.disabled) return;
    hideTitleScreen();
    onContinue();
  });
  settingsOpenButton.addEventListener('click', () => {
    settingsPanelEl.classList.remove('hidden');
  });
  settingsCloseButton.addEventListener('click', () => {
    settingsPanelEl.classList.add('hidden');
  });
}

export function hideTitleScreen() {
  document.getElementById('title-screen')?.classList.add('hidden');
  document.getElementById('title-settings-panel')?.classList.add('hidden');
}

export function isTitleScreenVisible() {
  const overlayEl = document.getElementById('title-screen');
  return !!overlayEl && !overlayEl.classList.contains('hidden');
}
