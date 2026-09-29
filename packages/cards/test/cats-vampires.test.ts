import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for Cat Attack and Vampiric Hunger.

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
const kw = (g: GameDriver, id: string) =>
  [...getCharacteristics(g.state, cardDb, id).keywords].sort();
const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, 'hand'), targets, ...extra });
};
const tokens = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);
const castable = (g: GameDriver, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);

describe('auras', () => {
  it('Unflinching Courage attaches, buffs, and goes to the graveyard when the creature dies', () => {
    const g = game({
      p1: { hand: ['unflinching-courage'], battlefield: [...n('plains', 2), 'forest', 'bear-cub'] },
      p2: { hand: ['lightning-strike', 'shock'], battlefield: n('mountain', 3) },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'unflinching-courage', [g.ref(bear)]).passBoth();
    const aura = g.id('p1', 'unflinching-courage');
    expect(g.obj(aura).attachedTo).toBe(bear);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(kw(g, bear)).toEqual(['lifelink', 'trample']);
    g.pass();
    cast(g, 'lightning-strike', [g.ref(bear)]).passBoth();
    g.pass();
    cast(g, 'shock', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.zoneOf(aura)).toBe('graveyard');
  });

  it('an Aura whose target is gone fizzles into the graveyard', () => {
    const g = game({
      p1: { hand: ['unflinching-courage'], battlefield: [...n('plains', 2), 'forest', 'bear-cub'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'unflinching-courage', [g.ref(bear)]).pass();
    cast(g, 'shock', [g.ref(bear)]).passBoth(); // shock resolves first
    g.passBoth();
    expect(g.zoneOf(g.id('p1', 'unflinching-courage', 'graveyard'))).toBe('graveyard');
  });

  it('Angelic Destiny returns to hand when the enchanted creature dies', () => {
    const g = game({
      p1: { hand: ['angelic-destiny'], battlefield: [...n('plains', 4), 'savannah-lions'] },
      p2: { hand: ['moment-of-craving'], battlefield: n('swamp', 2) },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'angelic-destiny', [g.ref(lions)]).passBoth();
    expect(pt(g, lions)).toEqual([6, 5]);
    expect(kw(g, lions)).toEqual(['firstStrike', 'flying']);
    // Kill it with state-based damage: set damage then shrink with Moment of Craving.
    g.state.objects[lions]!.damage = 3;
    g.pass();
    cast(g, 'moment-of-craving', [g.ref(lions)]).passBoth();
    expect(g.zoneOf(lions)).toBe('graveyard');
    g.passBoth(); // the return trigger
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['angelic-destiny']);
  });
});

describe('removal', () => {
  it('Banishing Light exiles until it leaves; Mortify can hit it and the creature returns', () => {
    const g = game({
      p1: { hand: ['banishing-light'], battlefield: n('plains', 3) },
      p2: { hand: ['mortify'], battlefield: ['gnarlback-rhino', 'plains', 'swamp', 'swamp'] },
    });
    const rhino = g.id('p2', 'gnarlback-rhino');
    cast(g, 'banishing-light').passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(rhino)] }).passBoth();
    expect(g.zoneOf(rhino)).toBe('exile');
    const light = g.id('p1', 'banishing-light');
    g.pass();
    cast(g, 'mortify', [g.ref(light)]).passBoth();
    expect(g.zoneOf(light)).toBe('graveyard');
    expect(g.zoneOf(rhino)).toBe('battlefield');
    expect(g.obj(rhino).controller).toBe('p2');
  });

  it('Tribute to Hunger: the opponent picks; you gain its toughness', () => {
    const g = game({
      p1: { life: 10, hand: ['tribute-to-hunger'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['bear-cub', 'gnarlback-rhino'] },
    });
    cast(g, 'tribute-to-hunger', [{ player: 'p2' }]).passBoth();
    expect(g.decision).toMatchObject({ kind: 'sacrifice', player: 'p2' });
    expect(g.legal('p2')).toHaveLength(2);
    const bear = g.id('p2', 'bear-cub');
    g.do({ type: 'chooseCard', player: 'p2', card: bear });
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.life('p1')).toBe(12);
    expect(g.decision.kind).toBe('priority');
  });

  it('Elenda has hexproof from instants only', () => {
    const g = game({
      p1: { battlefield: ['elenda-saint-of-dusk'] },
      p2: { hand: ['moment-of-craving', 'tribute-to-hunger'], battlefield: n('swamp', 3) },
      active: 'p2',
    });
    const targetsElenda = g
      .legal()
      .some(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.some(
            (t) => 'object' in t && g.obj(t.object.id).defId === 'elenda-saint-of-dusk',
          ),
      );
    expect(targetsElenda).toBe(false);
  });
});

describe('life gain', () => {
  it("Ajani's Pridemate grows whenever you gain life", () => {
    const g = game({
      p1: { hand: ['moment-of-triumph'], battlefield: ['plains', 'ajanis-pridemate'] },
    });
    const pm = g.id('p1', 'ajanis-pridemate');
    cast(g, 'moment-of-triumph', [g.ref(pm)])
      .passBoth()
      .passBoth();
    expect(g.obj(pm).plusOneCounters).toBe(1);
  });

  it('Cat Collector makes a Cat only for the first life gain on your turn', () => {
    const g = game({
      p1: {
        hand: ['moment-of-triumph', 'moment-of-triumph'],
        battlefield: [...n('plains', 2), 'cat-collector'],
      },
    });
    const cc = g.id('p1', 'cat-collector');
    cast(g, 'moment-of-triumph', [g.ref(cc)])
      .passBoth()
      .passBoth();
    cast(g, 'moment-of-triumph', [g.ref(cc)]).passBoth();
    expect(g.state.stack).toHaveLength(0);
    expect(tokens(g, 'cat-token')).toHaveLength(1);
  });

  it('Elenda grows with your life total; Twinblade Paladin double strikes at 25', () => {
    const g = game({
      p1: { life: 21, battlefield: ['elenda-saint-of-dusk', 'twinblade-paladin'] },
    });
    const elenda = g.id('p1', 'elenda-saint-of-dusk');
    expect(pt(g, elenda)).toEqual([5, 5]);
    expect(kw(g, elenda)).toContain('menace');
    expect(kw(g, g.id('p1', 'twinblade-paladin'))).not.toContain('doubleStrike');
    g.state.players.p1.life = 30;
    expect(pt(g, elenda)).toEqual([10, 10]);
    expect(kw(g, g.id('p1', 'twinblade-paladin'))).toContain('doubleStrike');
  });

  it('Vengeful Bloodwitch drains when a creature you control dies', () => {
    const g = game({
      p1: { battlefield: ['vengeful-bloodwitch', 'bear-cub'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]).passBoth();
    g.do({ type: 'chooseTargets', player: 'p1', targets: [{ player: 'p2' }] }).passBoth();
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });
});

describe('creatures', () => {
  it('Arahbo: Cats get +1/+1, and a nontoken Cat entering makes a Cat', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'arahbo-the-first-fang'] },
    });
    cast(g, 'savannah-lions').passBoth().passBoth();
    expect(tokens(g, 'cat-token')).toHaveLength(1);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(g.state.stack).toHaveLength(0); // the token doesn't trigger it again
  });

  it('Felidar Savior: up to two different targets', () => {
    const g = game({
      p1: {
        hand: ['felidar-savior'],
        battlefield: [...n('plains', 4), 'bear-cub', 'savannah-lions'],
      },
    });
    cast(g, 'felidar-savior').passBoth();
    const options = g.legal().filter((a) => a.type === 'chooseTargets');
    // none, bear, lions, bear+lions, lions+bear
    expect(options.map((a) => (a.type === 'chooseTargets' ? a.targets.length : -1)).sort()).toEqual(
      [0, 1, 1, 2, 2],
    );
    const bear = g.id('p1', 'bear-cub');
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear), g.ref(lions)] }).passBoth();
    expect([g.obj(bear).plusOneCounters, g.obj(lions).plusOneCounters]).toEqual([1, 1]);
  });

  it('Good-Fortune Unicorn puts a counter on the creature that entered', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [...n('forest', 2), 'good-fortune-unicorn'] },
    });
    cast(g, 'bear-cub').passBoth().passBoth();
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(1);
  });

  it('Wary Thespian surveils: a card put "on the bottom" goes to the graveyard', () => {
    const g = game({
      p1: { hand: ['wary-thespian'], battlefield: n('forest', 2), library: ['bear-cub', 'forest'] },
    });
    cast(g, 'wary-thespian').passBoth().passBoth();
    const d = g.decision;
    if (d.kind !== 'scry' || !d.surveil) throw new Error('expected surveil');
    g.do({ type: 'scry', player: 'p1', top: [], bottom: [d.cards[0]!] });
    expect(g.obj(d.cards[0]!).zone).toBe('graveyard');
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('Fiendish Panda returns a creature card with mana value up to its power', () => {
    const g = game({
      p1: { battlefield: ['fiendish-panda'], graveyard: ['savannah-lions', 'gnarlback-rhino'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    cast(g, 'lightning-strike', [g.ref(g.id('p1', 'fiendish-panda'))]).passBoth();
    const options = g.legal('p1').filter((a) => a.type === 'chooseTargets' && a.targets.length);
    expect(options).toHaveLength(1); // Lions (MV 1), not Rhino (MV 4)
    g.do(options[0]!).passBoth();
    expect(g.zoneOf(g.id('p1', 'savannah-lions'))).toBe('battlefield');
  });

  it('Sun-Blessed Healer kicked returns a cheap permanent card; unkicked does nothing', () => {
    const g = game({
      p1: { hand: ['sun-blessed-healer'], battlefield: n('plains', 4), graveyard: ['bear-cub'] },
    });
    cast(g, 'sun-blessed-healer', [], { kicked: true }).passBoth();
    const bear = g.id('p1', 'bear-cub', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(bear)] }).passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');

    const plain = game({
      p1: { hand: ['sun-blessed-healer'], battlefield: n('plains', 2), graveyard: ['bear-cub'] },
    });
    cast(plain, 'sun-blessed-healer').passBoth();
    expect(plain.decision.kind).toBe('priority');
    expect(plain.state.stack).toHaveLength(0);
  });

  it('Leonin Vanguard gets +1/+1 and gains 1 with three creatures', () => {
    const g = game({ p1: { battlefield: ['leonin-vanguard', 'bear-cub', 'savannah-lions'] } });
    g.passBoth().passBoth();
    expect(pt(g, g.id('p1', 'leonin-vanguard'))).toEqual([2, 2]);
    expect(g.life('p1')).toBe(21);
  });
});

describe('spells', () => {
  it('Claws Out costs {1} less for each Cat you control', () => {
    const cats = game({
      p1: {
        hand: ['claws-out'],
        battlefield: [...n('plains', 2), 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
    });
    expect(castable(cats, 'claws-out')).toBe(true);
    const few = game({
      p1: { hand: ['claws-out'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    expect(castable(few, 'claws-out')).toBe(false);
  });
});

describe('aura edge cases', () => {
  it('an Aura destroyed earlier does not trigger when its old creature dies later', () => {
    const g = game({
      p1: { hand: ['angelic-destiny'], battlefield: [...n('plains', 4), 'savannah-lions'] },
      p2: {
        hand: ['mortify', 'moment-of-craving'],
        battlefield: [...n('swamp', 3), 'plains', 'swamp'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'angelic-destiny', [g.ref(lions)]).passBoth();
    const destiny = g.id('p1', 'angelic-destiny');
    g.pass();
    cast(g, 'mortify', [g.ref(destiny)]).passBoth();
    expect(g.zoneOf(destiny)).toBe('graveyard');
    g.pass();
    cast(g, 'moment-of-craving', [g.ref(lions)]).passBoth();
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.state.stack).toHaveLength(0);
    expect(g.zoneOf(destiny)).toBe('graveyard');
  });
});
