export interface FakeWindow {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  performance: { now: () => number };
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, handler: EventListenerOrEventListenerObject) => void;
  triggerResize: (width: number, height: number, dpr: number) => void;
  flushFrame: (handle: number, now: number) => void;
  canceled: number[];
  lastHandle: number;
}

export const createFakeWindow = (): FakeWindow => {
  let resizeHandler: EventListenerOrEventListenerObject | null = null;
  const callbacks = new Map<number, FrameRequestCallback>();
  const canceled: number[] = [];
  let lastHandle = 0;

  const windowStub: FakeWindow = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
    performance: {
      now: () => 1000
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      lastHandle += 1;
      windowStub.lastHandle = lastHandle;
      callbacks.set(lastHandle, callback);
      return lastHandle;
    },
    cancelAnimationFrame: (handle: number) => {
      canceled.push(handle);
      callbacks.delete(handle);
    },
    addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
      if (type === 'resize') {
        resizeHandler = handler;
      }
    },
    removeEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
      if (type === 'resize' && resizeHandler === handler) {
        resizeHandler = null;
      }
    },
    triggerResize: (width: number, height: number, dpr: number) => {
      windowStub.innerWidth = width;
      windowStub.innerHeight = height;
      windowStub.devicePixelRatio = dpr;
      if (resizeHandler) {
        if (typeof resizeHandler === 'function') {
          resizeHandler(new Event('resize'));
        } else {
          resizeHandler.handleEvent(new Event('resize'));
        }
      }
    },
    flushFrame: (handle: number, now: number) => {
      const callback = callbacks.get(handle);
      if (callback) {
        callback(now);
      }
    },
    canceled,
    lastHandle
  };

  return windowStub;
};
