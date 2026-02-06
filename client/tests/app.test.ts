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
  WEAPON_DEFS: (() => {
    const baseCasing = {
      localOffset: [0, 0, 0] as [number, number, number],
      localRotation: [0, 0, 0] as [number, number, number],
      velocityMin: [0, 0, 0] as [number, number, number],
      velocityMax: [0, 0, 0] as [number, number, number],
      angularVelocityMin: [0, 0, 0] as [number, number, number],
      angularVelocityMax: [0, 0, 0] as [number, number, number],
      lifetimeSeconds: 2
    };
    const baseSounds = (id: string) => ({
      fire: `weapon:${id}:fire`,
      dryFire: `weapon:${id}:dry`,
      reload: `weapon:${id}:reload`
    });
    return [
      {
        id: 'rifle',
        displayName: 'Rifle',
        kind: 'hitscan',
        damage: 12,
        spreadDeg: 1.5,
        range: 60,
        projectileSpeed: 0,
        explosionRadius: 0,
        maxAmmoInMag: 30,
        cooldownSeconds: 0.125,
        fireMode: 'FULL_AUTO',
        ejectShellsWhileFiring: true,
        reloadSeconds: 0.9,
        sfxProfile: 'AR_556',
        casingEject: baseCasing,
        sounds: baseSounds('rifle')
      },
      {
        id: 'launcher',
        displayName: 'Launcher',
        kind: 'projectile',
        damage: 80,
        spreadDeg: 0,
        range: 0,
        projectileSpeed: 22,
        explosionRadius: 4.5,
        maxAmmoInMag: 6,
        cooldownSeconds: 1,
        fireMode: 'SEMI',
        ejectShellsWhileFiring: false,
        reloadSeconds: 1.1,
        sfxProfile: 'GRENADE_LAUNCHER',
        casingEject: baseCasing,
        sounds: baseSounds('launcher')
      },
      {
        id: 'slowpoke',
        displayName: 'Slowpoke',
        kind: 'projectile',
        damage: 10,
        spreadDeg: 0,
        range: 0,
        projectileSpeed: 4,
        explosionRadius: 2,
        maxAmmoInMag: 5,
        cooldownSeconds: 0.6,
        fireMode: 'SEMI',
        ejectShellsWhileFiring: true,
        reloadSeconds: 0.8,
        sfxProfile: 'PISTOL_9MM',
        casingEject: baseCasing,
        sounds: baseSounds('slowpoke')
      },
      {
        id: 'jammer',
        displayName: 'Jammer',
        kind: 'projectile',
        damage: 5,
        spreadDeg: 0,
        range: 0,
        projectileSpeed: 10,
        explosionRadius: 2,
        maxAmmoInMag: 3,
        cooldownSeconds: 0.4,
        fireMode: 'SEMI',
        ejectShellsWhileFiring: true,
        reloadSeconds: 0.7,
        sfxProfile: 'PISTOL_9MM',
        casingEject: baseCasing,
        sounds: baseSounds('jammer')
      }
    ];
  })()
}));
import { createApp } from '../src/app';
import { WEAPON_DEFS } from '../src/weapons/config';
import { SIM_CONFIG } from '../src/sim/config';
import {
  createFakeThree,
  FakeCamera,
  FakeEffectComposer,
  FakeOutlinePass,
  FakeRenderer,
  FakeScene,
  FakeMesh,
  FakeMaterial
} from './fakeThree';

