// フェーズ0: グリッドとタイル管理のロジック検証（描画なし）

const TILE_TYPES = ['empty', 'grass', 'road', 'water'];

/**
 * N x N のグリッドを生成する。
 * 各セルは { x, y, tileType, building } を持つ。
 * @param {number} size
 * @returns {Array<{x:number,y:number,tileType:string,building:null|object}>}
 */
function createGrid(size) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      grid.push({ x, y, tileType: 'grass', building: null });
    }
  }
  return grid;
}

function getCell(grid, size, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return grid[y * size + x];
}

function setTileType(grid, size, x, y, tileType) {
  if (!TILE_TYPES.includes(tileType)) {
    throw new Error(`不正なtileType: ${tileType}`);
  }
  const cell = getCell(grid, size, x, y);
  if (!cell) return false;
  cell.tileType = tileType;
  return true;
}

/**
 * 外周をすべて'water'にするテスト関数
 */
function setBorderWater(grid, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        setTileType(grid, size, x, y, 'water');
      }
    }
  }
}

/**
 * 上下左右の隣接セルに'road'があるかどうか
 */
function isAdjacentToRoad(grid, size, x, y) {
  const neighbors = [
    getCell(grid, size, x, y - 1),
    getCell(grid, size, x, y + 1),
    getCell(grid, size, x - 1, y),
    getCell(grid, size, x + 1, y),
  ];
  return neighbors.some((cell) => cell && cell.tileType === 'road');
}

/**
 * 建物を置けるかどうかを検証する。
 * - グリッド範囲内であること
 * - tileTypeが'grass'であること（road/water/emptyには置けない）
 * - すでに建物が置かれていないこと
 * - 隣接する道路があること
 * @returns {{ ok: boolean, reason?: string }}
 */
function canPlaceBuilding(grid, size, x, y) {
  const cell = getCell(grid, size, x, y);
  if (!cell) return { ok: false, reason: 'グリッド範囲外です' };
  if (cell.tileType !== 'grass') {
    return { ok: false, reason: `tileTypeが'${cell.tileType}'のため建築不可です` };
  }
  if (cell.building) {
    return { ok: false, reason: 'すでに建物が存在します' };
  }
  if (!isAdjacentToRoad(grid, size, x, y)) {
    return { ok: false, reason: '隣接する道路がありません' };
  }
  return { ok: true };
}

/**
 * 特定の座標に建物をセットする
 * @returns {{ success: boolean, reason?: string }}
 */
function placeBuilding(grid, size, x, y, buildingData) {
  const validation = canPlaceBuilding(grid, size, x, y);
  if (!validation.ok) {
    return { success: false, reason: validation.reason };
  }
  const cell = getCell(grid, size, x, y);
  cell.building = buildingData;
  return { success: true };
}

const TILE_SYMBOLS = {
  empty: ' ',
  grass: '.',
  road: '=',
  water: '~',
};

/**
 * グリッドを文字グリッドとしてconsole.logで可視化する。
 * 建物が置かれているセルは 'B' で表示する。
 */
function printGrid(grid, size) {
  const lines = [];
  for (let y = 0; y < size; y++) {
    let line = '';
    for (let x = 0; x < size; x++) {
      const cell = getCell(grid, size, x, y);
      line += cell.building ? 'B' : TILE_SYMBOLS[cell.tileType];
    }
    lines.push(line);
  }
  console.log(lines.join('\n'));
}

module.exports = {
  TILE_TYPES,
  createGrid,
  getCell,
  setTileType,
  setBorderWater,
  isAdjacentToRoad,
  canPlaceBuilding,
  placeBuilding,
  printGrid,
};
