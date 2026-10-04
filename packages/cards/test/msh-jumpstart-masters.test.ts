import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Masters of Evil packet (docs/marvel-jumpstart.md).

const MASTERS = [
  'Boomerang, Blade Flinger',
  'Yellowjacket, Heartless Marauder',
  'Titania, Rugged Rumbler',
  'Klaw, Sonic Subjugator',
  'Crimson Cowl, Master of Evil',
  'Tiger Shark, Abyssal Hunter',
  'Radioactive Man',
  'The Masters of Evil',
  'Villainous Syndication',
  'Cruel Alliance',
  'Visions of Villainy',
  'Hour of Defeat',
  'Thriving Moor',
  'Swamp',
];

type G = ReturnType<typeof game>;

const activate = (g: G, source: string, abilityIndex: number) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets: [] });

/** Resolves the stack, answering discard and search decisions with `card` when offered. */
const resolve = (g: G, card?: string) => {
  for (let i = 0; i < 40; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'priority' || d.kind === 'declareAttackers' || d.kind === 'declareBlockers')
      return g;
    const legal = g.legal();
    g.do((card !== undefined && legal.find((a) => Object.values(a).includes(card))) || legal[0]!);
  }
  return g;
};

describe('Masters of Evil packet', () => {
  it('has every card implemented', () => {
    for (const name of MASTERS) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('Boomerang, Blade Flinger', () => {
  it('deals 1 damage to each opponent and gains 1 life when he attacks', () => {
    const g = game({ p1: { battlefield: ['boomerang-blade-flinger'] } });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'boomerang-blade-flinger'));
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });
});

describe('Crimson Cowl, Master of Evil', () => {
  it('makes a Villain token when a nontoken Villain attacks', () => {
    const g = game({
      p1: { battlefield: ['crimson-cowl-master-of-evil', 'boomerang-blade-flinger'] },
    });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'boomerang-blade-flinger'));
    settle(g);
    expect(all(g, 'villain-token')).toHaveLength(1);
  });

  it('needs a Villain attacking a player, not a planeswalker', () => {
    const g = game({
      p1: { battlefield: ['crimson-cowl-master-of-evil', 'boomerang-blade-flinger'] },
      p2: { battlefield: ['ral-crackling-wit'] },
    });
    const ral = g.id('p2', 'ral-crackling-wit');
    g.obj(ral).counters = { loyalty: 4 };
    g.passUntilStep('beginCombat').passBoth();
    const boomerang = g.id('p1', 'boomerang-blade-flinger');
    g.do({
      type: 'addAttacker',
      player: 'p1',
      attacker: boomerang,
      defender: 'p2',
      planeswalker: ral,
    });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    settle(g);
    expect(all(g, 'villain-token')).toHaveLength(0);
  });

  it('makes only one token however many Villains attack', () => {
    const g = game({
      p1: { battlefield: ['crimson-cowl-master-of-evil', 'boomerang-blade-flinger'] },
    });
    g.passUntilStep('beginCombat')
      .passBoth()
      .attack(g.id('p1', 'boomerang-blade-flinger'), g.id('p1', 'crimson-cowl-master-of-evil'));
    settle(g);
    expect(all(g, 'villain-token')).toHaveLength(1);
  });

  it("doesn't trigger when only Villain tokens attack", () => {
    const g = game({ p1: { battlefield: ['crimson-cowl-master-of-evil', 'villain-token'] } });
    const token = g.id('p1', 'villain-token');
    // Scenarios don't mark tokens.
    g.obj(token).isToken = true;
    g.passUntilStep('beginCombat').passBoth().attack(token);
    settle(g);
    expect(all(g, 'villain-token')).toHaveLength(1);
  });
});

