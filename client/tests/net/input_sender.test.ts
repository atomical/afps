import { describe, expect, it, vi } from 'vitest';
import * as flatbuffers from 'flatbuffers';
import { __test, createInputSender } from '../../src/net/input_sender';
import { decodeEnvelope, MessageType } from '../../src/net/protocol';
import { InputCmd } from '../../src/net/fbs/afps/protocol/input-cmd';
import { FakeDataChannel } from './fakes';
import type { InputSampler } from '../../src/input/sampler';

const createSampler = (sampleOverride?: Partial<ReturnType<InputSampler['sample']>>): InputSampler => ({
  sample: () => ({
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    jump: false,
    fire: false,
    sprint: false,
    dash: false,
    grapple: false,
    shield: false,
    shockwave: false,
    weaponSlot: 0,
    ...sampleOverride
  }),
  dispose: () => {}
});

describe('input sender', () => {
  it('sends input commands and increments sequence', () => {
    const channel = new FakeDataChannel('afps_unreliable');
    channel.readyState = 'open';
    const sampler = createSampler({ moveX: 1 });
    const onSend = vi.fn();
    let msgSeq = 0;

    const sender = createInputSender({
      channel,
      sampler,
      onSend,
      nextMessageSeq: () => {
        msgSeq += 1;
        return msgSeq;
      },
      getServerSeqAck: () => 0
    });
    expect(sender.sendOnce()).toBe(true);
    expect(sender.sendOnce()).toBe(true);

    const firstEnvelope = decodeEnvelope(channel.sent[0] as Uint8Array);
    const secondEnvelope = decodeEnvelope(channel.sent[1] as Uint8Array);
    expect(firstEnvelope?.header.msgType).toBe(MessageType.InputCmd);
    expect(secondEnvelope?.header.msgType).toBe(MessageType.InputCmd);
    const first = InputCmd.getRootAsInputCmd(new flatbuffers.ByteBuffer(firstEnvelope!.payload));
    const second = InputCmd.getRootAsInputCmd(new flatbuffers.ByteBuffer(secondEnvelope!.payload));

    expect(first.inputSeq()).toBe(1);
    expect(second.inputSeq()).toBe(2);
    expect(first.moveX()).toBe(1);
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ inputSeq: 1 }));
  });

  it('warns when channel is not open', () => {
    const channel = new FakeDataChannel('afps_unreliable');
    channel.readyState = 'connecting';
    const sampler = createSampler();
    const warn = vi.fn();
    const onSend = vi.fn();

    const sender = createInputSender({
      channel,
      sampler,
      nextMessageSeq: () => 1,
      getServerSeqAck: () => 0,
      logger: { info: () => {}, warn, error: () => {} },
      onSend
    });
    expect(sender.sendOnce()).toBe(false);
    expect(warn).toHaveBeenCalledWith('input channel not open');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('starts and stops interval sending', () => {
    const channel = new FakeDataChannel('afps_unreliable');
    channel.readyState = 'open';
    const sampler = createSampler();

    let intervalCallback: (() => void) | null = null;
    let intervalMs = 0;
    let intervalCalls = 0;
    let clearedId: number | null = null;

    const timers = {
      setInterval: (callback: () => void, ms: number) => {
        intervalCallback = callback;
        intervalMs = ms;
        intervalCalls += 1;
        return 42;
      },
      clearInterval: (id: number) => {
        clearedId = id;
      },
      setTimeout: () => 0,
      clearTimeout: () => {}
    };

    const sender = createInputSender({
      channel,
      sampler,
      tickRate: 0,
      timers,
      nextMessageSeq: () => 1,
      getServerSeqAck: () => 0
    });
    sender.start();
    sender.start();

    expect(intervalCalls).toBe(1);
    expect(intervalMs).toBe(17);

    intervalCallback?.();
    expect(channel.sent).toHaveLength(1);

    sender.stop();
    expect(clearedId).toBe(42);
  });

  it('does nothing when stopped before start', () => {
    const channel = new FakeDataChannel('afps_unreliable');
    const sampler = createSampler();
    const clearInterval = vi.fn();

    const sender = createInputSender({
      channel,
      sampler,
      nextMessageSeq: () => 1,
      getServerSeqAck: () => 0,
      timers: { setInterval: () => 1, clearInterval, setTimeout: () => 0, clearTimeout: () => {} }
    });

    sender.stop();
    expect(clearInterval).not.toHaveBeenCalled();
  });

  it('exposes default timers and tick rate resolver', () => {
    expect(__test.resolveTickRate(undefined)).toBe(60);
    expect(__test.resolveTickRate(30)).toBe(30);

    const intervalId = __test.defaultTimers.setInterval(() => {}, 1);
    __test.defaultTimers.clearInterval(intervalId);
    const timeoutId = __test.defaultTimers.setTimeout(() => {}, 1);
    __test.defaultTimers.clearTimeout(timeoutId);
  });
});
