import { describe, expect, it, vi, beforeEach } from 'vitest';
const loadRetroUrbanMapMock = vi.fn();
vi.mock('../src/environment/retro_urban_map', () => ({
  loadRetroUrbanMap: (...args: unknown[]) => loadRetroUrbanMapMock(...args)
}));
const loadWeaponViewmodelMock = vi.fn();
const attachWeaponViewmodelMock = vi.fn();
vi.mock('../src/environment/weapon_viewmodel', () => ({
  loadWeaponViewmodel: (...args: unknown[]) => loadWeaponViewmodelMock(...args),
  attachWeaponViewmodel: (...args: unknown[]) => attachWeaponViewmodelMock(...args)
}));
vi.mock('../src/weapons/config', () => ({
  WEAPON_DEFS: [
    {
      id: 'rifle',
      name: 'Rifle',
      kind: 'hitscan',
      damage: 12,
      fireRate: 8,
      spreadDeg: 1.5,
      range: 60,
      projectileSpeed: 0,
      explosionRadius: 0
    },
    {
      id: 'launcher',
      name: 'Launcher',
      kind: 'projectile',
      damage: 80,
      fireRate: 1,
      spreadDeg: 0,
      range: 0,
      projectileSpeed: 22,
      explosionRadius: 4.5
    },
    {
      id: 'slowpoke',
      name: 'Slowpoke',
      kind: 'projectile',
      damage: 10,
      fireRate: 2,
      spreadDeg: 0,
      range: 0,
      projectileSpeed: 0,
      explosionRadius: 2
    },
    {
      id: 'jammer',
      name: 'Jammer',
      kind: 'projectile',
      damage: 5,
      fireRate: 0,
      spreadDeg: 0,
      range: 0,
      projectileSpeed: 10,
      explosionRadius: 2
    }
  ]
}));
import { createApp } from '../src/app';
import { WEAPON_DEFS } from '../src/weapons/config';
import { SIM_CONFIG } from '../src/sim/config';
import { createFakeThree, FakeCamera, FakeEffectComposer, FakeOutlinePass, FakeRenderer, FakeScene } from './fakeThree';

