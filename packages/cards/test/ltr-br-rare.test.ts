import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  board,
  casts,
  chars,
  choose,
  done,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb, slug } from '../src/index.ts';
import { LTR_BLACK_RARE } from '../src/ltr/black-rare.ts';
import { LTR_RED_RARE } from '../src/ltr/red-rare.ts';

// The Lord of the Rings 21d: the black and red rares of the random slot (part one: black).

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'ltr-orc-army-token';
const LIONS = 'savannah-lions';
const ELVES = 'llanowar-elves';
const BALOTH = 'rumbling-baloth';
const GOTHMOG = 'gothmog-morgul-lieutenant';
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
const bearer = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.bearer?.id;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].library;
const setBearer = (g: GameDriver, id: string, p: 'p1' | 'p2' = 'p1') => {
  g.state.players[p].ring = { tempted: 1, bearer: { id, zcc: g.obj(id).zcc } };
};

it('every black and red rare of the group is in the card pool', () => {
  for (const name of [...Object.keys(LTR_BLACK_RARE), ...Object.keys(LTR_RED_RARE)])
    expect(cardDb.has(slug(name)), name).toBe(true);
  expect(Object.keys(LTR_BLACK_RARE)).toHaveLength(8);
  expect(Object.keys(LTR_RED_RARE)).toHaveLength(8);
});

describe('Call of the Ring', () => {
  const CALL = 'call-of-the-ring';
  const setup = (life = 20) =>
    game({
      p1: { battlefield: [CALL, LIONS], library: n('forest', 8), life },
      active: 'p2',
    });

  it('at the beginning of your upkeep, the Ring tempts you', () => {
    const g = setup();
    passTo(g, 'upkeep', 'p1');
    done(g, { accept: false });
    expect(ringLevel(g)).toBe(1);
    expect(bearer(g)).toBe(g.id('p1', LIONS));
  });

  it('choosing a Ring-bearer: you may pay 2 life; if you do, draw a card', () => {
    const g = setup();
    passTo(g, 'upkeep', 'p1');
    const before = hand(g).length;
    done(g, { accept: true });
    expect(g.life('p1')).toBe(18);
    expect(hand(g).length).toBe(before + 1);
  });

  it('declining the payment draws nothing and costs nothing', () => {
    const g = setup();
    passTo(g, 'upkeep', 'p1');
    const before = hand(g).length;
    done(g, { accept: false });
    expect(g.life('p1')).toBe(20);
    expect(hand(g).length).toBe(before);
  });

  it("can't pay 2 life with only 1 life: no prompt, nothing happens", () => {
    const g = setup(1);
    passTo(g, 'upkeep', 'p1');
    done(g, { accept: true });
    expect(g.life('p1')).toBe(1);
    expect(ringLevel(g)).toBe(1);
    expect(hand(g)).toHaveLength(0);
  });

  it('triggers on every choice, not only on the Ring from this card (Claim the Precious)', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [CALL, LIONS, ...n('swamp', 5)] },
      p2: { battlefield: [ELVES] },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', ELVES)))!);
    const before = hand(g).length;
    done(g, { accept: true });
    expect(ringLevel(g)).toBe(1);
    expect(g.life('p1')).toBe(18);
    expect(hand(g).length).toBe(before + 1);
  });

  it("doesn't trigger without a creature to choose", () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [CALL, ...n('swamp', 5)] },
      p2: { battlefield: [ELVES] },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', ELVES)))!);
    done(g, { accept: true });
    expect(ringLevel(g)).toBe(1);
    expect(g.life('p1')).toBe(20);
  });
});

