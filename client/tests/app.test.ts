import { describe, expect, it, vi, beforeEach } from 'vitest';
const loadRetroUrbanMapMock = vi.fn();
vi.mock('../src/environment/retro_urban_map', () => ({
  loadRetroUrbanMap: (...args: unknown[]) => loadRetroUrbanMapMock(...args)
}));
import { createApp } from '../src/app';
import { SIM_CONFIG } from '../src/sim/config';
import { createFakeThree, FakeCamera, FakeRenderer, FakeScene } from './fakeThree';

describe('createApp', () => {
  beforeEach(() => {
    loadRetroUrbanMapMock.mockReset();
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
        dashCooldown: 0
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
        dashCooldown: 0
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
      jump: false,
      fire: false,
      sprint: false,
      dash: false
    });

    app.renderFrame(0, 1000);

    const expected = SIM_CONFIG.accel * (1 / 60) * (1 / 60);
    expect(app.state.cube.position.x).toBeCloseTo(expected);
    expect(app.state.camera.position.x).toBeCloseTo(expected);
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
      jump: true,
      fire: false,
      sprint: false,
      dash: false
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
      jump: false,
      fire: false,
      sprint: false,
      dash: false
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
      getState: vi.fn(() => ({ x: 2, y: 3, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 })),
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
      jump: false,
      fire: false,
      sprint: false,
      dash: false
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

    expect(camera.rotation.y).toBeCloseTo(1);
    expect(camera.rotation.x).toBeCloseTo(0.5);

    const beforePitch = camera.rotation.x;
    app.applyLookDelta(Number.NaN, Number.POSITIVE_INFINITY);
    expect(camera.rotation.x).toBe(beforePitch);

    app.applyLookDelta(0, 1e6);
    expect(camera.rotation.x).toBeGreaterThanOrEqual(-Math.PI / 2);
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

    expect(camera.rotation.y).toBeCloseTo(firstYaw + 1);
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

    expect(camera.rotation.y).toBeCloseTo(firstYaw + 0.5);
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
