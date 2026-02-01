import { createApp } from './app';
import type { App, ThreeLike } from './types';

export interface BootstrapOptions {
  three: ThreeLike;
  document: Document;
  window: Window;
  containerId?: string;
  lookSensitivity?: number;
  loadEnvironment?: boolean;
}

export interface BootResult {
  app: App;
  stop: () => void;
  canvas: HTMLCanvasElement;
}

const ensureContainer = (doc: Document, containerId: string) => {
  const existing = doc.getElementById(containerId);
  if (existing) {
    return existing;
  }

  const container = doc.createElement('div');
  container.id = containerId;
  doc.body.appendChild(container);
  return container;
};

const getViewport = (win: Window) => {
  const width = Math.max(1, win.innerWidth);
  const height = Math.max(1, win.innerHeight);
  const dpr = Math.max(1, win.devicePixelRatio || 1);
  return { width, height, dpr };
};

export const startApp = ({
  three,
  document,
  window,
  containerId = 'app',
  lookSensitivity,
  loadEnvironment
}: BootstrapOptions): BootResult => {
  const container = ensureContainer(document, containerId);
  const canvas = document.createElement('canvas');
  container.replaceChildren(canvas);

  const viewport = getViewport(window);
  const app = createApp({
    three,
    canvas,
    width: viewport.width,
    height: viewport.height,
    devicePixelRatio: viewport.dpr,
    lookSensitivity,
    loadEnvironment
  });

  let lastTime = window.performance.now();
  let frameHandle = 0;

  const onFrame = (now: number) => {
    const deltaSeconds = (now - lastTime) / 1000;
    lastTime = now;
    app.renderFrame(deltaSeconds, now);
    frameHandle = window.requestAnimationFrame(onFrame);
  };

  const onResize = () => {
    const nextViewport = getViewport(window);
    app.resize(nextViewport.width, nextViewport.height, nextViewport.dpr);
  };

  window.addEventListener('resize', onResize);
  frameHandle = window.requestAnimationFrame(onFrame);

  const stop = () => {
    window.cancelAnimationFrame(frameHandle);
    window.removeEventListener('resize', onResize);
    app.dispose();
  };

  return { app, stop, canvas };
};
