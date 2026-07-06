import { getProceduralTileType } from './chunkManager.js';

const SAVE_KEY = 'lowPolyTownBuilder:save';

/**
 * 自然生成の下地(getProceduralTileType)と実際のタイル種別が異なるものだけを
 * { x, y, type }として抜き出す。これにより、プレイヤーが何も触っていない
 * 自然生成の木などは保存せずに済み（読込時に同じシードから再現される）、
 * 逆に「自然に生えた木を更地に戻した」といった変更は正しく保存される。
 */
export function serializeTown(forEachLoadedTile, worldSeed) {
  const cells = [];
  forEachLoadedTile((tile) => {
    const { globalX, globalY, tileType } = tile.userData;
    const baseType = getProceduralTileType(worldSeed, globalX, globalY);
    if (tileType !== baseType) {
      cells.push({ x: globalX, y: globalY, type: tileType });
    }
  });
  return { seed: worldSeed, cells };
}

export function saveTownToLocalStorage(forEachLoadedTile, worldSeed) {
  const data = serializeTown(forEachLoadedTile, worldSeed);
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/**
 * @returns {{ seed: number, cells: Array<{x:number,y:number,type:string}> } | null}
 */
export function loadTownFromLocalStorage() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.cells)) return null;
    return data;
  } catch {
    return null;
  }
}
