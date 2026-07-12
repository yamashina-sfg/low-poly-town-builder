import * as THREE from 'three';

const NIGHT_SKY = new THREE.Color(0x0a1128);
const DAY_SKY = new THREE.Color(0x8fd3f4);
const NIGHT_SUN = new THREE.Color(0x8ea3c9);
const DAY_SUN = new THREE.Color(0xfff2e8);
const DAWN_DUSK_SUN = new THREE.Color(0xff9d52); // 朝焼け・夕焼けのオレンジ
// フェーズ27：朝焼け・夕焼けをよりドラマチックにするための、彩度の高い
// マゼンタ寄りの差し色（warmthが最大に近いピーク付近だけ薄く混ぜる）。
const DAWN_DUSK_ACCENT = new THREE.Color(0xff5c7a);
const NIGHT_HEMI_SKY = new THREE.Color(0x27314a);
const DAY_HEMI_SKY = new THREE.Color(0xbfe3ff);
const NIGHT_HEMI_GROUND = new THREE.Color(0x1c2a1c);
const DAY_HEMI_GROUND = new THREE.Color(0x4b6b3a);

const tmpColor = new THREE.Color();

/**
 * ゲーム内時刻(dayFraction: 0=深夜,0.25=明け方,0.5=正午,0.75=夕方)から
 * DirectionalLight/HemisphereLightの向き・色・強さと空の色を更新する。
 * 朝・夕はオレンジ、昼は白っぽく、夜は青暗くなる。
 * targetPosition（通常はキャラクターの位置）が渡された場合、影を落とす
 * DirectionalLightとそのシャドウカメラの視錐台をその位置に追従させる
 * （ワールドが無限に広いため、視錐台をキャラ周辺だけに絞るための追従）。
 */
export function updateDayNightCycle({ dayFraction, scene, dirLight, hemiLight, targetPosition }) {
  const angle = dayFraction * Math.PI * 2;
  const sunHeight = -Math.cos(angle); // 0時=-1(深夜) 0.25=0(明け方) 0.5=1(正午) 0.75=0(夕方)

  const dayFactor = THREE.MathUtils.clamp((sunHeight + 0.2) / 1.2, 0, 1);
  // 明け方・夕方（sunHeightが0付近）でオレンジみが最大になる
  const warmth = Math.max(0, 1 - Math.abs(sunHeight) * 1.6) * (sunHeight > -0.6 ? 1 : 0);

  const originX = targetPosition ? targetPosition.x : 0;
  const originY = targetPosition ? targetPosition.y : 0;
  const originZ = targetPosition ? targetPosition.z : 0;
  dirLight.position.set(
    originX + Math.cos(angle) * 15,
    originY + Math.max(sunHeight, 0.05) * 20,
    originZ + 10,
  );
  if (targetPosition) {
    dirLight.target.position.copy(targetPosition);
  }
  // フェーズ27：朝焼け・夕焼けをよりドラマチックに見せるため、warmthの混合を
  // 強め、ピーク付近（warmth > 0.5）ではさらに彩度の高い差し色も薄く重ねる。
  // 夜⇔昼の基本的な明るさ・色温度の遷移（dayFactor基準）自体は変えないため、
  // フェーズ23のNPC就寝判定（gameTime.jsの時刻・populace.jsのSLEEP_START_HOUR/
  // WAKE_HOUR）には一切影響しない——あくまで見た目の演出強化にとどめる。
  dirLight.color.copy(tmpColor.copy(NIGHT_SUN).lerp(DAY_SUN, dayFactor)).lerp(DAWN_DUSK_SUN, warmth * 0.85);
  if (warmth > 0.5) {
    dirLight.color.lerp(DAWN_DUSK_ACCENT, (warmth - 0.5) * 0.6);
  }
  dirLight.intensity = THREE.MathUtils.lerp(0.15, 1.2, dayFactor) + warmth * 0.25;

  hemiLight.color.copy(tmpColor.copy(NIGHT_HEMI_SKY).lerp(DAY_HEMI_SKY, dayFactor));
  hemiLight.groundColor.copy(tmpColor.copy(NIGHT_HEMI_GROUND).lerp(DAY_HEMI_GROUND, dayFactor));
  hemiLight.intensity = THREE.MathUtils.lerp(0.25, 1.1, dayFactor);

  scene.background.copy(tmpColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayFactor)).lerp(DAWN_DUSK_SUN, warmth * 0.45);
  if (warmth > 0.5) {
    scene.background.lerp(DAWN_DUSK_ACCENT, (warmth - 0.5) * 0.35);
  }
}
