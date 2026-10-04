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
const DIGITAL_SETS_ALLOWED = new Set([
  'anb',
  'hbg',
  'ybro',
  'ymid',
  'ydft',
  'yecl',
  'ytdm',
  'yneo',
  'ydsk',
  'ydmu',
  // Strixhaven Brawl (15b, u): Bounty of the Deep (Jumpstart: Historic Horizons).
  'j21',
]);
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
  color_identity?: string[];
  keywords: string[];
  rarity: string;
  image_uris?: { small: string; normal: string; large: string; art_crop: string };
  /** Double-faced cards (Marvel's modal_dfc / transform): one entry per face. */
  card_faces?: RawFace[];
  flavor_name?: string;
}

type RawFace = Pick<
  RawCard,
  | 'name'
  | 'mana_cost'
  | 'type_line'
  | 'oracle_text'
  | 'power'
  | 'toughness'
  | 'loyalty'
  | 'colors'
  | 'image_uris'
>;

/** Double-faced layouts: each face becomes its own record, linked to the other. */
// Strixhaven Brawl (15b, multi): split cards (Discovery // Dispersal) are two records, either half castable from hand like a modal double-faced card.
// Strixhaven Brawl (15b, w): Rooms (Surgical Suite // Hospital Room) are `split` cards, two doors on one card.
const DOUBLE_FACED = ['modal_dfc', 'transform', 'split'];
/**
 * Final Fantasy (11a): adventurer cards (FIN's five Town lands) also become two
 * records, the main face naming its Adventure as its back (and marked `adventure`).
 */
const ADVENTURE = 'adventure';
/**
 * Secrets of Strixhaven (14a): `prepare` cards are a creature and a spell on one card face (one image).
 * Faces carry no colours or images of their own, so they fall back to the card's; the spell's name is
 * often a real card (Lightning Bolt), so its record is named `Spell (Creature)` (display name: the spell).
 */
const PREPARE = 'prepare';
const isFaced = (layout: string) =>
  DOUBLE_FACED.includes(layout) || layout === ADVENTURE || layout === PREPARE;

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
  for await (const raw of readBulk()) {
    // A double-faced card is listed in the pool under its front face's name.
    const front = isFaced(raw.layout) ? raw.card_faces?.[0]?.name : undefined;
    const c = front ? { ...raw, name: front } : raw;
    if (!wanted.has(c.name) || c.lang !== 'en') continue;
    // Classes (Bloomburrow's Talents) print their levels on one face.
    if (c.layout !== 'normal' && c.layout !== 'class' && c.layout !== 'saga' && !front) continue;
    // Digital printings only from the Arena Beginner Set (Arena-only cards of the Color Challenge decks).
    // Strixhaven Brawl: two Alchemy-only staples (Gate to the Citadel, Patchplate Resolute).
    // Digital-only printings allowed: Arena-only sets whose cards the decks use (Alchemy 'y' sets for the Brawl decks).
    if (c.digital && !DIGITAL_SETS_ALLOWED.has(c.set)) continue;
    if (!SET_PREFERENCE.includes(c.set)) continue;
    const cur = best.get(c.name);
    if (!cur || better(c, cur)) best.set(c.name, c);
  }

  const missing = [...wanted].filter((n) => !best.has(n));
  if (missing.length) throw new Error(`Not found in any allowed set: ${missing.join(', ')}`);

  const out: ScryfallCard[] = POOL.flatMap(({ name }) => {
    const c = best.get(name)!;
    if (c.card_faces && isFaced(c.layout)) return faceRecords(c, c.card_faces);
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
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${out.length} cards to ${outFile}`);
}

/** A double-faced card as two records: the front (naming its back) and the back. */
function faceRecords(c: RawCard, faces: RawFace[]): ScryfallCard[] {
  const [front, back] = faces as [RawFace, RawFace];
  return faces.slice(0, 2).map((f, i) => {
    const text = f.oracle_text ?? '';
    const img = f.image_uris ?? c.image_uris;
    const prepare = c.layout === PREPARE;
    // A prepare spell is coloured by its own cost (else the card's colours); faces list none.
    const spellColors = [...new Set((f.mana_cost ?? '').match(/[WUBRG]/g) ?? [])];
    const colors =
      prepare && i === 1 && spellColors.length
        ? spellColors
        : (f.colors ?? (prepare ? c.colors : undefined) ?? []);
    return {
      name: prepare && i === 1 ? `${f.name} (${front.name})` : f.name,
      ...(prepare && i === 1 ? { flavorName: f.name } : {}),
      scryfallId: c.id,
      oracleId: c.oracle_id,
      set: c.set,
      collectorNumber: c.collector_number,
      rarity: c.rarity,
      manaCost: f.mana_cost ?? '',
      typeLine: f.type_line,
      oracleText: text,
      ...(f.power !== undefined ? { power: f.power, toughness: f.toughness! } : {}),
      // Strixhaven (13c): a planeswalker back face (Lukka, Wayward Bonder).
      ...(f.loyalty !== undefined ? { loyalty: f.loyalty } : {}),
      colors,
      ...(prepare && c.color_identity ? { colorIdentity: c.color_identity } : {}),
      // The card lists both faces' keywords; keep this face's own.
      keywords: c.keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase())),
      ...(i === 0
        ? { back: prepare ? `${back.name} (${front.name})` : back.name }
        : { front: front.name }),
      ...(i === 0 && c.layout === ADVENTURE ? { adventure: true } : {}),
      ...(i === 0 && prepare ? { prepare: true } : {}),
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
