let hideTimeoutId;

/**
 * 画面下部に2秒間だけ短いメッセージを表示する。
 */
export function showStatusMessage(text) {
  const el = document.getElementById('status-message');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(hideTimeoutId);
  hideTimeoutId = setTimeout(() => el.classList.add('hidden'), 2000);
}
