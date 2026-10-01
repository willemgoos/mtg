import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow mechanics (offspring, gift, forage, expend, valiant) and cards.

describe('offspring', () => {
  it('paying it makes a 1/1 token copy, which makes no copy of its own', () => {
    const g = game({ p1: { hand: ['intrepid-rabbit'], battlefield: n('plains', 4) } });
    cast(g, 'intrepid-rabbit', [], { kicked: true });
    settle(g);
    const rabbits = all(g, 'intrepid-rabbit');
    expect(rabbits).toHaveLength(2);
    const token = rabbits.find((id) => g.obj(id).isToken)!;
    expect(g.obj(token).copyPT).toEqual({ power: 1, toughness: 1 });
    // Both enter triggers pumped the first creature: the card (3/2) is now 5/4.
    const card = rabbits.find((id) => !g.obj(id).isToken)!;
    expect(pt(g, card)).toEqual([5, 4]);
    expect(pt(g, token)).toEqual([1, 1]);
  });

  it('is optional', () => {
    const g = game({ p1: { hand: ['intrepid-rabbit'], battlefield: n('plains', 3) } });
    expect(
      g.legal().some((a) => a.type === 'castSpell' && a.kicked),
      'not enough mana for offspring',
    ).toBe(false);
    cast(g, 'intrepid-rabbit');
    settle(g);
    expect(all(g, 'intrepid-rabbit')).toHaveLength(1);
  });
});

