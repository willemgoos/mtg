import { gainLife } from '../../engine/src/effects.ts';
import { createLifeGainSnapshotGate } from '../../engine/src/life-gain-replacements.ts';
import { createObject, makeCtx } from '../../engine/src/context.ts';
import { hasSubtype, matchesFilter, cardMatches } from '../../engine/src/characteristics.ts';
import {
  cloneState,
  createEngine,
  getCharacteristics,
  redactFor,
  determinize,
  type CardDefinition,
} from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import packets from '../scripts/data/marvel-jumpstart-lists.json';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

const CROWD = slug('Crowd of True Believers');
const DONALD = slug('Donald Blake, Guise of Thor');
const MJ = slug('MJ, Rising Star');
const VARIANT = slug('Virtuous Variant');
const JANE = slug('Doctor Jane Foster');
const STRANGE = slug('Doctor Strange, Surgeon');
const ANGEL = 'angel-of-vitality';
const keywords = (g: GameDriver, id: string) =>
  getCharacteristics(g.state, g.engine.db, id).keywords;
const activate = (g: GameDriver, id: string, targets: Parameters<typeof cast>[2] = []) =>
  g.do({ type: 'activateAbility', player: g.actor, source: id, abilityIndex: 0, targets });

// Focused test spell: two distinct gains, then a gain for both players. It also
// lets the same replacement continuation be tested with both engine APIs.
const gift: CardDefinition = {
  ...cardDb.get('unsummon')!,
  id: 'caretakers-test-gift',
  name: 'Test gift',
  manaCost: { generic: 0, colored: {} },
  types: ['Instant'],
  keywords: [],
  abilities: [],
  spell: {
    targets: [],
    effects: [
      { kind: 'gainLife', who: 'controller', amount: 1 },
      { kind: 'gainLife', who: 'controller', amount: 2 },
      { kind: 'gainLife', who: 'eachPlayer', amount: 1 },
    ],
  },
};
const testDb = new Map(cardDb).set(gift.id, gift);
const testEngine = createEngine(testDb);
const resolve = (g: GameDriver, index = 0) => {
  for (let i = 0; i < 40; i++) {
    settle(g);
    if (g.decision.kind !== 'chooseOption') return g;
    g.do({ type: 'chooseOption', player: g.actor, index });
  }
  throw new Error('Unbounded replacement choices');
};

describe('Caretakers packet', () => {
  it('contains the entire official packet', () => {
    expect(
      packets
        .find((p) => p.name === 'Caretakers')!
        .cards.filter(([name]) => !cardDb.has(slug(name as string))),
    ).toEqual([]);
  });
});

describe('Crowd of True Believers', () => {
  it('requires a creature you control attacking alone, taps, pumps only power and gains one life', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [CROWD, 'bear-cub'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const crowd = g.id('p1', CROWD),
      bear = g.id('p1', 'bear-cub');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === crowd)).toBe(false);
    g.passBoth().attack(bear);
    activate(g, crowd, [g.ref(bear)]);
    settle(g);
    expect(g.obj(crowd).tapped).toBe(true);
    expect(pt(g, bear)).toEqual([3, 2]);
    expect(g.life('p1')).toBe(21);
    g.passUntilStep('upkeep');
    expect(pt(g, bear)).toEqual([2, 2]);
  });
  it('has no targets with multiple attackers and respects summoning sickness', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [{ card: CROWD, sick: true }, 'bear-cub', 'llanowar-elves'] },
    });
    g.passBoth().attack(g.id('p1', 'bear-cub'), g.id('p1', 'llanowar-elves'));
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === g.id('p1', CROWD)),
    ).toBe(false);
  });
  it('gains no life if its sole target leaves before resolution', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [CROWD, 'bear-cub'] },
      p2: { hand: ['unsummon'], battlefield: ['island'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear);
    activate(g, g.id('p1', CROWD), [g.ref(bear)]);
    g.pass();
    cast(g, 'unsummon', [g.ref(bear)]);
    settle(g);
    expect(g.life('p1')).toBe(20);
    expect(g.zoneOf(bear)).toBe('hand');
  });
});

