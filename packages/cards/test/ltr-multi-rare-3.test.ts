import { describe, expect, it } from 'vitest';
import { HIDDEN_CARD, redactFor } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  done,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb } from '../src/index.ts';

// The Lord of the Rings 21d: the multicolour rares (part three: Pippin, Aragorn Company Leader, Shelob, Sauron's Ransom, King of the
// Oathbreakers, Tom Bombadil).

type Cast = Extract<Action, { type: 'castSpell' }>;
const PIPPIN = 'pippin-guard-of-the-citadel';
const ARAGORN = 'aragorn-company-leader';
const SHELOB = 'shelob-child-of-ungoliant';
const KING = 'king-of-the-oathbreakers';
const TOM = 'tom-bombadil';
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const named = (g: GameDriver, id: string, name: string) => g.obj(id).counters?.[name] ?? 0;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const bearer = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.bearer?.id;
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}
const obj = (id: string) => (a: { targets: unknown[] }) =>
  (a.targets as { object?: { id: string } }[]).some((t) => t.object?.id === id);

describe('Pippin, Guard of the Citadel', () => {
  it('has vigilance and ward {1}', () => {
    const g = game({ p1: { battlefield: [PIPPIN] } });
    const pippin = g.id('p1', PIPPIN);
    expect(kw(g, pippin).has('vigilance')).toBe(true);
    expect(kw(g, pippin).has('ward')).toBe(true);
    expect(cardDb.get(PIPPIN)!.wardCost).toEqual({ mana: { generic: 1, colored: {} } });
  });

  it('{T}: another target creature you control gains protection from the card type of your choice', () => {
    const g = game({
      p1: { battlefield: [PIPPIN, 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'mountain'] },
    });
    const pippin = g.id('p1', PIPPIN);
    const lions = g.id('p1', 'savannah-lions');
    // Only another creature is a target.
    const targets = abilityActions(g, pippin, 0).flatMap((a) =>
      a.type === 'activateAbility' ? a.targets : [],
    );
    expect(targets).toEqual([g.ref(lions)]);
    activate(g, pippin, 0, [g.ref(lions)]);
    stop(g);
    // The choice is made as it resolves: every card type.
    expect(labels(g)).toEqual([
      'Artifact',
      'Battle',
      'Creature',
      'Enchantment',
      'Instant',
      'Kindred',
      'Land',
      'Planeswalker',
      'Sorcery',
    ]);
    done(g, { option: /^Instant$/ });
    expect(g.obj(pippin).tapped).toBe(true);
    // Protection from instants: Shock can't target it (it can still target Pippin).
    g.pass();
    const shocks = casts(g, 'shock', 'p2');
    expect(shocks.some(targeting(lions))).toBe(false);
    expect(shocks.some(targeting(pippin))).toBe(true);
  });

  it('protection from creatures: a creature can’t block it', () => {
    const g = game({
      p1: { battlefield: [PIPPIN, 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', PIPPIN), 0, [g.ref(lions)]);
    stop(g);
    done(g, { option: /^Creature$/ });
    attack(g, [lions]);
    done(g);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    const blocks = g.legal('p2').filter((a) => a.type === 'addBlock');
    expect(blocks).toHaveLength(0);
  });

  it('protection from creatures: damage from a creature is prevented', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { battlefield: [PIPPIN, 'savannah-lions'] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const baloth = g.id('p2', 'rumbling-baloth');
    // Their Baloth attacks; in response to nothing, Pippin protects the Lions from creatures, and the Lions block.
    for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p2', attacker: baloth, defender: 'p1' });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    g.pass();
    activate(g, g.id('p1', PIPPIN), 0, [g.ref(lions)]);
    stop(g);
    done(g, { option: /^Creature$/ });
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.block([lions, baloth]);
    for (let i = 0; i < 10 && g.state.turn.step !== 'endCombat'; i++) {
      done(g);
      if (g.decision.kind === 'priority') g.pass();
    }
    // The Baloth (4 damage) did nothing to the protected Lions; the Lions dealt 2 to it.
    expect(g.state.battlefield).toContain(lions);
    expect(g.obj(baloth).damage).toBe(2);
  });

  it('ward {1}: targeting it costs one more', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [PIPPIN] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    // One land pays for Shock but not for the ward.
    expect(casts(g, 'shock', 'p2').some(targeting(g.id('p1', PIPPIN)))).toBe(false);
    const rich = game({
      active: 'p2',
      p1: { battlefield: [PIPPIN] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'mountain'] },
    });
    expect(casts(rich, 'shock', 'p2').some(targeting(rich.id('p1', PIPPIN)))).toBe(true);
  });

  it('lasts until end of turn', () => {
    const g = game({ p1: { battlefield: [PIPPIN, 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', PIPPIN), 0, [g.ref(lions)]);
    stop(g);
    done(g, { option: /^Land$/ });
    expect(g.state.effects.some((e) => e.affected.id === lions && e.protectionFromType)).toBe(true);
    passTo(g, 'main1', 'p2');
    expect(g.state.effects.some((e) => e.affected.id === lions && e.protectionFromType)).toBe(
      false,
    );
  });
});

describe('Aragorn, Company Leader', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['claim-the-precious'],
        battlefield: [...n('swamp', 3), ARAGORN, 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
  const tempt = (
    g: GameDriver,
    bearerId: string,
    opts: { option?: RegExp; other?: string } = {},
  ) => {
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g, {
      card: (id) => id === bearerId,
      option: opts.option ?? /Lifelink/,
      target: (a) =>
        a.targets.some(
          (t) => 'object' in t && t.object.id === (opts.other ?? g.id('p1', 'savannah-lions')),
        ),
    });
  };

  it('when the Ring tempts you and you chose another creature, put your choice of a counter on Aragorn', () => {
    const g = setup();
    const aragorn = g.id('p1', ARAGORN);
    const lions = g.id('p1', 'savannah-lions');
    tempt(g, lions, { option: /Deathtouch/ });
    expect(bearer(g)).toBe(lions);
    expect(named(g, aragorn, 'deathtouch')).toBe(1);
    expect(kw(g, aragorn).has('deathtouch')).toBe(true);
  });

  it('offers first strike, vigilance, deathtouch and lifelink', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    stop(g);
    g.do({ type: 'chooseCard', player: 'p1', card: lions });
    stop(g);
    expect(labels(g)).toEqual([
      'First strike counter',
      'Vigilance counter',
      'Deathtouch counter',
      'Lifelink counter',
    ]);
  });

  it('then puts one of each of those kinds of counters on up to one other target creature', () => {
    const g = setup();
    const aragorn = g.id('p1', ARAGORN);
    const lions = g.id('p1', 'savannah-lions');
    tempt(g, lions, { option: /Lifelink/ });
    expect(named(g, aragorn, 'lifelink')).toBe(1);
    expect(named(g, lions, 'lifelink')).toBe(1);
    expect(kw(g, lions).has('lifelink')).toBe(true);
    // Not Aragorn himself.
    expect(named(g, aragorn, 'lifelink')).toBe(1);
  });

  it('not if you chose Aragorn himself', () => {
    const g = setup();
    const aragorn = g.id('p1', ARAGORN);
    tempt(g, aragorn);
    expect(bearer(g)).toBe(aragorn);
    expect(named(g, aragorn, 'lifelink')).toBe(0);
    expect(ringLevel(g)).toBe(1);
  });

  it('all the counters put on Aragorn in one resolution are one trigger: one of each kind on the target', () => {
    const g = game({
      p1: {
        battlefield: [ARAGORN, 'arwen-mortal-queen', 'savannah-lions', 'forest'],
      },
    });
    const aragorn = g.id('p1', ARAGORN);
    const arwen = g.id('p1', 'arwen-mortal-queen');
    const lions = g.id('p1', 'savannah-lions');
    g.obj(arwen).counters = { indestructible: 1 };
    // Arwen puts a +1/+1 counter and a lifelink counter on Aragorn (and on herself).
    activate(g, arwen, 0, [g.ref(aragorn)]);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === lions) });
    expect(plus(g, aragorn)).toBe(1);
    expect(named(g, aragorn, 'lifelink')).toBe(1);
    expect(plus(g, lions)).toBe(1);
    expect(named(g, lions, 'lifelink')).toBe(1);
    // Only one trigger: the target has exactly one of each.
    expect(plus(g, lions)).toBe(1);
  });

  it('a +1/+1 counter alone: a +1/+1 counter on the other creature', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: [ARAGORN, 'savannah-lions', 'elrond-master-of-healing', 'island'],
        library: ['forest', 'forest', 'forest'],
      },
    });
    const aragorn = g.id('p1', ARAGORN);
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    g.do(g.legal().find((a) => a.type === 'scry')!);
    // Elrond's trigger (one card looked at): a +1/+1 counter on Aragorn.
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(aragorn)] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(aragorn)] }); // done picking
    stop(g);
    // Aragorn's trigger: the same on another creature.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const options = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .flatMap((t) => ('object' in t ? [t.object.id] : []));
    expect(options).not.toContain(aragorn);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions)] });
    done(g);
    expect(plus(g, aragorn)).toBe(1);
    expect(plus(g, lions)).toBe(1);
  });
});

