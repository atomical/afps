export type GripProfileId = 'pistol' | 'rifle' | 'launcher';

export type GripBonePose = {
  bone: string;
  rotation: [number, number, number];
  triggerPullRotation?: [number, number, number];
};

const PISTOL_GRIP: ReadonlyArray<GripBonePose> = Object.freeze([
  { bone: 'Thumb1.R', rotation: [0.18, -0.34, 0.18] },
  { bone: 'Thumb2.R', rotation: [0.28, -0.1, 0.14] },
  { bone: 'Thumb3.R', rotation: [0.22, 0, 0.08] },
  { bone: 'Index1.R', rotation: [0.03, 0, 0] },
  { bone: 'Index2.R', rotation: [0.11, 0, 0], triggerPullRotation: [0.12, 0, 0] },
  { bone: 'Index3.R', rotation: [0.08, 0, 0], triggerPullRotation: [0.1, 0, 0] },
  { bone: 'Index4.R', rotation: [0.03, 0, 0], triggerPullRotation: [0.06, 0, 0] },
  { bone: 'Middle1.R', rotation: [0.2, 0, 0] },
  { bone: 'Middle2.R', rotation: [0.82, 0, 0] },
  { bone: 'Middle3.R', rotation: [0.72, 0, 0] },
  { bone: 'Middle4.R', rotation: [0.22, 0, 0] },
  { bone: 'Ring1.R', rotation: [0.24, 0, 0] },
  { bone: 'Ring2.R', rotation: [0.88, 0, 0] },
  { bone: 'Ring3.R', rotation: [0.76, 0, 0] },
  { bone: 'Ring4.R', rotation: [0.24, 0, 0] },
  { bone: 'Pinky1.R', rotation: [0.29, 0, 0] },
  { bone: 'Pinky2.R', rotation: [0.92, 0, 0] },
  { bone: 'Pinky3.R', rotation: [0.82, 0, 0] },
  { bone: 'Pinky4.R', rotation: [0.28, 0, 0] }
]);

const RIFLE_GRIP: ReadonlyArray<GripBonePose> = Object.freeze([
  { bone: 'Thumb1.R', rotation: [0.16, -0.3, 0.12] },
  { bone: 'Thumb2.R', rotation: [0.24, -0.08, 0.1] },
  { bone: 'Thumb3.R', rotation: [0.18, 0, 0.05] },
  { bone: 'Index1.R', rotation: [0.04, 0, 0] },
  { bone: 'Index2.R', rotation: [0.14, 0, 0], triggerPullRotation: [0.1, 0, 0] },
  { bone: 'Index3.R', rotation: [0.1, 0, 0], triggerPullRotation: [0.08, 0, 0] },
  { bone: 'Index4.R', rotation: [0.04, 0, 0], triggerPullRotation: [0.04, 0, 0] },
  { bone: 'Middle1.R', rotation: [0.18, 0, 0] },
  { bone: 'Middle2.R', rotation: [0.68, 0, 0] },
  { bone: 'Middle3.R', rotation: [0.58, 0, 0] },
  { bone: 'Middle4.R', rotation: [0.16, 0, 0] },
  { bone: 'Ring1.R', rotation: [0.21, 0, 0] },
  { bone: 'Ring2.R', rotation: [0.74, 0, 0] },
  { bone: 'Ring3.R', rotation: [0.66, 0, 0] },
  { bone: 'Ring4.R', rotation: [0.2, 0, 0] },
  { bone: 'Pinky1.R', rotation: [0.24, 0, 0] },
  { bone: 'Pinky2.R', rotation: [0.78, 0, 0] },
  { bone: 'Pinky3.R', rotation: [0.72, 0, 0] },
  { bone: 'Pinky4.R', rotation: [0.22, 0, 0] }
]);

const LAUNCHER_GRIP: ReadonlyArray<GripBonePose> = Object.freeze([
  { bone: 'Thumb1.R', rotation: [0.11, -0.22, 0.09] },
  { bone: 'Thumb2.R', rotation: [0.16, -0.04, 0.05] },
  { bone: 'Thumb3.R', rotation: [0.12, 0, 0.02] },
  { bone: 'Index1.R', rotation: [0.03, 0, 0] },
  { bone: 'Index2.R', rotation: [0.1, 0, 0], triggerPullRotation: [0.08, 0, 0] },
  { bone: 'Index3.R', rotation: [0.08, 0, 0], triggerPullRotation: [0.06, 0, 0] },
  { bone: 'Index4.R', rotation: [0.03, 0, 0], triggerPullRotation: [0.04, 0, 0] },
  { bone: 'Middle1.R', rotation: [0.14, 0, 0] },
  { bone: 'Middle2.R', rotation: [0.54, 0, 0] },
  { bone: 'Middle3.R', rotation: [0.46, 0, 0] },
  { bone: 'Middle4.R', rotation: [0.14, 0, 0] },
  { bone: 'Ring1.R', rotation: [0.16, 0, 0] },
  { bone: 'Ring2.R', rotation: [0.62, 0, 0] },
  { bone: 'Ring3.R', rotation: [0.54, 0, 0] },
  { bone: 'Ring4.R', rotation: [0.16, 0, 0] },
  { bone: 'Pinky1.R', rotation: [0.2, 0, 0] },
  { bone: 'Pinky2.R', rotation: [0.68, 0, 0] },
  { bone: 'Pinky3.R', rotation: [0.6, 0, 0] },
  { bone: 'Pinky4.R', rotation: [0.19, 0, 0] }
]);

const WEAPON_GRIP_PROFILES: Readonly<Record<string, GripProfileId>> = Object.freeze({
  rifle: 'rifle',
  launcher: 'launcher',
  PISTOL_9MM: 'pistol',
  PISTOL_45: 'pistol',
  REVOLVER_357: 'pistol',
  AR_556: 'rifle',
  SMG_9MM: 'rifle',
  CARBINE_762: 'rifle',
  DMR_762: 'rifle',
  LMG_556: 'rifle',
  SHOTGUN_PUMP: 'rifle',
  SHOTGUN_AUTO: 'rifle',
  SNIPER_BOLT: 'rifle',
  GRENADE_LAUNCHER: 'launcher',
  ROCKET_LAUNCHER: 'launcher',
  ENERGY_RIFLE: 'rifle'
});

const DEFAULT_PROFILE: GripProfileId = 'rifle';

const inferGripProfile = (weaponId: string): GripProfileId => {
  const normalized = weaponId.toLowerCase();
  if (/(rocket|grenade|launcher|rpg|bazooka|mortar)/.test(normalized)) {
    return 'launcher';
  }
  if (/(pistol|revolver|handgun|sidearm)/.test(normalized)) {
    return 'pistol';
  }
  return DEFAULT_PROFILE;
};

export const resolveGripProfile = (weaponId?: string | null): GripProfileId => {
  if (!weaponId) {
    return DEFAULT_PROFILE;
  }
  const mapped = WEAPON_GRIP_PROFILES[weaponId];
  if (mapped) {
    return mapped;
  }
  return inferGripProfile(weaponId);
};

export const resolveGripPose = (weaponId?: string | null): ReadonlyArray<GripBonePose> => {
  const profile = resolveGripProfile(weaponId);
  if (profile === 'pistol') {
    return PISTOL_GRIP;
  }
  if (profile === 'launcher') {
    return LAUNCHER_GRIP;
  }
  return RIFLE_GRIP;
};

export const __test = {
  inferGripProfile
};
