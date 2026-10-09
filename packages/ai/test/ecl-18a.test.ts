import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type ManaCost,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, createSearchBot } from '../src/index.ts';

// Lorwyn Eclipsed (18a): how the bots handle blight, evoke and conspire.

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});
function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: cost(0),
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['R'], ...extra });

const DB = new Map(
  [
    card({
      id: 'mountain',
      types: ['Land'],
      supertypes: ['Basic'],
      abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'R' }],
    }),
    creature('small', 1, 1),
    creature('big', 4, 4),
    creature('ogre', 3, 3),
    // "When this creature enters, you may blight 1. If you do, each opponent discards a card."
    creature('seizer', 2, 2, {
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [],
          effects: [
            {
              kind: 'blight',
              amount: 1,
              optional: true,
              then: [{ kind: 'discard', who: 'eachOpponent', count: 1 }],
            },
          ],
        },
      ],
    }),
    // Cinder Strike: "you may blight 1. 2 damage to target creature; 4 instead if paid."
    card({
      id: 'cinder-strike',
      types: ['Sorcery'],
      colors: ['R'],
      manaCost: cost(0, { R: 1 }),
      kicker: { cost: cost(0), blight: 1 },
      spell: {
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'wasKicked' },
            then: [{ kind: 'damage', amount: 4, to: { target: 0 } }],
            else: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
          },
        ],
      },
    }),
    // An evoke Elemental: when it enters, 3 damage to target creature an opponent controls.
    creature('flame-incarnation', 5, 5, {
      manaCost: cost(3, { R: 2 }),
      evoke: cost(0, { R: 2 }),
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [{ what: 'creature', controller: 'opponent' }],
          effects: [{ kind: 'damage', amount: 3, to: { target: 0 } }],
        },
      ],
    }),
    // A creature with no enter effect and an evoke cost: evoking it only wastes it.
    creature('plain-incarnation', 5, 5, {
      manaCost: cost(3, { R: 2 }),
      evoke: cost(0, { R: 2 }),
    }),
  ].map((c) => [c.id, c]),
);

const engine = createEngine(DB);
const bot = createHeuristicBot(DB);
/** Libraries of lands unless the scenario sets its own. */
const game = (spec: ScenarioSpec) =>
  new GameDriver(
    engine,
    buildScenario(DB, {
      ...spec,
      p1: { library: lands(10), ...spec.p1 },
      p2: { library: lands(10), ...spec.p2 },
    }),
  );
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);
function lands(n: number): string[] {
  return Array<string>(n).fill('mountain');
}

describe('heuristic bot: blight', () => {
  it('blights the creature that survives and matters least, not the 1/1 that would die', () => {
    const g = game({
      p1: { hand: ['seizer'], battlefield: [...lands(2), 'small', 'big'] },
      p2: { hand: ['ogre', 'ogre', 'ogre'] },
    });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    const pick = choose(g);
    // Either it declines or it puts the counter on a creature that lives: never the 1/1.
    expect(pick.type).toBe('chooseCard');
    if (pick.type === 'chooseCard' && pick.card) expect(g.obj(pick.card).defId).not.toBe('small');
  });

  it('pays an optional blight when it kills a bigger creature, and with the creature it can spare', () => {
    const g = game({
      p1: { hand: ['cinder-strike'], battlefield: [...lands(1), 'small', 'big'] },
      p2: { battlefield: ['big'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    expect(a.kicked).toBe(true);
    // The counter goes on a creature of ours that survives it, not the 1/1.
    expect(g.obj(a.blight!).defId).toBe('big');
  });

  it('skips the optional blight when 2 damage is enough', () => {
    const g = game({
      p1: { hand: ['cinder-strike'], battlefield: [...lands(1), 'big'] },
      p2: { battlefield: ['small'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.blight).toBeUndefined();
  });
});

describe('heuristic bot: evoke', () => {
  it('evokes when the enter effect is worth the card', () => {
    const g = game({
      p1: { hand: ['flame-incarnation'], battlefield: lands(2) },
      p2: { battlefield: ['ogre'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.evoked).toBe(true);
  });

  it('casts normally when it can afford to', () => {
    const g = game({
      p1: { hand: ['flame-incarnation'], battlefield: lands(5) },
      p2: { battlefield: ['ogre'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type === 'castSpell') expect(a.evoked).toBeUndefined();
  });

  it('does not throw a creature away with nothing to gain', () => {
    const g = game({
      p1: { hand: ['plain-incarnation'], battlefield: lands(2) },
      p2: { battlefield: ['ogre'] },
    });
    expect(choose(g).type).toBe('passPriority');
  });
});

describe('search bot', () => {
  it('plays a blight card without trouble', () => {
    const g = game({
      p1: { hand: ['cinder-strike'], battlefield: [...lands(1), 'small', 'big'] },
      p2: { battlefield: ['big'] },
    });
    const decks = { p1: [] as string[], p2: [] as string[] };
    for (const o of Object.values(g.state.objects)) decks[o.owner].push(o.defId);
    const search = createSearchBot(DB, decks, { seed: 3, rollouts: 12 });
    const a = search.chooseAction(redactFor(g.state, 'p1'), 'p1');
    expect(g.legal('p1').some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
  });
});
