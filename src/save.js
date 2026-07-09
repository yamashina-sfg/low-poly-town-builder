import { getProceduralTileType } from './chunkManager.js';

const SAVE_KEY = 'lowPolyTownBuilder:save';
// フォーマットを変更するときはインクリメントする。
// v1: { seed, cells } のみ（経済・室内家具は未保存だった）
// v2: version, economy（木材・お金）, cells[].furniture（住居内の家具配置）を追加
// v3: cells[].rotationY（建築プレビューでのRキー回転）を追加
// v4: populace（NPCの家・満足度・服/帽子の色の配列）を追加
// v5: cells[].condition（建物の老朽化状態）・cells[].shopInventory（お店の
//     在庫）、economy.food（食料）を追加
const SAVE_VERSION = 5;

/**
 * 自然生成の下地(getProceduralTileType)と実際のタイル種別が異なるものだけを
 * { x, y, type }として抜き出す。これにより、プレイヤーが何も触っていない
 * 自然生成の木などは保存せずに済み（読込時に同じシードから再現される）、
 * 逆に「自然に生えた木を更地に戻した」といった変更は正しく保存される。
 * 住居タイルは、室内に家具が1つでも置かれていればfurniture配列も保存する。
 * 回転(rotationY)を持つ建物・装飾は、その値も保存する。
 * condition（維持費未払いによる老朽化の状態）・shopInventory（お店の在庫）
 * も、初期値と異なる場合のみ保存する（フェーズ25）。
 * populaceは、populace.jsのserializePopulace()が返す配列
 * （NPCの家のタイル座標・満足度・服/帽子の色）をそのまま受け取る
 * （フェーズ23：人口・満足度もセーブ/ロードで復元できるようにする）。
 */
export function serializeTown(forEachLoadedTile, worldSeed, economy, populace) {
  const cells = [];
  forEachLoadedTile((tile) => {
    const { globalX, globalY, tileType, indoorFurniture, rotationY, condition, shopInventory } =
      tile.userData;
    const baseType = getProceduralTileType(worldSeed, globalX, globalY);
    if (tileType !== baseType) {
      const cell = { x: globalX, y: globalY, type: tileType };
      if (tileType === 'house' && Array.isArray(indoorFurniture) && indoorFurniture.some(Boolean)) {
        cell.furniture = indoorFurniture;
      }
      if (rotationY) cell.rotationY = rotationY;
      if (Number.isFinite(condition)) cell.condition = condition;
      if (Number.isFinite(shopInventory)) cell.shopInventory = shopInventory;
      cells.push(cell);
    }
  });
  return { version: SAVE_VERSION, seed: worldSeed, cells, economy, populace: populace ?? [] };
}

export function saveTownToLocalStorage(forEachLoadedTile, worldSeed, economy, populace) {
  const data = serializeTown(forEachLoadedTile, worldSeed, economy, populace);
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/**
 * @returns {{
 *   version: number,
 *   seed: number,
 *   cells: Array<{x:number,y:number,type:string,furniture?: Array<string|null>,condition?:number,shopInventory?:number}>,
 *   economy?: { wood: number, money: number },
 *   populace?: Array<{homeX:number|null,homeY:number|null,satisfaction:number,clothingColor:number,hatColor:number}>,
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
