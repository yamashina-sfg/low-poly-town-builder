import * as THREE from 'three';
import { createNPC } from '../npc.js';
import { createBird, createDog } from '../creatures.js';
import { pushEntitiesApart } from '../collision.js';
import {
  resolveOutdoorCollision,
  getHouseTiles,
  getShopTiles,
  isConnectedToRoad,
  getGroundHeightAt,
  DECORATION_TYPES,
} from './world.js';
import { getGameTime } from '../gameTime.js';
import { findRoadPath } from '../road.js';
import { getGlobalTile, worldToGlobalTileCoords } from '../chunkManager.js';
import { showStatusMessage } from './statusMessage.js';

const NPC_CLOTHING_COLORS = [
  0xc94c4c, 0x4c7ac9, 0xc9a94c, 0x4cae7a, 0x8a5fd9, 0xe07a9a, 0x4cc9c0, 0xd97f2e, 0x7a9a3f, 0xa84ca0,
];
const NPC_HAT_COLORS = [0x5c5c5c, 0x7a4a3a, 0x3f6b3a, 0x455a64, 0x8a3f5c, 0x3f5c8a];
const NPC_COLLISION_RADIUS = 0.35;
const DOG_COLLISION_RADIUS = 0.22;
const NPC_COUNT = 6;
const BIRD_COUNT = 3;
const DOG_COUNT = 2;
const INITIAL_SATISFACTION = 50; // 中立（0〜100の中間）から始める

let npcs = [];
let birds = [];
let dogs = [];
let sceneRef = null;
let npcSpawnCounter = 0; // 新規住民の服/帽子の色をローテーションするためだけのカウンター

/**
 * グループ内の全メッシュのgeometry/materialを破棄する。NPCはInstancedMesh
 * ではなく専用メッシュ（character.js）を使っているため、移住でシーンから
 * 取り除く際に明示的に解放しないとメモリリークになる。
 */
function disposeCharacterGroup(group) {
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}

/**
 * NPCを1体生成してシーン・npcs配列に追加する共通ヘルパー。
 * 初期配置（initPopulace）・移住による人口増加（maybeGrowPopulation）・
 * セーブデータからの復元（restorePopulace）のいずれからも使う。
 */
function spawnNpc({
  homeX = 0,
  homeZ = 0,
  clothingColor,
  hatColor,
  radius = 4 + Math.random() * 2,
  speed = 1 + Math.random() * 0.6,
  satisfaction = INITIAL_SATISFACTION,
} = {}) {
  const colorIndex = npcSpawnCounter;
  npcSpawnCounter += 1;
  const npc = createNPC({
    homeX,
    homeZ,
    clothingColor: clothingColor ?? NPC_CLOTHING_COLORS[colorIndex % NPC_CLOTHING_COLORS.length],
    hatColor: hatColor ?? NPC_HAT_COLORS[colorIndex % NPC_HAT_COLORS.length],
    radius,
    speed,
  });
  // フェーズ22：家・勤務先への通勤状態（住居/お店が揃うまではnullのままで、
  // 既存の徘徊挙動に一切影響しない）。
  npc.commute = {
    homeTile: null,
    workTile: null,
    location: 'home', // 'home' | 'work' | 'traveling'
    pendingLocation: null,
    path: null,
    pathIndex: 0,
  };
  // フェーズ23：満足度（0〜100）と、セーブ復元用に服/帽子の色を覚えておく。
  npc.satisfaction = satisfaction;
  npc.lowSatisfactionStreak = 0; // 満足度が低い状態が続いている秒数
  npc.clothingColor = clothingColor ?? NPC_CLOTHING_COLORS[colorIndex % NPC_CLOTHING_COLORS.length];
  npc.hatColor = hatColor ?? NPC_HAT_COLORS[colorIndex % NPC_HAT_COLORS.length];
  // フェーズ27：満足度が高い/低いゾーンに入った瞬間だけ頭上へアイコンを出すための状態。
  npc.moodZone = 'neutral'; // 'neutral' | 'happy' | 'sad'
  npc.moodIcon = null;

  sceneRef.add(npc.group);
  npcs.push(npc);
  return npc;
}

