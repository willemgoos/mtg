/**
 * Downloads Scryfall's `default_cards` bulk file (cached in .cache/), picks one
 * printing per card in our pool (Foundations first, then older core sets) and
 * writes a compact JSON file that the card definitions are built from.
 *
 *   pnpm cards:fetch            # use cache if present
 *   pnpm cards:fetch --refresh  # re-download bulk data
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { POOL, SET_PREFERENCE } from '../src/pool.ts';
import type { ScryfallCard } from '../src/scryfall-types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheFile = join(root, '.cache', 'default-cards.jsonl.gz');
const outFile = join(root, 'src', 'generated', 'scryfall.json');
const headers = { 'User-Agent': 'mtg-personal-client/0.1', Accept: 'application/json' };

interface RawCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  lang: string;
  layout: string;
  digital: boolean;
  promo: boolean;
  full_art: boolean;
  border_color: string;
  frame_effects?: string[];
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  keywords: string[];
  rarity: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
}

async function download(): Promise<void> {
  const meta = (await (await fetch('https://api.scryfall.com/bulk-data', { headers })).json()) as {
    data: { type: string; jsonl_download_uri: string; compressed_size: number }[];
  };
  const entry = meta.data.find((d) => d.type === 'default_cards');
  if (!entry) throw new Error('default_cards bulk entry not found');
  const url = entry.jsonl_download_uri;
  console.log(`Downloading ${(entry.compressed_size / 1e6).toFixed(0)} MB from ${url}`);
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  mkdirSync(dirname(cacheFile), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(cacheFile));
}

/** Bulk data is gzipped JSON Lines: one card object per line. */
export async function* readBulk(file = cacheFile): AsyncGenerator<RawCard> {
  const rl = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.startsWith('{')) yield JSON.parse(line) as RawCard;
  }
}

function printingRank(c: RawCard): number[] {
  const setRank = SET_PREFERENCE.indexOf(c.set);
  return [
    setRank < 0 ? 999 : setRank,
    c.promo || c.full_art ? 1 : 0,
    c.border_color === 'black' ? 0 : 1,
    c.frame_effects?.length ? 1 : 0,
    Number.parseInt(c.collector_number, 10) || 9999,
  ];
}

function better(a: RawCard, b: RawCard): boolean {
  const ra = printingRank(a);
  const rb = printingRank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! < rb[i]!;
  return false;
}

async function main(): Promise<void> {
  if (process.argv.includes('--refresh') || !existsSync(cacheFile)) await download();

  const wanted = new Set(POOL.map((p) => p.name));
  const best = new Map<string, RawCard>();
  for await (const c of readBulk()) {
    if (!wanted.has(c.name) || c.lang !== 'en') continue;
    // Classes (Bloomburrow's Talents) print their levels on one face.
    if (c.layout !== 'normal' && c.layout !== 'class') continue;
    // Digital printings only from the Arena Beginner Set (Arena-only cards of the Color Challenge decks).
    if (c.digital && c.set !== 'anb') continue;
    if (!SET_PREFERENCE.includes(c.set)) continue;
    const cur = best.get(c.name);
    if (!cur || better(c, cur)) best.set(c.name, c);
  }

  const missing = [...wanted].filter((n) => !best.has(n));
  if (missing.length) throw new Error(`Not found in any allowed set: ${missing.join(', ')}`);

  const out: ScryfallCard[] = POOL.map(({ name }) => {
    const c = best.get(name)!;
    return {
      name: c.name,
      scryfallId: c.id,
      oracleId: c.oracle_id,
      set: c.set,
      collectorNumber: c.collector_number,
      rarity: c.rarity,
      manaCost: c.mana_cost ?? '',
      typeLine: c.type_line,
      oracleText: c.oracle_text ?? '',
      ...(c.power !== undefined ? { power: c.power, toughness: c.toughness! } : {}),
      colors: c.colors ?? [],
      keywords: c.keywords,
      image: c.image_uris
        ? {
            small: c.image_uris.small,
            normal: c.image_uris.normal,
            large: c.image_uris.large,
            artCrop: c.image_uris.art_crop,
          }
        : null,
    };
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${out.length} cards to ${outFile}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
