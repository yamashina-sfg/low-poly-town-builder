// ゲーム内時間：現実の1秒 = ゲーム内1分（現実1分 = ゲーム内1時間、24時間で1日）。
const MINUTES_PER_DAY = 24 * 60;
const GAME_MINUTES_PER_REAL_SECOND = 1;

let totalMinutes = 6 * 60; // 朝6時から始まる

export function advanceGameTime(deltaSeconds) {
  totalMinutes =
    (totalMinutes + deltaSeconds * GAME_MINUTES_PER_REAL_SECOND + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * @returns {{ hours: number, minutes: number, dayFraction: number }}
 * dayFraction: 0=真夜中, 0.25=明け方, 0.5=正午, 0.75=夕方
 */
export function getGameTime() {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return { hours, minutes, dayFraction: totalMinutes / MINUTES_PER_DAY };
}

export function formatGameTime() {
  const { hours, minutes } = getGameTime();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * 眠ったときに呼ぶ：時間を次の朝6時まで一気に進める。
 */
export function skipTimeToMorning() {
  totalMinutes = 6 * 60;
}
