import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import { cardDb, slug } from '../src/index.ts';
import { WOE_BLACK, WOE_BLACK_BACKS, WOE_BLACK_TOKENS, WOE_RAT } from '../src/woe/black.ts';
import { activate, done, game, hand, n, pt } from './ecl-special-helpers.ts';
import { NIGHTMARE, play, roles, targeting } from './woe-black-helpers.ts';

// Wilds of Eldraine 23b: the black cards (registry, enchantment payoffs, random games). The rest are in woe-black-*.test.ts.

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/woe-groups.json', import.meta.url), 'utf8'),
);
const BLACK_CARDS = Object.entries(groups)
  .filter(([, g]) => g === 'black')
  .map(([name]) => name);

describe('Wilds of Eldraine black: registry', () => {
  it('has behaviour for all 34 cards, and each exists in the pool', () => {
    expect(BLACK_CARDS).toHaveLength(34);
    for (const name of BLACK_CARDS) {
      expect(WOE_BLACK[name], name).toBeDefined();
      expect(cardDb.has(slug(name)), name).toBe(true);
    }
    expect(Object.keys(WOE_BLACK)).toHaveLength(34);
    for (const name of Object.keys(WOE_BLACK_BACKS))
      expect(cardDb.has(slug(name)), name).toBe(true);
    expect(Object.keys(WOE_BLACK_BACKS).sort()).toEqual(
      [
        'Burn Together',
        'Locthwain Scorn',
        'Price of Beauty',
        'Take It Back',
        'Tempt with Treats',
      ].sort(),
    );
  });

  it('the tokens exist: the Rat can not block, Ashiok makes 1/1 Nightmares', () => {
    expect(WOE_BLACK_TOKENS.map((t) => t.id).sort()).toEqual([NIGHTMARE, WOE_RAT].sort());
    for (const id of [WOE_RAT, NIGHTMARE]) expect(cardDb.has(id), id).toBe(true);
    expect(cardDb.get(WOE_RAT)!.colors).toEqual(['B']);
    expect(cardDb.get(WOE_RAT)!.subtypes).toEqual(['Rat']);
  });

  it('the Adventure creatures keep their colour and their spells have their own', () => {
    expect(cardDb.get('callous-sell-sword')!.colors).toEqual(['B']);
    expect(cardDb.get('burn-together')!.colors).toEqual(['R']);
    expect(cardDb.get('spellscorn-coven')!.colors).toEqual(['B']);
    expect(cardDb.get('take-it-back')!.colors).toEqual(['U']);
    expect(cardDb.get('virtue-of-persistence')!.types).toEqual(['Enchantment']);
    expect(cardDb.get('locthwain-scorn')!.colors).toEqual(['B']);
  });
});

describe("Ashiok's Reaper and Wicked Visitor", () => {
  it('draw and drain when an enchantment you control goes to the graveyard: a sacrificed enchantment, a replaced Role', () => {
    const g = game({
      p1: {
        hand: ['conceited-witch', 'conceited-witch'],
        battlefield: [
          ...n('swamp', 5),
          'ashioks-reaper',
          'wicked-visitor',
          'savannah-lions',
          'hopeless-nightmare',
        ],
      },
    });
    expect(pt(g, g.id('p1', 'ashioks-reaper'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'wicked-visitor'))).toEqual([2, 2]);
    const lions = g.id('p1', 'savannah-lions');
    // {2}{B}: Sacrifice Hopeless Nightmare. It scries 2; Reaper draws; Visitor drains.
    activate(g, g.id('p1', 'hopeless-nightmare'), 2);
    done(g);
    expect(hand(g)).toHaveLength(3);
    expect(g.life('p2')).toBe(19);
    // Two Wicked Roles on the same creature: the older one goes to the graveyard (a token, an enchantment).
    play(g, 'conceited-witch', (a) => !!a.back && targeting(lions)(a));
    expect(roles(g, lions)).toHaveLength(1);
    expect(hand(g)).toHaveLength(2);
    play(g, 'conceited-witch', (a) => !!a.back && targeting(lions)(a));
    expect(roles(g, lions)).toHaveLength(1);
    // Reaper drew a card; Visitor and the Role's own trigger each made p2 lose 1.
    expect(hand(g)).toHaveLength(1 + 1);
    expect(g.life('p2')).toBe(17);
  });

  it("do nothing for the opponent's enchantments", () => {
    const g = game({
      p1: { battlefield: ['ashioks-reaper', 'wicked-visitor'] },
      p2: { battlefield: [...n('swamp', 3), 'hopeless-nightmare'] },
    });
    g.pass();
    activate(g, g.id('p2', 'hopeless-nightmare'), 2);
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Wilds of Eldraine black: random games', () => {
  it('plays short random games with every black card in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const cards = BLACK_CARDS.map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('swamp', 24)].slice(0, 70);
    for (let seed = 1; seed <= 8; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
