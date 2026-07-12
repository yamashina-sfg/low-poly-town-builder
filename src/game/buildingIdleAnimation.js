// フェーズ27：稼働中の建物にわずかな継続アニメーションを付ける。
// - 役場：頂上の旗がゆっくりはためく（instancing.jsのsetInstanceTransformで
//   毎フレーム回転させる。老朽化して非稼働になっている間は止める）
// - 畑・伐採小屋（生産施設）：働いている雰囲気の土煙パーティクルを時々出す
// - お店：営業中であることが分かる小さなきらめきを時々出す
// economySystem.jsのupdateEconomySystemは間引かれたティックしか持たないため、
// 滑らかな旗の揺れにはここで新しく毎フレーム（に近い頻度）呼ぶ経路を用意する。
import * as THREE from 'three';
import { forEachLoadedTile } from '../chunkManager.js';
import { setInstanceTransform } from '../instancing.js';
import { spawnParticleBurst } from '../particles.js';
import { isBuildingFunctional } from './economySystem.js';
import { PRODUCTION_TYPES } from './world.js';

// 旗の揺れは滑らかさが欲しいので毎フレームに近い頻度、パーティクルの発生
// 判定はもっと軽くていいので、全体のチェック間隔はこの値で揃える。
const IDLE_RECHECK_INTERVAL = 0.15;
const FLAG_SWAY_SPEED = 2.5;
const FLAG_SWAY_AMPLITUDE = 0.4;
const EFFECT_INTERVAL_MIN = 4;
const EFFECT_INTERVAL_MAX = 7;

let sceneRef = null;
let recheckTimer = 0;
const nextEffectTime = new WeakMap(); // tile -> 次にパーティクルを出してよいelapsedTime

export function initBuildingIdleAnimation(scene) {
  sceneRef = scene;
}

function animateTownHallFlag(tile, elapsedTime) {
  const animatedParts = tile.userData.object?.animatedParts;
  if (!animatedParts) return;
  // 老朽化した役場の旗は揺れを止め、垂れ下がったままにする。
  const swaying = isBuildingFunctional(tile);
  animatedParts.forEach(({ part, type, basePosition, baseRotation, baseScale }) => {
    if (type !== 'flag') return;
    const sway = swaying
      ? Math.sin(elapsedTime * FLAG_SWAY_SPEED + tile.userData.globalX) * FLAG_SWAY_AMPLITUDE
      : 0;
    const rotation = new THREE.Euler(baseRotation.x, baseRotation.y + sway, baseRotation.z);
    setInstanceTransform(part, basePosition, rotation, baseScale);
  });
}

function scheduleNextEffect(tile, elapsedTime) {
  nextEffectTime.set(
    tile,
    elapsedTime + EFFECT_INTERVAL_MIN + Math.random() * (EFFECT_INTERVAL_MAX - EFFECT_INTERVAL_MIN),
  );
}

function maybeSpawnEffect(tile, elapsedTime, spawnFn) {
  if (!isBuildingFunctional(tile)) return;
  const next = nextEffectTime.get(tile);
  if (next === undefined) {
    // 初回は建物ごとにばらけるよう、少しランダムな遅延を挟んでから開始する。
    scheduleNextEffect(tile, elapsedTime - Math.random() * EFFECT_INTERVAL_MIN);
    return;
  }
  if (elapsedTime < next) return;
  scheduleNextEffect(tile, elapsedTime);
  spawnFn(tile);
}

function spawnWorkDust(tile) {
  if (!sceneRef) return;
  spawnParticleBurst(sceneRef, {
    position: tile.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
    count: 3,
    color: 0xd8d2c2,
    size: 0.12,
    speed: 0.5,
    life: 1.4,
    gravity: -0.2,
  });
}

function spawnShopSparkle(tile) {
  if (!sceneRef) return;
  spawnParticleBurst(sceneRef, {
    position: tile.position.clone().add(new THREE.Vector3(0, 1.3, 0.5)),
    count: 1,
    color: 0xfff4c2,
    size: 0.09,
    speed: 0.3,
    life: 0.8,
    gravity: 0,
  });
}

/**
 * main.jsのメインループから毎フレーム呼ぶ。内部で間引くため、呼び出し側は
 * 頻度を気にしなくてよい。
 */
export function updateBuildingIdleAnimation(delta, elapsedTime) {
  recheckTimer += delta;
  if (recheckTimer < IDLE_RECHECK_INTERVAL) return;
  recheckTimer = 0;

  forEachLoadedTile((tile) => {
    const type = tile.userData.tileType;
    if (type === 'townHall') {
      animateTownHallFlag(tile, elapsedTime);
    } else if (PRODUCTION_TYPES.has(type)) {
      maybeSpawnEffect(tile, elapsedTime, spawnWorkDust);
    } else if (type === 'shop') {
      maybeSpawnEffect(tile, elapsedTime, spawnShopSparkle);
    }
  });
}
