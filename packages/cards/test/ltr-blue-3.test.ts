import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { slug } from '../src/build.ts';
import { all, cast, game, n } from './blb-helpers.ts';
import { activate, done, exile, gy, hand, library, nextTurn, onStack } from './ecl-blue-helpers.ts';

// The Lord of the Rings 21b: the blue cards, part 3 (spells and the Saga).

const id = slug;
const LORIEN = id('Lórien Revealed');
const TRICKERY = id("Saruman's Trickery");
const GIFT = id("Arwen's Gift");
const ISOLATION = id('Isolation at Orthanc');
const COUNCIL = id("Council's Deliberation");
const GALE = id('Glorious Gale');
const BATH = id('The Bath Song');
const HORSES = id('Horses of the Bruinen');
const BILL = id('Bill Ferny, Bree Swindler');
const ELROND = id('Elrond, Lord of Rivendell');
const CAPTAIN = id('Captain of Umbar');
const PELARGIR = id('Pelargir Survivor');

describe('Lórien Revealed', () => {
  it('draws three cards', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [LORIEN], library: n('forest', 6) },
    });
    cast(g, LORIEN);
    done(g);
    expect(hand(g)).toHaveLength(3);
  });

  it('Islandcycling {1}: discard it, search for an Island, put it into your hand', () => {
    const g = game({
      p1: { battlefield: ['island'], hand: [LORIEN], library: ['forest', 'island', 'forest'] },
    });
    activate(g, g.id('p1', LORIEN, 'hand'), 0);
    done(g);
    expect(gy(g)).toEqual([LORIEN]);
    expect(hand(g)).toEqual(['island']);
    expect(library(g)).toHaveLength(2);
    expect(library(g)).not.toContain('island');
  });
});

describe("Saruman's Trickery", () => {
  it('counters target spell, then amasses Orcs 1', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: ['quick-study', TRICKERY], library: n('forest', 5) },
    });
    cast(g, 'quick-study');
    const qs = g.id('p1', 'quick-study', 'stack');
    cast(g, TRICKERY, [onStack(g, qs)]);
    done(g);
    expect(gy(g)).toContain('quick-study');
    // Quick Study did not resolve: nothing drawn.
    expect(hand(g)).toHaveLength(0);
    const armies = all(g, 'ltr-orc-army-token');
    expect(armies).toHaveLength(1);
    const army = g.obj(armies[0]!);
    expect(army.plusOneCounters).toBe(1);
  });

  it('with an Army already, it gets the counter instead of a new token', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 6), { card: 'ltr-orc-army-token' }],
        hand: ['quick-study', TRICKERY],
      },
    });
    const army = g.id('p1', 'ltr-orc-army-token');
    g.obj(army).plusOneCounters = 2;
    g.obj(army).isToken = true;
    cast(g, 'quick-study');
    cast(g, TRICKERY, [onStack(g, g.id('p1', 'quick-study', 'stack'))]);
    done(g);
    expect(all(g, 'ltr-orc-army-token')).toHaveLength(1);
    expect(g.obj(army).plusOneCounters).toBe(3);
  });
});

describe("Arwen's Gift", () => {
  it('scry 2, then draw two cards', () => {
    const g = game({
      p1: { battlefield: n('island', 4), hand: [GIFT], library: n('forest', 6) },
    });
    cast(g, GIFT);
    for (let i = 0; i < 4 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(library(g)).toHaveLength(4);
  });

  it('costs {1} less with two or more legendary creatures', () => {
    const castable = (battlefield: string[]) => {
      const g = game({
        p1: { battlefield: [...battlefield, ...n('island', 3)], hand: [GIFT], library: n('forest', 6) },
      });
      return g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === GIFT);
    };
    expect(castable([])).toBe(false);
    expect(castable([BILL])).toBe(false);
    expect(castable([BILL, ELROND])).toBe(true);
    // Two nonlegendary creatures don't count.
    expect(castable([CAPTAIN, CAPTAIN])).toBe(false);
  });
});

