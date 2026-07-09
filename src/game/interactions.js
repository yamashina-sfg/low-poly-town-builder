import * as THREE from 'three';
import { skipTimeToMorning } from '../gameTime.js';
import { resetSleepiness } from '../playerStatus.js';
import { addWood, trySpendWood, addMoney, trySpendMoney, getWood, getMoney } from '../economy.js';
import { spawnParticleBurst } from '../particles.js';
import { getBedTiles, getTreeTiles, getShopTiles, buildOnTile } from './world.js';
import {
  isBuildingFunctional,
  canBuyFromShop,
  buyFromShop,
  sellToShop,
  getShopInventory,
} from './economySystem.js';
import { showStatusMessage } from './statusMessage.js';

// タイル間隔(TILE_SIZE=2)より広く取り、隣のタイルに置いたものにも反応するようにする
export const INTERACTION_RANGE = 2.5;
// お店との取引1回あたりの木材量（フェーズ25：在庫もこの単位で増減する）。
const SHOP_TRADE_AMOUNT = 10;

const ACTION_PROMPT_LABELS = {
  bed: 'Eキーで眠る',
  tree: 'Eキーで伐採する',
  shop: 'Eキーでお店を開く',
};

let sceneRef = null;
let getCharacterPosition = null;
// 現在キャラが操作できる対象（ベッド/木/お店のうち最も近いもの）
let interactionTarget = null;
// 現在開いているお店のタイル（フェーズ25：在庫・営業状態はお店ごとに持つため、
// どのタイルを開いたか覚えておく必要がある）。
let openShopTile = null;

export function initInteractions({ scene, getCharacterPosition: getPositionFn }) {
  sceneRef = scene;
  getCharacterPosition = getPositionFn;

  document.getElementById('action-prompt').addEventListener('click', handleActionKey);
  document.getElementById('shop-close').addEventListener('click', closeShop);
  document.getElementById('shop-sell-wood').addEventListener('click', () => {
    if (!openShopTile) return;
    if (!isBuildingFunctional(openShopTile)) {
      showStatusMessage('このお店は維持費未払いで修繕中…営業していない');
    } else if (trySpendWood(SHOP_TRADE_AMOUNT)) {
      addMoney(15);
      sellToShop(openShopTile, SHOP_TRADE_AMOUNT);
      showStatusMessage('木材10を売って15円手に入れた');
    } else {
      showStatusMessage('木材が足りない');
    }
    openShop(openShopTile);
  });
  document.getElementById('shop-buy-wood').addEventListener('click', () => {
    if (!openShopTile) return;
    if (!isBuildingFunctional(openShopTile)) {
      showStatusMessage('このお店は維持費未払いで修繕中…営業していない');
    } else if (!canBuyFromShop(openShopTile, SHOP_TRADE_AMOUNT)) {
      showStatusMessage('在庫が足りない…また今度来てください');
    } else if (trySpendMoney(20)) {
      addWood(SHOP_TRADE_AMOUNT);
      buyFromShop(openShopTile, SHOP_TRADE_AMOUNT);
      showStatusMessage('木材10を買った');
    } else {
      showStatusMessage('お金が足りない');
    }
    openShop(openShopTile);
  });
}

function findNearestTile(tileSet) {
  const characterPosition = getCharacterPosition();
  let nearest = null;
  let nearestDistance = Infinity;
  tileSet.forEach((tile) => {
    const distance = characterPosition.distanceTo(tile.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = tile;
    }
  });
  return { tile: nearest, distance: nearestDistance };
}

function updateActionPrompt() {
  const promptEl = document.getElementById('action-prompt');
  if (interactionTarget) {
    promptEl.textContent = ACTION_PROMPT_LABELS[interactionTarget.type];
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }
}

/**
 * ベッドに近づいて眠る：時間を朝まで進め、眠気をリセットする。
 */
function sleep() {
  skipTimeToMorning();
  resetSleepiness();
  showStatusMessage('ぐっすり眠った。朝になった。');
}

/**
 * 木に近づいて伐採する：木材を入手し、タイルを更地に戻す。
 */
function chopTree(tile) {
  // 特殊な木（探索の報酬として自然生成されるランドマーク）は資源が豊富で、
  // 通常の木より多くの木材が手に入る。
  const isSpecial = tile.userData.tileType === 'specialTree';
  const amount = isSpecial ? 15 + Math.floor(Math.random() * 11) : 3 + Math.floor(Math.random() * 4);
  addWood(amount);
  const leafPosition = tile.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  spawnParticleBurst(sceneRef, {
    position: leafPosition,
    count: isSpecial ? 18 : 10,
    color: isSpecial ? 0xc9a227 : 0x6b8e3d,
    size: 0.1,
    speed: 2.2,
    life: 1,
    gravity: -3,
  });
  buildOnTile(tile, 'clear');
  showStatusMessage(isSpecial ? `特殊な木から木材を${amount}個手に入れた！` : `木材を${amount}個手に入れた`);
}

/**
 * お店を開く（フェーズ25：お店ごとの在庫・営業状態を反映する）。
 * 老朽化して非稼働のお店は取引ボタンを両方とも無効にし、稼働中でも
 * 在庫がSHOP_TRADE_AMOUNT未満なら「買う」だけ無効にする
 * （「売る」は在庫を増やす側なので、稼働してさえいれば常に可能）。
 */
function openShop(tile) {
  openShopTile = tile;
  document.getElementById('shop-wood').textContent = getWood();
  document.getElementById('shop-money').textContent = getMoney();
  document.getElementById('shop-inventory').textContent = getShopInventory(tile);

  const functional = isBuildingFunctional(tile);
  document.getElementById('shop-status-closed').classList.toggle('hidden', functional);
  document.getElementById('shop-buy-wood').disabled = !canBuyFromShop(tile, SHOP_TRADE_AMOUNT);
  document.getElementById('shop-sell-wood').disabled = !functional;

  document.getElementById('shop-panel').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shop-panel').classList.add('hidden');
  openShopTile = null;
}

export function handleActionKey() {
  if (!interactionTarget) return;
  if (interactionTarget.type === 'bed') sleep();
  else if (interactionTarget.type === 'tree') chopTree(interactionTarget.tile);
  else if (interactionTarget.type === 'shop') openShop(interactionTarget.tile);
}

/**
 * ベッド・木・お店のうち最も近いものを操作対象にする（優先度: ベッド＞木＞お店）。
 * 毎フレーム呼び、対象が変わったときだけ画面下部のプロンプトを更新する。
 */
export function updateInteractionTarget() {
  const bedNear = findNearestTile(getBedTiles());
  const treeNear = findNearestTile(getTreeTiles());
  const shopNear = findNearestTile(getShopTiles());

  let newTarget = null;
  if (bedNear.distance <= INTERACTION_RANGE) newTarget = { type: 'bed', tile: bedNear.tile };
  else if (treeNear.distance <= INTERACTION_RANGE) newTarget = { type: 'tree', tile: treeNear.tile };
  else if (shopNear.distance <= INTERACTION_RANGE) newTarget = { type: 'shop', tile: shopNear.tile };

  if (newTarget?.type !== interactionTarget?.type || newTarget?.tile !== interactionTarget?.tile) {
    interactionTarget = newTarget;
    updateActionPrompt();
  }
}
