export interface InputSample {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  jump: boolean;
  fire: boolean;
  sprint: boolean;
}

export interface InputSampler {
  sample: () => InputSample;
  setBindings: (bindings: InputBindings) => void;
  dispose: () => void;
}

export interface InputBindings {
  forward: string[];
  backward: string[];
  left: string[];
  right: string[];
  jump: string[];
  sprint: string[];
}

export const DEFAULT_BINDINGS: InputBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight']
};

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0);

const isAnyPressed = (keys: Set<string>, bindings: string[]) =>
  bindings.some((binding) => keys.has(binding));

export interface InputSamplerOptions {
  target: Window;
  bindings?: InputBindings;
}

export const createInputSampler = ({ target, bindings = DEFAULT_BINDINGS }: InputSamplerOptions): InputSampler => {
  const pressed = new Set<string>();
  let fire = false;
  let lookDeltaX = 0;
  let lookDeltaY = 0;
  let currentBindings = bindings;

  const onKeyDown = (event: KeyboardEvent) => {
    pressed.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      fire = true;
    }
  };

  const onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      fire = false;
    }
  };

  const onMouseMove = (event: MouseEvent) => {
    lookDeltaX += safeNumber(event.movementX);
    lookDeltaY += safeNumber(event.movementY);
  };

  const onBlur = () => {
    pressed.clear();
    fire = false;
    lookDeltaX = 0;
    lookDeltaY = 0;
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('blur', onBlur);

  const sample = (): InputSample => {
    const forward = isAnyPressed(pressed, currentBindings.forward);
    const backward = isAnyPressed(pressed, currentBindings.backward);
    const left = isAnyPressed(pressed, currentBindings.left);
    const right = isAnyPressed(pressed, currentBindings.right);
    const jump = isAnyPressed(pressed, currentBindings.jump);
    const sprint = isAnyPressed(pressed, currentBindings.sprint);

    const moveX = Number(right) - Number(left);
    const moveY = Number(forward) - Number(backward);

    const sampleValue: InputSample = {
      moveX,
      moveY,
      lookDeltaX: safeNumber(lookDeltaX),
      lookDeltaY: safeNumber(lookDeltaY),
      jump,
      fire,
      sprint
    };

    lookDeltaX = 0;
    lookDeltaY = 0;

    return sampleValue;
  };

  const dispose = () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousedown', onMouseDown);
    target.removeEventListener('mouseup', onMouseUp);
    target.removeEventListener('mousemove', onMouseMove);
    target.removeEventListener('blur', onBlur);
    pressed.clear();
    fire = false;
    lookDeltaX = 0;
    lookDeltaY = 0;
  };

  const setBindings = (nextBindings: InputBindings) => {
    currentBindings = nextBindings;
  };

  return { sample, setBindings, dispose };
};
