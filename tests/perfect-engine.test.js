// Plays many full games with every strategy and fails unless all are won.
// Usage: node tests/perfect-engine.test.js [gamesPerBoard]
const PerfectSnake = require('../perfect/snake-engine.js');

const games = Number(process.argv[2]) || 200;
const boards = [[2, 2], [4, 4], [6, 4], [10, 10], [12, 8], [16, 16], [20, 20]];
let failures = 0;

for (const strategy of PerfectSnake.GUARANTEED) {
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
// Same apple seed must give the same first apples whatever the strategy.
{
  const firsts = PerfectSnake.STRATEGIES.map(strategy => new PerfectSnake({ width: 10, height: 10, strategy, appleSeed: 42 }).food);
  if (new Set(firsts).size !== 1) {
    console.error('FAIL  apple sequence differs between strategies', firsts);
    failures++;
  } else console.log('PASS  same appleSeed gives the same apples for every strategy');
}

// The greedy baseline has no guarantee; it only has to end every game.
{
  let wins = 0;
  for (let g = 0; g < 50; g++) {
    const game = new PerfectSnake({ width: 10, height: 10, strategy: 'greedy', seed: g });
    while (!game.won && !game.dead) game.step();
    if (game.won) wins++;
  }
  console.log(`INFO  greedy baseline (no proof) won ${wins}/50 on 10x10`);
}

if (failures) {
  console.error(`${failures} board/strategy combinations did not win every game`);
  process.exit(1);
}
console.log('All games won.');
