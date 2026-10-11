import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cast } from './blb-helpers.ts';
import {
  board,
  chars,
  done,
  exile,
  game,
  gy,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import { nextTurn } from './ecl-blue-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Lord of the Rings 21d: the black and red rares of the random slot (part four: Moria Marauder, Spiteful Banditry, There and
// Back Again, Éomer).

const LIONS = 'savannah-lions';
const ELVES = 'llanowar-elves';
const BALOTH = 'rumbling-baloth';
const KRENKO = 'krenko-mob-boss';
const ARMY = 'ltr-orc-army-token';
const TREASURE = 'treasure-token';
const mountains = (k: number) => n('mountain', k);
const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') => board(g, defId, p);
const setBearer = (g: GameDriver, id: string, p: 'p1' | 'p2' = 'p1') => {
  g.state.players[p].ring = { tempted: 1, bearer: { id, zcc: g.obj(id).zcc } };
};

/** Attacks the opponent with these creatures (moving to the declare attackers decision first). */
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 12 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}

/** The defending player blocks (blocker, attacker) pairs and confirms. */
function block(g: GameDriver, pairs: [string, string][]): GameDriver {
  for (let i = 0; i < 12 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  for (const [blocker, attacker] of pairs)
    g.do({ type: 'addBlock', player: 'p2', blocker, attacker });
  g.do({ type: 'confirmBlockers', player: 'p2' });
  return g;
}

/** Passes through combat damage (resolving triggers) to the end of combat step. */
function endCombat(g: GameDriver): GameDriver {
  for (let i = 0; i < 60 && !['endCombat', 'main2'].includes(g.state.turn.step); i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  done(g);
  return g;
}

describe('Moria Marauder', () => {
  const MARAUDER = 'moria-marauder';
  const setup = (p1: string[], library = ['forest', 'shock', 'forest', 'mountain']) =>
    game({ p1: { battlefield: p1, library }, p2: { library: n('forest', 6) } });
  /** Passes until the second main phase, resolving triggers. */
  const toMain2 = (g: GameDriver) => {
    for (let i = 0; i < 60 && !(g.state.turn.step === 'main2' && g.decision.kind === 'priority'); i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
  };

  it('has double strike', () => {
    const g = setup([MARAUDER]);
    expect(chars(g, g.id('p1', MARAUDER)).keywords.has('doubleStrike')).toBe(true);
  });

  it('deals damage twice, and each time exiles the top card, which you may play this turn', () => {
    const g = setup([MARAUDER]);
    attack(g, [g.id('p1', MARAUDER)]);
    toMain2(g);
    expect(g.life('p2')).toBe(18);
    expect(exile(g)).toEqual(['forest', 'shock']);
    // Playable this turn: the Forest as a land drop.
    const forest = g.id('p1', 'forest', 'exile');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === forest)).toBe(true);
    g.do({ type: 'playLand', player: 'p1', card: forest });
    expect(bf(g, 'forest')).toHaveLength(1);
  });

  it('a Goblin or Orc you control triggers it too (an Orc Army)', () => {
    const g = setup([MARAUDER, ARMY, ELVES]);
    g.obj(g.id('p1', ARMY)).plusOneCounters = 1;
    attack(g, [g.id('p1', ARMY)]);
    toMain2(g);
    // The Army hit once: one card exiled.
    expect(exile(g)).toEqual(['forest']);
  });

  it('a Goblin other than the Marauder triggers it as well', () => {
    const g = setup([MARAUDER, 'goblin-fireleaper']);
    attack(g, [g.id('p1', 'goblin-fireleaper')]);
    toMain2(g);
    expect(exile(g)).toEqual(['forest']);
  });

  it('a creature that is neither a Goblin nor an Orc does not trigger it', () => {
    const g = setup([MARAUDER, ELVES]);
    attack(g, [g.id('p1', ELVES)]);
    toMain2(g);
    expect(exile(g)).toHaveLength(0);
  });

  it("an opponent's Goblin doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: [MARAUDER] },
      p2: { battlefield: ['goblin-fireleaper'], library: n('forest', 6) },
      active: 'p2',
    });
    for (let i = 0; i < 12 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p2', attacker: g.id('p2', 'goblin-fireleaper'), defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    for (let i = 0; i < 12 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p1' });
    done(g);
    expect(exile(g)).toHaveLength(0);
  });

  it('a Goblin blocked by a creature deals no damage to a player: no trigger', () => {
    const g = game({
      p1: { battlefield: [MARAUDER], library: ['forest', 'shock'] },
      p2: { battlefield: [BALOTH] },
    });
    attack(g, [g.id('p1', MARAUDER)]);
    block(g, [[g.id('p2', BALOTH), g.id('p1', MARAUDER)]]);
    done(g);
    expect(exile(g)).toHaveLength(0);
  });
});

