import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Lethal packet (docs/marvel-jumpstart.md).

const LETHAL = [
  'Red Room Recruit',
  'White Widow, Yelena Belova',
  'Ninja of the Hand',
  'Venomized Cat',
  'Black Widow, Deadly Hunter',
  'Titanium Man',
  'Venom, Evil Unleashed',
  'Stolen Stark Tech',
  "Widow's Bite",
  'Hour of Defeat',
  'Origin of Black Widow',
  'Infernal Rebirth',
  'Thriving Moor',
  'Swamp',
];

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

/** Resolves the stack, answering other decisions with their first legal action. */
const resolve = (g: G) => {
  for (let i = 0; i < 40; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'priority' || d.kind === 'declareAttackers' || d.kind === 'declareBlockers')
      return g;
    g.do(g.legal()[0]!);
  }
  return g;
};

/** Attacks with `attacker` and plays out combat damage. */
const attackAndHit = (g: G, attacker: string) => {
  g.passUntilStep('beginCombat').passBoth().attack(attacker);
  resolve(g);
  g.passUntilStep('combatDamage');
  return resolve(g);
};

/** Passes from upkeep into the first main phase (a Saga chapter triggers) and resolves it. */
const toMain = (g: G) => {
  for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
  return resolve(g);
};

describe('Lethal packet', () => {
  it('has every card implemented', () => {
    for (const name of LETHAL) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('White Widow, Yelena Belova', () => {
  it('puts a +1/+1 counter on a deathtouch creature that hits a player', () => {
    const g = game({
      p1: {
        battlefield: [
          'white-widow-yelena-belova',
          { card: 'venomized-cat', sick: false },
          { card: 'bear-cub', sick: false },
        ],
      },
    });
    expect(cardDb.get('white-widow-yelena-belova')!.keywords).toContain('deathtouch');
    const cat = g.id('p1', 'venomized-cat');
    attackAndHit(g, cat);
    expect(g.life('p2')).toBe(18);
    expect(pt(g, cat)).toEqual([3, 4]);
  });

  it('ignores creatures without deathtouch', () => {
    const g = game({
      p1: { battlefield: ['white-widow-yelena-belova', { card: 'bear-cub', sick: false }] },
    });
    const bear = g.id('p1', 'bear-cub');
    attackAndHit(g, bear);
    expect(g.life('p2')).toBe(18);
    expect(pt(g, bear)).toEqual([2, 2]);
  });
});

describe('Venomized Cat', () => {
  it('has deathtouch and mills two when it enters', () => {
    expect(cardDb.get('venomized-cat')!.keywords).toContain('deathtouch');
    const g = game({
      p1: { hand: ['venomized-cat'], battlefield: n('swamp', 3), library: n('swamp', 4) },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'venomized-cat', 'hand'),
      targets: [],
    });
    resolve(g);
    expect(all(g, 'venomized-cat')).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});

describe('Black Widow, Deadly Hunter', () => {
  it('draws a card and loses 1 life when a deathtouch creature hits a player', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'black-widow-deadly-hunter', sick: false }],
        library: n('swamp', 3),
      },
    });
    const hand = handSize(g, 'p1');
    attackAndHit(g, g.id('p1', 'black-widow-deadly-hunter'));
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(19);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });
});

describe('Titanium Man', () => {
  it('can gain flying when he attacks', () => {
    const g = game({ p1: { battlefield: [{ card: 'titanium-man', sick: false }] } });
    const man = g.id('p1', 'titanium-man');
    g.passUntilStep('beginCombat').passBoth().attack(man);
    const pick = g
      .legal()
      .find((a) => a.type === 'chooseTargets' && a.mode === 0 && a.targets.length === 0);
    expect(pick).toBeDefined();
    g.do(pick!);
    resolve(g);
    expect(keywords(g, man)).toContain('flying');
  });

  it('can deal 1 damage to any target when he attacks', () => {
    const g = game({
      p1: { battlefield: [{ card: 'titanium-man', sick: false }] },
      p2: { battlefield: ['bear-cub'] },
    });
    const man = g.id('p1', 'titanium-man');
    g.passUntilStep('beginCombat').passBoth().attack(man);
    const pick = g
      .legal()
      .find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.mode === 1 &&
          a.targets.some((t) => 'player' in t && t.player === 'p2'),
      );
    expect(pick).toBeDefined();
    g.do(pick!);
    resolve(g);
    expect(g.life('p2')).toBe(19);
    expect(keywords(g, man)).not.toContain('flying');
  });
});

describe('Venom, Evil Unleashed', () => {
  it('exiles itself from the graveyard to give two counters and deathtouch', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('swamp', 3)], graveyard: ['venom-evil-unleashed'] },
    });
    expect(cardDb.get('venom-evil-unleashed')!.keywords).toContain('deathtouch');
    const venom = g.id('p1', 'venom-evil-unleashed', 'graveyard');
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: venom,
      abilityIndex: 0,
      targets: [{ object: { id: bear, zcc: g.obj(bear).zcc } }],
    });
    resolve(g);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toContain('deathtouch');
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    expect(g.state.players.p1.exile).toHaveLength(1);
  });

  it('only at sorcery speed', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: ['bear-cub', ...n('swamp', 3)], graveyard: ['venom-evil-unleashed'] },
    });
    const venom = g.id('p1', 'venom-evil-unleashed', 'graveyard');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === venom)).toBe(false);
  });
});

describe('Origin of Black Widow', () => {
  it('chapter I makes each opponent sacrifice a creature', () => {
    const g = game({
      p1: { hand: ['origin-of-black-widow'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'origin-of-black-widow', 'hand'),
      targets: [],
    });
    resolve(g);
    expect(g.obj(g.id('p1', 'origin-of-black-widow')).counters?.lore).toBe(1);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('chapter II gives creatures you control deathtouch until end of turn', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: ['origin-of-black-widow', 'bear-cub'], library: n('swamp', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    g.obj(g.id('p1', 'origin-of-black-widow')).counters = { lore: 1 };
    toMain(g);
    expect(keywords(g, g.id('p1', 'bear-cub'))).toContain('deathtouch');
    expect(keywords(g, g.id('p2', 'bear-cub'))).not.toContain('deathtouch');
  });

  it('chapter III drains for each creature card in their graveyard', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['origin-of-black-widow'],
        graveyard: ['bear-cub'],
        library: n('swamp', 3),
      },
      p2: { graveyard: ['bear-cub', 'bear-cub', 'bear-cub', 'swamp'] },
    });
    g.obj(g.id('p1', 'origin-of-black-widow')).counters = { lore: 2 };
    toMain(g);
    expect(g.life('p2')).toBe(17);
    expect(all(g, 'origin-of-black-widow')).toHaveLength(0);
  });
});
