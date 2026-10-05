import { GameDriver, buildScenario } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, type Action } from '@mtg/engine';
import { def, makeCtx, moveObject, untap } from '../../engine/src/context.ts';
import { matchesFilter, hasSubtype } from '../../engine/src/characteristics.ts';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

const IRON = slug('Iron Man, Bleeding Edge');
const HAPPY = slug('Happy Hogan, Bodyguard');
const SUITCASE = 'iron-suitcase';
const ORIGIN = 'origin-of-iron-man';
type G = ReturnType<typeof game>;

function resolve(g: G, accept = true, pick?: (legal: Action[]) => Action | undefined): G {
  for (let i = 0; i < 100; i++) {
    const d = g.decision;
    if (d.kind === 'priority') {
      if (!g.state.stack.length && !g.state.pendingTriggers.length) return g;
      g.pass();
    } else if (d.kind === 'optionalEffect') {
      g.do({ type: 'chooseEffect', player: g.actor, accept });
    } else {
      const legal = g.legal();
      g.do(
        pick?.(legal) ??
          legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
          legal[0]!,
      );
    }
  }
  throw new Error('Resolution exceeded bound');
}
function nextTurn(g: G) {
  const number = g.state.turn.number;
  for (let i = 0; i < 100; i++) {
    resolve(g, true, (legal) => legal.find((a) => a.type === 'chooseCard' && a.card !== null));
    if (g.state.turn.number > number && g.state.turn.step === 'main1') return g;
    const d = g.decision;
    if (d.kind === 'priority') g.pass();
    else g.do(g.legal()[0]!);
  }
  throw new Error('Turn exceeded bound');
}
function animate(g: G, id = g.id('p1', SUITCASE)) {
  return settle(
    g.do({ type: 'activateAbility', player: g.actor, source: id, abilityIndex: 1, targets: [] }),
  );
}

describe('Iron Man packet', () => {
  it('contains every card in the official packet', () => {
    const names = [
      'Hydraulic Helper',
      'Rescue, Pepper Potts',
      'S.H.I.E.L.D. Deployment Drone',
      'Iron Lad, Young Avenger',
      'War Machine, James Rhodes',
      'Iron Man, Bleeding Edge',
      'Happy Hogan, Bodyguard',
      'Iron Suitcase',
      "Collector's Case",
      'Futurist Forge',
      'I Am Iron Man',
      'Origin of Iron Man',
      'Thriving Isle',
      'Island',
    ];
    expect(names.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Iron Man, Bleeding Edge', () => {
  it('has flying and copies artifact spells as nonlegendary tokens; declining preserves the use', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 12)], hand: [SUITCASE, SUITCASE, IRON, SUITCASE] },
    });
    expect(getCharacteristics(g.state, cardDb, g.id('p1', IRON)).keywords.has('flying')).toBe(true);
    resolve(cast(g, SUITCASE), false);
    expect(all(g, SUITCASE)).toHaveLength(1);
    resolve(cast(g, IRON));
    const men = all(g, IRON);
    // Original legend and spell's legend collide; the nonlegendary copy survives too.
    expect(men).toHaveLength(2);
    expect(men.filter((id) => g.obj(id).isToken && g.obj(id).nonlegendary)).toHaveLength(1);
    expect(men.filter((id) => !g.obj(id).nonlegendary)).toHaveLength(1);
  });

  it('copies only once after accepting, counts at resolution, and resets next turn', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 4)], hand: [SUITCASE, SUITCASE, SUITCASE] },
    });
    resolve(cast(g, SUITCASE));
    expect(all(g, SUITCASE)).toHaveLength(2);
    resolve(cast(g, SUITCASE));
    expect(all(g, SUITCASE)).toHaveLength(3);
    nextTurn(g);
    nextTurn(g);
    resolve(cast(g, SUITCASE));
    expect(all(g, SUITCASE)).toHaveLength(5);
  });

  it('does not trigger for nonartifact spells or artifacts an opponent casts', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 2)], hand: ['opt'] },
      p2: { battlefield: ['island'], hand: [SUITCASE] },
    });
    cast(g, 'opt');
    expect(g.state.stack.filter((x) => x.kind === 'ability')).toHaveLength(0);
    resolve(g);
    nextTurn(g);
    resolve(cast(g, SUITCASE));
    expect(all(g, SUITCASE)).toHaveLength(1);
  });

  it('still copies a countered artifact using last known spell information', () => {
    const g = game({
      p1: { battlefield: [IRON, 'island'], hand: [SUITCASE] },
      p2: { battlefield: n('island', 2), hand: ['negate'] },
    });
    cast(g, SUITCASE);
    const original = g.id('p1', SUITCASE, 'stack');
    g.pass();
    cast(g, 'negate', [g.ref(original)]);
    settle(g);
    expect(g.zoneOf(original)).toBe('graveyard');
    expect(g.decision.kind).toBe('optionalEffect');
    resolve(g);
    expect(all(g, SUITCASE)).toHaveLength(1);
    expect(g.obj(all(g, SUITCASE)[0]!).isToken).toBe(true);
  });

  it('retains an independent copy trigger after Iron Man leaves', () => {
    const g = game({
      p1: { battlefield: [IRON, 'island'], hand: [SUITCASE] },
      p2: { battlefield: ['island'], hand: ['unsummon'] },
    });
    const iron = g.id('p1', IRON);
    cast(g, SUITCASE);
    g.pass();
    cast(g, 'unsummon', [g.ref(iron)]);
    resolve(g);
    expect(g.zoneOf(iron)).toBe('hand');
    expect(all(g, SUITCASE)).toHaveLength(2);
  });

  it('two stacked triggers share the use even after their source leaves', () => {
    const g = game({
      p1: { battlefield: [IRON, 'annie-joins-up', 'island'], hand: [SUITCASE] },
      p2: { battlefield: ['island'], hand: ['unsummon'] },
    });
    cast(g, SUITCASE);
    expect(g.state.stack.filter((x) => x.kind === 'ability')).toHaveLength(2);
    g.pass();
    cast(g, 'unsummon', [g.ref(g.id('p1', IRON))]);
    resolve(g);
    expect(all(g, SUITCASE)).toHaveLength(2);
  });
});