describe('Spiteful Banditry', () => {
  const BANDITRY = 'spiteful-banditry';
  const setup = (p1: string[], p2: string[], mana = 4) =>
    game({
      p1: { hand: [BANDITRY, 'shock'], battlefield: [...mountains(mana), ...p1] },
      p2: { battlefield: p2 },
    });

  it('enters: X damage to each creature (yours too)', () => {
    const g = setup([LIONS], [ELVES, BALOTH]);
    cast(g, BANDITRY, [], { x: 2 });
    done(g);
    expect(bf(g, ELVES, 'p2')).toHaveLength(0);
    expect(bf(g, LIONS)).toHaveLength(0);
    expect(g.obj(bf(g, BALOTH, 'p2')[0]!).damage).toBe(2);
  });

  it('X is 0: no damage', () => {
    const g = setup([LIONS], [ELVES]);
    cast(g, BANDITRY, [], { x: 0 });
    done(g);
    expect(bf(g, ELVES, 'p2')).toHaveLength(1);
    expect(bf(g, LIONS)).toHaveLength(1);
  });

  it('whenever one or more creatures your opponents control die, create a Treasure; once for several at the same time', () => {
    const g = setup([], [ELVES, LIONS]);
    cast(g, BANDITRY, [], { x: 2 });
    done(g);
    expect(gy(g, 'p2').sort()).toEqual([ELVES, LIONS].sort());
    expect(bf(g, TREASURE)).toHaveLength(1);
  });

  it('only once each turn: a later death the same turn makes no second Treasure', () => {
    const g = setup([], [ELVES, LIONS], 5);
    cast(g, BANDITRY, [], { x: 1 });
    done(g);
    // X=1 killed the Elves (1/1) only: one Treasure; the Lions (2/1... damaged by 1) died too: simultaneously.
    const treasures = bf(g, TREASURE).length;
    expect(treasures).toBe(1);
    const g2 = game({
      p1: { hand: [BANDITRY, 'shock'], battlefield: mountains(5) },
      p2: { battlefield: [BALOTH, ELVES] },
    });
    cast(g2, BANDITRY, [], { x: 1 });
    done(g2);
    expect(bf(g2, TREASURE)).toHaveLength(1);
    cast(g2, 'shock', [g2.ref(g2.id('p2', BALOTH))]);
    done(g2);
    // The Baloth took 1 + 2 = 3 damage: alive. Another Shock kills nothing more... use damage to finish it.
    expect(bf(g2, BALOTH, 'p2')).toHaveLength(1);
    g2.obj(g2.id('p2', BALOTH)).damage = 4;
    g2.pass();
    g2.pass();
    done(g2);
    expect(bf(g2, BALOTH, 'p2')).toHaveLength(0);
    expect(bf(g2, TREASURE)).toHaveLength(1);
  });

  it('your own creatures dying makes no Treasure', () => {
    const g = setup([LIONS], []);
    cast(g, BANDITRY, [], { x: 2 });
    done(g);
    expect(gy(g)).toContain(LIONS);
    expect(bf(g, TREASURE)).toHaveLength(0);
  });

  it('works on later turns too', () => {
    const g = game({
      p1: { hand: [BANDITRY], battlefield: mountains(4) },
      p2: { battlefield: [BALOTH, ELVES] },
    });
    cast(g, BANDITRY, [], { x: 1 });
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(1);
    // Next turn of yours, the Baloth dies (damage 4) and a Treasure follows.
    nextTurn(g);
    nextTurn(g);
    g.obj(g.id('p2', BALOTH)).damage = 4;
    g.pass();
    g.pass();
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(2);
  });
});

