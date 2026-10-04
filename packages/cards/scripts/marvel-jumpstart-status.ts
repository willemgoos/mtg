/**
 * Status of the 51 official Marvel Super Heroes Jumpstart packets
 * (docs/marvel-jumpstart.md): which are in `MARVEL_JUMPSTART_PACKETS`, and
 * which cards each remaining packet still needs.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts
 *   pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts --packet "Iron Man"
 *   pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts --entry "Iron Man"
 *
 * `--entry` prints the packet's entry for `MARVEL_JUMPSTART_PACKETS` in
 * packages/cards/src/jumpin.ts (fill in `colors`, `face` and `blurb`).
 *
 * The lists come from Wizards' theme article (scripts/data/marvel-jumpstart-lists.json):
 * https://magic.wizards.com/en/news/announcements/marvel-super-heroes-jumpstart-booster-themes
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardDb, MARVEL_JUMPSTART_PACKETS, SCRYFALL, slug } from '../src/index.ts';

interface List {
  name: string;
  cards: [name: string, count: number][];
}

const here = dirname(fileURLToPath(import.meta.url));
const lists: List[] = JSON.parse(
  readFileSync(join(here, 'data', 'marvel-jumpstart-lists.json'), 'utf8'),
);
const basics = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const added = new Set(MARVEL_JUMPSTART_PACKETS.map((p) => p.name));
const arg = (flag: string) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;
const only = arg('--packet');
const entry = arg('--entry');

const rows = lists.map((l) => ({
  ...l,
  missing: l.cards.filter(([n]) => !basics.has(n) && !cardDb.has(slug(n))).map(([n]) => n),
}));

if (entry) {
  const l = lists.find((x) => x.name === entry);
  if (!l) throw new Error(`No packet "${entry}"`);
  const typeOf = new Map(SCRYFALL.map((c) => [c.name, c.typeLine]));
  const isLand = (n: string) => typeOf.get(n)?.includes('Land') ?? basics.has(n);
  const q = (n: string) => (n.includes("'") ? JSON.stringify(n) : `'${n}'`);
  const id = l.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const spells = l.cards.filter(([n]) => !isLand(n));
  const lands = l.cards.filter(([n]) => isLand(n));
  console.log(`  {
    id: 'msh-jumpstart-${id}',
    name: ${q(l.name)},
    colors: ['?'],
    face: ${q(spells[0]![0])},
    blurb: '?',
    set: 'msh',
    source: 'arena',
    spells: [
${spells.map(([n, k]) => `      [${q(n)}, ${k}],`).join('\n')}
    ],
    lands: [${lands.map(([n, k]) => `[${q(n)}, ${k}]`).join(', ')}],
  },`);
} else if (only) {
  const r = rows.find((x) => x.name === only);
  if (!r) throw new Error(`No packet "${only}"`);
  console.log(`${r.name} (${added.has(r.name) ? 'in the picker' : 'not added yet'})`);
  for (const [n, k] of r.cards)
    console.log(`  ${k} ${n}${r.missing.includes(n) ? '   <- missing' : ''}`);
} else {
  const done = rows.filter((r) => added.has(r.name));
  const ready = rows.filter((r) => !added.has(r.name) && !r.missing.length);
  const left = rows
    .filter((r) => r.missing.length)
    .sort((a, b) => a.missing.length - b.missing.length);
  console.log(`In the picker: ${done.length}/${rows.length}`);
  if (ready.length)
    console.log(`All cards implemented but not added yet: ${ready.map((r) => r.name).join(', ')}`);
  const shared = new Map<string, number>();
  for (const r of left) for (const m of r.missing) shared.set(m, (shared.get(m) ?? 0) + 1);
  console.log(`Remaining: ${left.length} packets, ${shared.size} different cards\n`);
  for (const r of left)
    console.log(`${String(r.missing.length).padStart(2)}  ${r.name}: ${r.missing.join(' · ')}`);
  const multi = [...shared].filter(([, k]) => k > 1).sort((a, b) => b[1] - a[1]);
  if (multi.length)
    console.log(`\nIn more than one packet: ${multi.map(([n, k]) => `${n} (${k})`).join(', ')}`);
}
