import { describe, expect, it } from 'vitest';
import { LTR_BLUE, LTR_BLUE_BACKS } from '../src/ltr/blue.ts';
import { slug } from '../src/build.ts';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt } from './blb-helpers.ts';
import { activate, done, library } from './ecl-blue-helpers.ts';
import { chars, keywords } from './ecl-blue-helpers.ts';

// The Lord of the Rings 21b: the blue cards, part 1 (creatures).

const id = slug;
const LORIEN = id('Lórien Revealed');
const CAPTAIN = id('Captain of Umbar');

describe('the blue group', () => {
  it('every blue card is in cardDb', () => {
    const names = Object.keys(LTR_BLUE).concat(Object.keys(LTR_BLUE_BACKS));
    expect(names).toHaveLength(22);
    for (const name of names) expect(cardDb.get(id(name)), name).toBeDefined();
  });
});

describe('Ioreth of the Healing House', () => {
  it('{T}: untap another target permanent', () => {
    const g = game({
      p1: { battlefield: ['ioreth-of-the-healing-house', { card: 'island', tapped: true }] },
    });
    const ioreth = g.id('p1', 'ioreth-of-the-healing-house');
    const isl = g.id('p1', 'island');
    activate(g, ioreth, 0, [g.ref(isl)]);
    done(g);
    expect(g.obj(isl).tapped).toBe(false);
    expect(g.obj(ioreth).tapped).toBe(true);
  });

  it("can't untap itself with the first ability", () => {
    const g = game({ p1: { battlefield: ['ioreth-of-the-healing-house'] } });
    const ioreth = g.id('p1', 'ioreth-of-the-healing-house');
    const mine = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === ioreth && a.abilityIndex === 0);
    expect(mine).toHaveLength(0);
  });

  it('{T}: untap two other target legendary creatures', () => {
    const g = game({
      p1: {
        battlefield: [
          'ioreth-of-the-healing-house',
          { card: id('Bill Ferny, Bree Swindler'), tapped: true },
          { card: id('Elrond, Lord of Rivendell'), tapped: true },
          { card: 'savannah-lions', tapped: true },
        ],
      },
    });
    const ioreth = g.id('p1', 'ioreth-of-the-healing-house');
    const bill = g.id('p1', id('Bill Ferny, Bree Swindler'));
    const elrond = g.id('p1', id('Elrond, Lord of Rivendell'));
    const lions = g.id('p1', 'savannah-lions');
    // The only pair of other legendary creatures.
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === ioreth && a.abilityIndex === 1);
    // (Both orders of the pair are listed; neither names Ioreth or the Lions.)
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      if (a.type !== 'activateAbility') continue;
      const ids = a.targets.map((t) => ('object' in t ? t.object.id : ''));
      expect([...ids].sort()).toEqual([bill, elrond].sort());
    }
    g.do(acts[0]!);
    done(g);
    expect(g.obj(bill).tapped).toBe(false);
    expect(g.obj(elrond).tapped).toBe(false);
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.obj(ioreth).tapped).toBe(true);
  });

  it('the second ability needs two other legendary creatures (Ioreth herself is not one)', () => {
    const g = game({
      p1: { battlefield: ['ioreth-of-the-healing-house', id('Bill Ferny, Bree Swindler')] },
    });
    const ioreth = g.id('p1', 'ioreth-of-the-healing-house');
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === ioreth && a.abilityIndex === 1),
    ).toBe(false);
  });
});

