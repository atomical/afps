import { describe, expect, it } from 'vitest';
import { createInputSampler, type InputBindings } from '../../src/input/sampler';

const dispatchKey = (type: 'keydown' | 'keyup', code: string) => {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
};

const dispatchMove = (dx: number, dy: number) => {
  const event = new MouseEvent('mousemove');
  Object.defineProperty(event, 'movementX', { value: dx });
  Object.defineProperty(event, 'movementY', { value: dy });
  window.dispatchEvent(event);
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const pick = <T,>(list: T[], rand: () => number) => list[Math.floor(rand() * list.length)];

describe('input sampler', () => {
  it('tracks keyboard movement and sprint', () => {
    const sampler = createInputSampler({ target: window });

    dispatchKey('keydown', 'KeyW');
    dispatchKey('keydown', 'KeyD');
    dispatchKey('keydown', 'ShiftLeft');
    dispatchKey('keydown', 'KeyE');

    let sample = sampler.sample();
    expect(sample.moveY).toBe(1);
    expect(sample.moveX).toBe(1);
    expect(sample.sprint).toBe(true);
    expect(sample.dash).toBe(true);

    dispatchKey('keyup', 'KeyW');
    dispatchKey('keyup', 'KeyD');
    dispatchKey('keyup', 'ShiftLeft');
    dispatchKey('keyup', 'KeyE');

    sample = sampler.sample();
    expect(sample.moveY).toBe(0);
    expect(sample.moveX).toBe(0);
    expect(sample.sprint).toBe(false);
    expect(sample.dash).toBe(false);

    sampler.dispose();
  });

  it('accumulates and resets mouse deltas and fire button', () => {
    const sampler = createInputSampler({ target: window });

    dispatchMove(5, -3);
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));

    let sample = sampler.sample();
    expect(sample.lookDeltaX).toBe(5);
    expect(sample.lookDeltaY).toBe(-3);
    expect(sample.fire).toBe(true);

    sample = sampler.sample();
    expect(sample.lookDeltaX).toBe(0);
    expect(sample.lookDeltaY).toBe(0);

    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    sample = sampler.sample();
    expect(sample.fire).toBe(false);

    sampler.dispose();
  });

  it('clears state on blur and dispose', () => {
    const sampler = createInputSampler({ target: window });

    dispatchKey('keydown', 'KeyA');
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchMove(2, 2);

    window.dispatchEvent(new Event('blur'));
    const sample = sampler.sample();
    expect(sample.moveX).toBe(0);
    expect(sample.fire).toBe(false);
    expect(sample.lookDeltaX).toBe(0);
    expect(sample.lookDeltaY).toBe(0);

    sampler.dispose();
    dispatchKey('keydown', 'KeyW');
    expect(sampler.sample().moveY).toBe(0);
  });

  it('ignores non-finite mouse deltas', () => {
    const sampler = createInputSampler({ target: window });

    dispatchMove(Number.NaN, Number.POSITIVE_INFINITY);
    const sample = sampler.sample();
    expect(sample.lookDeltaX).toBe(0);
    expect(sample.lookDeltaY).toBe(0);

    sampler.dispose();
  });

  it('supports custom bindings updates', () => {
    const sampler = createInputSampler({ target: window });
    const custom: InputBindings = {
      forward: ['KeyI'],
      backward: ['KeyK'],
      left: ['KeyJ'],
      right: ['KeyL'],
      jump: ['KeyU'],
      sprint: ['KeyO'],
      dash: ['KeyP']
    };
    sampler.setBindings(custom);

    dispatchKey('keydown', 'KeyI');
    dispatchKey('keydown', 'KeyL');
    dispatchKey('keydown', 'KeyO');
    dispatchKey('keydown', 'KeyP');

    const sample = sampler.sample();
    expect(sample.moveY).toBe(1);
    expect(sample.moveX).toBe(1);
    expect(sample.sprint).toBe(true);
    expect(sample.dash).toBe(true);

    sampler.dispose();
  });

  it('never emits NaNs for randomized input streams', () => {
    const sampler = createInputSampler({ target: window });
    const rand = createRng(0x1234abcd);
    const codes = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ShiftLeft',
      'ShiftRight',
      'Space',
      'KeyZ',
      'KeyE'
    ];
    const deltas = [0, 1, -1, 5, -5, 12.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

    for (let i = 0; i < 200; i += 1) {
      const action = Math.floor(rand() * 5);
      if (action === 0) {
        dispatchKey('keydown', pick(codes, rand));
      } else if (action === 1) {
        dispatchKey('keyup', pick(codes, rand));
      } else if (action === 2) {
        dispatchMove(pick(deltas, rand), pick(deltas, rand));
      } else if (action === 3) {
        window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      } else {
        window.dispatchEvent(new Event('blur'));
      }

      const sample = sampler.sample();
      expect(Number.isFinite(sample.moveX)).toBe(true);
      expect(Number.isFinite(sample.moveY)).toBe(true);
      expect(sample.moveX).toBeGreaterThanOrEqual(-1);
      expect(sample.moveX).toBeLessThanOrEqual(1);
      expect(sample.moveY).toBeGreaterThanOrEqual(-1);
      expect(sample.moveY).toBeLessThanOrEqual(1);
      expect(Number.isFinite(sample.lookDeltaX)).toBe(true);
      expect(Number.isFinite(sample.lookDeltaY)).toBe(true);
      expect(typeof sample.jump).toBe('boolean');
      expect(typeof sample.fire).toBe('boolean');
      expect(typeof sample.sprint).toBe('boolean');
      expect(typeof sample.dash).toBe('boolean');
    }

    sampler.dispose();
  });
});
