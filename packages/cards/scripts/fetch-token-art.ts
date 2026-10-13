/**
 * Picks a Scryfall token printing (normal-size image) for each of our token definitions, from the
 * Scryfall bulk file cached by `pnpm cards:fetch`, and writes src/generated/token-art.json.
 *
 * A token must match the definition's name, card types and power/toughness, and should match its
 * colours. Among the matches, the printing linked from a card that makes the token wins, then one
 * from that card's set (Foundations' Food for Foundations, Bloomburrow's for Bloomburrow), then
 * matching keywords.
 * A token with no match keeps the drawn token face.
 *
 *   pnpm --filter @mtg/cards exec tsx scripts/fetch-token-art.ts
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { CARDS, scryfallById } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Raw {
  id: string;
  name: string;
  set: string;
  lang: string;
  layout: string;
  type_line?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  keywords?: string[];
  released_at: string;
  image_uris?: { normal: string };
  card_faces?: {
    name: string;
    type_line?: string;
    colors?: string[];
    power?: string;
    toughness?: string;
    image_uris?: { normal: string };
  }[];
  all_parts?: { id: string; component: string }[];
}

const tokens = CARDS.filter((c) => c.isToken);
const ours = new Set([...scryfallById.values()].map((s) => s.scryfallId));

// The cards (and tokens) that make each token, by id.
const makers = new Map<string, string[]>();
for (const c of CARDS) {
  const json = JSON.stringify(c.abilities ?? []) + JSON.stringify(c);
  for (const t of tokens)
    if (t.id !== c.id && json.includes(`"${t.id}"`))
      makers.set(t.id, [...(makers.get(t.id) ?? []), c.id]);
}

const candidates: Raw[] = [];
const linked = new Map<string, Set<string>>(); // our card's scryfall id -> its related token ids
const lines = createInterface({
  input: createReadStream(join(root, '.cache', 'default-cards.jsonl.gz')).pipe(createGunzip()),
});
for await (const line of lines) {
  if (!line.startsWith('{')) continue;
  const c = JSON.parse(line.replace(/,\s*$/, '')) as Raw;
  if (ours.has(c.id))
    linked.set(
      c.id,
      new Set((c.all_parts ?? []).filter((p) => p.component === 'token').map((p) => p.id)),
    );
  if (c.lang !== 'en' || !['token', 'emblem', 'double_faced_token'].includes(c.layout)) continue;
  // A double-faced token is two tokens: keep each face on its own.
  if (c.layout === 'double_faced_token')
    for (const f of c.card_faces ?? []) {
      if (f.image_uris) candidates.push({ ...c, ...f, keywords: c.keywords });
    }
  else if (c.image_uris) candidates.push(c);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const out: Record<string, string> = {};
const missing: string[] = [];
const offColour: string[] = [];
for (const t of tokens) {
  const isEmblem = t.id === 'ltr-the-ring';
  const sets = new Set<string>();
  const links = new Set<string>();
  for (const m of makers.get(t.id) ?? []) {
    const sc = scryfallById.get(m);
    if (!sc) continue;
    sets.add(`t${sc.set}`);
    for (const id of linked.get(sc.scryfallId) ?? []) links.add(id);
  }
  const want = (t.colors ?? []).slice().sort().join('');
  let best: Raw | undefined;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (norm(c.name) !== norm(t.name)) continue;
    const typeLine = c.type_line ?? '';
    if (isEmblem !== /Emblem/.test(typeLine)) continue;
    let score = 0;
    if (!isEmblem) {
      if (!t.types.every((ty) => typeLine.includes(ty))) continue;
      // Colours should match; another colour's printing is kept as a last resort.
      if ((c.colors ?? []).slice().sort().join('') !== want) score -= 50;
      // A 0/0 token gets its size as it's made (an X/X): it matches a printed */* or 0/0.
      const variable = t.power === 0 && t.toughness === 0 && (c.power === '*' || c.power === '0');
      if (
        t.power !== undefined &&
        !variable &&
        (c.power !== String(t.power) || c.toughness !== String(t.toughness))
      )
        continue;
      if (t.power === undefined && c.power !== undefined) continue;
    }
    const kw = new Set((c.keywords ?? []).map((k) => k.toLowerCase()));
    const mine = (t.keywords ?? []).map((k) => k.toLowerCase());
    if (links.has(c.id)) score += 20;
    if (sets.has(c.set)) score += 10;
    if (c.set === 'tfdn') score += 2;
    score += mine.filter((k) => kw.has(k)).length * 3;
    score -= [...kw].filter((k) => !mine.includes(k)).length * 3;
    score += Number(c.released_at.slice(0, 4)) / 1e4; // tie-break: newer art
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best?.image_uris) out[t.id] = best.image_uris.normal;
  else missing.push(`${t.id} (${t.name})`);
  if (best && bestScore < 0) offColour.push(`${t.id} (${best.set})`);
}

writeFileSync(
  join(root, 'src', 'generated', 'token-art.json'),
  `${JSON.stringify(out, null, 1)}\n`,
);
console.log(`${Object.keys(out).length}/${tokens.length} tokens have art`);
if (offColour.length) console.log(`another colour's printing:\n  ${offColour.join('\n  ')}`);
if (missing.length) console.log(`no match:\n  ${missing.join('\n  ')}`);
