// 過去に発生した3つのバグのクラスが再発しないことを確認する回帰テスト。
// フェーズ17（コード基盤の整備）で導入。詳細はPROGRESS.mdのフェーズ8/カメラ修正/
// フェーズ10のsleep range修正を参照。
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';

describe('初期化順序のバグ（フェーズ8で発生したTDZ）の再発防止', () => {
  test('world.jsを読み込んだ直後から、登録済みの全タイル種別に対応するジェネレーターが揃っている', async () => {
    // フェーズ8のバグは、PROCEDURAL_GENERATORSがconstで宣言される「前」に
    // 同期的な起動処理から参照され、ReferenceError（TDZ）でクラッシュしていた。
    // モジュール読込直後（他の初期化関数を何も呼ばない状態）でも例外なく
    // レジストリが完全な形で使える、という最も直接的な形で再発を検知する。
    vi.resetModules();
    const world = await import('./world.js');

    const expectedTypes = [
      'house',
      'shop',
      'well',
      'warehouse',
      'tree',
      'bed',
      'table',
      'chair',
      'fireplace',
      'fence',
      'streetlamp',
      'bench',
      'flowerbed',
      'signpost',
    ];
    expectedTypes.forEach((type) => {
      expect(world.PROCEDURAL_GENERATORS[type]).toBeDefined();
      expect(typeof world.PROCEDURAL_GENERATORS[type].generate).toBe('function');
    });
  });
});

describe('カメラの符号反転バグ（前進すると手前に見えてしまった不具合）の再発防止', () => {
  test('CAMERA_OFFSET / INDOOR_CAMERA_OFFSETのZ成分は負でなければならない', async () => {
    // +forward*dist（Z成分が正）にすると、前進時にカメラがキャラの前方へ
    // 回り込んでしまい、キャラが手前に迫ってくるように見えるバグだった。
    const { CAMERA_OFFSET, INDOOR_CAMERA_OFFSET } = await import('./player.js');
    expect(CAMERA_OFFSET.z).toBeLessThan(0);
    expect(INDOOR_CAMERA_OFFSET.z).toBeLessThan(0);
  });

  test('前進方向を向いている間、カメラはキャラの後方に留まり続ける', async () => {
    const { initPlayer, setCharacterFacing, snapCameraToCharacter, getCharacterPosition } =
      await import('./player.js');
    const fakeScene = { add: () => {} };
    const fakeCamera = { position: new THREE.Vector3(), lookAt: () => {} };
    initPlayer(fakeScene, fakeCamera);

    // characterFacing = π は、Wキー押下時に収束していく「-Z方向へ前進中」の向き
    // （atan2(0, -1) = π）に相当する。
    setCharacterFacing(Math.PI);
    snapCameraToCharacter(false);

    const characterZ = getCharacterPosition().z;
    // カメラは前進方向(-Z)の反対側、つまりキャラより大きいZに留まるはず
    expect(fakeCamera.position.z).toBeGreaterThan(characterZ);
  });
});

describe('距離しきい値のバグ（隣接タイルのベッドに届かなかった不具合）の再発防止', () => {
  test('INTERACTION_RANGEはタイル間隔(TILE_SIZE)以上でなければならない', async () => {
    // 修正前はSLEEP_RANGE=1.4 < TILE_SIZE=2で、隣のタイルに置いたベッドに
    // キャラが乗っても距離判定に引っかからず「眠る」操作が出せなかった。
    const { INTERACTION_RANGE } = await import('./interactions.js');
    const { TILE_SIZE } = await import('../terrain.js');
    expect(INTERACTION_RANGE).toBeGreaterThanOrEqual(TILE_SIZE);
  });
});
