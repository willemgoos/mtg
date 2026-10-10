/**
 * Status of The Hobbit cards (docs/the-hobbit-plan.md): how many of each build
 * group have behaviour, and which are missing.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/hob-status.ts
 *   pnpm --filter @mtg/cards exec tsx scripts/hob-status.ts --group white
 *
 * The groups (scripts/data/hob-groups.json, front-face names) split the 188
 * main-set cards (the ten basics left out): one per colour, `multicolour` (gold and
 * hybrid cards) and `colorless` (artifacts and lands). No card was in the pool before.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEHAVIORS } from '../src/behaviors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const groups: Record<string, string> = JSON.parse(
  readFileSync(join(here, 'data', 'hob-groups.json'), 'utf8'),
);
const arg = (flag: string) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;
const only = arg('--group');

const byGroup = new Map<string, string[]>();
for (const [name, g] of Object.entries(groups)) byGroup.set(g, [...(byGroup.get(g) ?? []), name]);

let done = 0;
for (const [g, names] of byGroup) {
  if (only && g !== only) continue;
  const missing = names.filter((n) => !BEHAVIORS[n]);
  done += names.length - missing.length;
  console.log(`${g}: ${names.length - missing.length}/${names.length}`);
  if (only || missing.length <= 10) for (const n of missing) console.log(`  - ${n}`);
}
if (!only) console.log(`total: ${done}/${Object.keys(groups).length}`);
