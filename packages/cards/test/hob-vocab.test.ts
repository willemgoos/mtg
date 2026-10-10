import { type CardDefinition, createEngine, getCharacteristics } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { mapKeywords } from '../src/build.ts';
import {
  AMASS_ARMY_TOKENS,
  amass,
  amassGoblins,
  basicLandcycling,
  enduringStory,
  ifEnduringStory,
  landcycling,
  recruit,
  sacrificeLandForCounters,
  storied,
  storyAnthem,
  storyPump,
  storyTriggersTwice,
  subtypecycling,
  typecycling,
} from '../src/hob-vocab.ts';
import { HOB_GOBLIN_ARMY, HOB_HUMAN_SOLDIER, HOB_SHARED_TOKENS } from '../src/hob/tokens.ts';
import { cardDb } from '../src/index.ts';

// The Hobbit (20a): the builders produce what the engine runs.

const card = (d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition => ({
  name: d.id,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: [],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...d,
});
const land = (id: string, produces: 'W' | 'U' | 'B' | 'R' | 'G'): CardDefinition =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['W'], ...extra });

const SOLDIER = HOB_SHARED_TOKENS.find((t) => t.id === HOB_HUMAN_SOLDIER)!;
const ARMY = HOB_SHARED_TOKENS.find((t) => t.id === HOB_GOBLIN_ARMY)!;

const CARDS: CardDefinition[] = [
  land('plains', 'W'),
  land('swamp', 'B'),
  land('island', 'U'),
  land('forest', 'G'),
  card({
    id: 'mountain-basic',
    types: ['Land'],
    supertypes: ['Basic'],
    subtypes: ['Mountain'],
    abilities: [],
  }),
  creature('halfling', 1, 1, { subtypes: ['Halfling'] }),
  creature('bear', 2, 2),
  ARMY,
  SOLDIER,
  // Goblin-town Flunkies: "When this creature enters, amass Goblins 1."
  creature('flunkies', 2, 1, {
    abilities: [
      { kind: 'triggered', trigger: { on: 'etb' }, targets: [], effects: [amassGoblins(1)] },
    ],
  }),
  // Patient Instructor: "When this creature enters, recruit."
  creature('instructor', 2, 2, {
    abilities: [{ kind: 'triggered', trigger: { on: 'etb' }, targets: [], effects: [recruit] }],
  }),
  // Dwarves: Ori (+1/+0 and vigilance), Fíli (anthem), Bifur (triggers twice), Balin-like (if you have an enduring story).
  creature('ori', 2, 3, {
    supertypes: ['Legendary'],
    subtypes: ['Dwarf'],
    abilities: [storied, storyPump(1, 0, ['vigilance'])],
  }),
  creature('fili', 3, 3, {
    supertypes: ['Legendary'],
    subtypes: ['Dwarf'],
    abilities: [storied, storyAnthem(1, 1)],
  }),
  creature('bifur', 2, 2, {
    supertypes: ['Legendary'],
    subtypes: ['Dwarf'],
    abilities: [storied, storyTriggersTwice('Dwarf')],
  }),
  creature('dwarf-drawer', 1, 1, {
    subtypes: ['Dwarf'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  creature('balin', 3, 3, {
    supertypes: ['Legendary'],
    subtypes: ['Dwarf'],
    abilities: [
      storied,
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [ifEnduringStory([{ kind: 'loseLife', who: 'eachOpponent', amount: 3 }])],
      },
    ],
  }),
  card({ id: 'relic', types: ['Artifact'] }),
  card({ id: 'relic-2', types: ['Artifact'] }),
  // The cycling cards.
  card({ id: 'hobbit-hole', types: ['Land'], abilities: [subtypecycling('Halfling', '{4}')] }),
  card({
    id: 'last-light',
    types: ['Enchantment'],
    abilities: [subtypecycling('Mountain', '{2}')],
  }),
  card({ id: 'land-cycler', types: ['Enchantment'], abilities: [landcycling('{2}')] }),
  card({ id: 'basic-cycler', types: ['Enchantment'], abilities: [basicLandcycling('{1}')] }),
  // Lake-town: "{2}{W}{U}, {T}, Sacrifice this land: Put two +1/+1 counters on target Human you control. Activate only as a sorcery."
  card({
    id: 'lake-town',
    types: ['Land'],
    entersTapped: true,
    abilities: [sacrificeLandForCounters('{2}{W}{U}', ['Human'])],
  }),
  card({
    id: 'mirkwood',
    types: ['Land'],
    abilities: [sacrificeLandForCounters('{2}{B}{G}', ['Bear', 'Spider', 'Wolf'])],
  }),
  creature('human', 1, 1, { subtypes: ['Human'] }),
  creature('wolf', 2, 2, { subtypes: ['Wolf'] }),
];
const db = new Map(CARDS.map((c) => [c.id, c]));
const engine = createEngine(db);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(db, spec));
const settle = (g: GameDriver) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};
const cast = (g: GameDriver, id: string) => {
  const a = g.legal('p1').find((x) => x.type === 'castSpell' && x.card === g.id('p1', id, 'hand'));
  if (!a) throw new Error(`cannot cast ${id}`);
  g.do(a);
};

