// 季節の移り変わり（フェーズ26：季節オブジェクトの見た目切り替え用）。
// gameTime.js（1日=現実24分）とは別軸の、もっと長い周期の時計。
// 実時間90秒ごとに季節が切り替わる（1周＝春夏秋冬で約6分）。
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const SECONDS_PER_SEASON = 90;

let elapsedSeconds = 0;

export function advanceSeason(deltaSeconds) {
  elapsedSeconds += deltaSeconds;
}

/**
 * 経過秒数から現在の季節を求める純粋関数（テスト・状態を持つgetCurrentSeason
 * の両方から使う）。
 */
export function getSeasonAt(seconds) {
  const index = Math.floor(seconds / SECONDS_PER_SEASON) % SEASONS.length;
  return SEASONS[index];
}

export function getCurrentSeason() {
  return getSeasonAt(elapsedSeconds);
}

export function getSeasonLabel(season) {
  return SEASON_LABELS[season] ?? season;
}

export function getElapsedSeasonSeconds() {
  return elapsedSeconds;
}
