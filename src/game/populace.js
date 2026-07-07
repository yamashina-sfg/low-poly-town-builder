import { createNPC } from '../npc.js';
import { createBird, createDog } from '../creatures.js';
import { pushEntitiesApart } from '../collision.js';
import {
  resolveOutdoorCollision,
  getHouseTiles,
  getShopTiles,
  isConnectedToRoad,
  getGroundHeightAt,
} from './world.js';
import { getGameTime } from '../gameTime.js';
import { findRoadPath } from '../road.js';
import { getGlobalTile, worldToGlobalTileCoords } from '../chunkManager.js';

const NPC_CLOTHING_COLORS = [
  0xc94c4c, 0x4c7ac9, 0xc9a94c, 0x4cae7a, 0x8a5fd9, 0xe07a9a, 0x4cc9c0, 0xd97f2e, 0x7a9a3f, 0xa84ca0,
];
const NPC_HAT_COLORS = [0x5c5c5c, 0x7a4a3a, 0x3f6b3a, 0x455a64, 0x8a3f5c, 0x3f5c8a];
const NPC_COLLISION_RADIUS = 0.35;
const DOG_COLLISION_RADIUS = 0.22;
const NPC_COUNT = 6;
const BIRD_COUNT = 3;
const DOG_COUNT = 2;

let npcs = [];
let birds = [];
let dogs = [];

/**
 * NPC・犬・鳥を町の周囲にランダム配置する。
 * NPC・犬はプレイヤーと同じ徘徊AIで、決まった範囲をゆっくり歩き回るだけ。
 */
export function initPopulace(scene) {
  npcs = [];
  for (let i = 0; i < NPC_COUNT; i += 1) {
    const angle = (i / NPC_COUNT) * Math.PI * 2;
    const homeDistance = 8 + Math.random() * 10;
    const npc = createNPC({
      homeX: Math.cos(angle) * homeDistance,
      homeZ: Math.sin(angle) * homeDistance,
      clothingColor: NPC_CLOTHING_COLORS[i % NPC_CLOTHING_COLORS.length],
      hatColor: NPC_HAT_COLORS[i % NPC_HAT_COLORS.length],
      radius: 4 + Math.random() * 2,
      speed: 1 + Math.random() * 0.6,
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
    scene.add(npc.group);
    npcs.push(npc);
  }

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
 * 現在のNPC・犬の数（「町の評判」スコアの人口要素として使う）。
 */
export function getNpcCount() {
  return npcs.length;
}

export function getDogCount() {
  return dogs.length;
}

// ------------------------------------------------------------------
// フェーズ22：NPCの通勤（家→店→家）
// ------------------------------------------------------------------
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
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
    });
  }
  npcs.forEach((npc) => updateCommuteMovement(npc));

  npcs.forEach((npc) => npc.update(delta));
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
