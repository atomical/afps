import { describe, expect, it, vi } from 'vitest';
import { __test, defaultPeerConnectionFactory } from '../../src/net/webrtc';
import { FakeDataChannel } from './fakes';

const createTimers = () => ({
  setInterval: (callback: () => void, ms: number) => window.setInterval(callback, ms),
  clearInterval: (id: number) => window.clearInterval(id),
  setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimeout: (id: number) => window.clearTimeout(id)
});

describe('webrtc helpers', () => {
  it('waits for datachannel open and times out', async () => {
    vi.useFakeTimers();
    const channel = new FakeDataChannel();
    const timers = createTimers();
    const openPromise = __test.waitForDataChannelOpen(channel, timers, 50);
    vi.advanceTimersByTime(50);
    await expect(openPromise).rejects.toThrow('DataChannel open timeout');

    const channel2 = new FakeDataChannel();
    const openPromise2 = __test.waitForDataChannelOpen(channel2, timers, 50);
    channel2.open();
    await expect(openPromise2).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('resolves immediately when channel is already open', async () => {
    const channel = new FakeDataChannel();
    channel.readyState = 'open';
    const timers = createTimers();

    await expect(__test.waitForDataChannelOpen(channel, timers, 50)).resolves.toBeUndefined();
  });

  it('clears timeout when channel opens', async () => {
    const channel = new FakeDataChannel();
    let cleared = false;
    const timers = {
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 99,
      clearTimeout: (id: number) => {
        if (id === 99) {
          cleared = true;
        }
      }
    };

    const openPromise = __test.waitForDataChannelOpen(channel, timers, 50);
    channel.open();
    await expect(openPromise).resolves.toBeUndefined();
    expect(cleared).toBe(true);
  });

  it('poller stops when closed', async () => {
    let pollCount = 0;
    let intervalCallback: (() => void) | null = null;
    const timers = {
      setInterval: (callback: () => void) => {
        intervalCallback = callback;
        return 1;
      },
      clearInterval: vi.fn(),
      setTimeout: (callback: () => void) => window.setTimeout(callback, 0),
      clearTimeout: (id: number) => window.clearTimeout(id)
    };

    const stop = __test.startCandidatePolling(timers, 10, async () => {
      pollCount += 1;
    });

    await intervalCallback?.();
    expect(pollCount).toBe(1);

    stop();
    await intervalCallback?.();
    expect(pollCount).toBe(1);
  });

  it('waits for channel events', async () => {
    vi.useFakeTimers();
    const timers = createTimers();
    let resolveChannel: ((value: FakeDataChannel) => void) | null = null;
    const channelPromise = new Promise<FakeDataChannel>((resolve) => {
      resolveChannel = resolve;
    });

    const waitPromise = __test.waitForChannelEvent(channelPromise, timers, 100);
    const channel = new FakeDataChannel();
    resolveChannel?.(channel);

    await expect(waitPromise).resolves.toBe(channel);

    const timeoutPromise = __test.waitForChannelEvent(new Promise(() => {}), timers, 10);
    vi.advanceTimersByTime(20);
    await expect(timeoutPromise).rejects.toThrow('DataChannel not created');
    vi.useRealTimers();
  });

  it('propagates channel promise rejections', async () => {
    const timers = createTimers();
    const channelPromise = Promise.reject(new Error('boom'));
    await expect(__test.waitForChannelEvent(channelPromise, timers, 10)).rejects.toThrow('boom');
  });

  it('times out waiting for server hello', async () => {
    vi.useFakeTimers();
    const timers = createTimers();
    const never = new Promise<never>(() => {});

    const waitPromise = __test.waitForServerHello(never, timers, 10);
    vi.advanceTimersByTime(20);
    await expect(waitPromise).rejects.toThrow('ServerHello timeout');
    vi.useRealTimers();
  });

  it('propagates server hello rejections', async () => {
    const timers = createTimers();
    const failed = Promise.reject(new Error('bad hello'));
    await expect(__test.waitForServerHello(failed, timers, 50)).rejects.toThrow('bad hello');
  });

  it('swallows polling errors', async () => {
    let intervalCallback: (() => void) | null = null;
    const timers = {
      setInterval: (callback: () => void) => {
        intervalCallback = callback;
        return 1;
      },
      clearInterval: vi.fn(),
      setTimeout: (callback: () => void) => window.setTimeout(callback, 0),
      clearTimeout: (id: number) => window.clearTimeout(id)
    };

    const stop = __test.startCandidatePolling(timers, 10, async () => {
      throw new Error('poll failed');
    });

    await intervalCallback?.();
    stop();
  });

  it('exercises default logger and timers', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    __test.defaultLogger.info('info');
    __test.defaultLogger.warn('warn');
    __test.defaultLogger.error('error');

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    const intervalId = __test.defaultTimers.setInterval(() => {}, 1000);
    __test.defaultTimers.clearInterval(intervalId);
    const timeoutId = __test.defaultTimers.setTimeout(() => {}, 1000);
    __test.defaultTimers.clearTimeout(timeoutId);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('uses default peer connection factory', () => {
    class GlobalPeerConnection {
      static lastConfig: RTCConfiguration | null = null;

      constructor(config?: RTCConfiguration) {
        GlobalPeerConnection.lastConfig = config ?? null;
      }
    }

    const original = globalThis.RTCPeerConnection;
    (globalThis as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection =
      GlobalPeerConnection as unknown as typeof RTCPeerConnection;

    const pc = defaultPeerConnectionFactory.create({ iceServers: [] });
    expect(pc).toBeInstanceOf(GlobalPeerConnection);
    expect(GlobalPeerConnection.lastConfig).toEqual({ iceServers: [] });

    (globalThis as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection = original;
  });
});
