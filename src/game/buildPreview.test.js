import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  getFootprintForType,
  computeRotationYForSteps,
  nextRotationSteps,
  initBuildPreview,
  startPreview,
  stopPreview,
  isPreviewActive,
  getPreviewType,
  rotatePreview,
  getRotationSteps,
  getPreviewRotationY,
  updatePreviewPosition,
  setPreviewValid,
  setRotationSteps,
} from './buildPreview.js';

describe('getFootprintForType（フェーズ21: 建築プレビュー）', () => {
  test('既知の種類は個別のfootprintを返す', () => {
    const house = getFootprintForType('house');
    expect(house.width).toBeGreaterThan(0);
    expect(house.height).toBeGreaterThan(0);
    expect(house.depth).toBeGreaterThan(0);
  });

  test('未知の種類はデフォルトのfootprintにフォールバックする', () => {
    const unknown = getFootprintForType('__no_such_type__');
    expect(unknown).toEqual({ width: 1, height: 1, depth: 1 });
  });
});

describe('回転ステップ（Rキーで90度単位に回転）', () => {
  test('nextRotationStepsは0→1→2→3→0と循環する', () => {
    expect(nextRotationSteps(0)).toBe(1);
    expect(nextRotationSteps(1)).toBe(2);
    expect(nextRotationSteps(2)).toBe(3);
    expect(nextRotationSteps(3)).toBe(0);
  });

  test('computeRotationYForStepsはステップ数×90度(ラジアン)を返す', () => {
    expect(computeRotationYForSteps(0)).toBeCloseTo(0, 10);
    expect(computeRotationYForSteps(1)).toBeCloseTo(Math.PI / 2, 10);
    expect(computeRotationYForSteps(2)).toBeCloseTo(Math.PI, 10);
    expect(computeRotationYForSteps(3)).toBeCloseTo((Math.PI * 3) / 2, 10);
  });
});

describe('プレビューの状態管理（ステートフル部分）', () => {
  beforeEach(() => {
    initBuildPreview({ add: () => {} });
    stopPreview();
  });

  test('startPreviewでアクティブになり、stopPreviewで非アクティブに戻る', () => {
    expect(isPreviewActive()).toBe(false);
    startPreview('house');
    expect(isPreviewActive()).toBe(true);
    expect(getPreviewType()).toBe('house');
    stopPreview();
    expect(isPreviewActive()).toBe(false);
    expect(getPreviewType()).toBeNull();
  });

  test('rotatePreviewを4回押すと元の角度に戻る（一周する）', () => {
    startPreview('fence');
    const initial = getPreviewRotationY();
    for (let i = 0; i < 4; i += 1) rotatePreview();
    expect(getRotationSteps()).toBe(0);
    expect(getPreviewRotationY()).toBeCloseTo(initial, 10);
  });

  test('rotatePreviewは1回につき90度分だけ回転させる', () => {
    startPreview('fence');
    rotatePreview();
    expect(getPreviewRotationY()).toBeCloseTo(Math.PI / 2, 10);
  });

  test('非アクティブな状態でrotatePreviewを呼んでも何も起きない', () => {
    stopPreview();
    const before = getRotationSteps();
    rotatePreview();
    expect(getRotationSteps()).toBe(before);
  });

  test('setRotationStepsで「移動」開始時に元の向きを直接引き継げる', () => {
    startPreview('bench');
    setRotationSteps(2);
    expect(getRotationSteps()).toBe(2);
    expect(getPreviewRotationY()).toBeCloseTo(Math.PI, 10);
  });

  test('updatePreviewPosition/setPreviewValidを呼んでも例外が起きない', () => {
    startPreview('house');
    expect(() => updatePreviewPosition(new THREE.Vector3(3, 0, -2))).not.toThrow();
    expect(() => setPreviewValid(false)).not.toThrow();
    expect(() => setPreviewValid(true)).not.toThrow();
  });
});