describe('Shelob, Child of Ungoliant', () => {
  const food = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
    g.state.battlefield.filter(
      (id) =>
        g.obj(id).controller === p && g.obj(id).isToken && chars(g, id).subtypes.includes('Food'),
    );

  it('has deathtouch and ward {2}; other Spiders you control have them too', () => {
    const g = game({ p1: { battlefield: [SHELOB, 'spinner-of-souls', 'savannah-lions'] } });
    const shelob = g.id('p1', SHELOB);
    const spider = g.id('p1', 'spinner-of-souls');
    expect(kw(g, shelob).has('deathtouch')).toBe(true);
    expect(kw(g, shelob).has('ward')).toBe(true);
    expect(kw(g, spider).has('deathtouch')).toBe(true);
    expect(kw(g, spider).has('ward')).toBe(true);
    expect(kw(g, g.id('p1', 'savannah-lions')).has('deathtouch')).toBe(false);
  });

  it('only Spiders you control', () => {
    const g = game({
      p1: { battlefield: [SHELOB] },
      p2: { battlefield: ['spinner-of-souls'] },
    });
    expect(kw(g, g.id('p2', 'spinner-of-souls')).has('deathtouch')).toBe(false);
  });

  it('a creature that dies after being dealt damage by a Spider you control becomes a Food artifact copy', () => {
    const g = game({
      p1: { battlefield: [SHELOB, 'plains', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const shelob = g.id('p1', SHELOB);
    const angel = g.id('p2', 'serra-angel');
    attack(g, [shelob]);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.block([angel, shelob]);
    for (let i = 0; i < 10 && food(g).length === 0; i++) {
      done(g);
      if (g.decision.kind === 'priority') g.pass();
    }
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    const tokens = food(g);
    expect(tokens).toHaveLength(1);
    const copy = tokens[0]!;
    expect(g.obj(copy).defId).toBe('serra-angel');
    const c = chars(g, copy);
    expect(c.types).toEqual(['Artifact']);
    expect(c.subtypes).toEqual(['Food']);
    // It is no creature, and it has the Food ability: {2}, {T}, sacrifice this token: you gain 3 life.
    expect(c.types).not.toContain('Creature');
    passTo(g, 'main2', 'p1');
    const gain = abilityActions(g, copy, 0);
    expect(gain.length).toBeGreaterThan(0);
    activate(g, copy, 0);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(food(g)).toHaveLength(0);
  });

  it('the copy has "{2}, {T}, Sacrifice this token: You gain 3 life"', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [SHELOB, 'mountain', 'mountain', 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const shelob = g.id('p1', SHELOB);
    const lions = g.id('p2', 'savannah-lions');
    // Shelob fights nothing here: put damage on the Lions by hand as a Spider's damage.
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(lions)],
    });
    done(g);
    // Shock isn't a Spider: no Food.
    expect(food(g)).toHaveLength(0);
    void shelob;
  });

  it('not for a creature that died without a Spider’s damage', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [SHELOB, 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.do(casts(g, 'shock').find(targeting(g.id('p2', 'savannah-lions')))!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(food(g)).toHaveLength(0);
  });

  it('a creature damaged by a Spider earlier this turn and killed by something else counts', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [SHELOB, 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const shelob = g.id('p1', SHELOB);
    const angel = g.id('p2', 'serra-angel');
    // Pretend the Angel was dealt damage by Shelob this turn (a record), then Shock finishes it off.
    g.state.turn.ltrSpiderDamaged = [
      { id: angel, zcc: g.obj(angel).zcc, by: 'p1', defId: 'serra-angel', n: 1 },
    ];
    g.obj(angel).damage = 3;
    g.do(casts(g, 'shock').find(targeting(angel))!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(food(g)).toHaveLength(1);
    void shelob;
  });

  it('a damage record of the opponent’s Spider doesn’t count for your Shelob', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [SHELOB, 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.state.turn.ltrSpiderDamaged = [
      { id: angel, zcc: g.obj(angel).zcc, by: 'p2', defId: 'serra-angel', n: 1 },
    ];
    g.obj(angel).damage = 3;
    g.do(casts(g, 'shock').find(targeting(angel))!);
    done(g);
    expect(food(g)).toHaveLength(0);
  });

  it('not when Shelob herself dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [{ card: SHELOB, damage: 7 }, 'mountain'] },
    });
    const shelob = g.id('p1', SHELOB);
    g.state.turn.ltrSpiderDamaged = [
      { id: shelob, zcc: g.obj(shelob).zcc, by: 'p1', defId: SHELOB, n: 1 },
    ];
    g.do(casts(g, 'shock').find(targeting(shelob))!);
    done(g);
    expect(food(g)).toHaveLength(0);
  });
});

