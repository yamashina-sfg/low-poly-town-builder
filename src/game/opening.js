// フェーズ28：「はじめから」を選んだ直後だけ表示するオープニング演出。
// 朝焼けの草原に立つキャラを背景に、短いテキストで世界観と最初の目標
// （フェーズ24のクエスト「住居を1つ建てる」）を提示する。
// 「つづきから」（セーブデータの読込）では表示しない。
// DOM要素は呼び出しのたびに取得する（モジュール読み込み時に取得すると、
// テストでbeforeEachごとにDOMを組み直しても古い参照のまま固定されてしまうため）。

/**
 * オープニング演出を表示し、プレイヤーが「はじめる」を押したらonDoneを呼ぶ。
 * 対応するDOM要素が無い環境（テスト等）では即座にonDoneを呼んで通過させる。
 */
export function showOpeningSequence(onDone) {
  const overlayEl = document.getElementById('opening-overlay');
  const continueButton = document.getElementById('opening-continue');
  if (!overlayEl || !continueButton) {
    onDone();
    return;
  }
  overlayEl.classList.remove('hidden');
  const handleContinue = () => {
    overlayEl.classList.add('hidden');
    continueButton.removeEventListener('click', handleContinue);
    onDone();
  };
  continueButton.addEventListener('click', handleContinue);
}
