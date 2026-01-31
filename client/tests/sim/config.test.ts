import { describe, expect, it } from 'vitest';
import rawConfig from '../../../shared/sim/config.json';
import { DEFAULT_SIM_CONFIG, SIM_CONFIG, parseSimConfig } from '../../src/sim/config';

describe('sim config', () => {
  it('falls back to defaults for non-object values', () => {
    expect(parseSimConfig(null)).toEqual(DEFAULT_SIM_CONFIG);
    expect(parseSimConfig('nope')).toEqual(DEFAULT_SIM_CONFIG);
  });

  it('uses defaults when fields are invalid', () => {
    const result = parseSimConfig({ moveSpeed: 'fast', sprintMultiplier: 2 });
    expect(result.moveSpeed).toBe(DEFAULT_SIM_CONFIG.moveSpeed);
    expect(result.sprintMultiplier).toBe(2);

    const nanResult = parseSimConfig({ moveSpeed: Number.NaN, sprintMultiplier: Number.POSITIVE_INFINITY });
    expect(nanResult).toEqual(DEFAULT_SIM_CONFIG);
  });

  it('accepts valid numeric overrides', () => {
    const result = parseSimConfig({ moveSpeed: 7, sprintMultiplier: 2.25 });
    expect(result).toEqual({ moveSpeed: 7, sprintMultiplier: 2.25 });
  });

  it('loads shared config JSON by default', () => {
    expect(SIM_CONFIG).toEqual(parseSimConfig(rawConfig));
  });
});
