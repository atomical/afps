const STORAGE_KEY = 'afps.ui.showMetrics';

export const loadMetricsVisibility = (storage?: Storage): boolean => {
  if (!storage) {
    return true;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return true;
  }
  return raw === 'true';
};

export const saveMetricsVisibility = (visible: boolean, storage?: Storage) => {
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEY, visible ? 'true' : 'false');
};
