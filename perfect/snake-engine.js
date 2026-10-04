/*
 * Perfect Snake engine
 * ---------------------------------------------------------------------------
 * Every strategy here keeps one invariant that makes a win mathematically
 * guaranteed on any board with even width and height:
 *
 *   There is always a Hamiltonian cycle (a closed route through every cell)
 *   in which the snake's body is one unbroken piece, ending at the head.
 *
 * If that holds, the snake can always just follow the cycle: the cell ahead is
 * either empty or the tail that is about to move away, so it can never crash,
 * and it reaches every apple within one lap.
 *
 * The cycles are built from a spanning tree on a half-resolution grid of 2x2
 * blocks: walking around the outside of the tree visits every cell exactly
 * once. Changing the tree changes the cycle, which lets the "dynamic" strategy
 * take short paths to the apple while it proves, before every move, that a
 * valid cycle still exists afterwards.
 *
 * Strategies:
 *   dynamic   – shortest safe path to the apple, cycle rebuilt on the fly (fastest)
 *   shortcuts – one fixed cycle plus safe shortcuts along it
 *   hamilton  – follow one fixed cycle forever (slowest, simplest proof)
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STRATEGIES = ['dynamic', 'shortcuts', 'hamilton'];

  class PerfectSnake {
    constructor(options = {}) {
      const width = options.width ?? 10;
      const height = options.height ?? width;
      if (width < 2 || height < 2 || width % 2 || height % 2) {
        throw new Error('Width and height must be even numbers ≥ 2');
      }
      this.W = width;
      this.H = height;
      this.N = width * height;
      this.CW = width / 2;
      this.CH = height / 2;
      this.CN = this.CW * this.CH;
      this.HE = (this.CW - 1) * this.CH;
      this.E = this.HE + this.CW * (this.CH - 1);
      this.strategy = STRATEGIES.includes(options.strategy) ? options.strategy : 'dynamic';
      this.rng = typeof options.rng === 'function'
        ? options.rng
        : (Number.isFinite(options.seed) ? mulberry32(options.seed) : Math.random);
      // How many alternative cycles the dynamic strategy samples when the
      // direct path is not provably safe.
      // Effort spent reshaping the cycle when the direct path is not
      // provably safe (number of candidate cycles evaluated per move).
      this.searchBudget = options.searchBudget ?? 400;
      this.pathTries = options.pathTries ?? 4;

      const { W, H, N, CW, HE } = this;
      this.edgeA = new Int32Array(this.E);
      this.edgeB = new Int32Array(this.E);
      for (let j = 0; j < this.CH; j++) {
        for (let i = 0; i < CW - 1; i++) {
          const e = j * (CW - 1) + i;
          this.edgeA[e] = j * CW + i;
          this.edgeB[e] = j * CW + i + 1;
        }
      }
      for (let j = 0; j < this.CH - 1; j++) {
        for (let i = 0; i < CW; i++) {
          const e = HE + j * CW + i;
          this.edgeA[e] = j * CW + i;
          this.edgeB[e] = (j + 1) * CW + i;
        }
      }

      // Every cycle built from a block tree uses each grid edge in one fixed
      // direction: even rows go left, odd rows go right, even columns go down
      // and odd columns go up. outH/outV are the two possible moves per cell.
      this.outH = new Int32Array(N).fill(-1);
      this.outV = new Int32Array(N).fill(-1);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = y * W + x;
          const hx = y % 2 === 0 ? x - 1 : x + 1;
          const vy = x % 2 === 0 ? y + 1 : y - 1;
          if (hx >= 0 && hx < W) this.outH[c] = y * W + hx;
          if (vy >= 0 && vy < H) this.outV[c] = vy * W + x;
        }
      }

      this.occ = new Int32Array(N);
      this.next = new Int32Array(N);
      this.order = new Int32Array(N);
      this.bfsTime = new Int32Array(N);
      this.bfsPrev = new Int32Array(N);
      this.bfsQueue = new Int32Array(N);
      this.parent = new Int32Array(this.CN);
      this.edgeState = new Int8Array(this.E);
      this.edgeOrder = new Int32Array(this.E);
      for (let e = 0; e < this.E; e++) this.edgeOrder[e] = e;
      this.reset();
    }

    hEdge(i, j) { return j * (this.CW - 1) + i; }
    vEdge(i, j) { return this.HE + j * this.CW + i; }

    reset() {
      const { W, CW, CH } = this;
      this.occ.fill(-1);
      // Start as a three-cell snake inside the centre block, already moving
      // along valid cycle directions: (2i,2j) -> (2i,2j+1) -> (2i+1,2j+1).
      const bi = (CW / 2) | 0;
      const bj = (CH / 2) | 0;
      const tail = (2 * bj) * W + 2 * bi;
      const mid = (2 * bj + 1) * W + 2 * bi;
      const head = (2 * bj + 1) * W + 2 * bi + 1;
      this.body = [head, mid, tail];
      // occ[c] is the move number on which the head entered c (-1 = empty),
      // so a cell's distance from the head is clock - occ[c].
      this.occ[tail] = 0;
      this.occ[mid] = 1;
      this.occ[head] = 2;
      this.clock = 2;
      this.tree = this.buildTree(this.body, false);
      this.computeNext(this.tree);
      this.computeOrder(this.next, 0);
      this.plan = [];
      this.planTree = null;
      this.steps = 0;
      this.apples = 0;
      this.won = false;
      this.dead = false;
      this.lastMoveKind = 'start';
      this.food = this.spawnFood();
    }

    spawnFood() {
      const free = this.N - this.body.length;
      if (free <= 0) return -1;
      let k = (this.rng() * free) | 0;
      for (let c = 0; c < this.N; c++) {
        if (this.occ[c] === -1) {
          if (k === 0) return c;
          k--;
        }
      }
      return -1;
    }

    find(a) {
      const p = this.parent;
      while (p[a] !== a) {
        p[a] = p[p[a]];
        a = p[a];
      }
      return a;
    }

    /*
     * Turn a body into tree constraints: a move between two blocks requires
     * that tree edge, a move inside a block forbids the edge on that side.
     * Then build any spanning tree that satisfies them (or return null if
     * none exists, meaning that body cannot lie on any block-tree cycle).
     */
    constrain(body) {
      const { W, CW, CH } = this;
      const state = this.edgeState; // 0 free, 1 required, -1 forbidden
      state.fill(0);
      for (let k = body.length - 1; k > 0; k--) {
        const a = body[k], b = body[k - 1];
        const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0;
        const abi = ax >> 1, abj = ay >> 1, bbi = bx >> 1, bbj = by >> 1;
        if (abi !== bbi || abj !== bbj) {
          const e = abj === bbj ? this.hEdge(Math.min(abi, bbi), abj) : this.vEdge(abi, Math.min(abj, bbj));
          if (state[e] === -1) return false;
          state[e] = 1;
        } else {
          let e = -1;
          if (ax === bx) {
            if (ax % 2 === 0) { if (abi > 0) e = this.hEdge(abi - 1, abj); }
            else if (abi < CW - 1) e = this.hEdge(abi, abj);
          } else if (ay % 2 === 0) { if (abj > 0) e = this.vEdge(abi, abj - 1); }
          else if (abj < CH - 1) e = this.vEdge(abi, abj);
          if (e >= 0) {
            if (state[e] === 1) return false;
            state[e] = -1;
          }
        }
      }
      return true;
    }

    buildTree(body, shuffle) {
      const { E } = this;
      const state = this.edgeState;
      if (!this.constrain(body)) return null;
      for (let i = 0; i < this.CN; i++) this.parent[i] = i;
      const tree = new Uint8Array(E);
      let joined = 0;
      for (let e = 0; e < E; e++) {
        if (state[e] !== 1) continue;
        const ra = this.find(this.edgeA[e]), rb = this.find(this.edgeB[e]);
        if (ra === rb) return null;
        this.parent[ra] = rb;
        tree[e] = 1;
        joined++;
      }
      const ord = this.edgeOrder;
      if (shuffle) {
        for (let i = E - 1; i > 0; i--) {
          const j = (this.rng() * (i + 1)) | 0;
          const t = ord[i]; ord[i] = ord[j]; ord[j] = t;
        }
      } else {
        for (let e = 0; e < E; e++) ord[e] = e;
      }
      for (let k = 0; k < E && joined < this.CN - 1; k++) {
        const e = ord[k];
        if (state[e] !== 0) continue;
        const ra = this.find(this.edgeA[e]), rb = this.find(this.edgeB[e]);
        if (ra === rb) continue;
        this.parent[ra] = rb;
        tree[e] = 1;
        joined++;
      }
      return joined === this.CN - 1 ? tree : null;
    }

    // Successor of cell c on the cycle that walks around `tree`. Each cell has
    // two allowed exits; which one is used depends only on one tree edge.
    succ(tree, c) {
      const { W, CW, CH } = this;
      const x = c % W, y = (c / W) | 0, bi = x >> 1, bj = y >> 1;
      let horizontal;
      if (y % 2 === 0) {
        horizontal = x % 2 === 0
          ? bi > 0 && tree[this.hEdge(bi - 1, bj)] === 1
          : !(bj > 0 && tree[this.vEdge(bi, bj - 1)] === 1);
      } else {
        horizontal = x % 2 === 0
          ? !(bj < CH - 1 && tree[this.vEdge(bi, bj)] === 1)
          : bi < CW - 1 && tree[this.hEdge(bi, bj)] === 1;
      }
      return horizontal ? this.outH[c] : this.outV[c];
    }

    computeNext(tree, out = this.next) {
      for (let c = 0; c < this.N; c++) out[c] = this.succ(tree, c);
      return out;
    }

    // Steps from a to b walking around `tree`, giving up once `cap` is reached.
    treeDistance(tree, a, b, cap = this.N) {
      let d = 0, c = a;
      while (c !== b) {
        if (++d >= cap) return cap;
        c = this.succ(tree, c);
      }
      return d;
    }

    /*
     * Local search over spanning trees: swap one tree edge for another
     * (both allowed by the body's constraints) whenever that makes the walk
     * from the head to the apple shorter. Every tree tried still fits the
     * body, so safety never depends on how good the search is.
     */
    improveTree(tree, from, to, budget) {
      const { E, CN } = this;
      const state = this.edgeState;
      if (!this.constrain(this.body)) return tree;
      tree = tree.slice();
      let best = this.treeDistance(tree, from, to);
      const adjHead = this.adjHead || (this.adjHead = new Int32Array(CN));
      const adjNext = this.adjNext || (this.adjNext = new Int32Array(2 * E));
      const adjTo = this.adjTo || (this.adjTo = new Int32Array(2 * E));
      const adjEdge = this.adjEdge || (this.adjEdge = new Int32Array(2 * E));
      const via = this.viaEdge || (this.viaEdge = new Int32Array(CN));
      const from2 = this.viaNode || (this.viaNode = new Int32Array(CN));
      const stack = this.treeStack || (this.treeStack = new Int32Array(CN));
      const candidates = [];
      let evals = 0, improved = true;
      while (improved && evals < budget) {
        improved = false;
        adjHead.fill(-1);
        let k = 0;
        for (let e = 0; e < E; e++) {
          if (!tree[e]) continue;
          const a = this.edgeA[e], b = this.edgeB[e];
          adjTo[k] = b; adjEdge[k] = e; adjNext[k] = adjHead[a]; adjHead[a] = k++;
          adjTo[k] = a; adjEdge[k] = e; adjNext[k] = adjHead[b]; adjHead[b] = k++;
        }
        candidates.length = 0;
        for (let e = 0; e < E; e++) if (!tree[e] && state[e] === 0) candidates.push(e);
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = (this.rng() * (i + 1)) | 0;
          const t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
        }
        let bestSwap = null;
        for (const add of candidates) {
          // Tree path between the endpoints of `add`; any free edge on it
          // can be removed to keep a spanning tree.
          const s0 = this.edgeA[add], target = this.edgeB[add];
          via.fill(-2);
          via[s0] = -1;
          let sp = 0;
          stack[sp++] = s0;
          while (sp) {
            const u = stack[--sp];
            if (u === target) break;
            for (let q = adjHead[u]; q !== -1; q = adjNext[q]) {
              const v = adjTo[q];
              if (via[v] !== -2) continue;
              via[v] = adjEdge[q];
              from2[v] = u;
              stack[sp++] = v;
            }
          }
          tree[add] = 1;
          for (let v = target; v !== s0; v = from2[v]) {
            const rem = via[v];
            if (state[rem] !== 0) continue;
            tree[rem] = 0;
            const d = this.treeDistance(tree, from, to, best);
            tree[rem] = 1;
            evals++;
            if (d < best) { best = d; bestSwap = [add, rem]; }
            if (evals >= budget) break;
          }
          tree[add] = 0;
          if (evals >= budget) break;
        }
        if (bestSwap) {
          tree[bestSwap[0]] = 1;
          tree[bestSwap[1]] = 0;
          improved = true;
        }
      }
      return tree;
    }

    computeOrder(next, from) {
      let c = from;
      for (let i = 0; i < this.N; i++) {
        this.order[c] = i;
        c = next[c];
      }
    }

    // Shortest path to the apple along allowed directions, aware that the
    // tail keeps moving out of the way while the head travels.
    shortestPath(target, randomize = false) {
      const { body, occ, bfsTime, bfsPrev, bfsQueue } = this;
      const len = body.length;
      bfsTime.fill(-1);
      const head = body[0];
      let qh = 0, qt = 0;
      bfsQueue[qt++] = head;
      bfsTime[head] = 0;
      while (qh < qt) {
        const c = bfsQueue[qh++];
        const t = bfsTime[c] + 1;
        const flip = randomize && this.rng() < 0.5 ? 1 : 0;
        for (let k = 0; k < 2; k++) {
          const n = (k ^ flip) === 0 ? this.outH[c] : this.outV[c];
          if (n < 0 || bfsTime[n] !== -1) continue;
          // A body segment i cells behind the head moves away after len - i moves.
          if (occ[n] >= 0 && t < len - (this.clock - occ[n])) continue;
          bfsTime[n] = t;
          bfsPrev[n] = c;
          if (n === target) {
            const path = [];
            for (let p = n; p !== head; p = bfsPrev[p]) path.push(p);
            return path.reverse();
          }
          bfsQueue[qt++] = n;
        }
      }
      return null;
    }

    bodyAfter(path, grows) {
      const nextLen = this.body.length + (grows ? 1 : 0);
      const out = [];
      for (let i = path.length - 1; i >= 0 && out.length < nextLen; i--) out.push(path[i]);
      for (let i = 0; out.length < nextLen; i++) out.push(this.body[i]);
      return out;
    }

    /* ---------- strategies: each returns the next cell to move to ---------- */

    decideHamilton() {
      this.lastMoveKind = 'cycle';
      return this.next[this.body[0]];
    }

    // Fixed cycle plus shortcuts that never jump past the tail in cycle
    // order, so the body always stays in cycle order (Tapsell-style).
    decideShortcuts() {
      const { N, body, food, order } = this;
      const head = body[0], tail = body[body.length - 1];
      const pd = (a, b) => (order[b] - order[a] + N) % N;
      const empty = N - body.length - 1;
      const toTail = pd(head, tail);
      const toFood = food >= 0 ? pd(head, food) : 0;
      let allowed = toTail - 4;
      if (empty < N / 2) allowed = 0;
      else if (toFood < toTail) {
        allowed -= 1;
        if ((toTail - toFood) * 4 > empty) allowed -= 10;
      }
      allowed = Math.max(0, Math.min(allowed, toFood));
      let best = this.next[head], bestD = 1;
      for (let k = 0; k < 2; k++) {
        const n = k === 0 ? this.outH[head] : this.outV[head];
        if (n < 0 || this.occ[n] !== -1) continue;
        const d = pd(head, n);
        if (d <= allowed && d > bestD) { best = n; bestD = d; }
      }
      this.lastMoveKind = bestD > 1 ? 'shortcut' : 'cycle';
      return best;
    }

    decideDynamic() {
      if (this.plan.length) {
        this.lastMoveKind = 'path';
        return this.plan.shift();
      }
      const food = this.food;
      const lastApple = this.body.length + 1 === this.N;
      // Try the shortest route first, then a few equally short variants.
      for (let attempt = 0; attempt <= this.pathTries; attempt++) {
        const path = this.shortestPath(food, attempt > 0);
        if (!path) break;
        const grown = this.bodyAfter(path, true);
        const tree = lastApple ? this.tree : this.buildTree(grown, true);
        if (tree) {
          this.plan = path;
          this.planTree = tree;
          this.lastMoveKind = 'path';
          return this.plan.shift();
        }
      }
      // The direct route cannot be proven safe. Reshape the cycle so it
      // reaches the apple sooner (still fitting the body) and take one step.
      const head = this.body[0];
      let tree = this.tree;
      if (this.searchBudget > 0) tree = this.improveTree(tree, head, food, this.searchBudget);
      if (tree !== this.tree) {
        this.tree = tree;
        this.computeNext(tree);
      }
      this.lastMoveKind = 'cycle';
      return this.next[this.body[0]];
    }

    /* -------------------------------- game -------------------------------- */

    step() {
      if (this.won || this.dead) return { won: this.won, dead: this.dead, ate: false };
      const head = this.body[0];
      let nxt;
      if (this.strategy === 'dynamic') nxt = this.decideDynamic();
      else if (this.strategy === 'shortcuts') nxt = this.decideShortcuts();
      else nxt = this.decideHamilton();

      const tail = this.body[this.body.length - 1];
      const ate = nxt === this.food;
      const dx = Math.abs((nxt % this.W) - (head % this.W));
      const dy = Math.abs(((nxt / this.W) | 0) - ((head / this.W) | 0));
      const adjacent = nxt >= 0 && dx + dy === 1;
      const blocked = this.occ[nxt] !== -1 && !(nxt === tail && !ate);
      if (!adjacent || blocked) {
        this.dead = true;
        return { won: false, dead: true, ate: false };
      }
      if (!ate) {
        this.occ[this.body.pop()] = -1;
      }
      this.body.unshift(nxt);
      this.occ[nxt] = ++this.clock;
      this.steps++;
      if (ate) {
        this.apples++;
        if (this.strategy === 'dynamic' && this.planTree) {
          this.tree = this.planTree;
          this.planTree = null;
          this.plan = [];
          this.computeNext(this.tree);
        }
        if (this.body.length === this.N) {
          this.won = true;
          this.food = -1;
        } else {
          this.food = this.spawnFood();
        }
      }
      return { won: this.won, dead: false, ate };
    }

    setStrategy(strategy) {
      if (!STRATEGIES.includes(strategy)) return;
      this.strategy = strategy;
      this.reset();
    }

    // The cycle that currently guarantees the win: while a planned path is
    // being followed that is the cycle proven to exist after the apple.
    safetyCycle() {
      if (this.strategy === 'dynamic' && this.plan.length && this.planTree) {
        if (this.shownTree !== this.planTree) {
          this.shownTree = this.planTree;
          this.shownNext = this.computeNext(this.planTree, this.shownNext || new Int32Array(this.N));
        }
        return this.shownNext;
      }
      return this.next;
    }

    // Cells of the planned route ahead (for drawing).
    upcomingRoute(limit = Infinity) {
      if (this.strategy === 'dynamic' && this.plan.length) return this.plan.slice(0, limit);
      if (this.food < 0) return [];
      const route = [];
      let c = this.body[0];
      while (c !== this.food && route.length < Math.min(limit, this.N)) {
        c = this.next[c];
        route.push(c);
      }
      return route;
    }

    // Invariant check: the body must be one unbroken piece of a valid cycle.
    verifyInvariant() {
      if (this.won || this.dead) return true;
      if (this.strategy === 'dynamic' && this.plan.length) return true;
      if (this.strategy === 'shortcuts') {
        // Body segments must appear in cycle order from tail to head,
        // spanning less than one full lap.
        const { order, N, body } = this;
        let span = 0;
        for (let i = 1; i < body.length; i++) {
          const gap = (order[body[i - 1]] - order[body[i]] + N) % N;
          if (gap === 0) return false;
          span += gap;
        }
        return span < N;
      }
      for (let i = 1; i < this.body.length; i++) {
        if (this.next[this.body[i]] !== this.body[i - 1]) return false;
      }
      return true;
    }
  }

  PerfectSnake.STRATEGIES = STRATEGIES;
  PerfectSnake.mulberry32 = mulberry32;

  if (typeof module === 'object' && module.exports) module.exports = PerfectSnake;
  else root.PerfectSnake = PerfectSnake;
})(typeof self !== 'undefined' ? self : this);
