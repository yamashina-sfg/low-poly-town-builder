const menuEl = document.getElementById('build-menu');

let onSelect = null;

function handleButtonClick(event) {
  const type = event.currentTarget.dataset.type;
  if (onSelect) onSelect(type);
  hideBuildMenu();
}

menuEl.querySelectorAll('button[data-type]').forEach((btn) => {
  btn.addEventListener('click', handleButtonClick);
});

/**
 * 画面上の座標(screenX, screenY)付近に建築メニューを表示する。
 * 項目が選択されたらonSelectCallback(type)が呼ばれる。
 */
export function showBuildMenu(screenX, screenY, onSelectCallback) {
  onSelect = onSelectCallback;

  // メニューが画面外にはみ出さないようにクランプする
  const menuWidth = 160;
  const menuHeight = 220;
  const clampedX = Math.min(screenX, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(screenY, window.innerHeight - menuHeight - 8);

  menuEl.style.left = `${Math.max(8, clampedX)}px`;
  menuEl.style.top = `${Math.max(8, clampedY)}px`;
  menuEl.classList.remove('hidden');
}

export function hideBuildMenu() {
  menuEl.classList.add('hidden');
  onSelect = null;
}

export function isBuildMenuOpen() {
  return !menuEl.classList.contains('hidden');
}