describe('createApp', () => {
  const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

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
    expect(camera.position.z).toBe(0);
    expect(scene.children.length).toBe(4);
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

  it('uses performance.now when no timestamp is provided', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1234);

    app.renderFrame(0.25);

    expect(nowSpy).toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('falls back to renderer when post-processing is unavailable', async () => {
    const baseThree = createFakeThree();
    const three = {
      ...baseThree,
      EffectComposer: undefined,
      RenderPass: undefined,
      OutlinePass: undefined,
      Vector2: undefined
    };
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });
    await Promise.resolve();

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

  it('switches outline teams when no flash is active', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const composer = FakeEffectComposer.instances[0];
    const outlinePasses = composer.passes.filter(
      (pass): pass is FakeOutlinePass => pass instanceof FakeOutlinePass
    );

    expect(outlinePasses[0].selectedObjects.length).toBe(1);
    expect(outlinePasses[1].selectedObjects.length).toBe(0);

    app.setOutlineTeam(1);

    expect(outlinePasses[0].selectedObjects.length).toBe(0);
    expect(outlinePasses[1].selectedObjects.length).toBe(1);
  });

  it('uses outline flash defaults when timing is omitted', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const composer = FakeEffectComposer.instances[0];
    const outlinePasses = composer.passes.filter(
      (pass): pass is FakeOutlinePass => pass instanceof FakeOutlinePass
    );
    const baseStrength = outlinePasses[0].edgeStrength;
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1234);

    app.triggerOutlineFlash({ team: 0 });

    expect(nowSpy).toHaveBeenCalled();
    expect(outlinePasses[0].edgeStrength).not.toBe(baseStrength);
    nowSpy.mockRestore();
  });

  it('can hide the local proxy cube', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    // FakeThree meshes don't set `visible` by default, but the real Three.js Mesh does.
    // Force the property on so setLocalProxyVisible is exercised.
    (app.state.cube as unknown as { visible: boolean }).visible = true;

    const composer = FakeEffectComposer.instances[0];
    const outlinePasses = composer.passes.filter(
      (pass): pass is FakeOutlinePass => pass instanceof FakeOutlinePass
    );

    expect((app.state.cube as unknown as { visible: boolean }).visible).toBe(true);
    expect(outlinePasses[0].selectedObjects.length).toBe(1);

    app.setLocalProxyVisible(false);
    expect((app.state.cube as unknown as { visible: boolean }).visible).toBe(false);
    expect(outlinePasses[0].selectedObjects.length).toBe(0);

    app.setLocalProxyVisible(true);
    expect((app.state.cube as unknown as { visible: boolean }).visible).toBe(true);
    expect(outlinePasses[0].selectedObjects.length).toBe(1);
  });

  it('assigns a stronger outline to the viewmodel', async () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const viewmodel = {
      position: { x: 0, y: 0, z: 0, set: vi.fn() },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { set: vi.fn() }
    };
    loadWeaponViewmodelMock.mockResolvedValue(viewmodel);
    attachWeaponViewmodelMock.mockReturnValue({ remove: vi.fn() });

    createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });

    await Promise.resolve();

    const composer = FakeEffectComposer.instances[0];
    const outlinePasses = composer.passes.filter(
      (pass): pass is FakeOutlinePass => pass instanceof FakeOutlinePass
    );
    const viewmodelPass = outlinePasses[outlinePasses.length - 1];
    expect(viewmodelPass.selectedObjects).toContain(viewmodel);
    expect(viewmodelPass.edgeThickness).toBeGreaterThan(outlinePasses[0].edgeThickness ?? 0);
  });

  it('invokes beforeRender hooks', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    const hook = vi.fn();
    app.setBeforeRender(hook);
    app.renderFrame(0.1, 1000);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(app.getPlayerPose()).toMatchObject({
      posX: expect.any(Number),
      posY: expect.any(Number),
      posZ: expect.any(Number)
    });
  });

  it('ignores stale weapon viewmodel loads', async () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');

    let resolveFirst: (value: unknown) => void;
    let resolveSecond: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    attachWeaponViewmodelMock.mockReturnValue({ remove: vi.fn() });

    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });

    // createApp(loadEnvironment=true) triggers an initial viewmodel load; flush it so it
    // doesn't affect this test's assertions.
    await Promise.resolve();
    loadWeaponViewmodelMock.mockReset();
    attachWeaponViewmodelMock.mockReset();
    attachWeaponViewmodelMock.mockReturnValue({ remove: vi.fn() });
    loadWeaponViewmodelMock.mockImplementationOnce(() => firstPromise);
    loadWeaponViewmodelMock.mockImplementationOnce(() => secondPromise);

    app.setWeaponViewmodel('rifle');
    app.setWeaponViewmodel('launcher');

    // Trigger two viewmodel loads; the first should be ignored when it resolves after the second.
    resolveFirst!(null);
    await Promise.resolve();

    // Still waiting for the second load to apply.
    expect(attachWeaponViewmodelMock).not.toHaveBeenCalled();

    resolveSecond!({});
    await Promise.resolve();

    expect(attachWeaponViewmodelMock).toHaveBeenCalledTimes(1);
  });

  it('applies interpolated snapshots to cube position', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.setSnapshotRate(10);
    expect(app.getRenderTick()).toBeNull();
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
        weaponSlot: 0,
        ammoInMag: 30,
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
        weaponSlot: 0,
        ammoInMag: 28,
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
    expect(app.getRenderTick()).toBeCloseTo(1.5);
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

  it('records and decays weapon cooldowns', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    expect(app.getWeaponCooldown(1)).toBe(0);
    app.recordWeaponFired(1, 1.2);
    expect(app.getWeaponCooldown(1)).toBeCloseTo(1.2);
    app.recordWeaponFired(1, 0.4);
    expect(app.getWeaponCooldown(1)).toBeCloseTo(1.2);

    app.renderFrame(0.4, 1000);
    expect(app.getWeaponCooldown(1)).toBeCloseTo(0.8);
    app.renderFrame(1, 2000);
    expect(app.getWeaponCooldown(1)).toBe(0);
    app.renderFrame(0.2, 2200);
    expect(app.getWeaponCooldown(1)).toBe(0);
  });

  it('spawns projectile VFX for server projectile events', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    expect(scene.children.length).toBe(4);
    app.spawnProjectileVfx({
      origin: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 0, z: -2 },
      ttl: 0.5,
      projectileId: 12
    });

    expect(scene.children.length).toBe(5);
    app.removeProjectileVfx(12);
    expect(scene.children.length).toBe(4);
    app.renderFrame(0.6, 1000);
    expect(scene.children.length).toBe(4);
  });

  it('expires projectile VFX during renderFrame', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 1, y: 2, z: 3 },
      velocity: { x: 0, y: 0, z: 0 },
      ttl: 0.05,
      projectileId: 42
    });

    expect(scene.children.length).toBe(5);
    app.renderFrame(0.1, 1000);
    expect(scene.children.length).toBe(4);
  });

  it('expires projectile VFX without ids', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 1, y: 2, z: 3 },
      velocity: { x: 0, y: 0, z: 1 },
      ttl: 0.05
    });

    expect(scene.children.length).toBe(5);
    app.renderFrame(0.1, 1000);
    expect(scene.children.length).toBe(4);
  });

  it('defaults projectile TTL when invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
      ttl: Number.NaN,
      projectileId: 100
    });

    expect(scene.children.length).toBe(5);
    app.renderFrame(1, 1000);
    expect(scene.children.length).toBe(5);
    app.renderFrame(1, 2000);
    expect(scene.children.length).toBe(4);
  });

  it('updates projectile VFX positions while active', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnProjectileVfx({
      origin: { x: 0, y: 0, z: 0 },
      velocity: { x: 2, y: 0, z: 0 },
      ttl: 1,
      projectileId: 77
    });

    const projectile = scene.children[scene.children.length - 1] as FakeMesh;
    const startX = projectile.position.x;
    app.renderFrame(0.1, 1000);
    expect(projectile.position.x).toBeGreaterThan(startX);
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

    expect(scene.children.length).toBe(4);
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

    expect(scene.children.length).toBe(4);
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
    const firstProjectile = scene.children[scene.children.length - 1];
    expect(scene.children.length).toBe(5);

    app.spawnProjectileVfx({
      origin: { x: 2, y: 2, z: 2 },
      velocity: { x: 0, y: 1, z: 0 },
      projectileId: 5
    });

    expect(scene.children.length).toBe(5);
    expect(scene.children.includes(firstProjectile)).toBe(false);
  });

  it('spawns tracer VFX and expires them', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    expect(scene.children.length).toBe(4);
    app.spawnTracerVfx({
      origin: { x: 0, y: 0, z: 0 },
      dir: { x: 1, y: 0, z: 0 },
      length: 10
    });
    expect(scene.children.length).toBe(5);
    app.renderFrame(0.01, 1000);
    expect(scene.children.length).toBe(5);
    app.renderFrame(0.1, 1010);
    expect(scene.children.length).toBe(4);
  });

  it('uses the default tracer length when omitted', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.spawnTracerVfx({
      origin: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: -1 }
    });

    expect(app.getFxPoolStats().tracers.active).toBe(1);
  });

  it('ignores tracer VFX when origin is invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnTracerVfx({
      origin: { x: Number.NaN, y: 0, z: 0 },
      dir: { x: 1, y: 0, z: 0 }
    });

    expect(scene.children.length).toBe(4);
  });

  it('spawns muzzle flash VFX and expires them', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    expect(app.getFxPoolStats().muzzleFlashes).toMatchObject({ active: 0, free: 0 });
    const baseline = scene.children.length;

    app.spawnMuzzleFlashVfx({
      position: { x: 0, y: 1, z: 2 },
      dir: { x: 0, y: 0, z: -1 },
      seed: 123
    });

    expect(scene.children.length).toBe(baseline + 1);
    expect(app.getFxPoolStats().muzzleFlashes.active).toBe(1);

    app.renderFrame(0.01, 1000);
    expect(scene.children.length).toBe(baseline + 1);
    expect(app.getFxPoolStats().muzzleFlashes.active).toBe(1);
    app.renderFrame(0.1, 1010);

    expect(scene.children.length).toBe(baseline);
    expect(app.getFxPoolStats().muzzleFlashes).toMatchObject({ active: 0, free: 1 });
  });

  it('falls back for non-finite muzzle flash seed and sizing', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.spawnMuzzleFlashVfx({
      position: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: -1 },
      seed: Number.NaN,
      size: -1,
      ttl: 0
    });

    expect(app.getFxPoolStats().muzzleFlashes.active).toBe(1);
  });

  it('defaults pose height when snapshot posZ is missing', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const camera = app.state.camera as FakeCamera;

    app.setSnapshotRate(10);
    app.ingestSnapshot(
      {
        type: 'StateSnapshot',
        serverTick: 1,
        lastProcessedInputSeq: 1,
        posX: 2,
        posY: -3,
        posZ: undefined,
        velX: 0,
        velY: 0,
        velZ: 0,
        weaponSlot: 0,
        ammoInMag: 30,
        dashCooldown: 0,
        health: 100,
        kills: 0,
        deaths: 0
      } as unknown as Parameters<typeof app.ingestSnapshot>[0],
      0
    );

    app.renderFrame(0, 50);
    expect(camera.position.y).toBeCloseTo(1.6);
  });

  it('falls back to zeroed pose when cube position is non-finite', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const cube = app.state.cube as FakeMesh;

    cube.position.x = Number.NaN;
    cube.position.y = Number.NaN;
    cube.position.z = Number.NaN;

    app.renderFrame(0, 1000);
    const pose = app.getPlayerPose();
    expect(pose.posX).toBe(0);
    expect(pose.posY).toBe(0);
    expect(pose.posZ).toBe(0);
  });

  it('spawns impact + decal VFX and recycles them', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnImpactVfx({
      position: { x: 1, y: 2, z: 3 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: 1,
      ttl: 0.05
    });
    app.spawnImpactVfx({
      position: { x: 2, y: 3, z: 4 },
      normal: { x: 0, y: 0, z: 1 },
      surfaceType: 2,
      seed: 2,
      ttl: 0.05
    });
    app.spawnImpactVfx({
      position: { x: 3, y: 4, z: 5 },
      normal: { x: 1, y: 0, z: 0 },
      surfaceType: 3,
      seed: 3,
      ttl: 0.05
    });

    app.spawnDecalVfx({
      position: { x: 1, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 0,
      seed: 10,
      ttl: 0.05
    });
    // Exercise default TTL path as well (6–12s); use a large render step to recycle it.
    app.spawnDecalVfx({
      position: { x: 2, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 2,
      seed: 11
    });

    expect(scene.children.length).toBe(baseline + 5);
    expect(app.getFxPoolStats().impacts.active).toBe(3);
    expect(app.getFxPoolStats().decals.active).toBe(2);

    app.renderFrame(20, 1000);

    expect(scene.children.length).toBe(baseline);
    expect(app.getFxPoolStats().impacts).toMatchObject({ active: 0, free: 3 });
    expect(app.getFxPoolStats().decals).toMatchObject({ active: 0, free: 2 });
  });

  it('applies size overrides for impact and decal VFX', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnImpactVfx({
      position: { x: 1, y: 2, z: 3 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: 21,
      size: 2,
      ttl: 0.1
    });
    app.spawnDecalVfx({
      position: { x: 2, y: 3, z: 4 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 2,
      seed: 22,
      size: 1.5,
      ttl: 0.1
    });

    expect(scene.children.length).toBe(baseline + 2);
    const impactMesh = scene.children[baseline] as FakeMesh;
    const decalMesh = scene.children[baseline + 1] as FakeMesh;
    expect(impactMesh.scale.x).toBeGreaterThan(1);
    expect(decalMesh.scale.x).toBeGreaterThan(1);
  });

  it('reuses decals without adding to the scene when the pool is full', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;
    const maxDecals = app.getFxPoolStats().decals.max;

    for (let i = 0; i < maxDecals; i += 1) {
      app.spawnDecalVfx({
        position: { x: i, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        surfaceType: 0,
        seed: i,
        ttl: 10
      });
    }

    expect(app.getFxPoolStats().decals).toMatchObject({ active: maxDecals, free: 0 });
    const filledCount = scene.children.length;
    expect(filledCount).toBe(baseline + maxDecals);

    app.spawnDecalVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: Number.NaN,
      size: -1,
      ttl: 0
    });

    expect(scene.children.length).toBe(filledCount);
    expect(app.getFxPoolStats().decals.active).toBe(maxDecals);
  });

  it('reuses impacts without adding to the scene when the pool is full', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;
    const maxImpacts = app.getFxPoolStats().impacts.max;

    for (let i = 0; i < maxImpacts; i += 1) {
      app.spawnImpactVfx({
        position: { x: i, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        surfaceType: 0,
        seed: i,
        ttl: 10
      });
    }

    expect(app.getFxPoolStats().impacts).toMatchObject({ active: maxImpacts, free: 0 });
    const filledCount = scene.children.length;
    expect(filledCount).toBe(baseline + maxImpacts);

    app.spawnImpactVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: Number.NaN,
      size: -1,
      ttl: Number.NaN
    });

    expect(scene.children.length).toBe(filledCount);
    expect(app.getFxPoolStats().impacts.active).toBe(maxImpacts);
  });

  it('keeps impact + decal VFX alive when TTL has not expired', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnImpactVfx({
      position: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: 5,
      ttl: 1
    });
    app.spawnDecalVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 1,
      seed: 6,
      ttl: 1
    });

    app.renderFrame(0.01, 500);

    expect(scene.children.length).toBe(baseline + 2);
    expect(app.getFxPoolStats().impacts.active).toBe(1);
    expect(app.getFxPoolStats().decals.active).toBe(1);
  });

  it('reuses tracer meshes from the free list', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnTracerVfx({
      origin: { x: 0, y: 0, z: 0 },
      dir: { x: 1, y: 0, z: 0 },
      length: 5
    });
    const firstTracer = scene.children[scene.children.length - 1];
    app.renderFrame(0.1, 1000);
    expect(scene.children.length).toBe(baseline);
    expect(app.getFxPoolStats().tracers).toMatchObject({ active: 0, free: 1 });

    app.spawnTracerVfx({
      origin: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 1, z: 0 },
      length: 6
    });
    const secondTracer = scene.children[scene.children.length - 1];

    expect(secondTracer).toBe(firstTracer);
    expect(scene.children.length).toBe(baseline + 1);
    expect(app.getFxPoolStats().tracers).toMatchObject({ active: 1, free: 0 });
  });

  it('defaults tracer direction when inputs are non-finite', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.spawnTracerVfx({
      origin: { x: 0, y: 0, z: 0 },
      dir: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
      length: Number.NaN
    });

    expect(app.getFxPoolStats().tracers.active).toBe(1);
  });

  it('caps tracer and muzzle flash pools by reusing active meshes', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    for (let i = 0; i < 37; i += 1) {
      app.spawnTracerVfx({
        origin: { x: i, y: 0, z: 0 },
        dir: { x: 1, y: 0, z: 0 },
        length: 1
      });
    }
    expect(app.getFxPoolStats().tracers.active).toBe(36);
    expect(scene.children.length).toBe(baseline + 36);

    for (let i = 0; i < 29; i += 1) {
      app.spawnMuzzleFlashVfx({
        position: { x: 0, y: 0, z: i },
        dir: { x: 0, y: 0, z: -1 },
        seed: i,
        ttl: 1
      });
    }
    expect(app.getFxPoolStats().muzzleFlashes.active).toBe(28);
    expect(scene.children.length).toBe(baseline + 36 + 28);
  });

  it('supports additive VFX materials when MeshBasicMaterial is available', () => {
    const baseThree = createFakeThree();
    const three = {
      ...baseThree,
      MeshBasicMaterial: FakeMaterial,
      AdditiveBlending: 'AdditiveBlending',
      DoubleSide: 'DoubleSide'
    };
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;

    app.spawnMuzzleFlashVfx({
      position: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: 0 },
      seed: 42,
      size: 0.2,
      ttl: 0.01
    });

    // Exhaust a few surface paths with explicit size/ttl to exercise branches.
    app.spawnImpactVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      surfaceType: 0,
      seed: 99,
      size: 0.2,
      ttl: 0.01
    });
    app.spawnDecalVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
      surfaceType: 3,
      seed: 123,
      size: 0.2,
      ttl: 0.01
    });

    expect(scene.children.length).toBeGreaterThan(4);
    app.renderFrame(0.1, 0);
    expect(scene.children.length).toBe(4);
  });

  it('normalizes non-finite impact normals', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnImpactVfx({
      position: { x: 0, y: 0, z: 0 },
      normal: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
      surfaceType: 0,
      seed: 7
    });

    expect(scene.children.length).toBe(baseline + 1);
  });

  it('ignores VFX spawns when positions are invalid', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });
    const scene = app.state.scene as FakeScene;
    const baseline = scene.children.length;

    app.spawnMuzzleFlashVfx({
      position: { x: Number.NaN, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: -1 },
      seed: 1
    });
    app.spawnImpactVfx({
      position: { x: 0, y: Number.NaN, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 0,
      seed: 2
    });
    app.spawnDecalVfx({
      position: { x: 0, y: 0, z: Number.NaN },
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: 0,
      seed: 3
    });

    expect(scene.children.length).toBe(baseline);
    expect(app.getFxPoolStats()).toMatchObject({
      muzzleFlashes: { active: 0 },
      impacts: { active: 0 },
      decals: { active: 0 }
    });
  });

  it('ignores invalid weapon cooldowns', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.recordWeaponFired(0, -1);
    expect(app.getWeaponCooldown(0)).toBe(0);
  });

  it('clamps non-finite weapon slots', () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1 });

    app.recordWeaponFired(Number.NaN, 0.5);
    expect(app.getWeaponCooldown(0)).toBeCloseTo(0.5);
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
        weaponSlot: 0,
        ammoInMag: 30,
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
        weaponSlot: 0,
        ammoInMag: 25,
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
    expect(app.state.camera.position.z).toBeCloseTo(0);
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

  it('supports map seed updates and applies loaded colliders to replacement sims', async () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');
    const mapA = {
      seed: 0,
      colliders: [{ id: 1, minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 2, surfaceType: 2 }],
      pickupSpawns: [],
      placements: 1,
      loaded: 1,
      failed: 0,
      dispose: vi.fn()
    };
    const mapB = {
      seed: 42,
      colliders: [{ id: 2, minX: 2, minY: -1, minZ: 0, maxX: 3, maxY: 1, maxZ: 2, surfaceType: 1 }],
      pickupSpawns: [],
      placements: 1,
      loaded: 1,
      failed: 0,
      dispose: vi.fn()
    };
    loadRetroUrbanMapMock
      .mockResolvedValueOnce(mapA)
      .mockResolvedValueOnce(mapB)
      .mockResolvedValueOnce(null);

    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });
    await flushAsync();

    expect(loadRetroUrbanMapMock).toHaveBeenCalledTimes(1);

    app.setMapSeed(0);
    expect(loadRetroUrbanMapMock).toHaveBeenCalledTimes(1);

    const sim = {
      step: vi.fn(),
      getState: vi.fn(() => ({
        x: 0,
        y: 0,
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
      setConfig: vi.fn(),
      setColliders: vi.fn()
    };
    app.setPredictionSim(sim);
    expect(sim.setColliders).toHaveBeenCalledWith([expect.objectContaining(mapA.colliders[0]!)]);

    app.setMapSeed(42.9);
    await flushAsync();

    expect(loadRetroUrbanMapMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ seed: 42, procedural: true })
    );
    expect(mapA.dispose).toHaveBeenCalledTimes(1);
    expect(sim.setColliders).toHaveBeenLastCalledWith([expect.objectContaining(mapB.colliders[0]!)]);

    app.setMapSeed(Number.NaN);
    await flushAsync();
    expect(loadRetroUrbanMapMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ seed: 0, procedural: true })
    );
    expect(sim.setColliders).toHaveBeenLastCalledWith([]);
  });

  it('drops stale map loads when a newer map seed request resolves first', async () => {
    const three = createFakeThree();
    const canvas = document.createElement('canvas');

    let resolveInitial: ((value: unknown) => void) | null = null;
    let resolveNext: ((value: unknown) => void) | null = null;
    const initialLoad = new Promise((resolve) => {
      resolveInitial = resolve;
    });
    const nextLoad = new Promise((resolve) => {
      resolveNext = resolve;
    });
    loadRetroUrbanMapMock.mockImplementationOnce(() => initialLoad).mockImplementationOnce(() => nextLoad);

    const staleMap = {
      seed: 0,
      colliders: [],
      pickupSpawns: [],
      placements: 0,
      loaded: 0,
      failed: 0,
      dispose: vi.fn()
    };
    const latestMap = {
      seed: 99,
      colliders: [{ id: 10, minX: -2, minY: -2, minZ: 0, maxX: -1, maxY: -1, maxZ: 2, surfaceType: 0 }],
      pickupSpawns: [],
      placements: 1,
      loaded: 1,
      failed: 0,
      dispose: vi.fn()
    };

    const app = createApp({ three, canvas, width: 640, height: 480, devicePixelRatio: 1, loadEnvironment: true });
    app.setMapSeed(99);
    resolveInitial?.(staleMap);
    await flushAsync();

    expect(staleMap.dispose).toHaveBeenCalledTimes(1);

    resolveNext?.(latestMap);
    await flushAsync();

    app.dispose();
    expect(latestMap.dispose).toHaveBeenCalledTimes(1);
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