describe('amass', () => {
  it('builds the engine effect with the Army token of the type', () => {
    expect(amass('Goblin', 3)).toEqual({
      kind: 'amass',
      subtype: 'Goblin',
      amount: 3,
      token: 'hob-goblin-army-token',
    });
    expect(amassGoblins(2)).toEqual(amass('Goblin', 2));
    expect(amass('Zombie', 1)).toMatchObject({ token: 'soc-15b-u-zombie-army' });
    expect(amass('Orc', 1, { token: 'my-orc-army' })).toMatchObject({ token: 'my-orc-army' });
  });

  it('refuses a type that has no Army token (it would amass nothing)', () => {
    expect(() => amass('Orc', 1)).toThrow(/no Army token/);
  });

  it('Azog\'s "its controller" is a Ref on the effect', () => {
    expect(amass('Goblin', { powerOf: { target: 0 } }, { who: { controllerOf: 0 } })).toMatchObject(
      {
        who: { controllerOf: 0 },
        amount: { powerOf: { target: 0 } },
      },
    );
  });

  it('the token ids in the table exist as the shared token and the Lazotep Plating token', () => {
    expect(AMASS_ARMY_TOKENS.Goblin).toBe(HOB_GOBLIN_ARMY);
    expect(cardDb.get(AMASS_ARMY_TOKENS.Zombie!)?.subtypes).toEqual(['Zombie', 'Army']);
    expect(cardDb.get(AMASS_ARMY_TOKENS.Goblin!)?.subtypes).toEqual(['Goblin', 'Army']);
    expect(ARMY.power).toBe(0);
  });

  it('Lazotep Plating is the general amass now, not a custom effect', () => {
    const plating = cardDb.get('lazotep-plating');
    expect(plating?.spell?.effects[0]).toMatchObject({
      kind: 'amass',
      subtype: 'Zombie',
      amount: 1,
      token: 'soc-15b-u-zombie-army',
    });
  });

  it('runs: Goblin-town Flunkies amasses Goblins 1 (a 1/1 Goblin Army)', () => {
    const g = game({ p1: { hand: ['flunkies'] }, p2: {} });
    cast(g, 'flunkies');
    settle(g);
    const army = g.state.battlefield.find((id) => g.state.objects[id]!.defId === HOB_GOBLIN_ARMY)!;
    expect(g.state.objects[army]!.plusOneCounters).toBe(1);
  });
});

describe('recruit', () => {
  it('is the engine effect', () => {
    expect(recruit).toEqual({ kind: 'recruit' });
  });

  it('runs: draw, discard a nonland card, a 1/1 Human Soldier', () => {
    const g = game({ p1: { hand: ['instructor', 'relic'], library: ['bear', 'forest'] }, p2: {} });
    cast(g, 'instructor');
    settle(g);
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'relic', 'hand') });
    const soldier = g.state.battlefield.find(
      (id) => g.state.objects[id]!.defId === HOB_HUMAN_SOLDIER,
    );
    expect(soldier).toBeDefined();
  });
});