describe('Happy Hogan, Bodyguard', () => {
  it.each([0, 1])('lets the owner choose library position %i and has vigilance', (index) => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: [HAPPY] },
      p2: { battlefield: ['rumbling-baloth'], library: ['island', 'forest', 'mountain'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    const before = [...g.state.players.p2.library];
    settle(cast(g, HAPPY));
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index });
    resolve(g);
    expect(g.state.players.p2.library).toEqual(
      index === 0 ? [before[0], target, ...before.slice(1)] : [...before, target],
    );
    expect(getCharacteristics(g.state, cardDb, g.id('p1', HAPPY)).keywords.has('vigilance')).toBe(
      true,
    );
  });

  it('the owner chooses even if that owner controls Happy', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: [HAPPY] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    g.obj(target).owner = 'p1';
    settle(cast(g, HAPPY));
    expect(g.actor).toBe('p1');
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(g.state.players.p1.library.at(-1)).toBe(target);
  });

  it('never targets your own creatures and does nothing when there is no opponent creature', () => {
    const g = game({ p1: { battlefield: ['rumbling-baloth', ...n('island', 6)], hand: [HAPPY] } });
    resolve(cast(g, HAPPY));
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
    expect(all(g, HAPPY)).toHaveLength(1);
  });
});

describe('Iron Suitcase', () => {
  it('scries exactly two, with independent ordering and bottom choices', () => {
    const g = game({
      p1: { battlefield: ['island'], hand: [SUITCASE], library: ['island', 'forest', 'mountain'] },
    });
    settle(cast(g, SUITCASE));
    expect(g.decision.kind).toBe('scry');
    if (g.decision.kind !== 'scry') throw new Error('Expected scry');
    const [first, second] = g.decision.cards;
    g.do({ type: 'scry', player: 'p1', top: [second!], bottom: [first!] });
    expect(g.state.players.p1.library[0]).toBe(second);
    expect(g.state.players.p1.library.at(-1)).toBe(first);
  });

  it('becomes a flying 3/3 Construct, can activate repeatedly, and expires without losing counters', () => {
    const g = game({ p1: { battlefield: [SUITCASE, ...n('island', 6)] } });
    const suitcase = g.id('p1', SUITCASE);
    g.obj(suitcase).plusOneCounters = 1;
    animate(g);
    animate(g);
    const c = getCharacteristics(g.state, cardDb, suitcase);
    expect(c.types).toContain('Artifact');
    expect(c.types).toContain('Creature');
    expect(c.subtypes).toContain('Construct');
    expect(c.keywords.has('flying')).toBe(true);
    expect(pt(g, suitcase)).toEqual([4, 4]);
    nextTurn(g);
    const after = getCharacteristics(g.state, cardDb, suitcase);
    expect(after.types).not.toContain('Creature');
    expect(after.subtypes).not.toContain('Construct');
    expect(after.keywords.has('flying')).toBe(false);
    expect(g.obj(suitcase).plusOneCounters).toBe(1);
  });

  it('can animate on the opponent turn, and remains subject to summoning sickness', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [{ card: SUITCASE, sick: true }, ...n('island', 3)] },
    });
    g.pass();
    animate(g);
    expect(pt(g, g.id('p1', SUITCASE))).toEqual([3, 3]);
    expect(g.obj(g.id('p1', SUITCASE)).summoningSick).toBe(true);
  });
});

