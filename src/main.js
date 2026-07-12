import * as THREE from 'three';
import {
  getAllPoolMeshes,
  updateInstanceAnimations,
  getInstanceCount,
  setInstancingScene,
} from './instancing.js';
import {
  initDebugPanel,
  updateDebugStats,
  setSeedInputValue,
  setMuteButtonLabel,
  updateTimeAndSleepiness,
} from './debugPanel.js';
import { advanceGameTime, getGameTime, formatGameTime } from './gameTime.js';
import { advanceSleepiness, getSleepiness } from './playerStatus.js';
import { updateDayNightCycle } from './dayNightCycle.js';
import { startAmbientAudio, setAmbientMuted } from './ambientAudio.js';
import { spawnSparkle, updateParticles } from './particles.js';
import { updateWaterTime } from './water.js';
import { initMinimap, updateMinimap } from './minimap.js';
import { initInteriorRoom, INTERIOR_OFFSET, ROOM_SIZE } from './interior.js';
import { hideBuildMenu, updateButtonStates } from './buildMenu.js';
import { getWood, getMoney } from './economy.js';
import { forEachLoadedTile } from './chunkManager.js';

import {
  initWorld,
  updateWorldStreaming,
  resolveOutdoorCollision,
  resolveIndoorCollision,
  getTownStats,
  resetTown,
  changeWorldSeed,
  saveWorld,
  loadWorld,
  isIndoorMode,
  getWaterTiles,
  enterIndoorSession,
  exitIndoorSession,
  setLandmarkDiscoveredHandler,
  getGroundHeightAt,
} from './game/world.js';
import {
  initPlayer,
  getCharacterPosition,
  getCharacterFacing,
  setCharacterPosition,
  setCharacterFacing,
  setIndoorScale,
  setClothingColor,
  setHatColor,
  updateMovementInput,
  snapCameraToCharacter,
  updateCameraFollow,
} from './game/player.js';
import { initBuildSystem, clearHoveredTile } from './game/buildSystem.js';
import { initInteractions, updateInteractionTarget, handleActionKey } from './game/interactions.js';
import {
  initPopulace,
  updatePopulace,
  resolvePopulaceInterCollisions,
  serializePopulace,
  restorePopulace,
  updatePopulacePanel,
} from './game/populace.js';
import { showStatusMessage } from './game/statusMessage.js';
import { updateResourcePanel } from './game/resourcePanel.js';
import { updateEconomySystem } from './game/economySystem.js';
import { initBuildingIdleAnimation, updateBuildingIdleAnimation } from './game/buildingIdleAnimation.js';
import { updateSeasonalSystem } from './game/seasonalSystem.js';
import {
  updateProgression,
  recordLandmarkDiscovered,
  getCurrentLockedTypes,
  initProgressionPanel,
} from './game/progression.js';
import { initOnboarding } from './game/onboarding.js';
import { initTouchControls } from './game/touchControls.js';

// ------------------------------------------------------------------
// シーン基本セットアップ
// ------------------------------------------------------------------
const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3f4); // 水色の空

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
dirLight.castShadow = true;
// 低ポリスタイルを崩さない程度の控えめな解像度。
// シャドウカメラの視錐台はキャラの周囲のみをカバーし（ワールド全体ではない）、
// 毎フレームキャラの位置に追従させる（dayNightCycle.jsが更新する）。
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.bias = -0.002;
scene.add(dirLight);
scene.add(dirLight.target);

// ------------------------------------------------------------------
// 建物の内部（住居のみ）・ミニマップ
// ------------------------------------------------------------------
initInteriorRoom(scene);
initMinimap();

// ------------------------------------------------------------------
// 地面・チャンク・建物・木などのワールドデータ
// ------------------------------------------------------------------
setInstancingScene(scene);
getAllPoolMeshes().forEach((mesh) => scene.add(mesh));
initWorld(scene);
setLandmarkDiscoveredHandler(recordLandmarkDiscovered);

