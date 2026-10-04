/**
 * Status of the Reality Fracture cards (docs/reality-fracture-plan.md): how many
 * of each build group have behaviour, and which are missing.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/fra-status.ts
 *   pnpm --filter @mtg/cards exec tsx scripts/fra-status.ts --group white
 *
 * The groups (scripts/data/fra-groups.json, front-face names) split the 280
 * main-set cards: one per colour, `multi-a` (W/U, U/B, B/R, R/G, G/W gold
 * cards), `multi-b` (the other gold cards), `colorless` (artifacts and lands),
 * `planeswalkers` (everything that needs the Jace token or loyalty work, phase
 * 17c) and `existing` (already in the pool before phase 17).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEHAVIORS } from '../src/behaviors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const groups: Record<string, string> = JSON.parse(
  readFileSync(join(here, 'data', 'fra-groups.json'), 'utf8'),
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
