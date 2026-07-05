import * as THREE from 'three';
import { createTerrain, setTileHighlighted, GROUND_SIZE } from './terrain.js';
import { showBuildMenu, hideBuildMenu } from './buildMenu.js';
import { generateBuilding, generateTree } from './generators.js';

// ------------------------------------------------------------------
// シーン基本セットアップ
// ------------------------------------------------------------------
const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3f4); // 水色の空

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------
// ライト（低ポリらしい陰影）
// ------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x4b6b3a, 1.1);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff2d6, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ------------------------------------------------------------------
// 地面（10x10のタイルグリッド、flat shadingの緑）
// ------------------------------------------------------------------
const terrain = createTerrain();
scene.add(terrain);

// ------------------------------------------------------------------
// キャラクター（カプセル＋球のローポリ人型）
// ------------------------------------------------------------------
const character = new THREE.Group();

const bodyGeometry = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x3b6ea5,
  flatShading: true,
});
const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
body.position.y = 0.9;
character.add(body);

const headGeometry = new THREE.SphereGeometry(0.32, 8, 6);
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8b98d,
  flatShading: true,
});
const head = new THREE.Mesh(headGeometry, headMaterial);
head.position.y = 1.65;
character.add(head);

character.position.set(0, 0, 0);
scene.add(character);

// キャラの向き（Y軸回転）を角度で保持し、毎フレーム滑らかに補間する
let characterFacing = 0;

// ------------------------------------------------------------------
// 入力
// ------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

const isPressed = (...codes) => codes.some((code) => keys[code]);

// ------------------------------------------------------------------
// カメラ（三人称・キャラ追従）
// ------------------------------------------------------------------
const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, 7);
const cameraCurrentPosition = new THREE.Vector3()
  .copy(character.position)
  .add(CAMERA_OFFSET);
camera.position.copy(cameraCurrentPosition);

// ------------------------------------------------------------------
// 建築システム（レイキャストでタイル選択 → ホバー表示 → クリックで建築メニュー）
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredTile = null;

// 道路・水は未実装のためダミー表示（フェーズ4で置き換え予定）
const DUMMY_COLORS = {
  road: 0x777777,
  water: 0x3a7ca5,
};

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedTile(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(terrain.children, false);
  return intersects.length > 0 ? intersects[0].object : null;
}

function clearTileObject(tile) {
  if (!tile.userData.object) return;
  const object = tile.userData.object;
  scene.remove(object);
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  tile.userData.object = null;
}

/**
 * 選択された種類に応じたオブジェクトをタイル中心に配置する。
 * 家・木はプロシージャル生成（座標から決定論的なseedを算出）、
 * 道路・水はフェーズ4までダミー表示。
 */
function buildOnTile(tile, type) {
  clearTileObject(tile);

  if (type === 'clear') {
    tile.userData.tileType = 'grass';
    return;
  }

  const seedBase = tile.userData.gridX * 1000 + tile.userData.gridY;
  let object;

  if (type === 'house') {
    object = generateBuilding(seedBase, type);
  } else if (type === 'tree') {
    object = generateTree(seedBase + 500000);
  } else {
    const geometry = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const material = new THREE.MeshStandardMaterial({
      color: DUMMY_COLORS[type] ?? 0xffffff,
      flatShading: true,
    });
    object = new THREE.Mesh(geometry, material);
    object.position.y = 0.7;
  }

  object.position.x = tile.position.x;
  object.position.z = tile.position.z;
  scene.add(object);

  tile.userData.object = object;
  tile.userData.tileType = type;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const tile = getIntersectedTile(event);
  if (tile !== hoveredTile) {
    if (hoveredTile) setTileHighlighted(hoveredTile, false);
    hoveredTile = tile;
    if (hoveredTile) setTileHighlighted(hoveredTile, true);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (hoveredTile) setTileHighlighted(hoveredTile, false);
  hoveredTile = null;
});

renderer.domElement.addEventListener('click', (event) => {
  const tile = getIntersectedTile(event);
  if (!tile) {
    hideBuildMenu();
    return;
  }
  showBuildMenu(event.clientX, event.clientY, (type) => {
    buildOnTile(tile, type);
  });
});

// ------------------------------------------------------------------
// メインループ
// ------------------------------------------------------------------
const MOVE_SPEED = 5; // units / sec
const TURN_SMOOTHING = 10; // 大きいほど素早く向きを変える
const CAMERA_SMOOTHING = 4; // 大きいほど素早くカメラが追従する

const clock = new THREE.Clock();
const moveDirection = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);

  // 入力から移動方向（ワールド座標系）を決定
  moveDirection.set(0, 0, 0);
  if (isPressed('KeyW', 'ArrowUp')) moveDirection.z -= 1;
  if (isPressed('KeyS', 'ArrowDown')) moveDirection.z += 1;
  if (isPressed('KeyA', 'ArrowLeft')) moveDirection.x -= 1;
  if (isPressed('KeyD', 'ArrowRight')) moveDirection.x += 1;

  if (moveDirection.lengthSq() > 0) {
    moveDirection.normalize();

    character.position.addScaledVector(moveDirection, MOVE_SPEED * delta);

    // 移動方向を向くようにキャラを回転（滑らかに補間）
    const targetFacing = Math.atan2(moveDirection.x, moveDirection.z);
    let angleDiff = targetFacing - characterFacing;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    characterFacing += angleDiff * Math.min(1, TURN_SMOOTHING * delta);
    character.rotation.y = characterFacing;
  }

  // 地面の範囲内にキャラを収める
  const half = GROUND_SIZE / 2 - 0.5;
  character.position.x = THREE.MathUtils.clamp(character.position.x, -half, half);
  character.position.z = THREE.MathUtils.clamp(character.position.z, -half, half);

  // カメラをキャラの向きに応じて斜め後ろ上空に滑らかに追従させる
  const rotatedOffset = CAMERA_OFFSET.clone().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    characterFacing
  );
  desiredCameraPosition.copy(character.position).add(rotatedOffset);
  cameraCurrentPosition.lerp(
    desiredCameraPosition,
    1 - Math.exp(-CAMERA_SMOOTHING * delta)
  );
  camera.position.copy(cameraCurrentPosition);

  const lookTarget = character.position.clone().add(new THREE.Vector3(0, 1, 0));
  camera.lookAt(lookTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
