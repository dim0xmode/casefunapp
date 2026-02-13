type StopFn = () => void;

let sharedCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
const SETTINGS_KEY = 'casefun:audioSettings';

type AudioSettings = {
  volume: number;
  muted: boolean;
};

const listeners = new Set<(settings: AudioSettings) => void>();

const clampVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

const readSettings = (): AudioSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { volume: 0.85, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: clampVolume(Number(parsed?.volume ?? 0.85)),
      muted: Boolean(parsed?.muted),
    };
  } catch {
    return { volume: 0.85, muted: false };
  }
};

let audioSettings: AudioSettings = typeof window !== 'undefined' ? readSettings() : { volume: 0.85, muted: false };

const persistAndNotify = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(audioSettings));
  } catch {
    // ignore storage errors
  }
  listeners.forEach((listener) => listener(audioSettings));
};

export const getAudioSettings = () => audioSettings;

export const setAudioVolume = (volume: number) => {
  const nextVolume = clampVolume(volume);
  audioSettings = {
    volume: nextVolume,
    muted: nextVolume <= 0 ? true : false,
  };
  persistAndNotify();
};

export const setAudioMuted = (muted: boolean) => {
  audioSettings = { ...audioSettings, muted: Boolean(muted) };
  persistAndNotify();
};

export const subscribeAudioSettings = (listener: (settings: AudioSettings) => void) => {
  listeners.add(listener);
  listener(audioSettings);
  return () => listeners.delete(listener);
};

const getCtx = (): AudioContext | null => {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx) {
      sharedCtx = new Ctx();
    }
    if (sharedCtx.state === 'suspended') {
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
};

const getNoiseBuffer = (ctx: AudioContext) => {
  if (noiseBuffer) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.9;
  }
  noiseBuffer = buffer;
  return buffer;
};

const tone = (
  ctx: AudioContext,
  frequency: number,
  {
    type = 'triangle',
    start = ctx.currentTime,
    duration = 0.1,
    volume = 0.2,
    endFrequency,
  }: {
    type?: OscillatorType;
    start?: number;
    duration?: number;
    volume?: number;
    endFrequency?: number;
  } = {}
) => {
  const master = getAudioSettings();
  const effectiveVolume = master.muted ? 0 : volume * master.volume;
  if (effectiveVolume <= 0.0005) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency && endFrequency > 0) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, effectiveVolume), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.01);
};

export const playDullClick = (volume = 0.2) => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const settings = getAudioSettings();
  const masterVolume = settings.muted ? 0 : settings.volume;
  if (masterVolume <= 0.0005) return;
  const gainValue = Math.max(0.0002, volume * masterVolume);

  // Low thump body
  tone(ctx, 150, {
    type: 'sine',
    start: now,
    duration: 0.055,
    volume: gainValue * 0.85,
    endFrequency: 110,
  });

  // Soft, filtered noise transient for "mechanical" texture
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(110, now);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(760, now);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(280, now);
  band.Q.setValueAtTime(0.65, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue * 0.5, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  source.connect(hp);
  hp.connect(lp);
  lp.connect(band);
  band.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + 0.04);
};

export const playSoftWin = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Short warm "reward" chime, less arcade-like.
  tone(ctx, 392, { type: 'sine', start: now, duration: 0.1, volume: 0.16 });
  tone(ctx, 523, { type: 'triangle', start: now + 0.07, duration: 0.14, volume: 0.2 });
  tone(ctx, 659, { type: 'triangle', start: now + 0.16, duration: 0.16, volume: 0.22 });
};

export const playSoftLose = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 300, { type: 'triangle', start: now, duration: 0.16, volume: 0.22, endFrequency: 210 });
  tone(ctx, 220, { type: 'triangle', start: now + 0.1, duration: 0.18, volume: 0.18, endFrequency: 150 });
};

export const playCaseCreatedCelebration = () => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 392, { type: 'sine', start: now, duration: 0.12, volume: 0.2 });
  tone(ctx, 523, { type: 'sine', start: now + 0.1, duration: 0.14, volume: 0.24 });
  tone(ctx, 659, { type: 'triangle', start: now + 0.2, duration: 0.2, volume: 0.28 });
};

export const startDecelClicks = ({
  durationMs,
  startIntervalMs = 24,
  endIntervalMs = 170,
  volume = 0.17,
}: {
  durationMs: number;
  startIntervalMs?: number;
  endIntervalMs?: number;
  volume?: number;
}): StopFn => {
  let stopped = false;
  let timer: number | null = null;
  const startedAt = Date.now();

  const step = () => {
    if (stopped) return;
    const elapsed = Date.now() - startedAt;
    const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, durationMs)));
    playDullClick(volume);
    const eased = progress * progress;
    const nextInterval = Math.round(startIntervalMs + (endIntervalMs - startIntervalMs) * eased);
    if (progress >= 1) return;
    timer = window.setTimeout(step, nextInterval);
  };

  step();
  return () => {
    stopped = true;
    if (timer != null) window.clearTimeout(timer);
  };
};

export const startSectionClicks = ({
  durationMs,
  sections,
  volume = 0.16,
}: {
  durationMs: number;
  sections: number;
  volume?: number;
}): StopFn => {
  const ids: number[] = [];
  let stopped = false;
  const total = Math.max(1, sections);
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  for (let i = 0; i < total; i++) {
    const t = total === 1 ? 1 : i / (total - 1);
    const when = Math.round(durationMs * easeOutCubic(t));
    const id = window.setTimeout(() => {
      if (stopped) return;
      playDullClick(volume);
    }, when);
    ids.push(id);
  }

  return () => {
    stopped = true;
    ids.forEach((id) => window.clearTimeout(id));
  };
};