function spawnDefaultNpcs() {
  for (let i = 0; i < NPC_COUNT; i += 1) {
    const angle = (i / NPC_COUNT) * Math.PI * 2;
    const homeDistance = 8 + Math.random() * 10;
    spawnNpc({
      homeX: Math.cos(angle) * homeDistance,
      homeZ: Math.sin(angle) * homeDistance,
      clothingColor: NPC_CLOTHING_COLORS[i % NPC_CLOTHING_COLORS.length],
      hatColor: NPC_HAT_COLORS[i % NPC_HAT_COLORS.length],
      radius: 4 + Math.random() * 2,
      speed: 1 + Math.random() * 0.6,
    });
  }
}

/**
 * NPC・犬・鳥を町の周囲にランダム配置する。
 * NPC・犬はプレイヤーと同じ徘徊AIで、決まった範囲をゆっくり歩き回るだけ。
 */
export function initPopulace(scene) {
  sceneRef = scene;
  npcs = [];
  claimedHomeTiles.clear();
  claimedWorkTiles.clear();
  npcSpawnCounter = 0;
  spawnDefaultNpcs();

  birds = [];
  for (let i = 0; i < BIRD_COUNT; i += 1) {
    const bird = createBird({
      centerX: (Math.random() - 0.5) * 20,
      centerZ: (Math.random() - 0.5) * 20,
      height: 5 + Math.random() * 2,
      radius: 3 + Math.random() * 3,
      speed: 0.5 + Math.random() * 0.4,
    });
    scene.add(bird.group);
    birds.push(bird);
  }

  dogs = [];
  for (let i = 0; i < DOG_COUNT; i += 1) {
    const dog = createDog({
      homeX: (Math.random() - 0.5) * 16,
      homeZ: (Math.random() - 0.5) * 16,
      radius: 3 + Math.random() * 2,
    });
    scene.add(dog.group);
    dogs.push(dog);
  }
}

/**
 * 現在のNPCの数（「町の評判」スコアの人口要素、および画面表示の「人口」に使う）。
 * フェーズ23より、満足度に応じた移住・新規住民の増加で実際に増減する。
 */
export function getNpcCount() {
  return npcs.length;
}

export function getDogCount() {
  return dogs.length;
}

/**
 * 全NPC（住居未割り当ての住民も含む）の平均満足度（0〜100）。
 * 誰もいない場合はnullを返す（画面表示側で「-」等にフォールバックする）。
 */
export function getAverageSatisfaction() {
  if (npcs.length === 0) return null;
  const total = npcs.reduce((sum, npc) => sum + npc.satisfaction, 0);
  return total / npcs.length;
}

/**
 * 画面上部の「人口」「平均満足度」表示を更新する（フェーズ23）。
 * main.jsの間引かれたメインループから呼ばれる想定。
 */
export function updatePopulacePanel() {
  const populationEl = document.getElementById('population-count');
  const satisfactionEl = document.getElementById('average-satisfaction');
  if (populationEl) populationEl.textContent = getNpcCount();
  if (satisfactionEl) {
    const average = getAverageSatisfaction();
    satisfactionEl.textContent = average === null ? '-' : Math.round(average);
  }
}

// ------------------------------------------------------------------
// フェーズ22：NPCの通勤（家→店→家）
// ------------------------------------------------------------------
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
// 22時〜6時は就寝時間帯（家にいる間は徘徊せずその場に留まる、フェーズ23）。
const SLEEP_START_HOUR = 22;
const WAKE_HOUR = 6;
const ASSIGNMENT_INTERVAL = 2; // 秒（毎フレーム判定する必要はないため間引く）

const claimedHomeTiles = new Set();
const claimedWorkTiles = new Set();
let assignmentTimer = 0;

/**
 * 時刻（0〜23時）から、NPCが今いるべき場所（'work'か'home'）を決める純粋関数。
 */
