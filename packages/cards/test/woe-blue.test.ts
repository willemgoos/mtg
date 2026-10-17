import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt } from './blb-helpers.ts';
import { done, exile, gy, hand, keywords, library, nextTurn } from './ecl-blue-helpers.ts';

// Wilds of Eldraine (23b): the blue cards, Story Deck and Jump In. Real cards from the database.

const ISLANDS = (k: number) => n('island', k);
const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);

describe('every blue card is in the database', () => {
  it('has all 31 cards, their Adventure sides and the Faerie token', () => {
    for (const name of [
      'aquatic-alchemist',
      'belunas-gatekeeper',
      'bitter-chill',
      'chancellor-of-tales',
      'elusive-otter',
      'farsight-ritual',
      'freeze-in-place',
      'gadwicks-first-duel',
      'galvanic-giant',
      'horned-loch-whale',
      'ice-out',
      'icewrought-sentry',
      'into-the-fae-court',
      'johanns-stopgap',
      'living-lectern',
      'misleading-motes',
      'obyras-attendants',
      'picklock-prankster',
      'rowdy-research',
      'sleep-cursed-faerie',
      'snaremaster-sprite',
      'spell-stutter',
      'splashy-spellcaster',
      'stormkeld-prowler',
      'storyteller-pixie',
      'succumb-to-the-cold',
      'talions-messenger',
      'tenacious-tomeseeker',
      'threadbind-clique',
      'vantress-transmuter',
      'water-wings',
      'woe-faerie-token',
    ])
      expect(cardDb.has(name), name).toBe(true);
  });
});

describe('vanilla and keyword creatures', () => {
  it("Beluna's Gatekeeper is a 6/5 Giant Soldier", () => {
    const g = game({ p1: { battlefield: ['belunas-gatekeeper'] } });
    expect(pt(g, idOf(g, 'belunas-gatekeeper'))).toEqual([6, 5]);
    expect(cardDb.get('belunas-gatekeeper')!.abilities).toEqual([]);
  });
  it("Obyra's Attendants 3/4 flying, Picklock Prankster 1/3 flying vigilance, Threadbind Clique 3/3 flying", () => {
    const g = game({
      p1: { battlefield: ['obyras-attendants', 'picklock-prankster', 'threadbind-clique'] },
    });
    expect(pt(g, idOf(g, 'obyras-attendants'))).toEqual([3, 4]);
    expect(keywords(g, idOf(g, 'obyras-attendants')).has('flying')).toBe(true);
    expect(pt(g, idOf(g, 'picklock-prankster'))).toEqual([1, 3]);
    expect([...keywords(g, idOf(g, 'picklock-prankster'))].sort()).toEqual(['flying', 'vigilance']);
    expect(pt(g, idOf(g, 'threadbind-clique'))).toEqual([3, 3]);
    expect(keywords(g, idOf(g, 'threadbind-clique')).has('flying')).toBe(true);
  });
  it('Vantress Transmuter is a 3/4 Human Wizard', () => {
    const g = game({ p1: { battlefield: ['vantress-transmuter'] } });
    expect(pt(g, idOf(g, 'vantress-transmuter'))).toEqual([3, 4]);
  });
});

describe('Aquatic Alchemist', () => {
  it('gets +2/+0 for the first instant or sorcery each turn only', () => {
    const g = game({
      p1: {
        hand: ['freeze-in-place', 'freeze-in-place', 'picklock-prankster'],
        battlefield: [...ISLANDS(6), 'aquatic-alchemist'],
      },
      p2: { battlefield: ['savannah-lions', 'savannah-lions'] },
    });
    const alchemist = idOf(g, 'aquatic-alchemist');
    expect(pt(g, alchemist)).toEqual([1, 3]);
    // A creature spell is not an instant or sorcery.
    cast(g, 'picklock-prankster');
    done(g);
    expect(pt(g, alchemist)).toEqual([1, 3]);
    const [a, b] = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    cast(g, 'freeze-in-place', [tgt(g, a!)]);
    done(g);
    expect(pt(g, alchemist)).toEqual([3, 3]);
    cast(g, 'freeze-in-place', [tgt(g, b!)]);
    done(g);
    expect(pt(g, alchemist)).toEqual([3, 3]);
  });
  it('wears off at end of turn', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: [...ISLANDS(3), 'aquatic-alchemist'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'freeze-in-place', [tgt(g, idOf(g, 'savannah-lions', 'battlefield', 'p2'))]);
    done(g);
    expect(pt(g, idOf(g, 'aquatic-alchemist'))).toEqual([3, 3]);
    nextTurn(g);
    expect(pt(g, idOf(g, 'aquatic-alchemist'))).toEqual([1, 3]);
  });
});

describe('Bubble Up (Aquatic Alchemist)', () => {
  it('puts an instant or sorcery card from your graveyard on top of your library, then the Alchemist can be cast from exile', () => {
    const g = game({
      p1: {
        hand: ['aquatic-alchemist'],
        graveyard: ['freeze-in-place', 'savannah-lions'],
        battlefield: ISLANDS(6),
        library: n('forest', 5),
      },
    });
    const freeze = idOf(g, 'freeze-in-place', 'graveyard');
    // Only the instant or sorcery card is a legal target.
    const casts = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' && a.back && a.card === g.id('p1', 'aquatic-alchemist', 'hand'),
      );
    expect(casts.length).toBe(1);
    expect(casts[0]!.type === 'castSpell' && casts[0]!.targets).toEqual([tgt(g, freeze)]);
    g.do(casts[0]!);
    done(g);
    expect(library(g)[0]).toBe('freeze-in-place');
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(exile(g)).toEqual(['aquatic-alchemist']);
    // From exile only the creature may be cast.
    const fromExile = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'aquatic-alchemist', 'exile'));
    expect(fromExile.length).toBeGreaterThan(0);
    expect(fromExile.every((a) => a.type === 'castSpell' && !a.back)).toBe(true);
  });
});