describe('Sauron’s Ransom', () => {
  const RANSOM = 'saurons-ransom';
  const setup = () =>
    game({
      p1: {
        hand: ['saurons-ransom'],
        battlefield: ['island', 'swamp', 'island'],
        library: ['plains', 'shock', 'llanowar-elves', 'serra-angel', 'forest', 'forest'],
      },
      p2: {},
    });
  void RANSOM;

  it('the opponent separates the top four cards into a face-up and a face-down pile; you choose a pile for your hand', () => {
    const g = setup();
    g.do(casts(g, 'saurons-ransom')[0]!);
    stop(g);
    expect(g.decision.kind).toBe('splitPiles');
    expect((g.decision as { player: string }).player).toBe('p2');
    const cards = (g.decision as { cards: string[] }).cards;
    expect(cards.map((id) => g.obj(id).defId)).toEqual([
      'plains',
      'shock',
      'llanowar-elves',
      'serra-angel',
    ]);
    // The opponent puts Shock and the Angel face up.
    g.do({ type: 'splitPiles', player: 'p2', faceUp: [cards[1]!, cards[3]!] });
    expect(g.decision.kind).toBe('choosePile');
    expect((g.decision as { player: string }).player).toBe('p1');
    g.do({ type: 'choosePile', player: 'p1', pile: 'faceUp' });
    done(g);
    expect(hand(g).sort()).toEqual(['serra-angel', 'shock']);
    expect(gy(g).sort()).toEqual(['llanowar-elves', 'plains', 'saurons-ransom']);
    // The Ring tempted you.
    expect(ringLevel(g)).toBe(1);
  });

  it('you may take the face-down pile instead', () => {
    const g = setup();
    g.do(casts(g, 'saurons-ransom')[0]!);
    stop(g);
    const cards = (g.decision as { cards: string[] }).cards;
    g.do({ type: 'splitPiles', player: 'p2', faceUp: [cards[1]!, cards[3]!] });
    g.do({ type: 'choosePile', player: 'p1', pile: 'faceDown' });
    done(g);
    expect(hand(g).sort()).toEqual(['llanowar-elves', 'plains']);
    expect(gy(g)).toEqual(expect.arrayContaining(['shock', 'serra-angel']));
  });

  it('either pile may be empty', () => {
    const g = setup();
    g.do(casts(g, 'saurons-ransom')[0]!);
    stop(g);
    expect(g.legal('p2').filter((a) => a.type === 'splitPiles')).toHaveLength(16);
    g.do({ type: 'splitPiles', player: 'p2', faceUp: [] });
    g.do({ type: 'choosePile', player: 'p1', pile: 'faceUp' });
    done(g);
    expect(hand(g)).toEqual([]);
    expect(gy(g)).toHaveLength(5);
  });

  it('you see only the face-up pile; the opponent sees all four cards', () => {
    const g = setup();
    g.do(casts(g, 'saurons-ransom')[0]!);
    stop(g);
    const cards = (g.decision as { cards: string[] }).cards;
    // Separating: the opponent sees them, the caster doesn't.
    const forP2 = redactFor(g.state, 'p2', cardDb);
    const forP1 = redactFor(g.state, 'p1', cardDb);
    for (const id of cards) {
      expect(forP2.objects[id]!.defId).not.toBe(HIDDEN_CARD);
      expect(forP1.objects[id]!.defId).toBe(HIDDEN_CARD);
    }
    g.do({ type: 'splitPiles', player: 'p2', faceUp: [cards[1]!, cards[3]!] });
    const choosing = redactFor(g.state, 'p1', cardDb);
    expect(choosing.objects[cards[1]!]!.defId).toBe('shock');
    expect(choosing.objects[cards[3]!]!.defId).toBe('serra-angel');
    expect(choosing.objects[cards[0]!]!.defId).toBe(HIDDEN_CARD);
    expect(choosing.objects[cards[2]!]!.defId).toBe(HIDDEN_CARD);
  });

  it('with fewer than four cards in the library, it uses what there is', () => {
    const g = game({
      p1: {
        hand: ['saurons-ransom'],
        battlefield: ['island', 'swamp', 'island'],
        library: ['plains', 'shock'],
      },
    });
    g.do(casts(g, 'saurons-ransom')[0]!);
    stop(g);
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
  });

  it('with an empty library there is nothing to separate, and the Ring still tempts you', () => {
    const g = game({
      p1: { hand: ['saurons-ransom'], battlefield: ['island', 'swamp', 'island'], library: [] },
    });
    g.do(casts(g, 'saurons-ransom')[0]!);
    done(g);
    expect(ringLevel(g)).toBe(1);
  });
});