describe('Storied', () => {
  it('is a static ability and the condition is a plain kind', () => {
    expect(storied).toEqual({ kind: 'static', effect: { kind: 'storied' } });
    expect(enduringStory).toEqual({ kind: 'enduringStory' });
  });

  it('the pump and the anthem follow the story (Ori +1/+0 and vigilance; Fíli creatures +1/+1)', () => {
    const g = game({ p1: { battlefield: ['ori', 'fili', 'bear'] }, p2: {} });
    const stat = (id: string) => getCharacteristics(g.state, db, g.id('p1', id));
    // Ori and Fíli are two of the three: no story yet.
    expect(stat('ori').power).toBe(2);
    expect(stat('bear').power).toBe(2);
    expect([...stat('ori').keywords]).not.toContain('vigilance');
    const withStory = game({ p1: { battlefield: ['ori', 'fili', 'bear', 'relic'] }, p2: {} });
    const s2 = (id: string) => getCharacteristics(withStory.state, db, withStory.id('p1', id));
    expect(s2('ori').power).toBe(4); // +1/+0 of its own and +1/+1 of Fíli's anthem
    expect(s2('bear').power).toBe(3);
    expect([...s2('ori').keywords]).toContain('vigilance');
    withStory.passBoth();
    expect(withStory.state.players.p1.enduringStory).toBe(true);
    expect(g.state.players.p1.enduringStory).toBeUndefined();
  });

  it("Bifur: a Dwarf's enters trigger happens twice with the story", () => {
    const run = (battlefield: string[]) => {
      const g = game({
        p1: {
          hand: ['dwarf-drawer'],
          battlefield: [...battlefield],
          library: ['forest', 'forest', 'forest'],
        },
        p2: {},
      });
      cast(g, 'dwarf-drawer');
      settle(g);
      return g.events.filter((e) => e.type === 'cardDrawn').length;
    };
    expect(run(['bifur'])).toBe(1);
    expect(run(['bifur', 'relic', 'relic-2'])).toBe(2);
  });

  it('Balin: the damage is dealt only with the story', () => {
    const run = (battlefield: string[]) => {
      const g = game({ p1: { hand: ['balin'], battlefield }, p2: {} });
      cast(g, 'balin');
      settle(g);
      return g.life('p2');
    };
    expect(run([])).toBe(20);
    expect(run(['relic', 'relic-2'])).toBe(17);
  });
});

describe('typecycling', () => {
  const search = (a: ReturnType<typeof typecycling>) =>
    a.kind === 'activated' ? a.effects[0] : undefined;

  it('builds {cost}, discard this card: search, reveal, hand, shuffle (activated from the hand)', () => {
    const a = subtypecycling('Halfling', '{4}');
    expect(a).toMatchObject({
      kind: 'activated',
      fromHand: true,
      cost: { mana: { generic: 4, colored: {} }, discardSelf: true },
      label: 'Halflingcycling {4}',
    });
    expect(search(a)).toEqual({
      kind: 'searchLibrary',
      filter: { subtype: 'Halfling' },
      to: 'hand',
      reveal: true,
    });
  });

  it('landcycling looks for a land card, basic landcycling for a basic land card', () => {
    expect(search(landcycling('{2}'))).toMatchObject({ filter: { types: ['Land'] } });
    expect(search(basicLandcycling('{1}'))).toMatchObject({ filter: 'basicLand' });
    expect(landcycling('{2}')).toMatchObject({ label: 'Landcycling {2}' });
  });

  it('runs: Halflingcycling {4} finds the Halfling (Hobbit Hole)', () => {
    const g = game({
      p1: {
        hand: ['hobbit-hole'],
        library: ['forest', 'halfling', 'bear'],
        battlefield: ['plains', 'plains', 'plains', 'plains'],
      },
      p2: {},
    });
    const hole = g.id('p1', 'hobbit-hole', 'hand');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === hole)!);
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    if (g.decision.kind !== 'searchLibrary') return;
    expect(g.decision.options.map((id) => g.state.objects[id]!.defId)).toEqual(['halfling']);
  });

  it("runs: Mountaincycling {2} finds a Mountain card (Last Light of Durin's Day)", () => {
    const g = game({
      p1: {
        hand: ['last-light'],
        library: ['forest', 'mountain-basic'],
        battlefield: ['plains', 'plains'],
      },
      p2: {},
    });
    const lastLight = g.id('p1', 'last-light', 'hand');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === lastLight)!);
    g.passBoth();
    if (g.decision.kind !== 'searchLibrary') throw new Error('no search');
    expect(g.decision.options.map((id) => g.state.objects[id]!.defId)).toEqual(['mountain-basic']);
  });
});

