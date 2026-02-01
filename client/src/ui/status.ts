export type ConnectionState = 'idle' | 'disabled' | 'connecting' | 'connected' | 'error';

export interface StatusOverlay {
  element: HTMLDivElement;
  setState: (state: ConnectionState, detail?: string) => void;
  setDetail: (detail?: string) => void;
  setMetrics: (metrics?: string) => void;
  setMetricsVisible: (visible: boolean) => void;
  dispose: () => void;
}

const stateLabel = (state: ConnectionState) => {
  switch (state) {
    case 'disabled':
      return 'Disabled';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'error':
      return 'Error';
    case 'idle':
    default:
      return 'Idle';
  }
};

export const createStatusOverlay = (doc: Document, containerId = 'app'): StatusOverlay => {
  const host = doc.getElementById(containerId) ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'status-overlay';

  const title = doc.createElement('div');
  title.className = 'status-title';

  const detail = doc.createElement('div');
  detail.className = 'status-detail';

  const metrics = doc.createElement('div');
  metrics.className = 'status-metrics';

  overlay.append(title, detail, metrics);
  host.appendChild(overlay);

  const setDetail = (text?: string) => {
    detail.textContent = text ?? '';
  };

  const setState = (state: ConnectionState, text?: string) => {
    overlay.dataset.state = state;
    title.textContent = `Status: ${stateLabel(state)}`;
    setDetail(text);
  };

  const setMetrics = (text?: string) => {
    metrics.textContent = text ?? '';
  };

  const setMetricsVisible = (visible: boolean) => {
    overlay.dataset.metrics = visible ? 'visible' : 'hidden';
  };

  const dispose = () => {
    overlay.remove();
  };

  setState('idle');
  setMetricsVisible(true);

  return { element: overlay, setState, setDetail, setMetrics, setMetricsVisible, dispose };
};
