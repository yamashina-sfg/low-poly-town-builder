import * as THREE from 'three';
import { easeOutBack } from './easing.js';

// 建物・木・道路のパーツは種類ごとに1つのInstancedMeshへ集約する。
// ジオメトリは「底面を原点に置いた単位形状」を共有し、位置・回転・
// 非一様スケール・インスタンスカラーだけで見た目のバリエーションを表現する。

const MAX_INSTANCES_PER_POOL = 2000;
const GROW_DURATION = 0.35; // 秒

// 底面ピボットの単位ボックス。建物の壁・平屋根・道路が共有する。
export const UNIT_BOX_POOL = 'unit-box';

const pools = new Map();
const dummy = new THREE.Object3D();
const growAnimations = [];

function createPool(key, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_POOL);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const pool = { mesh, freeList: [], activeCount: 0 };
  pools.set(key, pool);
  return pool;
}

export function registerPool(key, geometry, material) {
  if (!pools.has(key)) {
    createPool(key, geometry, material);
  }
  return pools.get(key).mesh;
}

/**
 * プールにインスタンスを1つ追加し、後で削除するためのハンドルを返す。
 * animate: trueの場合、スケール0から目標サイズへポップインする
 * （建築時の「下から生えてくる」演出）。
 */
export function addInstance(key, position, rotation, scale, color, { animate = false } = {}) {
  const pool = pools.get(key);
  let index;
  if (pool.freeList.length > 0) {
    index = pool.freeList.pop();
  } else {
    index = pool.activeCount;
    pool.activeCount += 1;
  }
  pool.mesh.count = Math.max(pool.mesh.count, pool.activeCount);

  dummy.position.copy(position);
  dummy.rotation.copy(rotation);
  dummy.scale.copy(animate ? { x: 0.001, y: 0.001, z: 0.001 } : scale);
  dummy.updateMatrix();
  pool.mesh.setMatrixAt(index, dummy.matrix);
  if (color) pool.mesh.setColorAt(index, color);
  pool.mesh.instanceMatrix.needsUpdate = true;
  if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;

  if (animate) {
    growAnimations.push({
      pool,
      index,
      position: position.clone(),
      rotation: rotation.clone(),
      targetScale: scale.clone(),
      startTime: null,
    });
  }

  return { key, index };
}

/**
 * ハンドルで指定したインスタンスをスケール0にして非表示にし、
 * 使用していたインデックスを再利用可能にする。
 */
export function removeInstance({ key, index }) {
  const pool = pools.get(key);

  for (let i = growAnimations.length - 1; i >= 0; i -= 1) {
    if (growAnimations[i].pool === pool && growAnimations[i].index === index) {
      growAnimations.splice(i, 1);
    }
  }

  dummy.position.set(0, 0, 0);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  pool.mesh.setMatrixAt(index, dummy.matrix);
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.freeList.push(index);
}

/**
 * 建築ポップアップアニメーションを毎フレーム進行させる。
 */
export function updateInstanceAnimations(elapsed) {
  for (let i = growAnimations.length - 1; i >= 0; i -= 1) {
    const anim = growAnimations[i];
    if (anim.startTime === null) anim.startTime = elapsed;
    const t = Math.min(1, (elapsed - anim.startTime) / GROW_DURATION);
    const eased = easeOutBack(t);

    dummy.position.copy(anim.position);
    dummy.rotation.copy(anim.rotation);
    dummy.scale.set(
      Math.max(0.001, anim.targetScale.x * eased),
      Math.max(0.001, anim.targetScale.y * eased),
      Math.max(0.001, anim.targetScale.z * eased)
    );
    dummy.updateMatrix();
    anim.pool.mesh.setMatrixAt(anim.index, dummy.matrix);
    anim.pool.mesh.instanceMatrix.needsUpdate = true;

    if (t >= 1) growAnimations.splice(i, 1);
  }
}

export function getAllPoolMeshes() {
  return Array.from(pools.values(), (pool) => pool.mesh);
}

export function getInstanceCount() {
  let total = 0;
  pools.forEach((pool) => {
    total += pool.activeCount - pool.freeList.length;
  });
  return total;
}
