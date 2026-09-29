import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

// Cards and mechanics added for the Color Challenge decks (white, red, green).

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const n = (card: string, count: number) => Array<string>(count).fill(card);
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
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

describe('white', () => {
  it('Charmed Stray puts a counter on each other Charmed Stray', () => {
    const g = game({
      p1: { hand: ['charmed-stray'], battlefield: ['plains', 'charmed-stray', 'bear-cub'] },
    });
    cast(g, 'charmed-stray').passBoth().passBoth();
    const strays = g.state.battlefield.filter((id) => g.obj(id).defId === 'charmed-stray');
    expect(strays.map((id) => g.obj(id).plusOneCounters).sort()).toEqual([0, 1]);
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(0);
  });

  it('Angel of Vitality: +1 life on every gain, and +2/+2 at 25 life', () => {
    const g = game({
      p1: {
        life: 23,
        hand: ['spiritual-guardian'],
        battlefield: [...n('plains', 5), 'angel-of-vitality'],
      },
    });
    cast(g, 'spiritual-guardian').passBoth().passBoth();
    expect(g.life('p1')).toBe(28);
    expect(pt(g, g.id('p1', 'angel-of-vitality'))).toEqual([4, 4]);
  });

  it('Leonin Warleader makes two Cats that are tapped and attacking', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['leonin-warleader'] } });
    g.passBoth().attack(g.id('p1', 'leonin-warleader')).passBoth();
    const cats = tokens(g, 'cat-lifelink-token');
    expect(cats).toHaveLength(2);
    expect(cats.every((id) => g.obj(id).tapped)).toBe(true);
    expect(g.state.combat!.attackers).toHaveLength(3);
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(14);
    expect(g.life('p1')).toBe(22);
  });

  it('Pacifism: the creature can’t attack or block', () => {
    const g = game({
      p1: { hand: ['pacifism'], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'pacifism', [g.ref(bear)]).passBoth();
    const c = getCharacteristics(g.state, cardDb, bear);
    expect(c.cantAttack && c.cantBlock).toBe(true);
  });

  it('Confront the Assault can only be cast while a creature attacks you', () => {
    const g = game({ p1: { hand: ['confront-the-assault'], battlefield: n('plains', 5) } });
    expect(castable(g, 'confront-the-assault')).toBe(false);
    const attacked = game({
      step: 'beginCombat',
      active: 'p2',
      p1: { hand: ['confront-the-assault'], battlefield: n('plains', 5) },
      p2: { battlefield: ['bear-cub'] },
    });
    attacked.passBoth().attack(attacked.id('p2', 'bear-cub'));
    attacked.pass(); // p2 passes after attacking; p1 has priority
    expect(castable(attacked, 'confront-the-assault')).toBe(true);
  });

  it('Tactical Advantage only targets a blocking or blocked creature of yours', () => {
    const g = game({
      step: 'beginCombat',
      active: 'p2',
      p1: { hand: ['tactical-advantage'], battlefield: ['plains', 'savannah-lions', 'bear-cub'] },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.passBoth().attack(g.id('p2', 'gnarlback-rhino')).passBoth();
    g.block([lions, g.id('p2', 'gnarlback-rhino')]);
    g.pass(); // p2 passes; p1 can respond
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) =>
        a.type === 'castSpell' && 'object' in a.targets[0]! ? a.targets[0].object.id : '',
      );
    expect(targets).toEqual([lions]);
  });

  it('Inspiring Commander draws for small creatures entering', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'inspiring-commander'] },
    });
    cast(g, 'savannah-lions').passBoth().passBoth();
    expect(g.life('p1')).toBe(21);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});