export function getDesiredLocation(hours) {
  return hours >= WORK_START_HOUR && hours < WORK_END_HOUR ? 'work' : 'home';
}

/**
 * tileが今も「そのグローバル座標で現在読み込まれている、同じオブジェクト」で
 * あるかを確認する。チャンクがアンロード→再読込されると別オブジェクトに
 * 置き換わるため、古い参照を持ち続けてNPCが消えたタイルへ向かい続ける
 * ことを防ぐ。
 */
function isTileStillLive(tile) {
  if (!tile) return false;
  return getGlobalTile(tile.userData.globalX, tile.userData.globalY) === tile;
}

function tileNearPosition(position) {
  const { gx, gy } = worldToGlobalTileCoords(position.x, position.z);
  return getGlobalTile(gx, gy);
}

/**
 * 住居・お店が増えるたびに、まだ家/勤務先を割り当てられていないNPCへ
 * 割り当てる（早い者勝ち、1つの住居/お店には1人だけ割り当てる）。
 * 既に割り当て済みでも、取り壊された・チャンクがアンロードされたタイルは
 * 解除して再割り当てできるようにする。
 */
function updateAssignment(npc) {
  const commute = npc.commute;
  if (!commute) return;

  if (
    commute.homeTile &&
    (!isTileStillLive(commute.homeTile) || commute.homeTile.userData.tileType !== 'house')
  ) {
    claimedHomeTiles.delete(commute.homeTile);
    commute.homeTile = null;
  }
  if (
    commute.workTile &&
    (!isTileStillLive(commute.workTile) || commute.workTile.userData.tileType !== 'shop')
  ) {
    claimedWorkTiles.delete(commute.workTile);
    commute.workTile = null;
  }

  if (!commute.homeTile) {
    const candidate = Array.from(getHouseTiles()).find((tile) => !claimedHomeTiles.has(tile));
    if (candidate) {
      commute.homeTile = candidate;
      claimedHomeTiles.add(candidate);
    }
  }
  if (!commute.workTile) {
    // 道に接続されていないお店は「機能しない」ため、勤務先には割り当てない
    // （孤立した店に向かおうとして詰まる/迷子になることを避ける：フェーズ22の重点確認事項）。
    const candidate = Array.from(getShopTiles()).find(
      (tile) => !claimedWorkTiles.has(tile) && isConnectedToRoad(tile),
    );
    if (candidate) {
      commute.workTile = candidate;
      claimedWorkTiles.add(candidate);
    }
  }
}

// ------------------------------------------------------------------
// フェーズ23：満足度・移住・人口増減
// ------------------------------------------------------------------
// 満足度の目標値を計算する際に見る近隣タイルの範囲（タイル数、正方形）。
const SATISFACTION_RADIUS = 3;
// 家が無い（住居に割り当てられていない）NPCの目標満足度：低いまま据え置き、
// 住居が見つからない状態が続くとじわじわ満足度が下がって最終的に移住しうる。
const HOMELESS_TARGET_SATISFACTION = 10;
const SATISFACTION_BASE = 20; // 近くに何も無い住居の目標満足度の基礎値
const SATISFACTION_PER_AMENITY = 8; // 近隣の店・装飾1つあたりの目標満足度の上乗せ
const SATISFACTION_AMENITY_CAP = 70; // 近隣施設による上乗せの上限
const SATISFACTION_ROAD_BONUS = 10; // 住居が道に接続されている場合の上乗せ
// 目標値へ近づく速さ（間引きタイマー1回ごとに、現在値と目標値の差の
// この割合だけ近づく）。小さいほど、満足度の変化がゆっくりになる。
const SATISFACTION_LERP_RATE = 0.03;
const LOW_SATISFACTION_THRESHOLD = 25; // これを下回ると「不満」とみなし移住判定を始める
const HIGH_SATISFACTION_THRESHOLD = 70; // 住民（平均）がこれを上回ると新規住民が増えうる
// 満足度が低い状態がこの秒数（実時間）続いて初めて移住判定の対象になる。
// ゲーム内時間は現実1秒=1分なので、60秒 ≒ ゲーム内1時間。
const MIGRATION_STREAK_THRESHOLD_SECONDS = 60;
// 移住判定の対象になった後、間引きタイマー（ASSIGNMENT_INTERVAL）が回る
// たびにこの確率で実際に移住する（全員が同時に消えるのを避け、ばらつかせる）。
const MIGRATION_CHANCE_PER_TICK = 0.12;
// 平均満足度が高い状態で、間引きタイマーが回るたびにこの確率で新規住民が増える。
const GROWTH_CHANCE_PER_TICK = 0.1;
const MAX_POPULATION = 24; // 極端に増えすぎないための安全弁

