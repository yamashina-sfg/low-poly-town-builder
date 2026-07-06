import { describe, test, expect } from 'vitest';
import {
  worldToChunkCoords,
  worldToGlobalTileCoords,
  globalTileToChunkCoords,
  getProceduralTileType,
  updateChunkStreaming,
  getGlobalTile,
  getLoadedChunkCount,
  CHUNK_SIZE,
  TILE_SIZE,
  CHUNK_WORLD_SIZE,
} from './chunkManager.js';

describe('座標変換', () => {
  test('worldToChunkCoords: チャンク境界をまたぐと座標が1つ変わる', () => {
    expect(worldToChunkCoords(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(worldToChunkCoords(CHUNK_WORLD_SIZE, 0)).toEqual({ cx: 1, cy: 0 });
    expect(worldToChunkCoords(-CHUNK_WORLD_SIZE, 0)).toEqual({ cx: -1, cy: 0 });
  });

  test('worldToGlobalTileCoords: タイル境界をまたぐと座標が1つ変わる', () => {
    const base = worldToGlobalTileCoords(0, 0);
    const next = worldToGlobalTileCoords(TILE_SIZE, 0);
    expect(next.gx).toBe(base.gx + 1);
    expect(next.gy).toBe(base.gy);
  });

  test('globalTileToChunkCoords: CHUNK_SIZE個ごとにチャンク座標が1つ進む', () => {
    expect(globalTileToChunkCoords(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(globalTileToChunkCoords(CHUNK_SIZE, 0)).toEqual({ cx: 1, cy: 0 });
    expect(globalTileToChunkCoords(CHUNK_SIZE - 1, 0)).toEqual({ cx: 0, cy: 0 });
  });
});

describe('getProceduralTileType', () => {
  test('同じシード・座標なら常に同じ結果になる（決定論的）', () => {
    const a = getProceduralTileType(42, 12, -8);
    const b = getProceduralTileType(42, 12, -8);
    expect(a).toBe(b);
  });

  test('シードが違えば結果が変わりうる（毎回同じ木の配置にならない）', () => {
    const results = new Set();
    for (let seed = 0; seed < 20; seed += 1) {
      results.add(getProceduralTileType(seed, 3, 3));
    }
    // 全シードで同じ結果になっていない＝シードが実際に効いていることの確認
    expect(results.size).toBeGreaterThan(1);
  });

  test('スポーン地点(5,5)には自然に木が生えない', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(getProceduralTileType(seed, 5, 5)).toBe('grass');
    }
  });

  test('結果はgrassかtreeのいずれかしか返さない', () => {
    for (let gx = 0; gx < 10; gx += 1) {
      expect(['grass', 'tree']).toContain(getProceduralTileType(1, gx, 0));
    }
  });

  test('拠点から近い場所（探索の報酬の対象外）にはランドマークが出現しない', () => {
    // スポーン(5,5)周辺、半径15タイル未満の範囲はすべてgrass/treeのみになるはず
    for (let gx = -5; gx <= 15; gx += 1) {
      for (let seed = 0; seed < 5; seed += 1) {
        expect(['grass', 'tree']).toContain(getProceduralTileType(seed, gx, 5));
      }
    }
  });

  test('拠点から十分離れた場所には、低確率でruins/specialTreeが出現しうる', () => {
    // LANDMARK_CHANCE(0.004)に対して十分なサンプル数を取り、
    // 統計的にほぼ確実に最低1つは出現するようにする（期待値約8個）。
    const results = new Set();
    for (let gx = 100; gx < 2100; gx += 1) {
      results.add(getProceduralTileType(1, gx, 100));
    }
    expect(results.has('ruins') || results.has('specialTree')).toBe(true);
  });
});

describe('チャンクの読込・アンロードと差分キャッシュ（フェーズ16の復元ロジック）', () => {
  test('遠くへ移動してチャンクがアンロードされても、手を加えたタイルは再訪時に復元される', () => {
    const worldSeed = 7;
    const disposed = [];
    const restored = [];

    // 原点付近のチャンクを読み込む
    updateChunkStreaming(0, 0, {
      worldSeed,
      onProceduralTile: () => {},
      onRestoreTile: () => {},
      onTileDispose: (tile) => disposed.push(tile),
    });

    // スポーン地点以外の、自然生成では'grass'になるタイルを探してプレイヤーが手を加えたことにする
    let editedTile = null;
    for (let gx = 0; gx < CHUNK_SIZE && !editedTile; gx += 1) {
      for (let gy = 0; gy < CHUNK_SIZE && !editedTile; gy += 1) {
        if (gx === 5 && gy === 5) continue;
        if (getProceduralTileType(worldSeed, gx, gy) === 'grass') {
          editedTile = getGlobalTile(gx, gy);
        }
      }
    }
    expect(editedTile).not.toBeNull();
    editedTile.userData.tileType = 'house';

    // 遠くへ移動する（LOAD_RADIUS=1を超えるため、元のチャンクは実際にアンロードされる）
    updateChunkStreaming(2000, 2000, {
      worldSeed,
      onProceduralTile: () => {},
      onRestoreTile: () => {},
      onTileDispose: (tile) => disposed.push(tile),
    });

    expect(disposed).toContain(editedTile);
    expect(getGlobalTile(editedTile.userData.globalX, editedTile.userData.globalY)).toBeNull();

    // 元の場所に戻ると、差分キャッシュから'house'が復元される
    updateChunkStreaming(0, 0, {
      worldSeed,
      onProceduralTile: () => {},
      onRestoreTile: (tile, type) => restored.push({ tile, type }),
      onTileDispose: () => {},
    });

    const restoredEntry = restored.find(
      (entry) =>
        entry.tile.userData.globalX === editedTile.userData.globalX &&
        entry.tile.userData.globalY === editedTile.userData.globalY,
    );
    expect(restoredEntry).toBeDefined();
    expect(restoredEntry.type).toBe('house');
  });

  test('読み込まれているチャンク数はキャラ周囲3x3(9個)を超えない', () => {
    updateChunkStreaming(0, 0, {
      worldSeed: 1,
      onProceduralTile: () => {},
      onRestoreTile: () => {},
      onTileDispose: () => {},
    });
    expect(getLoadedChunkCount()).toBe(9);
  });
});
