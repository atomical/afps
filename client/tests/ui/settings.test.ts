import { describe, expect, it, vi } from 'vitest';
import { createSettingsOverlay } from '../../src/ui/settings';

describe('settings overlay', () => {
  it('renders audio and keyboard tabs', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const onAudioSettingsChange = vi.fn();
    const settings = createSettingsOverlay(document, {
      initialAudioSettings: {
        master: 0.6,
        sfx: 0.5,
        ui: 0.4,
        music: 0.3,
        muted: false
      },
      onAudioSettingsChange
    });

    expect(settings.isVisible()).toBe(false);
    settings.setVisible(true);
    expect(settings.isVisible()).toBe(true);

    const tabs = Array.from(settings.element.querySelectorAll('.settings-tab')) as HTMLButtonElement[];
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.textContent).toContain('Audio');
    expect(tabs[1]?.textContent).toContain('Keyboard');

    const audioSection = settings.element.querySelector(".settings-section[data-tab='audio']") as HTMLElement;
    const keyboardSection = settings.element.querySelector(".settings-section[data-tab='keyboard']") as HTMLElement;
    expect(audioSection.hidden).toBe(false);
    expect(keyboardSection.hidden).toBe(true);

    tabs[1]?.click();
    expect(audioSection.hidden).toBe(true);
    expect(keyboardSection.hidden).toBe(false);
    expect(keyboardSection.textContent).toContain('Move Forward');
    expect(keyboardSection.textContent).toContain('Hold P');
    expect(keyboardSection.textContent).toContain('N');

    tabs[0]?.click();
    expect(audioSection.hidden).toBe(false);

    const audioControls = Array.from(settings.element.querySelectorAll('.settings-audio-control'));
    const masterControl = audioControls.find((control) => control.textContent?.includes('Master')) as HTMLElement;
    const masterSlider = masterControl.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(masterSlider.value)).toBeCloseTo(0.6);
    masterSlider.value = '0.4';
    masterSlider.dispatchEvent(new Event('input'));
    expect(onAudioSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ master: 0.4 })
    );

    const muteRow = Array.from(settings.element.querySelectorAll('.settings-toggle')).find((row) =>
      row.textContent?.includes('Mute all')
    ) as HTMLElement;
    const muteToggle = muteRow.querySelector('input') as HTMLInputElement;
    muteToggle.click();
    expect(onAudioSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ muted: true })
    );

    settings.toggle();
    expect(settings.isVisible()).toBe(false);

    settings.dispose();
    expect(document.querySelector('.settings-overlay')).toBeNull();
  });
});