/**
 * homeTile周辺のお店・装飾（＝生活の充実度に寄与するもの）の数を数える。
 * SATISFACTION_RADIUSタイル四方（住居自身を除く）を見る、単純な近傍探索。
 */
function countNearbyAmenities(homeTile) {
  const { globalX, globalY } = homeTile.userData;
  let count = 0;
  for (let dy = -SATISFACTION_RADIUS; dy <= SATISFACTION_RADIUS; dy += 1) {
    for (let dx = -SATISFACTION_RADIUS; dx <= SATISFACTION_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = getGlobalTile(globalX + dx, globalY + dy);
      if (!neighbor) continue;
      const type = neighbor.userData.tileType;
      if (type === 'shop' || DECORATION_TYPES.has(type)) count += 1;
    }
  }
  return count;
}

/**
 * NPCの現在の状況（家の有無・近隣の充実度・道への接続）から、
 * 満足度が向かっていく「目標値」を計算する純粋寄りの関数。
 * 実際の満足度(npc.satisfaction)はこの目標値へ毎回少しずつ近づくだけで、
 * 瞬時には変化しない（じわじわ変化させるため）。
 */
export function computeTargetSatisfaction(homeTile) {
  if (!homeTile) return HOMELESS_TARGET_SATISFACTION;
  const amenityBonus = Math.min(
    countNearbyAmenities(homeTile) * SATISFACTION_PER_AMENITY,
    SATISFACTION_AMENITY_CAP,
  );
  const roadBonus = isConnectedToRoad(homeTile) ? SATISFACTION_ROAD_BONUS : 0;
  return Math.min(100, SATISFACTION_BASE + amenityBonus + roadBonus);
}

/**
 * NPCの満足度を目標値へ少しだけ近づけ、低満足度が続いている秒数
 * （lowSatisfactionStreak）を更新する。間引きタイマーごとに呼ばれる。
 */
function updateSatisfaction(npc) {
  const homeTile =
    npc.commute?.homeTile && isTileStillLive(npc.commute.homeTile) ? npc.commute.homeTile : null;
  const target = computeTargetSatisfaction(homeTile);
  npc.satisfaction += (target - npc.satisfaction) * SATISFACTION_LERP_RATE;
  npc.satisfaction = Math.min(100, Math.max(0, npc.satisfaction));

  if (npc.satisfaction < LOW_SATISFACTION_THRESHOLD) {
    npc.lowSatisfactionStreak += ASSIGNMENT_INTERVAL;
  } else {
    npc.lowSatisfactionStreak = 0;
  }
}

// ------------------------------------------------------------------
// フェーズ27：満足度に応じた頭上アイコン（ハート/困り顔）の一時表示。
// 絵文字ではなく、既存の低ポリ図形（球・円錐）で表現し、他のビジュアルと
// スタイルを揃える。canvasテクスチャを使わないため、jsdom環境のテストでも
// 安全に呼び出せる。
// ------------------------------------------------------------------
const MOOD_ICON_LIFETIME = 2.2; // 秒（表示され続ける時間、フェードイン/アウト込み）
const MOOD_ICON_HEIGHT = 2.5; // NPCグループ内のローカルY（頭のすぐ上）
const HAPPY_ICON_COLOR = 0xe0607a; // ハート代わりのピンク球
const SAD_ICON_COLOR = 0x5c6b7a; // 困り顔代わりの沈んだ色の雫型