describe("Entry Denied (Beluna's Gatekeeper)", () => {
  it("returns a creature you don't control with mana value 3 or less", () => {
    const g = game({
      p1: { hand: ['belunas-gatekeeper'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.back)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toEqual([tgt(g, lions)]);
    void angel;
    const act = g.legal().find((a) => a.type === 'castSpell' && a.back)!;
    g.do(act);
    done(g);
    expect(hand(g, 'p2')).toEqual(['savannah-lions']);
    expect(exile(g)).toEqual(['belunas-gatekeeper']);
  });
});

describe("Grove's Bounty (Elusive Otter)", () => {
  it('distributes X +1/+1 counters among any number of target creatures you control', () => {
    const g = game({
      p1: {
        hand: ['elusive-otter'],
        battlefield: [...n('forest', 3), 'savannah-lions', 'serra-angel'],
      },
    });
    const lions = idOf(g, 'savannah-lions');
    const bears = idOf(g, 'serra-angel');
    const act = g.legal().find((a) => a.type === 'castSpell' && a.back && a.x === 2)!;
    expect(act).toBeDefined();
    g.do(act);
    // Resolution: choose a creature and how much it gets, one at a time.
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision;
    if (d.kind !== 'chooseOption') return;
    const labels = d.options.map((o) => o.label);
    // 1 to one creature, or 2 to one creature (the last target gets the rest), or no targets.
    expect(labels.some((l) => /No targets/.test(l))).toBe(true);
    const idx = d.options.findIndex((o) => /1 \+1\/\+1 counter on Savannah Lions/.test(o.label));
    expect(idx).toBeGreaterThanOrEqual(0);
    g.do({ type: 'chooseOption', player: d.player, index: idx });
    const d2 = g.decision;
    expect(d2.kind).toBe('chooseOption');
    if (d2.kind !== 'chooseOption') return;
    // The last target allowed gets all that is left.
    const idx2 = d2.options.findIndex((o) => /1 \+1\/\+1 counter on Serra Angel/.test(o.label));
    expect(idx2).toBeGreaterThanOrEqual(0);
    g.do({ type: 'chooseOption', player: d2.player, index: idx2 });
    done(g);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(g.obj(bears).plusOneCounters).toBe(1);
  });
});

describe('Storm Reading (Galvanic Giant)', () => {
  it('draws four cards, then discards two', () => {
    const g = game({
      p1: { hand: ['galvanic-giant'], battlefield: ISLANDS(7), library: n('forest', 8) },
    });
    const act = g.legal().find((a) => a.type === 'castSpell' && a.back)!;
    g.do(act);
    done(g);
    // The Giant is on an adventure; four drawn, two discarded.
    expect(handSize(g, 'p1')).toBe(2);
    expect(gy(g).length).toBe(2);
    expect(exile(g)).toEqual(['galvanic-giant']);
  });
});

describe("Desperate Parry (Obyra's Attendants)", () => {
  it('gives target creature -4/-0 until end of turn', () => {
    const g = game({
      p1: { hand: ['obyras-attendants'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.back &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      )!;
    g.do(act);
    done(g);
    expect(pt(g, angel)).toEqual([0, 4]);
  });
});

describe('Free the Fae (Picklock Prankster)', () => {
  it('mills four, then puts an instant, sorcery or Faerie card from among them into your hand', () => {
    const g = game({
      p1: {
        hand: ['picklock-prankster'],
        battlefield: ISLANDS(2),
        library: ['forest', 'water-wings', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    // Mills the top four: forest, water-wings, forest, forest.
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.back)!);
    done(g);
    expect(hand(g)).toEqual(['water-wings']);
    expect(gy(g).filter((d) => d === 'forest').length).toBe(3);
  });
  it('a Faerie card counts', () => {
    const g = game({
      p1: {
        hand: ['picklock-prankster'],
        battlefield: ISLANDS(2),
        library: ['forest', 'threadbind-clique', 'forest', 'forest', 'forest'],
      },
    });
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.back)!);
    done(g);
    expect(hand(g)).toEqual(['threadbind-clique']);
  });
  it('nothing happens if no such card was milled', () => {
    const g = game({
      p1: { hand: ['picklock-prankster'], battlefield: ISLANDS(2), library: n('forest', 6) },
    });
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.back)!);
    done(g);
    expect(hand(g)).toEqual([]);
    expect(gy(g).length).toBe(4);
  });
});

describe('Rip the Seams (Threadbind Clique)', () => {
  it('destroys target tapped creature', () => {
    const g = game({
      p1: { hand: ['threadbind-clique'], battlefield: n('plains', 3) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }, 'savannah-lions'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.back)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toEqual([tgt(g, angel)]);
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.back)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(exile(g)).toEqual(['threadbind-clique']);
  });
});

describe('Croaking Curse (Vantress Transmuter)', () => {
  it('taps target creature and attaches a Cursed Role (base 1/1)', () => {
    const g = game({
      p1: { hand: ['vantress-transmuter'], battlefield: ISLANDS(2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = idOf(g, 'serra-angel', 'battlefield', 'p2');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'castSpell' &&
            a.back &&
            a.targets.some((t) => 'object' in t && t.object.id === angel),
        )!,
    );
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(all(g, 'woe-cursed-role').length).toBe(1);
  });
});
