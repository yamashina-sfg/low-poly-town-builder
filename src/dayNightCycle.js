import * as THREE from 'three';

const NIGHT_SKY = new THREE.Color(0x0a1128);
const DAY_SKY = new THREE.Color(0x8fd3f4);
const NIGHT_SUN = new THREE.Color(0x8ea3c9);
const DAY_SUN = new THREE.Color(0xfff2e8);
const DAWN_DUSK_SUN = new THREE.Color(0xff9d52); // 朝焼け・夕焼けのオレンジ
const NIGHT_HEMI_SKY = new THREE.Color(0x27314a);
const DAY_HEMI_SKY = new THREE.Color(0xbfe3ff);
const NIGHT_HEMI_GROUND = new THREE.Color(0x1c2a1c);
const DAY_HEMI_GROUND = new THREE.Color(0x4b6b3a);

const tmpColor = new THREE.Color();

/**
 * ゲーム内時刻(dayFraction: 0=深夜,0.25=明け方,0.5=正午,0.75=夕方)から
 * DirectionalLight/HemisphereLightの向き・色・強さと空の色を更新する。
 * 朝・夕はオレンジ、昼は白っぽく、夜は青暗くなる。
 */
export function updateDayNightCycle({ dayFraction, scene, dirLight, hemiLight }) {
  const angle = dayFraction * Math.PI * 2;
  const sunHeight = -Math.cos(angle); // 0時=-1(深夜) 0.25=0(明け方) 0.5=1(正午) 0.75=0(夕方)

  const dayFactor = THREE.MathUtils.clamp((sunHeight + 0.2) / 1.2, 0, 1);
  // 明け方・夕方（sunHeightが0付近）でオレンジみが最大になる
  const warmth = Math.max(0, 1 - Math.abs(sunHeight) * 1.6) * (sunHeight > -0.6 ? 1 : 0);

  dirLight.position.set(Math.cos(angle) * 15, Math.max(sunHeight, 0.05) * 20, 10);
  dirLight.color.copy(tmpColor.copy(NIGHT_SUN).lerp(DAY_SUN, dayFactor)).lerp(DAWN_DUSK_SUN, warmth * 0.7);
  dirLight.intensity = THREE.MathUtils.lerp(0.15, 1.2, dayFactor);

  hemiLight.color.copy(tmpColor.copy(NIGHT_HEMI_SKY).lerp(DAY_HEMI_SKY, dayFactor));
  hemiLight.groundColor.copy(tmpColor.copy(NIGHT_HEMI_GROUND).lerp(DAY_HEMI_GROUND, dayFactor));
  hemiLight.intensity = THREE.MathUtils.lerp(0.25, 1.1, dayFactor);

  scene.background.copy(tmpColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayFactor)).lerp(DAWN_DUSK_SUN, warmth * 0.25);
}
