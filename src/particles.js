import * as THREE from 'three';

// 外部エフェクトライブラリを使わない、ごく簡易なCPUパーティクル。
// 木を切ったときの葉っぱの飛散や、水面のきらめきなど短命な演出に使う。
const particles = [];

/**
 * position を起点に、ランダムな方向へ飛び散る小さな板ポリゴンを count 個生成する。
 */
export function spawnParticleBurst(
  scene,
  { position, count = 8, color = 0xffffff, size = 0.08, speed = 2, life = 1, gravity = -3 }
) {
  for (let i = 0; i < count; i += 1) {
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);

    const angle = Math.random() * Math.PI * 2;
    const upSpeed = speed * (0.4 + Math.random() * 0.6);
    const outSpeed = speed * (0.2 + Math.random() * 0.5);
    const velocity = new THREE.Vector3(Math.cos(angle) * outSpeed, upSpeed, Math.sin(angle) * outSpeed);

    scene.add(mesh);
    particles.push({ mesh, velocity, life, maxLife: life, gravity, spin: (Math.random() - 0.5) * 6 });
  }
}

/**
 * その場でふわっと明滅するだけの、水面のきらめき用の小さな粒を1つ生成する。
 */
export function spawnSparkle(scene, position) {
  spawnParticleBurst(scene, {
    position,
    count: 1,
    color: 0xe8f6ff,
    size: 0.1,
    speed: 0.05,
    life: 0.7,
    gravity: 0,
  });
}

export function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= delta;
    if (p.life <= 0) {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      p.mesh.parent?.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.velocity.y += p.gravity * delta;
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.mesh.rotation.y += p.spin * delta;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
  }
}
