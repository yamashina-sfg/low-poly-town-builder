import * as THREE from 'three';
import { registerPool, UNIT_BOX_POOL } from './instancing.js';

// 建物・家具・装飾・木などすべてが共有する「底面ピボットの単位ジオメトリ」。
// 位置・回転・非一様スケール・インスタンスカラーだけで見た目のバリエーションを表現する。

export const UNIT_CONE_SQUARE_POOL = 'unit-cone-square'; // 四角錐（三角屋根）
export const UNIT_CONE_ROUND_POOL = 'unit-cone-round'; // 丸みのある円錐（針葉樹など）
export const UNIT_TRUNK_POOL = 'unit-trunk'; // 先細りの円柱（木の幹）
export const UNIT_CYLINDER_POOL = 'unit-cylinder'; // まっすぐな円柱（柱・脚・煙突など汎用）
export const UNIT_SPHERE_POOL = 'unit-sphere'; // 球（葉・花・ランプの頭など）

function makeInstancedMaterial() {
  // material.colorは白のままにして、インスタンスカラーをそのまま反映させる
  return new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
}

const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitConeSquareGeometry = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
const unitConeRoundGeometry = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const unitTrunkGeometry = new THREE.CylinderGeometry(0.08, 0.13, 1, 6).translate(0, 0.5, 0);
const unitCylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
const unitSphereGeometry = new THREE.SphereGeometry(1, 6, 5);

registerPool(UNIT_BOX_POOL, unitBoxGeometry, makeInstancedMaterial());
registerPool(UNIT_CONE_SQUARE_POOL, unitConeSquareGeometry, makeInstancedMaterial());
registerPool(UNIT_CONE_ROUND_POOL, unitConeRoundGeometry, makeInstancedMaterial());
registerPool(UNIT_TRUNK_POOL, unitTrunkGeometry, makeInstancedMaterial());
registerPool(UNIT_CYLINDER_POOL, unitCylinderGeometry, makeInstancedMaterial());
registerPool(UNIT_SPHERE_POOL, unitSphereGeometry, makeInstancedMaterial());

export const ZERO_ROTATION = new THREE.Euler(0, 0, 0);
export { UNIT_BOX_POOL };

// ------------------------------------------------------------------
// 建築プレビューの回転（フェーズ21：Rキーで90度単位に回転）に対応するための
// 共通ヘルパー。各ジェネレーターは、タイル中心からのローカルなオフセット
// (offsetX, offsetZ)をrotationYだけ回転させた位置にパーツを配置し、
// パーツ自身の向きにもrotationYを加える。これにより、柵・ベンチ・看板
// など中心からずれた位置にパーツを持つ建物も、正しく向きを変えられる。
const rotationAxis = new THREE.Vector3(0, 1, 0);

/**
 * タイル中心(tilePosition)からのローカルオフセット(offsetX, offsetZ)を
 * rotationYだけ回転させた、ワールド座標のVector3を返す。
 */
export function offsetPosition(tilePosition, offsetX, offsetY, offsetZ, rotationY = 0) {
  if (!rotationY) {
    return new THREE.Vector3(tilePosition.x + offsetX, offsetY, tilePosition.z + offsetZ);
  }
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const rotatedX = offsetX * cos + offsetZ * sin;
  const rotatedZ = -offsetX * sin + offsetZ * cos;
  return new THREE.Vector3(tilePosition.x + rotatedX, offsetY, tilePosition.z + rotatedZ);
}

/**
 * 既存のEuler(baseX, baseY, baseZ)にrotationYを加えたEulerを返す
 * （パーツ自身の向きを、建物全体の回転に合わせて回すため）。
 */
export function rotatedEuler(rotationY = 0, baseX = 0, baseY = 0, baseZ = 0) {
  return new THREE.Euler(baseX, baseY + rotationY, baseZ);
}

/**
 * ベクトルをY軸周りにrotationYだけ回転させる（applyAxisAngleのラッパー）。
 */
export function rotateVectorY(vector, rotationY) {
  return vector.clone().applyAxisAngle(rotationAxis, rotationY);
}
