/* ==========================================================
   game.js — Core 2048 game engine
   ========================================================== */

const GRID         = 4;
const SPECIAL_PROB = 0.18;   // 18% chance of special tile on spawn

class Game {
  constructor() {
    this.grid          = [];
    this.score         = 0;
    this.best          = parseInt(localStorage.getItem('2048-best') || '0');
    this.moves         = 0;
    this.movesLeft     = 10;   // moves until next random event
    this.idCounter     = 0;
    this.x2Active      = false; // set by Power Surge event
    this.gameOver      = false;
    this.won           = false;
    this.keepGoingMode = false;

    // DOM refs
    this.el = {
      score:   document.getElementById('score'),
      best:    document.getElementById('best'),
      moves:   document.getElementById('moves'),
      eventCt: document.getElementById('event-ct'),
      tiles:   document.getElementById('tiles'),
      board:   document.getElementById('board'),
      pill:    document.getElementById('event-pill'),
      ovEvent: document.getElementById('ov-event'),
      ovOver:  document.getElementById('ov-over'),
      ovWin:   document.getElementById('ov-win'),
    };

    document.getElementById('btn-new').addEventListener('click', () => this.restart());
    this._setupControls();
    this._init();
  }

  /* -------- Init / Restart -------- */

  _init() {
    this.grid          = Array.from({ length: GRID }, () => new Array(GRID).fill(null));
    this.score         = 0;
    this.moves         = 0;
    this.movesLeft     = 10;
    this.x2Active      = false;
    this.gameOver      = false;
    this.won           = false;

    this._hideOverlays();
    this._spawn();
    this._spawn();
    this.render();
    this.updateUI();
  }

  restart() {
    this.keepGoingMode = false;
    this._init();
  }

  continueGame() {
    this.keepGoingMode = true;
    this.el.ovWin.classList.add('hidden');
  }

  /* -------- Tile factory -------- */

  createTile(value, type = 'normal', frozen = 0) {
    return {
      id:         ++this.idCounter,
      value,
      type,        // 'normal' | 'bomb' | 'x2' | 'ice'
      frozen,      // ice countdown (moves until thaw)
      isNew:      true,
      merged:     false,
      mergeScore: 0,
      wasX2:      false,
    };
  }

  /* -------- Spawning -------- */

  _spawn() {
    const empties = [];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (!this.grid[r][c]) empties.push([r, c]);
    if (!empties.length) return false;

    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    const value  = Math.random() < 0.9 ? 2 : 4;

    let tile;
    if (Math.random() < SPECIAL_PROB) {
      const roll = Math.random();
      if      (roll < 0.50) tile = this.createTile(value, 'ice',  3);
      else if (roll < 0.80) tile = this.createTile(value, 'x2');
      else                  tile = this.createTile(value, 'bomb');
    } else {
      tile = this.createTile(value);
    }

    this.grid[r][c] = tile;
    return true;
  }

  /* -------- Move logic -------- */

