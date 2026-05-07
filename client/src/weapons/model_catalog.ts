type ViewmodelPose = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

export type WeaponModelSpec = {
  file: string;
  worldScale: number;
  viewmodel: ViewmodelPose;
};

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const WEAPON_MODEL_ROOT = `${NORMALIZED_BASE}assets/weapons/cc0/kenney_blaster_kit/`;

const withRoot = (file: string) => `${WEAPON_MODEL_ROOT}${file}`;

const DEFAULT_SPEC: WeaponModelSpec = {
  file: withRoot('blaster-a.glb'),
  worldScale: 0.6,
  viewmodel: {
    position: [0.38, -0.32, -0.65],
    rotation: [0.04, 0.12, 0],
    scale: 0.55
  }
};

const SHARED_LONG_GUN: ViewmodelPose = {
  position: [0.4, -0.34, -0.72],
  rotation: [0.05, 0.1, 0],
  scale: 0.6
};

const SHARED_LAUNCHER: ViewmodelPose = {
  position: [0.4, -0.36, -0.72],
  rotation: [0.06, 0.08, 0],
  scale: 0.6
};

const WEAPON_MODELS_BY_ID: Record<string, WeaponModelSpec> = {
  rifle: {
    file: withRoot('blaster-d.glb'),
    worldScale: 0.62,
    viewmodel: { ...SHARED_LONG_GUN }
  },
  AR_556: {
    file: withRoot('blaster-d.glb'),
    worldScale: 0.62,
    viewmodel: { ...SHARED_LONG_GUN }
  },
  launcher: {
    file: withRoot('blaster-f.glb'),
    worldScale: 0.6,
    viewmodel: { ...SHARED_LAUNCHER }
  },
  PISTOL_9MM: {
    file: withRoot('blaster-a.glb'),
    worldScale: 0.58,
    viewmodel: { ...DEFAULT_SPEC.viewmodel }
  },
  PISTOL_45: {
    file: withRoot('blaster-b.glb'),
    worldScale: 0.58,
    viewmodel: {
      ...DEFAULT_SPEC.viewmodel
    }
  },
  REVOLVER_357: {
    file: withRoot('blaster-b.glb'),
    worldScale: 0.6,
    viewmodel: {
      ...DEFAULT_SPEC.viewmodel,
      scale: 0.58
    }
  },
  SMG_9MM: {
    file: withRoot('blaster-c.glb'),
    worldScale: 0.62,
    viewmodel: { ...SHARED_LONG_GUN }
  },
  CARBINE_762: {
    file: withRoot('blaster-e.glb'),
    worldScale: 0.64,
    viewmodel: {
      position: [0.4, -0.35, -0.74],
      rotation: [0.05, 0.1, 0],
      scale: 0.62
    }
  },
  DMR_762: {
    file: withRoot('blaster-e.glb'),
    worldScale: 0.66,
    viewmodel: {
      position: [0.4, -0.35, -0.74],
      rotation: [0.05, 0.1, 0],
      scale: 0.64
    }
  },
  LMG_556: {
    file: withRoot('blaster-h.glb'),
    worldScale: 0.7,
    viewmodel: {
      position: [0.42, -0.38, -0.78],
      rotation: [0.06, 0.08, 0],
      scale: 0.7
    }
  },
  SHOTGUN_PUMP: {
    file: withRoot('blaster-g.glb'),
    worldScale: 0.66,
    viewmodel: {
      position: [0.41, -0.36, -0.76],
      rotation: [0.06, 0.08, 0],
      scale: 0.66
    }
  },
  SHOTGUN_AUTO: {
    file: withRoot('blaster-g.glb'),
    worldScale: 0.66,
    viewmodel: {
      position: [0.41, -0.36, -0.76],
      rotation: [0.06, 0.08, 0],
      scale: 0.66
    }
  },
  SNIPER_BOLT: {
    file: withRoot('blaster-g.glb'),
    worldScale: 0.68,
    viewmodel: {
      position: [0.42, -0.37, -0.78],
      rotation: [0.06, 0.08, 0],
      scale: 0.68
    }
  },
  GRENADE_LAUNCHER: {
    file: withRoot('blaster-f.glb'),
    worldScale: 0.6,
    viewmodel: { ...SHARED_LAUNCHER }
  },
  ROCKET_LAUNCHER: {
    file: withRoot('blaster-f.glb'),
    worldScale: 0.6,
    viewmodel: { ...SHARED_LAUNCHER }
  },
  ENERGY_RIFLE: {
    file: withRoot('blaster-a.glb'),
    worldScale: 0.62,
    viewmodel: { ...SHARED_LONG_GUN }
  }
};

export const resolveWeaponModelSpec = (weaponId?: string): WeaponModelSpec => {
  if (weaponId && WEAPON_MODELS_BY_ID[weaponId]) {
    return WEAPON_MODELS_BY_ID[weaponId];
  }
  return DEFAULT_SPEC;
};

