// 外部音源ファイルを使わず、Web Audio APIだけで環境音（風・鳥の声）を合成する。
// ブラウザの自動再生ポリシーにより、ユーザー操作（キー入力・クリック）後に
// startAmbientAudio()を呼び出して初めて再生が始まる。

let audioContext = null;
let masterGain = null;
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
  masterGain.connect(audioContext.destination);

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
