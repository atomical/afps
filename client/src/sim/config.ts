import rawConfig from '../../../shared/sim/config.json';

export interface SimConfig {
  moveSpeed: number;
  sprintMultiplier: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  moveSpeed: 5,
  sprintMultiplier: 1.5
};

const readNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const parseSimConfig = (value: unknown): SimConfig => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_SIM_CONFIG;
  }
  const record = value as Record<string, unknown>;
  const moveSpeed = readNumber(record.moveSpeed) ?? DEFAULT_SIM_CONFIG.moveSpeed;
  const sprintMultiplier = readNumber(record.sprintMultiplier) ?? DEFAULT_SIM_CONFIG.sprintMultiplier;
  return {
    moveSpeed,
    sprintMultiplier
  };
};

export const SIM_CONFIG = parseSimConfig(rawConfig);
