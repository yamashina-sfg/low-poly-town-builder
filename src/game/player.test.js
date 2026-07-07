import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  initPlayer,
  getCharacterPosition,
  getCharacterFacing,
  setCharacterFacing,
  updateMovementInput,
  updateCameraFollow,
  CAMERA_OFFSET,
} from './player.js';

function press(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}
function release(code) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

function setup() {
  const fakeScene = { add: () => {} };
  const fakeCamera = { position: new THREE.Vector3(), lookAt: () => {} };
  initPlayer(fakeScene, fakeCamera);
}

describe('その場旋回方式のA/D操作（方向転換の改善）', () => {
  beforeEach(() => {
    setup();
    setCharacterFacing(0);
    // 前のテストで押しっぱなしになっていたキーが残らないようにリセットする
    ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(release);
  });

  test('Dキーは現在の向きに関係なく常に同じ角速度でその場旋回する', () => {
    setCharacterFacing(0.4);
    press('KeyD');
    updateMovementInput(0.1);
    const deltaFromZero = getCharacterFacing() - 0.4;
    release('KeyD');

    setCharacterFacing(2.5); // 全く違う向きから始めても
    press('KeyD');
    updateMovementInput(0.1);
    const deltaFromOther = getCharacterFacing() - 2.5;
    release('KeyD');

    // 画面上は常にキャラの背後にカメラがあるため、画面右への旋回は
    // characterFacingが減る向きになる（Dキー = 画面右へ旋回）。
    expect(deltaFromZero).toBeLessThan(0);
    expect(deltaFromOther).toBeCloseTo(deltaFromZero, 5); // 開始角度に依存しない
  });

  test('Aキーは逆方向（画面左）に、同じ大きさで回転する', () => {
    press('KeyA');
    updateMovementInput(0.1);
    const afterA = getCharacterFacing();
    release('KeyA');

    setCharacterFacing(0);
    press('KeyD');
    updateMovementInput(0.1);
    const afterD = getCharacterFacing();
    release('KeyD');

    expect(afterA).toBeGreaterThan(0);
    expect(afterA).toBeCloseTo(-afterD, 5);
  });

  test('回転量はdeltaに比例する（フレームレートに依存しない）', () => {
    setCharacterFacing(0);
    press('KeyD');
    updateMovementInput(0.05);
    const small = getCharacterFacing();

    setCharacterFacing(0);
    updateMovementInput(0.1);
    const large = getCharacterFacing();

    expect(large).toBeCloseTo(small * 2, 5);
  });

  test('A/Dだけ押している間はキャラは移動しない（回転のみ）', () => {
    const before = getCharacterPosition().clone();
    press('KeyD');
    const isMoving = updateMovementInput(0.1);
    release('KeyD');

    expect(isMoving).toBe(false);
    expect(getCharacterPosition().distanceTo(before)).toBeCloseTo(0, 5);
  });
});

describe('W/Sは現在向いている方向への前進/後退', () => {
  beforeEach(() => {
    setup();
    ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(release);
  });

  test('facingが異なれば、Wで進む方向も追従して変わる', () => {
    setCharacterFacing(0);
    const start1 = getCharacterPosition().clone();
    press('KeyW');
    updateMovementInput(0.1);
    release('KeyW');
    const displacement0 = getCharacterPosition().clone().sub(start1);

    setCharacterFacing(Math.PI); // 反対向き
    const start2 = getCharacterPosition().clone();
    press('KeyW');
    updateMovementInput(0.1);
    release('KeyW');
    const displacementPi = getCharacterPosition().clone().sub(start2);

    // facing=0の前進はfacing=πの前進と正反対の方向になるはず
    expect(displacementPi.z).toBeCloseTo(-displacement0.z, 5);
  });

  test('Sキーは前進(W)と正反対の方向へ後退する', () => {
    setCharacterFacing(0.7);
    const start = getCharacterPosition().clone();
    press('KeyS');
    updateMovementInput(0.1);
    release('KeyS');
    const backDisplacement = getCharacterPosition().clone().sub(start);

    setCharacterFacing(0.7);
    const start2 = getCharacterPosition().clone();
    press('KeyW');
    updateMovementInput(0.1);
    release('KeyW');
    const forwardDisplacement = getCharacterPosition().clone().sub(start2);

    expect(backDisplacement.x).toBeCloseTo(-forwardDisplacement.x, 5);
    expect(backDisplacement.z).toBeCloseTo(-forwardDisplacement.z, 5);
  });

  test('Wを押しながらA/Dも押すと、前進と旋回が同時に反映される', () => {
    setCharacterFacing(0);
    const facingBefore = getCharacterFacing();
    const posBefore = getCharacterPosition().clone();

    press('KeyW');
    press('KeyD');
    const isMoving = updateMovementInput(0.1);
    release('KeyW');
    release('KeyD');

    expect(isMoving).toBe(true);
    expect(getCharacterFacing()).toBeLessThan(facingBefore); // 旋回した（Dは画面右=facing減少）
    expect(getCharacterPosition().distanceTo(posBefore)).toBeGreaterThan(0); // 前進した
  });
});

