import { describe, test, expect } from 'vitest';
import { createCharacter } from './character.js';

describe('向きを示す装飾（フェーズ18: ビジュアル強化）', () => {
  test('帽子のつば・胸のボタンは前方(+Z)に付いている', () => {
    // player.js/regressions.test.jsの前提と同じく、rotation.y=facingとしたとき
    // ローカル+Zが実際の進行方向を向く軸になる（カメラの符号反転バグの回帰
    // テストと対になる、向き表現の一貫性チェック）。
    const { group } = createCharacter();
    const brim = group.getObjectByName('hatBrim');
    const button = group.getObjectByName('chestButton');
    expect(brim).toBeDefined();
    expect(button).toBeDefined();
    expect(brim.position.z).toBeGreaterThan(0);
    expect(button.position.z).toBeGreaterThan(0);
  });

  test('主要パーツがcastShadowを有効にしている（低ポリの簡易シャドウ用）', () => {
    const { group } = createCharacter();
    const body = group.children.find((child) => child.geometry?.type === 'CapsuleGeometry');
    expect(body.castShadow).toBe(true);
  });
});