describe('Origin of Iron Man', () => {
  it('taps the chosen creature and prevents controller untaps while the Saga stays; II draws two', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    resolve(cast(g, ORIGIN));
    expect(g.obj(target).tapped).toBe(true);
    nextTurn(g);
    expect(g.obj(target).tapped).toBe(true);
    const before = handSize(g, 'p1');
    nextTurn(g);
    expect(handSize(g, 'p1')).toBe(before + 3); // Normal draw plus chapter II.
    expect(g.obj(g.id('p1', ORIGIN)).counters?.lore).toBe(2);
  });

  it('accepts zero targets for chapter I', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    resolve(cast(g, ORIGIN), true, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0),
    );
    expect(g.obj(g.id('p2', 'rumbling-baloth')).tapped).toBe(false);
  });

  it('III offers only artifacts of value five or less in hand, including creatures, and permits decline', () => {
    const g = game({
      p1: {
        battlefield: [ORIGIN],
        hand: [IRON, SUITCASE, 'meteor-golem', 'rumbling-baloth'],
        graveyard: [SUITCASE],
      },
    });
    g.obj(g.id('p1', ORIGIN)).counters = { lore: 2 };
    nextTurn(g);
    // Step into chapter III without auto-answering its hand choice.
    g.passUntilStep('upkeep');
    for (let i = 0; i < 20 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    expect(g.decision.kind).toBe('searchLibrary');
    if (g.decision.kind !== 'searchLibrary') throw new Error('Expected hand choice');
    expect(g.decision.options.map((id) => g.obj(id).defId).sort()).toEqual([IRON, SUITCASE].sort());
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    resolve(g);
    expect(all(g, ORIGIN)).toHaveLength(0);
    expect(all(g, SUITCASE)).toHaveLength(0);
  });

  it('III puts an artifact in untapped and sacrifices the Saga, ending its untap lock', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN, IRON] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    resolve(cast(g, ORIGIN));
    nextTurn(g);
    nextTurn(g);
    nextTurn(g);
    nextTurn(g);
    expect(all(g, ORIGIN)).toHaveLength(0);
    expect(all(g, IRON)).toHaveLength(1);
    expect(g.obj(g.id('p1', IRON)).tapped).toBe(false);
    nextTurn(g);
    expect(g.obj(target).tapped).toBe(false);
  });
});

