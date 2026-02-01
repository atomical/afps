import { describe, expect, it } from 'vitest';
import { loadMetricsVisibility, saveMetricsVisibility } from '../../src/ui/metrics_settings';

describe('metrics settings', () => {
  it('defaults to visible when storage is missing', () => {
    expect(loadMetricsVisibility(undefined)).toBe(true);
    expect(() => saveMetricsVisibility(true, undefined)).not.toThrow();
  });

  it('loads and saves metrics visibility', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      }
    } as Storage;

    expect(loadMetricsVisibility(storage)).toBe(true);
    saveMetricsVisibility(false, storage);
    expect(loadMetricsVisibility(storage)).toBe(false);
    saveMetricsVisibility(true, storage);
    expect(loadMetricsVisibility(storage)).toBe(true);
  });
});
