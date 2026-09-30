/** Refresh the identity manifest; never registers unsupported card behaviors. */
import { writeFileSync } from 'node:fs';
import { SCRYFALL, slug } from '../src/index.ts';

interface Raw {
  name: string;
  oracle_id: string;
  collector_number: string;
  rarity: string;
  type_line: string;
  oracle_text?: string;
  keywords: string[];
  games: string[];
  booster: boolean;
}
async function search(query: string): Promise<Raw[]> {
  let url: string | undefined =
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=set`;
  const cards: Raw[] = [];
  while (url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'mtg-season-audit/0.1', Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Scryfall: ${response.status}`);
    const page = (await response.json()) as { data: Raw[]; next_page?: string };
    cards.push(...page.data);
    url = page.next_page;
    if (url) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return cards;
}
const all = await search('set:fdn unique:cards');
const regular = await search('set:fdn cn<=271 unique:prints');
const guests = await search('set:spg cn>=74 cn<=83 unique:prints');
const base = new Map(regular.map((c) => [c.name, c]));
const compact = (c: Raw) => ({
  id: slug(c.name),
  name: c.name,
  oracleId: c.oracle_id,
  collectorNumber: c.collector_number,
  rarity: c.rarity,
  typeLine: c.type_line,
  oracleText: c.oracle_text ?? '',
  keywords: c.keywords,
  arena: c.games.includes('arena'),
  booster: c.booster,
});
const manifest = {
  checked: new Date().toISOString().slice(0, 10),
  sources: [
    'https://api.scryfall.com/cards/search?q=set%3Afdn+unique%3Acards',
    'https://magic.wizards.com/en/news/feature/collecting-foundations',
    'https://magic.wizards.com/en/mtgarena/drop-rates',
  ],
  cards: all
    .map((c) => ({ ...compact(base.get(c.name) ?? c), regular: base.has(c.name) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  specialGuests: guests.map(compact),
};
writeFileSync(
  new URL('../src/generated/foundations-manifest.json', import.meta.url),
  JSON.stringify(manifest, null, 2) + '\n',
);
const supported = new Set(SCRYFALL.map((c) => slug(c.name)));
const missing = manifest.cards.filter((c) => !supported.has(c.id));
const eligible = manifest.cards.filter((c) => c.regular && c.arena && !/^Basic\b/.test(c.typeLine));
writeFileSync(
  new URL('../src/generated/foundations-pack-candidates.json', import.meta.url),
  JSON.stringify(
    eligible.map(({ id, rarity }) => ({ id, rarity })),
    null,
    2,
  ) + '\n',
);
writeFileSync(
  new URL('../../../docs/foundations-inventory.md', import.meta.url),
  [
    '# Foundations content inventory',
    '',
    `Checked ${manifest.checked}. Regenerate with \`corepack pnpm exec tsx packages/cards/scripts/audit-foundations.ts\`.`,
    '',
    `FDN: ${all.length} unique names; ${all.length - missing.length} registered; ${missing.length} missing. Registration is not a complete rules-fidelity audit.`,
    `Regular Arena pack candidates: ${eligible.length}; ${eligible.filter((c) => supported.has(c.id)).length} registered. Special Guests: ${guests.length}; ${guests.filter((c) => supported.has(slug(c.name))).length} registered; bonus slot remains disabled until the complete sheet is supported.`,
    '',
    'Manifest separates base collector numbers 1–271 from other FDN products, checks Arena availability, excludes basics at runtime, and deduplicates names. This is a provisional store-pack sheet, not a claim of exact Arena collation.',
    '',
    '## Missing FDN cards by mechanics',
    '',
    ...missing.map(
      (c) =>
        `- **${c.name}** (${c.rarity}; ${c.regular ? 'regular booster' : 'other FDN product'}) — ${c.keywords.join(', ') || c.typeLine}.`,
    ),
    '',
    '## Foundations Special Guests',
    '',
    ...guests.map(
      (c) =>
        `- ${c.name} — ${supported.has(slug(c.name)) ? 'registered; requires bonus-sheet fidelity review' : 'missing'}.`,
    ),
    '',
    '## Rules fidelity work',
    '',
    'For each content batch, inspect existing behavior overrides against the manifest oracle text, implement required engine/player/AI choices, and run rules and bot tests. Prioritize regular booster cards and mechanics needed for curated opponents. Existing simplified behavior is not certified by this inventory.',
    '',
  ].join('\n'),
);
console.log(
  `FDN ${all.length}: ${all.length - missing.length} registered, ${missing.length} missing; pack candidates ${eligible.length}; SPG ${guests.length}`,
);