function createMoodIconMesh(kind) {
  if (kind === 'happy') {
    const geometry = new THREE.SphereGeometry(0.16, 6, 5);
    const material = new THREE.MeshBasicMaterial({
      color: HAPPY_ICON_COLOR,
      transparent: true,
      opacity: 0,
    });
    return new THREE.Mesh(geometry, material);
  }
  // 不満：先端を下に向けた小さな雫型（俯いた困り顔のイメージ）。
  const geometry = new THREE.ConeGeometry(0.15, 0.26, 6);
  geometry.rotateX(Math.PI);
  const material = new THREE.MeshBasicMaterial({
    color: SAD_ICON_COLOR,
    transparent: true,
    opacity: 0,
  });
  return new THREE.Mesh(geometry, material);
}

function disposeMoodIcon(npc) {
  if (!npc.moodIcon) return;
  npc.group.remove(npc.moodIcon.mesh);
  npc.moodIcon.mesh.geometry.dispose();
  npc.moodIcon.mesh.material.dispose();
  npc.moodIcon = null;
}

function spawnMoodIcon(npc, kind) {
  disposeMoodIcon(npc);
  const mesh = createMoodIconMesh(kind);
  mesh.position.set(0, MOOD_ICON_HEIGHT, 0);
  npc.group.add(mesh);
  npc.moodIcon = { mesh, elapsed: 0 };
}

/**
 * 満足度が「非常に高い/低い」ゾーンへ新たに入った瞬間だけアイコンを出す
 * （ゾーンに留まり続ける間は間引きタイマーが回るたびに何度も出したりしない）。
 */
function updateMoodZone(npc) {
  const zone =
    npc.satisfaction >= HIGH_SATISFACTION_THRESHOLD
      ? 'happy'
      : npc.satisfaction <= LOW_SATISFACTION_THRESHOLD
        ? 'sad'
        : 'neutral';
  if (zone !== npc.moodZone && zone !== 'neutral') {
    spawnMoodIcon(npc, zone);
  }
  npc.moodZone = zone;
}

/**
 * 表示中のアイコンのフェードイン/アウトと、ふわふわ浮き上がる動きを進める。
 * 毎フレーム呼ぶ想定（間引くとフェードがカクついて見える）。
 */
function updateMoodIconAnimation(npc, delta) {
  if (!npc.moodIcon) return;
  npc.moodIcon.elapsed += delta;
  const t = npc.moodIcon.elapsed / MOOD_ICON_LIFETIME;
  if (t >= 1) {
    disposeMoodIcon(npc);
    return;
  }
  const fadeIn = Math.min(1, t / 0.15);
  const fadeOut = Math.min(1, (1 - t) / 0.3);
  npc.moodIcon.mesh.material.opacity = Math.min(fadeIn, fadeOut);
  npc.moodIcon.mesh.position.y = MOOD_ICON_HEIGHT + t * 0.3 + Math.sin(npc.moodIcon.elapsed * 3) * 0.04;
}

/**
 * 住居に割り当てられているNPC（＝実際の住民）の平均満足度。
 * 住民が1人もいない場合はnullを返す（新規住民の「呼び水」がいない状態）。
 * 画面表示用のgetAverageSatisfaction（住居未割り当ても含む全NPC平均）とは
 * 意図的に別にしている：家の無いNPCで平均が薄まると、いつまでも
 * 新規住民の条件（HIGH_SATISFACTION_THRESHOLD）を満たせなくなるため。
 */
function computeAverageResidentSatisfaction() {
  const residents = npcs.filter((npc) => npc.commute?.homeTile);
  if (residents.length === 0) return null;
  return residents.reduce((sum, npc) => sum + npc.satisfaction, 0) / residents.length;
}

/**
 * NPCを町から取り除く（移住）。割り当てていた家・勤務先を解放し、
 * シーン・npcs配列からも取り除いてメモリを解放する。
 */
