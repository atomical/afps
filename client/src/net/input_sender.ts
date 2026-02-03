import type { Logger, TimerLike, DataChannelLike } from './types';
import type { InputSampler } from '../input/sampler';
import type { InputCmd } from './input_cmd';
import { buildInputCmd } from './input_cmd';
import { encodeInputCmd } from './protocol';

export interface InputSenderOptions {
  channel: DataChannelLike;
  sampler: InputSampler;
  nextMessageSeq: () => number;
  getServerSeqAck: () => number;
  tickRate?: number;
  logger?: Logger;
  timers?: TimerLike;
  onSend?: (cmd: InputCmd) => void;
}

export interface InputSender {
  start: () => void;
  stop: () => void;
  sendOnce: () => boolean;
}

const defaultTimers: TimerLike = {
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (id) => window.clearInterval(id),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (id) => window.clearTimeout(id)
};

const resolveTickRate = (tickRate?: number) =>
  Number.isFinite(tickRate) && (tickRate as number) > 0 ? (tickRate as number) : 60;

export const createInputSender = ({
  channel,
  sampler,
  nextMessageSeq,
  getServerSeqAck,
  tickRate,
  logger,
  timers = defaultTimers,
  onSend
}: InputSenderOptions): InputSender => {
  let sequence = 0;
  let intervalId = 0;
  let running = false;

  const sendOnce = () => {
    if (channel.readyState !== 'open') {
      if (logger) {
        logger.warn('input channel not open');
      }
      return false;
    }
    sequence += 1;
    const cmd = buildInputCmd(sequence, sampler.sample());
    onSend?.(cmd);
    channel.send(encodeInputCmd(cmd, nextMessageSeq(), getServerSeqAck()));
    return true;
  };

  const start = () => {
    if (running) {
      return;
    }
    running = true;
    const intervalMs = Math.max(1, Math.round(1000 / resolveTickRate(tickRate)));
    intervalId = timers.setInterval(() => {
      sendOnce();
    }, intervalMs);
  };

  const stop = () => {
    if (!running) {
      return;
    }
    running = false;
    timers.clearInterval(intervalId);
    intervalId = 0;
  };

  return { start, stop, sendOnce };
};

export const __test = { defaultTimers, resolveTickRate };
