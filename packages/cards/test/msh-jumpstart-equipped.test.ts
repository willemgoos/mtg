import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Equipped packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Bucky Barnes, Eager Ally',
  'Peggy Carter, Secret Agent',
  'The Howling Commandos',
  'Agent 13, Sharon Carter',
  'Patriot, Young Avenger',
  'U.S.Agent, John Walker',
  'Captain America, Liberator',
  "Captain America's Shield",
  'Take Up the Shield',
  'Infinity Formula',
  'Origin of Captain America',
  'Secure Detention',
  'Thriving Heath',
  'Plains',
];

const BUCKY = slug('Bucky Barnes, Eager Ally');
const COMMANDOS = slug('The Howling Commandos');
const AGENT = slug('U.S.Agent, John Walker');
const CAP = slug('Captain America, Liberator');
const FORMULA = slug('Infinity Formula');
const ORIGIN = slug('Origin of Captain America');
const SHIELD = 'sturdy-shield-token';
const SHIELD_CARD = slug("Captain America's Shield");

type G = ReturnType<typeof game>;

/**
 * Resolves the stack: accepts "you may", picks `card` when offered (else the first choice)
 * and gives targets their first real option.
 */
const resolve = (g: G, card?: string, accept = true) => {
  for (let i = 0; i < 60; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'priority' || d.kind === 'declareAttackers' || d.kind === 'declareBlockers')
      return g;
    if (d.kind === 'optionalEffect') {
      g.do({ type: 'chooseEffect', player: g.actor, accept });
      continue;
    }
    const legal = g.legal();
    g.do(
      (card !== undefined && legal.find((a) => a.type === 'chooseCard' && a.card === card)) ||
        legal[0]!,
    );
  }
  return g;
};

/** Moves on from the upkeep to the precombat main phase (the Saga's lore counter). */
const toMain = (g: G) => {
  for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
  return g;
};

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

describe('Equipped packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Bucky Barnes, Eager Ally', () => {
  it('when he dies, takes an Equipment, Hero or Soldier card from the top four', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        battlefield: [BUCKY, 'mountain'],
        library: ['plains', FORMULA, 'plains', 'plains', 'plains'],
      },
    });
    const formula = g.id('p1', FORMULA, 'library');
    expect(keywords(g, g.id('p1', BUCKY)).has('vigilance')).toBe(true);
    cast(g, 'lightning-bolt', [g.ref(g.id('p1', BUCKY))]);
    resolve(g, formula);
    expect(g.zoneOf(formula)).toBe('hand');
    expect(handSize(g, 'p1')).toBe(1);
    // The other three went to the bottom; the fifth card is now on top.
    expect(g.state.players.p1.library).toHaveLength(4);
  });
});

describe('The Howling Commandos', () => {
  it('{5}: creatures you control get +1/+1 and Soldiers gain vigilance', () => {
    const g = game({
      p1: { battlefield: [COMMANDOS, 'bear-cub', ...n('plains', 5)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const commandos = g.id('p1', COMMANDOS);
    const bear = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: commandos,
      abilityIndex: 0,
      targets: [],
    });
    resolve(g);
    expect(pt(g, commandos)).toEqual([4, 2]);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(pt(g, theirs)).toEqual([2, 2]);
    expect(keywords(g, commandos).has('vigilance')).toBe(true);
    expect(keywords(g, bear).has('vigilance')).toBe(false);
  });
});

describe('U.S.Agent, John Walker', () => {
  it('enters with a Sturdy Shield attached (+1/+2, equip {2})', () => {
    const g = game({ p1: { hand: [AGENT], battlefield: n('plains', 4) } });
    resolve(cast(g, AGENT));
    const agent = g.id('p1', AGENT);
    const shields = all(g, SHIELD);
    expect(shields).toHaveLength(1);
    expect(g.obj(shields[0]!).attachedTo).toBe(agent);
    expect(g.obj(shields[0]!).isToken).toBe(true);
    expect(pt(g, agent)).toEqual([4, 4]);
  });
});

describe('Captain America, Liberator', () => {
  it('fetches an Equipment with mana value 3 or less, and makes a Soldier per Equipment when attacking', () => {
    const g = game({
      p1: {
        hand: [CAP],
        battlefield: n('plains', 5),
        library: ['plains', FORMULA, 'plains'],
      },
    });
    const formula = g.id('p1', FORMULA, 'library');
    resolve(cast(g, CAP), formula);
    const cap = g.id('p1', CAP);
    expect(g.zoneOf(formula)).toBe('battlefield');
    // Infinity Formula's own trigger attached it to Captain America.
    expect(g.obj(formula).attachedTo).toBe(cap);
    expect(pt(g, cap)).toEqual([6, 7]);
  });

  it('attacking with two Equipment attached makes two Soldiers', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [CAP, FORMULA, SHIELD_CARD] },
    });
    const cap = g.id('p1', CAP);
    g.obj(g.id('p1', FORMULA)).attachedTo = cap;
    g.obj(g.id('p1', SHIELD_CARD)).attachedTo = cap;
    g.passBoth().attack(cap);
    resolve(g);
    expect(all(g, 'soldier-token')).toHaveLength(2);
    // Infinity Formula: "Whenever this creature attacks, you gain 2 life."
    expect(g.life('p1')).toBe(22);
  });

  it('may decline the search', () => {
    const g = game({ p1: { hand: [CAP], battlefield: n('plains', 5), library: [FORMULA] } });
    resolve(cast(g, CAP), undefined, false);
    expect(g.zoneOf(g.id('p1', FORMULA, 'library'))).toBe('library');
  });
});

describe('Infinity Formula', () => {
  it('attaches as it enters: +1/+2 and 2 life whenever the creature attacks', () => {
    const g = game({
      p1: { hand: [FORMULA], battlefield: ['bear-cub', ...n('plains', 3)] },
    });
    const bear = g.id('p1', 'bear-cub');
    resolve(cast(g, FORMULA));
    const formula = g.id('p1', FORMULA);
    expect(g.obj(formula).attachedTo).toBe(bear);
    expect(pt(g, bear)).toEqual([3, 4]);
  });
});

describe('Origin of Captain America', () => {
  it('chapter I: a +1/+1 counter, first strike and vigilance', () => {
    const g = game({ p1: { hand: [ORIGIN], battlefield: ['bear-cub', ...n('plains', 3)] } });
    const bear = g.id('p1', 'bear-cub');
    resolve(cast(g, ORIGIN));
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(keywords(g, bear).has('firstStrike')).toBe(true);
    expect(keywords(g, bear).has('vigilance')).toBe(true);
  });

  it('chapter II: creates an unattached Sturdy Shield', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [ORIGIN, 'bear-cub', ...n('plains', 2)], library: n('plains', 3) },
    });
    g.obj(g.id('p1', ORIGIN)).counters = { lore: 1 };
    resolve(toMain(g));
    const shield = all(g, SHIELD)[0]!;
    expect(g.obj(shield).attachedTo).toBeUndefined();
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: shield,
      abilityIndex: 1,
      targets: [g.ref(bear)],
    });
    resolve(g);
    expect(pt(g, bear)).toEqual([3, 4]);
  });

  it('chapter III: taps a creature and puts a stun counter on it', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [ORIGIN], library: n('plains', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    g.obj(g.id('p1', ORIGIN)).counters = { lore: 2 };
    resolve(toMain(g));
    const bear = g.id('p2', 'bear-cub');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(bear).counters?.stun).toBe(1);
    expect(all(g, ORIGIN)).toHaveLength(0);
  });
});