describe('red', () => {
  it('Tin Street Cadet makes a Goblin when it becomes blocked', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['tin-street-cadet'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const cadet = g.id('p1', 'tin-street-cadet');
    g.passBoth().attack(cadet).passBoth();
    g.block([g.id('p2', 'bear-cub'), cadet]).passBoth();
    expect(tokens(g, 'goblin-token')).toHaveLength(1);
  });

  it('Raid Bombardment pings for each small attacker', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: ['raid-bombardment', 'tin-street-cadet', 'savannah-lions', 'gnarlback-rhino'],
      },
    });
    g.passBoth().attack(
      g.id('p1', 'tin-street-cadet'),
      g.id('p1', 'savannah-lions'),
      g.id('p1', 'gnarlback-rhino'),
    );
    g.passBoth().passBoth();
    expect(g.life('p2')).toBe(18);
  });

  it('Goblin Trashmaster sacrifices a Goblin to destroy an artifact', () => {
    const g = game({
      p1: { battlefield: ['goblin-trashmaster', 'tin-street-cadet'] },
      p2: { battlefield: ['goldvein-pick'] },
    });
    const acts = g.legal().filter((a) => a.type === 'activateAbility');
    // Either Goblin may be sacrificed; never a non-Goblin.
    expect(
      new Set(acts.map((a) => (a.type === 'activateAbility' ? g.obj(a.sacrifice!).defId : ''))),
    ).toEqual(new Set(['goblin-trashmaster', 'tin-street-cadet']));
    expect(pt(g, g.id('p1', 'tin-street-cadet'))).toEqual([2, 2]);
  });

  it('Ogre Battledriver gives entering creatures +2/+0 and haste', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'ogre-battledriver'] },
    });
    cast(g, 'savannah-lions').passBoth().passBoth();
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(getCharacteristics(g.state, cardDb, lions).keywords.has('haste')).toBe(true);
  });

  it('Immortal Phoenix returns to hand when it dies', () => {
    const g = game({
      p1: { battlefield: ['immortal-phoenix'] },
      p2: { hand: ['heros-downfall'], battlefield: n('swamp', 3) },
      active: 'p2',
    });
    cast(g, 'heros-downfall', [g.ref(g.id('p1', 'immortal-phoenix'))])
      .passBoth()
      .passBoth();
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['immortal-phoenix']);
  });

  it('Siege Dragon hits every non-flyer when attacking (no Walls)', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['siege-dragon'] },
      p2: { battlefield: ['bear-cub', 'healers-hawk'] },
    });
    g.passBoth().attack(g.id('p1', 'siege-dragon')).passBoth();
    expect(g.zoneOf(g.id('p2', 'bear-cub', 'graveyard'))).toBe('graveyard');
    expect(g.zoneOf(g.id('p2', 'healers-hawk'))).toBe('battlefield');
  });

  it('Goblin Gathering makes two plus one per copy in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['goblin-gathering'],
        battlefield: n('mountain', 3),
        graveyard: ['goblin-gathering'],
      },
    });
    cast(g, 'goblin-gathering').passBoth();
    expect(tokens(g, 'goblin-token')).toHaveLength(3);
  });
});

describe('green', () => {
  it('Prized Unicorn: every creature able to block it does', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['prized-unicorn', 'bear-cub'] },
      p2: { battlefield: ['savannah-lions', 'gnarlback-rhino'] },
    });
    const unicorn = g.id('p1', 'prized-unicorn');
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(unicorn, bear).passBoth();
    // p2 tries to block the Bear with the Rhino; the lure pulls both onto the Unicorn.
    g.block([g.id('p2', 'gnarlback-rhino'), bear]);
    const u = g.state.combat!.attackers.find((a) => a.id === unicorn)!;
    expect(u.blockers).toHaveLength(2);
  });

  it('Ilysian Caryatid makes two mana with a 4-power creature', () => {
    const g = game({
      p1: {
        hand: ['gnarlback-rhino'],
        battlefield: [
          'forest',
          'forest',
          { card: 'ilysian-caryatid', sick: false },
          'magnigoth-sentry',
        ],
      },
    });
    expect(castable(g, 'gnarlback-rhino')).toBe(true); // 2 Forests + 2 from the Caryatid
    const small = game({
      p1: {
        hand: ['gnarlback-rhino'],
        battlefield: ['forest', 'forest', { card: 'ilysian-caryatid', sick: false }],
      },
    });
    expect(castable(small, 'gnarlback-rhino')).toBe(false);
  });

  it('Baloth Packhunter puts two counters on each other Packhunter', () => {
    const g = game({
      p1: { hand: ['baloth-packhunter'], battlefield: [...n('forest', 4), 'baloth-packhunter'] },
    });
    cast(g, 'baloth-packhunter').passBoth().passBoth();
    const packs = g.state.battlefield.filter((id) => g.obj(id).defId === 'baloth-packhunter');
    expect(packs.map((id) => g.obj(id).plusOneCounters).sort()).toEqual([0, 2]);
  });

  it('World Shaper returns lands from the graveyard when it dies', () => {
    const g = game({
      p1: { battlefield: ['world-shaper'], graveyard: ['forest', 'forest', 'bear-cub'] },
      p2: { hand: ['heros-downfall'], battlefield: n('swamp', 3) },
      active: 'p2',
    });
    cast(g, 'heros-downfall', [g.ref(g.id('p1', 'world-shaper'))])
      .passBoth()
      .passBoth();
    const forests = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    expect(forests).toHaveLength(2);
    expect(forests.every((id) => g.obj(id).tapped)).toBe(true);
  });

  it('Rampaging Brontodon gets +1/+1 per land when attacking', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [...n('forest', 5), 'rampaging-brontodon'] },
    });
    const b = g.id('p1', 'rampaging-brontodon');
    g.passBoth().attack(b).passBoth();
    expect(pt(g, b)).toEqual([12, 12]);
  });

  it('Rabid Bite and Stony Strength', () => {
    const g = game({
      p1: {
        hand: ['rabid-bite', 'stony-strength'],
        battlefield: [...n('forest', 3), { card: 'bear-cub', tapped: true }],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'stony-strength', [g.ref(bear)]).passBoth();
    expect(g.obj(bear).tapped).toBe(false);
    expect(pt(g, bear)).toEqual([3, 3]);
    cast(g, 'rabid-bite', [g.ref(bear), g.ref(g.id('p2', 'savannah-lions'))]).passBoth();
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    expect(g.obj(bear).damage).toBe(0); // one-sided
  });
});
