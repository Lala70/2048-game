/* ==========================================================
   special-tiles.js — Special tile logic & random events
   ========================================================== */

const specialTiles = (() => {

  /* ---- Random event definitions ---- */
  const EVENTS = [
    {
      id:    'shuffle',
      icon:  '🔀',
      title: 'CHAOS SHUFFLE',
      color: '#ff44aa',
      fn(game) {
        // Collect all tiles and their count
        const tiles = [];
        game.eachTile(t => tiles.push(t));
        // Fisher-Yates shuffle of positions
        const positions = [];
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++)
            if (game.grid[r][c]) positions.push([r, c]);
        for (let i = positions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        // Clear & re-place
        for (let r = 0; r < 4; r++) game.grid[r].fill(null);
        tiles.forEach((t, i) => {
          const [r, c] = positions[i];
          t.isNew = true;
          game.grid[r][c] = t;
        });
        return 'All tiles scrambled!';
      },
    },
    {
      id:    'bonus',
      icon:  '💰',
      title: 'SCORE BONUS',
      color: '#ffd700',
      fn(game) {
        const pts = Math.floor(Math.random() * 600 + 200);
        game.addScore(pts);
        game.updateUI();
        return `+${pts} bonus points!`;
      },
    },
    {
      id:    'freeze',
      icon:  '❄️',
      title: 'DEEP FREEZE',
      color: '#88ddff',
      fn(game) {
        const normals = [];
        game.eachTile((t) => { if (t.type === 'normal') normals.push(t); });
        const count = Math.min(normals.length, 2 + Math.floor(Math.random() * 2));
        normals.sort(() => Math.random() - 0.5).slice(0, count).forEach(t => {
          t.type   = 'ice';
          t.frozen = 3;
          t.isNew  = false;
        });
        return `${count} tile${count > 1 ? 's' : ''} frozen for 3 turns!`;
      },
    },
    {
      id:    'detonate',
      icon:  '💥',
      title: 'RANDOM DETONATION',
      color: '#ff4400',
      fn(game) {
        const normals = [];
        game.eachTile((t, r, c) => { if (t.type === 'normal') normals.push({t, r, c}); });
        if (!normals.length) return 'Nothing to detonate…';
        const { r, c } = normals[Math.floor(Math.random() * normals.length)];
        game.explode(r, c, 1);
        return 'A random tile just exploded!';
      },
    },
    {
      id:    'gift',
      icon:  '🎁',
      title: 'GIFT TILE',
      color: '#00ffcc',
      fn(game) {
        const empties = [];
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++)
            if (!game.grid[r][c]) empties.push([r, c]);
        if (!empties.length) return 'Board is full — no gift today!';
        const [r, c] = empties[Math.floor(Math.random() * empties.length)];
        let maxVal = 2;
        game.eachTile(t => { if (t.value > maxVal) maxVal = t.value; });
        const giftVal = Math.max(8, Math.min(128, Math.floor(maxVal / 2)));
        const t = game.createTile(giftVal);
        game.grid[r][c] = t;
        return `A ${giftVal}-tile appeared!`;
      },
    },
    {
      id:    'surge',
      icon:  '⚡',
      title: 'POWER SURGE',
      color: '#00ffff',
      fn(game) {
        game.x2Active = true;
        const pill = document.getElementById('event-pill');
        if (pill) {
          pill.style.background    = 'rgba(0,255,255,0.12)';
          pill.style.borderColor   = 'rgba(0,255,255,0.55)';
          setTimeout(() => {
            pill.style.background  = '';
            pill.style.borderColor = '';
          }, 8000);
        }
        return 'Your next merge scores double!';
      },
    },
    {
      id:    'nuke',
      icon:  '☢️',
      title: 'NUKE SWEEP',
      color: '#aaff00',
      fn(game) {
        // Remove all tiles with value ≤ 4
        let removed = 0;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            if (game.grid[r][c] && game.grid[r][c].value <= 4) {
              const el = document.querySelector(`[data-id="${game.grid[r][c].id}"]`);
              if (el) el.classList.add('exploding');
              game.grid[r][c] = null;
              removed++;
            }
          }
        }
        // cleanup exploding els
        setTimeout(() => {
          document.querySelectorAll('.tile.exploding').forEach(el => {
            el.addEventListener('animationend', () => el.remove(), { once: true });
          });
        }, 50);
        return removed ? `Cleared ${removed} small tile${removed > 1 ? 's' : ''}!` : 'No small tiles to sweep.';
      },
    },
  ];

  /* ---- Trigger a random event ---- */
  function triggerEvent(game) {
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const desc = ev.fn(game) || 'Something happened!';

    // Show overlay
    document.getElementById('ev-icon').textContent  = ev.icon;
    document.getElementById('ev-title').textContent = ev.title;
    document.getElementById('ev-title').style.color = ev.color;
    document.getElementById('ev-desc').textContent  = desc;

    const overlay = document.getElementById('ov-event');
    overlay.classList.remove('hidden');

    // Re-render after event effects
    game.render();
    game.updateUI();

    setTimeout(() => overlay.classList.add('hidden'), 2200);
  }

  /* ---- Bomb mechanic helpers (called from game.js) ---- */

  /**
   * Determine if two tiles should trigger a bomb explosion instead of merging.
   * Returns true if at least one is a bomb tile.
   */
  function isBombMerge(t1, t2) {
    return t1.type === 'bomb' || t2.type === 'bomb';
  }

  /**
   * Determine if a merge should award 2× score.
   */
  function isX2Merge(t1, t2) {
    return !isBombMerge(t1, t2) && (t1.type === 'x2' || t2.type === 'x2');
  }

  return { triggerEvent, isBombMerge, isX2Merge };
})();
