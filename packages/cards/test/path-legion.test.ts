import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for Path of Power and Might of the Legion.

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const kw = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
  zone: 'hand' | 'graveyard' | 'library' = 'hand',
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, zone), targets, ...extra });
};
const tokens = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);

describe('modes, kicker, flashback, flash', () => {
  it('Goblin Surprise offers both modes; the token mode makes two Goblins', () => {
    const g = game({ p1: { hand: ['goblin-surprise'], battlefield: n('mountain', 3) } });
    const modes = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => a.mode);
    expect(modes.sort()).toEqual([0, 1]);
    cast(g, 'goblin-surprise', [], { mode: 1 }).passBoth();
    expect(tokens(g, 'goblin-token')).toHaveLength(2);
  });

  it('Burst Lightning: kicked only with enough mana, and deals 4', () => {
    const g = game({ p1: { hand: ['burst-lightning'], battlefield: n('mountain', 5) } });
    expect(g.legal().some((a) => a.type === 'castSpell' && a.kicked)).toBe(true);
    cast(g, 'burst-lightning', [{ player: 'p2' }], { kicked: true }).passBoth();
    expect(g.life('p2')).toBe(16);

    const poor = game({ p1: { hand: ['burst-lightning'], battlefield: n('mountain', 4) } });
    expect(poor.legal().some((a) => a.type === 'castSpell' && a.kicked)).toBe(false);
  });

  it('Bulk Up doubles power, and flashback casts it from the graveyard into exile', () => {
    const g = game({
      p1: { graveyard: ['bulk-up'], battlefield: [...n('mountain', 6), 'gnarlback-rhino'] },
    });
    const rhino = g.id('p1', 'gnarlback-rhino');
    const bulk = g.id('p1', 'bulk-up', 'graveyard');
    cast(g, 'bulk-up', [g.ref(rhino)], {}, 'graveyard')
      .passBoth()
      .passBoth(); // Rhino's draw trigger, then Bulk Up
    expect(pt(g, rhino)).toEqual([8, 4]);
    expect(g.zoneOf(bulk)).toBe('exile');
  });

  it("Resolute Reinforcements has flash: cast on the opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['resolute-reinforcements'], battlefield: n('plains', 2) },
    });
    g.pass(); // p2 passes in their main phase; p1 gets priority
    expect(g.actor).toBe('p1');
    cast(g, 'resolute-reinforcements').passBoth(); // the creature
    g.passBoth(); // its enters trigger
    expect(g.zoneOf(g.id('p1', 'resolute-reinforcements'))).toBe('battlefield');
    expect(tokens(g, 'soldier-token')).toHaveLength(1);
  });
});

