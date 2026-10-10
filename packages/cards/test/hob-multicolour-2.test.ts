import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import {
  abilityActions,
  activate,
  board,
  casts,
  choose,
  chars,
  done,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Hobbit 20b: the multicolour group, part two.

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
const pass = (g: Game) => stop(g);
const armies = (g: Game) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === 'hob-goblin-army-token');
const hasKeyword = (g: Game, id: string, k: string) => chars(g, id).keywords.has(k as never);
const counters = (g: Game, id: string) => g.obj(id).plusOneCounters;
/** Passes priority until the declare attackers decision. */
const toAttack = (g: Game): Game => {
  for (let i = 0; i < 60 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
  return g;
};
const attackers = (g: Game, ...ids: string[]) => {
  toAttack(g);
  return g.attack(...ids);
};

describe('Bifur, Melodic Rider', () => {
  it('puts a +1/+1 counter on target creature when it enters', () => {
    const g = game({ p1: { hand: ['bifur-melodic-rider'], battlefield: n('mountain', 6) } });
    cast(g, 'bifur-melodic-rider');
    pass(g);
    done(g);
    expect(counters(g, g.id('p1', 'bifur-melodic-rider'))).toBe(1);
  });

  it('with an enduring story its trigger happens twice (and Dwarf triggers too)', () => {
    // Bifur, Dwalin and Nori are three legends: the enduring story (Bifur is Storied).
    const g = game({
      p1: {
        battlefield: ['bifur-melodic-rider', 'dwalin-weaponmaster', 'nori-teller-of-tales'],
      },
    });
    g.passBoth();
    expect(g.state.players.p1.enduringStory).toBe(true);
    attackers(g, g.id('p1', 'bifur-melodic-rider'));
    done(g);
    const total = g.state.battlefield
      .filter((id) => g.obj(id).controller === 'p1')
      .reduce((sum, id) => sum + counters(g, id), 0);
    expect(total).toBe(2);
  });
});

describe('Bolg of the North', () => {
  const setup = (opposing: string) =>
    game({
      p1: {
        hand: ['bolg-of-the-north'],
        battlefield: [...n('swamp', 3), ...n('mountain', 2), 'savannah-lions'],
      },
      p2: { battlefield: [opposing] },
    });

  it('may sacrifice another creature; damage equal to its power, and excess damage amasses Goblins', () => {
    const g = setup('llanowar-elves');
    cast(g, 'bolg-of-the-north');
    pass(g);
    expect(labels(g)).toEqual(["Don't sacrifice", 'Sacrifice Savannah Lions (2/1)']);
    choose(g, /Sacrifice Savannah Lions/);
    done(g);
    // Savannah Lions had power 2: Llanowar Elves (1 toughness) dies with 1 excess damage: Goblins 1.
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(0);
    expect(board(g, 'llanowar-elves', 'p2')).toHaveLength(0);
    expect(armies(g)).toHaveLength(1);
    expect(counters(g, armies(g)[0]!)).toBe(1);
  });

  it('no excess damage, no Army', () => {
    const g = setup('serra-angel');
    cast(g, 'bolg-of-the-north');
    pass(g);
    choose(g, /Sacrifice Savannah Lions/);
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
    expect(armies(g)).toHaveLength(0);
  });

  it('declining the sacrifice does nothing', () => {
    const g = setup('llanowar-elves');
    cast(g, 'bolg-of-the-north');
    pass(g);
    choose(g, /Don't sacrifice/);
    done(g);
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(board(g, 'llanowar-elves', 'p2')).toHaveLength(1);
  });

  it('with no other creature there is nothing to sacrifice', () => {
    const g = game({
      p1: { hand: ['bolg-of-the-north'], battlefield: [...n('swamp', 3), ...n('mountain', 2)] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'bolg-of-the-north');
    pass(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
  });
});

describe("Bolg's Company", () => {
  it('has haste only while you control another Goblin', () => {
    const alone = game({ p1: { battlefield: ['bolgs-company'] } });
    expect(hasKeyword(alone, alone.id('p1', 'bolgs-company'), 'haste')).toBe(false);
    const g = game({ p1: { battlefield: ['bolgs-company', 'fearsome-goblin-pair'] } });
    expect(hasKeyword(g, g.id('p1', 'bolgs-company'), 'haste')).toBe(true);
  });

  it('{T}, sacrifice another Goblin: add {B}{R}', () => {
    const g = game({
      p1: { battlefield: ['bolgs-company', 'fearsome-goblin-pair'] },
    });
    // Ability 1 is the mana ability (0 is the static haste).
    const act = abilityActions(g, g.id('p1', 'bolgs-company'), 1);
    expect(act.length).toBeGreaterThan(0);
    g.do(act[0]!);
    expect(g.state.players.p1.pool).toHaveLength(2);
    // The sacrificed Goblin Pair's own death trigger amasses Goblins 4.
    done(g);
    expect(board(g, 'fearsome-goblin-pair', 'p1')).toHaveLength(0);
    expect(g.obj(g.id('p1', 'bolgs-company')).tapped).toBe(true);
  });

  it("can't be activated without another Goblin to sacrifice", () => {
    const g = game({ p1: { battlefield: ['bolgs-company'] } });
    expect(abilityActions(g, g.id('p1', 'bolgs-company'), 1)).toHaveLength(0);
  });
});

describe("Chief Warg's Company", () => {
  it("can't attack unless you control two or more other Wolves", () => {
    const one = game({ p1: { battlefield: ['chief-wargs-company', 'hob-wolf-token'] } });
    toAttack(one);
    const attackIds = (g: Game) =>
      g
        .legal()
        .filter((a) => a.type === 'addAttacker')
        .map((a) => (a as { attacker: string }).attacker);
    expect(attackIds(one)).not.toContain(one.id('p1', 'chief-wargs-company'));
    const two = game({
      p1: { battlefield: ['chief-wargs-company', 'hob-wolf-token', 'hob-wolf-token'] },
    });
    toAttack(two);
    expect(attackIds(two)).toContain(two.id('p1', 'chief-wargs-company'));
  });

  it('creates a 2/2 Wolf at the beginning of your upkeep', () => {
    const g = game({ p1: { battlefield: ['chief-wargs-company'] }, active: 'p2', step: 'end' });
    passTo(g, 'upkeep', 'p1');
    pass(g);
    const wolves = board(g, 'hob-wolf-token', 'p1');
    expect(wolves).toHaveLength(1);
    expect(pt(g, wolves[0]!)).toEqual([2, 2]);
  });
});

describe("Dáin's Company", () => {
  it('has lifelink as long as you control another Dwarf', () => {
    const alone = game({ p1: { battlefield: ['d-ins-company'] } });
    expect(hasKeyword(alone, alone.id('p1', 'd-ins-company'), 'lifelink')).toBe(false);
    const g = game({ p1: { battlefield: ['d-ins-company', 'nori-teller-of-tales'] } });
    expect(hasKeyword(g, g.id('p1', 'd-ins-company'), 'lifelink')).toBe(true);
  });

  it('looks at the top four and may take a Dwarf or Equipment; the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['d-ins-company'],
        battlefield: ['mountain', 'plains'],
        library: ['forest', 'llanowar-elves', 'nori-teller-of-tales', 'forest', 'plains', 'plains'],
      },
    });
    cast(g, 'd-ins-company');
    pass(g);
    done(g);
    expect(hand(g)).toEqual(['nori-teller-of-tales']);
    // Four were looked at, one taken: the three others went below the other two.
    expect(g.state.players.p1.library).toHaveLength(5);
    const names = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(names.slice(0, 2)).toEqual(['plains', 'plains']);
  });
});

describe('Duskwatch Hunter', () => {
  it('puts a +1/+1 counter on target creature when it enters', () => {
    const g = game({ p1: { hand: ['duskwatch-hunter'], battlefield: n('swamp', 3) } });
    cast(g, 'duskwatch-hunter');
    pass(g);
    done(g);
    expect(counters(g, g.id('p1', 'duskwatch-hunter'))).toBe(1);
  });

  it("can't be blocked by tokens", () => {
    const g = game({
      p1: { battlefield: ['duskwatch-hunter'] },
      p2: { battlefield: ['hob-wolf-token', 'llanowar-elves'] },
    });
    // Scenario permanents are cards; make the Wolf a real token.
    g.obj(g.id('p2', 'hob-wolf-token')).isToken = true;
    attackers(g, g.id('p1', 'duskwatch-hunter'));
    while (g.decision.kind === 'priority') g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    const blockers = g
      .legal('p2')
      .filter((a) => a.type === 'addBlock')
      .map((a) => (a as { blocker: string }).blocker);
    expect(blockers).toContain(g.id('p2', 'llanowar-elves'));
    expect(blockers).not.toContain(g.id('p2', 'hob-wolf-token'));
  });
});

describe('Dwalin, Weaponmaster', () => {
  it('puts a hone counter on each Equipment you control when it enters; a hone counter grants +1/+0', () => {
    const g = game({
      p1: {
        hand: ['dwalin-weaponmaster'],
        battlefield: ['goblin-plate-mail', 'savannah-lions', ...n('mountain', 6)],
      },
    });
    const mail = g.id('p1', 'goblin-plate-mail');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, mail, 2, [g.ref(lions)]);
    pass(g);
    // Savannah Lions 2/1 plus Goblin Plate Mail's +1/+0.
    expect(pt(g, lions)).toEqual([3, 1]);
    cast(g, 'dwalin-weaponmaster');
    pass(g);
    done(g);
    expect(g.obj(mail).counters?.hone).toBe(1);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(hasKeyword(g, g.id('p1', 'dwalin-weaponmaster'), 'firstStrike')).toBe(true);
  });

  it('puts another hone counter on each Equipment whenever it attacks', () => {
    const g = game({ p1: { battlefield: ['dwalin-weaponmaster', 'goblin-plate-mail'] } });
    attackers(g, g.id('p1', 'dwalin-weaponmaster'));
    done(g);
    expect(g.obj(g.id('p1', 'goblin-plate-mail')).counters?.hone).toBe(1);
  });
});