  move(dir) {
    if (this.gameOver) return;

    // Reset per-move animation flags
    this.eachTile(t => { t.isNew = false; t.merged = false; t.mergeScore = 0; t.wasX2 = false; });

    const isHoriz   = dir === 'left' || dir === 'right';
    const isReverse = dir === 'right' || dir === 'down';
    let   anyMoved  = false;
    const bombQueue = []; // { mergedTileId }

    for (let li = 0; li < GRID; li++) {
      const line = isHoriz
        ? [...this.grid[li]]
        : Array.from({ length: GRID }, (_, i) => this.grid[i][li]);

      const { cells, moved, bombs } = this._slideLine(line, isReverse);
      if (moved) anyMoved = true;

      for (let i = 0; i < GRID; i++) {
        if (isHoriz) this.grid[li][i] = cells[i];
        else         this.grid[i][li] = cells[i];
      }

      bombs.forEach(b => bombQueue.push(b));
    }

    if (!anyMoved) return;

    this.moves++;
    this.movesLeft--;

    // Tally score from normal / x2 merges (bombs handled in explode)
    let moveScore = 0;
    this.eachTile(t => { if (t.merged) moveScore += t.mergeScore; });
    this.addScore(moveScore);

    // Decrement ice tiles
    this.eachTile((t) => {
      if (t.type === 'ice' && t.frozen > 0) {
        t.frozen--;
        if (t.frozen === 0) t.type = 'normal';
      }
    });

    // Render movement + merge animations FIRST (so bomb tile element exists in DOM)
    this.render();

    // Then explode bombs
    bombQueue.forEach(b => this._findAndExplode(b.mergedId));

    // Spawn new tile
    this._spawn();
    this.render(); // second render to show spawned tile

    this.updateUI();

    // Random event
    if (this.movesLeft <= 0) {
      this.movesLeft = 10;
      setTimeout(() => specialTiles.triggerEvent(this), 160);
    }

    // Check win / game-over after animations settle
    setTimeout(() => {
      if (!this.won && !this.keepGoingMode && this._checkWin()) {
        this.won = true;
        this._showWin();
      } else if (this._checkGameOver()) {
        this.gameOver = true;
        this._showGameOver();
      }
    }, 350);
  }

  /* -------- Slide one line -------- */

  _slideLine(cells, reverse) {
    const n       = cells.length;
    const newCells = new Array(n).fill(null);
    const bombs   = [];

    // Ice tiles (frozen > 0) act as immovable walls
    const iceWalls = new Set(
      cells.map((c, i) => (c && c.type === 'ice' && c.frozen > 0 ? i : -1)).filter(i => i >= 0)
    );
    iceWalls.forEach(i => { newCells[i] = cells[i]; });

    // Build moveable segments between walls
    const segments = [];
    let start = 0;
    for (let i = 0; i <= n; i++) {
      if (i === n || iceWalls.has(i)) {
        if (start < i) segments.push([start, i - 1]);
        start = i + 1;
      }
    }

    for (const [segStart, segEnd] of segments) {
      // Extract non-null tiles from segment
      let tiles = [];
      for (let i = segStart; i <= segEnd; i++)
        if (cells[i]) tiles.push(cells[i]);

      if (!tiles.length) continue;

      if (reverse) tiles.reverse();

      // Merge pass
      const out = [];
      let i = 0;
      while (i < tiles.length) {
        const t1 = tiles[i];
        const t2 = tiles[i + 1];

        if (t2 && t1.value === t2.value) {
          if (specialTiles.isBombMerge(t1, t2)) {
            // ---- Bomb merge ----
            const merged = this.createTile(t1.value * 2);
            merged.isNew     = false;
            merged.merged    = true;
            merged.mergeScore = 0; // score comes from explosion
            out.push(merged);
            bombs.push({ mergedId: merged.id });
            i += 2;
          } else {
            // ---- Normal / x2 merge ----
            const isX2  = specialTiles.isX2Merge(t1, t2) || this.x2Active;
            if (isX2) this.x2Active = false;

            const newVal = t1.value * 2;
            const score  = isX2 ? newVal * 2 : newVal;

            const merged = this.createTile(newVal);
            merged.isNew      = false;
            merged.merged     = true;
            merged.mergeScore = score;
            merged.wasX2      = isX2;
            out.push(merged);
            i += 2;
          }
        } else {
          out.push(t1);
          i++;
        }
      }

      if (reverse) out.reverse();

      // Place back into segment
      const segLen = segEnd - segStart + 1;
      const placed = new Array(segLen).fill(null);
      if (reverse) {
        let pos = segLen - 1;
        for (let j = out.length - 1; j >= 0; j--) placed[pos--] = out[j];
      } else {
        for (let j = 0; j < out.length; j++) placed[j] = out[j];
      }
      for (let j = 0; j < segLen; j++) newCells[segStart + j] = placed[j];
    }

    // Detect actual movement
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = cells[i], b = newCells[i];
      if (a !== b && (a === null || b === null || a.id !== b.id)) { moved = true; break; }
    }