describe('Iron Man packet rule interactions', () => {
  it('nonlegendary copies are nonlegendary to filters, while the original remains legendary', () => {
    const g = game({ p1: { battlefield: [IRON, ...n('island', 5)], hand: [IRON] } });
    resolve(cast(g, IRON));
    const copy = all(g, IRON).find((id) => g.obj(id).isToken)!;
    const original = all(g, IRON).find((id) => !g.obj(id).isToken)!;
    const ctx = makeCtx(g.state, cardDb);
    expect(def(ctx, copy).supertypes).not.toContain('Legendary');
    expect(def(ctx, original).supertypes).toContain('Legendary');
    expect(matchesFilter(ctx, copy, { nonlegendary: true })).toBe(true);
    expect(matchesFilter(ctx, original, { nonlegendary: true })).toBe(false);
  });

  it('each Iron Man tracks its own use, with immutable previous states', () => {
    const g = game({ p1: { battlefield: [IRON, IRON, 'island'], hand: [SUITCASE] } });
    g.obj(all(g, IRON)[1]!).nonlegendary = true;
    cast(g, SUITCASE);
    settle(g);
    const before = g.state;
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(before.turn.optionalUses).toBeUndefined();
    const firstUseState = g.state;
    resolve(g);
    expect(all(g, SUITCASE)).toHaveLength(3);
    expect(firstUseState.turn.optionalUses).toHaveLength(1);
    expect(g.state.turn.optionalUses).toHaveLength(2);
  });

  it('new battlefield identity gets its own once-per-turn use', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 8)], hand: [SUITCASE, SUITCASE, 'unsummon'] },
    });
    resolve(cast(g, SUITCASE));
    const iron = g.id('p1', IRON);
    resolve(cast(g, 'unsummon', [g.ref(iron)]));
    resolve(cast(g, IRON));
    resolve(cast(g, SUITCASE));
    expect(all(g, SUITCASE)).toHaveLength(4);
  });

  it('Construct animation is visible to subtype filters', () => {
    const g = game({ p1: { battlefield: [SUITCASE, ...n('island', 3)] } });
    animate(g);
    const id = g.id('p1', SUITCASE);
    const ctx = makeCtx(g.state, cardDb);
    expect(hasSubtype(ctx, id, 'Construct')).toBe(true);
    expect(matchesFilter(ctx, id, { subtypes: ['Construct'] })).toBe(true);
    nextTurn(g);
    expect(hasSubtype(makeCtx(g.state, cardDb), id, 'Construct')).toBe(false);
  });

  it('base-setting effects use timestamps across animation and attached Equipment', () => {
    const g = game({ p1: { battlefield: [SUITCASE, 'hulkbuster-armor', ...n('island', 12)] } });
    const id = g.id('p1', SUITCASE);
    const armor = g.id('p1', 'hulkbuster-armor');
    animate(g);
    const equip = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === armor &&
          a.targets.some((t) => 'object' in t && t.object.id === id),
      );
    expect(equip).toBeDefined();
    g.do(equip!);
    settle(g);
    expect(pt(g, id)).toEqual([9, 9]);
    animate(g);
    expect(pt(g, id)).toEqual([3, 3]);
  });

  it('Happy puts a creature on top when second from top is chosen for an empty library', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: [HAPPY] },
      p2: { battlefield: ['rumbling-baloth'], library: [] },
    });
    const id = g.id('p2', 'rumbling-baloth');
    settle(cast(g, HAPPY));
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    expect(g.state.players.p2.library).toEqual([id]);
  });

  it('Happy does not affect a target that left before its trigger resolves', () => {
    const g = game({
      p1: { battlefield: n('island', 6), hand: [HAPPY] },
      p2: { battlefield: ['rumbling-baloth', 'island'], hand: ['unsummon'] },
    });
    const id = g.id('p2', 'rumbling-baloth');
    cast(g, HAPPY);
    g.passBoth();
    g.do(g.legal().find((a) => a.type === 'chooseTargets')!);
    g.pass();
    cast(g, 'unsummon', [g.ref(id)]);
    resolve(g);
    expect(g.zoneOf(id)).toBe('hand');
  });

  it('the Saga lock allows effect-based untapping, and survives changes of Saga controller', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    resolve(cast(g, ORIGIN));
    const saga = g.id('p1', ORIGIN);
    g.obj(saga).controller = 'p2';
    nextTurn(g);
    expect(g.obj(target).tapped).toBe(true);
    // A tap lock only stops the normal untap step, not an untap effect.
    const ctx = makeCtx(g.state, cardDb);
    untap(ctx, target);
    expect(g.obj(target).tapped).toBe(false);
  });

  it('if Saga leaves before chapter I resolves, it still taps but never establishes the lock', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    cast(g, ORIGIN);
    g.passBoth();
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 1 &&
            'object' in a.targets[0]! &&
            a.targets[0].object.id === target,
        )!,
    );
    moveObject(makeCtx(g.state, cardDb), g.id('p1', ORIGIN), 'graveyard');
    resolve(g);
    expect(g.obj(target).tapped).toBe(true);
    expect(g.state.effects.some((e) => e.doesntUntap)).toBe(false);
    nextTurn(g);
    expect(g.obj(target).tapped).toBe(false);
  });

  it('removing and returning the target does not keep the old untap lock', () => {
    const g = game({
      p1: { battlefield: n('island', 5), hand: [ORIGIN] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const target = g.id('p2', 'rumbling-baloth');
    resolve(cast(g, ORIGIN));
    const ctx = makeCtx(g.state, cardDb);
    moveObject(ctx, target, 'exile');
    moveObject(ctx, target, 'battlefield');
    g.obj(target).tapped = true;
    nextTurn(g);
    expect(g.obj(target).tapped).toBe(false);
  });
});

describe('Iron Man spell-copy timing', () => {
  it('copies during an opponent turn and independently of the preceding turn use', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 3)], hand: [SUITCASE, 'goblin-firebomb'] },
    });
    resolve(cast(g, SUITCASE));
    nextTurn(g);
    g.pass();
    resolve(cast(g, 'goblin-firebomb'));
    expect(all(g, 'goblin-firebomb')).toHaveLength(2);
  });

  it('two different artifact spells already on the stack compete for the same use', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('island', 2)], hand: ['goblin-firebomb', 'goblin-firebomb'] },
    });
    cast(g, 'goblin-firebomb');
    cast(g, 'goblin-firebomb');
    resolve(g);
    expect(all(g, 'goblin-firebomb')).toHaveLength(3);
  });

  it('copies the chosen X, including when the original has already been countered', () => {
    const g = game({
      p1: { battlefield: [IRON, ...n('plains', 5)], hand: ['royal-talon-fighter-jet'] },
      p2: { battlefield: n('island', 2), hand: ['negate'] },
    });
    cast(g, 'royal-talon-fighter-jet', [], { x: 3 });
    const original = g.id('p1', 'royal-talon-fighter-jet', 'stack');
    g.pass();
    cast(g, 'negate', [g.ref(original)]);
    resolve(g);
    const copies = all(g, 'royal-talon-fighter-jet');
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).plusOneCounters).toBe(3);
    expect(g.obj(copies[0]!).isToken).toBe(true);
  });
});

