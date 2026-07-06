// タッチデバイス向けの仮想スティック（フェーズ20）。
// 建築メニューのタップ操作は、既存のポインター/クリックイベントが
// タッチでも標準的にclickへ変換されるため追加対応が不要。ここでは
// キーボードに相当する移動入力（WASD）をタッチでも行えるようにする。
const MAX_RADIUS = 45; // px

let currentX = 0;
let currentZ = 0;
let active = false;
let originX = 0;
let originY = 0;

/**
 * タッチ位置とスティック中心からの差分(dx, dy)を、半径maxRadiusでクランプした
 * 正規化ベクトル(-1〜1)に変換する純粋関数（テスト用に公開）。
 */
export function computeKnobVector(dx, dy, maxRadius = MAX_RADIUS) {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, z: 0, clampedX: 0, clampedY: 0 };
  const clampedDist = Math.min(dist, maxRadius);
  const clampedX = (dx / dist) * clampedDist;
  const clampedY = (dy / dist) * clampedDist;
  return { x: clampedX / maxRadius, z: clampedY / maxRadius, clampedX, clampedY };
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 画面上の仮想スティックを、タッチデバイスの場合にのみ有効化する。
 */
export function initTouchControls() {
  const joystick = document.getElementById('touch-joystick');
  const knob = document.getElementById('touch-joystick-knob');
  if (!joystick || !knob || !isTouchDevice()) return;

  joystick.classList.remove('hidden');

  function updateKnob(clientX, clientY) {
    const result = computeKnobVector(clientX - originX, clientY - originY);
    currentX = result.x;
    currentZ = result.z;
    knob.style.transform = `translate(${result.clampedX}px, ${result.clampedY}px)`;
  }

  function handleStart(event) {
    active = true;
    const rect = joystick.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    const touch = event.touches[0];
    updateKnob(touch.clientX, touch.clientY);
    event.preventDefault();
  }

  function handleMove(event) {
    if (!active) return;
    const touch = event.touches[0];
    updateKnob(touch.clientX, touch.clientY);
    event.preventDefault();
  }

  function handleEnd() {
    active = false;
    currentX = 0;
    currentZ = 0;
    knob.style.transform = 'translate(0px, 0px)';
  }

  joystick.addEventListener('touchstart', handleStart, { passive: false });
  joystick.addEventListener('touchmove', handleMove, { passive: false });
  joystick.addEventListener('touchend', handleEnd);
  joystick.addEventListener('touchcancel', handleEnd);
}

/**
 * 現在の仮想スティックの入力方向（x: 左右, z: 前後、いずれも-1〜1）。
 * 触れていなければ{x:0, z:0}。player.jsの移動入力に合成される。
 */
export function getTouchMoveVector() {
  return { x: currentX, z: currentZ };
}
