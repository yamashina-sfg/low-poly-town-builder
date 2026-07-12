// フェーズ27：評判・町ランクが上がった際に、画面中央へ短い祝福演出を出す。
// status-message（画面下部の非キュー・即上書きトースト）は既に他の通知で
// 頻繁に使われているため、目立たせたい祝福演出には専用の別レイヤーを使う。
const CELEBRATION_DURATION_MS = 2400;

let hideTimeoutId;

export function triggerCelebration(text) {
  const overlay = document.getElementById('celebration-overlay');
  const textEl = document.getElementById('celebration-text');
  if (!overlay || !textEl) return;

  textEl.textContent = text;
  overlay.classList.remove('hidden');
  // 短時間に連続で発生した場合でもアニメーションが最初からやり直されるよう、
  // クラスを一度外してリフローを強制してから付け直す。
  overlay.classList.remove('celebration-animate');
  void overlay.offsetWidth;
  overlay.classList.add('celebration-animate');

  clearTimeout(hideTimeoutId);
  hideTimeoutId = setTimeout(() => overlay.classList.add('hidden'), CELEBRATION_DURATION_MS);
}
