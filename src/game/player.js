import * as THREE from 'three';
import { createCharacter } from '../character.js';
import { playFootstep } from '../ambientAudio.js';
import { getTouchMoveVector } from './touchControls.js';

const MOVE_SPEED = 5; // units / sec
const TURN_SMOOTHING = 10; // 大きいほど素早く向きを変える
const CAMERA_SMOOTHING = 4; // 大きいほど素早くカメラが追従する
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
const desiredCameraPosition = new THREE.Vector3();
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
 * @returns {boolean} このフレームで移動していればtrue
 */
export function updateMovementInput(delta) {
  moveDirection.set(0, 0, 0);
  if (isPressed('KeyW', 'ArrowUp')) moveDirection.z -= 1;
  if (isPressed('KeyS', 'ArrowDown')) moveDirection.z += 1;
  if (isPressed('KeyA', 'ArrowLeft')) moveDirection.x -= 1;
  if (isPressed('KeyD', 'ArrowRight')) moveDirection.x += 1;

  // タッチデバイスの仮想スティック入力をキーボードに合成する
  // （キーボード入力がなければそのまま仮想スティックの向きが使われる）。
  const touch = getTouchMoveVector();
  moveDirection.x += touch.x;
  moveDirection.z += touch.z;

  const isMoving = moveDirection.lengthSq() > 0.0001;
  if (isMoving) {
    moveDirection.normalize();
    character.position.addScaledVector(moveDirection, MOVE_SPEED * delta);

    // 移動方向を向くようにキャラを回転（滑らかに補間）
    const targetFacing = Math.atan2(moveDirection.x, moveDirection.z);
    let angleDiff = targetFacing - characterFacing;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    characterFacing += angleDiff * Math.min(1, TURN_SMOOTHING * delta);
    character.rotation.y = characterFacing;
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
 * テレポート（入室・退室）直後にカメラが古い位置から緩やかに追従してしまい
 * 何も見えない空白フレームが出ないよう、カメラを即座にキャラの背後へスナップする。
 */
export function snapCameraToCharacter(indoorMode) {
  const offset = indoorMode ? INDOOR_CAMERA_OFFSET : CAMERA_OFFSET;
  const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), characterFacing);
  cameraCurrentPosition.copy(character.position).add(rotatedOffset);
  cameraRef.position.copy(cameraCurrentPosition);
  cameraRef.lookAt(character.position.clone().add(new THREE.Vector3(0, 1, 0)));
}

/**
 * カメラをキャラの向きに応じて斜め後ろ上空に滑らかに追従させる（室内では近め）。
 */
export function updateCameraFollow(indoorMode, delta) {
  const activeCameraOffset = indoorMode ? INDOOR_CAMERA_OFFSET : CAMERA_OFFSET;
  const rotatedOffset = activeCameraOffset
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), characterFacing);
  desiredCameraPosition.copy(character.position).add(rotatedOffset);
  cameraCurrentPosition.lerp(desiredCameraPosition, 1 - Math.exp(-CAMERA_SMOOTHING * delta));
  cameraRef.position.copy(cameraCurrentPosition);

  const lookTarget = character.position.clone().add(new THREE.Vector3(0, 1, 0));
  cameraRef.lookAt(lookTarget);
}
