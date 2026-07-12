import { BUILD_COSTS } from './economy.js';

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

  // 必要な木材・お金をボタンに常時表示しておく（コストが設定されている種類のみ）。
  const cost = BUILD_COSTS[btn.dataset.type];
  if (cost) {
    const costLabel = document.createElement('span');
    costLabel.className = 'cost-label';
    costLabel.textContent = `🪵${cost.wood} 💰${cost.money}`;
    btn.appendChild(costLabel);
  }
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

  // メニューが画面外にはみ出さないようにクランプする。
  // フェーズ26：項目数の増加に伴いbuild-menu-panelがスクロールするように
  // なったため（CSSのmax-height:70vh）、高さの見積もりもそれに合わせて
  // 少し大きめにしておく。
  const menuWidth = 170;
  const menuHeight = Math.min(window.innerHeight * 0.7, 420);
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
 * 各ボタンの見た目を最新の状態に合わせる：
 * - まだ解放されていない種類（フェーズ19：評判スコアによるアンロック）
 * - 木材・お金が足りず選べない種類
 * のどちらかに該当するボタンをグレーアウトして選べないようにする。
 */
export function updateButtonStates({ lockedTypes = [], wood = 0, money = 0 } = {}) {
  const lockedSet = new Set(lockedTypes);
  menuEl.querySelectorAll('button[data-type]').forEach((btn) => {
    const type = btn.dataset.type;
    const locked = lockedSet.has(type);
    const cost = BUILD_COSTS[type];
    const unaffordable = !locked && !!cost && (wood < cost.wood || money < cost.money);
    btn.disabled = locked || unaffordable;
    btn.classList.toggle('locked', locked);
    btn.classList.toggle('unaffordable', unaffordable);
  });
}