describe('equipment and tokens', () => {
  it('Goldvein Pick: equip, +1/+1, Treasure on combat damage; Treasure pays and is sacrificed', () => {
    const g = game({
      p1: {
        battlefield: ['mountain', 'mountain', 'goldvein-pick', 'bear-cub'],
        hand: ['swab-goblin'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const pick = g.id('p1', 'goldvein-pick');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: pick,
      abilityIndex: 2,
      targets: [g.ref(bear)],
    });
    g.passBoth();
    expect(pt(g, bear)).toEqual([3, 3]);
    g.passUntilStep('beginCombat').passBoth();
    g.attack(bear).passUntilStep('main2');
    const treasure = tokens(g, 'treasure-token');
    expect(treasure).toHaveLength(1);
    // Equip used one Mountain; the other Mountain + Treasure pay for {1}{R}.
    cast(g, 'swab-goblin');
    expect(g.zoneOf(treasure[0]!)).toBe('gone');
  });

  it('Equipment falls off when the creature dies', () => {
    const g = game({
      p1: { battlefield: ['mountain', 'goldvein-pick', 'bear-cub'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const pick = g.id('p1', 'goldvein-pick');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: pick,
      abilityIndex: 2,
      targets: [g.ref(bear)],
    });
    g.passBoth();
    expect(g.obj(pick).attachedTo).toBe(bear);
    g.obj(bear); // 3/3 now: shock won't kill; damage it first
    g.state.objects[bear]!.damage = 1;
    g.pass(); // p1 passes, p2 responds
    cast(g, 'shock', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.obj(pick).attachedTo).toBeUndefined();
  });

  it('Celestial Armor: flash, attaches on entering, hexproof + indestructible this turn', () => {
    const g = game({
      p1: { hand: ['celestial-armor'], battlefield: [...n('plains', 3), 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'celestial-armor').passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(pt(g, bear)).toEqual([4, 2]);
    expect([...kw(g, bear)].sort()).toEqual(['flying', 'hexproof', 'indestructible']);
  });

  it('Eager Trufflesnout makes Food; Food gains 3 life', () => {
    const g = game({
      step: 'beginCombat',
      p1: { life: 10, battlefield: [...n('forest', 2), 'eager-trufflesnout'] },
    });
    g.passBoth().attack(g.id('p1', 'eager-trufflesnout')).passUntilStep('main2');
    const food = tokens(g, 'food-token');
    expect(food).toHaveLength(1);
    g.do({ type: 'activateAbility', player: 'p1', source: food[0]!, abilityIndex: 0, targets: [] });
    g.passBoth();
    expect(g.life('p1')).toBe(13);
  });
});

describe('removal and protection', () => {
  it('Valorous Stance can only destroy a creature with toughness 4 or greater', () => {
    const g = game({
      p1: { hand: ['valorous-stance'], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub', 'gnarlback-rhino'] },
    });
    const destroyTargets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.mode === 1)
      .map((a) =>
        a.type === 'castSpell' && 'object' in a.targets[0]!
          ? g.obj(a.targets[0].object.id).defId
          : '',
      );
    expect(destroyTargets).toEqual(['gnarlback-rhino']);
  });

  it('indestructible survives lethal damage', () => {
    const g = game({
      p1: { hand: ['valorous-stance'], battlefield: [...n('plains', 2), 'bear-cub'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'valorous-stance', [g.ref(bear)], { mode: 0 }).passBoth();
    g.pass();
    cast(g, 'lightning-strike', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
  });

  it('Scorching Dragonfire exiles the creature it kills', () => {
    const g = game({
      p1: { hand: ['scorching-dragonfire'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'scorching-dragonfire', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('exile');
  });
});

describe('combat cards', () => {
  it('Aurelia untaps your creatures and adds one extra combat, once per turn', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['aurelia-the-warleader', 'bear-cub'] },
    });
    const aurelia = g.id('p1', 'aurelia-the-warleader');
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(aurelia, bear);
    g.passBoth(); // resolve the trigger
    expect(g.obj(bear).tapped).toBe(false);
    g.passUntilStep('endCombat').passBoth();
    expect(g.state.turn.step).toBe('beginCombat');
    g.passBoth().attack(aurelia);
    expect(g.state.stack).toHaveLength(0); // no second trigger
    g.passUntilStep('endCombat').passBoth();
    expect(g.state.turn.step).toBe('main2');
    expect(g.life('p2')).toBe(20 - 3 - 2 - 3);
  });

  it('Frenzied Goblin: pay {R} so a creature can’t block; not offered without {R}', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['frenzied-goblin', 'mountain'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    g.passBoth().attack(g.id('p1', 'frenzied-goblin'));
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] });
    expect(g.obj(g.id('p1', 'mountain')).tapped).toBe(true);
    g.passBoth();
    expect(getCharacteristics(g.state, cardDb, bear).cantBlock).toBe(true);

    const broke = game({
      step: 'beginCombat',
      p1: { battlefield: ['frenzied-goblin'] },
      p2: { battlefield: ['bear-cub'] },
    });
    broke.passBoth().attack(broke.id('p1', 'frenzied-goblin'));
    const offers = broke.legal().filter((a) => a.type === 'chooseTargets');
    expect(offers).toEqual([{ type: 'chooseTargets', player: 'p1', targets: [] }]);
  });

  it('Halana and Alena put counters equal to their power and give haste', () => {
    const g = game({
      step: 'main1',
      p1: { battlefield: ['halana-and-alena-partners', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth(); // to beginning of combat
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(kw(g, bear).has('haste')).toBe(true);
  });

  it('Nessian Hornbeetle grows only with another 4-power creature', () => {
    const g = game({ p1: { battlefield: ['nessian-hornbeetle', 'gnarlback-rhino'] } });
    g.passBoth().passBoth();
    expect(pt(g, g.id('p1', 'nessian-hornbeetle'))).toEqual([3, 3]);
    const lone = game({ p1: { battlefield: ['nessian-hornbeetle', 'bear-cub'] } });
    lone.passBoth();
    expect(lone.state.stack).toHaveLength(0);
  });

  it('Ashroot Animist gives another attacker +X/+X and trample', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['ashroot-animist', 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(g.id('p1', 'ashroot-animist'), bear);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(pt(g, bear)).toEqual([6, 6]);
    expect(kw(g, bear).has('trample')).toBe(true);
  });
});

describe('other creatures and spells', () => {
  it('Crusader of Odric counts your creatures', () => {
    const g = game({ p1: { battlefield: ['crusader-of-odric', 'bear-cub', 'bear-cub'] } });
    expect(pt(g, g.id('p1', 'crusader-of-odric'))).toEqual([3, 3]);
  });

  it('Krenko makes a Goblin for each Goblin you control', () => {
    const g = game({ p1: { battlefield: ['krenko-mob-boss', 'swab-goblin'] } });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'krenko-mob-boss'),
      abilityIndex: 0,
      targets: [],
    });
    g.passBoth();
    expect(tokens(g, 'goblin-token')).toHaveLength(2);
  });

  it('Mild-Mannered Librarian can be activated only once', () => {
    const g = game({ p1: { battlefield: [...n('forest', 8), 'mild-mannered-librarian'] } });
    const lib = g.id('p1', 'mild-mannered-librarian');
    const activation: Action = {
      type: 'activateAbility',
      player: 'p1',
      source: lib,
      abilityIndex: 0,
      targets: [],
    };
    g.do(activation).passBoth();
    expect(pt(g, lib)).toEqual([3, 3]);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === lib)).toBe(false);
  });

  it('Bushwhack finds a basic land and shuffles', () => {
    const g = game({
      p1: {
        hand: ['bushwhack'],
        battlefield: ['forest'],
        library: ['bear-cub', 'mountain', 'forest'],
      },
    });
    cast(g, 'bushwhack', [], { mode: 0 }).passBoth();
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error(`expected a search, got ${d.kind}`);
    expect(d.options.map((id) => g.obj(id).defId).sort()).toEqual(['forest', 'mountain']);
    expect(g.legal()).toHaveLength(3); // mountain, forest, nothing
    const mountain = d.options.find((id) => g.obj(id).defId === 'mountain')!;
    g.do({ type: 'chooseCard', player: 'p1', card: mountain });
    expect(g.state.players.p1.hand).toEqual([mountain]);
    expect(g.zoneOf(g.id('p1', 'bushwhack', 'graveyard'))).toBe('graveyard');
    expect(g.decision.kind).toBe('priority');
  });

  it("Garruk's Uprising draws on entering with a big creature, and on each big creature after", () => {
    const g = game({
      p1: {
        hand: ['garruks-uprising', 'gnarlback-rhino'],
        battlefield: [...n('forest', 7), 'magnigoth-sentry'],
      },
    });
    cast(g, 'garruks-uprising').passBoth().passBoth();
    expect(g.state.players.p1.hand).toHaveLength(2); // rhino + a draw
    expect(kw(g, g.id('p1', 'magnigoth-sentry')).has('trample')).toBe(true);
    cast(g, 'gnarlback-rhino').passBoth().passBoth();
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Spinner of Souls finds a creature when another nontoken creature dies', () => {
    const g = game({
      p1: {
        battlefield: ['spinner-of-souls', 'bear-cub'],
        library: ['forest', 'gnarlback-rhino', 'forest'],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]).passBoth();
    g.passBoth(); // Spinner's trigger
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['gnarlback-rhino']);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('Vizier of the Menagerie casts creatures from the top of the library with any mana', () => {
    const g = game({
      p1: {
        battlefield: [...n('mountain', 4), 'vizier-of-the-menagerie'],
        library: ['gnarlback-rhino', 'forest'],
      },
    });
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === top)).toBe(true);
    cast(g, 'gnarlback-rhino', [], {}, 'library').passBoth();
    expect(g.zoneOf(top)).toBe('battlefield');
  });
});
