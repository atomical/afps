import type { InputSample } from '../input/sampler';

export interface InputCmd {
  type: 'InputCmd';
  inputSeq: number;
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  jump: boolean;
  fire: boolean;
  sprint: boolean;
}

const clampAxis = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
};

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const buildInputCmd = (inputSeq: number, sample: InputSample): InputCmd => ({
  type: 'InputCmd',
  inputSeq: Math.max(0, Math.floor(safeNumber(inputSeq))),
  moveX: clampAxis(sample.moveX),
  moveY: clampAxis(sample.moveY),
  lookDeltaX: safeNumber(sample.lookDeltaX),
  lookDeltaY: safeNumber(sample.lookDeltaY),
  jump: Boolean(sample.jump),
  fire: Boolean(sample.fire),
  sprint: Boolean(sample.sprint)
});

export const serializeInputCmd = (cmd: InputCmd) => JSON.stringify(cmd);
