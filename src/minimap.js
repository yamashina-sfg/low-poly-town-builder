// 追加のWebGLレンダラーを使わず、2D Canvasで簡易的なミニマップを描画する。

const MINIMAP_SIZE = 150;
const WORLD_RADIUS = 24; // 表示するワールド範囲（半径・ユニット）

const TILE_TYPE_COLORS = {
  grass: '#4b7a3a',
  tree: '#2f5730',
  house: '#c9a66b',
  shop: '#e8d9a8',
  well: '#9a9a8c',
  warehouse: '#8a7a5c',
  windmill: '#d8c9a3',
  road: '#8a8a8a',
  dirtRoad: '#8a6a4a',
  cobblestone: '#a8a196',
  bridge: '#9c7a4a',
  water: '#3a7ca5',
  bed: '#c9a66b',
  table: '#c9a66b',
  chair: '#c9a66b',
  fireplace: '#c9a66b',
  fence: '#8a5a3c',
  streetlamp: '#8a5a3c',
  bench: '#8a5a3c',
  flowerbed: '#d9455f',
  signpost: '#8a5a3c',
  statue: '#7c9a8a',
  ruins: '#8a8a7c',
  specialTree: '#c9a227',
};

let ctx = null;

export function initMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  ctx = canvas.getContext('2d');
}

/**
 * キャラクターを中心に、周囲のタイルを円形ミニマップとして描画する。
 * 呼び出しコストがあるため、main.js側で間引いて呼ぶ想定。
 */
export function updateMinimap({ characterPosition, characterFacing, forEachLoadedTile }) {
  if (!ctx) return;

  ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.fillStyle = 'rgba(20, 30, 20, 0.55)';
  ctx.beginPath();
  ctx.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();

  const scale = MINIMAP_SIZE / 2 / WORLD_RADIUS;

  ctx.save();
  ctx.beginPath();
  ctx.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();

  forEachLoadedTile((tile) => {
    const dx = tile.position.x - characterPosition.x;
    const dz = tile.position.z - characterPosition.z;
    if (Math.abs(dx) > WORLD_RADIUS || Math.abs(dz) > WORLD_RADIUS) return;

    const px = MINIMAP_SIZE / 2 + dx * scale;
    const py = MINIMAP_SIZE / 2 + dz * scale;
    ctx.fillStyle = TILE_TYPE_COLORS[tile.userData.tileType] || TILE_TYPE_COLORS.grass;
    ctx.fillRect(px - 2, py - 2, 4, 4);
  });
  ctx.restore();

  // キャラクターの位置・向きを中心の三角形で表示
  ctx.save();
  ctx.translate(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2);
  ctx.rotate(characterFacing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
