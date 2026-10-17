import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';
import {
  done,
  exile,
  gy,
  hand,
  keywords,
  library,
  nextTurn,
  stun,
  toAttackers,
} from './ecl-blue-helpers.ts';

// Wilds of Eldraine (23b): the blue spells, part 2 (counters, bounce, library, pumps).

const ISLANDS = (k: number) => n('island', k);
const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);
type Cast = Extract<Action, { type: 'castSpell' }>;
/** The cast actions for a card in hand of the acting player, optionally those that target `target`. */
const castsOf = (g: GameDriver, defId: string, target?: string): Cast[] =>
  g
    .legal()
    .filter(
      (a): a is Cast =>
        a.type === 'castSpell' &&
        !a.back &&
        a.card === g.id(g.actor, defId, 'hand') &&
        (target === undefined || a.targets.some((t) => 'object' in t && t.object.id === target)),
    );

/** p2 casts Savannah Lions and p1 gets priority with it on the stack; returns the Lions' id. */
const lionsOnStack = (g: GameDriver): string => {
  cast(g, 'savannah-lions');
  const lions = g.state.stack[0]!.id;
  g.pass();
  expect(g.actor).toBe('p1');
  return lions;
};

describe('Ice Out', () => {
  const setup = (p1battlefield: string[]) =>
    game({
      active: 'p2',
      p1: { hand: ['ice-out'], battlefield: p1battlefield },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
  it('counters target spell for {1}{U}{U}', () => {
    const g = setup(ISLANDS(3));
    const lions = lionsOnStack(g);
    g.do(castsOf(g, 'ice-out', lions)[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(all(g, 'savannah-lions').length).toBe(0);
  });
  it('costs {1} less if it is bargained: two Islands and a Food are enough', () => {
    const g = setup([...ISLANDS(2), 'food-token']);
    const lions = lionsOnStack(g);
    const casts = castsOf(g, 'ice-out', lions);
    expect(casts.length).toBeGreaterThan(0);
    // Without the sacrifice it costs {1}{U}{U}: not payable with two Islands.
    expect(casts.every((a) => a.kicked && a.sacrifice === idOf(g, 'food-token'))).toBe(true);
    g.do(casts[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(all(g, 'food-token').length).toBe(0);
  });
  it('can bargain with three Islands too (the sacrifice is a choice)', () => {
    const g = setup([...ISLANDS(3), 'food-token']);
    const lions = lionsOnStack(g);
    const casts = castsOf(g, 'ice-out', lions);
    expect(casts.some((a) => !a.kicked)).toBe(true);
    expect(casts.some((a) => a.kicked)).toBe(true);
  });
});

describe('Spell Stutter', () => {
  const setup = (p2lands: number, faeries: string[]) =>
    game({
      active: 'p2',
      p1: { hand: ['spell-stutter'], battlefield: [...ISLANDS(2), ...faeries] },
      p2: { hand: ['savannah-lions'], battlefield: n('plains', p2lands) },
    });
  it('counters unless its controller pays {2}: they can pay', () => {
    const g = setup(3, []);
    const lions = lionsOnStack(g);
    g.do(castsOf(g, 'spell-stutter', lions)[0]!);
    settle(g);
    expect(g.decision.kind).toBe('payOrCounter');
    done(g, { accept: true });
    // Paid: the Lions resolve.
    expect(all(g, 'savannah-lions').length).toBe(1);
    expect(g.state.stack.length).toBe(0);
  });
  it('pays {2} plus {1} for each Faerie you control; two Faeries make it {4}', () => {
    // Lions cost {W}; the opponent has three Plains left: {4} is out of reach.
    const g = setup(4, ['woe-faerie-token', 'chancellor-of-tales']);
    const lions = lionsOnStack(g);
    g.do(castsOf(g, 'spell-stutter', lions)[0]!);
    settle(g);
    // Not payable: countered at once.
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });
  it('one Faerie makes it {3}: payable with three spare lands', () => {
    const g = setup(4, ['woe-faerie-token']);
    const lions = lionsOnStack(g);
    g.do(castsOf(g, 'spell-stutter', lions)[0]!);
    settle(g);
    expect(g.decision.kind).toBe('payOrCounter');
    if (g.decision.kind === 'payOrCounter') expect(g.decision.cost.generic).toBe(3);
  });
  it('with no spare mana the spell is countered', () => {
    const g = setup(1, []);
    const lions = lionsOnStack(g);
    g.do(castsOf(g, 'spell-stutter', lions)[0]!);
    settle(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });
});

describe('Into the Fae Court', () => {
  it('draws three cards and creates a 1/1 blue Faerie with flying', () => {
    const g = game({
      p1: { hand: ['into-the-fae-court'], battlefield: ISLANDS(5), library: n('forest', 6) },
    });
    cast(g, 'into-the-fae-court');
    done(g);
    expect(handSize(g, 'p1')).toBe(3);
    const faeries = all(g, 'woe-faerie-token');
    expect(faeries.length).toBe(1);
    expect(pt(g, faeries[0]!)).toEqual([1, 1]);
    expect(keywords(g, faeries[0]!).has('flying')).toBe(true);
    expect(g.obj(faeries[0]!).isToken).toBe(true);
    const def = cardDb.get('woe-faerie-token')!;
    expect(def.colors).toEqual(['U']);
    expect(def.subtypes).toEqual(['Faerie']);
  });
  it('the token can block only creatures with flying', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['woe-faerie-token'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    toAttackers(g);
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do({ type: 'addAttacker', player: 'p2', attacker: lions, defender: 'p1' });
    g.do({ type: 'addAttacker', player: 'p2', attacker: angel, defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    const blocks = g.legal().flatMap((a) => (a.type === 'addBlock' ? [a.attacker] : []));
    expect(blocks).toEqual([angel]);
  });
});

describe("Johann's Stopgap", () => {
  const setup = (battlefield: string[]) =>
    game({
      p1: { hand: ['johanns-stopgap'], battlefield, library: n('forest', 5) },
      p2: { battlefield: ['serra-angel', 'plains'] },
    });
  it("returns target nonland permanent to its owner's hand and draws a card ({3}{U})", () => {
    const g = setup(ISLANDS(4));
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'johanns-stopgap', angel)[0]!);
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['forest']);
  });
  it('cannot target a land', () => {
    const g = setup(ISLANDS(4));
    expect(castsOf(g, 'johanns-stopgap', idOf(g, 'plains', 'battlefield', 'p2'))).toEqual([]);
  });
  it('bargained it costs {2} less: {1}{U} and a Food are enough', () => {
    const g = setup([...ISLANDS(2), 'food-token']);
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const casts = castsOf(g, 'johanns-stopgap', angel);
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.kicked)).toBe(true);
    g.do(casts[0]!);
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['forest']);
    expect(all(g, 'food-token').length).toBe(0);
  });
  it('without the sacrifice two Islands do not pay for it', () => {
    const g = setup(ISLANDS(2));
    expect(castsOf(g, 'johanns-stopgap')).toEqual([]);
  });
});

describe('Misleading Motes', () => {
  it("lets the creature's owner put it on the top or bottom of their library", () => {
    const g = game({
      p1: { hand: ['misleading-motes'], battlefield: ISLANDS(4) },
      p2: { battlefield: ['serra-angel'], library: n('forest', 5) },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(castsOf(g, 'misleading-motes', angel)[0]!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    // The owner, not the caster, chooses.
    expect(g.decision.player).toBe('p2');
    expect(g.decision.options.map((o) => o.label)).toEqual([
      'Top of your library',
      'Bottom of your library',
    ]);
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    expect(library(g, 'p2').slice(-1)).toEqual(['serra-angel']);
    expect(all(g, 'serra-angel').length).toBe(0);
  });
  it('top works too, and any creature may be targeted (even your own)', () => {
    const g = game({
      p1: { hand: ['misleading-motes'], battlefield: [...ISLANDS(4), 'savannah-lions'] },
      p2: { library: n('forest', 5) },
    });
    const lions = idOf(g, 'savannah-lions');
    g.do(castsOf(g, 'misleading-motes', lions)[0]!);
    settle(g);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(library(g)[0]).toBe('savannah-lions');
  });
});

describe('Lagoon Breach (Horned Loch-Whale)', () => {
  it("the owner of target attacking creature you don't control puts it on top or bottom of their library", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['horned-loch-whale'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'], library: n('forest', 5) },
    });
    toAttackers(g);
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do({ type: 'addAttacker', player: 'p2', attacker: lions, defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    // p1 has priority in the declare attackers step.
    for (let i = 0; i < 5 && g.actor !== 'p1'; i++) g.pass();
    expect(g.actor).toBe('p1');
    const breach = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' && a.back && a.card === g.id('p1', 'horned-loch-whale', 'hand'),
      );
    // Only the attacking creature is a legal target.
    expect(breach.flatMap((a) => (a.type === 'castSpell' ? a.targets : []))).toEqual([
      tgt(g, lions),
    ]);
    void angel;
    g.do(breach[0]!);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.player).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    expect(library(g, 'p2').slice(-1)).toEqual(['savannah-lions']);
    expect(exile(g)).toEqual(['horned-loch-whale']);
  });
});

describe('Horned Loch-Whale', () => {
  it('has flash, ward {2}, and is a 6/6', () => {
    const def = cardDb.get('horned-loch-whale')!;
    expect(def.keywords).toEqual(expect.arrayContaining(['flash', 'ward']));
    expect(def.wardCost).toEqual({ mana: { generic: 2, colored: {} } });
    expect(def.power).toBe(6);
    expect(def.toughness).toBe(6);
  });
  it('enters untapped on your turn', () => {
    const g = game({ p1: { hand: ['horned-loch-whale'], battlefield: ISLANDS(6) } });
    cast(g, 'horned-loch-whale');
    done(g);
    expect(g.obj(idOf(g, 'horned-loch-whale')).tapped).toBe(false);
  });
  it("enters tapped on an opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['horned-loch-whale'], battlefield: ISLANDS(6) },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, 'horned-loch-whale');
    done(g);
    expect(g.obj(idOf(g, 'horned-loch-whale')).tapped).toBe(true);
  });
});

describe('Rowdy Research', () => {
  it('costs {7} with no attackers: four Islands are not enough', () => {
    const g = game({ p1: { hand: ['rowdy-research'], battlefield: ISLANDS(4) } });
    expect(castsOf(g, 'rowdy-research')).toEqual([]);
  });
  it('costs {1} less for each creature that attacked this turn (by any player), and draws three', () => {
    const g = game({
      p1: {
        hand: ['rowdy-research'],
        battlefield: [...ISLANDS(4), 'savannah-lions', 'savannah-lions', 'savannah-lions'],
        library: n('forest', 5),
      },
    });
    toAttackers(g);
    for (const id of g.state.battlefield.filter((i) => g.obj(i).defId === 'savannah-lions'))
      g.do({ type: 'addAttacker', player: 'p1', attacker: id, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 4 && castsOf(g, 'rowdy-research').length === 0; i++) g.pass();
    // {6}{U} less three: four Islands pay for it.
    const casts = castsOf(g, 'rowdy-research');
    expect(casts.length).toBeGreaterThan(0);
    g.do(casts[0]!);
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest', 'forest']);
  });
  it('two attackers are not enough for four Islands', () => {
    const g = game({
      p1: {
        hand: ['rowdy-research'],
        battlefield: [...ISLANDS(4), 'savannah-lions', 'savannah-lions'],
      },
    });
    toAttackers(g);
    for (const id of g.state.battlefield.filter((i) => g.obj(i).defId === 'savannah-lions'))
      g.do({ type: 'addAttacker', player: 'p1', attacker: id, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 4; i++) {
      expect(castsOf(g, 'rowdy-research')).toEqual([]);
      g.pass();
    }
  });
});

describe('Succumb to the Cold', () => {
  it('taps one or two target creatures an opponent controls and puts a stun counter on each', () => {
    const g = game({
      p1: { hand: ['succumb-to-the-cold', 'succumb-to-the-cold'], battlefield: ISLANDS(6) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    const casts = castsOf(g, 'succumb-to-the-cold');
    const sizes = new Set(casts.map((a) => a.targets.length));
    expect([...sizes].sort()).toEqual([1, 2]);
    g.do(casts.find((a) => a.targets.length === 2)!);
    settle(g);
    expect(g.obj(angel).tapped && g.obj(lions).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
    expect(stun(g, lions)).toBe(1);
  });
  it('one target works as well', () => {
    const g = game({
      p1: { hand: ['succumb-to-the-cold'], battlefield: ISLANDS(3) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const one = castsOf(g, 'succumb-to-the-cold').find(
      (a) =>
        a.targets.length === 1 && 'object' in a.targets[0]! && a.targets[0].object.id === angel,
    )!;
    g.do(one);
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
    expect(g.obj(idOf(g, 'savannah-lions', 'battlefield', 'p2')).tapped).toBe(false);
  });
  it("only opponents' creatures", () => {
    const g = game({
      p1: { hand: ['succumb-to-the-cold'], battlefield: [...ISLANDS(3), 'savannah-lions'] },
    });
    expect(castsOf(g, 'succumb-to-the-cold')).toEqual([]);
  });
});

describe('Water Wings', () => {
  it('base power and toughness 4/4, flying and hexproof until end of turn', () => {
    const g = game({
      p1: { hand: ['water-wings'], battlefield: [...ISLANDS(2), 'savannah-lions'] },
    });
    const lions = idOf(g, 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    cast(g, 'water-wings', [tgt(g, lions)]);
    done(g);
    // Base 4/4, and the +1/+1 counter still applies.
    expect(pt(g, lions)).toEqual([5, 5]);
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(keywords(g, lions).has('hexproof')).toBe(true);
    nextTurn(g);
    nextTurn(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions).has('flying')).toBe(false);
    expect(keywords(g, lions).has('hexproof')).toBe(false);
  });
  it('can only target a creature you control', () => {
    const g = game({
      p1: { hand: ['water-wings'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(castsOf(g, 'water-wings')).toEqual([]);
  });
});
