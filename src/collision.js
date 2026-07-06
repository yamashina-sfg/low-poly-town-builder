// タイル・エンティティ間の簡易的な円形衝突判定。
// 「押し出し」方式（重なった分だけ位置を押し戻す）で解決するため、
// 斜め移動時に壁沿いへ自然にスライドする（詰まりにくい）。

// タイル種別ごとの当たり判定半径。ここに載っていない種別
// （grass/road/clear等）は衝突しない＝自由に歩ける。
// タイル間隔(2ユニット)より半径の合計が大きくなるようにしておくと、
// 建物や柵を隙間なく並べたときにきちんと通れない壁になる。
export const TILE_COLLISION_RADII = {
  house: 1.05,
  shop: 1.05,
  well: 0.5,
  warehouse: 1.1,
  tree: 0.35,
  water: 1.05,
  bed: 0.5,
  table: 0.4,
  chair: 0.25,
  fireplace: 0.4,
  fence: 1.05,
  streetlamp: 0.2,
  bench: 0.5,
  flowerbed: 0.6,
  signpost: 0.2,
};

/**
 * positionを中心とした半径radiusの円が、tilesの中の衝突対象タイルと
 * 重なっていれば、重なりがなくなるまでpositionを押し戻す。
 * tilesは{ position: THREE.Vector3-like, userData: { tileType } }を
 * 持つオブジェクトの配列（nullを含んでいてもよい）。
 */
export function resolveCollisionAgainstTiles(position, radius, tiles) {
  tiles.forEach((tile) => {
    if (!tile) return;
    const obstacleRadius = TILE_COLLISION_RADII[tile.userData.tileType];
    if (obstacleRadius === undefined) return;

    const dx = position.x - tile.position.x;
    const dz = position.z - tile.position.z;
    const distance = Math.hypot(dx, dz);
    const minDistance = radius + obstacleRadius;
    if (distance >= minDistance) return;

    const push = minDistance - distance;
    if (distance > 0.0001) {
      position.x += (dx / distance) * push;
      position.z += (dz / distance) * push;
    } else {
      // 完全に同じ座標にいる場合（ゼロ除算回避）は任意の方向へ押し出す
      position.x += push;
    }
  });
}

/**
 * 2つの円形エンティティが重なっていたら、半分ずつ押し出して離す
 * （プレイヤーとNPC、NPC同士のすり抜け防止用のゆるい反発処理）。
 */
export function pushEntitiesApart(positionA, radiusA, positionB, radiusB) {
  const dx = positionA.x - positionB.x;
  const dz = positionA.z - positionB.z;
  const distance = Math.hypot(dx, dz);
  const minDistance = radiusA + radiusB;
  if (distance >= minDistance) return;

  const overlap = (minDistance - distance) / 2;
  if (distance > 0.0001) {
    const nx = dx / distance;
    const nz = dz / distance;
    positionA.x += nx * overlap;
    positionA.z += nz * overlap;
    positionB.x -= nx * overlap;
    positionB.z -= nz * overlap;
  } else {
    positionA.x += overlap;
    positionB.x -= overlap;
  }
}
