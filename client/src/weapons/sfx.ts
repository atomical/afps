import type { AudioManager } from '../audio/manager';
import type { WeaponDefinition } from './config';

type FireProfile = {
  baseToneHz: number;
  pitchDrop: number;
  noiseHP: number;
  noiseLP: number;
  tau: number;
  distortion: number;
  extraBoomSubHz?: number;
  crackHP?: number;
  tailSeconds?: number;
  addChirp?: boolean;
};

type ReloadCategory = 'pistol' | 'rifle' | 'lmg' | 'shotgun' | 'sniper' | 'launcher' | 'energy';

const SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;

const FIRE_PROFILES: Record<string, FireProfile> = {
  PISTOL_9MM: {
    baseToneHz: 220,
    pitchDrop: 0.08,
    noiseHP: 1400,
    noiseLP: 8000,
    tau: 0.06,
    distortion: 1.8
  },
  PISTOL_45: {
    baseToneHz: 190,
    pitchDrop: 0.1,
    noiseHP: 1100,
    noiseLP: 7000,
    tau: 0.07,
    distortion: 2.0
  },
  REVOLVER_357: {
    baseToneHz: 170,
    pitchDrop: 0.12,
    noiseHP: 900,
    noiseLP: 6500,
    tau: 0.085,
    distortion: 2.2
  },
  SMG_9MM: {
    baseToneHz: 240,
    pitchDrop: 0.07,
    noiseHP: 1600,
    noiseLP: 9000,
    tau: 0.05,
    distortion: 1.7
  },
  AR_556: {
    baseToneHz: 160,
    pitchDrop: 0.09,
    noiseHP: 1200,
    noiseLP: 8500,
    tau: 0.075,
    distortion: 2.1
  },
  CARBINE_762: {
    baseToneHz: 140,
    pitchDrop: 0.1,
    noiseHP: 1000,
    noiseLP: 8200,
    tau: 0.085,
    distortion: 2.3
  },
  DMR_762: {
    baseToneHz: 135,
    pitchDrop: 0.11,
    noiseHP: 950,
    noiseLP: 7800,
    tau: 0.095,
    distortion: 2.4
  },
  LMG_556: {
    baseToneHz: 150,
    pitchDrop: 0.08,
    noiseHP: 1050,
    noiseLP: 8200,
    tau: 0.08,
    distortion: 2.0
  },
  SHOTGUN_PUMP: {
    baseToneHz: 110,
    pitchDrop: 0.14,
    noiseHP: 600,
    noiseLP: 6200,
    tau: 0.14,
    distortion: 2.6,
    extraBoomSubHz: 60
  },
  SHOTGUN_AUTO: {
    baseToneHz: 120,
    pitchDrop: 0.12,
    noiseHP: 650,
    noiseLP: 6500,
    tau: 0.12,
    distortion: 2.5,
    extraBoomSubHz: 65
  },
  SNIPER_BOLT: {
    baseToneHz: 95,
    pitchDrop: 0.16,
    noiseHP: 500,
    noiseLP: 6000,
    tau: 0.2,
    distortion: 2.8,
    crackHP: 2500
  },
  GRENADE_LAUNCHER: {
    baseToneHz: 80,
    pitchDrop: 0.18,
    noiseHP: 350,
    noiseLP: 5200,
    tau: 0.24,
    distortion: 3.0,
    extraBoomSubHz: 50
  },
  ROCKET_LAUNCHER: {
    baseToneHz: 70,
    pitchDrop: 0.2,
    noiseHP: 300,
    noiseLP: 4800,
    tau: 0.28,
    distortion: 3.2,
    extraBoomSubHz: 45,
    tailSeconds: 0.35
  },
  ENERGY_RIFLE: {
    baseToneHz: 420,
    pitchDrop: 0.04,
    noiseHP: 2200,
    noiseLP: 12000,
    tau: 0.07,
    distortion: 1.2,
    addChirp: true
  }
};

