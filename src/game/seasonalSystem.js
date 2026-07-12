// フェーズ26：季節オブジェクト（季節の木・提灯・雪だるま）の見た目を、
// 季節・時間帯の変化に合わせて自動的に塗り替える。
// 色の計算そのものはdecorations.jsに集約し、ここでは「いつ・どのタイルに
// 適用するか」だけを扱う（生成時の初期の見た目もdecorations.js側の
// 同じ関数を使っており、二重管理にならないようにしている）。
import { forEachLoadedTile } from '../chunkManager.js';
import { setInstanceColor } from '../instancing.js';
import { getGameTime, isNightHours } from '../gameTime.js';
import { advanceSeason, getCurrentSeason } from '../season.js';
import { getSeasonalTreeFoliageColor, getLanternGlowColor, getSnowmanBodyColor } from '../decorations.js';

const SEASONAL_TYPES = new Set(['seasonalTree', 'lantern', 'snowman']);
// 見た目の再チェック間隔（秒）。季節・昼夜が実際に変わったときだけ
// 塗り替えが走るため、この間隔自体は短くても負荷は小さい。
const RECHECK_INTERVAL = 3;

function colorForType(type, season, isNight) {
  if (type === 'seasonalTree') return getSeasonalTreeFoliageColor(season);
  if (type === 'lantern') return getLanternGlowColor(isNight);
  if (type === 'snowman') return getSnowmanBodyColor(season);
  return null;
}

function applySeasonalVisual(tile, season, isNight) {
  const entry = tile.userData.object;
  if (!entry || !Array.isArray(entry.seasonalParts)) return;
  const color = colorForType(tile.userData.tileType, season, isNight);
  if (!color) return;
  entry.seasonalParts.forEach((part) => setInstanceColor(part, color));
}

let recheckTimer = 0;
let lastSeason = null;
let lastIsNight = null;

/**
 * 季節時計を進め、季節・昼夜のどちらかが変化していれば、読み込み済みの
 * 季節オブジェクト全てを塗り替える。main.jsのメインループから毎フレーム
 * delta（実時間の経過秒数）を渡して呼ぶ想定。
 */
export function updateSeasonalSystem(delta) {
  advanceSeason(delta);

  recheckTimer += delta;
  if (recheckTimer < RECHECK_INTERVAL) return;
  recheckTimer = 0;

  const season = getCurrentSeason();
  const isNight = isNightHours(getGameTime().hours);
  if (season === lastSeason && isNight === lastIsNight) return;
  lastSeason = season;
  lastIsNight = isNight;

  forEachLoadedTile((tile) => {
    if (SEASONAL_TYPES.has(tile.userData.tileType)) applySeasonalVisual(tile, season, isNight);
  });
}
