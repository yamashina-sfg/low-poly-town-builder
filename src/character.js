import * as THREE from 'three';

const SKIN_COLOR = 0xe8b98d;

function createLimb(material, length, radius) {
  // 関節（肩・股関節）を原点としたピボットグループ。
  // メッシュ自体はピボットから半分下にずらして配置し、
  // pivot.rotation.xを変えるだけで振り子のように振れる。
  const pivot = new THREE.Group();
  const geometry = new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * ローポリな人型キャラクターを生成する。
 * 服と帽子の色は後から setClothingColor / setHatColor で変更できる。
 */
export function createCharacter({ clothingColor = 0x3b6ea5, hatColor = 0xb5533c } = {}) {
  const group = new THREE.Group();

  const clothingMaterial = new THREE.MeshStandardMaterial({
    color: clothingColor,
    flatShading: true,
  });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    flatShading: true,
  });
  const hatMaterial = new THREE.MeshStandardMaterial({
    color: hatColor,
    flatShading: true,
  });

  const bodyGeometry = new THREE.CapsuleGeometry(0.32, 0.55, 4, 8);
  const body = new THREE.Mesh(bodyGeometry, clothingMaterial);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const headGeometry = new THREE.SphereGeometry(0.32, 8, 6);
  const head = new THREE.Mesh(headGeometry, skinMaterial);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);

  const hatGeometry = new THREE.ConeGeometry(0.35, 0.36, 6);
  const hat = new THREE.Mesh(hatGeometry, hatMaterial);
  hat.position.y = 2.06;
  hat.castShadow = true;
  group.add(hat);

  // どちらを向いているか一目で分かるよう、帽子のつばを前方(+Z)に伸ばし、
  // 胸に小さなボタンを付ける（+Zはcharacter.rotation.y=facingとしたときに
  // 実際の進行方向を向くローカル軸。詳細はplayer.jsのカメラ回帰テスト参照）。
  const brimGeometry = new THREE.BoxGeometry(0.42, 0.05, 0.2);
  const hatBrim = new THREE.Mesh(brimGeometry, hatMaterial);
  hatBrim.name = 'hatBrim';
  hatBrim.position.set(0, 1.93, 0.22);
  hatBrim.castShadow = true;
  group.add(hatBrim);

  const buttonGeometry = new THREE.SphereGeometry(0.05, 6, 6);
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e9d8, flatShading: true });
  const chestButton = new THREE.Mesh(buttonGeometry, buttonMaterial);
  chestButton.name = 'chestButton';
  chestButton.position.set(0, 1.15, 0.3);
  chestButton.castShadow = true;
  group.add(chestButton);

  const armLength = 0.58;
  const legLength = 0.75;

  const leftArm = createLimb(skinMaterial, armLength, 0.11);
  leftArm.position.set(0.38, 1.34, 0);
  group.add(leftArm);

  const rightArm = createLimb(skinMaterial, armLength, 0.11);
  rightArm.position.set(-0.38, 1.34, 0);
  group.add(rightArm);

  const leftLeg = createLimb(clothingMaterial, legLength, 0.13);
  leftLeg.position.set(0.16, 0.75, 0);
  group.add(leftLeg);

  const rightLeg = createLimb(clothingMaterial, legLength, 0.13);
  rightLeg.position.set(-0.16, 0.75, 0);
  group.add(rightLeg);

  let walkTime = 0;

  function updateWalkAnimation(isMoving, delta) {
    if (isMoving) {
      walkTime += delta * 8;
    }
    const amplitude = isMoving ? 0.6 : 0;
    const swing = Math.sin(walkTime) * amplitude;
    leftArm.rotation.x = -swing;
    rightArm.rotation.x = swing;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
  }

  function setClothingColor(hex) {
    clothingMaterial.color.set(hex);
  }

  function setHatColor(hex) {
    hatMaterial.color.set(hex);
  }

  return { group, updateWalkAnimation, setClothingColor, setHatColor };
}