describe('There and Back Again', () => {
  const THERE = 'there-and-back-again';
  const SMAUG = 'ltr-smaug-token';
  const cantBlock = (g: GameDriver, id: string) => chars(g, id).cantBlock;
  const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;

  it('I: up to one target creature can\'t block for as long as you control this Saga; the Ring tempts you', () => {
    const g = game({
      p1: { hand: [THERE], battlefield: [...mountains(5), LIONS] },
      p2: { battlefield: [BALOTH, ELVES] },
    });
    cast(g, THERE);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', BALOTH)) });
    expect(cantBlock(g, g.id('p2', BALOTH))).toBe(true);
    expect(cantBlock(g, g.id('p2', ELVES))).toBe(false);
    expect(ringLevel(g)).toBe(1);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', LIONS));
  });

  it('the effect lasts through your next turns and ends when the Saga is sacrificed after III', () => {
    const g = game({
      p1: { hand: [THERE], battlefield: [...mountains(5), LIONS], library: [...n('forest', 4), 'mountain', ...n('forest', 8)] },
      p2: { battlefield: [BALOTH] },
    });
    cast(g, THERE);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', BALOTH)) });
    const baloth = g.id('p2', BALOTH);
    nextTurn(g);
    nextTurn(g);
    done(g);
    expect(cantBlock(g, baloth)).toBe(true);
    expect(g.obj(g.id('p1', THERE)).counters?.lore).toBe(2);
    nextTurn(g);
    nextTurn(g);
    done(g);
    // Chapter III resolved: Smaug is here and the Saga has gone.
    expect(bf(g, THERE)).toHaveLength(0);
    expect(cantBlock(g, baloth)).toBe(false);
    expect(g.state.effects.filter((e) => e.cantBlock)).toHaveLength(0);
  });

  it('the effect ends if another player gains control of the Saga', () => {
    const g = game({
      p1: { hand: [THERE], battlefield: [...mountains(5)] },
      p2: { battlefield: [BALOTH] },
    });
    cast(g, THERE);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t) });
    const baloth = g.id('p2', BALOTH);
    expect(cantBlock(g, baloth)).toBe(true);
    g.obj(g.id('p1', THERE)).controller = 'p2';
    g.pass();
    expect(cantBlock(g, baloth)).toBe(false);
  });

  it('I with no target: the Ring still tempts you', () => {
    const g = game({ p1: { hand: [THERE], battlefield: [...mountains(5), LIONS] } });
    cast(g, THERE);
    done(g);
    expect(ringLevel(g)).toBe(1);
  });

  it('II: search your library for a Mountain card (nonbasic too), put it onto the battlefield, then shuffle', () => {
    const g = game({
      p1: {
        battlefield: [THERE, ...mountains(1)],
        library: ['forest', 'smoldering-marsh', 'mountain', 'shock', ...n('forest', 4)],
      },
      active: 'p2',
    });
    g.obj(g.id('p1', THERE)).counters = { lore: 1 };
    const before = bf(g, 'mountain').length;
    passTo(g, 'main1', 'p1');
    // The trigger resolves; the search prompt.
    stop(g);
    const d = g.decision;
    expect(d.kind).toBe('searchLibrary');
    if (d.kind !== 'searchLibrary') return;
    const names = d.options.map((id) => g.obj(id).defId).sort();
    expect(names).toEqual(['mountain', 'smoldering-marsh']);
    const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'smoldering-marsh')!;
    g.do(pick);
    done(g);
    expect(bf(g, 'smoldering-marsh')).toHaveLength(1);
    // Not tapped by the effect itself ("put it onto the battlefield" -- Smoldering Marsh's own entry rule may tap it).
    expect(bf(g, 'mountain')).toHaveLength(before);
  });

  it('III: create Smaug, a legendary 6/6 red Dragon with flying and haste', () => {
    const g = game({
      p1: { battlefield: [THERE, LIONS] },
      active: 'p2',
    });
    g.obj(g.id('p1', THERE)).counters = { lore: 2 };
    passTo(g, 'main1', 'p1');
    done(g);
    const smaug = bf(g, SMAUG);
    expect(smaug).toHaveLength(1);
    expect(pt(g, smaug[0]!)).toEqual([6, 6]);
    const c = chars(g, smaug[0]!);
    expect(c.keywords.has('flying')).toBe(true);
    expect(c.keywords.has('haste')).toBe(true);
    expect(c.subtypes).toEqual(['Dragon']);
    expect(cardDb.get(SMAUG)!.supertypes).toEqual(['Legendary']);
    expect(cardDb.get(SMAUG)!.colors).toEqual(['R']);
    expect(g.obj(smaug[0]!).isToken).toBe(true);
  });

  it('when Smaug dies, create fourteen Treasure tokens', () => {
    const g = game({
      p1: { battlefield: [SMAUG, ...mountains(1)] },
    });
    g.obj(g.id('p1', SMAUG)).damage = 6;
    g.pass();
    g.pass();
    done(g);
    expect(bf(g, SMAUG)).toHaveLength(0);
    expect(bf(g, TREASURE)).toHaveLength(14);
  });
});