describe('gift', () => {
  it('Nocturnal Hunger: no gift costs 2 life', () => {
    const g = game({
      p1: { hand: ['nocturnal-hunger'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'nocturnal-hunger', [g.ref(g.id('p2', 'bear-cub'))]);
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(g.life('p1')).toBe(18);
    expect(all(g, 'food-token')).toHaveLength(0);
  });

  it('Nocturnal Hunger: promising the gift gives the opponent a Food instead', () => {
    const g = game({
      p1: { hand: ['nocturnal-hunger'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'nocturnal-hunger', [g.ref(g.id('p2', 'bear-cub'))], { kicked: true });
    settle(g);
    expect(g.life('p1')).toBe(20);
    const [food] = all(g, 'food-token');
    expect(g.obj(food!).controller).toBe('p2');
  });

  it('Longstalk Brawl: the promised version gives a tapped Fish and a counter before the fight', () => {
    const g = game({
      p1: { hand: ['longstalk-brawl'], battlefield: ['forest', 'bear-cub'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'longstalk-brawl', [g.ref(bear), g.ref(lions)], { kicked: true });
    settle(g);
    const [fish] = all(g, 'fish-token');
    expect(g.obj(fish!).controller).toBe('p2');
    expect(g.obj(fish!).tapped).toBe(true);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(g.zoneOf(bear)).toBe('battlefield'); // 3/3 takes 2
  });

  it('Consumed by Greed: the opponent sacrifices their most powerful creature', () => {
    const g = game({
      p1: { hand: ['consumed-by-greed'], battlefield: n('swamp', 3), graveyard: ['bear-cub'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    cast(g, 'consumed-by-greed', [g.ref(g.id('p1', 'bear-cub', 'graveyard'))], { kicked: true });
    g.passBoth();
    // Only the Angel can be chosen.
    expect(g.decision.kind).toBe('sacrifice');
    expect(g.legal('p2')).toHaveLength(1);
    g.do(g.legal('p2')[0]!);
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(handSize(g, 'p2')).toBe(1); // the gift
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
  });
});

describe('forage', () => {
  it('Feed the Cycle can forage by sacrificing a Food instead of paying {B}', () => {
    // Two lands: only the forage version is affordable, and only with a Food.
    const g = game({
      p1: { hand: ['feed-the-cycle'], battlefield: [...n('swamp', 2), 'camellia-the-seedmiser'] },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    const g2 = game({
      p1: {
        hand: ['feed-the-cycle'],
        battlefield: [...n('swamp', 2), 'camellia-the-seedmiser', 'carrot-cake'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const cake = g2.id('p1', 'carrot-cake');
    const bear = g2.id('p2', 'bear-cub');
    const casts = g2
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' && 'object' in a.targets[0]! && a.targets[0].object.id === bear,
      );
    expect(casts.map((a) => a.type === 'castSpell' && a.forage)).toEqual([cake]);
    g2.do(casts[0]!);
    expect(g2.zoneOf(cake)).toBe('graveyard');
    // Carrot Cake's "when you sacrifice it" (a Rabbit and scry 1) and Camellia's
    // Squirrel go on the stack above the spell.
    settle(g2);
    expect(g2.decision.kind).toBe('scry');
    g2.do(g2.legal()[0]!);
    settle(g2);
    expect(all(g2, 'rabbit-token')).toHaveLength(1);
    expect(all(g2, 'squirrel-token')).toHaveLength(1);
    expect(all(g2, 'bear-cub')).toHaveLength(0);
  });

  it('exiling from a graveyard of more than three cards asks which three', () => {
    const g = game({
      p1: {
        hand: ['feed-the-cycle'],
        battlefield: n('swamp', 2),
        graveyard: ['bear-cub', 'savannah-lions', 'forest', 'plains'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'feed-the-cycle', [g.ref(g.id('p2', 'bear-cub'))], { forage: 'graveyard' });
    expect(g.decision.kind).toBe('forageExile');
    for (const card of ['forest', 'plains', 'savannah-lions'])
      g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', card, 'graveyard') });
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('Treetop Sentries: "you may forage" can be declined, or a Food sacrificed to draw', () => {
    const g = game({
      p1: { hand: n('treetop-sentries', 2), battlefield: [...n('forest', 8), 'carrot-cake'] },
    });
    settle(cast(g, 'treetop-sentries'));
    expect(g.decision.kind).toBe('forage');
    g.do({ type: 'forage', player: 'p1', choice: null });
    expect(handSize(g, 'p1')).toBe(1);
    settle(cast(g, 'treetop-sentries'));
    g.do({ type: 'forage', player: 'p1', choice: g.id('p1', 'carrot-cake') });
    settle(g);
    expect(handSize(g, 'p1')).toBe(1); // drew one
  });

  it("can't forage with no Food and fewer than three cards in the graveyard", () => {
    const g = game({ p1: { hand: ['treetop-sentries'], battlefield: n('forest', 4) } });
    cast(g, 'treetop-sentries');
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(handSize(g, 'p1')).toBe(0);
  });
});

describe('expend', () => {
  it('Bakersbane Duo grows when its controller spends their fourth mana in a turn', () => {
    const g = game({
      p1: {
        hand: ['savor', 'savor'],
        battlefield: [...n('swamp', 4), 'bakersbane-duo'],
      },
      p2: { battlefield: n('bear-cub', 2) },
    });
    const duo = g.id('p1', 'bakersbane-duo');
    const [a, b] = all(g, 'bear-cub');
    cast(g, 'savor', [g.ref(a!)]);
    settle(g);
    expect(pt(g, duo)).toEqual([2, 2]);
    cast(g, 'savor', [g.ref(b!)]);
    settle(g);
    expect(pt(g, duo)).toEqual([3, 3]);
  });
});

describe('valiant', () => {
  it('Nettle Guard triggers only the first time each turn you target it', () => {
    const g = game({
      p1: {
        hand: ['mabels-mettle'],
        battlefield: [...n('plains', 3), 'nettle-guard', 'brave-kin-duo'],
      },
    });
    const guard = g.id('p1', 'nettle-guard');
    const duo = g.id('p1', 'brave-kin-duo');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: duo,
      abilityIndex: 0,
      targets: [g.ref(guard)],
    });
    settle(g);
    expect(pt(g, guard)).toEqual([4, 4]); // 3/1, +1/+1, valiant +0/+2
    cast(g, 'mabels-mettle', [g.ref(guard)]);
    settle(g);
    expect(pt(g, guard)).toEqual([6, 6]); // no second valiant
  });

  it("an opponent's spell doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: ['nettle-guard'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    const guard = g.id('p1', 'nettle-guard');
    cast(g, 'shock', [g.ref(guard)]);
    settle(g);
    expect(g.zoneOf(guard)).toBe('graveyard');
  });
});

describe('Bloomburrow cards', () => {
  it('Harvestrite Host draws on its second resolution in a turn', () => {
    const g = game({
      p1: { hand: ['hop-to-it'], battlefield: [...n('plains', 3), 'harvestrite-host'] },
    });
    cast(g, 'hop-to-it');
    settle(g);
    expect(all(g, 'rabbit-token')).toHaveLength(3);
    expect(handSize(g, 'p1')).toBe(1); // drew once, on the second of three
  });

  it('Honored Dreyleader counts other Squirrels and Food, then grows', () => {
    const g = game({
      p1: {
        hand: ['honored-dreyleader', 'vinereap-mentor'],
        battlefield: [...n('forest', 4), ...n('swamp', 2), 'carrot-cake', 'daggerfang-duo'],
      },
    });
    cast(g, 'honored-dreyleader');
    settle(g);
    const drey = g.id('p1', 'honored-dreyleader');
    expect(pt(g, drey)).toEqual([3, 3]); // Carrot Cake and Daggerfang Duo
    cast(g, 'vinereap-mentor');
    settle(g);
    // The Mentor (a Squirrel) and its Food.
    expect(pt(g, drey)).toEqual([5, 5]);
  });

  it('Bonebind Orator exiles itself from the graveyard to return another creature card', () => {
    const g = game({
      p1: {
        battlefield: [...n('swamp', 4)],
        graveyard: ['bonebind-orator', 'serra-angel'],
      },
    });
    const orator = g.id('p1', 'bonebind-orator', 'graveyard');
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const acts = g.legal().filter((a) => a.type === 'activateAbility');
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    expect(g.zoneOf(orator)).toBe('exile');
    settle(g);
    expect(g.zoneOf(angel)).toBe('hand');
  });

  it('Warren Warleader can make a Rabbit that is tapped and attacking', () => {
    const g = game({ p1: { battlefield: ['warren-warleader'] }, step: 'beginCombat' });
    g.passBoth().attack(g.id('p1', 'warren-warleader'));
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 });
    settle(g);
    const [rabbit] = all(g, 'rabbit-token');
    expect(g.obj(rabbit!).tapped).toBe(true);
    expect(g.state.combat?.attackers.map((a) => a.id)).toContain(rabbit);
  });

  it('Druid of the Spade gets +2/+0 and trample while you control a token', () => {
    const g = game({
      p1: { hand: ['hop-to-it'], battlefield: [...n('plains', 3), 'druid-of-the-spade'] },
    });
    const druid = g.id('p1', 'druid-of-the-spade');
    expect(pt(g, druid)).toEqual([2, 3]);
    cast(g, 'hop-to-it');
    settle(g);
    expect(pt(g, druid)).toEqual([4, 3]);
  });
});
