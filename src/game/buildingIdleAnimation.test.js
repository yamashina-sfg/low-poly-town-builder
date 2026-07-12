import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initBuildingIdleAnimation, updateBuildingIdleAnimation } from './buildingIdleAnimation.js';
import { initWorld, buildOnTile, resetTown } from './world.js';
import { getGlobalTile } from '../chunkManager.js';
import { getPoolMesh } from '../instancing.js';

const fakeScene = { add: () => {}, remove: () => {} };

function readFlagRotationY(tile) {
  const flagPart = tile.userData.object.animatedParts[0].part;
  const mesh = getPoolMesh(flagPart.key);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(flagPart.index, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return new THREE.Euler().setFromQuaternion(quaternion).y;
}

beforeEach(() => {
  initWorld(fakeScene);
  resetTown();
  initBuildingIdleAnimation(fakeScene);
});

describe('updateBuildingIdleAnimation（フェーズ27：稼働中の建物のわずかな演出）', () => {
  test('役場の旗は時間経過で回転が変化する（左右に揺れる）', () => {
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'townHall', { animate: false });
    const initialY = readFlagRotationY(tile);

    let changed = false;
    for (let i = 0; i < 30; i += 1) {
      updateBuildingIdleAnimation(0.15, i * 0.15);
      if (Math.abs(readFlagRotationY(tile) - initialY) > 0.001) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test('維持費未払いで非稼働になった役場の旗は揺れが止まる', () => {
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'townHall', { animate: false });
    tile.userData.condition = 0; // 非稼働

    updateBuildingIdleAnimation(0.15, 10);
    const y1 = readFlagRotationY(tile);
    updateBuildingIdleAnimation(0.15, 10.15);
    const y2 = readFlagRotationY(tile);
    expect(y1).toBeCloseTo(y2, 5);
  });

  test('役場・生産施設・お店以外のタイルではクラッシュしない', () => {
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'house', { animate: false });
    expect(() => {
      for (let i = 0; i < 5; i += 1) updateBuildingIdleAnimation(0.15, i * 0.15);
    }).not.toThrow();
  });

  test('稼働中の生産施設では、時間経過でパーティクル（scene.add呼び出し）が発生する', () => {
    let addCalls = 0;
    const trackingScene = {
      add: () => {
        addCalls += 1;
      },
      remove: () => {},
    };
    initBuildingIdleAnimation(trackingScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'loggingHut', { animate: false });

    for (let i = 0; i < 100; i += 1) {
      updateBuildingIdleAnimation(0.15, i * 0.15);
    }
    expect(addCalls).toBeGreaterThan(0);
  });

  test('老朽化して非稼働の生産施設ではパーティクルが発生しない', () => {
    let addCalls = 0;
    const trackingScene = {
      add: () => {
        addCalls += 1;
      },
      remove: () => {},
    };
    initBuildingIdleAnimation(trackingScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'loggingHut', { animate: false });
    tile.userData.condition = 0;

    for (let i = 0; i < 100; i += 1) {
      updateBuildingIdleAnimation(0.15, i * 0.15);
    }
    expect(addCalls).toBe(0);
  });
});
