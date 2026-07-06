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
