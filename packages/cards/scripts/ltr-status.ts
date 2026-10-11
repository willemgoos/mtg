/**
 * Status of The Lord of the Rings cards (docs/lord-of-the-rings-plan.md): how many of each
 * build group have behaviour, and which are missing.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/ltr-status.ts
 *   pnpm --filter @mtg/cards exec tsx scripts/ltr-status.ts --group white
 *
 * The groups (scripts/data/ltr-groups.json, front-face names) split the 204 Jumpstart
 * cards: the fixed packet cards per colour plus `colorless` (21b), and the random-slot
 * rares and mythics as `<colour>-rare`, `multicolour-rare` and `colorless-rare` (21d), and
 * the other main-set cards as `<colour>-main`, `multicolour-main` and `colorless-main` (22).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEHAVIORS } from '../src/behaviors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const groups: Record<string, string> = JSON.parse(
  readFileSync(join(here, 'data', 'ltr-groups.json'), 'utf8'),
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
