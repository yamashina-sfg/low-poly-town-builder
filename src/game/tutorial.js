// フェーズ29：段階的チュートリアル。
// フェーズ20〜28の「ようこそ、操作説明」モーダル（全項目を一度に見せる）を
// 廃止し、実際の操作に合わせて1つずつ出す一発ヒント（コーチマーク）に
// 置き換える。デバッグパネル（F3）の説明は含めず、プレイヤー向けの
// 操作だけを段階的に案内する。各ヒントは一度表示したら二度と出さない
// （ヒントごとにlocalStorageへ既読フラグを持つ）。
//
// ステップは順番に進む3段階：
//   1. move       ：WASDで実際に歩くまで表示
//   2. tileHover  ：初めてタイルにマウスを乗せるまで表示
//   3. buildHouse ：建築メニューを開いたら表示し、フェーズ24の最初の
//                   クエスト（quest_build_house＝住居を1つ建てる）が
//                   達成されるまで表示し続ける
// 各notify*関数は「少なくともこの段階には到達した」という通知として扱う
// （reachStep）：例えばタイルホバーを経ずに建築メニューが開いた場合でも、
// 手前のステップに引っかかって進行が止まらないようにするための保険。

const SEEN_PREFIX = 'lowPolyTownBuilder:tutorialSeen:';

const STEPS = ['move', 'tileHover', 'buildHouse'];
const HINT_TEXT = {
  move: 'WASD / 矢印キーで歩いてみよう',
  tileHover: 'タイルをクリックすると建築メニューが開きます',
  buildHouse: '住居を建ててみよう🏠',
};

let stepIndex = 0;

function hasSeen(id) {
  try {
    return localStorage.getItem(SEEN_PREFIX + id) === 'true';
  } catch {
    return false;
  }
}

function markSeen(id) {
  try {
    localStorage.setItem(SEEN_PREFIX + id, 'true');
  } catch {
    // localStorageが使えない環境（プライベートモード等）でも無視して続行する
  }
}

function currentStepId() {
  return STEPS[stepIndex] ?? null;
}

function showCurrentStepHint() {
  const hintEl = document.getElementById('tutorial-hint');
  if (!hintEl) return;
  const id = currentStepId();
  if (!id) {
    hintEl.classList.add('hidden');
    return;
  }
  hintEl.textContent = HINT_TEXT[id];
  hintEl.classList.remove('hidden');
}

/**
 * 「少なくともこのステップには到達した」ことを通知する。まだ既読でない
 * 手前のステップがあればまとめて既読にして読み飛ばし、現在位置をidまで
 * 進める（既にidを過ぎている場合は何もしない）。
 */
function reachStep(id) {
  const targetIndex = STEPS.indexOf(id);
  if (targetIndex === -1 || targetIndex < stepIndex) return;
  for (let i = stepIndex; i < targetIndex; i += 1) markSeen(STEPS[i]);
  stepIndex = targetIndex;
  showCurrentStepHint();
}

/**
 * 現在表示中のステップがidと一致する場合だけ、それを既読にして次へ進める。
 * 次のステップのヒントは、その専用のトリガー（reachStep）が発火するまでは
 * 自動表示しない（例：歩き終えた瞬間に次の「タイルにマウスを乗せると…」が
 * 先回りして出てしまわないようにする）ため、ここではヒントを隠すだけにする。
 */
function completeStep(id) {
  if (currentStepId() !== id) return;
  markSeen(id);
  stepIndex += 1;
  const hintEl = document.getElementById('tutorial-hint');
  hintEl?.classList.add('hidden');
}

/**
 * ゲーム開始時に一度だけ呼ぶ。既読のステップは読み飛ばし、現在のステップの
 * ヒントを表示する（全て既読なら何も表示しない）。
 */
export function initTutorial() {
  stepIndex = 0;
  while (stepIndex < STEPS.length && hasSeen(STEPS[stepIndex])) stepIndex += 1;
  showCurrentStepHint();
}

export function notifyPlayerMoved() {
  completeStep('move');
}

export function notifyTileHovered() {
  reachStep('tileHover');
}

export function notifyBuildMenuOpened() {
  reachStep('buildHouse');
}

export function notifyQuestCompleted(questId) {
  if (questId !== 'quest_build_house') return;
  reachStep('buildHouse');
  completeStep('buildHouse');
}