// ------------------------------------------------------------------
// キャラクター・NPC・小動物
// ------------------------------------------------------------------
initPlayer(scene, camera, { clothingColor: 0x3b6ea5, hatColor: 0xb5533c });
initPopulace(scene);
initTouchControls();
initBuildingIdleAnimation(scene);

const outdoorReturnPosition = new THREE.Vector3();
let outdoorReturnFacing = 0;

function enterHouse(tile) {
  if (isIndoorMode()) return;
  // 切り替わる前の（屋外の）ハイライト関数でホバー状態をきちんと消灯してから
  // モードを切り替える（残したまま切り替えると、次のホバー時に屋内の
  // ハイライト関数が屋外タイルへ誤って呼ばれてクラッシュする）。
  clearHoveredTile();

  outdoorReturnPosition.copy(getCharacterPosition());
  outdoorReturnFacing = getCharacterFacing();

  const spawn = enterIndoorSession(tile);
  setCharacterPosition(spawn);
  setCharacterFacing(0);
  setIndoorScale(true);
  snapCameraToCharacter(true);

  document.getElementById('exit-building-button').classList.remove('hidden');
}

function exitHouse() {
  if (!isIndoorMode()) return;
  clearHoveredTile();

  exitIndoorSession();
  setCharacterPosition(outdoorReturnPosition);
  setCharacterFacing(outdoorReturnFacing);
  setIndoorScale(false);
  snapCameraToCharacter(false);

  hideBuildMenu();
  document.getElementById('exit-building-button').classList.add('hidden');
}

initBuildSystem({ scene, renderer, camera, onEnterHouse: enterHouse });
initInteractions({ scene, getCharacterPosition });

document.getElementById('exit-building-button').addEventListener('click', exitHouse);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && isIndoorMode()) exitHouse();
  if (event.code === 'KeyE') handleActionKey();
});

// ------------------------------------------------------------------
// デバッグパネル・セーブ/ロード
// ------------------------------------------------------------------
function handleSave() {
  saveWorld(serializePopulace);
  showStatusMessage('セーブしました');
}

function handleLoad() {
  const result = loadWorld(restorePopulace);
  if (!result) {
    showStatusMessage('セーブデータが見つからない');
    return;
  }
  setSeedInputValue(result.seed);
  updateResourcePanel();
  showStatusMessage('読み込みました');
}

function handleSeedChange(newSeed) {
  changeWorldSeed(newSeed);
}

let ambientMuted = false;
function handleToggleMute() {
  ambientMuted = !ambientMuted;
  setAmbientMuted(ambientMuted);
  setMuteButtonLabel(ambientMuted);
}

initDebugPanel({
  onSave: handleSave,
  onLoad: handleLoad,
  onReset: resetTown,
  onSeedChange: handleSeedChange,
  onToggleMute: handleToggleMute,
  onClothingColorChange: setClothingColor,
  onHatColorChange: setHatColor,
});

initOnboarding();
initProgressionPanel();

// ブラウザの自動再生ポリシーのため、最初のキー入力/クリックで環境音を開始する
function beginAudioOnFirstInteraction() {
  startAmbientAudio();
  window.removeEventListener('keydown', beginAudioOnFirstInteraction);
  window.removeEventListener('click', beginAudioOnFirstInteraction);
}
window.addEventListener('keydown', beginAudioOnFirstInteraction, { once: true });
window.addEventListener('click', beginAudioOnFirstInteraction, { once: true });

// ------------------------------------------------------------------
// メインループ
// ------------------------------------------------------------------
const PLAYER_COLLISION_RADIUS = 0.35;

const clock = new THREE.Clock();

