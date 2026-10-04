import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet HYDRA.

const activate = (g: ReturnType<typeof game>, source: string, abilityIndex: number, targets = []) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets });

const PACKET = [
  'Bob, Reluctant HYDRA Agent',
  'Viper, Cruel Conspirator',
  'Agents of HYDRA',
  'HYDRA Troopers',
  'Baron Strucker, HYDRA Overlord',
  'Arnim Zola, Bio-Fanatic',
  'Crossbones, Malicious Mercenary',
  'HYDRA Disintegrator',
  'Dark Deed',
  'Cruel Alliance',
  'HYDRA Infiltration',
  'Infernal Rebirth',
  'Thriving Moor',
  'Swamp',
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('HYDRA packet', () => {
  it('every card is implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it('Bob returns to hand and drains 2 when he attacks alone', () => {
    const g = game({ p1: { battlefield: ['bob-reluctant-hydra-agent'] } });
    const bob = g.id('p1', 'bob-reluctant-hydra-agent');
    g.passUntilStep('beginCombat').passBoth().attack(bob);
    settle(g);
    expect(g.zoneOf(bob) === 'battlefield').toBe(false);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain(
      'bob-reluctant-hydra-agent',
    );
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it("Bob's drain needs him returned: nothing if he's gone", () => {
    const g = game({
      p1: { battlefield: ['bob-reluctant-hydra-agent'] },
      p2: { hand: ['lightning-bolt'], battlefield: ['mountain'] },
    });
    const bob = g.id('p1', 'bob-reluctant-hydra-agent');
    g.passUntilStep('beginCombat').passBoth().attack(bob);
    expect(g.state.stack).toHaveLength(1);
    g.pass();
    cast(g, 'lightning-bolt', [g.ref(bob)]);
    settle(g);
    expect(g.zoneOf(bob)).toBe('graveyard');
    expect(g.life('p2')).toBe(20);
    expect(g.life('p1')).toBe(20);
  });

  it('Bob does nothing when he attacks with another creature', () => {
    const g = game({ p1: { battlefield: ['bob-reluctant-hydra-agent', 'bear-cub'] } });
    const bob = g.id('p1', 'bob-reluctant-hydra-agent');
    g.passUntilStep('beginCombat').passBoth().attack(bob, g.id('p1', 'bear-cub'));
    expect(g.state.stack).toHaveLength(0);
    expect(g.zoneOf(bob)).toBe('battlefield');
  });

  it('Viper pumps and grants lifelink only to a creature attacking alone', () => {
    const g = game({
      p1: { battlefield: ['viper-cruel-conspirator', 'bear-cub', ...n('swamp', 2)] },
    });
    const viper = g.id('p1', 'viper-cruel-conspirator');
    const bear = g.id('p1', 'bear-cub');
    // Not attacking: no legal target.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === viper)).toBe(false);
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    settle(g);
    activate(g, viper, 0, [g.ref(bear)] as never);
    settle(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    activate(g, viper, 1, [g.ref(bear)] as never);
    settle(g);
    for (let i = 0; i < 10 && g.decision.kind === 'chooseOption'; i++)
      settle(g.do({ type: 'chooseOption', player: 'p1', index: 1 }));
    settle(g);
    expect(getCharacteristics(g.state, cardDb, bear).keywords.has('lifelink')).toBe(true);
  });

  it('Viper cannot target an attacker that is not alone', () => {
    const g = game({
      p1: { battlefield: ['viper-cruel-conspirator', 'bear-cub', 'agents-of-hydra', 'swamp'] },
    });
    const viper = g.id('p1', 'viper-cruel-conspirator');
    g.passUntilStep('beginCombat')
      .passBoth()
      .attack(g.id('p1', 'bear-cub'), g.id('p1', 'agents-of-hydra'));
    settle(g);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === viper)).toBe(false);
  });

  it('HYDRA Disintegrator makes a Villain and equips it (+3/+3)', () => {
    const g = game({ p1: { hand: ['hydra-disintegrator'], battlefield: n('swamp', 5) } });
    settle(cast(g, 'hydra-disintegrator'));
    const [token] = all(g, 'villain-token');
    expect(token).toBeDefined();
    expect(g.obj(g.id('p1', 'hydra-disintegrator')).attachedTo).toBe(token);
    expect(pt(g, token!)).toEqual([5, 4]);
  });

  it('Infernal Rebirth returns two creature cards from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['infernal-rebirth'],
        battlefield: n('swamp', 4),
        graveyard: ['bear-cub', 'agents-of-hydra'],
      },
    });
    const a = g.id('p1', 'bear-cub', 'graveyard');
    const b = g.id('p1', 'agents-of-hydra', 'graveyard');
    settle(cast(g, 'infernal-rebirth', [g.ref(a), g.ref(b)]));
    expect(g.zoneOf(a)).toBe('hand');
    expect(g.zoneOf(b)).toBe('hand');
  });

  it('Infernal Rebirth basic landcycles for {2}', () => {
    const g = game({
      p1: {
        hand: ['infernal-rebirth'],
        battlefield: n('swamp', 2),
        library: ['swamp', 'bear-cub'],
      },
    });
    activate(g, g.id('p1', 'infernal-rebirth', 'hand'), 0);
    settle(g);
    if (g.decision.kind === 'searchLibrary') g.do(g.legal()[0]!);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['swamp']);
  });
});
