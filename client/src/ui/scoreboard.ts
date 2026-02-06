export interface ScoreboardRow {
  id: string;
  name: string;
  kills: number;
  isLocal?: boolean;
}

export interface ScoreboardOverlay {
  element: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  isVisible: () => boolean;
  setRows: (rows: ScoreboardRow[]) => void;
  dispose: () => void;
}

const normalizeKills = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const sortRows = (rows: ScoreboardRow[]) => {
  return [...rows].sort((a, b) => {
    const killsDelta = normalizeKills(b.kills) - normalizeKills(a.kills);
    if (killsDelta !== 0) {
      return killsDelta;
    }
    return a.name.localeCompare(b.name);
  });
};

export const createScoreboardOverlay = (doc: Document, containerId = 'app'): ScoreboardOverlay => {
  const host = doc.getElementById(containerId) ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'scoreboard-overlay';
  overlay.dataset.visible = 'false';

  const panel = doc.createElement('div');
  panel.className = 'scoreboard-panel';

  const title = doc.createElement('div');
  title.className = 'scoreboard-title';
  title.textContent = 'Scoreboard';

  const hint = doc.createElement('div');
  hint.className = 'scoreboard-hint';
  hint.textContent = 'Hold P';

  const table = doc.createElement('table');
  table.className = 'scoreboard-table';

  const head = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  const playerHead = doc.createElement('th');
  playerHead.textContent = 'Player';
  const killsHead = doc.createElement('th');
  killsHead.textContent = 'Kills';
  headRow.append(playerHead, killsHead);
  head.append(headRow);

  const body = doc.createElement('tbody');
  table.append(head, body);

  panel.append(title, hint, table);
  overlay.append(panel);
  host.appendChild(overlay);

  const setVisible = (visible: boolean) => {
    overlay.dataset.visible = visible ? 'true' : 'false';
  };

  const isVisible = () => overlay.dataset.visible === 'true';

  const setRows = (rows: ScoreboardRow[]) => {
    body.innerHTML = '';
    const sorted = sortRows(rows);
    if (sorted.length === 0) {
      const empty = doc.createElement('tr');
      empty.className = 'scoreboard-row-empty';
      const cell = doc.createElement('td');
      cell.colSpan = 2;
      cell.textContent = 'Waiting for players';
      empty.append(cell);
      body.append(empty);
      return;
    }

    for (const row of sorted) {
      const tr = doc.createElement('tr');
      tr.className = row.isLocal ? 'scoreboard-row scoreboard-row-local' : 'scoreboard-row';
      const playerCell = doc.createElement('td');
      playerCell.textContent = row.name;
      const killsCell = doc.createElement('td');
      killsCell.textContent = String(normalizeKills(row.kills));
      tr.append(playerCell, killsCell);
      body.append(tr);
    }
  };

  const dispose = () => {
    overlay.remove();
  };

  return {
    element: overlay,
    setVisible,
    isVisible,
    setRows,
    dispose
  };
};
