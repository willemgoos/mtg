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
  loyalty?: string;
  toughness?: string;
  colors?: string[];
  keywords: string[];
  rarity: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
  /** Double-faced cards (Marvel's modal_dfc / transform): one entry per face. */
  card_faces?: RawFace[];
  flavor_name?: string;
  /** Related cards: a meld card lists its two halves ('meld_part') and the result ('meld_result'). */
  all_parts?: { component: string; name: string }[];
}

type RawFace = Pick<
  RawCard,
  | 'name'
  | 'mana_cost'
  | 'type_line'
  | 'oracle_text'
  | 'power'
  | 'toughness'
  | 'colors'
  | 'image_uris'
>;

/**
 * Digital-only sets allowed: the Arena Beginner Set; Final Fantasy Commander
 * (phase 12): Alchemy cards in the Arena Store Brawl decks.
 */
const DIGITAL_SETS = ['anb', 'ymid', 'ywoe'];

/** Double-faced layouts: each face becomes its own record, linked to the other. */
const DOUBLE_FACED = ['modal_dfc', 'transform'];
/**
 * Final Fantasy (11a): adventurer cards (FIN's five Town lands) also become two
 * records, the main face naming its Adventure as its back (and marked `adventure`).
 */
const ADVENTURE = 'adventure';
const isFaced = (layout: string) => DOUBLE_FACED.includes(layout) || layout === ADVENTURE;
/**
 * Final Fantasy (11c): meld. The two halves are normal cards; the melded result
 * (not in the pool) is written as a back face of the half that melds ("meld them
 * into"), the way `transform` writes its back.
 */
const MELD = 'meld';
const meldResultOf = (c: RawCard) =>
  c.layout === MELD ? c.all_parts?.find((p) => p.component === 'meld_result')?.name : undefined;

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
    // A Marvel Commander reprint under a Marvel name shows that name (and its art).
    c.set === 'msc' && c.flavor_name ? 0 : 1,
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
  // Final Fantasy (11c): meld results of the meld halves in the pool.
  const melded = new Map<string, RawCard>();
  for await (const raw of readBulk()) {
    if (
      raw.lang === 'en' &&
      meldResultOf(raw) === raw.name &&
      SET_PREFERENCE.includes(raw.set) &&
      raw.all_parts?.some((p) => p.component === 'meld_part' && wanted.has(p.name))
    ) {
      const cur = melded.get(raw.name);
      if (!cur || better(raw, cur)) melded.set(raw.name, raw);
      continue;
    }
    // A double-faced card is listed in the pool under its front face's name.
    const front = isFaced(raw.layout) ? raw.card_faces?.[0]?.name : undefined;
    const c = front ? { ...raw, name: front } : raw;
    if (!wanted.has(c.name) || c.lang !== 'en') continue;
    // Classes (Bloomburrow's Talents) print their levels on one face.
    const single = ['normal', 'class', 'saga', MELD].includes(c.layout);
    if (!single && !front) continue;
    // Digital printings only from the Arena Beginner Set (Arena-only cards of the Color Challenge decks).
    if (c.digital && !DIGITAL_SETS.includes(c.set)) continue;
    if (!SET_PREFERENCE.includes(c.set)) continue;
    const cur = best.get(c.name);
    if (!cur || better(c, cur)) best.set(c.name, c);
  }

  const missing = [...wanted].filter((n) => !best.has(n));
  if (missing.length) throw new Error(`Not found in any allowed set: ${missing.join(', ')}`);

  const out: ScryfallCard[] = POOL.flatMap(({ name }) => {
    const c = best.get(name)!;
    if (c.card_faces && isFaced(c.layout)) return faceRecords(c, c.card_faces);
    // Final Fantasy (11c): the half that melds brings the melded result as its back face.
    const result = /meld them into/.test(c.oracle_text ?? '') ? meldResultOf(c) : undefined;
    const meld = result ? melded.get(result) : undefined;
    if (result && !meld) throw new Error(`Meld result not found: ${result}`);
    return meld ? [record(c), { ...record(meld), front: c.name }] : record(c);
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${out.length} cards to ${outFile}`);
}

/** A single-faced card's record. */
function record(c: RawCard): ScryfallCard {
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
    ...(c.loyalty !== undefined ? { loyalty: c.loyalty } : {}),
    colors: c.colors ?? [],
    keywords: c.keywords,
    ...(c.set === 'msc' && c.flavor_name ? { flavorName: c.flavor_name } : {}),
    image: c.image_uris
      ? {
          small: c.image_uris.small,
          normal: c.image_uris.normal,
          large: c.image_uris.large,
          artCrop: c.image_uris.art_crop,
        }
      : null,
  };
}

/** A double-faced card as two records: the front (naming its back) and the back. */
function faceRecords(c: RawCard, faces: RawFace[]): ScryfallCard[] {
  const [front, back] = faces as [RawFace, RawFace];
  return faces.slice(0, 2).map((f, i) => {
    const text = f.oracle_text ?? '';
    const img = f.image_uris ?? c.image_uris;
    return {
      name: f.name,
      scryfallId: c.id,
      oracleId: c.oracle_id,
      set: c.set,
      collectorNumber: c.collector_number,
      rarity: c.rarity,
      manaCost: f.mana_cost ?? '',
      typeLine: f.type_line,
      oracleText: text,
      ...(f.power !== undefined ? { power: f.power, toughness: f.toughness! } : {}),
      colors: f.colors ?? [],
      // The card lists both faces' keywords; keep this face's own.
      keywords: c.keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase())),
      ...(i === 0 ? { back: back.name } : { front: front.name }),
      ...(i === 0 && c.layout === ADVENTURE ? { adventure: true } : {}),
      image: img
        ? {
            small: img.small,
            normal: img.normal,
            large: img.large,
            artCrop: img.art_crop,
          }
        : null,
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
