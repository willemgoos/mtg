import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHAVIORS,
  cardDb,
  deckById,
  DECKS,
  missingCards,
  SCRYFALL,
  slug,
  WILDS_OF_ELDRAINE_STORY_DECKS,
} from '../src/index.ts';

// Wilds of Eldraine 23c: Arena's fifteen Story Decks equal Wizards' lists.

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const official: { name: string; cards: [string, number][]; count: number }[] = JSON.parse(
  readFileSync(new URL('../scripts/data/woe-story-decks.json', import.meta.url), 'utf8'),
).decks;
const sorted = (cards: [string, number][]) => [...cards].sort((a, b) => a[0].localeCompare(b[0]));
const scry = new Map(SCRYFALL.map((c) => [c.name, c]));

describe('Wilds of Eldraine Story Decks', () => {
  it('are the fifteen official lists, in order', () => {
    expect(WILDS_OF_ELDRAINE_STORY_DECKS.map((d) => d.name)).toEqual(official.map((d) => d.name));
    for (const [i, o] of official.entries()) {
      const d = WILDS_OF_ELDRAINE_STORY_DECKS[i]!;
      expect(sorted(d.cards), o.name).toEqual(sorted(o.cards));
      expect(
        d.cards.reduce((s, [, k]) => s + k, 0),
        o.name,
      ).toBe(60);
    }
  });

  it('are ten two-colour and five three-colour Arena decks of the set, registered once', () => {
    const sizes = WILDS_OF_ELDRAINE_STORY_DECKS.map((d) => d.colors.length);
    expect(sizes.filter((n) => n === 2)).toHaveLength(10);
    expect(sizes.filter((n) => n === 3)).toHaveLength(5);
    for (const d of WILDS_OF_ELDRAINE_STORY_DECKS) {
      expect(d.set, d.name).toBe('woe');
      expect(d.source, d.name).toBe('arena');
      expect(d.series, d.name).toBe('starter');
      expect(deckById(d.id), d.name).toBe(d);
      expect(DECKS.filter((x) => x.id === d.id), d.name).toHaveLength(1);
      expect(
        d.cards.some(([n]) => n === d.face),
        `${d.name} face ${d.face}`,
      ).toBe(true);
    }
  });

  describe.each(WILDS_OF_ELDRAINE_STORY_DECKS)('$name', (deck) => {
    it('has every card in the pool with behaviour', () => {
      expect(missingCards(deck)).toEqual([]);
      for (const [name] of deck.cards) {
        if (!BASICS.has(name)) expect(BEHAVIORS[name], name).toBeDefined();
        expect(cardDb.has(slug(name)), name).toBe(true);
      }
    });

    it('has the colours of its spells', () => {
      const seen = new Set<string>();
      for (const [name] of deck.cards) for (const c of scry.get(name)?.colors ?? []) seen.add(c);
      for (const c of deck.colors) expect(seen.has(c), `${deck.name} ${c}`).toBe(true);
    });
  });
});
