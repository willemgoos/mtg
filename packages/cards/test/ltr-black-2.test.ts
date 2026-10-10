import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  board,
  casts,
  chars,
  choose,
  done,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Lord of the Rings 21b: the black cards (second half; the first is in ltr-black.test.ts).

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'ltr-orc-army-token';
const armies = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => board(g, ARMY, p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
/** Moves to the declare attackers decision and attacks p2 with these creatures. */
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}
const army = (g: GameDriver, counters: number, p: 'p1' | 'p2' = 'p1') => {
  const id = g.id(p, ARMY);
  g.state.objects[id]!.plusOneCounters = counters;
  return id;
};

describe('Nasty End', () => {
  it('as an additional cost, sacrifice a creature; draw two cards', () => {
    const g = game({
      p1: { hand: ['nasty-end'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const cast = casts(g, 'nasty-end').find((a) => a.sacrifice === lions)!;
    expect(cast).toBeDefined();
    g.do(cast);
    done(g);
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions', 'nasty-end']));
    expect(hand(g)).toHaveLength(2);
  });

  it('if the sacrificed creature was legendary, draw three cards instead', () => {
    const g = game({
      p1: { hand: ['nasty-end'], battlefield: [...n('swamp', 2), 'gothmog-morgul-lieutenant'] },
    });
    const gothmog = g.id('p1', 'gothmog-morgul-lieutenant');
    g.do(casts(g, 'nasty-end').find((a) => a.sacrifice === gothmog)!);
    done(g);
    expect(hand(g)).toHaveLength(3);
  });

  it('a Ring-bearer is legendary, so sacrificing it draws three', () => {
    const g = game({
      p1: { hand: ['nasty-end', 'claim-the-precious'], battlefield: [...n('swamp', 5), 'savannah-lions'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'llanowar-elves')))!);
    done(g);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(lions);
    g.do(casts(g, 'nasty-end').find((a) => a.sacrifice === lions)!);
    done(g);
    expect(hand(g)).toHaveLength(3);
  });

  it('cannot be cast without a creature to sacrifice', () => {
    const g = game({ p1: { hand: ['nasty-end'], battlefield: n('swamp', 2) } });
    expect(casts(g, 'nasty-end')).toHaveLength(0);
  });
});

describe('Lash of the Balrog', () => {
  it('sacrifice a creature: {B} and destroy target creature', () => {
    const g = game({
      p1: { hand: ['lash-of-the-balrog'], battlefield: ['swamp', 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const baloth = g.id('p2', 'rumbling-baloth');
    const cast = casts(g, 'lash-of-the-balrog').find((a) => a.sacrifice === lions && targeting(baloth)(a))!;
    expect(cast).toBeDefined();
    g.do(cast);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions']));
  });

  it('or pay {4} more instead of sacrificing', () => {
    const g = game({
      p1: { hand: ['lash-of-the-balrog'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const cast = casts(g, 'lash-of-the-balrog').find((a) => !a.sacrifice)!;
    expect(cast).toBeDefined();
    g.do(cast);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
  });

  it('with only {B} and no creature to sacrifice it cannot be cast', () => {
    const g = game({
      p1: { hand: ['lash-of-the-balrog'], battlefield: ['swamp'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    expect(casts(g, 'lash-of-the-balrog')).toHaveLength(0);
  });
});

describe('Gothmog, Morgul Lieutenant', () => {
  it('enters: amass Orcs 1; creature tokens you control have deathtouch (Gothmog himself does not)', () => {
    const g = game({ p1: { hand: ['gothmog-morgul-lieutenant'], battlefield: n('swamp', 4) } });
    g.do(casts(g, 'gothmog-morgul-lieutenant')[0]!);
    done(g);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
    expect(kw(g, armies(g)[0]!).has('deathtouch')).toBe(true);
    expect(kw(g, g.id('p1', 'gothmog-morgul-lieutenant')).has('deathtouch')).toBe(false);
  });

  it('other creature tokens you control have it too, nontokens and opposing tokens do not', () => {
    const g = game({
      p1: { battlefield: ['gothmog-morgul-lieutenant', 'savannah-lions', 'food-token'] },
      p2: { battlefield: [ARMY] },
    });
    g.state.objects[g.id('p2', ARMY)]!.isToken = true;
    army(g, 1, 'p2');
    expect(kw(g, g.id('p2', ARMY)).has('deathtouch')).toBe(false);
    expect(kw(g, g.id('p1', 'savannah-lions')).has('deathtouch')).toBe(false);
    const h = game({ p1: { battlefield: ['gothmog-morgul-lieutenant', ARMY] } });
    h.state.objects[h.id('p1', ARMY)]!.isToken = true;
    army(h, 1);
    expect(kw(h, h.id('p1', ARMY)).has('deathtouch')).toBe(true);
  });
});

describe('Grond, the Gatebreaker', () => {
  it('is an artifact creature only on your turn while you control an Army', () => {
    const g = game({ p1: { battlefield: ['grond-the-gatebreaker', ARMY] } });
    const grond = g.id('p1', 'grond-the-gatebreaker');
    expect(chars(g, grond).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    expect(pt(g, grond)).toEqual([5, 5]);
    expect(kw(g, grond).has('trample')).toBe(true);
    // On the opponent's turn it is not a creature.
    const h = game({ p1: { battlefield: ['grond-the-gatebreaker', ARMY] }, active: 'p2' });
    expect(chars(h, h.id('p1', 'grond-the-gatebreaker')).types).not.toContain('Creature');
  });

  it('is not a creature without an Army (on your turn), or if the Army belongs to the opponent', () => {
    const g = game({ p1: { battlefield: ['grond-the-gatebreaker'] } });
    expect(chars(g, g.id('p1', 'grond-the-gatebreaker')).types).not.toContain('Creature');
    const h = game({ p1: { battlefield: ['grond-the-gatebreaker'] }, p2: { battlefield: [ARMY] } });
    expect(chars(h, h.id('p1', 'grond-the-gatebreaker')).types).not.toContain('Creature');
  });

  it('crew 3: tap creatures with total power 3 to make it a creature until end of turn', () => {
    const g = game({
      p1: { battlefield: ['grond-the-gatebreaker', 'rumbling-baloth'] },
      active: 'p1',
    });
    const grond = g.id('p1', 'grond-the-gatebreaker');
    expect(chars(g, grond).types).not.toContain('Creature');
    const crew = abilityActions(g, grond, 1);
    expect(crew.length).toBeGreaterThan(0);
    g.do(crew[0]!);
    done(g);
    expect(chars(g, grond).types).toEqual(expect.arrayContaining(['Artifact', 'Creature']));
    expect(g.obj(g.id('p1', 'rumbling-baloth')).tapped).toBe(true);
  });

  it('can attack with an Army on your turn', () => {
    const g = game({ p1: { battlefield: ['grond-the-gatebreaker', ARMY] } });
    army(g, 1);
    const grond = g.id('p1', 'grond-the-gatebreaker');
    attack(g, [grond]);
    done(g);
    passTo(g, 'main2', 'p1');
    expect(g.life('p2')).toBe(15);
  });
});

describe('Orcish Medicine', () => {
  it('target creature gains lifelink until end of turn, and amass Orcs 1', () => {
    const g = game({
      p1: { hand: ['orcish-medicine'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'orcish-medicine').find(targeting(lions))!);
    done(g, { option: /Lifelink/ });
    expect(kw(g, lions).has('lifelink')).toBe(true);
    expect(kw(g, lions).has('indestructible')).toBe(false);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
  });

  it('or indestructible', () => {
    const g = game({
      p1: { hand: ['orcish-medicine'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'orcish-medicine').find(targeting(lions))!);
    done(g, { option: /Indestructible/ });
    expect(kw(g, lions).has('indestructible')).toBe(true);
    expect(kw(g, lions).has('lifelink')).toBe(false);
    expect(armies(g)).toHaveLength(1);
  });

  it('with two Armies you pick which gets the counter', () => {
    const g = game({
      p1: { hand: ['orcish-medicine'], battlefield: [...n('swamp', 2), 'savannah-lions', ARMY, ARMY] },
    });
    const [a, b] = armies(g) as [string, string];
    g.state.objects[a]!.plusOneCounters = 2;
    g.state.objects[b]!.plusOneCounters = 1;
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'orcish-medicine').find(targeting(lions))!);
    stop(g);
    choose(g, /Lifelink/);
    expect(labels(g)).toHaveLength(2);
    choose(g, /\(1\/1\)/); // the Army with one counter
    done(g);
    expect(plus(g, b)).toBe(2);
    expect(plus(g, a)).toBe(2);
    expect(kw(g, lions).has('lifelink')).toBe(true);
  });
});

describe('Dunland Crebain and Easterling Vanguard', () => {
  it('Dunland Crebain: flying; enters: amass Orcs 2', () => {
    const g = game({ p1: { hand: ['dunland-crebain'], battlefield: n('swamp', 3) } });
    g.do(casts(g, 'dunland-crebain')[0]!);
    done(g);
    expect(kw(g, g.id('p1', 'dunland-crebain')).has('flying')).toBe(true);
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(2);
  });

  it('Easterling Vanguard: when it dies, amass Orcs 1', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), 'easterling-vanguard'] },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p1', 'easterling-vanguard')))!);
    done(g);
    expect(gy(g)).toContain('easterling-vanguard');
    expect(armies(g)).toHaveLength(1);
    expect(plus(g, armies(g)[0]!)).toBe(1);
  });
});

describe('Cirith Ungol Patrol', () => {
  it('{1}, {T}, sacrifice another creature: draw a card, then create a Food token', () => {
    const g = game({ p1: { battlefield: ['cirith-ungol-patrol', 'savannah-lions', 'swamp'] } });
    const patrol = g.id('p1', 'cirith-ungol-patrol');
    const lions = g.id('p1', 'savannah-lions');
    const acts = abilityActions(g, patrol, 0);
    expect(acts.every((a) => a.type === 'activateAbility' && a.sacrifice !== patrol)).toBe(true);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.sacrifice === lions)!);
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(hand(g)).toHaveLength(1);
    expect(board(g, 'food-token', 'p1')).toHaveLength(1);
    expect(g.obj(patrol).tapped).toBe(true);
  });

  it('needs another creature', () => {
    const g = game({ p1: { battlefield: ['cirith-ungol-patrol', 'swamp'] } });
    expect(abilityActions(g, g.id('p1', 'cirith-ungol-patrol'), 0)).toHaveLength(0);
  });
});

describe('March from the Black Gate', () => {
  it('enters: amass Orcs 1; whenever an Army you control attacks, amass Orcs 1', () => {
    const g = game({ p1: { hand: ['march-from-the-black-gate'], battlefield: n('swamp', 2) } });
    g.do(casts(g, 'march-from-the-black-gate')[0]!);
    done(g);
    expect(armies(g)).toHaveLength(1);
    const a = armies(g)[0]!;
    expect(plus(g, a)).toBe(1);
    g.state.objects[a]!.summoningSick = false;
    attack(g, [a]);
    done(g);
    expect(plus(g, a)).toBe(2);
  });

  it('a creature that is not an Army does not trigger it', () => {
    const g = game({
      p1: { battlefield: ['march-from-the-black-gate', 'savannah-lions', ARMY] },
    });
    army(g, 1);
    attack(g, [g.id('p1', 'savannah-lions')]);
    done(g);
    expect(plus(g, g.id('p1', ARMY))).toBe(1);
  });

  it('each Army that attacks triggers it once', () => {
    const g = game({ p1: { battlefield: ['march-from-the-black-gate', ARMY, ARMY] } });
    const [a, b] = armies(g) as [string, string];
    g.state.objects[a]!.plusOneCounters = 1;
    g.state.objects[b]!.plusOneCounters = 1;
    attack(g, [a, b]);
    done(g, { card: (id) => id === a });
    expect(plus(g, a) + plus(g, b)).toBe(4);
  });
});

describe('Uruk-hai Berserker', () => {
  it('enters: the Ring tempts you', () => {
    const g = game({ p1: { hand: ['uruk-hai-berserker'], battlefield: n('swamp', 3) } });
    g.do(casts(g, 'uruk-hai-berserker')[0]!);
    done(g);
    expect(ringLevel(g)).toBe(1);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'uruk-hai-berserker'));
    expect(pt(g, g.id('p1', 'uruk-hai-berserker'))).toEqual([3, 2]);
  });
});

describe('Bitter Downfall', () => {
  it('destroys target creature; its controller loses 2 life', () => {
    const g = game({
      p1: { hand: ['bitter-downfall'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    g.do(casts(g, 'bitter-downfall')[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(g.life('p2')).toBe(18);
  });

  it("works on your own creature: you lose 2 life", () => {
    const g = game({
      p1: { hand: ['bitter-downfall'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
    });
    g.do(casts(g, 'bitter-downfall').find(targeting(g.id('p1', 'savannah-lions')))!);
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(g.life('p1')).toBe(18);
  });

  it('costs {3} less if it targets a creature that was dealt damage this turn', () => {
    const g = game({
      p1: { hand: ['bitter-downfall'], battlefield: ['swamp'] },
      p2: { battlefield: [{ card: 'rumbling-baloth', damage: 1 }, 'savannah-lions'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    const cheap = casts(g, 'bitter-downfall');
    expect(cheap.some(targeting(baloth))).toBe(true);
    expect(cheap.some(targeting(g.id('p2', 'savannah-lions')))).toBe(false);
    g.do(cheap.find(targeting(baloth))!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['rumbling-baloth']);
    expect(g.life('p2')).toBe(18);
  });

  it('full price for an undamaged creature: one Swamp is not enough', () => {
    const g = game({
      p1: { hand: ['bitter-downfall'], battlefield: ['swamp'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    expect(casts(g, 'bitter-downfall')).toHaveLength(0);
  });
});
