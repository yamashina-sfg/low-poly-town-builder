import { createNPC } from '../npc.js';
import { createBird, createDog } from '../creatures.js';
import { pushEntitiesApart } from '../collision.js';
import { resolveOutdoorCollision } from './world.js';

const NPC_CLOTHING_COLORS = [
  0xc94c4c, 0x4c7ac9, 0xc9a94c, 0x4cae7a, 0x8a5fd9, 0xe07a9a, 0x4cc9c0, 0xd97f2e, 0x7a9a3f, 0xa84ca0,
];
const NPC_HAT_COLORS = [0x5c5c5c, 0x7a4a3a, 0x3f6b3a, 0x455a64, 0x8a3f5c, 0x3f5c8a];
const NPC_COLLISION_RADIUS = 0.35;
const DOG_COLLISION_RADIUS = 0.22;
const NPC_COUNT = 6;
const BIRD_COUNT = 3;
const DOG_COUNT = 2;

let npcs = [];
let birds = [];
let dogs = [];

/**
 * NPC・犬・鳥を町の周囲にランダム配置する。
 * NPC・犬はプレイヤーと同じ徘徊AIで、決まった範囲をゆっくり歩き回るだけ。
 */
export function initPopulace(scene) {
  npcs = [];
  for (let i = 0; i < NPC_COUNT; i += 1) {
    const angle = (i / NPC_COUNT) * Math.PI * 2;
    const homeDistance = 8 + Math.random() * 10;
    const npc = createNPC({
      homeX: Math.cos(angle) * homeDistance,
      homeZ: Math.sin(angle) * homeDistance,
      clothingColor: NPC_CLOTHING_COLORS[i % NPC_CLOTHING_COLORS.length],
      hatColor: NPC_HAT_COLORS[i % NPC_HAT_COLORS.length],
      radius: 4 + Math.random() * 2,
      speed: 1 + Math.random() * 0.6,
    });
    scene.add(npc.group);
    npcs.push(npc);
  }

  birds = [];
  for (let i = 0; i < BIRD_COUNT; i += 1) {
    const bird = createBird({
      centerX: (Math.random() - 0.5) * 20,
      centerZ: (Math.random() - 0.5) * 20,
      height: 5 + Math.random() * 2,
      radius: 3 + Math.random() * 3,
      speed: 0.5 + Math.random() * 0.4,
    });
    scene.add(bird.group);
    birds.push(bird);
  }

  dogs = [];
  for (let i = 0; i < DOG_COUNT; i += 1) {
    const dog = createDog({
      homeX: (Math.random() - 0.5) * 16,
      homeZ: (Math.random() - 0.5) * 16,
      radius: 3 + Math.random() * 2,
    });
    scene.add(dog.group);
    dogs.push(dog);
  }
}

/**
 * NPC・犬・鳥の徘徊アニメーションを進め、建物や木にぶつからないようにする
 * （屋外専用、常に屋外にいるためプレイヤーの室内外モードに関係なく毎フレーム呼ぶ）。
 */
export function updatePopulace(delta, elapsedTime) {
  npcs.forEach((npc) => npc.update(delta));
  dogs.forEach((dog) => dog.update(delta));
  birds.forEach((bird) => bird.update(elapsedTime));

  npcs.forEach((npc) => resolveOutdoorCollision(npc.group.position, NPC_COLLISION_RADIUS));
  dogs.forEach((dog) => resolveOutdoorCollision(dog.group.position, DOG_COLLISION_RADIUS));
}

/**
 * プレイヤー・NPC・犬同士がすり抜けないよう、ゆるく押し出し合う。
 * プレイヤーが屋外にいるときだけ呼ぶ（NPC・犬は常に屋外にいるため）。
 */
export function resolvePopulaceInterCollisions(playerPosition, playerRadius) {
  const creatures = [
    ...npcs.map((npc) => ({ position: npc.group.position, radius: NPC_COLLISION_RADIUS })),
    ...dogs.map((dog) => ({ position: dog.group.position, radius: DOG_COLLISION_RADIUS })),
  ];
  creatures.forEach((creature) => {
    pushEntitiesApart(playerPosition, playerRadius, creature.position, creature.radius);
  });
  for (let i = 0; i < creatures.length; i += 1) {
    for (let j = i + 1; j < creatures.length; j += 1) {
      pushEntitiesApart(
        creatures[i].position,
        creatures[i].radius,
        creatures[j].position,
        creatures[j].radius,
      );
    }
  }
}
