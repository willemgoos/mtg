/**
 * Status of the Lorwyn Eclipsed cards (docs/lorwyn-eclipsed-plan.md): how many
 * of each build group have behaviour, and which are missing.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/ecl-status.ts
 *   pnpm --filter @mtg/cards exec tsx scripts/ecl-status.ts --group white
 *
 * The groups (scripts/data/ecl-groups.json, front-face names) split the 268
 * main-set cards: one per colour, `multi-a` (W/U, U/B, B/R, R/G, G/W gold
 * cards), `multi-b` (the other gold cards), `colorless` (artifacts and lands),
 * `transform` (the seven two-faced legends), `incarnations` (the five evoke
 * Elementals) and `existing` (already in the pool before this set).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEHAVIORS } from '../src/behaviors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const groups: Record<string, string> = JSON.parse(
  readFileSync(join(here, 'data', 'ecl-groups.json'), 'utf8'),
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