describe("Isildur's Fateful Strike", () => {
  const STRIKE = 'isildurs-fateful-strike';
  const setup = (
    mine: string[],
    theirHand: number | string[] = 7,
    theirs: string[] = [BALOTH],
    myHand: string[] = [],
  ) =>
    game({
      p1: { hand: [STRIKE, ...myHand], battlefield: [...n('swamp', 4), ...mine] },
      p2: {
        battlefield: theirs,
        hand: typeof theirHand === 'number' ? n('forest', theirHand) : theirHand,
      },
    });

  it("can't be cast without a legendary creature or planeswalker", () => {
    const g = setup([LIONS]);
    expect(casts(g, STRIKE)).toHaveLength(0);
  });

  it('can be cast with a legendary creature', () => {
    const g = setup([GOTHMOG]);
    expect(casts(g, STRIKE).length).toBeGreaterThan(0);
  });

  it('can be cast with a legendary planeswalker', () => {
    const g = setup(['vivien-reid']);
    expect(casts(g, STRIKE).length).toBeGreaterThan(0);
  });

  it('a Ring-bearer is a legendary creature', () => {
    const g = setup([LIONS]);
    setBearer(g, g.id('p1', LIONS));
    expect(casts(g, STRIKE).length).toBeGreaterThan(0);
  });

  it('destroys the creature; its controller exiles cards from hand down to four (their choice)', () => {
    const g = setup([GOTHMOG], ['forest', 'forest', 'mountain', 'island', 'swamp', 'plains', 'island']);
    expect(hand(g, 'p2')).toHaveLength(7);
    g.do(casts(g, STRIKE).find(targeting(g.id('p2', BALOTH)))!);
    stop(g);
    expect(gy(g, 'p2')).toContain(BALOTH);
    // Three cards over four: the opponent chooses each.
    const d = g.decision;
    expect(d.kind).toBe('chooseOption');
    if (d.kind !== 'chooseOption') return;
    expect(d.player).toBe('p2');
    expect(d.title).toMatch(/exile 3 cards/);
    // The distinct names on offer (identical cards are one option).
    expect(labels(g).sort()).toEqual(
      ['Exile Forest', 'Exile Island', 'Exile Mountain', 'Exile Plains', 'Exile Swamp'].sort(),
    );
    choose(g, /Island/);
    expect((g.decision as { title?: string }).title).toMatch(/exile 2 cards/);
    choose(g, /Island/);
    choose(g, /Forest/);
    done(g);
    expect(hand(g, 'p2')).toHaveLength(4);
    expect(exile(g, 'p2').sort()).toEqual(['forest', 'island', 'island']);
  });

  it('exactly four cards in hand: nothing is exiled', () => {
    const g = setup([GOTHMOG], 4);
    g.do(casts(g, STRIKE).find(targeting(g.id('p2', BALOTH)))!);
    done(g);
    expect(gy(g, 'p2')).toContain(BALOTH);
    expect(hand(g, 'p2')).toHaveLength(4);
    expect(exile(g, 'p2')).toHaveLength(0);
  });

  it('five cards: exiles exactly one, with no choice among equal cards', () => {
    const g = setup([GOTHMOG], 5);
    g.do(casts(g, STRIKE).find(targeting(g.id('p2', BALOTH)))!);
    done(g);
    expect(hand(g, 'p2')).toHaveLength(4);
    expect(exile(g, 'p2')).toEqual(['forest']);
  });

  it('counts the hand of the creature controller, not the caster or the owner', () => {
    const g = setup([GOTHMOG], 7, [], n('mountain', 6));
    expect(hand(g, 'p2')).toHaveLength(7);
    g.do(casts(g, STRIKE).find(targeting(g.id('p1', GOTHMOG)))!);
    done(g);
    // p1 had six cards left after casting: 6 > 4, so p1 exiles two; p2 keeps seven.
    expect(hand(g, 'p2')).toHaveLength(7);
    expect(hand(g, 'p1')).toHaveLength(4);
  });

  it('an indestructible creature survives but its controller still exiles', () => {
    const g = setup([GOTHMOG], 6, ['zetalpa-primal-dawn']);
    g.do(casts(g, STRIKE).find(targeting(g.id('p2', 'zetalpa-primal-dawn')))!);
    done(g);
    expect(board(g, 'zetalpa-primal-dawn')).toHaveLength(1);
    expect(hand(g, 'p2')).toHaveLength(4);
    expect(exile(g, 'p2')).toHaveLength(2);
  });
});

