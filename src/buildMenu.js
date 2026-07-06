const menuEl = document.getElementById('build-menu');
const tabButtons = menuEl.querySelectorAll('.tab-button');
const panels = menuEl.querySelectorAll('.build-menu-panel');

let onSelect = null;

function handleButtonClick(event) {
  const type = event.currentTarget.dataset.type;
  if (onSelect) onSelect(type);
  hideBuildMenu();
}

menuEl.querySelectorAll('button[data-type]').forEach((btn) => {
  btn.addEventListener('click', handleButtonClick);
});

function showTab(tabName) {
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== tabName));
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

/**
 * 画面上の座標(screenX, screenY)付近に建築メニューを表示する。
 * 項目が選択されたらonSelectCallback(type)が呼ばれる。
 */
export function showBuildMenu(screenX, screenY, onSelectCallback) {
  onSelect = onSelectCallback;

  // メニューが画面外にはみ出さないようにクランプする
  const menuWidth = 170;
  const menuHeight = 260;
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

/**
 * まだ解放されていない種類のボタンをグレーアウトして選べないようにする
 * （フェーズ19：評判スコアによる建築物のアンロック）。
 */
export function updateLockedButtons(lockedTypes) {
  const lockedSet = new Set(lockedTypes);
  menuEl.querySelectorAll('button[data-type]').forEach((btn) => {
    const locked = lockedSet.has(btn.dataset.type);
    btn.disabled = locked;
    btn.classList.toggle('locked', locked);
  });
}
