import { describe, expect, it, vi } from 'vitest';
import { createPointerLockController } from '../../src/input/pointer_lock';

const setPointerLockElement = (value: Element | null) => {
  Object.defineProperty(document, 'pointerLockElement', {
    value,
    configurable: true
  });
};

describe('createPointerLockController', () => {
  it('requests pointer lock on click when supported', () => {
    const canvas = document.createElement('canvas') as HTMLCanvasElement & { requestPointerLock?: () => void };
    const requestPointerLock = vi.fn();
    canvas.requestPointerLock = requestPointerLock;

    const controller = createPointerLockController({ document, element: canvas });

    canvas.dispatchEvent(new MouseEvent('click'));

    expect(controller.supported).toBe(true);
    expect(requestPointerLock).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('reports lock state changes', () => {
    const canvas = document.createElement('canvas');
    const onChange = vi.fn();

    const controller = createPointerLockController({ document, element: canvas, onChange });

    setPointerLockElement(canvas);
    document.dispatchEvent(new Event('pointerlockchange'));

    setPointerLockElement(null);
    document.dispatchEvent(new Event('pointerlockchange'));

    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
    expect(controller.isLocked()).toBe(false);

    controller.dispose();
  });

  it('disposes event listeners', () => {
    const canvas = document.createElement('canvas');
    const onChange = vi.fn();

    const controller = createPointerLockController({ document, element: canvas, onChange, bindClick: false });

    controller.dispose();
    setPointerLockElement(canvas);
    document.dispatchEvent(new Event('pointerlockchange'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles pointer lock errors', () => {
    const canvas = document.createElement('canvas');
    const onChange = vi.fn();

    const controller = createPointerLockController({ document, element: canvas, onChange, bindClick: false });

    document.dispatchEvent(new Event('pointerlockerror'));

    expect(onChange).toHaveBeenCalledWith(false);

    controller.dispose();
  });

  it('no-ops when unsupported', () => {
    const canvas = document.createElement('canvas');

    const controller = createPointerLockController({ document, element: canvas, bindClick: false });

    controller.request();
    expect(controller.supported).toBe(false);
    expect(controller.isLocked()).toBe(false);

    controller.dispose();
  });
});