let fpsFrameCount = 0;
let fpsElapsed = 0;
let sparkleTimer = 0;
let minimapTimer = 0;

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);

  updateParticles(delta);
  updateWaterTime(clock.elapsedTime);
  updateInstanceAnimations(clock.elapsedTime);

  advanceGameTime(delta);
  advanceSleepiness(delta);
  const { dayFraction } = getGameTime();
  updateDayNightCycle({ dayFraction, scene, dirLight, hemiLight, targetPosition: getCharacterPosition() });

  updateInteractionTarget();

  fpsFrameCount += 1;
  fpsElapsed += delta;
  if (fpsElapsed >= 0.5) {
    const fps = Math.round(fpsFrameCount / fpsElapsed);
    const stats = getTownStats();
    updateDebugStats({
      tileCount: stats.tileCount,
      buildingCount: stats.buildingCount,
      treeCount: stats.treeCount,
      chunkCount: stats.chunkCount,
      fps,
      instanceCount: getInstanceCount(),
    });
    updateTimeAndSleepiness(formatGameTime(), Math.round(getSleepiness()));
    updateResourcePanel();
    updateProgression();
    updatePopulacePanel();
    updateButtonStates({ lockedTypes: getCurrentLockedTypes(), wood: getWood(), money: getMoney() });
    fpsFrameCount = 0;
    fpsElapsed = 0;
  }

  const isMoving = updateMovementInput(delta);

  // 水タイルにときどききらめきパーティクルを出す
  const waterTiles = getWaterTiles();
  sparkleTimer += delta;
  if (sparkleTimer >= 0.4 && waterTiles.size > 0) {
    sparkleTimer = 0;
    const index = Math.floor(Math.random() * waterTiles.size);
    let i = 0;
    for (const waterTile of waterTiles) {
      if (i === index) {
        spawnSparkle(scene, waterTile.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
        break;
      }
      i += 1;
    }
  }

  // ミニマップは毎フレームではなく間引いて更新する
  minimapTimer += delta;
  if (minimapTimer >= 0.15) {
    minimapTimer = 0;
    updateMinimap({
      characterPosition: getCharacterPosition(),
      characterFacing: getCharacterFacing(),
      forEachLoadedTile,
    });
  }

  updatePopulace(delta, clock.elapsedTime);
  updateEconomySystem(delta);
  updateSeasonalSystem(delta);
  updateBuildingIdleAnimation(delta, clock.elapsedTime);

  if (isIndoorMode()) {
    // 室内では部屋の範囲内にキャラを収める（チャンクの生成・可視化更新は行わない）
    const characterPosition = getCharacterPosition();
    const roomHalf = ROOM_SIZE / 2 - 0.4;
    characterPosition.x = THREE.MathUtils.clamp(
      characterPosition.x,
      INTERIOR_OFFSET.x - roomHalf,
      INTERIOR_OFFSET.x + roomHalf,
    );
    characterPosition.z = THREE.MathUtils.clamp(
      characterPosition.z,
      INTERIOR_OFFSET.z - roomHalf,
      INTERIOR_OFFSET.z + roomHalf,
    );
    resolveIndoorCollision(characterPosition, PLAYER_COLLISION_RADIUS);
  } else {
    const characterPosition = getCharacterPosition();
    resolveOutdoorCollision(characterPosition, PLAYER_COLLISION_RADIUS);
    // 橋のアーチに沿って、実際に高さを登り降りしながら渡れるようにする
    // （通常の地面・道の上では常に0が返るため、これまで通り平坦になる）。
    characterPosition.y = getGroundHeightAt(characterPosition.x, characterPosition.z);

    if (isMoving) {
      // キャラが今いるチャンクが変わったときだけ、周囲3x3チャンクの生成漏れを
      // 埋め、それより外側のチャンクは実際にアンロード（破棄）する
      updateWorldStreaming(characterPosition.x, characterPosition.z);
    }

    resolvePopulaceInterCollisions(characterPosition, PLAYER_COLLISION_RADIUS);
  }

  updateCameraFollow(isIndoorMode());

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateResourcePanel();
requestAnimationFrame(animate);
