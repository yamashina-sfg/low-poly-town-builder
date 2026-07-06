import { getProceduralTileType } from './chunkManager.js';

const SAVE_KEY = 'lowPolyTownBuilder:save';
// フォーマットを変更するときはインクリメントする。
// v1: { seed, cells } のみ（経済・室内家具は未保存だった）
// v2: version, economy（木材・お金）, cells[].furniture（住居内の家具配置）を追加
const SAVE_VERSION = 2;

/**
 * 自然生成の下地(getProceduralTileType)と実際のタイル種別が異なるものだけを
 * { x, y, type }として抜き出す。これにより、プレイヤーが何も触っていない
 * 自然生成の木などは保存せずに済み（読込時に同じシードから再現される）、
 * 逆に「自然に生えた木を更地に戻した」といった変更は正しく保存される。
 * 住居タイルは、室内に家具が1つでも置かれていればfurniture配列も保存する。
 */
export function serializeTown(forEachLoadedTile, worldSeed, economy) {
  const cells = [];
  forEachLoadedTile((tile) => {
    const { globalX, globalY, tileType, indoorFurniture } = tile.userData;
    const baseType = getProceduralTileType(worldSeed, globalX, globalY);
    if (tileType !== baseType) {
      const cell = { x: globalX, y: globalY, type: tileType };
      if (tileType === 'house' && Array.isArray(indoorFurniture) && indoorFurniture.some(Boolean)) {
        cell.furniture = indoorFurniture;
      }
      cells.push(cell);
    }
  });
  return { version: SAVE_VERSION, seed: worldSeed, cells, economy };
}

export function saveTownToLocalStorage(forEachLoadedTile, worldSeed, economy) {
  const data = serializeTown(forEachLoadedTile, worldSeed, economy);
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/**
 * @returns {{
 *   version: number,
 *   seed: number,
 *   cells: Array<{x:number,y:number,type:string,furniture?: Array<string|null>}>,
 *   economy?: { wood: number, money: number },
 * } | null}
 * 壊れたデータ・旧フォーマットのデータでもnullまたは読める範囲の
 * プレーンオブジェクトを返し、呼び出し側でフィールドの有無を判定できるようにする。
 */
export function loadTownFromLocalStorage() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.cells)) return null;
    return data;
  } catch {
    return null;
  }
}