describe('Isolation at Orthanc', () => {
  it('puts the creature into its owner’s library second from the top', () => {
    const g = game({
      p1: { battlefield: n('island', 4), hand: [ISOLATION] },
      p2: { battlefield: ['serra-angel'], library: ['forest', 'island', 'forest'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, ISOLATION, [g.ref(angel)]);
    done(g);
    const lib = g.state.players.p2.library.map((x) => g.obj(x).defId);
    expect(lib).toEqual(['forest', 'serra-angel', 'island', 'forest']);
  });
});

describe("Council's Deliberation", () => {
  it('draws a card', () => {
    const g = game({
      p1: { battlefield: ['island', 'island'], hand: [COUNCIL], library: n('forest', 3) },
    });
    cast(g, COUNCIL);
    done(g);
    expect(hand(g)).toEqual(['forest']);
    expect(gy(g)).toEqual([COUNCIL]);
  });

  const scryWithOpt = (g: GameDriver) => {
    cast(g, 'opt');
    for (let i = 0; i < 6 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((a) => a.type === 'scry')!);
  };

  it('whenever you scry, with an Island, you may exile it from the graveyard to draw a card', () => {
    const g = game({
      p1: { battlefield: ['island'], hand: ['opt'], graveyard: [COUNCIL], library: n('forest', 6) },
    });
    scryWithOpt(g);
    done(g, { accept: true });
    expect(exile(g)).toEqual([COUNCIL]);
    expect(gy(g)).not.toContain(COUNCIL);
    // Opt drew one and the Deliberation one more.
    expect(hand(g)).toHaveLength(2);
  });

  it('you may decline', () => {
    const g = game({
      p1: { battlefield: ['island'], hand: ['opt'], graveyard: [COUNCIL], library: n('forest', 6) },
    });
    scryWithOpt(g);
    done(g, { accept: false });
    expect(gy(g)).toContain(COUNCIL);
    expect(hand(g)).toHaveLength(1);
  });

  it("doesn't trigger without an Island", () => {
    const g = game({
      p1: {
        battlefield: [PELARGIR],
        hand: ['opt'],
        graveyard: [COUNCIL],
        library: n('forest', 6),
      },
    });
    scryWithOpt(g);
    done(g, { accept: true });
    expect(gy(g)).toContain(COUNCIL);
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Glorious Gale', () => {
  it('counters target creature spell; a legendary one tempts you with the Ring', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ELROND, GALE] },
    });
    cast(g, ELROND);
    cast(g, GALE, [onStack(g, g.id('p1', ELROND, 'stack'))]);
    done(g);
    expect(gy(g)).toContain(ELROND);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
  });

  it('a nonlegendary creature spell is countered without a temptation', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [CAPTAIN, GALE] },
    });
    cast(g, CAPTAIN);
    cast(g, GALE, [onStack(g, g.id('p1', CAPTAIN, 'stack'))]);
    done(g);
    expect(gy(g)).toContain(CAPTAIN);
    expect(g.state.players.p1.ring?.tempted ?? 0).toBe(0);
  });

  it("can't target a noncreature spell", () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: ['quick-study', GALE] },
    });
    cast(g, 'quick-study');
    const qs = g.id('p1', 'quick-study', 'stack');
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            g.obj(a.card).defId === GALE &&
            a.targets.some((t) => 'object' in t && t.object.id === qs),
        ),
    ).toBe(false);
  });
});

