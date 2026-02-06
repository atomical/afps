import { describe, expect, it } from 'vitest';
import { createScoreboardOverlay } from '../../src/ui/scoreboard';

describe('scoreboard overlay', () => {
  it('renders rows sorted by kills descending', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const scoreboard = createScoreboardOverlay(document);

    scoreboard.setRows([
      { id: 'b', name: 'Bravo', kills: 2 },
      { id: 'c', name: 'Charlie', kills: 5 },
      { id: 'a', name: 'Alpha', kills: 5, isLocal: true }
    ]);

    const rows = Array.from(scoreboard.element.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Alpha');
    expect(rows[1]?.textContent).toContain('Charlie');
    expect(rows[2]?.textContent).toContain('Bravo');
    expect(rows[0]?.classList.contains('scoreboard-row-local')).toBe(true);

    scoreboard.dispose();
  });

  it('shows empty state and visibility toggles', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const scoreboard = createScoreboardOverlay(document);

    expect(scoreboard.isVisible()).toBe(false);
    scoreboard.setVisible(true);
    expect(scoreboard.isVisible()).toBe(true);

    scoreboard.setRows([]);
    expect(scoreboard.element.textContent).toContain('Waiting for players');

    scoreboard.dispose();
    expect(document.querySelector('.scoreboard-overlay')).toBeNull();
  });
});