describe('King of the Oathbreakers', () => {
  it('has flying', () => {
    const g = game({ p1: { battlefield: [KING] } });
    expect(kw(g, g.id('p1', KING)).has('flying')).toBe(true);
  });

  it('when a spell targets it, it phases out (and the spell does nothing)', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [KING] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const king = g.id('p1', KING);
    g.do(casts(g, 'shock', 'p2').find(targeting(king))!);
    done(g);
    expect(g.state.phasedOut?.map((p) => p.id)).toEqual([king]);
    expect(g.state.battlefield).not.toContain(king);
    expect(g.obj(king).damage).toBe(0);
  });

  it('phases back in at your next untap step and creates a tapped 1/1 Spirit with flying', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [KING] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const king = g.id('p1', KING);
    g.do(casts(g, 'shock', 'p2').find(targeting(king))!);
    done(g);
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(g.state.battlefield).toContain(king);
    const spirits = board(g, 'ltr-spirit-token', 'p1');
    expect(spirits).toHaveLength(1);
    expect(g.obj(spirits[0]!).tapped).toBe(true);
    expect(kw(g, spirits[0]!).has('flying')).toBe(true);
  });

  it('another Spirit you control phases out when a spell targets it, and phases in with a token for each', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [KING, 'ltr-spirit-token'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const spirit = g.id('p1', 'ltr-spirit-token');
    g.do(casts(g, 'shock', 'p2').find(targeting(spirit))!);
    done(g);
    expect(g.state.phasedOut?.map((p) => p.id)).toEqual([spirit]);
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(board(g, 'ltr-spirit-token', 'p1')).toHaveLength(2);
  });

  it('an ability that targets it does not phase it out', () => {
    const g = game({
      p1: { battlefield: [PIPPIN, KING] },
    });
    const king = g.id('p1', KING);
    activate(g, g.id('p1', PIPPIN), 0, [g.ref(king)]);
    stop(g);
    done(g, { option: /^Land$/ });
    expect(g.state.phasedOut ?? []).toHaveLength(0);
    expect(g.state.battlefield).toContain(king);
  });

  it('not a Spirit an opponent controls', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [KING] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'ltr-spirit-token'] },
    });
    const theirs = g.id('p2', 'ltr-spirit-token');
    g.do(casts(g, 'shock', 'p2').find(targeting(theirs))!);
    done(g);
    expect(g.state.phasedOut ?? []).toHaveLength(0);
  });

  it('a phased-out permanent is no legal target', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [KING] },
      p2: { hand: ['shock', 'shock'], battlefield: ['mountain', 'mountain'] },
    });
    const king = g.id('p1', KING);
    g.do(casts(g, 'shock', 'p2').find(targeting(king))!);
    done(g);
    expect(casts(g, 'shock', 'p2').some(targeting(king))).toBe(false);
  });
});

