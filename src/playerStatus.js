// 眠気ステータス：ゲーム内の1日（24分）でゼロから満タンになる。
const MAX_SLEEPINESS = 100;
const SLEEPINESS_PER_REAL_SECOND = MAX_SLEEPINESS / (24 * 60);

let sleepiness = 0;

export function advanceSleepiness(deltaSeconds) {
  sleepiness = Math.min(MAX_SLEEPINESS, sleepiness + deltaSeconds * SLEEPINESS_PER_REAL_SECOND);
}

export function resetSleepiness() {
  sleepiness = 0;
}

export function getSleepiness() {
  return sleepiness;
}
