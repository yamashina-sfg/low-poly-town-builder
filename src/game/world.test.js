import { describe, test, expect } from 'vitest';
import {
  isTilePlaceable,
  isConnectedToRoad,
  initWorld,
  buildOnTile,
  moveTileContent,
  removeTileContent,
  DEFAULT_BUILDING_CONDITION,
  DEFAULT_SHOP_INVENTORY,
  BUILDING_TYPES,
  DECORATION_TYPES,
  MAINTAINED_BUILDING_TYPES,
} from './world.js';
import { getGlobalTile } from '../chunkManager.js';

function makeTile(tileType) {
  return { userData: { tileType } };
}

describe('isTilePlaceable（フェーズ21の重なりチェック＋フェーズ22の橋のルール）', () => {
  test('橋は水タイルにしか設置できない', () => {
    expect(isTilePlaceable(makeTile('water'), 'bridge')).toBe(true);
    expect(isTilePlaceable(makeTile('grass'), 'bridge')).toBe(false);
    expect(isTilePlaceable(makeTile('road'), 'bridge')).toBe(false);
  });

  test('橋以外の道（road/dirtRoad/cobblestone）は水タイルには敷けない', () => {
    expect(isTilePlaceable(makeTile('water'), 'road')).toBe(false);
    expect(isTilePlaceable(makeTile('water'), 'dirtRoad')).toBe(false);
    expect(isTilePlaceable(makeTile('water'), 'cobblestone')).toBe(false);
    expect(isTilePlaceable(makeTile('grass'), 'dirtRoad')).toBe(true);
  });

  test('建物・装飾は更地(grass)にしか設置できない', () => {
    expect(isTilePlaceable(makeTile('grass'), 'house')).toBe(true);
    expect(isTilePlaceable(makeTile('house'), 'shop')).toBe(false);
    expect(isTilePlaceable(makeTile('road'), 'fence')).toBe(false);
  });

  test('地形系（木・水・更地に戻す等）は常に設置可能', () => {
    expect(isTilePlaceable(makeTile('house'), 'tree')).toBe(true);
    expect(isTilePlaceable(makeTile('road'), 'water')).toBe(true);
    expect(isTilePlaceable(makeTile('house'), 'clear')).toBe(true);
  });

  test('フェーズ25：生産施設（畑・伐採小屋）も建物と同様、更地(grass)にしか設置できない', () => {
    expect(isTilePlaceable(makeTile('grass'), 'farm')).toBe(true);
    expect(isTilePlaceable(makeTile('grass'), 'loggingHut')).toBe(true);
    expect(isTilePlaceable(makeTile('house'), 'farm')).toBe(false);
  });

  test('タイルがnull（未読込チャンク）の場合はfalse', () => {
    expect(isTilePlaceable(null, 'house')).toBe(false);
  });

  test('フェーズ26：公共施設（役場・広場・噴水）も建物と同様、更地(grass)にしか設置できない', () => {
    ['townHall', 'plaza', 'fountain'].forEach((type) => {
      expect(isTilePlaceable(makeTile('grass'), type)).toBe(true);
      expect(isTilePlaceable(makeTile('house'), type)).toBe(false);
    });
  });

  test('フェーズ26：新しい地形バリエーション（砂利道・花畑・芝生2種）は常に設置可能', () => {
    ['gravelPath', 'flowerMeadow', 'lushLawn', 'wildGrass'].forEach((type) => {
      expect(isTilePlaceable(makeTile('house'), type)).toBe(true);
      expect(isTilePlaceable(makeTile('road'), type)).toBe(true);
    });
  });

  test('フェーズ26：砂利道は橋以外の道と同様、水タイルには敷けない', () => {
    expect(isTilePlaceable(makeTile('water'), 'gravelPath')).toBe(false);
  });
});

describe('BUILDING_TYPES / DECORATION_TYPES / MAINTAINED_BUILDING_TYPES（フェーズ26で追加した種類）', () => {
  test('公共施設（役場・広場・噴水）はBUILDING_TYPESかつMAINTAINED_BUILDING_TYPESに含まれる', () => {
    ['townHall', 'plaza', 'fountain'].forEach((type) => {
      expect(BUILDING_TYPES.has(type)).toBe(true);
      expect(MAINTAINED_BUILDING_TYPES.has(type)).toBe(true);
    });
  });

  test('季節オブジェクト（季節の木・提灯・雪だるま）はDECORATION_TYPESに含まれる', () => {
    ['seasonalTree', 'lantern', 'snowman'].forEach((type) => {
      expect(DECORATION_TYPES.has(type)).toBe(true);
      expect(MAINTAINED_BUILDING_TYPES.has(type)).toBe(false); // 装飾に維持費はかからない
    });
  });

  test('地形バリエーションはBUILDING_TYPESにもDECORATION_TYPESにも含まれない（自由に上書きできる地形のため）', () => {
    ['gravelPath', 'flowerMeadow', 'lushLawn', 'wildGrass'].forEach((type) => {
      expect(BUILDING_TYPES.has(type)).toBe(false);
      expect(DECORATION_TYPES.has(type)).toBe(false);
    });
  });
});

