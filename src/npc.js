import { createCharacter } from './character.js';
import { createWanderer } from './wander.js';

const TURN_SMOOTHING = 6;
const ARRIVE_DISTANCE = 0.3;

/**
 * プレイヤーと同じローポリ人型を色違いで生成し、ホーム地点周辺を
 * ゆっくり徘徊させるだけのシンプルなNPC。
 * フェーズ22：setDestinationで明示的な目的地（家/勤務先への通勤）を
 * 指定している間は、そちらへ直進する（populace.jsの通勤システムが使う）。
 * 指定がなければ、これまで通りホーム地点周辺を徘徊する。
 */
export function createNPC({ homeX, homeZ, clothingColor, hatColor, radius = 4, speed = 1.2 }) {
  const controller = createCharacter({ clothingColor, hatColor });
  controller.group.position.set(homeX, 0, homeZ);
  const wanderer = createWanderer({ homeX, homeZ, radius, speed });
  const commuteSpeed = speed * 1.4; // 通勤中は徘徊より少し速く歩く
  let facing = Math.random() * Math.PI * 2;
  controller.group.rotation.y = facing;

  let destination = null; // { x, z, arriveDistance } | null（設定されている間は徘徊よりそちらを優先する）
  // フェーズ23：就寝時間帯は、目的地が無い間の徘徊を止めてその場に留まらせる
  // （生活サイクルの「就寝」を、見た目にも分かる形で表現するため）。
  let isSleeping = false;

  function update(delta) {
    let isMoving;
    let targetFacing;

    if (destination) {
      const position = controller.group.position;
      const dx = destination.x - position.x;
      const dz = destination.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > destination.arriveDistance) {
        const step = Math.min(distance, commuteSpeed * delta);
        position.x += (dx / distance) * step;
        position.z += (dz / distance) * step;
        isMoving = true;
        targetFacing = Math.atan2(dx, dz);
      } else {
        isMoving = false;
        targetFacing = facing;
      }
    } else if (isSleeping) {
      isMoving = false;
      targetFacing = facing;
    } else {
      const result = wanderer.update(controller.group.position, delta);
      isMoving = result.isMoving;
      targetFacing = result.facing;
    }

    if (isMoving) {
      let angleDiff = targetFacing - facing;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      facing += angleDiff * Math.min(1, TURN_SMOOTHING * delta);
      controller.group.rotation.y = facing;
    }
    controller.updateWalkAnimation(isMoving, delta);
  }

  /**
   * 明示的な目的地（ワールド座標）へ直進させる。到着するまでdestinationは
   * 保持され、徘徊は行わない。arriveDistanceを大きくすると、衝突判定を持つ
   * 建物（家・お店等）の手前で押し戻され続けて「到着」を検知できず
   * 立ち往生してしまう状況を避けられる（populace.jsの通勤システムが、
   * 道が見つからず建物の中心へ直接向かうフォールバック時に使う）。
   */
  function setDestination(x, z, arriveDistance = ARRIVE_DISTANCE) {
    destination = { x, z, arriveDistance };
  }

  /**
   * 明示的な目的地を解除し、通常のホーム地点周辺の徘徊に戻す。
   */
  function clearDestination() {
    destination = null;
  }

  /**
   * 現在の目的地に十分近づいたか（destinationが設定されていなければ常にtrue）。
   */
  function hasArrivedAtDestination() {
    if (!destination) return true;
    const position = controller.group.position;
    const dx = destination.x - position.x;
    const dz = destination.z - position.z;
    return Math.hypot(dx, dz) <= destination.arriveDistance;
  }

  /**
   * 就寝時間帯かどうかを設定する。trueの間は、目的地が無くても徘徊せず
   * その場に留まる（populace.jsが時間帯に応じて呼ぶ）。
   */
  function setSleeping(value) {
    isSleeping = value;
  }

  return {
    group: controller.group,
    update,
    setDestination,
    clearDestination,
    hasArrivedAtDestination,
    setSleeping,
  };
}