/** Passes priority (taking default choices) until a trigger asks for its targets. */
const toTriggerTargets = (g: GameDriver) => {
  for (let i = 0; i < 200 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('chooseTriggerTargets');
};

describe('The Bath Song', () => {
  it('chapters I and II: draw two cards, then discard a card', () => {
    const g = game({
      p1: { battlefield: n('island', 4), hand: [BATH], library: n('forest', 8) },
    });
    cast(g, BATH);
    done(g);
    expect(g.obj(g.id('p1', BATH)).counters?.lore).toBe(1);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
    nextTurn(g);
    nextTurn(g);
    done(g);
    expect(g.obj(g.id('p1', BATH)).counters?.lore).toBe(2);
    // Drew for the turn (1), then the chapter: +2 -1.
    expect(hand(g)).toHaveLength(1 + 1 + 2 - 1);
  });

  const atChapterIII = (graveyard: string[]) => {
    const g = game({
      p1: { battlefield: [BATH], graveyard, library: n('forest', 8) },
    });
    g.obj(g.id('p1', BATH)).counters = { lore: 2 };
    toTriggerTargets(g);
    return g;
  };

  it('chapter III: shuffle any number of target cards from your graveyard into your library, add {U}{U}', () => {
    const g = atChapterIII(['island', 'opt', 'quick-study']);
    const libBefore = library(g).length;
    // Pick two of the three cards, one at a time, then done.
    const opt = g.id('p1', 'opt', 'graveyard');
    const island = g.id('p1', 'island', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(opt)] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(opt), g.ref(island)] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(opt), g.ref(island)] });
    done(g);
    expect(gy(g).sort()).toEqual([BATH, 'quick-study'].sort());
    expect(library(g)).toHaveLength(libBefore + 2);
    expect(library(g)).toContain('opt');
    expect(library(g)).toContain('island');
    // {U}{U} in the pool (the main phase has not ended).
    expect(g.state.players.p1.pool?.filter((m) => m.produces.includes('U'))).toHaveLength(2);
    // The Saga is sacrificed after chapter III resolves.
    expect(g.zoneOf(g.id('p1', BATH, 'graveyard'))).toBe('graveyard');
  });

  it('chapter III works with no targets: the mana is still added', () => {
    const g = atChapterIII(['island']);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    done(g);
    expect(gy(g)).toContain('island');
    expect(g.state.players.p1.pool).toHaveLength(2);
  });

  it('chapter III can target every card in the graveyard', () => {
    const g = atChapterIII(['island', 'opt', 'quick-study']);
    for (let i = 0; i < 3; i++) {
      const next = g
        .legal()
        .filter((a) => a.type === 'chooseTargets')
        .sort((a, b) => b.targets.length - a.targets.length)[0]!;
      g.do(next);
    }
    // Nothing left to add: done.
    g.do(g.legal().find((a) => a.type === 'chooseTargets')!);
    done(g);
    expect(gy(g)).toEqual([BATH]);
  });
});

describe('Horses of the Bruinen', () => {
  const pickedOf = (g: GameDriver) => {
    const d = g.decision;
    return d.kind === 'spellTargets' ? d.picked : [];
  };

  it('returns up to two target creatures to their owners’ hands, scry 1, the Ring tempts you', () => {
    const g = game({
      p1: { battlefield: [...n('island', 5), 'savannah-lions'], hand: [HORSES], library: n('forest', 6) },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    const elves = g.id('p2', 'llanowar-elves');
    cast(g, HORSES);
    expect(g.decision.kind).toBe('spellTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [...pickedOf(g), g.ref(elves)] });
    // Two targets: only "done" is left.
    expect(g.legal()).toHaveLength(1);
    g.do({ type: 'chooseTargets', player: 'p1', targets: pickedOf(g) });
    done(g);
    expect(hand(g, 'p2').sort()).toEqual(['llanowar-elves', 'serra-angel']);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.state.players.p1.ring?.tempted).toBe(1);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(lions);
  });

  it('can be cast with no targets (the Ring tempts you anyway)', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [HORSES], library: n('forest', 6) },
    });
    cast(g, HORSES);
    g.do({ type: 'chooseTargets', player: 'p1', targets: pickedOf(g) });
    done(g);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
  });
});