describe('Lobelia Sackville-Baggins', () => {
  const LOBELIA = 'lobelia-sackville-baggins';
  const died = (g: GameDriver, id: string) => {
    g.state.objects[id]!.diedTurn = g.state.turn.number;
  };

  it('has flash and menace', () => {
    const g = game({ p1: { hand: [LOBELIA], battlefield: n('swamp', 3) } });
    expect(kw(g, g.id('p1', LOBELIA, 'hand')).has('flash')).toBe(true);
    expect(kw(g, g.id('p1', LOBELIA, 'hand')).has('menace')).toBe(true);
  });

  it('exiles a creature card that died this turn and makes Treasures equal to its power', () => {
    const g = game({
      p1: { hand: [LOBELIA], battlefield: n('swamp', 3) },
      p2: { graveyard: [BALOTH, ELVES] },
    });
    died(g, g.id('p2', BALOTH, 'graveyard'));
    g.do(casts(g, LOBELIA)[0]!);
    done(g);
    expect(exile(g, 'p2')).toEqual([BALOTH]);
    expect(gy(g, 'p2')).toEqual([ELVES]);
    // Rumbling Baloth is a 4/4.
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(4);
  });

  it("can't target a creature card that was not put there from the battlefield this turn", () => {
    const g = game({
      p1: { hand: [LOBELIA], battlefield: n('swamp', 3) },
      p2: { graveyard: [BALOTH] },
    });
    g.do(casts(g, LOBELIA)[0]!);
    done(g);
    expect(exile(g, 'p2')).toHaveLength(0);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });

  it("can't target your own graveyard", () => {
    const g = game({
      p1: { hand: [LOBELIA], battlefield: n('swamp', 3), graveyard: [BALOTH] },
    });
    died(g, g.id('p1', BALOTH, 'graveyard'));
    g.do(casts(g, LOBELIA)[0]!);
    done(g);
    expect(exile(g, 'p1')).toHaveLength(0);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(0);
  });

  it("can't target a noncreature card", () => {
    const g = game({
      p1: { hand: [LOBELIA], battlefield: n('swamp', 3) },
      p2: { graveyard: ['shock'] },
    });
    died(g, g.id('p2', 'shock', 'graveyard'));
    g.do(casts(g, LOBELIA)[0]!);
    done(g);
    expect(exile(g, 'p2')).toHaveLength(0);
  });

  it('a creature that really died this turn (Shock) can be exiled for its power in Treasures', () => {
    const g = game({
      p1: { hand: ['shock', LOBELIA], battlefield: [...n('swamp', 3), 'mountain'] },
      p2: { battlefield: [ELVES] },
    });
    g.do(casts(g, 'shock').find(targeting(g.id('p2', ELVES)))!);
    done(g);
    expect(gy(g, 'p2')).toEqual([ELVES]);
    g.do(casts(g, LOBELIA)[0]!);
    done(g);
    expect(exile(g, 'p2')).toEqual([ELVES]);
    expect(board(g, 'treasure-token', 'p1')).toHaveLength(1);
  });
});

