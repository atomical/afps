import { describe, expect, it } from 'vitest';
import rawConfig from '../../../shared/sim/config.json';
import { DEFAULT_SIM_CONFIG, SIM_CONFIG, parseSimConfig } from '../../src/sim/config';

describe('sim config', () => {
  it('falls back to defaults for non-object values', () => {
    expect(parseSimConfig(null)).toEqual(DEFAULT_SIM_CONFIG);
    expect(parseSimConfig('nope')).toEqual(DEFAULT_SIM_CONFIG);
  });

  it('uses defaults when fields are invalid', () => {
    const result = parseSimConfig({ moveSpeed: 'fast', sprintMultiplier: 2, accel: 60 });
    expect(result.moveSpeed).toBe(DEFAULT_SIM_CONFIG.moveSpeed);
    expect(result.sprintMultiplier).toBe(2);
    expect(result.accel).toBe(60);

    const nanResult = parseSimConfig({
      moveSpeed: Number.NaN,
      sprintMultiplier: Number.POSITIVE_INFINITY,
      accel: Number.NaN,
      friction: Number.POSITIVE_INFINITY,
      gravity: Number.NaN,
      jumpVelocity: Number.POSITIVE_INFINITY,
      dashImpulse: Number.NaN,
      dashCooldown: Number.POSITIVE_INFINITY,
      grappleMaxDistance: Number.NaN,
      grapplePullStrength: Number.POSITIVE_INFINITY,
      grappleDamping: Number.NaN,
      grappleCooldown: Number.POSITIVE_INFINITY,
      grappleMinAttachNormalY: Number.NaN,
      grappleRopeSlack: Number.POSITIVE_INFINITY,
      arenaHalfSize: Number.NaN,
      playerRadius: Number.POSITIVE_INFINITY,
      obstacleMinX: Number.NaN,
      obstacleMaxX: Number.POSITIVE_INFINITY,
      obstacleMinY: Number.NaN,
      obstacleMaxY: Number.POSITIVE_INFINITY
    });
    expect(nanResult).toEqual(DEFAULT_SIM_CONFIG);
  });

  it('accepts valid numeric overrides', () => {
    const result = parseSimConfig({
      moveSpeed: 7,
      sprintMultiplier: 2.25,
      accel: 55,
      friction: 9,
      gravity: 32,
      jumpVelocity: 8.25,
      dashImpulse: 11,
      dashCooldown: 0.75,
      grappleMaxDistance: 18,
      grapplePullStrength: 30,
      grappleDamping: 3.5,
      grappleCooldown: 1.25,
      grappleMinAttachNormalY: 0.35,
      grappleRopeSlack: 0.75,
      arenaHalfSize: 42,
      playerRadius: 0.4,
      obstacleMinX: -2,
      obstacleMaxX: 2,
      obstacleMinY: -1,
      obstacleMaxY: 1
    });
    expect(result).toEqual({
      moveSpeed: 7,
      sprintMultiplier: 2.25,
      accel: 55,
      friction: 9,
      gravity: 32,
      jumpVelocity: 8.25,
      dashImpulse: 11,
      dashCooldown: 0.75,
      grappleMaxDistance: 18,
      grapplePullStrength: 30,
      grappleDamping: 3.5,
      grappleCooldown: 1.25,
      grappleMinAttachNormalY: 0.35,
      grappleRopeSlack: 0.75,
      arenaHalfSize: 42,
      playerRadius: 0.4,
      obstacleMinX: -2,
      obstacleMaxX: 2,
      obstacleMinY: -1,
      obstacleMaxY: 1
    });
  });

  it('loads shared config JSON by default', () => {
    expect(SIM_CONFIG).toEqual(parseSimConfig(rawConfig));
  });
});
