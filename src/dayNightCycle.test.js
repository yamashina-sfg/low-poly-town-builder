import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { updateDayNightCycle } from './dayNightCycle.js';

function makeFakes() {
  return {
    scene: { background: new THREE.Color(0x000000) },
    dirLight: {
      color: new THREE.Color(),
      intensity: 0,
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() },
    },
    hemiLight: { color: new THREE.Color(), groundColor: new THREE.Color(), intensity: 0 },
  };
}

describe('updateDayNightCycle（フェーズ27：朝焼け・夕焼けの演出強化）', () => {
  test('明け方(dayFraction=0.25)は、正午(dayFraction=0.5)より暖色（赤み寄り）になる', () => {
    const dawn = makeFakes();
    updateDayNightCycle({ dayFraction: 0.25, ...dawn, targetPosition: null });

    const noon = makeFakes();
    updateDayNightCycle({ dayFraction: 0.5, ...noon, targetPosition: null });

    const dawnWarmth = dawn.dirLight.color.r - dawn.dirLight.color.b;
    const noonWarmth = noon.dirLight.color.r - noon.dirLight.color.b;
    expect(dawnWarmth).toBeGreaterThan(noonWarmth);
  });

  test('深夜(dayFraction=0)は明るさが低いまま（昼と混同しない）', () => {
    const midnight = makeFakes();
    updateDayNightCycle({ dayFraction: 0, ...midnight, targetPosition: null });
    expect(midnight.dirLight.intensity).toBeLessThan(0.5);
  });

  test('targetPositionが無くてもクラッシュしない（プレイヤー未初期化時の安全性）', () => {
    const fakes = makeFakes();
    expect(() => {
      updateDayNightCycle({ dayFraction: 0.75, ...fakes, targetPosition: null });
    }).not.toThrow();
  });
});
