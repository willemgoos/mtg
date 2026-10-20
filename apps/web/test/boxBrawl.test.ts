import { cardDb, deckGameOptions, slug } from '@mtg/cards';
import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import {
  applyBoxSuggestion,
  BOX_LOSSES,
  BOX_LANDS,
  BOX_MAIN,
  BOX_PACKS,
  BOX_WINS,
  boxBoosters,
  boxOpponent,
  boxPlayerDeck,
  boxPool,
  canCommand,
  canPlay,
  chooseCommander,
  commanderChoices,
  emptyBox,
  fits,
  giftedLegends,
  identityOf,
  LEGEND_CHOICES,
  rankCommanders,
  legalSide,
  loadBox,
  moveBoxCard,
  recordBoxMatch,
  resignBox,
  saveBox,
  startBox,
  startBoxMatch,
  statusOf,
  type BoxState,
} from '../src/game/boxBrawl.ts';
import { ALL_PACK_SETS, deckAdvice, packSetCards, size } from '../src/game/expedition.ts';

const started = (seed = 7, set: (typeof ALL_PACK_SETS)[number] = 'fdn') =>
  startBox(emptyBox(), set, seed);

/** A started event with its first commander chosen and the suggested deck in. */
function built(seed = 7, set: (typeof ALL_PACK_SETS)[number] = 'fdn'): BoxState {
  const s = started(seed, set);
  const c = commanderChoices(s.event!).names[0]!;
  return applyBoxSuggestion(chooseCommander(s, c));
}

describe('Box Brawl box', () => {
  it('opens 36 Play Boosters, the same ones for a seed', () => {
    const e = started().event!;
    expect(boxBoosters(e)).toHaveLength(BOX_PACKS);
    expect(size(e.side)).toBeGreaterThan(BOX_PACKS * 12);
    expect(boxPool(e)).toEqual(boxPool({ seed: 7, set: 'fdn' }));
    expect(Object.keys(e.side).some((n) => n === 'Forest' || n === 'Plains')).toBe(false);
  });

  it('offers the box’s legends, or five random ones of the set when it has none', () => {
    for (const set of ALL_PACK_SETS) {
      const e = started(11, set).event!;
      const { names, gifted } = commanderChoices(e);
      expect(names.length, set).toBeGreaterThan(0);
      expect(names.every(canCommand), set).toBe(true);
      if (gifted) expect(names, set).toHaveLength(LEGEND_CHOICES);
      else
        expect(
          names.every((n) => e.side[n]),
          set,
        ).toBe(true);
    }
    // A box with no legend: every legend of the set left out of a made-up empty box.
    const legends = packSetCards('fdn').filter(canCommand);
    expect(legends.length).toBeGreaterThanOrEqual(LEGEND_CHOICES);
  });

  it('gives a legend-less box five distinct legends of its set, the same for a seed', () => {
    for (const set of ALL_PACK_SETS) {
      const names = giftedLegends({ seed: 4, set });
      expect(new Set(names).size, set).toBe(LEGEND_CHOICES);
      expect(names.every(canCommand), set).toBe(true);
      expect(giftedLegends({ seed: 4, set }), set).toEqual(names);
    }
    const fdn = new Set(packSetCards('fdn'));
    expect(giftedLegends({ seed: 9, set: 'fdn' }).every((n) => fdn.has(n))).toBe(true);
    expect(giftedLegends({ seed: 9, set: 'fdn' })).not.toEqual(
      giftedLegends({ seed: 10, set: 'fdn' }),
    );
  });
});