describe('カメラの向きはキャラの向きに常に完全同期する（回帰テスト）', () => {
  beforeEach(() => {
    setup();
    ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(release);
  });

  function cameraOrbitAngle(cameraPos) {
    const pos = getCharacterPosition();
    return Math.atan2(cameraPos.x - pos.x, cameraPos.z - pos.z);
  }

  test('旋回中でもカメラは遅延なくキャラの向きに追従する（指数スムージングによる位相遅れがないこと）', () => {
    const fakeCamera = { position: new THREE.Vector3(), lookAt: () => {} };
    // player.js内部のcameraRefを差し替えるため、initPlayerを専用カメラで呼び直す
    initPlayer({ add: () => {} }, fakeCamera);
    setCharacterFacing(0);

    press('KeyD');
    for (let i = 0; i < 5; i += 1) {
      updateMovementInput(0.1); // その場旋回させ続ける
      updateCameraFollow(false);
      const lag = cameraOrbitAngle(fakeCamera.position) - (getCharacterFacing() + Math.PI);
      const normalizedLag = Math.atan2(Math.sin(lag), Math.cos(lag));
      // 修正前は約35〜45度（0.6〜0.8rad）の定常位相遅れがあった。
      // 遅延なく追従していれば、ズレはほぼ0になるはず。
      expect(Math.abs(normalizedLag)).toBeLessThan(0.01);
    }
    release('KeyD');
  });

  test('CAMERA_OFFSETは変わらずキャラの後方(Z負)を向いている', () => {
    expect(CAMERA_OFFSET.z).toBeLessThan(0);
  });
});

describe('ウィンドウのフォーカスが外れた際のキー固着防止（回帰テスト）', () => {
  beforeEach(() => {
    setup();
    ['KeyA', 'KeyD', 'KeyW', 'KeyS'].forEach(release);
  });

  test('keyupが届かないままwindowがblurしても、以後は回転し続けない', () => {
    setCharacterFacing(0);
    press('KeyD'); // keyupを送らない（フォーカスロストでkeyupが失われた状況を再現）
    updateMovementInput(0.1);
    const facingBeforeBlur = getCharacterFacing();
    expect(facingBeforeBlur).toBeLessThan(0); // 旋回はしている（Dは画面右=facing減少）

    window.dispatchEvent(new Event('blur'));

    updateMovementInput(0.1);
    const facingAfterBlur = getCharacterFacing();
    // blur時にキー状態がリセットされていれば、以後は回転が進まないはず
    expect(facingAfterBlur).toBe(facingBeforeBlur);
  });

  test('document.hiddenになった場合（タブ切り替え等）も同様にリセットされる', () => {
    setCharacterFacing(0);
    press('KeyD');
    updateMovementInput(0.1);
    const facingBeforeHide = getCharacterFacing();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    updateMovementInput(0.1);
    expect(getCharacterFacing()).toBe(facingBeforeHide);
  });
});
