import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { done, hand, nextTurn, stun, targeting } from './ecl-blue-helpers.ts';

// Wilds of Eldraine (23b): the blue instants, sorceries and Sagas.

const ISLANDS = (k: number) => n('island', k);
const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);
type Cast = Extract<Action, { type: 'castSpell' }>;
/** The cast actions for a card in hand (of the acting player), optionally those that target `target`. */
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

describe('Farsight Ritual', () => {
  const lib = [
    'island',
    'forest',
    'plains',
    'swamp',
    'mountain',
    'island',
    'forest',
    'plains',
    'swamp',
    'mountain',
  ];
  it('looks at the top four, puts exactly two into your hand and the rest on the bottom', () => {
    const g = game({
      p1: { hand: ['farsight-ritual'], battlefield: ISLANDS(4), library: [...lib] },
    });
    const top = g.state.players.p1.library.slice(0, 4);
    g.do(castsOf(g, 'farsight-ritual')[0]!);
    settle(g);
    // First pick: no "find nothing" option.
    expect(g.decision.kind).toBe('searchLibrary');
    const first = g.legal().filter((a) => a.type === 'chooseCard');
    expect(first.some((a) => a.type === 'chooseCard' && a.card === null)).toBe(false);
    const pick1 = first.find((a) => a.type === 'chooseCard' && a.card === top[1])!;
    g.do(pick1);
    expect(g.decision.kind).toBe('searchLibrary');
    const second = g.legal().filter((a) => a.type === 'chooseCard');
    expect(second.some((a) => a.type === 'chooseCard' && a.card === null)).toBe(false);
    g.do(second.find((a) => a.type === 'chooseCard' && a.card === top[2])!);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.hand.slice().sort()).toEqual([top[1], top[2]].sort());
    // The two others went to the bottom; the six unseen cards are on top in order.
    const l = g.state.players.p1.library;
    expect(l.length).toBe(8);
    expect(l.slice(0, 6)).toEqual(g.state.players.p1.library.slice(0, 6));
    expect(l.slice(-2).sort()).toEqual([top[0], top[3]].sort());
  });
  it('bargained, looks at the top eight instead', () => {
    const g = game({
      p1: {
        hand: ['farsight-ritual'],
        battlefield: [...ISLANDS(4), 'food-token'],
        library: [...lib],
      },
    });
    const top = g.state.players.p1.library.slice(0, 8);
    const food = idOf(g, 'food-token');
    const bargained = castsOf(g, 'farsight-ritual').find((a) => a.kicked && a.sacrifice === food)!;
    expect(bargained).toBeDefined();
    g.do(bargained);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().flatMap((a) => (a.type === 'chooseCard' && a.card ? [a.card] : []));
    // One option per distinct card among the eight.
    expect(options.every((c) => top.includes(c))).toBe(true);
    expect(g.obj(food).zone).not.toBe('battlefield');
    const pickDef = (defId: string) =>
      g.do(
        g.legal().find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === defId)!,
      );
    // Mountain is the fifth card: only reachable because the top eight are looked at.
    pickDef('mountain');
    pickDef('swamp');
    expect(hand(g).sort()).toEqual(['mountain', 'swamp']);
    expect(g.state.players.p1.library.length).toBe(8);
    // The two cards after the eight stay on top, the six not taken go to the bottom.
    expect(g.state.players.p1.library.slice(0, 2).map((id) => g.obj(id).defId)).toEqual([
      'swamp',
      'mountain',
    ]);
  });
  it('unbargained it looks at four only: the fifth card stays on top', () => {
    const g = game({
      p1: { hand: ['farsight-ritual'], battlefield: ISLANDS(4), library: [...lib] },
    });
    const fifth = g.state.players.p1.library[4]!;
    g.do(castsOf(g, 'farsight-ritual')[0]!);
    settle(g);
    const opts = g.legal().flatMap((a) => (a.type === 'chooseCard' && a.card ? [a.card] : []));
    expect(opts).not.toContain(fifth);
    for (let i = 0; i < 2; i++) g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    expect(g.state.players.p1.library[0]).toBe(fifth);
  });
});

describe('Freeze in Place', () => {
  it('taps target creature an opponent controls, puts three stun counters on it, then scry 2', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: ISLANDS(2), library: n('forest', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    // Only an opponent's creature is a legal target.
    g.do(castsOf(g, 'freeze-in-place', angel)[0]!);
    settle(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(3);
    expect(g.decision.kind).toBe('scry');
    if (g.decision.kind === 'scry') expect(g.decision.cards.length).toBe(2);
    done(g);
    // It stays tapped through the next untap steps while counters last.
    nextTurn(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(2);
  });
  it('cannot target your own creature', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: [...ISLANDS(2), 'savannah-lions'] },
    });
    expect(castsOf(g, 'freeze-in-place')).toEqual([]);
  });
});

describe("Gadwick's First Duel", () => {
  const saga = () =>
    game({
      p1: {
        hand: ['gadwicks-first-duel'],
        battlefield: [...ISLANDS(2), 'savannah-lions'],
        library: n('forest', 10),
      },
      p2: { battlefield: ['serra-angel'] },
    });
  it('I: creates a Cursed Role token attached to up to one target creature', () => {
    const g = saga();
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    cast(g, 'gadwicks-first-duel');
    done(g, { pick: targeting(angel) });
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(all(g, 'woe-cursed-role').length).toBe(1);
  });
  it('I: with no target nothing happens', () => {
    const g = saga();
    cast(g, 'gadwicks-first-duel');
    done(g, {
      pick: (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0),
    });
    expect(all(g, 'woe-cursed-role').length).toBe(0);
    expect(g.obj(idOf(g, 'gadwicks-first-duel')).counters?.lore).toBe(1);
  });
  it('II: scry 2 on the next turn', () => {
    const g = saga();
    cast(g, 'gadwicks-first-duel');
    done(g, { pick: targeting(idOf(g, 'serra-angel', 'battlefield', 'p2')) });
    nextTurn(g);
    nextTurn(g);
    expect(g.obj(idOf(g, 'gadwicks-first-duel')).counters?.lore).toBe(2);
    expect(g.decision.kind).toBe('priority');
  });
  it('III: the next instant or sorcery with mana value 3 or less this turn is copied (once)', () => {
    const g = game({
      p1: {
        hand: ['freeze-in-place', 'freeze-in-place', 'misleading-motes'],
        battlefield: [...ISLANDS(8), 'gadwicks-first-duel', 'savannah-lions'],
        library: n('forest', 10),
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'llanowar-elves'] },
    });
    g.obj(idOf(g, 'gadwicks-first-duel')).counters = { lore: 2 };
    nextTurn(g);
    nextTurn(g);
    done(g);
    expect(g.state.turn.activePlayer).toBe('p1');
    // A spell with mana value 4 is not copied and does not use the delayed trigger up.
    const elves = idOf(g, 'llanowar-elves', 'battlefield', 'p2');
    cast(g, 'misleading-motes', [tgt(g, elves)]);
    done(g);
    expect(g.state.stack.length).toBe(0);
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    cast(g, 'freeze-in-place', [tgt(g, angel)]);
    // The copy: choose a new target for it (Savannah Lions).
    done(g, { option: /Savannah Lions/ });
    expect(stun(g, angel)).toBe(3);
    expect(stun(g, lions)).toBe(3);
    // Only the next one: a second Freeze in Place is not copied.
    cast(g, 'freeze-in-place', [tgt(g, angel)]);
    done(g);
    expect(stun(g, angel)).toBe(6);
    expect(stun(g, lions)).toBe(3);
  });
});