describe("Eagle's Rescue", () => {
  it('gives enchanted creature +2/+2 and flying', () => {
    const g = game({
      p1: { hand: ['eagles-rescue'], battlefield: [...n('plains', 4), 'savannah-lions'] },
    });
    cast(g, 'eagles-rescue');
    pass(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(hasKeyword(g, lions, 'flying')).toBe(true);
  });

  it('returns from the graveyard attached to a creature you control with power 1 or less, as a sorcery', () => {
    const g = game({
      p1: {
        graveyard: ['eagles-rescue'],
        battlefield: [...n('island', 4), 'llanowar-elves', 'savannah-lions'],
      },
    });
    const rescue = g.id('p1', 'eagles-rescue', 'graveyard');
    const options = abilityActions(g, rescue, 1);
    // Only Llanowar Elves (power 1) is a legal target, not the Lions (power 2).
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    pass(g);
    const aura = g.id('p1', 'eagles-rescue');
    expect(g.obj(aura).zone).toBe('battlefield');
    expect(g.obj(aura).attachedTo).toBe(g.id('p1', 'llanowar-elves'));
    expect(pt(g, g.id('p1', 'llanowar-elves'))).toEqual([3, 3]);
    expect(gy(g)).toEqual([]);
  });

  it("can't be activated at instant speed", () => {
    const g = game({
      p1: { graveyard: ['eagles-rescue'], battlefield: [...n('island', 4), 'llanowar-elves'] },
      step: 'beginCombat',
    });
    expect(abilityActions(g, g.id('p1', 'eagles-rescue', 'graveyard'), 1)).toHaveLength(0);
  });
});

describe('Fearsome Goblin Pair', () => {
  it('amasses Goblins 4 when it dies', () => {
    const g = game({ p1: { battlefield: [{ card: 'fearsome-goblin-pair', damage: 1 }] } });
    g.pass();
    done(g);
    expect(board(g, 'fearsome-goblin-pair', 'p1')).toHaveLength(0);
    expect(armies(g)).toHaveLength(1);
    expect(pt(g, armies(g)[0]!)).toEqual([4, 4]);
  });
});

describe('Goblin Plate Mail', () => {
  it('amasses Goblins 1 and attaches to the amassed Army: +1/+0 and menace; Equip {4}', () => {
    const g = game({ p1: { hand: ['goblin-plate-mail'], battlefield: n('swamp', 6) } });
    cast(g, 'goblin-plate-mail');
    pass(g);
    done(g);
    const army = armies(g)[0]!;
    const mail = g.id('p1', 'goblin-plate-mail');
    expect(g.obj(mail).attachedTo).toBe(army);
    expect(pt(g, army)).toEqual([2, 1]);
    expect(hasKeyword(g, army, 'menace')).toBe(true);
  });
});

describe('Large Bear', () => {
  it('has reach, trample and haste', () => {
    const g = game({ p1: { battlefield: ['large-bear'] } });
    const id = g.id('p1', 'large-bear');
    for (const k of ['reach', 'trample', 'haste']) expect(hasKeyword(g, id, k)).toBe(true);
    expect(pt(g, id)).toEqual([5, 5]);
  });
});