    return { cells: newCells, moved, bombs };
  }

  /* -------- Explosion -------- */

  _findAndExplode(tileId) {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (this.grid[r][c] && this.grid[r][c].id === tileId) {
          this.explode(r, c, 1);
          return;
        }
  }

  explode(cr, cc, radius = 1) {
    let bonus = 0;
    const tilesEl = this.el.tiles;

    for (let r = cr - radius; r <= cr + radius; r++) {
      for (let c = cc - radius; c <= cc + radius; c++) {
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
        if (!this.grid[r][c]) continue;
        const t  = this.grid[r][c];
        bonus   += t.value;
        const el = tilesEl.querySelector(`[data-id="${t.id}"]`);
        if (el && !el.classList.contains('exploding')) {
          el.classList.add('exploding');
          el.addEventListener('animationend', () => el.remove(), { once: true });
        }
        this.grid[r][c] = null;
      }
    }

    this.addScore(bonus * 2);

    // Board flash
    this.el.board.classList.remove('explode-flash');
    void this.el.board.offsetWidth;
    this.el.board.classList.add('explode-flash');
    this.el.board.addEventListener('animationend', () =>
      this.el.board.classList.remove('explode-flash'), { once: true });

    // Canvas particles
    const rect     = this.el.board.getBoundingClientRect();
    const ts       = _cssVar('--tile');
    const gap      = _cssVar('--gap');
    const pad      = _cssVar('--pad');
    const px = rect.left + pad + cc * (ts + gap) + ts / 2;
    const py = rect.top  + pad + cr * (ts + gap) + ts / 2;
    effects.explosion(px, py);
  }

  /* -------- Render -------- */

  render() {
    const tilesEl = this.el.tiles;
    const liveIds = new Set();
    this.eachTile(t => liveIds.add(t.id));

    // Remove stale tile elements (keep exploding ones — they self-remove)
    tilesEl.querySelectorAll('.tile:not(.exploding)').forEach(el => {
      if (!liveIds.has(+el.dataset.id)) el.remove();
    });

    // Update / create tiles
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const tile = this.grid[r][c];
        if (!tile) continue;

        let el = tilesEl.querySelector(`[data-id="${tile.id}"]`);
        if (!el) {
          el = document.createElement('div');
          el.dataset.id = tile.id;
          tilesEl.appendChild(el);
        }

        // Position (CSS transition animates movement)
        el.style.setProperty('--r', r);
        el.style.setProperty('--c', c);

        // Classes & value attribute
        el.className   = `tile${tile.type !== 'normal' ? ' tile-' + tile.type : ''}`;
        el.dataset.val = tile.value;

        // Inner content
        el.innerHTML = _tileHTML(tile);

        // Spawn animation
        if (tile.isNew) {
          tile.isNew = false;
          el.classList.add('is-new');
          el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
        }

        // Merge animation + effects (only once)
        if (tile.merged) {
          const mScore = tile.mergeScore;
          const wasX2  = tile.wasX2;
          tile.merged     = false;
          tile.mergeScore = 0;
          tile.wasX2      = false;

          requestAnimationFrame(() => {
            el.classList.add('merged');
            el.addEventListener('animationend', () => el.classList.remove('merged'), { once: true });
          });

          if (mScore > 0) {
            this._scorePopup(r, c, mScore, wasX2);
          }
          if (wasX2) {
            this.el.board.classList.remove('x2-flash');
            void this.el.board.offsetWidth;
            this.el.board.classList.add('x2-flash');
            this.el.board.addEventListener('animationend', () =>
              this.el.board.classList.remove('x2-flash'), { once: true });
          }
        }
      }
    }
  }

  /* -------- Score popup -------- */

  _scorePopup(row, col, score, isX2) {
    const rect = this.el.board.getBoundingClientRect();
    const ts   = _cssVar('--tile');
    const gap  = _cssVar('--gap');
    const pad  = _cssVar('--pad');

    const x = rect.left + pad + col * (ts + gap) + ts / 2;
    const y = rect.top  + pad + row * (ts + gap) + ts / 2;

    const el = document.createElement('div');
    el.className = 'score-popup';
    el.textContent = `+${score}${isX2 ? ' ×2!' : ''}`;
    el.style.cssText = `left:${x - 22}px;top:${y - 16}px;color:${isX2 ? '#ffd700' : '#00ffd2'};`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });

    effects.mergeSparkle(x, y, isX2 ? '#ffd700' : '#00ffd2');
  }

  /* -------- UI -------- */

  updateUI() {
    const prev = parseInt(this.el.score.textContent) || 0;
    this.el.score.textContent   = this.score;
    this.el.best.textContent    = this.best;
    this.el.moves.textContent   = this.moves;
    this.el.eventCt.textContent = this.movesLeft > 0 ? this.movesLeft : '!';

    // Event pill urgency
    if (this.movesLeft <= 2) {
      this.el.pill.classList.add('urgent');
    } else {
      this.el.pill.classList.remove('urgent');
    }

    // Score bump
    if (this.score !== prev) {
      this.el.score.classList.remove('bump');
      void this.el.score.offsetWidth;
      this.el.score.classList.add('bump');
    }
  }

  addScore(pts) {
    if (!pts) return;
    this.score += pts;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('2048-best', this.best);
    }
  }

  _hideOverlays() {
    this.el.ovEvent.classList.add('hidden');
    this.el.ovOver.classList.add('hidden');
    this.el.ovWin.classList.add('hidden');
  }

  _showWin() {
    document.getElementById('win-score').textContent = this.score;
    this.el.ovWin.classList.remove('hidden');
    effects.fireworks();
  }

  _showGameOver() {
    document.getElementById('over-score').textContent = this.score;
    this.el.ovOver.classList.remove('hidden');
  }

  /* -------- Win / game-over checks -------- */

  _checkWin() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (this.grid[r][c] && this.grid[r][c].value >= 2048) return true;
    return false;
  }

  _checkGameOver() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (!this.grid[r][c]) return false;

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const v = this.grid[r][c].value;
        if (c + 1 < GRID && this.grid[r][c+1] && this.grid[r][c+1].value === v) return false;
        if (r + 1 < GRID && this.grid[r+1][c] && this.grid[r+1][c].value === v) return false;
      }
    }
    return true;
  }

  /* -------- Helpers -------- */

  eachTile(fn) {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (this.grid[r][c]) fn(this.grid[r][c], r, c);
  }

  /* -------- Controls -------- */

  _setupControls() {
    const map = {
      ArrowLeft: 'left',  ArrowRight: 'right',
      ArrowUp:   'up',    ArrowDown:  'down',
      a: 'left',  d: 'right',  w: 'up',  s: 'down',
      A: 'left',  D: 'right',  W: 'up',  S: 'down',
    };

    document.addEventListener('keydown', e => {
      if (map[e.key]) { e.preventDefault(); this.move(map[e.key]); }
    });

    // Touch / swipe
    let tx, ty;
    const board = document.getElementById('board');
    board.addEventListener('touchstart', e => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      e.preventDefault();
    }, { passive: false });

    board.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 'right' : 'left');
      else                              this.move(dy > 0 ? 'down'  : 'up');
      e.preventDefault();
    }, { passive: false });
  }
}

/* -------- Private utility functions -------- */

function _tileHTML(tile) {
  if (tile.type === 'bomb') {
    return `<span class="t-icon">💣</span><span class="t-sub">${tile.value}</span>`;
  }
  if (tile.type === 'x2') {
    return `<span class="t-icon">×2</span><span class="t-sub">${tile.value}</span>`;
  }
  if (tile.type === 'ice') {
    const ct = tile.frozen > 0 ? `<span class="ice-ct">${tile.frozen}</span>` : '';
    return `<span class="t-icon">❄</span><span class="value">${tile.value}</span>${ct}`;
  }
  return `<span class="value">${tile.value}</span>`;
}

function _cssVar(name) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

/* -------- Bootstrap -------- */

window.addEventListener('DOMContentLoaded', () => {
  effects.init();
  window.game = new Game();
});