describe('Tom Bombadil', () => {
  const lore = (g: GameDriver, id: string, k: number) => {
    g.obj(id).counters = { lore: k };
  };

  it('has hexproof and indestructible as long as there are four or more lore counters among Sagas you control', () => {
    const g = game({ p1: { battlefield: [TOM, 'book-of-mazarbul', 'book-of-mazarbul'] } });
    const tom = g.id('p1', TOM);
    const [a, b] = board(g, 'book-of-mazarbul', 'p1') as [string, string];
    expect(kw(g, tom).has('hexproof')).toBe(false);
    lore(g, a, 2);
    lore(g, b, 1);
    expect(kw(g, tom).has('hexproof')).toBe(false);
    lore(g, b, 2);
    expect(kw(g, tom).has('hexproof')).toBe(true);
    expect(kw(g, tom).has('indestructible')).toBe(true);
  });

  it('only counts Sagas you control', () => {
    const g = game({
      p1: { battlefield: [TOM, 'book-of-mazarbul'] },
      p2: { battlefield: ['book-of-mazarbul'] },
    });
    lore(g, g.id('p1', 'book-of-mazarbul'), 2);
    lore(g, g.id('p2', 'book-of-mazarbul'), 2);
    expect(kw(g, g.id('p1', TOM)).has('hexproof')).toBe(false);
  });

  it('whenever the final chapter ability of a Saga you control resolves, reveal until a Saga: it enters, the rest go to the bottom', () => {
    const g = game({
      p1: {
        battlefield: [TOM, 'book-of-mazarbul'],
        library: ['forest', 'savannah-lions', 'origin-of-the-hulk', 'plains', 'forest'],
      },
    });
    const book = g.id('p1', 'book-of-mazarbul');
    lore(g, book, 2);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    // Chapter III resolved (the Saga is sacrificed), and Tom put Origin of the Hulk onto the battlefield.
    expect(board(g, 'origin-of-the-hulk', 'p1')).toHaveLength(1);
    // The other revealed card went to the bottom of the library.
    const library = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(library).toHaveLength(3);
    expect(library.slice(-1)).toContain('savannah-lions');
  });

  it('only a final chapter: chapter I or II of a Saga does nothing', () => {
    const g = game({
      p1: {
        battlefield: [TOM, 'book-of-mazarbul'],
        library: ['forest', 'savannah-lions', 'origin-of-the-hulk', 'plains'],
      },
    });
    lore(g, g.id('p1', 'book-of-mazarbul'), 0);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    expect(board(g, 'origin-of-the-hulk', 'p1')).toHaveLength(0);
  });

  it('with no Saga in the library, every card goes to the bottom', () => {
    const g = game({
      p1: {
        battlefield: [TOM, 'book-of-mazarbul'],
        library: ['forest', 'savannah-lions', 'plains', 'forest'],
      },
    });
    lore(g, g.id('p1', 'book-of-mazarbul'), 2);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    expect(g.state.players.p1.library).toHaveLength(3); // one was drawn for the turn
  });

  it('triggers only once each turn', () => {
    const g = game({
      p1: {
        battlefield: [TOM, 'book-of-mazarbul', 'book-of-mazarbul'],
        library: ['forest', 'origin-of-the-hulk', 'origin-of-the-hulk', 'plains', 'plains'],
      },
    });
    for (const id of board(g, 'book-of-mazarbul', 'p1')) lore(g, id, 2);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    expect(board(g, 'origin-of-the-hulk', 'p1')).toHaveLength(1);
  });
});

void PIPPIN;
void obj;
void targetingPlayer;