function migrateNpc(npc) {
  if (npc.commute?.homeTile) claimedHomeTiles.delete(npc.commute.homeTile);
  if (npc.commute?.workTile) claimedWorkTiles.delete(npc.commute.workTile);
  sceneRef.remove(npc.group);
  disposeCharacterGroup(npc.group);
  const index = npcs.indexOf(npc);
  if (index !== -1) npcs.splice(index, 1);
}

/**
 * 低満足度が閾値秒数以上続いているNPCについて、間引きタイマーごとに
 * 一定確率で実際に移住させる（全員が同時に消えることを避けるため、
 * 対象になった後も毎回の抽選で少しずつばらつかせる）。
 */
function processMigrations() {
  const migrants = npcs.filter(
    (npc) =>
      npc.lowSatisfactionStreak >= MIGRATION_STREAK_THRESHOLD_SECONDS &&
      Math.random() < MIGRATION_CHANCE_PER_TICK,
  );
  migrants.forEach((npc) => {
    migrateNpc(npc);
    showStatusMessage(`住民が町を去りました…（人口${npcs.length}）`);
  });
}

/**
 * 空いている住居があり、既存住民の平均満足度が高い状態が続いていれば、
 * 間引きタイマーごとに一定確率で新しい住民が1人その住居に入居する。
 * 住民が誰もいない場合（平均満足度が計算できない場合）は、空き住居さえ
 * あれば入居しうる（人口0からの復活手段を残しておくため）。
 */
function maybeGrowPopulation() {
  if (npcs.length >= MAX_POPULATION) return;

  const vacantHouses = Array.from(getHouseTiles()).filter((tile) => !claimedHomeTiles.has(tile));
  if (vacantHouses.length === 0) return;

  const averageResidentSatisfaction = computeAverageResidentSatisfaction();
  const isBootstrap = averageResidentSatisfaction === null;
  if (!isBootstrap && averageResidentSatisfaction < HIGH_SATISFACTION_THRESHOLD) return;
  if (Math.random() >= GROWTH_CHANCE_PER_TICK) return;

  const houseTile = vacantHouses[Math.floor(Math.random() * vacantHouses.length)];
  const npc = spawnNpc({ homeX: houseTile.position.x, homeZ: houseTile.position.z });
  npc.commute.homeTile = houseTile;
  claimedHomeTiles.add(houseTile);
  showStatusMessage(`新しい住民が引っ越してきました🏠（人口${npcs.length}）`);
}

/**
 * 現在地からdestinationTileまでの道沿いの経路を計算し、通勤を開始する。
 * 道が見つからない場合は、目的地への直線移動にフォールバックする
 * （道以外の場所もある程度歩けるようにする、というフェーズ22の要件）。
 */
// 建物（家・お店等）の衝突半径は最大1.1、NPCの衝突半径は0.35なので、
// その合計(1.45)より大きい値にしておく。道が見つからず建物の中心へ直接
// 向かうフォールバック時、通常の到達判定距離(0.3)のままだと衝突判定に
// 押し戻され続けて「到着」を検知できず立ち往生してしまう
// （実機でのPlaywright検証で発見した不具合。フェーズ22の重点確認事項）。
const FALLBACK_ARRIVE_DISTANCE = 1.8;

function beginCommute(npc, destinationTile, pendingLocation) {
  const commute = npc.commute;
  const startTile = tileNearPosition(npc.group.position);
  const tilePath = startTile ? findRoadPath(getGlobalTile, startTile, destinationTile) : null;

  if (tilePath && tilePath.length > 0) {
    // 道沿いの経路：各ウェイポイントは道タイル（衝突なし）なので通常の到達判定でよい。
    commute.path = tilePath.map((tile) => ({
      x: tile.position.x,
      z: tile.position.z,
      arriveDistance: undefined,
    }));
  } else {
    // 道が見つからない場合の直線移動フォールバック。
    commute.path = [
      {
        x: destinationTile.position.x,
        z: destinationTile.position.z,
        arriveDistance: FALLBACK_ARRIVE_DISTANCE,
      },
    ];
  }
  commute.pathIndex = 0;
  commute.pendingLocation = pendingLocation;
  commute.location = 'traveling';
  const first = commute.path[0];
  npc.setDestination(first.x, first.z, first.arriveDistance);
}