describe('Tiger Shark, Abyssal Hunter', () => {
  it('connives when he enters', () => {
    const g = game({
      p1: {
        hand: ['tiger-shark-abyssal-hunter', 'bear-cub'],
        battlefield: n('swamp', 4),
        library: ['swamp'],
      },
    });
    cast(g, 'tiger-shark-abyssal-hunter');
    resolve(g, g.id('p1', 'bear-cub', 'hand'));
    const shark = g.id('p1', 'tiger-shark-abyssal-hunter');
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
    expect(pt(g, shark)).toEqual([3, 4]);
  });

  it('connives when he attacks', () => {
    const g = game({
      p1: { battlefield: ['tiger-shark-abyssal-hunter'], library: ['swamp', 'bear-cub'] },
    });
    const shark = g.id('p1', 'tiger-shark-abyssal-hunter');
    g.passUntilStep('beginCombat').passBoth().attack(shark);
    resolve(g);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });

  it("can't be blocked after paying {4}{U/B}", () => {
    const g = game({
      p1: { battlefield: ['tiger-shark-abyssal-hunter', ...n('swamp', 5)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const shark = g.id('p1', 'tiger-shark-abyssal-hunter');
    resolve(activate(g, shark, 2));
    g.passUntilStep('beginCombat').passBoth().attack(shark);
    resolve(g);
    g.passUntilStep('declareBlockers', 10);
    const blocks = g.legal('p2').filter((a) => a.type === 'addBlock');
    expect(blocks).toHaveLength(0);
  });
});

describe('Radioactive Man', () => {
  it('has deathtouch and halves the life of a player he hits, rounded up', () => {
    expect(cardDb.get('radioactive-man')!.keywords).toContain('deathtouch');
    const g = game({ p1: { battlefield: ['radioactive-man'] } });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'radioactive-man'));
    g.passUntilStep('combatDamage');
    settle(g);
    // 20 - 3 = 17, then loses 9.
    expect(g.life('p2')).toBe(8);
  });
});

describe('The Masters of Evil', () => {
  it('gives other Villains you control +2/+1', () => {
    const g = game({
      p1: { battlefield: ['the-masters-of-evil', 'boomerang-blade-flinger', 'bear-cub'] },
      p2: { battlefield: ['villain-token'] },
    });
    expect(pt(g, g.id('p1', 'boomerang-blade-flinger'))).toEqual([3, 4]);
    expect(pt(g, g.id('p1', 'the-masters-of-evil'))).toEqual([5, 6]);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
    expect(pt(g, g.id('p2', 'villain-token'))).toEqual([2, 1]);
  });

  it('can be discarded to search for a Plan card', () => {
    const g = game({
      p1: {
        hand: ['the-masters-of-evil'],
        battlefield: n('swamp', 2),
        library: ['swamp', 'villainous-syndication', 'swamp'],
      },
    });
    activate(g, g.id('p1', 'the-masters-of-evil', 'hand'), 1);
    resolve(g, g.id('p1', 'villainous-syndication', 'library'));
    const hand = g.state.players.p1.hand.map((id) => g.obj(id).defId);
    expect(hand).toEqual(['villainous-syndication']);
    expect(g.zoneOf(g.id('p1', 'the-masters-of-evil', 'graveyard'))).toBe('graveyard');
  });
});

describe('Villainous Syndication', () => {
  it('taps a Villain to mill a card and add a plan counter', () => {
    const g = game({
      p1: {
        battlefield: ['villainous-syndication', 'boomerang-blade-flinger'],
        library: ['swamp', 'swamp'],
      },
    });
    const plan = g.id('p1', 'villainous-syndication');
    const boomerang = g.id('p1', 'boomerang-blade-flinger');
    resolve(activate(g, plan, 0));
    expect(g.obj(boomerang).tapped).toBe(true);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.obj(plan).counters?.plan).toBe(1);
    // No untapped Villain left.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === plan)).toBe(false);
  });

  it('needs a Villain to tap', () => {
    const g = game({ p1: { battlefield: ['villainous-syndication', 'bear-cub'] } });
    const plan = g.id('p1', 'villainous-syndication');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === plan)).toBe(false);
  });

  it('at the fourth counter is sacrificed and returns a creature card', () => {
    const g = game({
      p1: {
        battlefield: ['villainous-syndication', 'villain-token'],
        graveyard: ['rumbling-baloth'],
        library: ['swamp', 'swamp'],
      },
    });
    const plan = g.id('p1', 'villainous-syndication');
    g.obj(plan).counters = { plan: 3 };
    const baloth = g.id('p1', 'rumbling-baloth', 'graveyard');
    activate(g, plan, 0);
    g.passBoth();
    // Sacrificed; "when you do" is a reflexive trigger that targets the creature card.
    expect(g.zoneOf(plan)).toBe('graveyard');
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(baloth)] });
    expect(g.state.stack).toHaveLength(1);
    settle(g);
    expect(all(g, 'rumbling-baloth')).toHaveLength(1);
  });
});
