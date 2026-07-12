// 外部音源ファイルを使わず、Web Audio APIだけで環境音（風・鳥の声）を合成する。
// ブラウザの自動再生ポリシーにより、ユーザー操作（キー入力・クリック）後に
// startAmbientAudio()を呼び出して初めて再生が始まる。

let audioContext = null;
let masterGain = null;
let sfxCompressor = null;
let birdTimeoutId = null;
let started = false;

function createNoiseBuffer(ctx, duration = 2) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function scheduleBirdChirp() {
  const ctx = audioContext;
  const now = ctx.currentTime;
  const chirpCount = 1 + Math.floor(Math.random() * 3);

  for (let i = 0; i < chirpCount; i += 1) {
    const startTime = now + i * 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = 1800 + Math.random() * 1200;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, startTime + 0.08);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + 0.15);
  }

  const nextDelay = 3000 + Math.random() * 5000;
  birdTimeoutId = setTimeout(scheduleBirdChirp, nextDelay);
}

/**
 * 風のノイズループと鳥の鳴き声をスケジュールする。
 * 何度呼んでも初回のみ実際に開始する。
 */
export function startAmbientAudio() {
  if (started) return;
  started = true;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContextClass();

  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.5;

  // フェーズ27：建築/伐採/取引などの効果音が環境音・足音と重なっても
  // 音割れしないよう、マスター段の後にコンプレッサーを挟む。
  sfxCompressor = audioContext.createDynamicsCompressor();
  masterGain.connect(sfxCompressor);
  sfxCompressor.connect(audioContext.destination);

  const noiseSource = audioContext.createBufferSource();
  noiseSource.buffer = createNoiseBuffer(audioContext);
  noiseSource.loop = true;

  const windFilter = audioContext.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 500;

  const windGain = audioContext.createGain();
  windGain.gain.value = 0.06;

  noiseSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  noiseSource.start();

  scheduleBirdChirp();
}

/**
 * 短いノイズバーストで足音を1回鳴らす。歩行アニメーションの周期に合わせて呼ぶ。
 */
export function playFootstep() {
  if (!started || !audioContext) return;
  const ctx = audioContext;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.1);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 250;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.1);
}

/**
 * 単発のオシレーター音（アタック→指数減衰）を鳴らす小さなヘルパー。
 * 建築・撤去・伐採・取引などの効果音はどれもこの形（周波数スイープ＋
 * ゲインエンベロープ）のバリエーションなので共通化する。
 */
function playTone({ startFreq, endFreq, duration, peakGain, type = 'sine', delay = 0 }) {
  const ctx = audioContext;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  }

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.02, duration * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/**
 * 建築確定時：明るく上昇する短いポップ音。
 */
export function playBuildSound() {
  if (!started || !audioContext) return;
  playTone({ startFreq: 520, endFreq: 880, duration: 0.14, peakGain: 0.12, type: 'triangle' });
}

/**
 * 撤去時：低く下降する短い音（破壊的な操作であることを音でも示す）。
 */
export function playRemoveSound() {
  if (!started || !audioContext) return;
  playTone({ startFreq: 420, endFreq: 180, duration: 0.16, peakGain: 0.1, type: 'triangle' });
}

/**
 * 伐採時：短く鋭いノイズバースト（斧を打ち込むような音）。
 * 頻繁に鳴らされる操作なので、footstep同様ごく短くしてうるさくなり過ぎないようにする。
 */
export function playChopSound() {
  if (!started || !audioContext) return;
  const ctx = audioContext;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.08);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.08);
}

/**
 * お店での売買成立時：軽やかな2音の上昇チャイム（レジの「チャリン」のイメージ）。
 */
export function playTradeSound() {
  if (!started || !audioContext) return;
  playTone({ startFreq: 1046, endFreq: 1046, duration: 0.1, peakGain: 0.1, type: 'sine' });
  playTone({ startFreq: 1318, endFreq: 1318, duration: 0.14, peakGain: 0.09, type: 'sine', delay: 0.07 });
}

/**
 * 資金・在庫不足などで操作が通らなかったとき：控えめな低いブザー音。
 */
export function playDeniedSound() {
  if (!started || !audioContext) return;
  playTone({ startFreq: 180, endFreq: 140, duration: 0.15, peakGain: 0.06, type: 'sawtooth' });
}

/**
 * 町ランク昇格時：画面中央の祝福演出に合わせた短い上昇アルペジオ。
 */
export function playCelebrationSound() {
  if (!started || !audioContext) return;
  [523, 659, 784, 1046].forEach((freq, i) => {
    playTone({
      startFreq: freq,
      endFreq: freq,
      duration: 0.2,
      peakGain: 0.14,
      type: 'triangle',
      delay: i * 0.09,
    });
  });
}

export function setAmbientMuted(muted) {
  if (!masterGain) return;
  masterGain.gain.value = muted ? 0 : 0.5;
}

export function isAmbientStarted() {
  return started;
}

export function stopAmbientAudio() {
  if (birdTimeoutId) clearTimeout(birdTimeoutId);
}