/**
 * 家・勤務先が両方割り当てられているNPCについて、時間帯に応じて
 * 通勤を開始すべきか判定する（間引いて呼ばれる）。
 */
function updateCommuteDecision(npc) {
  const commute = npc.commute;
  if (!commute || !commute.homeTile || !commute.workTile) return;
  if (commute.location === 'traveling') return; // 移動中は次の判定まで割り込まない

  const { hours } = getGameTime();
  const desired = getDesiredLocation(hours);
  if (desired === commute.location) return;

  const destinationTile = desired === 'work' ? commute.workTile : commute.homeTile;
  beginCommute(npc, destinationTile, desired);
}

/**
 * 通勤中のNPCについて、現在の経路ウェイポイントに到達していれば次へ進める。
 * 最後のウェイポイントに到達したら、通勤状態を'home'/'work'に確定する
 * （毎フレーム呼ぶ必要がある：間引くとウェイポイントごとに足止めされて見える）。
 */
function updateCommuteMovement(npc) {
  const commute = npc.commute;
  if (!commute || commute.location !== 'traveling') return;
  if (!npc.hasArrivedAtDestination()) return;

  commute.pathIndex += 1;
  if (commute.pathIndex >= commute.path.length) {
    commute.location = commute.pendingLocation;
    commute.pendingLocation = null;
    commute.path = null;
    return;
  }
  const next = commute.path[commute.pathIndex];
  npc.setDestination(next.x, next.z, next.arriveDistance);
}

/**
 * NPC・犬・鳥の徘徊アニメーションを進め、建物や木にぶつからないようにする
 * （屋外専用、常に屋外にいるためプレイヤーの室内外モードに関係なく毎フレーム呼ぶ）。
 */
export function updatePopulace(delta, elapsedTime) {
  assignmentTimer += delta;
  if (assignmentTimer >= ASSIGNMENT_INTERVAL) {
    assignmentTimer = 0;
    npcs.forEach((npc) => {
      updateAssignment(npc);
      updateCommuteDecision(npc);
      updateSatisfaction(npc);
      updateMoodZone(npc);
    });
    // 移住はnpcs配列そのものを変更するため、上のforEachが終わってから行う
    // （スナップショット配列に対して判定した上で、生きているnpcs配列を操作する）。
    processMigrations();
    maybeGrowPopulation();

    // 就寝時間帯（22時〜6時）は、家にいるNPCの徘徊を止めてその場に留まらせる
    // （生活サイクルの「就寝」を見た目にも反映する）。
    const { hours } = getGameTime();
    const isSleepHours = hours >= SLEEP_START_HOUR || hours < WAKE_HOUR;
    npcs.forEach((npc) => npc.setSleeping(isSleepHours && npc.commute?.location === 'home'));
  }
  npcs.forEach((npc) => updateCommuteMovement(npc));

  npcs.forEach((npc) => npc.update(delta));
  npcs.forEach((npc) => updateMoodIconAnimation(npc, delta));
  dogs.forEach((dog) => dog.update(delta));
  birds.forEach((bird) => bird.update(elapsedTime));

  npcs.forEach((npc) => resolveOutdoorCollision(npc.group.position, NPC_COLLISION_RADIUS));
  dogs.forEach((dog) => resolveOutdoorCollision(dog.group.position, DOG_COLLISION_RADIUS));

  // 橋のアーチに沿って、NPC・犬も実際に高さを登り降りしながら渡れるようにする
  // （プレイヤーのmain.jsと同じgetGroundHeightAtを使い、通常の地面では常に0）。
  npcs.forEach((npc) => {
    npc.group.position.y = getGroundHeightAt(npc.group.position.x, npc.group.position.z);
  });
  dogs.forEach((dog) => {
    dog.group.position.y = getGroundHeightAt(dog.group.position.x, dog.group.position.z);
  });
}

