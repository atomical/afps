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

describe('input sampler', () => {
  it('tracks keyboard movement and sprint', () => {
    const sampler = createInputSampler({ target: window });

    dispatchKey('keydown', 'KeyW');
    dispatchKey('keydown', 'KeyD');
    dispatchKey('keydown', 'ShiftLeft');

    let sample = sampler.sample();
    expect(sample.moveY).toBe(1);
    expect(sample.moveX).toBe(1);
    expect(sample.sprint).toBe(true);

    dispatchKey('keyup', 'KeyW');
    dispatchKey('keyup', 'KeyD');
    dispatchKey('keyup', 'ShiftLeft');

    sample = sampler.sample();
    expect(sample.moveY).toBe(0);
    expect(sample.moveX).toBe(0);
    expect(sample.sprint).toBe(false);

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
      sprint: ['KeyO']
    };
    sampler.setBindings(custom);

    dispatchKey('keydown', 'KeyI');
    dispatchKey('keydown', 'KeyL');
    dispatchKey('keydown', 'KeyO');

    const sample = sampler.sample();
    expect(sample.moveY).toBe(1);
    expect(sample.moveX).toBe(1);
    expect(sample.sprint).toBe(true);

    sampler.dispose();
  });
});
