import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine 23b (green): the heuristic bots play whole games with every green card (Graceful Takedown's modes and its
// any-number targets, Sentinel of Lost Lore's modes with targets in exile, Fetch Quest's and Commune with Nature's choices, the
// bargain casts, Feral Encounter's exile and emblem).

const NAMES = [
  "Agatha's Champion",
  'Beanstalk Wurm',
  'Bestial Bloodline',
  'Bramble Familiar',
  'Brave the Wilds',
  'Commune with Nature',
  'Curse of the Werefox',
  'Elvish Archivist',
  'Feral Encounter',
  'Ferocious Werefox',
  'Graceful Takedown',
  'Gruff Triplets',
  'Hamlet Glutton',
  'Hollow Scavenger',
  'Leaping Ambush',
  "Night of the Sweets' Revenge",
  'Redtooth Genealogist',
  'Redtooth Vanguard',
  'Return from the Wilds',
  'Rootrider Faun',
  'Sentinel of Lost Lore',
  'Skybeast Tracker',
  'Stormkeld Vanguard',
  'Tanglespan Lookout',
  'Tempest Hart',
  'Territorial Witchstalker',
  "The Huntsman's Redemption",
  'Thunderous Debut',
  'Titanic Growth',
  'Toadstool Admirer',
  'Tough Cookie',
  'Troublemaker Ouphe',
  'Up the Beanstalk',
  'Verdant Outrider',
  'Welcome to Sweettooth',
].map(slug);

describe('heuristic bots with the Wilds of Eldraine green cards', () => {
  it('finish games without errors', () => {
    const deck = [
      ...NAMES,
      ...NAMES.slice(0, 12),
      ...Array<string>(16).fill('forest'),
      ...Array<string>(6).fill('island'),
    ];
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 3; seed++) {
      const r = playMatch(
        engine,
        { p1: deck, p2: deck },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { maxActions: 4000 },
      );
      expect(r.actions.length, `seed ${seed}`).toBeGreaterThan(50);
    }
  }, 180_000);
});