describe('the two-colour lands', () => {
  it('Lake-town: sacrifice for two +1/+1 counters on a target Human you control, at sorcery speed', () => {
    const mk = (step: 'main1' | 'beginCombat') =>
      game({
        step,
        p1: {
          battlefield: ['lake-town', 'plains', 'plains', 'island', 'forest', 'human', 'wolf'],
        },
        p2: {},
      });
    const g = mk('main1');
    const lake = g.id('p1', 'lake-town');
    const acts = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === lake);
    const targets = acts.flatMap((a) =>
      a.type === 'activateAbility'
        ? a.targets.map((t) => ('object' in t ? g.state.objects[t.object.id]!.defId : 'player'))
        : [],
    );
    expect(targets).toEqual(['human']);
    g.do(acts[0]!);
    g.passBoth();
    expect(g.state.objects[g.id('p1', 'human')]!.plusOneCounters).toBe(2);
    expect(g.zoneOf(lake)).toBe('graveyard');
    // Not at instant speed.
    const late = mk('beginCombat');
    expect(
      late
        .legal('p1')
        .filter((a) => a.type === 'activateAbility' && a.source === late.id('p1', 'lake-town')),
    ).toHaveLength(0);
  });

  it('Mirkwood targets a Bear, Spider or Wolf only', () => {
    const g = game({
      p1: {
        battlefield: ['mirkwood', 'swamp', 'swamp', 'forest', 'forest', 'human', 'wolf'],
      },
      p2: {},
    });
    const mirk = g.id('p1', 'mirkwood');
    const acts = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === mirk);
    const targets = acts.flatMap((a) =>
      a.type === 'activateAbility'
        ? a.targets.map((t) => ('object' in t ? g.state.objects[t.object.id]!.defId : 'player'))
        : [],
    );
    expect(targets).toEqual(['wolf']);
    g.do(acts[0]!);
    g.passBoth();
    expect(g.state.objects[g.id('p1', 'wolf')]!.plusOneCounters).toBe(2);
    expect(g.zoneOf(mirk)).toBe('graveyard');
  });
});

describe('keywords on the cards', () => {
  it("every keyword the set's cards carry is known to the card builder", () => {
    const keywords = [
      'Cycling',
      'Halflingcycling',
      'Flashback',
      'Reach',
      'Kicker',
      'Equip',
      'Trample',
      'Enchant',
      'Amass',
      'Landfall',
      'Recruit',
      'Storied',
      'First strike',
      'Flying',
      'Treasure',
      'Ferocious',
      'Ward',
      'Threshold',
      'Mill',
      'Double strike',
      'Deathtouch',
      'Flash',
      'Vigilance',
      'Gift',
      'Haste',
      'Scry',
      'Menace',
      'Hexproof',
      'Crew',
      'Fight',
      'Behold',
      'Mountaincycling',
      'Landcycling',
      'Typecycling',
      'Affinity',
    ];
    for (const k of keywords) expect(() => mapKeywords([k], '')).not.toThrow();
  });
});