/**
 * プレイヤー・NPC・犬同士がすり抜けないよう、ゆるく押し出し合う。
 * プレイヤーが屋外にいるときだけ呼ぶ（NPC・犬は常に屋外にいるため）。
 */
export function resolvePopulaceInterCollisions(playerPosition, playerRadius) {
  const creatures = [
    ...npcs.map((npc) => ({ position: npc.group.position, radius: NPC_COLLISION_RADIUS })),
    ...dogs.map((dog) => ({ position: dog.group.position, radius: DOG_COLLISION_RADIUS })),
  ];
  creatures.forEach((creature) => {
    pushEntitiesApart(playerPosition, playerRadius, creature.position, creature.radius);
  });
  for (let i = 0; i < creatures.length; i += 1) {
    for (let j = i + 1; j < creatures.length; j += 1) {
      pushEntitiesApart(
        creatures[i].position,
        creatures[i].radius,
        creatures[j].position,
        creatures[j].radius,
      );
    }
  }
}

// ------------------------------------------------------------------
// フェーズ23：セーブ/ロード連携（人口・満足度・住居の割り当て）
// ------------------------------------------------------------------

/**
 * 現在のNPC（住民）を、セーブデータに埋め込める単純なプレーンオブジェクトの
 * 配列に変換する。犬・鳥は毎回ランダムに再配置するだけの装飾的な存在なので
 * 保存しない。住居はグローバルタイル座標だけを保存し、読込時に
 * getGlobalTileで実際のタイルへ引き直す（タイルオブジェクト自体は
 * チャンクの読込/破棄で入れ替わるため保存できない）。
 */
export function serializePopulace() {
  return npcs.map((npc) => ({
    homeX: npc.commute?.homeTile?.userData.globalX ?? null,
    homeY: npc.commute?.homeTile?.userData.globalY ?? null,
    satisfaction: npc.satisfaction,
    clothingColor: npc.clothingColor,
    hatColor: npc.hatColor,
  }));
}

/**
 * セーブデータから住民を復元する。既存のNPC（読込前に表示されていたもの）は
 * 全て取り除いてから作り直す。savedNpcsが無い・空（旧フォーマットのセーブ、
 * またはまだ一度もセーブしていない状態）の場合は、初回起動と同じ既定の
 * 人数でランダムに再配置する。
 */
export function restorePopulace(savedNpcs) {
  npcs.forEach((npc) => {
    sceneRef.remove(npc.group);
    disposeCharacterGroup(npc.group);
  });
  npcs = [];
  claimedHomeTiles.clear();
  claimedWorkTiles.clear();
  npcSpawnCounter = 0;

  if (!Array.isArray(savedNpcs) || savedNpcs.length === 0) {
    spawnDefaultNpcs();
    return;
  }

  savedNpcs.forEach((entry) => {
    const candidateHomeTile =
      Number.isFinite(entry?.homeX) && Number.isFinite(entry?.homeY)
        ? getGlobalTile(entry.homeX, entry.homeY)
        : null;
    const homeTile =
      candidateHomeTile &&
      candidateHomeTile.userData.tileType === 'house' &&
      !claimedHomeTiles.has(candidateHomeTile)
        ? candidateHomeTile
        : null;
    const spawnX = homeTile ? homeTile.position.x : (Math.random() - 0.5) * 20;
    const spawnZ = homeTile ? homeTile.position.z : (Math.random() - 0.5) * 20;

    const npc = spawnNpc({
      homeX: spawnX,
      homeZ: spawnZ,
      clothingColor: entry?.clothingColor,
      hatColor: entry?.hatColor,
      satisfaction: Number.isFinite(entry?.satisfaction) ? entry.satisfaction : INITIAL_SATISFACTION,
    });
    if (homeTile) {
      npc.commute.homeTile = homeTile;
      claimedHomeTiles.add(homeTile);
    }
  });
}