describe('Donald Blake, Guise of Thor', () => {
  it('power-up adds counters, replaces creature types permanently and can be used only once', () => {
    const g = game({ p1: { battlefield: [DONALD, ...n('plains', 6)] } }),
      id = g.id('p1', DONALD);
    expect(keywords(g, id).has('lifelink')).toBe(true);
    activate(g, id);
    settle(g);
    expect(pt(g, id)).toEqual([3, 5]);
    expect(g.obj(id).counters?.flying).toBe(1);
    expect(getCharacteristics(g.state, cardDb, id).subtypes).toEqual(['God', 'Warrior', 'Hero']);
    expect(keywords(g, id).has('flying')).toBe(true);
    g.passUntilStep('upkeep');
    expect(pt(g, id)).toEqual([3, 5]);
    expect(getCharacteristics(g.state, cardDb, id).subtypes).toEqual(['God', 'Warrior', 'Hero']);
    expect(g.legal('p1').some((a) => a.type === 'activateAbility' && a.source === id)).toBe(false);
  });
  it('reduces the power-up by his mana cost on the turn he entered and resets after leaving', () => {
    const g = game({
      p1: { hand: [DONALD, 'unsummon'], battlefield: [...n('plains', 6), 'island'] },
    });
    settle(cast(g, DONALD));
    const id = g.id('p1', DONALD);
    activate(g, id);
    settle(g); // {3}{W} remains after casting him for {1}{W}.
    cast(g, 'unsummon', [g.ref(id)]);
    settle(g);
    expect(g.obj(id).creatureTypes).toBeUndefined();
    expect(getCharacteristics(g.state, cardDb, id).subtypes).toEqual(['Human', 'Doctor']);
  });
});

describe('MJ and Virtuous Variant', () => {
  it('MJ has vigilance and gets one counter per gain, not per life, including on the opponent turn', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, {
        p1: { battlefield: [MJ], hand: [gift.id] },
        p2: { battlefield: [MJ] },
      }),
    );
    resolve(cast(g, gift.id));
    expect(pt(g, g.id('p1', MJ))).toEqual([5, 6]);
    expect(pt(g, g.id('p2', MJ))).toEqual([3, 4]);
    expect(keywords(g, g.id('p1', MJ)).has('vigilance')).toBe(true);
  });
  it('Variant flies and can put its mandatory ETB counter on itself', () => {
    const g = game({ p1: { hand: [VARIANT], battlefield: n('plains', 3) } });
    settle(cast(g, VARIANT));
    const id = g.id('p1', VARIANT);
    expect(pt(g, id)).toEqual([2, 3]);
    expect(keywords(g, id).has('flying')).toBe(true);
  });
  it('Variant can target another friendly creature but never an opponent creature', () => {
    const g = game({
      p1: { hand: [VARIANT], battlefield: ['bear-cub', ...n('plains', 3)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, VARIANT);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(
      g
        .legal()
        .filter((a) => a.type === 'chooseTargets')
        .every(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.every((t) => 'object' in t && g.obj(t.object.id).controller === 'p1'),
        ),
    ).toBe(true);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] });
    settle(g);
    expect(pt(g, bear)).toEqual([3, 3]);
  });
});

