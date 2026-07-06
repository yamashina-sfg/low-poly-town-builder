import * as THREE from 'three';
import { createWanderer } from './wander.js';

const BIRD_BODY_COLOR = 0x3a3a3a;
const DOG_BODY_COLORS = [0xb58a5c, 0x8a6a4a, 0xd8c9a3, 0x6b6b63];

/**
 * 上空を円を描いて飛ぶだけの、ごく簡易な鳥。ローポリな三角形の胴体のみ。
 */
export function createBird({ centerX, centerZ, height = 5, radius = 4, speed = 1 }) {
  const geometry = new THREE.ConeGeometry(0.12, 0.5, 4);
  geometry.rotateX(Math.PI / 2); // 進行方向（Z軸）を向くように寝かせる
  const material = new THREE.MeshStandardMaterial({ color: BIRD_BODY_COLOR, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);

  const phase = Math.random() * Math.PI * 2;
  const direction = Math.random() < 0.5 ? 1 : -1;

  function update(elapsed) {
    const angle = phase + elapsed * speed * direction;
    mesh.position.set(
      centerX + Math.cos(angle) * radius,
      height + Math.sin(elapsed * 2 + phase) * 0.3,
      centerZ + Math.sin(angle) * radius,
    );
    // 円軌道の接線方向を向く
    const tangent = angle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    mesh.rotation.y = tangent;
  }

  return { group: mesh, update };
}

/**
 * 決まった範囲をゆっくり歩き回るだけの簡易な犬。箱と円柱の組み合わせ。
 */
export function createDog({ homeX, homeZ, radius = 3, speed = 1.6 }) {
  const group = new THREE.Group();
  const color = DOG_BODY_COLORS[Math.floor(Math.random() * DOG_BODY_COLORS.length)];
  const material = new THREE.MeshStandardMaterial({ color, flatShading: true });

  const bodyGeometry = new THREE.BoxGeometry(0.5, 0.28, 0.24);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = 0.22;
  group.add(body);

  const headGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(0, 0.3, 0.3);
  group.add(head);

  const legGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 5);
  [
    [0.18, 0.08],
    [-0.18, 0.08],
    [0.18, -0.08],
    [-0.18, -0.08],
  ].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeometry, material);
    leg.position.set(x, 0.1, z);
    group.add(leg);
  });

  group.position.set(homeX, 0, homeZ);
  const wanderer = createWanderer({ homeX, homeZ, radius, speed });
  let facing = Math.random() * Math.PI * 2;
  group.rotation.y = facing;

  function update(delta) {
    const { isMoving, facing: targetFacing } = wanderer.update(group.position, delta);
    if (isMoving) {
      let angleDiff = targetFacing - facing;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      facing += angleDiff * Math.min(1, 8 * delta);
      group.rotation.y = facing;
    }
  }

  return { group, update };
}
