// 建築プレビュー（フェーズ21：建築・編集UXの強化）。
// 建築メニューで項目を選ぶと、実際のジオメトリではなく簡略化した半透明の
// 「footprint」（設置予定の大きさを示す箱＋向きを示す小さな前面マーカー）を
// マウス位置（＝ホバー中のタイル）に追従表示する。Rキーで90度単位に回転でき、
// 他の建物と重なる・資金が足りない場合は赤くハイライトする。
import * as THREE from 'three';
import { TILE_SIZE } from '../terrain.js';

// 各種類のおおよその大きさ（実際のジェネレーターの寸法に合わせた目安）。
// 一致していなくても実用上の問題はない（あくまで設置予定地の目安を示す表示）。
const PREVIEW_FOOTPRINTS = {
  house: { width: 1.4, height: 1.6, depth: 1.4 },
  shop: { width: 1.3, height: 1.6, depth: 1.3 },
  well: { width: 0.7, height: 1.3, depth: 0.7 },
  warehouse: { width: 1.8, height: 1.1, depth: 1.5 },
  windmill: { width: 0.6, height: 2.4, depth: 0.6 },
  farm: { width: 1.7, height: 0.3, depth: 1.7 },
  loggingHut: { width: 1.4, height: 1.0, depth: 1.4 },
  fence: { width: 1.8, height: 0.5, depth: 0.3 },
  streetlamp: { width: 0.3, height: 1.7, depth: 0.3 },
  bench: { width: 1.2, height: 0.6, depth: 0.5 },
  flowerbed: { width: 1.5, height: 0.2, depth: 1.5 },
  signpost: { width: 0.5, height: 1.0, depth: 0.3 },
  statue: { width: 0.7, height: 1.3, depth: 0.7 },
  bed: { width: 1.2, height: 0.4, depth: 0.7 },
  table: { width: 1.0, height: 0.5, depth: 0.7 },
  chair: { width: 0.4, height: 0.6, depth: 0.4 },
  fireplace: { width: 0.9, height: 1.4, depth: 0.5 },
  tree: { width: 0.9, height: 1.3, depth: 0.9 },
  road: { width: TILE_SIZE, height: 0.05, depth: TILE_SIZE },
  dirtRoad: { width: TILE_SIZE, height: 0.05, depth: TILE_SIZE },
  cobblestone: { width: TILE_SIZE, height: 0.05, depth: TILE_SIZE },
  bridge: { width: TILE_SIZE, height: 0.3, depth: TILE_SIZE },
  water: { width: TILE_SIZE, height: 0.05, depth: TILE_SIZE },
  clear: { width: TILE_SIZE, height: 0.05, depth: TILE_SIZE },
};
const DEFAULT_FOOTPRINT = { width: 1.0, height: 1.0, depth: 1.0 };

const VALID_COLOR = 0x6fd66f;
const INVALID_COLOR = 0xd6534c;
const ROTATION_STEP_COUNT = 4; // 90度単位で4方向

/**
 * type種類のプレビュー footprint（幅・高さ・奥行き）を返す純粋関数。
 */
export function getFootprintForType(type) {
  return PREVIEW_FOOTPRINTS[type] ?? DEFAULT_FOOTPRINT;
}

/**
 * 現在の回転ステップ(0〜3)からラジアン角を求める純粋関数。
 */
export function computeRotationYForSteps(steps) {
  return (((steps % ROTATION_STEP_COUNT) + ROTATION_STEP_COUNT) % ROTATION_STEP_COUNT) * (Math.PI / 2);
}

/**
 * Rキーを押したときの次の回転ステップ(0〜3)を返す純粋関数。
 */
export function nextRotationSteps(currentSteps) {
  return (currentSteps + 1) % ROTATION_STEP_COUNT;
}

let previewGroup = null;
let footprintMesh = null;
let frontMarkerMesh = null;
let previewType = null;
let rotationSteps = 0;

/**
 * プレビュー用のシーンオブジェクトを1度だけ生成する。
 */
export function initBuildPreview(scene) {
  previewGroup = new THREE.Group();
  previewGroup.visible = false;

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  boxGeometry.translate(0, 0.5, 0); // 底面ピボット（他の単位ジオメトリと同じ規約）
  const material = new THREE.MeshStandardMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    flatShading: true,
  });
  footprintMesh = new THREE.Mesh(boxGeometry, material);
  previewGroup.add(footprintMesh);

  // 前面（+Z、character.jsのhatBrim等と同じ向きの規約）に小さなマーカーを
  // 付け、回転させたときにどちら向きかが一目で分かるようにする。
  const markerGeometry = new THREE.BoxGeometry(0.3, 0.12, 0.12);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    flatShading: true,
  });
  frontMarkerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
  previewGroup.add(frontMarkerMesh);

  scene.add(previewGroup);
}

function applyFootprint() {
  const fp = getFootprintForType(previewType);
  footprintMesh.scale.set(fp.width, fp.height, fp.depth);
  frontMarkerMesh.position.set(0, fp.height / 2, fp.depth / 2 + 0.1);
}

/**
 * 建築メニューで種類を選んだ時点でプレビューを開始する。
 */
export function startPreview(type) {
  previewType = type;
  rotationSteps = 0;
  previewGroup.visible = true;
  applyFootprint();
  previewGroup.rotation.y = 0;
}

/**
 * Esc・右クリック・設置確定などでプレビューを終了する。
 */
export function stopPreview() {
  previewType = null;
  if (previewGroup) previewGroup.visible = false;
}

export function isPreviewActive() {
  return previewType !== null;
}

export function getPreviewType() {
  return previewType;
}

export function getPreviewRotationY() {
  return computeRotationYForSteps(rotationSteps);
}

export function getRotationSteps() {
  return rotationSteps;
}

/**
 * 回転ステップを直接指定する（「移動」開始時に、元の向きを引き継ぐために使う）。
 */
export function setRotationSteps(steps) {
  rotationSteps = ((steps % ROTATION_STEP_COUNT) + ROTATION_STEP_COUNT) % ROTATION_STEP_COUNT;
  if (previewGroup) previewGroup.rotation.y = getPreviewRotationY();
}

/**
 * Rキー押下時に呼ぶ。90度単位でプレビューを回転させる。
 */
export function rotatePreview() {
  if (!isPreviewActive()) return;
  rotationSteps = nextRotationSteps(rotationSteps);
  previewGroup.rotation.y = getPreviewRotationY();
}

/**
 * ホバー中のタイル位置にプレビューを追従させる（グリッド吸着＝タイル中心への
 * スナップは、呼び出し側がタイルの中心座標を渡すことで実現される）。
 */
export function updatePreviewPosition(position) {
  if (!previewGroup) return;
  previewGroup.position.set(position.x, 0, position.z);
}

/**
 * 重なり・資金不足などにより設置不可の場合は赤く、設置可能なら緑にする。
 */
export function setPreviewValid(isValid) {
  const color = isValid ? VALID_COLOR : INVALID_COLOR;
  footprintMesh.material.color.set(color);
}
