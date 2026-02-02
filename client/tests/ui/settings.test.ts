import { describe, expect, it, vi } from 'vitest';
import { createSettingsOverlay } from '../../src/ui/settings';

describe('settings overlay', () => {
  it('creates overlay and updates sensitivity', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const onChange = vi.fn();
    const onBindingsChange = vi.fn();
    const onShowMetricsChange = vi.fn();
    const onInvertLookXChange = vi.fn();
    const onInvertLookYChange = vi.fn();
    const settings = createSettingsOverlay(document, {
      initialSensitivity: 0.003,
      onSensitivityChange: onChange,
      onBindingsChange,
      initialInvertLookX: true,
      initialInvertLookY: false,
      onInvertLookXChange,
      onInvertLookYChange,
      initialShowMetrics: false,
      onShowMetricsChange
    });

    expect(settings.isVisible()).toBe(false);
    settings.setVisible(true);
    expect(settings.isVisible()).toBe(true);

    const slider = settings.element.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(Number(slider.value)).toBeCloseTo(0.003);

    slider.value = '0.006';
    slider.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith(0.006);

    const button = settings.element.querySelector('.settings-binding-button') as HTMLButtonElement;
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
    expect(button.textContent).toContain('I');
    expect(onBindingsChange).toHaveBeenCalled();

    const toggleRows = Array.from(settings.element.querySelectorAll('.settings-toggle'));
    const invertXRow = toggleRows.find((row) => row.textContent?.includes('Invert mouse X')) as HTMLElement;
    const invertYRow = toggleRows.find((row) => row.textContent?.includes('Invert mouse Y')) as HTMLElement;
    const metricsRow = toggleRows.find((row) => row.textContent?.includes('Show net stats')) as HTMLElement;
    const invertXToggle = invertXRow.querySelector('input') as HTMLInputElement;
    const invertYToggle = invertYRow.querySelector('input') as HTMLInputElement;
    const metricsToggle = metricsRow.querySelector('input') as HTMLInputElement;

    expect(invertXToggle.checked).toBe(true);
    expect(invertYToggle.checked).toBe(false);
    invertXToggle.click();
    expect(onInvertLookXChange).toHaveBeenCalledWith(false);
    invertYToggle.click();
    expect(onInvertLookYChange).toHaveBeenCalledWith(true);

    expect(metricsToggle.checked).toBe(false);
    metricsToggle.click();
    expect(onShowMetricsChange).toHaveBeenCalledWith(true);
    settings.setMetricsVisible(false);
    expect(metricsToggle.checked).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));

    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(button.textContent).toContain('I');

    settings.toggle();
    expect(settings.isVisible()).toBe(false);

    settings.dispose();
    expect(document.querySelector('.settings-overlay')).toBeNull();
  });

  it('clamps invalid sensitivity values', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const settings = createSettingsOverlay(document, { initialSensitivity: 0.5 });

    const slider = settings.element.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.value)).toBeLessThanOrEqual(0.01);

    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    expect(Number(slider.value)).toBeGreaterThan(0);

    settings.dispose();
  });

  it('defaults sensitivity when none provided', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const settings = createSettingsOverlay(document);

    const slider = settings.element.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(0.002);

    settings.dispose();
  });
});