describe('Doctor Jane Foster', () => {
  it.each([false, true])(
    'returns a cheap creature to the correct zone (gained life: %s)',
    (gained) => {
      const g = game({
        p1: { hand: [JANE], battlefield: n('plains', 4), graveyard: [VARIANT, STRANGE, 'plains'] },
        p2: { graveyard: ['bear-cub'] },
      });
      if (gained) g.state.turn.lifeGains.p1 = 1;
      const id = g.id('p1', VARIANT, 'graveyard');
      cast(g, JANE);
      g.passBoth();
      expect(g.legal().filter((a) => a.type === 'chooseTargets')).toEqual([
        { type: 'chooseTargets', player: 'p1', targets: [g.ref(id)] },
      ]);
      settle(g);
      expect(g.zoneOf(id)).toBe(gained ? 'battlefield' : 'hand');
      expect(keywords(g, g.id('p1', JANE)).has('vigilance')).toBe(true);
    },
  );
  it('checks life gain at resolution, including a gain after the trigger was put on the stack', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, {
        p1: { hand: [JANE, gift.id], battlefield: n('plains', 4), graveyard: ['bear-cub'] },
      }),
    );
    cast(g, JANE);
    g.passBoth();
    g.do(g.legal()[0]!);
    cast(g, gift.id);
    resolve(g);
    expect(g.zoneOf(g.id('p1', 'bear-cub'))).toBe('battlefield');
  });
  it('does nothing when the target leaves the graveyard', () => {
    const g = game({ p1: { hand: [JANE], battlefield: n('plains', 4), graveyard: ['bear-cub'] } });
    const id = g.id('p1', 'bear-cub', 'graveyard');
    cast(g, JANE);
    g.passBoth();
    g.do(g.legal()[0]!);
    g.obj(id).zcc++;
    g.obj(id).zone = 'exile';
    g.state.players.p1.graveyard = [];
    g.state.players.p1.exile.push(id);
    settle(g);
    expect(g.zoneOf(id)).toBe('exile');
  });
});

describe('Doctor Strange, Surgeon', () => {
  it.each([
    ['p1', 30, 20, true],
    ['p1', 29, 20, false],
    ['p2', 35, 25, true],
    ['p2', 34, 25, false],
    ['p1', 50, 40, true],
  ] as const)(
    'checks actual starting life on each combat (%s, %i/%i)',
    (active, life, startingLife, triggers) => {
      const g = game({
        active,
        step: 'main1',
        p1: { life, battlefield: [STRANGE, 'bear-cub'] },
        p2: { battlefield: ['bear-cub'] },
      });
      g.state.players.p1.startingLife = startingLife;
      g.passBoth();
      settle(g);
      expect(pt(g, g.id('p1', 'bear-cub'))).toEqual(triggers ? [4, 4] : [2, 2]);
      expect(pt(g, g.id('p2', 'bear-cub'))).toEqual([2, 2]);
      expect(keywords(g, g.id('p1', 'bear-cub')).has('vigilance')).toBe(triggers);
    },
  );
  it('rechecks the intervening condition on resolution', () => {
    const g = game({
      p1: { life: 30, battlefield: [STRANGE] },
      p2: { hand: ['lightning-bolt'], battlefield: ['mountain'] },
    });
    g.passBoth();
    g.pass();
    cast(g, 'lightning-bolt', [{ player: 'p1' }]);
    settle(g);
    expect(pt(g, g.id('p1', STRANGE))).toEqual([2, 5]);
  });
  it('doubles its controller life gain, including its own lifelink, without doubling opponents gains', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, { p1: { battlefield: [STRANGE], hand: [gift.id] } }),
    );
    resolve(cast(g, gift.id));
    expect(g.life('p1')).toBe(28);
    expect(g.life('p2')).toBe(21);
    g.passUntilStep('beginCombat');
    g.passBoth().attack(g.id('p1', STRANGE));
    g.passUntilStep('endCombat');
    expect(g.life('p1')).toBe(32);
    expect(g.life('p2')).toBe(19);
  });
  it('uses each double replacement once and loses its replacement when blanked', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, {
        p1: { battlefield: [STRANGE, 'the-wind-crystal'], hand: [gift.id] },
      }),
    );
    resolve(cast(g, gift.id));
    expect(g.life('p1')).toBe(36);
    const h = new GameDriver(
      testEngine,
      buildScenario(testDb, { p1: { battlefield: [STRANGE], hand: [gift.id] } }),
    );
    h.obj(h.id('p1', STRANGE)).blank = true;
    resolve(cast(h, gift.id));
    expect(h.life('p1')).toBe(24);
  });
});