describe('isConnectedToRoad（フェーズ22：建物が道に接続されているか）', () => {
  test('隣接タイルに道があれば接続とみなす', () => {
    initWorld({ add: () => {} });
    const spawnTile = getGlobalTile(5, 5); // スポーン地点は常にgrass
    buildOnTile(spawnTile, 'road');
    const neighborOfSpawn = getGlobalTile(5, 6);
    expect(isConnectedToRoad(neighborOfSpawn)).toBe(true);
  });

  test('隣接タイルに道がなければ未接続', () => {
    initWorld({ add: () => {} });
    const farTile = getGlobalTile(-3, -3);
    expect(isConnectedToRoad(farTile)).toBe(false);
  });
});

describe('condition / shopInventory（フェーズ25：老朽化・お店の在庫のライフサイクル）', () => {
  const fakeScene = { add: () => {}, remove: () => {} };

  test('維持費のかかる建物は、初期状態(condition)を持って建つ', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'house');
    expect(tile.userData.condition).toBe(DEFAULT_BUILDING_CONDITION);
  });

  test('維持費のかからない種類（地形・装飾等）はconditionを持たない', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'fence');
    expect(tile.userData.condition).toBeUndefined();
  });

  test('お店は在庫(shopInventory)を持って建つ', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'shop');
    expect(tile.userData.shopInventory).toBe(DEFAULT_SHOP_INVENTORY);
  });

  test('建て直しても、老朽化した状態はリセットされない（同じタイルにbuildOnTileを再度呼んでも維持される）', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'house');
    tile.userData.condition = 40;
    buildOnTile(tile, 'house');
    expect(tile.userData.condition).toBe(40);
  });

  test('移動すると、老朽化の状態・お店の在庫が新しいタイルに引き継がれる', () => {
    initWorld(fakeScene);
    const fromTile = getGlobalTile(5, 5);
    const toTile = getGlobalTile(5, 6);
    buildOnTile(fromTile, 'shop');
    fromTile.userData.condition = 55;
    fromTile.userData.shopInventory = 12;

    moveTileContent(fromTile, toTile);

    expect(toTile.userData.condition).toBe(55);
    expect(toTile.userData.shopInventory).toBe(12);
  });

  test('撤去すると、conditionとshopInventoryは消える（更地に戻るため）', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'shop');
    removeTileContent(tile);
    expect(tile.userData.condition).toBeUndefined();
    expect(tile.userData.shopInventory).toBeUndefined();
  });

  test('フェーズ26：公共施設（役場・広場・噴水）も維持費のかかる建物としてconditionを持って建つ', () => {
    ['townHall', 'plaza', 'fountain'].forEach((type) => {
      const tile = getGlobalTile(5, 5);
      buildOnTile(tile, type);
      expect(tile.userData.condition).toBe(DEFAULT_BUILDING_CONDITION);
    });
  });
});

describe('新しい建物・地形の生成（フェーズ26）', () => {
  const fakeScene = { add: () => {}, remove: () => {} };

  test('噴水は石組み（InstancedMesh）と水面メッシュの両方を持つcompositeとして生成される', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'fountain');
    expect(tile.userData.object.kind).toBe('composite');
    expect(tile.userData.object.parts.length).toBeGreaterThan(0);
    expect(tile.userData.object.meshes.length).toBe(1);
  });

  test('噴水を撤去すると、水面メッシュも含めて後始末される（クラッシュしない）', () => {
    initWorld(fakeScene);
    const tile = getGlobalTile(5, 5);
    buildOnTile(tile, 'fountain');
    expect(() => removeTileContent(tile)).not.toThrow();
    expect(tile.userData.tileType).toBe('grass');
  });

  test('役場・広場はInstancedMeshのパーツを持つ通常の建物として生成される', () => {
    initWorld(fakeScene);
    ['townHall', 'plaza'].forEach((type) => {
      const tile = getGlobalTile(5, 5);
      buildOnTile(tile, type);
      expect(tile.userData.object.kind).toBe('instances');
      expect(tile.userData.object.parts.length).toBeGreaterThan(0);
    });
  });

  test('季節オブジェクト（季節の木・提灯・雪だるま）はseasonalPartsを持って生成される', () => {
    initWorld(fakeScene);
    ['seasonalTree', 'lantern', 'snowman'].forEach((type) => {
      const tile = getGlobalTile(5, 5);
      buildOnTile(tile, type);
      expect(Array.isArray(tile.userData.object.seasonalParts)).toBe(true);
      expect(tile.userData.object.seasonalParts.length).toBeGreaterThan(0);
    });
  });

  test('地形バリエーション（砂利道・花畑・芝生2種）はクラッシュせず生成される', () => {
    initWorld(fakeScene);
    ['gravelPath', 'flowerMeadow', 'lushLawn', 'wildGrass'].forEach((type) => {
      const tile = getGlobalTile(5, 5);
      expect(() => buildOnTile(tile, type)).not.toThrow();
      expect(tile.userData.tileType).toBe(type);
      expect(tile.userData.object.parts.length).toBeGreaterThan(0);
    });
  });
});
