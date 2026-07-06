import * as THREE from 'three';
import { skipTimeToMorning } from '../gameTime.js';
import { resetSleepiness } from '../playerStatus.js';
import { addWood, trySpendWood, addMoney, trySpendMoney, getWood, getMoney } from '../economy.js';
import { spawnParticleBurst } from '../particles.js';
import { getBedTiles, getTreeTiles, getShopTiles, buildOnTile } from './world.js';
import { showStatusMessage } from './statusMessage.js';

// タイル間隔(TILE_SIZE=2)より広く取り、隣のタイルに置いたものにも反応するようにする
export const INTERACTION_RANGE = 2.5;

const ACTION_PROMPT_LABELS = {
  bed: 'Eキーで眠る',
  tree: 'Eキーで伐採する',
  shop: 'Eキーでお店を開く',
};

let sceneRef = null;
let getCharacterPosition = null;
// 現在キャラが操作できる対象（ベッド/木/お店のうち最も近いもの）
let interactionTarget = null;

export function initInteractions({ scene, getCharacterPosition: getPositionFn }) {
  sceneRef = scene;
  getCharacterPosition = getPositionFn;

  document.getElementById('action-prompt').addEventListener('click', handleActionKey);
  document.getElementById('shop-close').addEventListener('click', closeShop);
  document.getElementById('shop-sell-wood').addEventListener('click', () => {
    if (trySpendWood(10)) {
      addMoney(15);
      showStatusMessage('木材10を売って15円手に入れた');
    } else {
      showStatusMessage('木材が足りない');
    }
    openShop();
  });
  document.getElementById('shop-buy-wood').addEventListener('click', () => {
    if (trySpendMoney(20)) {
      addWood(10);
      showStatusMessage('木材10を買った');
    } else {
      showStatusMessage('お金が足りない');
    }
    openShop();
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

function openShop() {
  document.getElementById('shop-wood').textContent = getWood();
  document.getElementById('shop-money').textContent = getMoney();
  document.getElementById('shop-panel').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shop-panel').classList.add('hidden');
}

export function handleActionKey() {
  if (!interactionTarget) return;
  if (interactionTarget.type === 'bed') sleep();
  else if (interactionTarget.type === 'tree') chopTree(interactionTarget.tile);
  else if (interactionTarget.type === 'shop') openShop();
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
