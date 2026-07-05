const SAVE_KEY = 'lowPolyTownBuilder:save';

/**
 * grass以外のタイルだけを{ x, y, type }の配列として抜き出し、
 * 現在のワールドシードと合わせてプレーンオブジェクトにする。
 */
export function serializeTown(terrain, worldSeed) {
  const cells = [];
  terrain.children.forEach((tile) => {
    const { gridX, gridY, tileType } = tile.userData;
    if (tileType !== 'grass') {
      cells.push({ x: gridX, y: gridY, type: tileType });
    }
  });
  return { seed: worldSeed, cells };
}

export function saveTownToLocalStorage(terrain, worldSeed) {
  const data = serializeTown(terrain, worldSeed);
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
