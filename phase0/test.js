// フェーズ0の動作確認用サンプル実行コード
// 実行: node phase0/test.js

const {
  createGrid,
  setBorderWater,
  setTileType,
  canPlaceBuilding,
  placeBuilding,
  printGrid,
} = require('./townGrid');

const SIZE = 10;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

console.log('--- 1. 初期グリッド生成（外周water）---');
const grid = createGrid(SIZE);
setBorderWater(grid, SIZE);
printGrid(grid, SIZE);

assert(grid.length === SIZE * SIZE, `グリッドサイズが${SIZE * SIZE}マスである`);
assert(
  grid.find((c) => c.x === 0 && c.y === 0).tileType === 'water',
  '角(0,0)がwaterである'
);
assert(
  grid.find((c) => c.x === 5 && c.y === 5).tileType === 'grass',
  '中央(5,5)がgrassである'
);

console.log('\n--- 2. 道路がない状態での建築（失敗するはず）---');
const noRoadResult = placeBuilding(grid, SIZE, 5, 5, { type: 'house' });
assert(noRoadResult.success === false, '道路が隣接していないため建築失敗');
console.log('  理由:', noRoadResult.reason);

console.log('\n--- 3. 道路を敷設 ---');
setTileType(grid, SIZE, 5, 4, 'road');
printGrid(grid, SIZE);

console.log('\n--- 4. 道路に隣接するタイルへの建築（成功するはず）---');
console.log('  canPlaceBuilding:', canPlaceBuilding(grid, SIZE, 5, 5));
const result = placeBuilding(grid, SIZE, 5, 5, { type: 'house', seed: 1234 });
assert(result.success === true, '道路隣接タイルへの建築が成功する');

console.log('\n--- 5. 建物設置後のグリッド（Bで表示）---');
printGrid(grid, SIZE);

console.log('\n--- 6. 水タイルへの建築（失敗するはず）---');
const waterResult = placeBuilding(grid, SIZE, 0, 0, { type: 'house' });
assert(waterResult.success === false, 'waterタイルには建築できない');
console.log('  理由:', waterResult.reason);

console.log('\n--- 7. 既に建物があるタイルへの再建築（失敗するはず）---');
const dupResult = placeBuilding(grid, SIZE, 5, 5, { type: 'tree' });
assert(dupResult.success === false, '建物がすでにあるタイルには再建築できない');
console.log('  理由:', dupResult.reason);

console.log('\n--- 8. グリッド範囲外への建築（失敗するはず）---');
const outOfBoundsResult = placeBuilding(grid, SIZE, 99, 99, { type: 'house' });
assert(outOfBoundsResult.success === false, '範囲外には建築できない');
console.log('  理由:', outOfBoundsResult.reason);

console.log('\n=== フェーズ0 検証完了 ===');
