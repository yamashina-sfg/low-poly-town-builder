// 初回プレイ時にだけ表示する簡単な操作説明のオーバーレイ（フェーズ20）。
const SEEN_KEY = 'lowPolyTownBuilder:onboardingSeen';

/**
 * localStorageのフラグから、まだオンボーディングを見せるべきかを判定する
 * （壊れた/読み取れない環境ではfalseにせず素直にtrueを返し、
 * 初見の体験を優先する）。
 */
export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(SEEN_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'true');
  } catch {
    // localStorageが使えない環境（プライベートモード等）でも無視して続行する
  }
}

/**
 * オーバーレイの表示・閉じるボタンの配線を行う。閉じたら二度と出さない。
 */
export function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  if (!shouldShowOnboarding()) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  const closeButton = document.getElementById('onboarding-close');
  closeButton?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    markOnboardingSeen();
  });
}
