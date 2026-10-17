import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  activations,
  attackAnd,
  castAdventure,
  castCreatureFromExile,
  chars,
  exileOf,
  gyOf,
  handOf,
  has,
  ids,
  resolve,
  rolesOn,
  toAttackers,
  toTurn,
} from './woe-red-helpers.ts';

// Wilds of Eldraine (23b): the red cards (continued): Minecart Daredevil to Witchstalker Frenzy.

type Cast = Extract<Action, { type: 'castSpell' }>;
const castActions = (g: ReturnType<typeof game>, def: string): Cast[] => {
  const card = g.id(g.actor, def, 'hand');
  return g.legal().filter((a): a is Cast => a.type === 'castSpell' && a.card === card);
};

// ---------------------------------------------------------------------------
// Minecart Daredevil, Picnic Ruiner, Ratcatcher Trainee
// ---------------------------------------------------------------------------

describe('Minecart Daredevil // Ride the Rails', () => {
  it('is a 4/2, and Ride the Rails gives a creature +2/+1 until end of turn', () => {
    const g = game({
      p1: { hand: ['minecart-daredevil'], battlefield: ['savannah-lions', ...n('mountain', 5)] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    castAdventure(g, 'minecart-daredevil', [g.ref(lions)]);
    resolve(g);
    expect(pt(g, lions)).toEqual([4, 2]);
    expect(exileOf(g)).toEqual(['minecart-daredevil']);
    castCreatureFromExile(g, 'minecart-daredevil');
    resolve(g);
    expect(pt(g, ids(g, 'minecart-daredevil')[0]!)).toEqual([4, 2]);
  });
});

describe('Picnic Ruiner // Stolen Goodies', () => {
  it('gains double strike when it attacks while you control a creature with power 4 or greater', () => {
    const g = game({
      p1: { battlefield: ['picnic-ruiner', 'serra-angel'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const ruiner = ids(g, 'picnic-ruiner')[0]!;
    attackAnd(g, ruiner);
    resolve(g);
    expect(has(g, ruiner, 'doubleStrike')).toBe(true);
  });

  it('does not without such a creature', () => {
    const g = game({
      p1: { battlefield: ['picnic-ruiner', 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const ruiner = ids(g, 'picnic-ruiner')[0]!;
    attackAnd(g, ruiner);
    resolve(g);
    expect(has(g, ruiner, 'doubleStrike')).toBe(false);
  });

  it('Stolen Goodies: distribute three +1/+1 counters among any number of target creatures you control', () => {
    const g = game({
      p1: {
        hand: ['picnic-ruiner'],
        battlefield: ['savannah-lions', 'serra-angel', 'forest', ...n('mountain', 3)],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    const angel = ids(g, 'serra-angel')[0]!;
    castAdventure(g, 'picnic-ruiner');
    g.passBoth();
    const pick = (label: string) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error(`no choice for ${label}`);
      // Never an opponent's creature.
      expect(d.options.some((o) => o.label.includes('Rumbling Baloth'))).toBe(false);
      const index = d.options.findIndex((o) => o.label.startsWith(label));
      expect(index, label).toBeGreaterThanOrEqual(0);
      g.do({ type: 'chooseOption', player: 'p1', index });
    };
    // Zero targets is an option ("any number").
    expect(
      g.decision.kind === 'chooseOption' &&
        g.decision.options.some((o) => o.label === 'No targets'),
    ).toBe(true);
    pick('2 +1/+1 counters on Savannah Lions');
    pick('1 +1/+1 counter on Serra Angel');
    resolve(g);
    expect(g.obj(lions).plusOneCounters).toBe(2);
    expect(g.obj(angel).plusOneCounters).toBe(1);
    expect(exileOf(g)).toEqual(['picnic-ruiner']);
  });

  it('Stolen Goodies may put all three counters on one creature, or choose none', () => {
    const g = game({
      p1: {
        hand: ['picnic-ruiner'],
        battlefield: ['savannah-lions', 'forest', ...n('mountain', 3)],
      },
    });
    castAdventure(g, 'picnic-ruiner');
    g.passBoth();
    const d = g.decision;
    expect(d.kind).toBe('chooseOption');
    const index = (d as { options: { label: string }[] }).options.findIndex((o) =>
      o.label.startsWith('3 +1/+1 counters'),
    );
    g.do({ type: 'chooseOption', player: 'p1', index });
    resolve(g);
    expect(g.obj(ids(g, 'savannah-lions')[0]!).plusOneCounters).toBe(3);
  });
});

describe('Ratcatcher Trainee // Pest Problem', () => {
  it('has first strike during your turn only', () => {
    const g = game({ p1: { battlefield: ['ratcatcher-trainee'] } });
    const trainee = ids(g, 'ratcatcher-trainee')[0]!;
    expect(has(g, trainee, 'firstStrike')).toBe(true);
    const h = game({ active: 'p2', p1: { battlefield: ['ratcatcher-trainee'] } });
    expect(has(h, ids(h, 'ratcatcher-trainee')[0]!, 'firstStrike')).toBe(false);
  });

  it('Pest Problem: two Rat tokens, then the Trainee from exile', () => {
    const g = game({
      p1: { hand: ['ratcatcher-trainee'], battlefield: n('mountain', 5) },
    });
    castAdventure(g, 'ratcatcher-trainee');
    resolve(g);
    expect(ids(g, 'woe-rat-token')).toHaveLength(2);
    expect(exileOf(g)).toEqual(['ratcatcher-trainee']);
    castCreatureFromExile(g, 'ratcatcher-trainee');
    resolve(g);
    expect(pt(g, ids(g, 'ratcatcher-trainee')[0]!)).toEqual([2, 1]);
  });

  it('Pest Problem can be cast at instant speed', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['ratcatcher-trainee'], battlefield: n('mountain', 3) },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    castAdventure(g, 'ratcatcher-trainee');
    resolve(g);
    expect(ids(g, 'woe-rat-token')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Realm-Scorcher Hellkite
// ---------------------------------------------------------------------------

describe('Realm-Scorcher Hellkite', () => {
  it('is a 4/6 flying, haste Dragon that pings for {1}{R}', () => {
    const g = game({
      p1: { battlefield: ['realm-scorcher-hellkite', 'mountain', 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const kite = ids(g, 'realm-scorcher-hellkite')[0]!;
    expect(pt(g, kite)).toEqual([4, 6]);
    expect(has(g, kite, 'flying')).toBe(true);
    expect(has(g, kite, 'haste')).toBe(true);
    expect(chars(g, kite).subtypes).toEqual(['Dragon']);
    const ping = activations(g, kite).find((a) =>
      a.targets.some((t) => 'player' in t && t.player === 'p2'),
    );
    expect(ping).toBeDefined();
    g.do(ping!);
    resolve(g);
    expect(g.life('p2')).toBe(19);
  });

  it('can ping a creature', () => {
    const g = game({
      p1: { battlefield: ['realm-scorcher-hellkite', 'mountain', 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    g.do(
      activations(g, ids(g, 'realm-scorcher-hellkite')[0]!).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === lions),
      )!,
    );
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
  });

  it('not bargained, it adds no mana', () => {
    const g = game({
      p1: { hand: ['realm-scorcher-hellkite'], battlefield: n('mountain', 6) },
    });
    const normal = castActions(g, 'realm-scorcher-hellkite').find((a) => !a.kicked)!;
    g.do(normal);
    resolve(g);
    expect(ids(g, 'realm-scorcher-hellkite')).toHaveLength(1);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });

  it('bargained (sacrificing an artifact, enchantment or token), it adds four mana in any combination of colors', () => {
    const g = game({
      p1: {
        hand: ['realm-scorcher-hellkite', 'rumbling-baloth'],
        battlefield: ['treasure-token', 'savannah-lions', ...n('mountain', 6)],
      },
    });
    const treasure = ids(g, 'treasure-token')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    const bargained = castActions(g, 'realm-scorcher-hellkite').filter((a) => a.kicked);
    // Only the Treasure can be sacrificed (not a nontoken creature, not a land).
    expect(bargained.map((a) => a.sacrifice)).toEqual([treasure]);
    expect(bargained.some((a) => a.sacrifice === lions)).toBe(false);
    g.do(bargained[0]!);
    resolve(g);
    expect(g.zoneOf(treasure)).not.toBe('battlefield');
    const pool = g.state.players.p1.pool ?? [];
    expect(pool).toHaveLength(4);
    for (const m of pool) expect([...m.produces].sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    // Any combination: GG and two more is Rumbling Baloth.
    cast(g, 'rumbling-baloth');
    resolve(g);
    expect(ids(g, 'rumbling-baloth')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Redcap Gutter-Dweller, Redcap Thief
// ---------------------------------------------------------------------------

describe('Redcap Gutter-Dweller', () => {
  it('is a 3/3 with menace that makes two Rats', () => {
    const g = game({ p1: { hand: ['redcap-gutter-dweller'], battlefield: n('mountain', 4) } });
    cast(g, 'redcap-gutter-dweller');
    resolve(g);
    const d = ids(g, 'redcap-gutter-dweller')[0]!;
    expect(pt(g, d)).toEqual([3, 3]);
    expect(has(g, d, 'menace')).toBe(true);
    expect(ids(g, 'woe-rat-token')).toHaveLength(2);
  });

  const toUpkeep = (g: ReturnType<typeof game>) => {
    for (let i = 0; i < 30; i++) {
      if (
        g.state.turn.step === 'upkeep' &&
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.number > 3
      )
        return;
      if (g.decision.kind === 'priority') g.pass();
      else resolve(g);
    }
    throw new Error('never reached the upkeep');
  };

  it('at your upkeep, you may sacrifice another creature: a +1/+1 counter and exile the top card, which you may play this turn', () => {
    const g = game({
      active: 'p2',
      step: 'end',
      p1: {
        battlefield: ['redcap-gutter-dweller', 'savannah-lions', 'mountain'],
        library: ['shock', 'forest', 'forest', 'forest'],
      },
    });
    const dweller = ids(g, 'redcap-gutter-dweller')[0]!;
    toUpkeep(g);
    // The trigger asks (it is "may"): accept.
    resolve(g, { accept: true });
    expect(ids(g, 'savannah-lions')).toHaveLength(0);
    expect(g.obj(dweller).plusOneCounters).toBe(1);
    expect(pt(g, dweller)).toEqual([4, 4]);
    // The top card (it was the Shock, then the draw step took the next forest): exiled during the upkeep, before the draw.
    expect(exileOf(g)).toEqual(['shock']);
    const shock = g.state.players.p1.exile[0]!;
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === shock)).toBe(true);
  });

  it('may decline, and does nothing with no other creature', () => {
    const g = game({
      active: 'p2',
      step: 'end',
      p1: {
        battlefield: ['redcap-gutter-dweller', 'savannah-lions', 'mountain'],
        library: ['shock', 'forest', 'forest', 'forest'],
      },
    });
    toUpkeep(g);
    resolve(g, { accept: false });
    expect(ids(g, 'savannah-lions')).toHaveLength(1);
    expect(g.obj(ids(g, 'redcap-gutter-dweller')[0]!).plusOneCounters).toBe(0);
    expect(exileOf(g)).toEqual([]);
    const lone = game({
      active: 'p2',
      step: 'end',
      p1: { battlefield: ['redcap-gutter-dweller', 'mountain'], library: ['shock', 'forest'] },
    });
    toUpkeep(lone);
    resolve(lone, { accept: true });
    expect(lone.obj(ids(lone, 'redcap-gutter-dweller')[0]!).plusOneCounters).toBe(0);
    expect(exileOf(lone)).toEqual([]);
  });

  it('can sacrifice a Rat token', () => {
    const g = game({
      active: 'p2',
      step: 'end',
      p1: {
        hand: [],
        battlefield: ['redcap-gutter-dweller', 'woe-rat-token'],
        library: ['shock', 'forest', 'forest'],
      },
    });
    toUpkeep(g);
    resolve(g, { accept: true });
    expect(ids(g, 'woe-rat-token')).toHaveLength(0);
    expect(g.obj(ids(g, 'redcap-gutter-dweller')[0]!).plusOneCounters).toBe(1);
  });
});

describe('Redcap Thief', () => {
  it('is a 2/3 that creates a Treasure token when it enters', () => {
    const g = game({ p1: { hand: ['redcap-thief'], battlefield: n('mountain', 3) } });
    cast(g, 'redcap-thief');
    resolve(g);
    expect(pt(g, ids(g, 'redcap-thief')[0]!)).toEqual([2, 3]);
    expect(ids(g, 'treasure-token')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scalding Viper // Steam Clean
// ---------------------------------------------------------------------------

describe('Scalding Viper // Steam Clean', () => {
  it('deals 1 damage to an opponent who casts a spell with mana value 3 or less', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['scalding-viper'] },
      p2: { hand: ['shock', 'cut-in'], battlefield: n('mountain', 5) },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    // The Viper triggers on cast.
    resolve(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(18);
    // Mana value 4: nothing.
    cast(g, 'cut-in', [g.ref(ids(g, 'scalding-viper')[0]!)]);
    resolve(g);
    expect(g.life('p2')).toBe(19);
  });

  it('ignores your own spells', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['scalding-viper', 'mountain'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    resolve(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(18);
  });

  it('Steam Clean: return target nonland permanent to its owner’s hand, then the Viper from exile', () => {
    const g = game({
      p1: { hand: ['scalding-viper'], battlefield: ['island', 'mountain', 'mountain', 'mountain'] },
      p2: { battlefield: ['serra-angel', 'plains'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const plains = g.id('p2', 'plains');
    const targets = g
      .legal()
      .filter((a): a is Cast => a.type === 'castSpell' && a.back === true)
      .flatMap((a) => a.targets);
    // Not a land; yes a creature.
    expect(targets.some((t) => 'object' in t && t.object.id === plains)).toBe(false);
    expect(targets.some((t) => 'object' in t && t.object.id === angel)).toBe(true);
    castAdventure(g, 'scalding-viper', [g.ref(angel)]);
    resolve(g);
    expect(handOf(g, 'p2')).toEqual(['serra-angel']);
    expect(exileOf(g)).toEqual(['scalding-viper']);
    castCreatureFromExile(g, 'scalding-viper');
    resolve(g);
    expect(pt(g, ids(g, 'scalding-viper')[0]!)).toEqual([2, 1]);
  });
});

// ---------------------------------------------------------------------------
// Skewer Slinger
// ---------------------------------------------------------------------------

describe('Skewer Slinger', () => {
  it('deals 1 damage to the creature that it blocks', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['skewer-slinger'] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    const slinger = g.id('p2', 'skewer-slinger');
    expect(pt(g, slinger)).toEqual([1, 3]);
    expect(has(g, slinger, 'reach')).toBe(true);
    attackAnd(g, lions);
    g.block([slinger, lions]);
    resolve(g);
    // The 1 damage kills the 2/1 before combat damage.
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.obj(slinger).damage).toBe(0);
  });

  it('deals 1 damage to each creature that blocks it', () => {
    const g = game({
      p1: { battlefield: ['skewer-slinger'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const slinger = ids(g, 'skewer-slinger')[0]!;
    const lions = g.id('p2', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    attackAnd(g, slinger);
    g.block([lions, slinger], [angel, slinger]);
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.obj(angel).damage).toBeGreaterThanOrEqual(1);
  });

  it('does nothing when it is not blocked or blocking', () => {
    const g = game({
      p1: { battlefield: ['skewer-slinger'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const slinger = ids(g, 'skewer-slinger')[0]!;
    attackAnd(g, slinger);
    g.block();
    finishCombat(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Song of Totentanz, Stonesplitter Bolt
// ---------------------------------------------------------------------------

describe('Song of Totentanz', () => {
  it('creates X Rat tokens, and creatures you control gain haste until end of turn (the Rats too)', () => {
    const g = game({
      p1: { hand: ['song-of-totentanz'], battlefield: ['serra-angel', ...n('mountain', 4)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'song-of-totentanz', [], { x: 3 });
    resolve(g);
    expect(ids(g, 'woe-rat-token')).toHaveLength(3);
    for (const id of [...ids(g, 'woe-rat-token'), ids(g, 'serra-angel')[0]!])
      expect(has(g, id, 'haste')).toBe(true);
    expect(has(g, g.id('p2', 'savannah-lions'), 'haste')).toBe(false);
  });

  it('X can be 0', () => {
    const g = game({ p1: { hand: ['song-of-totentanz'], battlefield: ['mountain'] } });
    cast(g, 'song-of-totentanz', [], { x: 0 });
    resolve(g);
    expect(ids(g, 'woe-rat-token')).toHaveLength(0);
  });
});

describe('Stonesplitter Bolt', () => {
  it('deals X damage to target creature', () => {
    const g = game({
      p1: { hand: ['stonesplitter-bolt'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['realm-scorcher-hellkite'] },
    });
    const kite = g.id('p2', 'realm-scorcher-hellkite');
    const normal = castActions(g, 'stonesplitter-bolt').find(
      (a) => !a.kicked && a.x === 2 && a.targets.some((t) => 'object' in t && t.object.id === kite),
    );
    expect(normal).toBeDefined();
    g.do(normal!);
    resolve(g);
    expect(g.obj(kite).damage).toBe(2);
  });

  it('bargained (sacrificing an artifact, enchantment or token), it deals twice X damage instead', () => {
    const g = game({
      p1: {
        hand: ['stonesplitter-bolt'],
        battlefield: ['treasure-token', 'savannah-lions', ...n('mountain', 3)],
      },
      p2: { battlefield: ['realm-scorcher-hellkite'] },
    });
    const kite = g.id('p2', 'realm-scorcher-hellkite');
    const treasure = ids(g, 'treasure-token')[0]!;
    const acts = castActions(g, 'stonesplitter-bolt').filter(
      (a) => a.kicked && a.x === 2 && a.targets.some((t) => 'object' in t && t.object.id === kite),
    );
    expect(acts.map((a) => a.sacrifice)).toEqual([treasure]);
    g.do(acts[0]!);
    resolve(g);
    expect(g.zoneOf(treasure)).not.toBe('battlefield');
    expect(g.obj(kite).damage).toBe(4);
  });

  it('targets creatures and planeswalkers only, never players', () => {
    const g = game({
      p1: { hand: ['stonesplitter-bolt'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['savannah-lions'] },
    });
    const all = castActions(g, 'stonesplitter-bolt');
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.targets.every((t) => 'object' in t))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tattered Ratter, Twisted Fealty, Two-Headed Hunter
// ---------------------------------------------------------------------------

/** Passes priority until combat is over (the second main phase). */
function finishCombat(g: ReturnType<typeof game>): void {
  for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else resolve(g);
  }
  expect(g.state.turn.step).toBe('main2');
}

describe('Tattered Ratter', () => {
  it('a Rat you control that becomes blocked gets +2/+0', () => {
    const g = game({
      p1: { battlefield: ['tattered-ratter', 'woe-rat-token', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'rumbling-baloth'] },
    });
    const rat = ids(g, 'woe-rat-token')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    attackAnd(g, rat, lions);
    g.block([g.id('p2', 'serra-angel'), rat], [g.id('p2', 'rumbling-baloth'), lions]);
    resolve(g);
    expect(pt(g, rat)).toEqual([3, 1]);
    // The Lions are no Rat.
    expect(pt(g, lions)).toEqual([2, 1]);
  });

  it('does not pump an unblocked Rat', () => {
    const g = game({
      p1: { battlefield: ['tattered-ratter', 'woe-rat-token'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const rat = ids(g, 'woe-rat-token')[0]!;
    attackAnd(g, rat);
    g.block();
    resolve(g);
    expect(pt(g, rat)).toEqual([1, 1]);
  });

  it('only your Rats: an opponent’s Rat that becomes blocked is unaffected', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['tattered-ratter', 'serra-angel'] },
      p2: { battlefield: ['woe-rat-token'] },
    });
    const rat = ids(g, 'woe-rat-token', 'p2')[0]!;
    attackAnd(g, rat);
    g.block([g.id('p1', 'serra-angel'), rat]);
    resolve(g);
    expect(pt(g, rat)).toEqual([1, 1]);
  });
});

describe('Twisted Fealty', () => {
  it('gain control of target creature until end of turn, untap it, haste; a Wicked Role on up to one target creature', () => {
    const g = game({
      p1: { hand: ['twisted-fealty'], battlefield: ['savannah-lions', ...n('mountain', 3)] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'twisted-fealty', [g.ref(angel), g.ref(lions)]);
    resolve(g);
    expect(g.obj(angel).controller).toBe('p1');
    expect(g.obj(angel).tapped).toBe(false);
    expect(has(g, angel, 'haste')).toBe(true);
    expect(rolesOn(g, lions)).toEqual(['woe-wicked-role']);
    expect(pt(g, lions)).toEqual([3, 2]);
    // Until end of turn.
    toTurn(g, 4);
    expect(g.obj(angel).controller).toBe('p2');
    expect(has(g, angel, 'haste')).toBe(false);
  });

  it('the Role may be left out, or go on the stolen creature itself', () => {
    const g = game({
      p1: { hand: ['twisted-fealty'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const options = castActions(g, 'twisted-fealty');
    expect(options.some((a) => a.targets.length === 1)).toBe(true);
    expect(options.some((a) => a.targets.length === 2)).toBe(true);
    cast(g, 'twisted-fealty', [g.ref(angel), g.ref(angel)]);
    resolve(g);
    expect(g.obj(angel).controller).toBe('p1');
    expect(rolesOn(g, angel)).toEqual(['woe-wicked-role']);
    expect(pt(g, angel)).toEqual([5, 5]);
  });

  it('the Wicked Role drains when it goes to the graveyard', () => {
    const g = game({
      p1: {
        hand: ['twisted-fealty', 'shock'],
        battlefield: ['savannah-lions', ...n('mountain', 4)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'twisted-fealty', [g.ref(g.id('p2', 'serra-angel')), g.ref(lions)]);
    resolve(g);
    cast(g, 'shock', [g.ref(lions)]);
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.life('p2')).toBe(19);
  });
});

describe('Two-Headed Hunter // Twice the Rage', () => {
  it('Twice the Rage: target creature gains double strike until end of turn; then the 5/4 menace Hunter', () => {
    const g = game({
      p1: { hand: ['two-headed-hunter'], battlefield: ['savannah-lions', ...n('mountain', 7)] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    castAdventure(g, 'two-headed-hunter', [g.ref(lions)]);
    resolve(g);
    expect(has(g, lions, 'doubleStrike')).toBe(true);
    castCreatureFromExile(g, 'two-headed-hunter');
    resolve(g);
    const hunter = ids(g, 'two-headed-hunter')[0]!;
    expect(pt(g, hunter)).toEqual([5, 4]);
    expect(has(g, hunter, 'menace')).toBe(true);
    toTurn(g, 4);
    expect(has(g, lions, 'doubleStrike')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Witch's Mark, Witchstalker Frenzy
// ---------------------------------------------------------------------------

describe('Witch’s Mark', () => {
  it('may discard a card; if you do, draw two cards; and a Wicked Role on up to one target creature you control', () => {
    const g = game({
      p1: {
        hand: ['witchs-mark', 'mountain'],
        battlefield: ['savannah-lions', ...n('mountain', 2)],
        library: ['forest', 'island', 'swamp'],
      },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'witchs-mark', [g.ref(lions)]);
    resolve(g, { accept: true });
    expect(gyOf(g)).toContain('mountain');
    expect(handOf(g)).toEqual(['forest', 'island']);
    expect(rolesOn(g, lions)).toEqual(['woe-wicked-role']);
  });

  it('if you do not discard, you do not draw — but the Role is still made', () => {
    const g = game({
      p1: {
        hand: ['witchs-mark', 'mountain'],
        battlefield: ['savannah-lions', ...n('mountain', 2)],
        library: ['forest', 'island', 'swamp'],
      },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'witchs-mark', [g.ref(lions)]);
    resolve(g, { accept: false });
    expect(handOf(g)).toEqual(['mountain']);
    expect(rolesOn(g, lions)).toEqual(['woe-wicked-role']);
  });

  it('with an empty hand there is nothing to discard, so nothing is drawn', () => {
    const g = game({
      p1: { hand: ['witchs-mark'], battlefield: n('mountain', 2), library: ['forest', 'island'] },
    });
    cast(g, 'witchs-mark');
    resolve(g, { accept: true });
    expect(handOf(g)).toEqual([]);
  });

  it('the creature target is optional and can only be yours', () => {
    const g = game({
      p1: { hand: ['witchs-mark'], battlefield: ['savannah-lions', ...n('mountain', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const options = castActions(g, 'witchs-mark');
    expect(options.some((a) => a.targets.length === 0)).toBe(true);
    const theirs = g.id('p2', 'serra-angel');
    expect(
      options.some((a) => a.targets.some((t) => 'object' in t && t.object.id === theirs)),
    ).toBe(false);
  });
});

describe('Witchstalker Frenzy', () => {
  it('costs {1} less for each creature that attacked this turn', () => {
    const g = game({
      p1: {
        hand: ['witchstalker-frenzy'],
        battlefield: ['savannah-lions', 'harried-spearguard', 'mountain', 'mountain'],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    // {3}{R} with two lands: not before anything attacked.
    expect(castActions(g, 'witchstalker-frenzy')).toHaveLength(0);
    toAttackers(g);
    g.attack(ids(g, 'savannah-lions')[0]!, ids(g, 'harried-spearguard')[0]!);
    // Two creatures attacked: {1}{R}.
    expect(castActions(g, 'witchstalker-frenzy').length).toBeGreaterThan(0);
  });

  it('with two attackers costs {1}{R}; with three, {R}; deals 5 damage to target creature', () => {
    const g = game({
      p1: {
        hand: ['witchstalker-frenzy'],
        battlefield: ['savannah-lions', 'harried-spearguard', 'edgewall-pack', 'mountain'],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    toAttackers(g);
    g.attack(
      ids(g, 'savannah-lions')[0]!,
      ids(g, 'harried-spearguard')[0]!,
      ids(g, 'edgewall-pack')[0]!,
    );
    // Three attackers: {3}{R} costs just {R}.
    const acts = castActions(g, 'witchstalker-frenzy').filter((a) =>
      a.targets.some((t) => 'object' in t && t.object.id === baloth),
    );
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    resolve(g);
    expect(g.zoneOf(baloth)).toBe('graveyard');
  });

  it('counts the opponent’s attackers too', () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['witchstalker-frenzy'], battlefield: ['mountain'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel', 'rumbling-baloth'] },
    });
    const attackers = ['savannah-lions', 'serra-angel', 'rumbling-baloth'].map((d) =>
      g.id('p2', d),
    );
    toAttackers(g);
    g.attack(...attackers);
    // p2 passes with the declare attackers step; p1 may cast the spell for {R}.
    g.pass();
    expect(g.actor).toBe('p1');
    const acts = castActions(g, 'witchstalker-frenzy').filter((a) =>
      a.targets.some((t) => 'object' in t && t.object.id === attackers[2]),
    );
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    resolve(g);
    expect(g.zoneOf(attackers[2]!)).toBe('graveyard');
  });
});