describe('Box Brawl deck', () => {
  it('takes the commander out of the pool and keeps the deck in its colour identity', () => {
    const s = started();
    const e = s.event!;
    const c = commanderChoices(e).names[0]!;
    const before = e.side[c]!;
    const t = chooseCommander(s, c).event!;
    expect(t.commander).toBe(c);
    expect(t.side[c] ?? 0).toBe(before - 1);
    expect(chooseCommander(s, 'Llanowar Elves')).toBe(s);
    const legal = legalSide(t);
    expect(Object.keys(legal).every((n) => fits(n, identityOf(c)))).toBe(true);
  });

  it('suggests a legal 59: commander colours only, no basics in the pool', () => {
    for (const seed of [3, 5, 8]) {
      const e = built(seed).event!;
      const identity = identityOf(e.commander!);
      expect(size(e.main), `seed ${seed}`).toBe(BOX_MAIN);
      expect(Object.keys(e.main).every((n) => fits(n, identity))).toBe(true);
      expect(e.main[e.commander!] ?? 0).toBe(0);
      expect(canPlay(e)).toBe(true);
      // Every non-basic card is in the deck or the pool, once.
      const pool = boxPool(e);
      for (const [n, k] of Object.entries(pool)) {
        const used = (e.main[n] ?? 0) + (e.side[n] ?? 0) + (n === e.commander ? 1 : 0);
        expect(used, n).toBe(k);
      }
    }
  });

  it('refuses cards outside the identity and drops them when the commander changes', () => {
    let s = built();
    const e = s.event!;
    const off = Object.keys(e.side).find((n) => !fits(n, identityOf(e.commander!)));
    if (off) expect(moveBoxCard(s, off, 'main')).toBe(s);
    const other = commanderChoices(e).names.find(
      (n) => identityOf(n).join() !== identityOf(e.commander!).join(),
    );
    if (!other) return;
    s = chooseCommander(s, other);
    const t = s.event!;
    expect(Object.keys(t.main).every((n) => fits(n, identityOf(other)))).toBe(true);
    // The old commander is back in the pool.
    expect(t.side[e.commander!]).toBeGreaterThan(0);
  });

  it('ranks every legend by the deck it makes', () => {
    const e = started().event!;
    const ranked = rankCommanders(e);
    expect([...ranked].sort()).toEqual([...commanderChoices(e).names].sort());
    expect(rankCommanders(e)).toBe(ranked);
  });

  it('gives deck tips sized for 59 cards and 24 lands', () => {
    const e = built().event!;
    const b = { main: e.main, side: {}, opened: 0, packs: [], fresh: [] };
    const deck = { size: BOX_MAIN, lands: BOX_LANDS };
    expect(deckAdvice(b, deck).some((t) => /lands/.test(t))).toBe(false);
    expect(deckAdvice(b, deck).some((t) => /toward 40/.test(t))).toBe(false);
    const flood = { ...b, main: { ...e.main, Plains: (e.main.Plains ?? 0) + 10 } };
    expect(deckAdvice(flood, deck).join(' ')).toMatch(/lands is a lot/);
  });

  it('makes a Brawl decklist with the commander', () => {
    const e = built().event!;
    const d = boxPlayerDeck(e)!;
    expect(d.series).toBe('brawl');
    expect(d.commander).toBe(e.commander);
    expect(d.cards.reduce((k, [, n]) => k + n, 0)).toBe(BOX_MAIN);
  });
});

describe('Box Brawl opponents', () => {
  it('build a legal deck around a legend from their own box', () => {
    const e = built().event!;
    for (const n of [0, 1, 2]) {
      const { deck, bot } = boxOpponent(e, n);
      expect(['easy', 'heuristic', 'search']).toContain(bot);
      expect(canCommand(deck.commander!)).toBe(true);
      expect(deck.cards.reduce((k, [, c]) => k + c, 0)).toBe(BOX_MAIN);
      expect(deck.cards.every(([c]) => fits(c, identityOf(deck.commander!)))).toBe(true);
    }
    expect(boxOpponent(e, 0).deck.id).not.toBe(boxOpponent(e, 1).deck.id);
  });

  it('play a whole Brawl game against your deck', () => {
    const engine = createEngine(cardDb);
    const e = built(21).event!;
    const you = boxPlayerDeck(e)!;
    const foe = boxOpponent(e, 0).deck;
    for (const d of [you, foe])
      for (const [c] of [...d.cards, [d.commander!, 1] as const])
        expect(cardDb.has(slug(c)), c).toBe(true);
    const initial = engine.newGame({ ...deckGameOptions(you, foe), seed: 5 });
    expect(initial.format).toBe('brawl');
    expect(initial.players.p1.life).toBe(25);
    const r = playRandomGame(engine, initial, 99);
    expect(r.final.decision.kind === 'gameOver' || r.truncated).toBe(true);
  }, 120_000);
});

describe('Box Brawl event', () => {
  it('ends at three wins or two losses and counts only the game it waits on', () => {
    let s = built();
    s = startBoxMatch(s, 100);
    expect(recordBoxMatch(s, 999, 'win')).toBe(s);
    for (let i = 0; i < BOX_WINS; i++) {
      s = startBoxMatch(s, 100 + i);
      s = recordBoxMatch(s, 100 + i, 'win');
    }
    expect(statusOf(s.event!)).toBe('won');
    expect(s.records.fdn).toMatchObject({ events: 1, best: BOX_WINS, titles: 1 });

    let t = built();
    for (let i = 0; i < BOX_LOSSES; i++) t = recordBoxMatch(startBoxMatch(t, i), i, 'loss');
    expect(statusOf(t.event!)).toBe('out');
    expect(resignBox(built()).event!.finished).toBe(true);
  });

  it('saves and loads, dropping a broken event', () => {
    const store = new Map<string, string>();
    Object.assign(globalThis, {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    const s = built();
    saveBox(s);
    expect(loadBox()).toEqual(s);
    store.set('mtg.boxBrawl.v1', JSON.stringify({ v: 1, event: { id: 1 }, records: {} }));
    expect(loadBox().event).toBeNull();
    Object.assign(globalThis, { localStorage: undefined });
    expect(loadBox()).toEqual(emptyBox());
  });
});