describe('Éomer, Marshal of Rohan', () => {
  const EOMER = slug('Éomer, Marshal of Rohan');
  const setup = (p1: string[], p2: string[] = [BALOTH]) =>
    game({ p1: { battlefield: p1 }, p2: { battlefield: p2 } });
  const untapped = (g: GameDriver, id: string) => !g.obj(id).tapped;

  it('has haste', () => {
    const g = setup([EOMER]);
    expect(chars(g, g.id('p1', EOMER)).keywords.has('haste')).toBe(true);
  });

  it('another attacking legendary creature of yours dies: untap all your creatures and an additional combat phase', () => {
    const g = setup([EOMER, KRENKO, LIONS]);
    const eomer = g.id('p1', EOMER);
    const krenko = g.id('p1', KRENKO);
    const lions = g.id('p1', LIONS);
    attack(g, [eomer, krenko]);
    // Krenko (3/3) is blocked by the Baloth (4/4) and dies.
    block(g, [[g.id('p2', BALOTH), krenko]]);
    endCombat(g);
    expect(gy(g)).toContain(KRENKO);
    expect(g.obj(eomer).tapped).toBe(false);
    expect(untapped(g, lions)).toBe(true);
    expect(g.state.turn.extraCombats).toBe(1);
  });

  it('then there really is another combat phase, in which Éomer can attack again', () => {
    const g = setup([EOMER, KRENKO], []);
    const eomer = g.id('p1', EOMER);
    const krenko = g.id('p1', KRENKO);
    attack(g, [eomer, krenko]);
    g.obj(krenko).damage = 3;
    endCombat(g);
    expect(gy(g)).toContain(KRENKO);
    expect(g.state.turn.extraCombats).toBe(1);
    // The additional combat phase: Éomer (untapped) attacks again.
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.decision.kind).toBe('declareAttackers');
    g.do({ type: 'addAttacker', player: 'p1', attacker: eomer, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    endCombat(g);
    // 4 (first combat) + 3... Éomer's first hit (4), Krenko died before damage? He had lethal damage, so only Éomer: 4 + 4.
    expect(g.life('p2')).toBe(12);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it("Éomer's own death isn't 'another' attacking legendary creature", () => {
    const g = setup([EOMER, LIONS]);
    attack(g, [g.id('p1', EOMER)]);
    block(g, [[g.id('p2', BALOTH), g.id('p1', EOMER)]]);
    endCombat(g);
    // Éomer 4/4 vs a 4/4: both die; no trigger from himself.
    expect(gy(g)).toContain(EOMER);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it('a legendary creature that was not attacking does not trigger it', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [EOMER, KRENKO, ...mountains(1)] },
      p2: {},
    });
    cast(g, 'shock', [g.ref(g.id('p1', KRENKO))]);
    done(g);
    // Krenko is a 3/3: Shock doesn't kill it. Use damage.
    g.obj(g.id('p1', KRENKO)).damage = 3;
    g.pass();
    g.pass();
    done(g);
    expect(gy(g)).toContain(KRENKO);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it('an attacking nonlegendary creature dying does not trigger it', () => {
    const g = setup([EOMER, LIONS]);
    attack(g, [g.id('p1', LIONS)]);
    block(g, [[g.id('p2', BALOTH), g.id('p1', LIONS)]]);
    endCombat(g);
    expect(gy(g)).toContain(LIONS);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it('an attacking Ring-bearer is legendary', () => {
    const g = setup([EOMER, LIONS], []);
    setBearer(g, g.id('p1', LIONS));
    const lions = g.id('p1', LIONS);
    attack(g, [lions]);
    g.obj(lions).damage = 1;
    endCombat(g);
    expect(gy(g)).toContain(LIONS);
    expect(g.state.turn.extraCombats).toBe(1);
  });

  it('the same creature when it is not the Ring-bearer does nothing', () => {
    const g = setup([EOMER, LIONS], []);
    const lions = g.id('p1', LIONS);
    attack(g, [lions]);
    g.obj(lions).damage = 1;
    endCombat(g);
    expect(gy(g)).toContain(LIONS);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it("an opponent's attacking legendary creature dying doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: [EOMER, BALOTH] },
      p2: { battlefield: [KRENKO] },
      active: 'p2',
    });
    for (let i = 0; i < 12 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p2', attacker: g.id('p2', KRENKO), defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    for (let i = 0; i < 12 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'addBlock', player: 'p1', blocker: g.id('p1', BALOTH), attacker: g.id('p2', KRENKO) });
    g.do({ type: 'confirmBlockers', player: 'p1' });
    endCombat(g);
    expect(gy(g, 'p2')).toContain(KRENKO);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it('triggers only once each turn, even if two attacking legendary creatures die', () => {
    const g = setup([EOMER, KRENKO, 'captain-lannery-storm'], [BALOTH, 'rumbling-baloth']);
    const eomer = g.id('p1', EOMER);
    const krenko = g.id('p1', KRENKO);
    const lannery = g.id('p1', 'captain-lannery-storm');
    attack(g, [eomer, krenko, lannery]);
    const [b1, b2] = g.state.battlefield.filter((id) => g.obj(id).defId === BALOTH && g.obj(id).controller === 'p2');
    block(g, [
      [b1!, krenko],
      [b2!, lannery],
    ]);
    endCombat(g);
    expect(gy(g)).toEqual(expect.arrayContaining([KRENKO, 'captain-lannery-storm']));
    expect(g.state.turn.extraCombats).toBe(1);
  });

  it('Éomer dying at the same moment as another attacking legendary creature still triggers (it looks back)', () => {
    const g = setup([EOMER, KRENKO], [BALOTH, 'rumbling-baloth']);
    const eomer = g.id('p1', EOMER);
    const krenko = g.id('p1', KRENKO);
    attack(g, [eomer, krenko]);
    const [b1, b2] = g.state.battlefield.filter((id) => g.obj(id).defId === BALOTH && g.obj(id).controller === 'p2');
    block(g, [
      [b1!, eomer],
      [b2!, krenko],
    ]);
    endCombat(g);
    expect(gy(g)).toEqual(expect.arrayContaining([EOMER, KRENKO]));
    expect(g.state.turn.extraCombats).toBe(1);
  });
});