describe('Willow-Wind', () => {
  it('flying 3/4; when it enters, scry 2', () => {
    const g = game({
      p1: { hand: ['willow-wind'], battlefield: n('island', 5), library: ['forest', 'island', 'forest'] },
    });
    expect(keywords(g, g.id('p1', 'willow-wind', 'hand'))).toContain('flying');
    cast(g, 'willow-wind');
    g.pass();
    // The creature resolves, the scry trigger goes on the stack and resolves, and the scry asks about 2 cards.
    for (let i = 0; i < 4 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
  });
});

describe('Knights of Dol Amroth', () => {
  it('a +1/+1 counter when you draw your second card each turn (only once per turn)', () => {
    const g = game({
      p1: {
        battlefield: [id('Knights of Dol Amroth'), ...n('island', 5)],
        hand: [LORIEN],
        library: n('forest', 8),
      },
    });
    const k = g.id('p1', id('Knights of Dol Amroth'));
    expect(pt(g, k)).toEqual([3, 3]);
    cast(g, LORIEN);
    done(g);
    // Three cards drawn: the second one triggers it, the third does not.
    expect(pt(g, k)).toEqual([4, 4]);
  });
});

describe('Saruman the White', () => {
  it('ward {2} is printed; the second spell each turn amasses Orcs 2', () => {
    const g = game({
      p1: {
        battlefield: [id('Saruman the White'), ...n('island', 6)],
        hand: ['opt', 'opt', 'opt'],
        library: n('forest', 10),
      },
    });
    const saruman = g.id('p1', id('Saruman the White'));
    expect(keywords(g, saruman)).toContain('ward');
    cast(g, 'opt');
    done(g);
    expect(all(g, 'ltr-orc-army-token')).toHaveLength(0);
    cast(g, 'opt');
    done(g);
    const armies = all(g, 'ltr-orc-army-token');
    expect(armies).toHaveLength(1);
    expect(pt(g, armies[0]!)).toEqual([2, 2]);
    expect(chars(g, armies[0]!).subtypes).toContain('Orc');
    cast(g, 'opt');
    done(g);
    // The third spell does nothing more.
    expect(pt(g, all(g, 'ltr-orc-army-token')[0]!)).toEqual([2, 2]);
  });
});

describe('Nimrodel Watcher', () => {
  it('whenever you scry: +1/+0 and unblockable this turn, once each turn', () => {
    const g = game({
      p1: {
        battlefield: [id('Nimrodel Watcher'), ...n('island', 9)],
        hand: ['willow-wind', id("Arwen's Gift")],
        library: n('forest', 12),
      },
    });
    const w = g.id('p1', id('Nimrodel Watcher'));
    expect(pt(g, w)).toEqual([2, 1]);
    expect(chars(g, w).cantBeBlocked).toBe(false);
    cast(g, 'willow-wind');
    done(g);
    expect(pt(g, w)).toEqual([3, 1]);
    expect(chars(g, w).cantBeBlocked).toBe(true);
    // A second scry the same turn does not trigger it again.
    cast(g, id("Arwen's Gift"));
    done(g);
    expect(pt(g, w)).toEqual([3, 1]);
  });
});

describe('Elrond, Lord of Rivendell', () => {
  const E = id('Elrond, Lord of Rivendell');
  it('scry 1 when it or another creature you control enters; the second resolution tempts', () => {
    const g = game({
      p1: {
        hand: [E, CAPTAIN, CAPTAIN],
        battlefield: n('island', 9),
        library: n('forest', 8),
      },
    });
    cast(g, E);
    done(g);
    // Elrond entered: scry 1 (first resolution), no temptation yet.
    expect(g.state.players.p1.ring?.tempted ?? 0).toBe(0);
    cast(g, CAPTAIN);
    done(g);
    // Second resolution this turn: the Ring tempts you.
    expect(g.state.players.p1.ring?.tempted).toBe(1);
    cast(g, CAPTAIN);
    done(g);
    // The third does not.
    expect(g.state.players.p1.ring?.tempted).toBe(1);
  });

  it("another player's creature entering does nothing", () => {
    const g = game({
      p1: { battlefield: [E], library: n('forest', 5) },
      p2: { hand: [CAPTAIN], battlefield: n('island', 3) },
      active: 'p2',
    });
    cast(g, CAPTAIN);
    done(g);
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.players.p1.ring?.tempted ?? 0).toBe(0);
    expect(library(g)).toHaveLength(5);
  });
});
