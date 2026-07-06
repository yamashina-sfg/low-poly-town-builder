import * as THREE from 'three';
import { createCharacter } from '../character.js';
import { playFootstep } from '../ambientAudio.js';
import { getTouchMoveVector } from './touchControls.js';

const MOVE_SPEED = 5; // units / sec
// A/Dキー（および仮想スティックの左右入力）でキャラ自身を直接回転させる
// 角速度。フレームレートに依存せず(delta乗算のみ)、常に一定速度で滑らかに
// 回転する「その場旋回」方式（W/Sは現在向いている方向への前進/後退のみを
// 行い、A/Dの旋回とは独立している）。
const TURN_SPEED = 4.2; // rad / sec（180度を約0.75秒で回りきる速さ）
const FOOTSTEP_INTERVAL = 0.35;

// Z成分は負（キャラの進行方向=forwardの逆側）にすることで、
// カメラが常にキャラの「後方」に位置するようにする。
// （+forward*dist は前方に回り込んでしまい、前進するとキャラがカメラに
// 近づいて見える不具合の原因だった）
export const CAMERA_OFFSET = new THREE.Vector3(0, 4.5, -7);
export const INDOOR_CAMERA_OFFSET = new THREE.Vector3(0, 2.4, -3.2);

const keys = {};
const isPressed = (...codes) => codes.some((code) => keys[code]);

let characterController = null;
let character = null;
let characterFacing = 0;
let cameraRef = null;
const cameraCurrentPosition = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
let footstepTimer = 0;

/**
 * キャラクターを生成してシーンに追加し、カメラ・入力の初期状態を整える。
 */
export function initPlayer(scene, camera, { clothingColor, hatColor } = {}) {
  characterController = createCharacter({ clothingColor, hatColor });
  character = characterController.group;
  character.position.set(0, 0, 0);
  scene.add(character);

  cameraRef = camera;
  cameraCurrentPosition.copy(character.position).add(CAMERA_OFFSET);
  cameraRef.position.copy(cameraCurrentPosition);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // ウィンドウのフォーカスが外れる（alt-tabや他要素のクリック等）と、ブラウザが
  // keyupイベントを配信しないまま既存のkeydown状態だけが残ることがある。
  // これを放置すると、キーを離したはずなのに押されっぱなし判定のまま
  // 回転・移動し続けてしまうため、フォーカスを失った時点で全キーの
  // 押下状態をリセットする。
  function resetAllKeys() {
    Object.keys(keys).forEach((code) => {
      keys[code] = false;
    });
  }
  window.addEventListener('blur', resetAllKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetAllKeys();
  });
}

export function getCharacter() {
  return character;
}

export function getCharacterPosition() {
  return character.position;
}

export function getCharacterFacing() {
  return characterFacing;
}

export function setCharacterPosition(position) {
  character.position.copy(position);
}

export function setCharacterFacing(facing) {
  characterFacing = facing;
  character.rotation.y = facing;
}

export function setIndoorScale(indoor) {
  characterController.group.scale.setScalar(indoor ? 0.7 : 1);
}

export function setClothingColor(hex) {
  characterController.setClothingColor(hex);
}

export function setHatColor(hex) {
  characterController.setHatColor(hex);
}

/**
 * WASD/矢印キーの入力を反映して移動・向き・歩行アニメーション・足音を更新する。
 *
 * 操作方式（その場旋回・キー入力）：W/Sはキャラが「現在向いている方向」への
 * 前進/後退のみを行い、A/Dはキャラ自身をその場で左右に回転させる
 * （進行方向から向きを逆算する方式ではないため、A/Dだけを押したときの
 * 回転がどちらを向いていても常に同じ体感速度になり、カメラも常に
 * characterFacingに追従するため向きがズレない）。
 * @returns {boolean} このフレームで実際に前進/後退していればtrue
 */
export function updateMovementInput(delta) {
  const touch = getTouchMoveVector();

  // A/D（および仮想スティックの左右入力）：一定の角速度でその場旋回する。
  let turnInput = 0;
  if (isPressed('KeyA', 'ArrowLeft')) turnInput -= 1;
  if (isPressed('KeyD', 'ArrowRight')) turnInput += 1;
  turnInput += touch.x;
  turnInput = THREE.MathUtils.clamp(turnInput, -1, 1);

  if (turnInput !== 0) {
    characterFacing += turnInput * TURN_SPEED * delta;
    // 長時間旋回し続けても値が際限なく増え続けないよう -π〜πに正規化する。
    characterFacing = Math.atan2(Math.sin(characterFacing), Math.cos(characterFacing));
    character.rotation.y = characterFacing;
  }

  // W/S（および仮想スティックの前後入力）：現在の向き(characterFacing)へ
  // そのまま前進/後退する。
  let moveInput = 0;
  if (isPressed('KeyW', 'ArrowUp')) moveInput += 1;
  if (isPressed('KeyS', 'ArrowDown')) moveInput -= 1;
  moveInput -= touch.z; // スティックを上へ倒す(dyが負)ほど前進になるよう符号を反転
  moveInput = THREE.MathUtils.clamp(moveInput, -1, 1);

  const isMoving = Math.abs(moveInput) > 0.0001;
  if (isMoving) {
    moveDirection.set(Math.sin(characterFacing), 0, Math.cos(characterFacing));
    character.position.addScaledVector(moveDirection, MOVE_SPEED * moveInput * delta);
  }
  characterController.updateWalkAnimation(isMoving, delta);

  if (isMoving) {
    footstepTimer += delta;
    if (footstepTimer >= FOOTSTEP_INTERVAL) {
      playFootstep();
      footstepTimer = 0;
    }
  } else {
    footstepTimer = 0;
  }

  return isMoving;
}

/**
 * キャラの向きに応じた斜め後ろ上空の位置へ、カメラを即座に配置する
 * （室内では近め）。characterFacingは既にA/D入力で毎フレーム正しい値に
 * 更新されているため、ここで指数スムージングによる遅延を挟むと、
 * 旋回中にカメラの向きがキャラの向きに対して大きく（実測で30〜45度ほど）
 * 遅れて「向きがズレて見える」原因になっていた。カメラはキャラの向きに
 * 常に完全追従させ、テレポート時のスナップ（後方互換のため関数として残す）
 * と全く同じ計算にする。
 */
function positionCameraBehindCharacter(indoorMode) {
  const offset = indoorMode ? INDOOR_CAMERA_OFFSET : CAMERA_OFFSET;
  const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), characterFacing);
  cameraCurrentPosition.copy(character.position).add(rotatedOffset);
  cameraRef.position.copy(cameraCurrentPosition);
  cameraRef.lookAt(character.position.clone().add(new THREE.Vector3(0, 1, 0)));
}

/**
 * テレポート（入室・退室）直後にカメラが古い位置から追従してしまい
 * 何も見えない空白フレームが出ないよう、カメラを即座にキャラの背後へスナップする。
 */
export function snapCameraToCharacter(indoorMode) {
  positionCameraBehindCharacter(indoorMode);
}

/**
 * カメラをキャラの向きに追従させる（毎フレーム呼ぶ）。
 */
export function updateCameraFollow(indoorMode) {
  positionCameraBehindCharacter(indoorMode);
}