const FIRE_LENGTHS: Record<string, number> = {
  PISTOL_9MM: 0.22,
  PISTOL_45: 0.24,
  REVOLVER_357: 0.26,
  SMG_9MM: 0.18,
  AR_556: 0.24,
  CARBINE_762: 0.25,
  DMR_762: 0.27,
  LMG_556: 0.26,
  SHOTGUN_PUMP: 0.45,
  SHOTGUN_AUTO: 0.45,
  SNIPER_BOLT: 0.55,
  GRENADE_LAUNCHER: 0.65,
  ROCKET_LAUNCHER: 0.65,
  ENERGY_RIFLE: 0.22
};

const RELOAD_LENGTHS: Record<ReloadCategory, number> = {
  pistol: 0.7,
  rifle: 0.95,
  lmg: 1.2,
  shotgun: 1.05,
  sniper: 1.1,
  launcher: 1.1,
  energy: 0.9
};

const RELOAD_CLICKS: Record<ReloadCategory, number[]> = {
  pistol: [0.08, 0.22, 0.45, 0.62],
  rifle: [0.08, 0.2, 0.44, 0.62, 0.84],
  lmg: [0.1, 0.28, 0.46, 0.66, 0.86, 1.06],
  shotgun: [0.1, 0.26, 0.42, 0.58, 0.74, 0.92],
  sniper: [0.12, 0.34, 0.56, 0.78, 0.98],
  launcher: [0.14, 0.36, 0.58, 0.8, 1.02],
  energy: [0.08, 0.22, 0.45, 0.62]
};

const PROFILE_CATEGORY: Record<string, ReloadCategory> = {
  PISTOL_9MM: 'pistol',
  PISTOL_45: 'pistol',
  REVOLVER_357: 'pistol',
  SMG_9MM: 'rifle',
  AR_556: 'rifle',
  CARBINE_762: 'rifle',
  DMR_762: 'rifle',
  LMG_556: 'lmg',
  SHOTGUN_PUMP: 'shotgun',
  SHOTGUN_AUTO: 'shotgun',
  SNIPER_BOLT: 'sniper',
  GRENADE_LAUNCHER: 'launcher',
  ROCKET_LAUNCHER: 'launcher',
  ENERGY_RIFLE: 'energy'
};

const resolveProfile = (profile?: string) => FIRE_PROFILES[profile ?? ''] ?? FIRE_PROFILES.AR_556;
const resolveFireLength = (profile?: string) => FIRE_LENGTHS[profile ?? ''] ?? FIRE_LENGTHS.AR_556;
const resolveReloadCategory = (profile?: string): ReloadCategory =>
  PROFILE_CATEGORY[profile ?? ''] ?? 'rifle';

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createBuffer = (audio: AudioManager, samples: Float32Array) => {
  const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE);
  const channelData = buffer?.getChannelData?.(0);
  if (!buffer || !channelData) {
    return null;
  }
  channelData.set(samples);
  return buffer;
};

const onePoleLowpass = (cutoff: number, dt: number) => {
  const rc = 1 / (TWO_PI * cutoff);
  return dt / (rc + dt);
};

const onePoleHighpass = (cutoff: number, dt: number) => {
  const rc = 1 / (TWO_PI * cutoff);
  return rc / (rc + dt);
};

