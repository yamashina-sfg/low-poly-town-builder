/**
 * わずかにオーバーシュートして収まる「ポップ」感のあるイージング。
 * 建物・木・水が下から生えてくる演出に使う。
 */
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.min(1, Math.max(0, t));
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