describe('createApp', () => {
  beforeEach(() => {
    loadRetroUrbanMapMock.mockReset();
    loadWeaponViewmodelMock.mockReset();
    attachWeaponViewmodelMock.mockReset();
    FakeEffectComposer.instances = [];
  });

  it('builds a scene with renderer and camera defaults', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 800, height: 600, devicePixelRatio: 2 });

    const renderer = app.state.renderer as FakeRenderer;
    const camera = app.state.camera as FakeCamera;
    const scene = app.state.scene as FakeScene;

    expect(renderer.pixelRatio).toBe(2);
    expect(renderer.size).toEqual({ width: 800, height: 600 });
    expect(camera.aspect).toBeCloseTo(800 / 600);
    expect(camera.position.z).toBe(3);
    expect(scene.children.length).toBe(3);
  });

  it('updates cube rotation and renders', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const renderer = app.state.renderer as FakeRenderer;
    const startRotation = app.state.cube.rotation.x;

    app.renderFrame(0.5, 1000);

    expect(app.state.cube.rotation.x).toBeGreaterThan(startRotation);
    expect(renderer.renderCalls).toBe(1);
  });

  it('falls back to renderer when post-processing is unavailable', () => {
    const baseThree = createFakeThree();
    const three = {
      ...baseThree,
      EffectComposer: undefined,
      RenderPass: undefined,
      OutlinePass: undefined,
      Vector2: undefined
    };
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const renderer = app.state.renderer as FakeRenderer;

    app.setOutlineTeam(1);
    app.triggerOutlineFlash();
    app.renderFrame(0.1, 1000);

    expect(renderer.renderCalls).toBe(1);
  });

  it('assigns outline teams and flashes on hit', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const composer = FakeEffectComposer.instances[0];
    const outlinePasses = composer.passes.filter(
      (pass): pass is FakeOutlinePass => pass instanceof FakeOutlinePass
    );

    expect(outlinePasses.length).toBeGreaterThan(1);
    expect(outlinePasses[0].selectedObjects.length).toBe(1);
    expect(outlinePasses[1].selectedObjects.length).toBe(0);

    app.setOutlineTeam(Number.NaN);
    expect(outlinePasses[0].selectedObjects.length).toBe(1);

    const baseStrength = outlinePasses[0].edgeStrength;
    app.triggerOutlineFlash({ nowMs: 1000, durationMs: 100 });
    expect(outlinePasses[0].edgeStrength).not.toBe(baseStrength);

    app.setOutlineTeam(1);
    expect(outlinePasses[0].edgeStrength).toBe(baseStrength);
    expect(outlinePasses[0].selectedObjects.length).toBe(0);
    expect(outlinePasses[1].selectedObjects.length).toBe(1);

    const teamStrength = outlinePasses[1].edgeStrength;
    app.triggerOutlineFlash({ nowMs: 2000, durationMs: 10, team: 1, killed: true });
    expect(outlinePasses[1].edgeStrength).not.toBe(teamStrength);

    app.renderFrame(0, 2005);
    expect(outlinePasses[1].edgeStrength).not.toBe(teamStrength);

    app.renderFrame(0, 2100);
    expect(outlinePasses[1].edgeStrength).toBe(teamStrength);
  });

  it('applies interpolated snapshots to cube position', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.setSnapshotRate(10);
    app.ingestSnapshot(
      {
        type: 'StateSnapshot',
        serverTick: 1,
        lastProcessedInputSeq: 1,
        posX: 0,
        posY: 0,
        posZ: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        health: 100,
        kills: 0,
        deaths: 0
      },
      0
    );
    app.ingestSnapshot(
      {
        type: 'StateSnapshot',
        serverTick: 2,
        lastProcessedInputSeq: 2,
        posX: 10,
        posY: 4,
        posZ: 2,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        health: 100,
        kills: 0,
        deaths: 0
      },
      100
    );

    app.renderFrame(0, 250);

    expect(app.state.cube.position.x).toBeCloseTo(5);
    expect(app.state.cube.position.y).toBeCloseTo(1.5);
    expect(app.state.cube.position.z).toBeCloseTo(2);
    expect(app.state.camera.position.x).toBeCloseTo(5);
    expect(app.state.camera.position.y).toBeCloseTo(2.6);
    expect(app.state.camera.position.z).toBeCloseTo(2);
  });

  it('uses predicted state when inputs are recorded', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 1,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    app.renderFrame(0, 1000);

    const expected = SIM_CONFIG.accel * (1 / 60) * (1 / 60);
    expect(app.state.cube.position.x).toBeCloseTo(expected);
    expect(app.state.camera.position.x).toBeCloseTo(expected);
  });

  it('spawns projectile VFX for projectile weapon fire', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    expect(scene.children.length).toBe(3);
    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 1,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    expect(scene.children.length).toBe(4);
    expect(app.getWeaponCooldown(1)).toBeCloseTo(1);
    app.recordInput({
      type: 'InputCmd',
      inputSeq: 2,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 1,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });
    expect(scene.children.length).toBe(4);

    app.renderFrame(0.5, 1000);
    expect(scene.children.length).toBe(4);
    expect(app.getWeaponCooldown(1)).toBeCloseTo(0.5);
    app.renderFrame(2, 1500);
    expect(scene.children.length).toBe(3);
    expect(app.getWeaponCooldown(1)).toBe(0);
    app.renderFrame(0.1, 1700);
  });

  it('spawns projectile VFX for server projectile events', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    expect(scene.children.length).toBe(3);
    app.spawnProjectileVfx({
      origin: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 0, z: -2 },
      ttl: 0.5,
      projectileId: 12
    });

    expect(scene.children.length).toBe(4);
    app.removeProjectileVfx(12);
    expect(scene.children.length).toBe(3);
    app.renderFrame(0.6, 1000);
    expect(scene.children.length).toBe(3);
  });

  it('exposes ability cooldowns from prediction sim', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const initial = app.getAbilityCooldowns();
    expect(initial.dash).toBe(0);
    expect(initial.shockwave).toBe(0);
    expect(initial.shieldCooldown).toBe(0);
    expect(initial.shieldTimer).toBe(0);
    expect(initial.shieldActive).toBe(false);

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: true
    });

    const updated = app.getAbilityCooldowns();
    expect(updated.shockwave).toBeGreaterThan(0);
    expect(updated.shieldActive).toBe(false);
  });

  it('ignores server projectile VFX when payload is invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: Number.NaN, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 }
    });

    expect(scene.children.length).toBe(3);
    app.removeProjectileVfx(-1);
    app.removeProjectileVfx(999);
  });

  it('ignores server projectile VFX when projectile id is invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
      projectileId: -2
    });

    expect(scene.children.length).toBe(3);
  });

  it('replaces server projectile VFX with the same id', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 1, y: 1, z: 1 },
      velocity: { x: 1, y: 0, z: 0 },
      projectileId: 5
    });
    const firstProjectile = scene.children[3];
    expect(scene.children.length).toBe(4);

    app.spawnProjectileVfx({
      origin: { x: 2, y: 2, z: 2 },
      velocity: { x: 0, y: 1, z: 0 },
      projectileId: 5
    });

    expect(scene.children.length).toBe(4);
    expect(scene.children.includes(firstProjectile)).toBe(false);
  });

  it('ignores projectile VFX for hitscan weapon fire', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: Number.NaN,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    expect(scene.children.length).toBe(4);
    app.renderFrame(0.1, 1000);
    expect(scene.children.length).toBe(3);
  });

  it('skips projectile VFX when projectile speed is invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 2,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    expect(scene.children.length).toBe(3);
    app.renderFrame(0.1, 1000);
  });

  it('skips projectile VFX when fire rate is invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 3,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    expect(scene.children.length).toBe(3);
  });

  it('skips VFX when no weapons are configured', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const saved = WEAPON_DEFS.splice(0, WEAPON_DEFS.length);

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    expect(scene.children.length).toBe(3);
    WEAPON_DEFS.push(...saved);
  });

  it('applies predicted vertical offset on jump', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: true,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    app.renderFrame(0, 1000);

    expect(app.state.cube.position.y).toBeGreaterThan(0.5);
    expect(app.state.camera.position.y).toBeGreaterThan(1.6);
  });

  it('updates prediction tick rate', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.setTickRate(30);
    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 1,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });

    app.renderFrame(0, 1000);

    const expected = SIM_CONFIG.accel * (1 / 30) * (1 / 30);
    expect(app.state.cube.position.x).toBeCloseTo(expected);
  });

  it('swaps prediction sim at runtime', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const sim = {
      step: vi.fn(),
      getState: vi.fn(() => ({
        x: 2,
        y: 3,
        z: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        shieldTimer: 0,
        shieldCooldown: 0,
        shieldActive: false,
        shockwaveCooldown: 0
      })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };

    app.setPredictionSim(sim);
    app.recordInput({
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 1,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 0,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false, shield: false, shockwave: false
    });
    app.renderFrame(0, 1000);

    expect(sim.setState).toHaveBeenCalled();
    expect(sim.step).toHaveBeenCalled();
    expect(app.state.cube.position.x).toBeCloseTo(2);
    expect(app.state.cube.position.z).toBeCloseTo(3);
  });

  it('applies look deltas with clamped pitch', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, lookSensitivity: 0.01 });

    const camera = app.state.camera as FakeCamera;
    app.applyLookDelta(100, -50);

    expect(camera.rotation.y).toBeCloseTo(-1);
    expect(camera.rotation.x).toBeCloseTo(0.5);

    const beforePitch = camera.rotation.x;
    app.applyLookDelta(Number.NaN, Number.POSITIVE_INFINITY);
    expect(camera.rotation.x).toBe(beforePitch);

    app.applyLookDelta(0, 1e6);
    expect(camera.rotation.x).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('wraps yaw and handles extreme look inputs', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, lookSensitivity: 0.01 });
    const camera = app.state.camera as FakeCamera;

    app.applyLookDelta(-400, 0);
    expect(camera.rotation.y).toBeGreaterThanOrEqual(-Math.PI);
    expect(camera.rotation.y).toBeLessThanOrEqual(Math.PI);

    const extreme = createApp({
      three,
      canvas: document.createElement('canvas'),
      width: 320,
      height: 240,
      devicePixelRatio: 1,
      lookSensitivity: 1e308
    });
    const extremeCamera = extreme.state.camera as FakeCamera;
    extreme.applyLookDelta(1e308, 0);
    expect(extremeCamera.rotation.y).toBeCloseTo(0);
  });

  it('updates look sensitivity at runtime', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, lookSensitivity: 0.01 });

    const camera = app.state.camera as FakeCamera;
    app.applyLookDelta(50, 0);
    const firstYaw = camera.rotation.y;

    app.setLookSensitivity(0.02);
    app.applyLookDelta(50, 0);

    expect(camera.rotation.y).toBeCloseTo(firstYaw - 1);
  });

  it('ignores invalid look sensitivity updates', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, lookSensitivity: 0.01 });

    const camera = app.state.camera as FakeCamera;
    app.applyLookDelta(50, 0);
    const firstYaw = camera.rotation.y;

    app.setLookSensitivity(Number.NaN);
    app.applyLookDelta(50, 0);

    expect(camera.rotation.y).toBeCloseTo(firstYaw - 0.5);
  });

  it('exposes look angles alongside snapshot-driven rendering', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, lookSensitivity: 0.01 });

    app.applyLookDelta(100, 0);
    const angles = app.getLookAngles();
    expect(angles.yaw).toBeGreaterThan(0);

    app.setSnapshotRate(10);
    app.ingestSnapshot(
      {
        type: 'StateSnapshot',
        serverTick: 1,
        lastProcessedInputSeq: 1,
        posX: 0,
        posY: 0,
        posZ: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        health: 100,
        kills: 0,
        deaths: 0
      },
      0
    );
    app.ingestSnapshot(
      {
        type: 'StateSnapshot',
        serverTick: 2,
        lastProcessedInputSeq: 2,
        posX: 6,
        posY: 2,
        posZ: 1,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        health: 90,
        kills: 1,
        deaths: 0
      },
      100
    );
    app.renderFrame(0, 250);

    expect(app.state.cube.position.x).toBeCloseTo(3);
    expect(app.state.cube.position.z).toBeCloseTo(1);
  });

  it('keeps default positions without snapshots or prediction', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.renderFrame(0.1, 1000);

    expect(app.state.cube.position.x).toBeCloseTo(0);
    expect(app.state.cube.position.y).toBeCloseTo(0.5);
    expect(app.state.cube.position.z).toBeCloseTo(0);
    expect(app.state.camera.position.z).toBeCloseTo(3);
  });

  it('loads environment when enabled', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');

    createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });

    expect(loadRetroUrbanMapMock).toHaveBeenCalled();
    expect(loadWeaponViewmodelMock).toHaveBeenCalledWith(
      expect.objectContaining({ weaponId: WEAPON_DEFS[0]?.id })
    );
  });

  it('skips weapon viewmodel loading when environment is disabled', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: false });

    app.setWeaponViewmodel('launcher');

    expect(loadWeaponViewmodelMock).not.toHaveBeenCalled();
    expect(attachWeaponViewmodelMock).not.toHaveBeenCalled();
  });

  it('swaps weapon viewmodels and cleans up previous attachments', async () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const rootA = { position: { x: 0, y: 0, z: 0, set: vi.fn() }, rotation: { x: 0, y: 0, z: 0 } };
    const rootB = { position: { x: 0, y: 0, z: 0, set: vi.fn() }, rotation: { x: 0, y: 0, z: 0 } };
    const parent = { remove: vi.fn() };

    attachWeaponViewmodelMock.mockReturnValue(parent);
    loadWeaponViewmodelMock.mockReturnValueOnce(rootA).mockReturnValueOnce(rootB);

    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });

    await Promise.resolve();
    app.setWeaponViewmodel('launcher');
    await Promise.resolve();

    expect(attachWeaponViewmodelMock).toHaveBeenCalled();
    expect(parent.remove).toHaveBeenCalledWith(rootA);

    app.dispose();
    expect(parent.remove).toHaveBeenCalledWith(rootB);
  });

  it('resizes the camera and renderer', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 320, height: 200, devicePixelRatio: 2 });

    const renderer = app.state.renderer as FakeRenderer;
    const camera = app.state.camera as FakeCamera;

    app.resize(1024, 512, 1);

    expect(renderer.size).toEqual({ width: 1024, height: 512 });
    expect(renderer.pixelRatio).toBe(1);
    expect(camera.aspect).toBe(2);
    expect(camera.updateProjectionMatrixCalls).toBe(1);
  });

  it('disposes renderer resources', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 320, height: 200, devicePixelRatio: 2 });

    const renderer = app.state.renderer as FakeRenderer;

    app.dispose();

    expect(renderer.disposeCalls).toBe(1);
  });
});
