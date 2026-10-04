// Plays many full games with every strategy and fails unless all are won.
// Usage: node tests/perfect-engine.test.js [gamesPerBoard]
const PerfectSnake = require('../perfect/snake-engine.js');

const games = Number(process.argv[2]) || 200;
const boards = [[2, 2], [4, 4], [6, 4], [10, 10], [12, 8], [16, 16], [20, 20]];
let failures = 0;

for (const strategy of PerfectSnake.STRATEGIES) {
  for (const [w, h] of boards) {
    const count = w * h > 300 ? Math.max(5, games / 10 | 0) : games;
    let wins = 0, steps = 0, worst = 0;
    const started = Date.now();
    for (let g = 0; g < count; g++) {
      const game = new PerfectSnake({ width: w, height: h, strategy, seed: 1000 * g + w * 31 + h });
      const limit = game.N * game.N * 2 + 100;
      while (!game.won && !game.dead && game.steps < limit) {
        game.step();
        if (!game.verifyInvariant()) {
          console.error(`  invariant broken: ${strategy} ${w}x${h} game ${g} step ${game.steps}`);
          game.dead = true;
        }
      }
      if (game.won) {
        wins++;
        steps += game.steps;
        worst = Math.max(worst, game.steps);
      }
    }
    const ok = wins === count;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${strategy.padEnd(9)} ${`${w}x${h}`.padEnd(6)} wins ${wins}/${count}` +
      `  avg steps ${wins ? Math.round(steps / wins) : '-'}  worst ${worst}  (${Date.now() - started} ms)`);
  }
}
if (failures) {
  console.error(`${failures} board/strategy combinations did not win every game`);
  process.exit(1);
}
console.log('All games won.');
