import { beforeEach, describe, expect, it } from 'vitest';
import { createStatusOverlay } from '../../src/ui/status';

describe('status overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates overlay in container and updates state', () => {
    const container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);

    const overlay = createStatusOverlay(document);

    expect(container.contains(overlay.element)).toBe(true);
    expect(overlay.element.dataset.state).toBe('idle');

    overlay.setState('connecting', 'hello');
    expect(overlay.element.dataset.state).toBe('connecting');
    expect(overlay.element.textContent).toContain('Connecting');
    expect(overlay.element.textContent).toContain('hello');

    overlay.setDetail('detail');
    expect(overlay.element.textContent).toContain('detail');

    overlay.setMetrics('rtt 10ms');
    expect(overlay.element.textContent).toContain('rtt 10ms');
    overlay.setMetrics();
    expect(overlay.element.textContent).not.toContain('rtt 10ms');
    overlay.setMetricsVisible(false);
    expect(overlay.element.dataset.metrics).toBe('hidden');
    overlay.setMetricsVisible(true);
    expect(overlay.element.dataset.metrics).toBe('visible');

    overlay.setState('connected', 'ready');
    expect(overlay.element.textContent).toContain('Connected');

    overlay.setState('error', 'oops');
    expect(overlay.element.textContent).toContain('Error');

    overlay.setState('disabled', 'off');
    expect(overlay.element.textContent).toContain('Disabled');

    overlay.setState('idle');
    expect(overlay.element.textContent).toContain('Idle');

    overlay.dispose();
    expect(container.contains(overlay.element)).toBe(false);
  });

  it('falls back to document body', () => {
    const overlay = createStatusOverlay(document, 'missing');

    expect(document.body.contains(overlay.element)).toBe(true);
    overlay.dispose();
  });
});
