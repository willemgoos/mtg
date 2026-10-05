/**
 * Picks the basic land printings (normal-size images) of each set that has decks, from the Scryfall
 * bulk file cached by `pnpm cards:fetch`, and writes src/generated/basic-art.json. Full-art
 * printings are preferred; a set without any (Strixhaven) uses what it has.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/fetch-basic-art.ts
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = ['fdn', 'blb', 'msh', 'fin', 'stx', 'sos', 'fra'];
const BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

interface Raw {
  name: string;
  set: string;
  lang: string;
  collector_number: string;
  full_art: boolean;
  digital: boolean;
  promo: boolean;
  image_uris?: { normal: string };
}

const found: Record<string, Record<string, Raw[]>> = {};
const lines = createInterface({
  input: createReadStream(join(root, '.cache', 'default-cards.jsonl.gz')).pipe(createGunzip()),
});
for await (const line of lines) {
  if (!line.startsWith('{')) continue;
  const c = JSON.parse(line) as Raw;
  if (!SETS.includes(c.set) || !BASICS.includes(c.name) || c.lang !== 'en' || !c.image_uris) continue;
  ((found[c.set] ??= {})[c.name] ??= []).push(c);
}

const out: Record<string, Record<string, string[]>> = {};
for (const set of SETS) {
  out[set] = {};
  for (const name of BASICS) {
    const all = (found[set]?.[name] ?? []).sort(
      (a, b) => +a.collector_number - +b.collector_number,
    );
    const full = all.filter((c) => c.full_art);
    out[set]![name] = (full.length ? full : all).map((c) => c.image_uris!.normal);
  }
}
writeFileSync(join(root, 'src', 'generated', 'basic-art.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(Object.entries(out).map(([s, b]) => `${s}: ${Object.values(b).map((u) => u.length).join('/')}`).join('\n'));
