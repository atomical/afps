import { describe, expect, it, vi } from 'vitest';
import { createSettingsOverlay } from '../../src/ui/settings';
import { LOADOUT_BITS } from '../../src/weapons/loadout';

describe('settings overlay', () => {
  it('creates overlay and updates sensitivity', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const onChange = vi.fn();
    const onBindingsChange = vi.fn();
    const onShowMetricsChange = vi.fn();
    const onInvertLookXChange = vi.fn();
    const onInvertLookYChange = vi.fn();
    const onFxSettingsChange = vi.fn();
    const onAudioSettingsChange = vi.fn();
    const onLoadoutBitsChange = vi.fn();
    const settings = createSettingsOverlay(document, {
      initialSensitivity: 0.003,
      onSensitivityChange: onChange,
      onBindingsChange,
      initialInvertLookX: true,
      initialInvertLookY: false,
      onInvertLookXChange,
      onInvertLookYChange,
      initialShowMetrics: false,
      onShowMetricsChange,
      initialFxSettings: {
        muzzleFlash: false,
        tracers: true,
        decals: false,
        aimDebug: true
      },
      onFxSettingsChange,
      initialAudioSettings: {
        master: 0.6,
        sfx: 0.5,
        ui: 0.4,
        music: 0.3,
        muted: false
      },
      onAudioSettingsChange,
      initialLoadoutBits: LOADOUT_BITS.suppressor | LOADOUT_BITS.optic,
      onLoadoutBitsChange
    });

    expect(settings.isVisible()).toBe(false);
    settings.setVisible(true);
    expect(settings.isVisible()).toBe(true);

    const sensitivityLabel = Array.from(settings.element.querySelectorAll('.settings-label')).find((row) =>
      row.textContent?.includes('Look Sensitivity')
    ) as HTMLElement;
    const slider = sensitivityLabel.parentElement?.querySelector('input[type="range"]') as HTMLInputElement;
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
    const muzzleFlashRow = toggleRows.find((row) => row.textContent?.includes('Muzzle flash')) as HTMLElement;
    const tracersRow = toggleRows.find((row) => row.textContent?.includes('Tracers')) as HTMLElement;
    const decalsRow = toggleRows.find((row) => row.textContent?.includes('Decals')) as HTMLElement;
    const aimDebugRow = toggleRows.find((row) => row.textContent?.includes('Aim debug')) as HTMLElement;
    const suppressorRow = toggleRows.find((row) => row.textContent?.includes('Suppressor')) as HTMLElement;
    const compensatorRow = toggleRows.find((row) => row.textContent?.includes('Compensator')) as HTMLElement;
    const opticRow = toggleRows.find((row) => row.textContent?.includes('Optic')) as HTMLElement;
    const extendedMagRow = toggleRows.find((row) => row.textContent?.includes('Extended mag')) as HTMLElement;
    const gripRow = toggleRows.find((row) => row.textContent?.includes('Grip')) as HTMLElement;
    const invertXToggle = invertXRow.querySelector('input') as HTMLInputElement;
    const invertYToggle = invertYRow.querySelector('input') as HTMLInputElement;
    const metricsToggle = metricsRow.querySelector('input') as HTMLInputElement;
    const muzzleFlashToggle = muzzleFlashRow.querySelector('input') as HTMLInputElement;
    const tracersToggle = tracersRow.querySelector('input') as HTMLInputElement;
    const decalsToggle = decalsRow.querySelector('input') as HTMLInputElement;
    const aimDebugToggle = aimDebugRow.querySelector('input') as HTMLInputElement;
    const suppressorToggle = suppressorRow.querySelector('input') as HTMLInputElement;
    const compensatorToggle = compensatorRow.querySelector('input') as HTMLInputElement;
    const opticToggle = opticRow.querySelector('input') as HTMLInputElement;
    const extendedMagToggle = extendedMagRow.querySelector('input') as HTMLInputElement;
    const gripToggle = gripRow.querySelector('input') as HTMLInputElement;

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

    expect(muzzleFlashToggle.checked).toBe(false);
    expect(tracersToggle.checked).toBe(true);
    expect(decalsToggle.checked).toBe(false);
    expect(aimDebugToggle.checked).toBe(true);
    muzzleFlashToggle.click();
    expect(onFxSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ muzzleFlash: true })
    );

    expect(suppressorToggle.checked).toBe(true);
    expect(compensatorToggle.checked).toBe(false);
    expect(opticToggle.checked).toBe(true);
    expect(extendedMagToggle.checked).toBe(false);
    expect(gripToggle.checked).toBe(false);
    onLoadoutBitsChange.mockClear();
    compensatorToggle.click();
    expect(onLoadoutBitsChange).toHaveBeenCalledWith(
      LOADOUT_BITS.suppressor | LOADOUT_BITS.optic | LOADOUT_BITS.compensator
    );
    onLoadoutBitsChange.mockClear();
    suppressorToggle.click();
    expect(onLoadoutBitsChange).toHaveBeenCalledWith(LOADOUT_BITS.optic | LOADOUT_BITS.compensator);

    const audioControls = Array.from(settings.element.querySelectorAll('.settings-audio-control'));
    const masterControl = audioControls.find((control) => control.textContent?.includes('Master')) as HTMLElement;
    const masterSlider = masterControl.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(masterSlider.value)).toBeCloseTo(0.6);
    masterSlider.value = '0.4';
    masterSlider.dispatchEvent(new Event('input'));
    expect(onAudioSettingsChange).toHaveBeenCalled();

    const muteRow = toggleRows.find((row) => row.textContent?.includes('Mute all')) as HTMLElement;
    const muteToggle = muteRow.querySelector('input') as HTMLInputElement;
    muteToggle.click();
    expect(onAudioSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ muted: true })
    );

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

    const sensitivityLabel = Array.from(settings.element.querySelectorAll('.settings-label')).find((row) =>
      row.textContent?.includes('Look Sensitivity')
    ) as HTMLElement;
    const slider = sensitivityLabel.parentElement?.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.value)).toBeLessThanOrEqual(0.01);

    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    expect(Number(slider.value)).toBeGreaterThan(0);

    settings.dispose();
  });

  it('defaults sensitivity when none provided', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const settings = createSettingsOverlay(document);

    const sensitivityLabel = Array.from(settings.element.querySelectorAll('.settings-label')).find((row) =>
      row.textContent?.includes('Look Sensitivity')
    ) as HTMLElement;
    const slider = sensitivityLabel.parentElement?.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(0.002);

    settings.dispose();
  });
});
