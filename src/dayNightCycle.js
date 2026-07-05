import * as THREE from 'three';

const CYCLE_DURATION = 90; // 1日のサイクルにかかる秒数

const NIGHT_SKY = new THREE.Color(0x0a1128);
const DAY_SKY = new THREE.Color(0x8fd3f4);
const NIGHT_SUN = new THREE.Color(0x8ea3c9);
const DAY_SUN = new THREE.Color(0xfff2d6);
const NIGHT_HEMI_SKY = new THREE.Color(0x27314a);
const DAY_HEMI_SKY = new THREE.Color(0xbfe3ff);
const NIGHT_HEMI_GROUND = new THREE.Color(0x1c2a1c);
const DAY_HEMI_GROUND = new THREE.Color(0x4b6b3a);

const tmpColor = new THREE.Color();

/**
 * 経過時間からDirectionalLightの向き・色・強さと空の色を更新し、
 * ゆっくりとした昼夜サイクルを表現する。
 */
export function updateDayNightCycle({ elapsed, scene, dirLight, hemiLight }) {
  const t = (elapsed % CYCLE_DURATION) / CYCLE_DURATION;
  // 起動直後が正午付近になるよう位相をずらす
  const angle = t * Math.PI * 2 + Math.PI / 2;
  const sunHeight = Math.sin(angle); // -1(深夜) 〜 1(正午)

  const dayFactor = THREE.MathUtils.clamp((sunHeight + 0.2) / 1.2, 0, 1);

  dirLight.position.set(Math.cos(angle) * 15, Math.max(sunHeight, 0.05) * 20, 10);
  dirLight.color.copy(tmpColor.copy(NIGHT_SUN).lerp(DAY_SUN, dayFactor));
  dirLight.intensity = THREE.MathUtils.lerp(0.15, 1.2, dayFactor);

  hemiLight.color.copy(tmpColor.copy(NIGHT_HEMI_SKY).lerp(DAY_HEMI_SKY, dayFactor));
  hemiLight.groundColor.copy(tmpColor.copy(NIGHT_HEMI_GROUND).lerp(DAY_HEMI_GROUND, dayFactor));
  hemiLight.intensity = THREE.MathUtils.lerp(0.25, 1.1, dayFactor);

  scene.background.copy(tmpColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayFactor));
}
