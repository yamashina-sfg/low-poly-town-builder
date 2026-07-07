import { describe, test, expect, beforeEach } from 'vitest';
import { serializeTown, saveTownToLocalStorage, loadTownFromLocalStorage } from './save.js';
import { getProceduralTileType } from './chunkManager.js';

const WORLD_SEED = 3;

// 自然生成の下地とは異なるタイル(house)と、下地と同じ(=保存不要な)タイルの2つを用意する。
function makeFakeTiles() {
  const naturalType = getProceduralTileType(WORLD_SEED, 1, 1);
  return [
    {
      userData: { globalX: 1, globalY: 1, tileType: naturalType, indoorFurniture: undefined },
    },
    {
      userData: {
        globalX: 2,
        globalY: 2,
        tileType: 'house',
        indoorFurniture: ['bed', null, null, null, null, null, null, null, null],
      },
    },
  ];
}

function forEachFakeTile(tiles, callback) {
  tiles.forEach(callback);
}

describe('serializeTown', () => {
  test('自然生成の下地と同じタイルは保存対象から除外される', () => {
    const tiles = makeFakeTiles();
    const data = serializeTown((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, { wood: 5, money: 10 });
    const savedCoords = data.cells.map((c) => `${c.x},${c.y}`);
    expect(savedCoords).not.toContain('1,1');
  });

  test('下地と異なるタイル（家など）は保存され、家具レイアウトも含まれる', () => {
    const tiles = makeFakeTiles();
    const data = serializeTown((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, { wood: 5, money: 10 });
    const houseCell = data.cells.find((c) => c.x === 2 && c.y === 2);
    expect(houseCell).toBeDefined();
    expect(houseCell.type).toBe('house');
    expect(houseCell.furniture).toEqual(['bed', null, null, null, null, null, null, null, null]);
  });

  test('economy・seed・versionを含む', () => {
    const tiles = makeFakeTiles();
    const data = serializeTown((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, { wood: 5, money: 10 });
    expect(data.seed).toBe(WORLD_SEED);
    expect(data.economy).toEqual({ wood: 5, money: 10 });
    expect(typeof data.version).toBe('number');
  });

  test('フェーズ23：populace（NPCの家・満足度）を含む。省略時は空配列になる', () => {
    const tiles = makeFakeTiles();
    const populace = [{ homeX: 2, homeY: 2, satisfaction: 42, clothingColor: 0xff0000, hatColor: 0x00ff00 }];
    const withPopulace = serializeTown(
      (cb) => forEachFakeTile(tiles, cb),
      WORLD_SEED,
      { wood: 5, money: 10 },
      populace,
    );
    expect(withPopulace.populace).toEqual(populace);

    const withoutPopulace = serializeTown((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, {
      wood: 5,
      money: 10,
    });
    expect(withoutPopulace.populace).toEqual([]);
  });
});

describe('localStorageへの保存・読込', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('保存したデータをそのまま読み込める（往復一致）', () => {
    const tiles = makeFakeTiles();
    saveTownToLocalStorage((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, { wood: 5, money: 10 });
    const loaded = loadTownFromLocalStorage();
    expect(loaded.seed).toBe(WORLD_SEED);
    expect(loaded.economy).toEqual({ wood: 5, money: 10 });
    expect(loaded.cells.find((c) => c.x === 2 && c.y === 2).type).toBe('house');
  });

  test('フェーズ23：populace（NPCの家・満足度）も往復一致する', () => {
    const tiles = makeFakeTiles();
    const populace = [{ homeX: 2, homeY: 2, satisfaction: 77, clothingColor: 0x123456, hatColor: 0x654321 }];
    saveTownToLocalStorage((cb) => forEachFakeTile(tiles, cb), WORLD_SEED, { wood: 5, money: 10 }, populace);
    const loaded = loadTownFromLocalStorage();
    expect(loaded.populace).toEqual(populace);
  });

  test('セーブデータが存在しなければnullを返す', () => {
    expect(loadTownFromLocalStorage()).toBeNull();
  });

  test('壊れたJSONが保存されていてもクラッシュせずnullを返す', () => {
    localStorage.setItem('lowPolyTownBuilder:save', '{not valid json');
    expect(loadTownFromLocalStorage()).toBeNull();
  });

  test('cellsを持たない旧形式・不正なデータもnullを返す', () => {
    localStorage.setItem('lowPolyTownBuilder:save', JSON.stringify({ seed: 1 }));
    expect(loadTownFromLocalStorage()).toBeNull();
  });
});
