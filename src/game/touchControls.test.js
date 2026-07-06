import { describe, test, expect } from 'vitest';
import { computeKnobVector, getTouchMoveVector } from './touchControls.js';

describe('computeKnobVector（フェーズ20: 仮想スティック）', () => {
  test('スティック中心からの差分が半径内なら、そのままの比率で正規化される', () => {
    const result = computeKnobVector(20, 0, 45);
    expect(result.x).toBeCloseTo(20 / 45, 5);
    expect(result.z).toBe(0);
    expect(result.clampedX).toBe(20);
  });

  test('半径を超える入力は、方向を保ったまま半径にクランプされる', () => {
    const result = computeKnobVector(100, 0, 45);
    expect(result.x).toBeCloseTo(1, 5);
    expect(result.clampedX).toBeCloseTo(45, 5);
  });

  test('斜め方向でも正しくクランプされる（長さが半径を超えない）', () => {
    const result = computeKnobVector(80, 80, 45);
    const clampedLength = Math.hypot(result.clampedX, result.clampedY);
    expect(clampedLength).toBeCloseTo(45, 5);
  });

  test('差分が0であれば{x:0, z:0}を返す', () => {
    const result = computeKnobVector(0, 0, 45);
    expect(result.x).toBe(0);
    expect(result.z).toBe(0);
  });
});

describe('getTouchMoveVector', () => {
  test('タッチしていない初期状態は{x:0, z:0}', () => {
    expect(getTouchMoveVector()).toEqual({ x: 0, z: 0 });
  });
});
