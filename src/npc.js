import { createCharacter } from './character.js';
import { createWanderer } from './wander.js';

const TURN_SMOOTHING = 6;

/**
 * プレイヤーと同じローポリ人型を色違いで生成し、ホーム地点周辺を
 * ゆっくり徘徊させるだけのシンプルなNPC。
 */
export function createNPC({ homeX, homeZ, clothingColor, hatColor, radius = 4, speed = 1.2 }) {
  const controller = createCharacter({ clothingColor, hatColor });
  controller.group.position.set(homeX, 0, homeZ);
  const wanderer = createWanderer({ homeX, homeZ, radius, speed });
  let facing = Math.random() * Math.PI * 2;
  controller.group.rotation.y = facing;

  function update(delta) {
    const { isMoving, facing: targetFacing } = wanderer.update(controller.group.position, delta);
    if (isMoving) {
      let angleDiff = targetFacing - facing;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      facing += angleDiff * Math.min(1, TURN_SMOOTHING * delta);
      controller.group.rotation.y = facing;
    }
    controller.updateWalkAnimation(isMoving, delta);
  }

  return { group: controller.group, update };
}
