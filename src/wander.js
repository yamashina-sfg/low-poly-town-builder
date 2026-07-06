/**
 * ホーム地点を中心に半径radius内をゆっくり徘徊する、汎用の簡易AI。
 * NPC・小動物など「決まった範囲を歩き回るだけ」の挙動に使い回す。
 */
export function createWanderer({ homeX, homeZ, radius, speed, arriveDistance = 0.3 }) {
  let targetX = homeX;
  let targetZ = homeZ;
  let idleTime = 0.5 + Math.random() * 1.5;

  function pickNewTarget() {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    targetX = homeX + Math.cos(angle) * distance;
    targetZ = homeZ + Math.sin(angle) * distance;
    idleTime = 1 + Math.random() * 2.5;
  }

  /**
   * @param position {x,z}を持つオブジェクト（THREE.Vector3など）。移動分をそのまま加算する。
   * @returns { isMoving, facing } 移動中かどうかと、進行方向の角度（atan2(x,z)系）
   */
  function update(position, delta) {
    const dx = targetX - position.x;
    const dz = targetZ - position.z;
    const distance = Math.hypot(dx, dz);
    let isMoving = false;

    if (distance > arriveDistance) {
      const step = Math.min(distance, speed * delta);
      position.x += (dx / distance) * step;
      position.z += (dz / distance) * step;
      isMoving = true;
    } else {
      idleTime -= delta;
      if (idleTime <= 0) pickNewTarget();
    }

    return { isMoving, facing: Math.atan2(dx, dz) };
  }

  return { update };
}
