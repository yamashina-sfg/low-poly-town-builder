import { describe, test, expect } from 'vitest';
import { createNPC } from './npc.js';

describe('createNPC の目的地システム（フェーズ22：NPCの通勤）', () => {
  test('destinationが未設定なら、ホーム地点周辺を徘徊する（大きく離れすぎない）', () => {
    const npc = createNPC({ homeX: 0, homeZ: 0, radius: 4, speed: 1 });
    for (let i = 0; i < 200; i += 1) npc.update(0.1);
    const distance = Math.hypot(npc.group.position.x, npc.group.position.z);
    expect(distance).toBeLessThan(6); // 半径4+多少の余裕
  });

  test('setDestinationを呼ぶと、その地点へ向かって直進する', () => {
    const npc = createNPC({ homeX: 0, homeZ: 0, radius: 4, speed: 1 });
    npc.setDestination(10, 0);
    expect(npc.hasArrivedAtDestination()).toBe(false);
    for (let i = 0; i < 200; i += 1) npc.update(0.1);
    expect(npc.hasArrivedAtDestination()).toBe(true);
    expect(npc.group.position.x).toBeCloseTo(10, 0);
  });

  test('clearDestinationを呼ぶと、以後は徘徊に戻る', () => {
    const npc = createNPC({ homeX: 0, homeZ: 0, radius: 2, speed: 1 });
    npc.setDestination(50, 50);
    npc.update(0.1);
    npc.clearDestination();
    expect(npc.hasArrivedAtDestination()).toBe(true); // destination未設定なので常にtrue
  });

  test('destinationに到達していない間はisMovingがtrueになる（歩行アニメーションが動く）', () => {
    const npc = createNPC({ homeX: 0, homeZ: 0, radius: 2, speed: 1 });
    npc.setDestination(5, 5);
    const before = { x: npc.group.position.x, z: npc.group.position.z };
    npc.update(0.1);
    const after = { x: npc.group.position.x, z: npc.group.position.z };
    expect(after.x !== before.x || after.z !== before.z).toBe(true);
  });

  test('setDestinationにarriveDistanceを渡すと、その距離まで近づいた時点で到着とみなす（回帰テスト：衝突判定を持つ建物の手前で立ち往生しないため）', () => {
    const npc = createNPC({ homeX: 0, homeZ: 0, radius: 2, speed: 1 });
    // 通常の到達判定距離(0.3)よりずっと外側にある、建物の衝突半径を模した距離。
    npc.setDestination(10, 0, 1.8);
    expect(npc.hasArrivedAtDestination()).toBe(false);
    // 十分な距離まで進めるが、衝突判定がなくても実際に(10,0)ちょうどには
    // 到達しない状況を模して、目的地の少し手前で止める。
    for (
      let i = 0;
      i < 500 && Math.hypot(10 - npc.group.position.x, 0 - npc.group.position.z) > 1.8;
      i += 1
    ) {
      npc.update(0.05);
    }
    expect(npc.hasArrivedAtDestination()).toBe(true);
    // 通常の到達判定距離(0.3)よりは離れた位置で「到着」と判定されているはず。
    const distance = Math.hypot(10 - npc.group.position.x, 0 - npc.group.position.z);
    expect(distance).toBeGreaterThan(0.3);
  });
});
