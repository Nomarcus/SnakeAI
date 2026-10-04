/* Plays games without graphics in a background thread (benchmark and
 * marathon), so it keeps running while the tab is hidden. */
importScripts('snake-engine.js');

let job = null;

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'start') {
    job = { size: msg.size, methods: msg.methods, limit: msg.limit || 0, started: 0 };
    run();
  } else if (msg.type === 'stop') {
    job = null;
  }
};

function run() {
  if (!job) return;
  const results = [];
  const sliceStart = Date.now();
  while (job && Date.now() - sliceStart < 250) {
    if (job.limit && job.started >= job.limit * job.methods.length) {
      self.postMessage({ type: 'done', results });
      job = null;
      return;
    }
    const method = job.methods[job.started % job.methods.length];
    job.started++;
    const game = new self.PerfectSnake({ width: job.size, height: job.size, strategy: method });
    while (!game.won && !game.dead) game.step();
    results.push({ method, won: game.won, moves: game.steps, apples: game.apples });
  }
  self.postMessage({ type: 'progress', results });
  setTimeout(run, 0);
}