const generateFireSamples = (
  profile: FireProfile,
  lengthSeconds: number,
  variant: number,
  rand: () => number
) => {
  const samples = Math.max(1, Math.floor(lengthSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  const dt = 1 / SAMPLE_RATE;
  const variantFactor = variant === 0 ? 1 : 1.02;
  const baseTone = profile.baseToneHz * variantFactor;
  const noiseHp = profile.noiseHP * (variant === 0 ? 1 : 0.95);
  const noiseLp = profile.noiseLP * (variant === 0 ? 1 : 1.03);
  const distortion = profile.distortion * (variant === 0 ? 1 : 1.05);
  const tau = profile.tau * (variant === 0 ? 1 : 1.08);

  const lpAlpha = onePoleLowpass(noiseLp, dt);
  const hpAlpha = onePoleHighpass(noiseHp, dt);
  let lp = 0;
  let hp = 0;
  let prevNoise = 0;

  for (let i = 0; i < samples; i += 1) {
    const t = i * dt;
    const env = Math.exp(-t / tau);
    const pitch = baseTone * (1 - profile.pitchDrop * (t / lengthSeconds));
    const tone = Math.sin(TWO_PI * pitch * t);
    const white = rand() * 2 - 1;
    hp = hpAlpha * (hp + white - prevNoise);
    prevNoise = white;
    lp += lpAlpha * (hp - lp);
    let noise = lp;
    let sample = tone * 0.65 + noise * 0.45;

    if (profile.extraBoomSubHz) {
      const boomEnv = Math.exp(-t / 0.12);
      sample += Math.sin(TWO_PI * profile.extraBoomSubHz * t) * 0.35 * boomEnv;
    }
    if (profile.crackHP && t < 0.035) {
      sample += noise * 0.35 * (1 - t / 0.035);
    }
    if (profile.addChirp && t < 0.12) {
      const chirpHz = 900 - 450 * (t / 0.12);
      sample += Math.sin(TWO_PI * chirpHz * t) * 0.25;
    }

    sample *= env;
    sample = Math.tanh(distortion * sample);
    data[i] = sample * 0.9;
  }

  if (profile.tailSeconds && profile.tailSeconds > 0) {
    const delaySamples = Math.floor(0.02 * SAMPLE_RATE);
    for (let i = delaySamples; i < samples; i += 1) {
      data[i] += data[i - delaySamples] * 0.22;
    }
  }

  return data;
};

const generateClick = (durationSeconds: number, frequency: number, rand: () => number) => {
  const samples = Math.max(1, Math.floor(durationSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  const dt = 1 / SAMPLE_RATE;
  const tau = durationSeconds * 0.35;
  for (let i = 0; i < samples; i += 1) {
    const t = i * dt;
    const env = Math.exp(-t / tau);
    const tone = Math.sin(TWO_PI * frequency * t);
    const noise = (rand() * 2 - 1) * 0.3;
    data[i] = (tone * 0.7 + noise) * env;
  }
  return data;
};

const mixIn = (target: Float32Array, source: Float32Array, startSample: number, gain = 1) => {
  for (let i = 0; i < source.length; i += 1) {
    const idx = startSample + i;
    if (idx >= target.length) {
      break;
    }
    target[idx] += source[i] * gain;
  }
};

const generateReloadSamples = (category: ReloadCategory, lengthSeconds: number, rand: () => number) => {
  const samples = Math.max(1, Math.floor(lengthSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  const baseLength = RELOAD_LENGTHS[category];
  const scale = baseLength > 0 ? lengthSeconds / baseLength : 1;
  const clickTimes = RELOAD_CLICKS[category].map((t) => t * scale);
  clickTimes.forEach((time, index) => {
    const freq = 700 + ((index * 83) % 600);
    const click = generateClick(0.012, freq, rand);
    mixIn(data, click, Math.floor(time * SAMPLE_RATE), 0.75);
  });

  if (category === 'energy') {
    for (let i = 0; i < samples; i += 1) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-t / (lengthSeconds * 0.6));
      data[i] += Math.sin(TWO_PI * 320 * t) * 0.12 * env;
    }
  }

  return data;
};

const generateDryFireSamples = (rand: () => number) => {
  const lengthSeconds = 0.1;
  const samples = Math.max(1, Math.floor(lengthSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  const click = generateClick(0.02, 1000, rand);
  mixIn(data, click, 0, 0.35);
  data[0] += 0.4;
  return data;
};

const generateEquipSamples = (rand: () => number) => {
  const lengthSeconds = 0.28;
  const samples = Math.max(1, Math.floor(lengthSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  const clickA = generateClick(0.015, 850, rand);
  const clickB = generateClick(0.018, 950, rand);
  mixIn(data, clickA, Math.floor(0.05 * SAMPLE_RATE), 0.6);
  mixIn(data, clickB, Math.floor(0.17 * SAMPLE_RATE), 0.7);
  return data;
};

const generateCasingImpactSamples = (variant: 1 | 2) => {
  const lengthSeconds = variant === 1 ? 0.05 : 0.045;
  const freq = variant === 1 ? 2800 : 2400;
  const samples = Math.max(1, Math.floor(lengthSeconds * SAMPLE_RATE));
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / (lengthSeconds * 0.4));
    const wobble = variant === 1 ? 0.04 * Math.sin(TWO_PI * 12 * t) : 0;
    const freqNow = freq * (1 + wobble);
    data[i] = Math.sin(TWO_PI * freqNow * t) * env * 0.35;
  }
  return data;
};

export const generateWeaponSfx = (
  audio: AudioManager,
  weapons: WeaponDefinition[],
  options: { sampleOverrides?: Record<string, Float32Array> } = {}
) => {
  const registered = new Set<string>();
  const overrides = options.sampleOverrides ?? {};
  const getSamples = (key: string, factory: () => Float32Array) => overrides[key] ?? factory();
  const isSilent = (samples: Float32Array) => {
    for (let i = 0; i < samples.length; i += 1) {
      if (Math.abs(samples[i]) > 1e-6) {
        return false;
      }
    }
    return true;
  };
  const register = (key: string, samples: Float32Array) => {
    if (!key || registered.has(key)) {
      return;
    }
    if (isSilent(samples)) {
      console.error(`weapon sfx generator produced silent samples for ${key}`);
      return;
    }
    const buffer = createBuffer(audio, samples);
    if (!buffer) {
      return;
    }
    audio.registerBuffer(key, buffer);
    registered.add(key);
  };

  register('casing:impact:1', getSamples('casing:impact:1', () => generateCasingImpactSamples(1)));
  register('casing:impact:2', getSamples('casing:impact:2', () => generateCasingImpactSamples(2)));

  weapons.forEach((weapon) => {
    const profileKey = weapon.sfxProfile;
    const profile = resolveProfile(profileKey);
    const fireLength = resolveFireLength(profileKey);
    const fireRand = createRandom(hashString(weapon.sounds.fire));
    register(
      weapon.sounds.fire,
      getSamples(weapon.sounds.fire, () => generateFireSamples(profile, fireLength, 0, fireRand))
    );
    if (weapon.sounds.fireVariant2) {
      const variantRand = createRandom(hashString(weapon.sounds.fireVariant2));
      register(
        weapon.sounds.fireVariant2,
        getSamples(weapon.sounds.fireVariant2, () => generateFireSamples(profile, fireLength, 1, variantRand))
      );
    }
    register(
      weapon.sounds.dryFire,
      getSamples(weapon.sounds.dryFire, () => generateDryFireSamples(createRandom(hashString(weapon.sounds.dryFire))))
    );

    const category = resolveReloadCategory(profileKey);
    const reloadLength = Number.isFinite(weapon.reloadSeconds) && weapon.reloadSeconds > 0
      ? weapon.reloadSeconds
      : RELOAD_LENGTHS[category];
    register(
      weapon.sounds.reload,
      getSamples(weapon.sounds.reload, () =>
        generateReloadSamples(category, reloadLength, createRandom(hashString(weapon.sounds.reload)))
      )
    );

    if (weapon.sounds.equip) {
      register(
        weapon.sounds.equip,
        getSamples(weapon.sounds.equip, () => generateEquipSamples(createRandom(hashString(weapon.sounds.equip))))
      );
    }
  });
};