describe('One Ring to Rule Them All', () => {
  const ONE = 'one-ring-to-rule-them-all';
  const atChapter = (chapter: 2 | 3, p1: string[], p2: string[] = [], gyp2: string[] = []) => {
    const g = game({
      p1: { battlefield: [ONE, ...p1], library: n('forest', 12) },
      p2: { battlefield: p2, graveyard: gyp2, library: n('forest', 12) },
      active: 'p2',
    });
    g.obj(g.id('p1', ONE)).counters = { lore: chapter - 1 };
    passTo(g, 'main1', 'p1');
    done(g);
    return g;
  };

  it("I: the Ring tempts you, then each player mills cards equal to your Ring-bearer's power", () => {
    const g = game({
      p1: { hand: [ONE], battlefield: [...n('swamp', 4), BALOTH], library: n('forest', 12) },
      p2: { library: n('forest', 12) },
    });
    g.do(casts(g, ONE)[0]!);
    done(g);
    expect(ringLevel(g)).toBe(1);
    expect(bearer(g)).toBe(g.id('p1', BALOTH));
    // Rumbling Baloth is a 4/4: both libraries lose four cards.
    expect(library(g, 'p1')).toHaveLength(8);
    expect(library(g, 'p2')).toHaveLength(8);
    expect(gy(g, 'p1').filter((d) => d === 'forest')).toHaveLength(4);
    expect(gy(g, 'p2')).toHaveLength(4);
  });

  it('I with no creature: the Ring still tempts you and nothing is milled', () => {
    const g = game({
      p1: { hand: [ONE], battlefield: n('swamp', 4), library: n('forest', 12) },
      p2: { library: n('forest', 12) },
    });
    g.do(casts(g, ONE)[0]!);
    done(g);
    expect(ringLevel(g)).toBe(1);
    expect(bearer(g)).toBeUndefined();
    expect(library(g, 'p1')).toHaveLength(12);
    expect(library(g, 'p2')).toHaveLength(12);
  });

  it('II: destroys all nonlegendary creatures (legendary ones and the Ring-bearer stay)', () => {
    const g = game({
      p1: { battlefield: [ONE, LIONS, GOTHMOG, BALOTH], library: n('forest', 12) },
      p2: { battlefield: [ELVES, 'arahbo-the-first-fang'], library: n('forest', 12) },
      active: 'p2',
    });
    setBearer(g, g.id('p1', LIONS));
    g.obj(g.id('p1', ONE)).counters = { lore: 1 };
    passTo(g, 'main1', 'p1');
    done(g);
    expect(board(g, BALOTH)).toHaveLength(0);
    expect(board(g, ELVES)).toHaveLength(0);
    // The Ring-bearer is legendary, so it lives.
    expect(board(g, LIONS)).toHaveLength(1);
    expect(board(g, GOTHMOG)).toHaveLength(1);
    expect(board(g, 'arahbo-the-first-fang')).toHaveLength(1);
  });

  it('III: each opponent loses 1 life for each creature card in their graveyard', () => {
    const g = atChapter(3, [], [], [BALOTH, ELVES, 'shock', LIONS]);
    expect(g.life('p2')).toBe(17);
    // The Saga is sacrificed after chapter III.
    expect(board(g, ONE)).toHaveLength(0);
  });

  it("III: your own graveyard doesn't count", () => {
    const g = game({
      p1: { battlefield: [ONE], graveyard: [BALOTH, ELVES], library: n('forest', 12) },
      active: 'p2',
    });
    g.obj(g.id('p1', ONE)).counters = { lore: 2 };
    passTo(g, 'main1', 'p1');
    done(g);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Orcish Bowmasters', () => {
  const BOW = 'orcish-bowmasters';
  const anyTarget = (id: string | 'p1' | 'p2') => (a: Extract<Action, { type: 'chooseTargets' }>) =>
    a.targets.some((t) => ('object' in t ? t.object.id === id : t.player === id));

  it('has flash', () => {
    const g = game({ p1: { hand: [BOW], battlefield: n('swamp', 2) } });
    expect(kw(g, g.id('p1', BOW, 'hand')).has('flash')).toBe(true);
  });

  it('when it enters: 1 damage to any target, then amass Orcs 1', () => {
    const g = game({
      p1: { hand: [BOW], battlefield: n('swamp', 2) },
      p2: { battlefield: [ELVES] },
    });
    g.do(casts(g, BOW)[0]!);
    done(g, { target: anyTarget('p2') });
    expect(g.life('p2')).toBe(19);
    const army = board(g, ARMY, 'p1');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
  });

  it('the damage can kill a creature', () => {
    const g = game({
      p1: { hand: [BOW], battlefield: n('swamp', 2) },
      p2: { battlefield: [ELVES] },
    });
    g.do(casts(g, BOW)[0]!);
    done(g, { target: anyTarget(g.id('p2', ELVES)) });
    expect(gy(g, 'p2')).toEqual([ELVES]);
  });

  it("an opponent's draw step draw (the first one) doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: [BOW] },
      p2: { library: n('forest', 8) },
      active: 'p1',
    });
    passTo(g, 'main1', 'p2');
    expect(g.life('p1')).toBe(20);
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(g.life('p1')).toBe(20);
    expect(board(g, ARMY)).toHaveLength(0);
  });

  it('any other draw of an opponent triggers it (Opt on their own turn)', () => {
    const g = game({
      p1: { battlefield: [BOW] },
      p2: { hand: ['opt'], battlefield: n('island', 2), library: n('forest', 8) },
      active: 'p2',
    });
    g.do(casts(g, 'opt', 'p2')[0]!);
    done(g, { target: anyTarget('p2') });
    expect(g.life('p2')).toBe(19);
    const army = board(g, ARMY, 'p1');
    expect(army).toHaveLength(1);
    expect(g.obj(army[0]!).plusOneCounters).toBe(1);
  });

  it("a draw in the opponent's draw step that is not the draw step's own triggers it too", () => {
    const g = game({
      p1: { battlefield: [BOW] },
      p2: { hand: ['opt'], battlefield: n('island', 2), library: n('forest', 8) },
      active: 'p2',
      step: 'draw',
    });
    g.do(casts(g, 'opt', 'p2')[0]!);
    done(g, { target: anyTarget('p2') });
    expect(g.life('p2')).toBe(19);
  });

  it("an upkeep draw (Phyrexian Arena) triggers it; the draw step's own draw after it doesn't", () => {
    const g = game({
      p1: { battlefield: [BOW] },
      p2: { battlefield: ['phyrexian-arena'], library: n('forest', 8) },
      active: 'p1',
    });
    passTo(g, 'upkeep', 'p2');
    done(g, { target: anyTarget('p2') });
    passTo(g, 'main1', 'p2', { target: anyTarget('p2') });
    done(g, { target: anyTarget('p2') });
    // Arena's draw (upkeep): one trigger. The draw step's draw: none.
    expect(g.life('p2')).toBe(19 - 1);
    expect(hand(g, 'p2')).toHaveLength(2);
  });

  it("your own draws don't trigger it", () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: [BOW, ...n('island', 2)], library: n('forest', 8) },
    });
    g.do(casts(g, 'opt')[0]!);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p2')).toBe(20);
    expect(board(g, ARMY)).toHaveLength(0);
  });
});
