import { beforeEach, describe, expect, it } from 'vitest';
import { startApp } from '../src/bootstrap';
import { createFakeThree, FakeRenderer } from './fakeThree';
import { createFakeWindow } from './fakeWindow';

describe('startApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  it('creates container and runs a frame loop', () => {
    const three = createFakeThree();
    const win = createFakeWindow();

    const result = startApp({ three, document, window: win as unknown as Window });

    const container = document.getElementById('app');
    expect(container).not.toBeNull();
    expect(container?.firstElementChild).toBe(result.canvas);

    const firstHandle = win.lastHandle;
    win.flushFrame(firstHandle, 1016);

    expect(result.app.state.cube.rotation.x).toBeGreaterThan(0);

    win.triggerResize(1024, 768, 1);
    expect(result.app.state.dimensions).toEqual({ width: 1024, height: 768, dpr: 1 });

    result.stop();

    const renderer = result.app.state.renderer as FakeRenderer;
    expect(renderer.disposeCalls).toBe(1);
    expect(win.canceled).toContain(win.lastHandle);
  });

  it('reuses an existing container and clamps device pixel ratio', () => {
    const existing = document.createElement('div');
    existing.id = 'app';
    document.body.appendChild(existing);

    const three = createFakeThree();
    const win = createFakeWindow();
    win.devicePixelRatio = 0;

    const result = startApp({ three, document, window: win as unknown as Window, containerId: 'app' });

    expect(existing.firstElementChild).toBe(result.canvas);
    expect(result.app.state.dimensions.dpr).toBe(1);

    result.stop();
  });
});