describe('life-gain replacement order', () => {
  const scenario = () =>
    new GameDriver(
      testEngine,
      buildScenario(testDb, {
        p1: { battlefield: [STRANGE, ANGEL, MJ], hand: [gift.id] },
        p2: { battlefield: [STRANGE, ANGEL, MJ] },
      }),
    );
  it.each([0, 1])(
    'offers stepwise ordering for both players and successive gains (index %i)',
    (index) => {
      const g = scenario();
      resolve(cast(g, gift.id), index);
      expect(g.life('p1')).toBe(index === 0 ? 31 : 34);
      expect(g.life('p2')).toBe(index === 0 ? 23 : 24);
      expect(g.state.turn.lifeGains).toEqual({ p1: 3, p2: 1 });
      expect(pt(g, g.id('p1', MJ))).toEqual([5, 6]);
      expect(pt(g, g.id('p2', MJ))).toEqual([3, 4]);
    },
  );
  it('clones, serializes, redacts and determinizes a pending replay without leaking hidden cards', () => {
    const g = scenario();
    cast(g, gift.id);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    const saved = JSON.parse(JSON.stringify(g.state));
    const cloned = cloneState(g.state);
    const h = new GameDriver(testEngine, cloned);
    resolve(h);
    expect(g.state).toEqual(saved);
    const view = redactFor(g.state, 'p1', testDb);
    expect(view.players.p2.library.every((id) => view.objects[id]!.defId === '?')).toBe(true);
    expect(JSON.stringify(view.decision)).not.toContain('forest');
    const decks = {
      p1: [STRANGE, ANGEL, MJ, gift.id, ...n('forest', 10)],
      p2: [STRANGE, ANGEL, MJ, ...n('forest', 10)],
    };
    const world = determinize(view, decks, 7);
    resolve(new GameDriver(testEngine, world));
    const restored = new GameDriver(testEngine, saved);
    resolve(restored);
    expect(restored.state).toEqual(h.state);
  });
  it('in-place replay does not leak partial life, counters or events and rejects illegal choices', () => {
    const g = scenario();
    cast(g, gift.id);
    g.pass();
    const events = testEngine.applyActionInPlace(g.state, {
      type: 'passPriority',
      player: g.actor,
    });
    expect(events).toEqual([]);
    expect(g.life('p1')).toBe(20);
    expect(g.state.turn.lifeGains.p1).toBe(0);
    const saved = cloneState(g.state);
    expect(() =>
      testEngine.applyActionInPlace(g.state, { type: 'chooseOption', player: 'p1', index: 99 }),
    ).toThrow();
    expect(g.state).toEqual(saved);
    for (let i = 0; i < 20; i++) {
      if (g.decision.kind !== 'chooseOption') break;
      testEngine.applyActionInPlace(g.state, { type: 'chooseOption', player: g.actor, index: 1 });
    }
    settle(g);
    expect(g.life('p1')).toBe(34);
    expect(g.state.turn.lifeGains.p1).toBe(3);
  });
  it('orders replacements during combat lifelink and applies damage only once', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: [STRANGE, ANGEL] } });
    g.passBoth().attack(g.id('p1', STRANGE));
    for (let i = 0; i < 20 && g.decision.kind !== 'chooseOption'; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: g.actor });
      else g.pass();
    }
    resolve(g, 1);
    expect(g.life('p1')).toBe(26);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Caretakers engine edge cases', () => {
  it('permanent creature types drive all subtype filters and replace older granted types while keeping Food', () => {
    const g = game({ p1: { battlefield: [DONALD, ...n('plains', 6)] } }),
      id = g.id('p1', DONALD);
    g.obj(id).addedSubtypes = ['Food', 'Mutant'];
    activate(g, id);
    settle(g);
    const ctx = makeCtx(g.state, cardDb);
    expect(hasSubtype(ctx, id, 'God')).toBe(true);
    expect(hasSubtype(ctx, id, 'Human')).toBe(false);
    expect(matchesFilter(ctx, id, { subtype: 'Mutant' })).toBe(false);
    expect(cardMatches(ctx, id, { subtypes: ['Human', 'Doctor'] })).toBe(false);
    expect(cardMatches(ctx, id, { subtypes: ['Hero'] })).toBe(true);
    expect(hasSubtype(ctx, id, 'Food')).toBe(true);
    expect(g.obj(id).creatureTypesTimestamp).toBeGreaterThan(0);
  });
  it('Crowd rejects multiple attackers even when it can tap, and rejects a sole opposing attacker', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [CROWD, 'bear-cub', 'llanowar-elves'] },
    });
    g.passBoth().attack(g.id('p1', 'bear-cub'), g.id('p1', 'llanowar-elves'));
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === g.id('p1', CROWD)),
    ).toBe(false);
    const h = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { battlefield: [CROWD] },
      p2: { battlefield: ['bear-cub'] },
    });
    h.passBoth().attack(h.id('p2', 'bear-cub'));
    h.pass();
    expect(
      h.legal().some((a) => a.type === 'activateAbility' && a.source === h.id('p1', CROWD)),
    ).toBe(false);
  });
  it('Strange combat boost expires at cleanup', () => {
    const g = game({ p1: { life: 30, battlefield: [STRANGE, 'bear-cub'] } });
    g.passBoth();
    settle(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([4, 4]);
    g.passUntilStep('upkeep');
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
    expect(keywords(g, g.id('p1', 'bear-cub')).has('vigilance')).toBe(false);
  });
  it('starting life is recorded by game setup for Brawl and explicit overrides', () => {
    const decks = { p1: n('plains', 40), p2: n('plains', 40) };
    const s = testEngine.newGame({ decks, seed: 1, format: 'brawl', life: { p1: 40 } });
    expect(s.players.p1.startingLife).toBe(40);
    expect(s.players.p2.startingLife).toBe(25);
  });
  it('frozen life and prevented life gain never ask replacement questions or trigger MJ', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, { p1: { battlefield: [STRANGE, ANGEL, MJ], hand: [gift.id] } }),
    );
    g.state.players.p1.lifeFrozen = true;
    resolve(cast(g, gift.id));
    expect(g.life('p1')).toBe(20);
    expect(g.state.turn.lifeGains.p1).toBe(0);
    expect(pt(g, g.id('p1', MJ))).toEqual([2, 3]);
  });
  it('in-place gate skips simple games but sees modifiers anywhere in libraries and runtime abilities', () => {
    const gate = createLifeGainSnapshotGate(testDb);
    const simple = buildScenario(testDb, { p1: { battlefield: ['bear-cub'] } });
    expect(gate(simple)).toBe(false);
    const hidden = buildScenario(testDb, { p1: { library: [STRANGE, ANGEL] } });
    expect(gate(hidden)).toBe(true);
    const o = Object.values(simple.objects).find((o) => o.defId === 'bear-cub')!;
    o.tempAbilities = [
      { kind: 'static', effect: { kind: 'extraLifeGain', amount: 1 } },
      { kind: 'static', effect: { kind: 'doubleLifeGain' } },
    ];
    expect(gate(simple)).toBe(true);
    const custom = buildScenario(testDb, { p1: { battlefield: ['bear-cub'] } });
    Object.values(custom.objects).find((o) => o.defId === 'bear-cub')!.tempAbilities = [
      {
        kind: 'activated',
        cost: {},
        targets: [],
        effects: [{ kind: 'custom', handler: 'test-opaque' }],
      },
    ];
    expect(gate(custom)).toBe(true);
  });
  it('snapshots nested generated modifiers absent from the battlefield, then resumes without duplicate tokens', () => {
    const spawn: CardDefinition = {
      ...gift,
      id: 'caretakers-spawn',
      spell: {
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'yourTurn' },
            then: [
              { kind: 'createToken', token: ANGEL, count: 1 },
              { kind: 'createToken', token: STRANGE, count: 1 },
            ],
          },
          { kind: 'gainLife', who: 'controller', amount: 1 },
        ],
      },
    };
    const db = new Map(testDb).set(spawn.id, spawn),
      engine = createEngine(db);
    const s = buildScenario(db, { p1: { hand: [spawn.id] } });
    expect(createLifeGainSnapshotGate(db)(s)).toBe(true);
    const g = new GameDriver(engine, s);
    cast(g, spawn.id);
    g.pass();
    engine.applyActionInPlace(g.state, { type: 'passPriority', player: g.actor });
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.state.battlefield).toHaveLength(2);
    engine.applyActionInPlace(g.state, { type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.life('p1')).toBe(24);
    expect(g.state.battlefield).toHaveLength(2);
  });
  it('gate follows back faces, external spellbook references and opaque custom conjures', () => {
    const back: CardDefinition = { ...gift, id: 'caretakers-back', back: STRANGE };
    const conjure: CardDefinition = {
      ...gift,
      id: 'caretakers-conjure',
      spell: {
        targets: [],
        effects: [{ kind: 'custom', handler: 'conjure', params: { card: ANGEL } }],
      },
    };
    const db = new Map(testDb).set(back.id, back).set(conjure.id, conjure);
    expect(
      createLifeGainSnapshotGate(db)(
        buildScenario(db, { p1: { hand: [back.id], library: [ANGEL] } }),
      ),
    ).toBe(true);
    expect(createLifeGainSnapshotGate(db)(buildScenario(db, { p1: { hand: [conjure.id] } }))).toBe(
      true,
    );
  });
});