describe('Nonlegendary Iron Man copies', () => {
  it('do not receive Annie Joins Up legend-only trigger doubling', () => {
    const g = game({
      p1: { battlefield: [IRON, IRON, 'annie-joins-up', 'island'], hand: [SUITCASE] },
    });
    g.obj(all(g, IRON)[1]!).nonlegendary = true;
    cast(g, SUITCASE);
    expect(g.state.stack.filter((x) => x.kind === 'ability')).toHaveLength(3);
    resolve(g);
    expect(all(g, SUITCASE)).toHaveLength(3);
  });

  it('pass their nonlegendary copy characteristic on to further copies', () => {
    const g = game({
      p1: { battlefield: [IRON, IRON, ...n('island', 4)], hand: ['rite-of-replication'] },
    });
    const copy = all(g, IRON)[1]!;
    g.obj(copy).nonlegendary = true;
    g.obj(copy).isToken = true;
    resolve(cast(g, 'rite-of-replication', [g.ref(copy)]));
    expect(all(g, IRON)).toHaveLength(3);
    expect(all(g, IRON).filter((id) => g.obj(id).nonlegendary)).toHaveLength(2);
  });
});

it("an artifact that cannot be copied does not consume Iron Man's optional copy", () => {
  const db = new Map(cardDb);
  db.set('goblin-firebomb', { ...db.get('goblin-firebomb')!, cantBeCopied: true });
  const g = new GameDriver(
    createEngine(db),
    buildScenario(db, {
      p1: { battlefield: [IRON, ...n('island', 2)], hand: ['goblin-firebomb', SUITCASE] },
    }),
  );
  resolve(cast(g, 'goblin-firebomb'));
  expect(all(g, 'goblin-firebomb')).toHaveLength(1);
  expect(g.state.turn.optionalUses).toBeUndefined();
  resolve(cast(g, SUITCASE));
  expect(all(g, SUITCASE)).toHaveLength(2);
});

describe('Iron Man nonlegendary trigger lookup regression', () => {
  it('queues a dead token\'s ability after the token has ceased to exist', () => {
    const g = game({ p1: { battlefield: ['annie-joins-up', 'stx-pest-token'] } });
    const pest = g.id('p1', 'stx-pest-token');
    g.obj(pest).isToken = true;
    g.obj(pest).damage = 1;
    resolve(g.pass());
    expect(g.state.objects[pest]).toBeUndefined();
    expect(g.life('p1')).toBe(21);
  });

  it('queues a removed noncreature token\'s graveyard trigger without a live object lookup', () => {
    const g = game({ p1: { battlefield: ['annie-joins-up', 'soc-15b-b-wicked-role-token'] } });
    const role = g.id('p1', 'soc-15b-b-wicked-role-token');
    g.obj(role).isToken = true;
    // Unattached Auras are put into the graveyard by state-based actions.
    resolve(g.pass());
    expect(g.state.objects[role]).toBeUndefined();
    expect(g.life('p2')).toBe(19);
  });
});
