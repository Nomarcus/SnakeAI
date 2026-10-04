/* Perfect Snake AI – user interface: Watch, Race, Stats and TV mode. */
(function () {
  'use strict';

  const PS = window.PerfectSnake;

  const METHODS = {
    dynamic: {
      name: 'Dynamic Loop', color: '#3987e5', proof: true,
      about: 'Takes the shortest route to the apple whenever it can prove a full safety loop still exists afterwards, and reshapes that loop on the fly. The fastest.'
    },
    shortcuts: {
      name: 'Loop + Shortcuts', color: '#d95926', proof: true,
      about: 'Follows one fixed loop but skips ahead when the skip cannot pass the tail.'
    },
    hamilton: {
      name: 'Pure Hamilton Loop', color: '#199e70', proof: true,
      about: 'Follows the same loop through every cell forever. Slow, but the easiest proof there is.'
    },
    greedy: {
      name: 'Greedy (no proof)', color: '#c98500', proof: false,
      about: 'What most people would write: chase the apple and only check that the tail is still reachable. No proof, so it regularly traps itself.'
    }
  };
  const ORDER = ['dynamic', 'shortcuts', 'hamilton', 'greedy'];
  const SIZES = [4, 6, 8, 10, 12, 14, 16, 20, 24, 30, 40];
  const SPEEDS = [2, 5, 10, 20, 40, 80, 160, 400, 1000, Infinity];
  const KIND_INFO = {
    start: { text: 'Starting', color: '#8b93ab' },
    path: { text: 'Direct route', color: '#4ade80' },
    cycle: { text: 'Following the safety loop', color: '#9db7ff' },
    shortcut: { text: 'Shortcut along the loop', color: '#f093fb' },
    wander: { text: 'Wandering (no safe route)', color: '#fbbf24' },
    won: { text: 'Board filled', color: '#4ade80' },
    lost: { text: 'Game over', color: '#f87171' }
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const fmt1 = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const swatch = (key) => `<i class="swatch" style="background:${METHODS[key].color}"></i>`;
  const speedText = (i) => (SPEEDS[i] === Infinity ? 'Max' : `${fmt(SPEEDS[i])} moves/s`);

  function formatTime(ms) {
    const s = ms / 1000;
    if (s < 60) return `${fmt1(s)} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  /* ------------------------------ storage ------------------------------ */

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  const settings = Object.assign({
    tab: 'watch', wMethod: 'dynamic', wSize: 10, wSpeed: 4, wShowLoop: true, wShowRoute: true, wAuto: true,
    rSize: 10, rSpeed: 6, rAuto: true, sSize: 10, sCount: 100
  }, load('perfectSnake.settings.v1', {}));
  function saveSettings() { save('perfectSnake.settings.v1', settings); }

  /* ------------------------------ statistics --------------------------- */

  const Stats = {
    data: load('perfectSnake.stats.v1', null) || { sizes: {}, races: {} },
    dirty: false,
    listeners: [],
    entry(size, method) {
      const s = this.data.sizes[size] || (this.data.sizes[size] = {});
      return s[method] || (s[method] = { games: 0, wins: 0, losses: 0, moves: 0, apples: 0, best: null, worst: null });
    },
    peek(size, method) {
      const s = this.data.sizes[size];
      return (s && s[method]) || { games: 0, wins: 0, losses: 0, moves: 0, apples: 0, best: null, worst: null };
    },
    race(size) {
      return this.data.races[size] || (this.data.races[size] = { count: 0, firsts: {}, played: {}, won: {}, moves: {} });
    },
    record(size, method, game) {
      const e = this.entry(size, method);
      e.games++;
      if (game.won) {
        e.wins++;
        e.moves += game.moves;
        e.apples += game.apples;
        e.best = e.best === null ? game.moves : Math.min(e.best, game.moves);
        e.worst = e.worst === null ? game.moves : Math.max(e.worst, game.moves);
      } else {
        e.losses++;
      }
      this.changed();
    },
    recordRace(size, results, winners) {
      const r = this.race(size);
      r.count++;
      winners.forEach((m) => { r.firsts[m] = (r.firsts[m] || 0) + 1; });
      results.forEach(({ method, won, moves }) => {
        r.played[method] = (r.played[method] || 0) + 1;
        if (won) {
          r.won[method] = (r.won[method] || 0) + 1;
          r.moves[method] = (r.moves[method] || 0) + moves;
        }
      });
      this.changed();
    },
    totalGames(size) {
      const s = size == null ? Object.values(this.data.sizes) : [this.data.sizes[size] || {}];
      return s.reduce((sum, bySize) => sum + Object.values(bySize).reduce((a, e) => a + e.games, 0), 0);
    },
    reset() {
      this.data = { sizes: {}, races: {} };
      this.changed();
      this.flush();
    },
    changed() {
      this.dirty = true;
      this.listeners.forEach((fn) => fn());
    },
    flush() {
      if (!this.dirty) return;
      this.dirty = false;
      save('perfectSnake.stats.v1', this.data);
    }
  };
  setInterval(() => Stats.flush(), 2000);
  window.addEventListener('pagehide', () => Stats.flush());

  /* ------------------------------- tooltip ----------------------------- */

  const tip = $('tooltip');
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() { tip.hidden = true; }

  /* -------------------------------- charts ----------------------------- */

  function niceStep(max, ticks) {
    const raw = max / Math.max(1, ticks);
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  // Horizontal bars, one row per method, value at the bar tip.
  function barChart(el, rows, opts = {}) {
    const width = Math.max(260, el.clientWidth || 400);
    const labelW = width < 420 ? 112 : 150;
    const rowH = 38, thick = 18, top = 6;
    const valueRoom = 86;
    const plotW = Math.max(40, width - labelW - valueRoom);
    const max = opts.max ?? Math.max(1, ...rows.map((r) => r.value || 0));
    const height = top + rows.length * rowH;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.title || '')}">`;
    svg += `<line class="gridline" x1="${labelW}" y1="0" x2="${labelW}" y2="${height}"/>`;
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      svg += `<text class="rowlabel" x="${labelW - 10}" y="${cy + 4}" text-anchor="end">${esc(r.label)}</text>`;
      if (r.value == null) {
        svg += `<text class="empty" x="${labelW + 8}" y="${cy + 4}">${esc(r.empty || 'no games yet')}</text>`;
      } else {
        const w = Math.max(3, (r.value / max) * plotW);
        const x = labelW, by = cy - thick / 2, rad = Math.min(4, w / 2);
        svg += `<path d="M${x},${by} h${w - rad} a${rad},${rad} 0 0 1 ${rad},${rad} v${thick - 2 * rad} a${rad},${rad} 0 0 1 -${rad},${rad} h-${w - rad} z" fill="${r.color}"/>`;
        svg += `<text class="val" x="${x + w + 8}" y="${cy + 4}">${esc(r.display)}</text>`;
      }
      svg += `<rect x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent" data-i="${i}"/>`;
    });
    svg += '</svg>';
    el.innerHTML = svg;
    el.querySelectorAll('rect[data-i]').forEach((hit) => {
      const r = rows[Number(hit.dataset.i)];
      if (!r.tip) return;
      hit.addEventListener('mousemove', (e) => showTip(r.tip, e.clientX, e.clientY));
      hit.addEventListener('mouseleave', hideTip);
    });
  }

  // Columns for a single series (moves per apple).
  function columnChart(el, values, opts = {}) {
    const width = Math.max(260, el.clientWidth || 400);
    const height = opts.height || 150;
    const left = 36, right = 4, top = 8, bottom = 18;
    const plotW = width - left - right, plotH = height - top - bottom;
    if (!values.length) {
      el.innerHTML = `<svg viewBox="0 0 ${width} ${height}"><text class="empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">No apples eaten yet</text></svg>`;
      return;
    }
    const maxV = Math.max(...values.map((v) => v.v));
    const step = niceStep(maxV, 3);
    const yMax = Math.max(step, Math.ceil(maxV / step) * step);
    const slot = plotW / values.length;
    const gap = slot >= 6 ? 2 : slot >= 3 ? 1 : 0;
    const bw = Math.max(0.6, Math.min(24, slot - gap));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Moves per apple">`;
    for (let t = 0; t <= yMax; t += step) {
      const y = top + plotH - (t / yMax) * plotH;
      svg += `<line class="gridline" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/>`;
      svg += `<text x="${left - 6}" y="${y + 4}" text-anchor="end">${fmt(t)}</text>`;
    }
    svg += `<g fill="${opts.color}">`;
    values.forEach((v, i) => {
      const h = Math.max(1, (v.v / yMax) * plotH);
      const x = left + i * slot + (slot - bw) / 2;
      svg += `<rect x="${x.toFixed(2)}" y="${(top + plotH - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="${bw >= 6 ? 2 : 0}"/>`;
    });
    svg += '</g>';
    svg += `<text x="${left}" y="${height - 3}">apple 1</text><text x="${width - right}" y="${height - 3}" text-anchor="end">apple ${fmt(values.length)}</text>`;
    svg += `<rect class="hit" x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="transparent"/>`;
    svg += '</svg>';
    el.innerHTML = svg;
    const hit = el.querySelector('.hit');
    hit.addEventListener('mousemove', (e) => {
      const box = hit.getBoundingClientRect();
      const i = Math.min(values.length - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * values.length)));
      showTip(values[i].tip, e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', hideTip);
  }

  // Board-filled (%) against moves, one line per method.
  function lineChart(el, series, opts = {}) {
    const width = Math.max(260, el.clientWidth || 500);
    const height = opts.height || 230;
    const left = 40, right = 14, top = 10, bottom = 26;
    const plotW = width - left - right, plotH = height - top - bottom;
    const xMaxRaw = Math.max(10, ...series.map((s) => (s.points.length ? s.points[s.points.length - 1][0] : 0)));
    const xStep = niceStep(xMaxRaw, 4);
    const xMax = Math.ceil(xMaxRaw / xStep) * xStep;
    const X = (v) => left + (v / xMax) * plotW;
    const Y = (v) => top + plotH - (v / 100) * plotH;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Board filled against moves">`;
    for (let t = 0; t <= 100; t += 25) {
      svg += `<line class="gridline" x1="${left}" y1="${Y(t)}" x2="${width - right}" y2="${Y(t)}"/>`;
      svg += `<text x="${left - 6}" y="${Y(t) + 4}" text-anchor="end">${t}%</text>`;
    }
    for (let t = 0; t <= xMax; t += xStep) {
      svg += `<text x="${X(t)}" y="${height - 6}" text-anchor="middle">${fmt(t)}</text>`;
    }
    series.forEach((s) => {
      if (!s.points.length) return;
      const d = s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    series.forEach((s) => {
      if (!s.points.length) return;
      const [x, y] = s.points[s.points.length - 1];
      svg += `<circle cx="${X(x)}" cy="${Y(y)}" r="4.5" fill="${s.color}" stroke="#17172c" stroke-width="2"/>`;
    });
    svg += `<line class="cross" x1="0" y1="${top}" x2="0" y2="${top + plotH}" stroke="rgba(255,255,255,0.35)" stroke-width="1" visibility="hidden"/>`;
    svg += `<rect class="hit" x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="transparent"/>`;
    svg += `<text x="${width - right}" y="${top + 12}" text-anchor="end">moves →</text>`;
    svg += '</svg>';
    el.innerHTML = svg;
    const hit = el.querySelector('.hit');
    const cross = el.querySelector('.cross');
    hit.addEventListener('mousemove', (e) => {
      const box = hit.getBoundingClientRect();
      const mx = ((e.clientX - box.left) / box.width) * xMax;
      cross.setAttribute('x1', X(mx));
      cross.setAttribute('x2', X(mx));
      cross.setAttribute('visibility', 'visible');
      const rows = series.map((s) => {
        let v = 0;
        for (const [x, y] of s.points) { if (x <= mx) v = y; else break; }
        return `<div class="row">${swatch(s.key)}${esc(METHODS[s.key].name)}: <b>${fmt1(v)}%</b></div>`;
      });
      showTip(`<div>After <b>${fmt(Math.round(mx))}</b> moves</div>${rows.join('')}`, e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }

  /* ------------------------------ board drawing ------------------------ */

  function fitCanvas(canvas, cssSize) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(80, Math.round(cssSize * dpr));
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function drawBoard(canvas, game, opts) {
    const ctx = canvas.getContext('2d');
    const { W, H } = game;
    const size = canvas.width;
    const cell = size / Math.max(W, H);
    const cx = (c) => ((c % W) + 0.5) * cell;
    const cy = (c) => (Math.floor(c / W) + 0.5) * cell;
    const [r, g, b] = hexToRgb(opts.color);
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y++) {
      for (let x = y % 2; x < W; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    if (opts.showLoop && !game.won) {
      const next = game.safetyCycle();
      if (next) {
        ctx.strokeStyle = `rgba(${r},${g},${b},0.30)`;
        ctx.lineWidth = Math.max(1, cell * 0.06);
        ctx.beginPath();
        for (let c = 0; c < game.N; c++) {
          const n = next[c];
          if (n < 0) continue;
          ctx.moveTo(cx(c), cy(c));
          ctx.lineTo(cx(n), cy(n));
        }
        ctx.stroke();
      }
    }

    if (opts.showRoute && !game.won && !game.dead && game.food >= 0) {
      const route = game.upcomingRoute(game.N);
      if (route.length) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1.5, cell * 0.1);
        ctx.setLineDash([cell * 0.22, cell * 0.18]);
        ctx.beginPath();
        ctx.moveTo(cx(game.body[0]), cy(game.body[0]));
        for (const c of route) ctx.lineTo(cx(c), cy(c));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (game.food >= 0) {
      const rad = cell * 0.36;
      const fx = cx(game.food), fy = cy(game.food);
      const grad = ctx.createRadialGradient(fx - rad * 0.3, fy - rad * 0.3, rad * 0.1, fx, fy, rad);
      grad.addColorStop(0, '#fecaca');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body in a few alpha bands, brightest at the head.
    const body = game.body;
    const len = body.length;
    const bands = Math.min(8, len - 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = cell * 0.68;
    for (let band = bands - 1; band >= 0; band--) {
      const from = Math.floor((band * (len - 1)) / bands);
      const to = Math.floor(((band + 1) * (len - 1)) / bands);
      const alpha = 1 - (band / Math.max(1, bands)) * 0.55;
      ctx.strokeStyle = game.dead ? `rgba(248,113,113,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx(body[from]), cy(body[from]));
      for (let i = from + 1; i <= to; i++) ctx.lineTo(cx(body[i]), cy(body[i]));
      ctx.stroke();
    }
    const head = body[0];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx(head), cy(head), cell * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = game.dead ? '#f87171' : opts.color;
    ctx.beginPath();
    ctx.arc(cx(head), cy(head), cell * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --------------------------- shared selectors ------------------------ */

  document.querySelectorAll('.size-select').forEach((sel) => {
    SIZES.forEach((n) => {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = `${n} × ${n}`;
      sel.appendChild(o);
    });
  });
  ORDER.forEach((key) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = METHODS[key].name;
    $('wMethod').appendChild(o);
  });
  $('methodList').innerHTML = ORDER.map((k) => `<li><b style="color:var(--text)">${swatch(k)} ${esc(METHODS[k].name)}</b> – ${esc(METHODS[k].about)}</li>`).join('');

  const validSize = (n) => (SIZES.includes(Number(n)) ? Number(n) : 10);

  /* ================================ WATCH ============================== */

  const watch = {
    game: null, method: 'dynamic', running: true, acc: 0, elapsed: 0,
    apples: [], cur: null, events: [], milestones: new Set(),
    lastText: 0, lastChart: 0, finished: false, restartTimer: null, lastDetourApple: -1
  };

  function narration(game, method) {
    if (game.won) return `Board filled! All ${fmt(game.N)} cells are snake after ${fmt(game.steps)} moves.`;
    if (game.dead) {
      if (game.lossReason === 'looping') return 'Stuck going round in circles without reaching the apple. Game over.';
      return 'Trapped: every cell around the head is taken. Without a proof, the snake walked into a dead end.';
    }
    const d = game.decision || {};
    switch (method) {
      case 'dynamic':
        if (d.kind === 'path') {
          return d.committed
            ? `Following the proven route: ${fmt(d.routeLength)} moves left to the apple.`
            : `Found a ${fmt(d.routeLength)}-move route to the apple and proved it safe: a full loop still exists after eating.`;
        }
        if (d.kind === 'cycle') {
          return d.directLength
            ? `The direct route (${fmt(d.directLength)} moves) could trap the snake later, so it follows its safety loop instead: ${fmt(d.routeLength)} moves to the apple.`
            : `No direct route right now. Following the safety loop: ${fmt(d.routeLength)} moves to the apple.`;
        }
        break;
      case 'shortcuts':
        if (d.kind === 'shortcut') return `Shortcut! Skipped ${fmt(d.skipped)} cells of the loop without passing its own tail.`;
        return `Following the fixed loop: ${fmt(d.routeLength)} cells to the apple. Shortcuts are only allowed while the board is less than half full.`;
      case 'hamilton':
        return `Following the same loop through every cell: ${fmt(d.routeLength)} cells to the apple.`;
      case 'greedy':
        if (d.kind === 'path') return `Chasing the apple (${fmt(d.routeLength)} moves). It only checks that the tail is still reachable. No proof.`;
        return 'No safe way to the apple. Wandering into the biggest open space and hoping for the best.';
      default:
        break;
    }
    return 'Thinking…';
  }

  function appleHow(f) {
    if (f.wander) return 'wandering';
    if (f.path && !f.cycle && !f.shortcut) return 'direct route';
    if (f.shortcut) return 'loop + shortcuts';
    if (f.path) return 'loop, then direct';
    return 'via the loop';
  }

  function logEvent(icon, html) {
    watch.events.unshift({ at: watch.game.steps, icon, html });
    if (watch.events.length > 9) watch.events.length = 9;
    watch.logDirty = true;
  }

  function renderLog() {
    $('wLog').innerHTML = watch.events.map((e) => `<li><span class="when">move ${fmt(e.at)}</span><span>${e.icon}</span><span>${e.html}</span></li>`).join('');
    watch.logDirty = false;
  }

  function newWatchGame() {
    clearTimeout(watch.restartTimer);
    const size = validSize(settings.wSize);
    watch.method = METHODS[settings.wMethod] ? settings.wMethod : 'dynamic';
    watch.game = new PS({ width: size, height: size, strategy: watch.method });
    watch.acc = 0;
    watch.elapsed = 0;
    watch.apples = [];
    watch.cur = { path: 0, cycle: 0, shortcut: 0, wander: 0 };
    watch.events = [];
    watch.milestones = new Set();
    watch.finished = false;
    watch.lastDetourApple = -1;
    $('watchOverlay').classList.remove('show', 'lost');
    const m = METHODS[watch.method];
    $('wBadge').innerHTML = `${swatch(watch.method)}${esc(m.name)}`;
    $('wMeter').style.background = m.color;
    $('wMeter').parentElement.style.background = `${m.color}2e`;
    logEvent('▶', `New game: <b>${esc(m.name)}</b> on ${size} × ${size}`);
    updateWatchText(true);
    renderWatchChart();
    renderLog();
    layoutWatch();
  }

  function watchStep() {
    const game = watch.game;
    if (game.won || game.dead) return;
    const res = game.step();
    const d = game.decision || {};
    const kind = game.lastMoveKind;
    if (kind in watch.cur) watch.cur[kind]++;
    if (watch.method === 'dynamic' && kind === 'cycle' && d.directLength && watch.lastDetourApple !== game.apples) {
      watch.lastDetourApple = game.apples;
      logEvent('🛡️', `Direct route (${fmt(d.directLength)} moves) would risk a trap → using the safety loop`);
    }
    if (res.ate) {
      const how = appleHow(watch.cur);
      const moves = game.lastAppleSteps;
      watch.apples.push({ v: moves, how });
      watch.cur = { path: 0, cycle: 0, shortcut: 0, wander: 0 };
      if (!game.won) logEvent('🍎', `Apple <b>${fmt(game.apples)}</b> in <b>${fmt(moves)}</b> moves · ${how}`);
      const filled = (game.body.length / game.N) * 100;
      for (const mark of [25, 50, 75, 90]) {
        if (filled >= mark && !watch.milestones.has(mark)) {
          watch.milestones.add(mark);
          logEvent('🏁', `<b>${mark}%</b> of the board filled after ${fmt(game.steps)} moves`);
        }
      }
    }
    if (game.won || game.dead) finishWatch();
  }

  function finishWatch() {
    if (watch.finished) return;
    watch.finished = true;
    const game = watch.game;
    const size = game.W;
    Stats.record(size, watch.method, { won: game.won, moves: game.steps, apples: game.apples });
    const direct = watch.apples.filter((a) => a.how === 'direct route').length;
    const overlay = $('watchOverlay');
    overlay.classList.add('show');
    overlay.classList.toggle('lost', !game.won);
    $('overlayTitle').textContent = game.won ? 'PERFECT!' : 'TRAPPED';
    const tiles = [
      [fmt(game.steps), 'moves'],
      [fmt(game.apples), 'apples'],
      [formatTime(watch.elapsed), 'time'],
      [game.apples ? fmt1(game.steps / game.apples) : '–', 'moves / apple'],
      [pct(direct, watch.apples.length), 'direct routes'],
      [`${Math.round((game.body.length / game.N) * 100)}%`, 'filled']
    ];
    $('overlayStats').innerHTML = tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    const ham = Stats.peek(size, 'hamilton');
    let note = '';
    if (game.won && watch.method !== 'hamilton' && ham.wins) {
      const factor = (ham.moves / ham.wins) / game.steps;
      note = `${factor.toFixed(1)}× fewer moves than the Pure Hamilton Loop's average on this board.`;
    } else if (!game.won) {
      note = 'This method has no proof. Try Dynamic Loop: it has never lost a game.';
    }
    if (settings.wAuto) note += `${note ? ' ' : ''}Next game starts in a few seconds.`;
    $('overlayNote').textContent = note;
    if (game.won) logEvent('🏆', `<b>Board filled</b> in ${fmt(game.steps)} moves (${formatTime(watch.elapsed)})`);
    else logEvent('💥', `<b>Game over</b> at ${Math.round((game.body.length / game.N) * 100)}% (${game.lossReason})`);
    updateWatchText(true);
    renderWatchChart();
    renderLog();
    if (settings.wAuto) watch.restartTimer = setTimeout(newWatchGame, 4500);
  }

  function updateWatchText(force) {
    const now = performance.now();
    const game = watch.game;
    if (!force && now - watch.lastText < 120) return;
    watch.lastText = now;
    const filled = (game.body.length / game.N) * 100;
    $('wFill').textContent = `${filled >= 99.95 ? 100 : fmt1(filled)}%`;
    $('wMeter').style.width = `${filled}%`;
    $('wLength').textContent = `Length ${fmt(game.body.length)} of ${fmt(game.N)} cells · ${fmt(game.N - game.body.length)} free`;
    $('wApples').textContent = fmt(game.apples);
    $('wMoves').textContent = fmt(game.steps);
    $('wPerApple').textContent = game.apples ? fmt1(game.steps / game.apples) : '–';
    const direct = watch.apples.filter((a) => a.how === 'direct route').length;
    $('wDirect').textContent = pct(direct, watch.apples.length);
    $('wTime').textContent = formatTime(watch.elapsed);
    const rec = Stats.peek(game.W, watch.method);
    $('wRecord').textContent = rec.games ? `${fmt(rec.wins)}/${fmt(rec.games)}` : '–';
    const kind = game.won ? 'won' : game.dead ? 'lost' : (game.lastMoveKind || 'start');
    const info = KIND_INFO[kind] || KIND_INFO.start;
    $('wChip').innerHTML = `<i style="background:${info.color}"></i><span>${info.text}</span>`;
    $('wNarration').textContent = narration(game, watch.method);
    if (watch.logDirty) renderLog();
  }

  function renderWatchChart() {
    watch.lastChart = performance.now();
    const vals = watch.apples.map((a, i) => ({ v: a.v, tip: `<div>Apple <b>${fmt(i + 1)}</b></div><div><b>${fmt(a.v)}</b> moves · ${esc(a.how)}</div>` }));
    columnChart($('wChart'), vals, { color: METHODS[watch.method].color });
    const avg = vals.length ? vals.reduce((s, v) => s + v.v, 0) / vals.length : 0;
    $('wChartNote').textContent = vals.length ? `average ${fmt1(avg)} · longest ${fmt(Math.max(...vals.map((v) => v.v)))}` : 'each bar is one apple';
  }

  function layoutWatch() {
    const wrap = $('watchWrap');
    const stageW = wrap.parentElement.clientWidth;
    const tv = document.body.classList.contains('tv');
    const reserve = tv ? 40 : 250;
    const size = Math.floor(Math.max(260, Math.min(stageW, window.innerHeight - reserve, 1100)));
    wrap.style.width = `${size}px`;
    fitCanvas($('watchBoard'), size);
    drawWatch();
  }

  function drawWatch() {
    drawBoard($('watchBoard'), watch.game, {
      color: METHODS[watch.method].color,
      showLoop: settings.wShowLoop,
      showRoute: settings.wShowRoute
    });
  }

  function setWatchRunning(on) {
    watch.running = on;
    $('wPlay').textContent = on ? '⏸ Pause' : '▶ Play';
  }

  function watchFrame(dt) {
    const game = watch.game;
    if (!watch.running || game.won || game.dead) return;
    watch.elapsed += dt;
    const speed = SPEEDS[settings.wSpeed];
    const start = performance.now();
    if (speed === Infinity) {
      while (!game.won && !game.dead && performance.now() - start < 12) {
        for (let i = 0; i < 20 && !game.won && !game.dead; i++) watchStep();
      }
    } else {
      watch.acc += (dt * speed) / 1000;
      let n = Math.floor(watch.acc);
      watch.acc -= n;
      while (n-- > 0 && !game.won && !game.dead && performance.now() - start < 14) watchStep();
    }
    drawWatch();
    updateWatchText(false);
    if (performance.now() - watch.lastChart > 400) renderWatchChart();
  }

  $('wMethod').value = METHODS[settings.wMethod] ? settings.wMethod : 'dynamic';
  $('wSize').value = String(validSize(settings.wSize));
  $('wSpeed').value = String(settings.wSpeed);
  $('wSpeedLabel').textContent = speedText(settings.wSpeed);
  $('wShowLoop').checked = settings.wShowLoop;
  $('wShowRoute').checked = settings.wShowRoute;
  $('wAuto').checked = settings.wAuto;

  $('wMethod').addEventListener('change', (e) => { settings.wMethod = e.target.value; saveSettings(); newWatchGame(); });
  $('wSize').addEventListener('change', (e) => { settings.wSize = Number(e.target.value); saveSettings(); newWatchGame(); });
  $('wSpeed').addEventListener('input', (e) => {
    settings.wSpeed = Number(e.target.value);
    $('wSpeedLabel').textContent = speedText(settings.wSpeed);
    saveSettings();
  });
  [['wShowLoop', 'wShowLoop'], ['wShowRoute', 'wShowRoute'], ['wAuto', 'wAuto']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); drawWatch(); });
  });
  $('wPlay').addEventListener('click', () => setWatchRunning(!watch.running));
  $('wStep').addEventListener('click', () => {
    setWatchRunning(false);
    watchStep();
    drawWatch();
    updateWatchText(true);
    renderWatchChart();
  });
  $('wNew').addEventListener('click', newWatchGame);

  /* ================================ RACE =============================== */

  const race = { boards: [], running: true, acc: 0, done: false, timer: null, lastChart: 0, size: 10, ticks: 0 };

  function buildRaceCards() {
    $('raceBoards').innerHTML = ORDER.map((key) => `
      <div class="card race-card" id="rc-${key}">
        <div class="rc-head">
          <div class="rc-name">${swatch(key)}${esc(METHODS[key].name)}</div>
          <div class="rc-status" id="rc-${key}-status">Running</div>
        </div>
        <canvas id="rc-${key}-canvas" aria-label="${esc(METHODS[key].name)} board"></canvas>
        <div class="meter" style="background:${METHODS[key].color}2e"><div id="rc-${key}-meter" style="background:${METHODS[key].color}"></div></div>
        <div class="rc-stats">
          <div>Moves<b id="rc-${key}-moves">0</b></div>
          <div>Apples<b id="rc-${key}-apples">0</b></div>
          <div>Filled<b id="rc-${key}-fill">0%</b></div>
        </div>
      </div>`).join('');
    $('rLegend').innerHTML = ORDER.map((k) => `<span>${swatch(k)}${esc(METHODS[k].name)}</span>`).join('');
  }

  function newRace() {
    clearTimeout(race.timer);
    race.size = validSize(settings.rSize);
    const appleSeed = (Math.random() * 4294967296) >>> 0;
    race.boards = ORDER.map((key) => ({
      key,
      game: new PS({ width: race.size, height: race.size, strategy: key, appleSeed }),
      place: null,
      points: [[0, (3 / (race.size * race.size)) * 100]],
      recorded: false
    }));
    race.done = false;
    race.acc = 0;
    race.ticks = 0;
    race.finishedOrder = 0;
    ORDER.forEach((key) => {
      const st = $(`rc-${key}-status`);
      st.textContent = 'Running';
      st.className = 'rc-status';
    });
    layoutRace();
    updateRaceText();
    renderRaceChart();
    renderRaceTable();
  }

  function raceTick() {
    race.ticks++;
    let finishedThisTick = [];
    for (const b of race.boards) {
      const g = b.game;
      if (g.won || g.dead) continue;
      const res = g.step();
      if (res.ate || g.won || g.dead) b.points.push([g.steps, (g.body.length / g.N) * 100]);
      if (g.won) finishedThisTick.push(b);
      else if (g.dead) {
        b.place = 'lost';
        const st = $(`rc-${b.key}-status`);
        st.textContent = `✖ ${g.lossReason === 'looping' ? 'Looping' : 'Trapped'} at ${Math.round((g.body.length / g.N) * 100)}%`;
        st.className = 'rc-status lost';
      }
    }
    if (finishedThisTick.length) {
      const place = race.finishedOrder + 1;
      race.finishedOrder += finishedThisTick.length;
      finishedThisTick.forEach((b) => {
        b.place = place;
        const st = $(`rc-${b.key}-status`);
        st.textContent = `${['🥇', '🥈', '🥉'][place - 1] || '🏁'} ${ordinal(place)} · ${fmt(b.game.steps)} moves`;
        st.className = 'rc-status won';
      });
    }
    if (race.boards.every((b) => b.game.won || b.game.dead)) finishRace();
  }

  function ordinal(n) { return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`; }

  function finishRace() {
    if (race.done) return;
    race.done = true;
    const results = race.boards.map((b) => ({ method: b.key, won: b.game.won, moves: b.game.steps }));
    race.boards.forEach((b) => Stats.record(race.size, b.key, { won: b.game.won, moves: b.game.steps, apples: b.game.apples }));
    Stats.recordRace(race.size, results, race.boards.filter((b) => b.place === 1).map((b) => b.key));
    renderRaceChart();
    renderRaceTable();
    if (settings.rAuto) race.timer = setTimeout(newRace, 5000);
  }

  function updateRaceText() {
    for (const b of race.boards) {
      const g = b.game;
      const filled = (g.body.length / g.N) * 100;
      $(`rc-${b.key}-moves`).textContent = fmt(g.steps);
      $(`rc-${b.key}-apples`).textContent = fmt(g.apples);
      $(`rc-${b.key}-fill`).textContent = `${filled >= 99.95 ? 100 : Math.floor(filled)}%`;
      $(`rc-${b.key}-meter`).style.width = `${filled}%`;
    }
  }

  function renderRaceChart() {
    race.lastChart = performance.now();
    lineChart($('rChart'), race.boards.map((b) => ({ key: b.key, color: METHODS[b.key].color, points: b.points })), { height: 240 });
  }

  function renderRaceTable() {
    const r = Stats.race(race.size);
    $('rRaceCount').textContent = `${fmt(r.count)} race${r.count === 1 ? '' : 's'} on ${race.size} × ${race.size}`;
    const rows = ORDER.map((k) => {
      const played = r.played[k] || 0, won = r.won[k] || 0;
      return `<tr><td><span class="mname">${swatch(k)}${esc(METHODS[k].name)}</span></td>
        <td class="num">${fmt(r.firsts[k] || 0)}</td>
        <td class="num">${pct(won, played)}</td>
        <td class="num">${won ? fmt(Math.round(r.moves[k] / won)) : '–'}</td></tr>`;
    }).join('');
    $('rTable').innerHTML = `<thead><tr><th>Method</th><th class="num">1st places</th><th class="num">Boards filled</th><th class="num">Avg moves</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function layoutRace() {
    for (const b of race.boards) {
      const canvas = $(`rc-${b.key}-canvas`);
      const w = Math.floor(canvas.parentElement.clientWidth - 2);
      const tv = document.body.classList.contains('tv');
      const maxH = tv ? window.innerHeight - 190 : window.innerHeight - 330;
      fitCanvas(canvas, Math.max(120, Math.min(w, maxH)));
      canvas.style.margin = '0 auto';
    }
    drawRace();
  }

  function drawRace() {
    for (const b of race.boards) drawBoard($(`rc-${b.key}-canvas`), b.game, { color: METHODS[b.key].color, showLoop: false, showRoute: false });
  }

  function setRaceRunning(on) {
    race.running = on;
    $('rPlay').textContent = on ? '⏸ Pause' : '▶ Play';
  }

  function raceFrame(dt) {
    if (!race.running || race.done) return;
    const speed = SPEEDS[settings.rSpeed];
    const start = performance.now();
    if (speed === Infinity) {
      while (!race.done && performance.now() - start < 12) {
        for (let i = 0; i < 10 && !race.done; i++) raceTick();
      }
    } else {
      race.acc += (dt * speed) / 1000;
      let n = Math.floor(race.acc);
      race.acc -= n;
      while (n-- > 0 && !race.done && performance.now() - start < 14) raceTick();
    }
    drawRace();
    updateRaceText();
    if (performance.now() - race.lastChart > 500) renderRaceChart();
  }

  buildRaceCards();
  $('rSize').value = String(validSize(settings.rSize));
  $('rSpeed').value = String(settings.rSpeed);
  $('rSpeedLabel').textContent = speedText(settings.rSpeed);
  $('rAuto').checked = settings.rAuto;
  $('rSize').addEventListener('change', (e) => { settings.rSize = Number(e.target.value); saveSettings(); newRace(); });
  $('rSpeed').addEventListener('input', (e) => {
    settings.rSpeed = Number(e.target.value);
    $('rSpeedLabel').textContent = speedText(settings.rSpeed);
    saveSettings();
  });
  $('rAuto').addEventListener('change', (e) => {
    settings.rAuto = e.target.checked;
    saveSettings();
    if (settings.rAuto && race.done) race.timer = setTimeout(newRace, 1500);
  });
  $('rPlay').addEventListener('click', () => setRaceRunning(!race.running));
  $('rNew').addEventListener('click', newRace);

  /* ================================ STATS ============================== */

  function statsSize() { return validSize(settings.sSize); }

  function renderStats() {
    const size = statsSize();
    const entries = ORDER.map((k) => ({ key: k, e: Stats.peek(size, k) }));
    $('sGames').textContent = fmt(Stats.totalGames(size));
    $('sGamesAll').textContent = `${fmt(Stats.totalGames())} games recorded in total, all board sizes`;

    const avg = (e) => (e.wins ? e.moves / e.wins : null);
    barChart($('sMovesChart'), entries.map(({ key, e }) => ({
      label: METHODS[key].name,
      color: METHODS[key].color,
      value: avg(e),
      empty: e.games ? 'never filled the board' : 'no games yet',
      display: e.wins ? fmt(Math.round(avg(e))) : '',
      tip: e.games ? `<div>${swatch(key)}<b>${esc(METHODS[key].name)}</b></div><div>Average ${fmt(Math.round(avg(e) || 0))} moves</div><div>Best ${e.best === null ? '–' : fmt(e.best)} · worst ${e.worst === null ? '–' : fmt(e.worst)}</div><div>${fmt(e.wins)} won games</div>` : ''
    })), { title: 'Average moves to fill the board' });
    barChart($('sWinChart'), entries.map(({ key, e }) => ({
      label: METHODS[key].name,
      color: METHODS[key].color,
      value: e.games ? (e.wins / e.games) * 100 : null,
      display: e.games ? `${((e.wins / e.games) * 100).toFixed(e.wins === e.games || e.wins === 0 ? 0 : 1)}%` : '',
      tip: e.games ? `<div>${swatch(key)}<b>${esc(METHODS[key].name)}</b></div><div>${fmt(e.wins)} won · ${fmt(e.losses)} lost</div>` : ''
    })), { max: 100, title: 'Win rate' });

    const proven = entries.filter(({ key, e }) => METHODS[key].proof && e.wins);
    if (proven.length) {
      const best = proven.reduce((a, b) => (avg(a.e) <= avg(b.e) ? a : b));
      $('sFastest').innerHTML = `${swatch(best.key)} ${esc(METHODS[best.key].name)}`;
      const ham = Stats.peek(size, 'hamilton');
      $('sFastestSub').textContent = best.key !== 'hamilton' && ham.wins
        ? `${(avg(ham) / avg(best.e)).toFixed(1)}× fewer moves than the Pure Hamilton Loop (${fmt(Math.round(avg(best.e)))} vs ${fmt(Math.round(avg(ham)))})`
        : `${fmt(Math.round(avg(best.e)))} moves on average`;
    } else {
      $('sFastest').textContent = '–';
      $('sFastestSub').textContent = 'Run a benchmark to find out';
    }
    const pg = entries.filter(({ key }) => METHODS[key].proof).reduce((a, { e }) => [a[0] + e.wins, a[1] + e.games], [0, 0]);
    $('sProofWins').textContent = pg[1] ? `${((pg[0] / pg[1]) * 100).toFixed(pg[0] === pg[1] ? 0 : 1)}%` : '–';
    $('sProofSub').textContent = pg[1]
      ? `${fmt(pg[0])} of ${fmt(pg[1])} games won by the three proven methods`
      : 'share of games won by the three proven methods';

    const rows = entries.map(({ key, e }) => `<tr>
      <td><span class="mname">${swatch(key)}${esc(METHODS[key].name)}</span></td>
      <td>${METHODS[key].proof ? '✔ yes' : '✖ no'}</td>
      <td class="num">${fmt(e.games)}</td>
      <td class="num">${fmt(e.wins)}</td>
      <td class="num">${fmt(e.losses)}</td>
      <td class="num">${pct(e.wins, e.games)}</td>
      <td class="num">${e.wins ? fmt(Math.round(avg(e))) : '–'}</td>
      <td class="num">${e.best === null ? '–' : fmt(e.best)}</td>
      <td class="num">${e.worst === null ? '–' : fmt(e.worst)}</td>
      <td class="num">${e.apples ? fmt1(e.moves / e.apples) : '–'}</td>
    </tr>`).join('');
    $('sTable').innerHTML = `<thead><tr><th>Method</th><th>Proof</th><th class="num">Games</th><th class="num">Won</th><th class="num">Lost</th>
      <th class="num">Win rate</th><th class="num">Avg moves</th><th class="num">Best</th><th class="num">Worst</th><th class="num">Moves / apple</th></tr></thead><tbody>${rows}</tbody>`;
  }

  let statsRenderPending = false;
  Stats.listeners.push(() => {
    if (statsRenderPending) return;
    statsRenderPending = true;
    setTimeout(() => {
      statsRenderPending = false;
      if (settings.tab === 'stats') renderStats();
    }, 400);
  });

  $('sSize').value = String(statsSize());
  $('sCount').value = String(settings.sCount);
  $('sSize').addEventListener('change', (e) => { settings.sSize = Number(e.target.value); saveSettings(); renderStats(); });
  $('sCount').addEventListener('change', (e) => { settings.sCount = Number(e.target.value); saveSettings(); });
  $('sReset').addEventListener('click', () => {
    if (!window.confirm('Delete all recorded statistics on this device?')) return;
    Stats.reset();
    renderStats();
    renderRaceTable();
  });
  $('sCsv').addEventListener('click', () => {
    const lines = ['board_size,method,has_proof,games,wins,losses,win_rate,avg_moves,best,worst,moves_per_apple'];
    Object.keys(Stats.data.sizes).map(Number).sort((a, b) => a - b).forEach((size) => {
      ORDER.forEach((k) => {
        const e = Stats.data.sizes[size][k];
        if (!e) return;
        lines.push([`${size}x${size}`, k, METHODS[k].proof, e.games, e.wins, e.losses,
          e.games ? (e.wins / e.games).toFixed(4) : '', e.wins ? (e.moves / e.wins).toFixed(1) : '',
          e.best ?? '', e.worst ?? '', e.apples ? (e.moves / e.apples).toFixed(2) : ''].join(','));
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'perfect-snake-stats.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ------------------- background runner (benchmark / marathon) -------- */

  const runner = { active: null };

  function startRunner(kind) {
    stopRunner();
    const size = statsSize();
    const job = {
      kind, size, methods: ORDER.slice(),
      limit: kind === 'bench' ? Number(settings.sCount) : 0,
      played: 0, wins: 0, started: performance.now(), worker: null, timer: null
    };
    runner.active = job;
    const onResults = (results) => {
      if (runner.active !== job) return;
      results.forEach((r) => {
        job.played++;
        if (r.won) job.wins++;
        Stats.record(job.size, r.method, r);
      });
      renderRunner();
    };
    const onDone = () => {
      if (runner.active !== job) return;
      job.finished = true;
      renderRunner();
      runner.active = null;
      if (job.worker) job.worker.terminate();
      updateRunnerButtons();
    };
    try {
      const worker = new Worker('marathon-worker.js');
      job.worker = worker;
      worker.onmessage = (e) => {
        onResults(e.data.results || []);
        if (e.data.type === 'done') onDone();
      };
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        job.worker = null;
        runInPage(job, onResults, onDone);
      };
      worker.postMessage({ type: 'start', size, methods: job.methods, limit: job.limit });
    } catch (e) {
      runInPage(job, onResults, onDone);
    }
    updateRunnerButtons();
    renderRunner();
  }

  // Fallback when Web Workers are unavailable (e.g. opened from disk).
  function runInPage(job, onResults, onDone) {
    let game = null, method = null, i = 0;
    const tick = () => {
      if (runner.active !== job) return;
      const results = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 25) {
        if (job.limit && i >= job.limit * job.methods.length && !game) {
          onResults(results);
          onDone();
          return;
        }
        if (!game) {
          method = job.methods[i % job.methods.length];
          game = new PS({ width: job.size, height: job.size, strategy: method });
          i++;
        }
        for (let k = 0; k < 2000 && !game.won && !game.dead; k++) game.step();
        if (game.won || game.dead) {
          results.push({ method, won: game.won, moves: game.steps, apples: game.apples });
          game = null;
        }
      }
      onResults(results);
      job.timer = setTimeout(tick, 0);
    };
    tick();
  }

  function stopRunner() {
    const job = runner.active;
    if (!job) return;
    runner.active = null;
    if (job.worker) job.worker.terminate();
    clearTimeout(job.timer);
    job.stopped = true;
    renderRunner(job);
    updateRunnerButtons();
  }

  function renderRunner(jobArg) {
    const job = jobArg || runner.active;
    const el = $('sRunner');
    if (!job) { el.hidden = true; return; }
    el.hidden = false;
    const secs = (performance.now() - job.started) / 1000;
    const rate = secs > 0 ? job.played / secs : 0;
    const label = job.kind === 'bench' ? 'Benchmark' : 'Marathon';
    let state;
    if (job.finished) state = `<b>${label} finished:</b> ${fmt(job.played)} games in ${formatTime(secs * 1000)}.`;
    else if (job.stopped) state = `<b>${label} stopped</b> after ${fmt(job.played)} games.`;
    else if (job.kind === 'bench') state = `<b>Benchmark running:</b> ${fmt(job.played)} / ${fmt(job.limit * job.methods.length)} games (${job.limit} per method) on ${job.size} × ${job.size}.`;
    else state = `<b>Marathon running</b> on ${job.size} × ${job.size}: ${fmt(job.played)} games played in ${formatTime(secs * 1000)} (${rate >= 1 ? fmt1(rate) : rate.toFixed(2)} games/s). It keeps going in the background.`;
    el.innerHTML = state;
  }

  function updateRunnerButtons() {
    const job = runner.active;
    $('sBench').textContent = job && job.kind === 'bench' ? '■ Stop benchmark' : '⚡ Run benchmark';
    $('sMarathon').textContent = job && job.kind === 'marathon' ? '■ Stop marathon' : '🏃 Start marathon';
  }

  $('sBench').addEventListener('click', () => {
    if (runner.active && runner.active.kind === 'bench') stopRunner();
    else startRunner('bench');
  });
  $('sMarathon').addEventListener('click', () => {
    if (runner.active && runner.active.kind === 'marathon') stopRunner();
    else startRunner('marathon');
  });
  setInterval(() => { if (runner.active) renderRunner(); }, 1000);

  /* ============================ tabs & TV mode ========================= */

  function showTab(tab) {
    if (!['watch', 'race', 'stats'].includes(tab)) tab = 'watch';
    settings.tab = tab;
    saveSettings();
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    ['watch', 'race', 'stats'].forEach((t) => { $(`view-${t}`).hidden = t !== tab; });
    if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    hideTip();
    requestAnimationFrame(() => {
      if (tab === 'watch') { layoutWatch(); renderWatchChart(); }
      if (tab === 'race') { layoutRace(); renderRaceChart(); renderRaceTable(); }
      if (tab === 'stats') renderStats();
    });
  }
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
  }
  function setTv(on) {
    document.body.classList.toggle('tv', on);
    if (on) {
      if (settings.tab === 'stats') showTab('watch');
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      requestWakeLock();
      if (settings.tab === 'watch') { settings.wAuto = true; $('wAuto').checked = true; setWatchRunning(true); }
      if (settings.tab === 'race') { settings.rAuto = true; $('rAuto').checked = true; setRaceRunning(true); }
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }
    setTimeout(() => { layoutWatch(); layoutRace(); }, 120);
  }
  $('tvBtn').addEventListener('click', () => setTv(true));
  $('tvExit').addEventListener('click', () => setTv(false));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('tv')) setTv(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains('tv')) requestWakeLock();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('select, input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (settings.tab === 'watch') setWatchRunning(!watch.running);
      else if (settings.tab === 'race') setRaceRunning(!race.running);
    } else if (k === 'r') {
      if (settings.tab === 'watch') newWatchGame();
      else if (settings.tab === 'race') newRace();
    } else if (k === 's' && settings.tab === 'watch') {
      $('wStep').click();
    } else if (k === 't') {
      setTv(!document.body.classList.contains('tv'));
    } else if (k === '1' || k === '2' || k === '3') {
      showTab(['watch', 'race', 'stats'][Number(k) - 1]);
    } else if (k === 'escape' && document.body.classList.contains('tv')) {
      setTv(false);
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (settings.tab === 'watch') { layoutWatch(); renderWatchChart(); }
      if (settings.tab === 'race') { layoutRace(); renderRaceChart(); }
      if (settings.tab === 'stats') renderStats();
    }, 120);
  });

  /* ================================= loop ============================== */

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(250, now - last);
    last = now;
    if (settings.tab === 'watch') watchFrame(dt);
    else if (settings.tab === 'race') raceFrame(dt);
    requestAnimationFrame(frame);
  }

  newWatchGame();
  newRace();
  showTab(location.hash ? location.hash.slice(1) : settings.tab);
  requestAnimationFrame(frame);
})();