describe('Caretakers replacement and last-known information regressions', () => {
  it('an opaque custom effect can create replacements and gain life in the same in-place action', () => {
    const spell: CardDefinition = {
      ...gift,
      id: 'caretakers-opaque',
      spell: { targets: [], effects: [{ kind: 'custom', handler: 'testOpaqueGain' }] },
    };
    const db = new Map(testDb).set(spell.id, spell);
    const engine = createEngine(db, {
      customEffects: {
        testOpaqueGain(ctx, es) {
          for (const defId of [ANGEL, STRANGE])
            ctx.s.battlefield.push(createObject(ctx, defId, es.controller, 'battlefield', true).id);
          gainLife(ctx, es.controller, 1);
        },
      },
    });
    const g = new GameDriver(engine, buildScenario(db, { p1: { hand: [spell.id] } }));
    cast(g, spell.id);
    g.pass();
    engine.applyActionInPlace(g.state, { type: 'passPriority', player: g.actor });
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.state.battlefield).toHaveLength(2);
    engine.applyActionInPlace(g.state, { type: 'chooseOption', player: 'p1', index: 1 });
    expect(g.life('p1')).toBe(23);
    expect(g.state.battlefield).toHaveLength(2);
  });
  it('a prohibition on life gain wins over replacements', () => {
    const g = new GameDriver(
      testEngine,
      buildScenario(testDb, {
        p1: { battlefield: [STRANGE, ANGEL, MJ], hand: [gift.id] },
        p2: { battlefield: ['giant-cindermaw'] },
      }),
    );
    resolve(cast(g, gift.id));
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(20);
    expect(g.state.turn.lifeGains).toEqual({ p1: 0, p2: 0 });
    expect(pt(g, g.id('p1', MJ))).toEqual([2, 3]);
  });
  it('death filters remember replacement creature types, not the printed Human type', () => {
    const watcher: CardDefinition = {
      ...cardDb.get('bear-cub')!,
      id: 'caretakers-watcher',
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'creatureYouControlDies', filter: { subtype: 'Hero' } },
          targets: [],
          effects: [{ kind: 'counters', to: 'self', amount: 1 }],
        },
        {
          kind: 'triggered',
          trigger: { on: 'creatureYouControlDies', filter: { subtype: 'Human' } },
          targets: [],
          effects: [{ kind: 'counters', to: 'self', amount: 10 }],
        },
      ],
    };
    const db = new Map(testDb).set(watcher.id, watcher),
      engine = createEngine(db);
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          battlefield: [DONALD, watcher.id, ...n('plains', 6), ...n('swamp', 3)],
          hand: ['doom-blade'],
        },
      }),
    );
    const id = g.id('p1', DONALD);
    activate(g, id);
    settle(g);
    cast(g, 'doom-blade', [g.ref(id)]);
    settle(g);
    expect(g.obj(g.id('p1', watcher.id)).plusOneCounters).toBe(1);
    expect(g.obj(id).lastSubtypes).toEqual(['God', 'Warrior', 'Hero']);
    expect(g.obj(id).creatureTypes).toBeUndefined();
  });
});

