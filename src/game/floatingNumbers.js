// フェーズ27：資材・お金が増減したときに、資源パネルの該当項目の上へ
// 「+15」「-20」のような数値がふわっと浮き上がって消える演出。
// 生産・維持費・税収などの間引かれたバックグラウンド処理では呼ばない
// （プレイヤーが直接行った操作：建築・撤去・伐採・お店の売買）に限定することで、
// 頻繁な自動更新で画面がうるさくなるのを避ける。
const RESOURCE_ELEMENT_IDS = {
  wood: 'resource-wood',
  money: 'resource-money',
  food: 'resource-food',
};

const FADE_DURATION_MS = 1000;

/**
 * resourceType（'wood' | 'money' | 'food'）の表示のすぐ上に、符号付きの
 * delta（例: +15, -20）を短時間表示する。delta === 0の場合は何もしない。
 */
export function spawnFloatingNumber(resourceType, delta) {
  if (!delta) return;
  const elementId = RESOURCE_ELEMENT_IDS[resourceType];
  const anchor = document.getElementById(elementId)?.parentElement;
  if (!anchor) return;

  const el = document.createElement('span');
  el.className = `floating-number ${delta > 0 ? 'floating-number-positive' : 'floating-number-negative'}`;
  el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
  anchor.appendChild(el);

  const remove = () => el.remove();
  el.addEventListener('animationend', remove);
  // animationendが発火しない環境向けの保険。
  setTimeout(remove, FADE_DURATION_MS + 200);
}
