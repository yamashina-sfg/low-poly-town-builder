import * as THREE from 'three';
import { addInstance, UNIT_BOX_POOL } from './instancing.js';
import { TILE_SIZE } from './terrain.js';

const ROAD_BASE_COLOR = new THREE.Color(0x777777);
const ROAD_LINE_COLOR = new THREE.Color(0xf2f2f2);
const ZERO_ROTATION = new THREE.Euler(0, 0, 0);

const DIRECTIONS = [
  { key: 'N', dx: 0, dz: -1 },
  { key: 'S', dx: 0, dz: 1 },
  { key: 'E', dx: 1, dz: 0 },
  { key: 'W', dx: -1, dz: 0 },
];

/**
 * 上下左右の隣接タイルが道路かどうかを判定する。
 * これにより直線・角・T字・十字の見た目が自動的に決まる。
 * チャンクをまたいでも隣接判定できるよう、グローバルタイル座標と
 * ルックアップ関数getGlobalTile(gx, gy)を受け取る。
 */
export function computeRoadConnections(getGlobalTile, globalX, globalY) {
  const connections = {};
  DIRECTIONS.forEach(({ key, dx, dz }) => {
    const neighbor = getGlobalTile(globalX + dx, globalY + dz);
    connections[key] = neighbor?.userData.tileType === 'road';
  });
  return connections;
}

/**
 * 道路タイルを生成する。グレーの土台＋接続方向に伸びる白い破線で構成される。
 * @returns {{ kind: 'instances', parts: Array<{key: string, index: number}> }}
 */
export function generateRoad(tilePosition, connections, { animate = false } = {}) {
  const parts = [];

  const basePosition = new THREE.Vector3(tilePosition.x, 0.02, tilePosition.z);
  const baseScale = new THREE.Vector3(TILE_SIZE, 0.02, TILE_SIZE);
  parts.push(
    addInstance(UNIT_BOX_POOL, basePosition, ZERO_ROTATION, baseScale, ROAD_BASE_COLOR, { animate })
  );

  DIRECTIONS.forEach(({ key, dx, dz }) => {
    if (!connections[key]) return;

    const isHorizontal = dx !== 0;
    const dashLength = TILE_SIZE * 0.22;
    const scale = isHorizontal
      ? new THREE.Vector3(dashLength, 0.03, 0.12)
      : new THREE.Vector3(0.12, 0.03, dashLength);

    for (let i = 0; i < 2; i++) {
      const t = 0.2 + i * 0.28; // タイル中心から端へ向かう2つの破線マーク
      const position = new THREE.Vector3(
        tilePosition.x + dx * TILE_SIZE * t,
        0.04,
        tilePosition.z + dz * TILE_SIZE * t
      );
      parts.push(addInstance(UNIT_BOX_POOL, position, ZERO_ROTATION, scale, ROAD_LINE_COLOR, { animate }));
    }
  });

  return { kind: 'instances', parts };
}