describe('replacement decisions show partial resolution without repeating events', () => {
  const drawing: CardDefinition = {
    ...gift,
    id: 'caretakers-drawing',
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: 1 },
        { kind: 'gainLife', who: 'controller', amount: 1 },
        { kind: 'damage', to: 'eachOpponent', amount: 1 },
        { kind: 'gainLife', who: 'controller', amount: 2 },
      ],
    },
  };
  it('shows drawn hand cards, earlier life gains and damage, with one flat redacted snapshot', () => {
    const db = new Map(testDb).set(drawing.id, drawing),
      engine = createEngine(db);
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          hand: [drawing.id],
          battlefield: [STRANGE, ANGEL],
          library: ['bear-cub', 'plains', 'forest'],
        },
      }),
    );
    const drawn = g.id('p1', 'bear-cub', 'library');
    cast(g, drawing.id);
    g.pass();
    const first = engine.applyActionInPlace(g.state, { type: 'passPriority', player: g.actor });
    expect(first.filter((e) => e.type === 'cardDrawn')).toHaveLength(1);
    expect(g.zoneOf(drawn)).toBe('hand');
    const mine = redactFor(g.state, 'p1', db),
      theirs = redactFor(g.state, 'p2', db);
    expect(mine.objects[drawn]!.defId).toBe('bear-cub');
    expect(theirs.objects[drawn]!.defId).toBe('?');
    if (mine.decision.kind !== 'chooseOption' || theirs.decision.kind !== 'chooseOption')
      throw Error('Missing prompt');
    expect(mine.decision.lifeGainReplay!.original.objects[drawn]!.defId).toBe('bear-cub');
    expect(theirs.decision.lifeGainReplay!.original.objects[drawn]!.defId).toBe('?');
    expect(theirs.decision.lifeGainReplay!.original.seed).toBe(0);
    expect(theirs.decision.lifeGainReplay!.original.decision.kind).toBe('priority');
    expect(JSON.stringify(g.state).match(/lifeGainReplay/g)).toHaveLength(1);
    const second = engine.applyActionInPlace(g.state, {
      type: 'chooseOption',
      player: 'p1',
      index: 0,
    });
    expect(second.some((e) => e.type === 'cardDrawn')).toBe(false);
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(19);
    expect(g.decision.kind).toBe('chooseOption');
    const decks = {
      p1: [drawing.id, STRANGE, ANGEL, 'bear-cub', 'plains', 'forest'],
      p2: n('forest', 10),
    };
    const world = determinize(redactFor(g.state, 'p1', db), decks, 77);
    const simulated = new GameDriver(engine, world);
    resolve(simulated, 1);
    expect(simulated.state.players.p1.hand).toContain(drawn);
    const third = engine.applyActionInPlace(g.state, {
      type: 'chooseOption',
      player: 'p1',
      index: 1,
    });
    expect(third.some((e) => e.type === 'cardDrawn' || e.type === 'damageDealt')).toBe(false);
    expect(g.life('p1')).toBe(29);
    expect(g.life('p2')).toBe(19);
  });
  it('keeps a publicly revealed opponent hand card visible during the ordering choice', () => {
    const revealing: CardDefinition = {
      ...gift,
      id: 'caretakers-revealing',
      spell: {
        targets: [],
        effects: [
          { kind: 'revealUntilCreature' },
          { kind: 'gainLife', who: 'controller', amount: 1 },
        ],
      },
    };
    const db = new Map(testDb).set(revealing.id, revealing),
      engine = createEngine(db);
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          hand: [revealing.id],
          battlefield: [STRANGE, ANGEL],
          library: ['bear-cub', 'plains'],
        },
      }),
    );
    const revealed = g.id('p1', 'bear-cub', 'library');
    cast(g, revealing.id);
    settle(g);
    expect(g.zoneOf(revealed)).toBe('hand');
    const view = redactFor(g.state, 'p2', db);
    expect(view.objects[revealed]!.defId).toBe('bear-cub');
    if (view.decision.kind !== 'chooseOption') throw Error('Missing prompt');
    expect(view.decision.lifeGainReplay!.original.objects[revealed]!.defId).toBe('bear-cub');
  });
});
