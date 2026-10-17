import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  activations,
  castAdventure,
  castCreatureFromExile,
  chars,
  exileOf,
  gyOf,
  handOf,
  has,
  ids,
  naming,
  resolve,
  rolesOn,
  toMain1,
} from './woe-red-helpers.ts';

// Wilds of Eldraine (23b): the red cards (continued): Food Fight, burn, Imodane, Kellan, Korvold.

// ---------------------------------------------------------------------------
// Food Fight
// ---------------------------------------------------------------------------

describe('Food Fight', () => {
  const sacrificeAbility = (g: ReturnType<typeof game>, artifact: string, player = 'p2') =>
    activations(g, artifact).find(
      (a) => a.abilityIndex > 0 && a.targets.some((t) => 'player' in t && t.player === player),
    );

  it('artifacts you control have "{2}, Sacrifice this artifact: damage to any target equal to 1 plus the Food Fights"', () => {
    const g = game({
      p1: { battlefield: ['food-fight', 'treasure-token', ...n('mountain', 2)] },
    });
    const treasure = ids(g, 'treasure-token')[0]!;
    const act = sacrificeAbility(g, treasure);
    expect(act).toBeDefined();
    g.do(act!);
    resolve(g);
    expect(g.zoneOf(treasure)).not.toBe('battlefield');
    expect(g.life('p2')).toBe(18);
  });

  it('counts every permanent named Food Fight you control', () => {
    const g = game({
      p1: {
        battlefield: ['food-fight', 'food-fight', 'food-fight', 'food-token', ...n('mountain', 2)],
      },
    });
    const food = ids(g, 'food-token')[0]!;
    // Each Food Fight gives its own copy of the ability.
    const own = activations(g, food).filter((a) =>
      a.targets.some((t) => 'player' in t && t.player === 'p2'),
    );
    expect(new Set(own.map((a) => a.abilityIndex)).size).toBeGreaterThanOrEqual(3);
    g.do(sacrificeAbility(g, food)!);
    resolve(g);
    expect(g.life('p2')).toBe(16);
  });

  it('can target a creature', () => {
    const g = game({
      p1: { battlefield: ['food-fight', 'treasure-token', ...n('mountain', 2)] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    const treasure = ids(g, 'treasure-token')[0]!;
    const act = activations(g, treasure).find(
      (a) => a.abilityIndex > 0 && a.targets.some((t) => 'object' in t && t.object.id === lions),
    );
    expect(act).toBeDefined();
    g.do(act!);
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
  });

  it('only your artifacts have it, and Food Fight is no artifact', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['food-fight', 'treasure-token'] },
      p2: { battlefield: ['treasure-token', 'mountain', 'mountain'] },
    });
    // p2's own Treasure has no sacrifice ability: only the printed ones (mana).
    const theirs = g.id('p2', 'treasure-token');
    const acts = g.legal('p2').filter((a) => a.type === 'activateAbility' && a.source === theirs);
    expect(acts.every((a) => a.type === 'activateAbility' && a.abilityIndex === 0)).toBe(true);
    const fight = ids(g, 'food-fight')[0]!;
    expect(g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === fight)).toEqual(
      [],
    );
  });

  it('without Food Fight there is no such ability; casting Food Fight gives it to the artifacts already there', () => {
    const g = game({
      p1: { hand: ['food-fight'], battlefield: ['treasure-token', ...n('mountain', 4)] },
    });
    const treasure = ids(g, 'treasure-token')[0]!;
    expect(sacrificeAbility(g, treasure)).toBeUndefined();
    cast(g, 'food-fight');
    resolve(g);
    expect(sacrificeAbility(g, treasure)).toBeDefined();
    g.do(sacrificeAbility(g, treasure)!);
    resolve(g);
    expect(g.life('p2')).toBe(18);
  });

  it('a Treasure made after Food Fight has it too, and it needs the {2}', () => {
    const g = game({
      p1: { hand: ['redcap-thief'], battlefield: ['food-fight', ...n('mountain', 3)] },
    });
    cast(g, 'redcap-thief');
    resolve(g);
    const treasure = ids(g, 'treasure-token')[0]!;
    expect(sacrificeAbility(g, treasure)).toBeUndefined();
    // Redcap Thief took all three lands.
    const h = game({
      p1: { battlefield: ['food-fight', 'treasure-token', 'mountain'] },
    });
    expect(sacrificeAbility(h, ids(h, 'treasure-token')[0]!)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Frantic Firebolt, Gnawing Crescendo, Kindled Heroism
// ---------------------------------------------------------------------------

describe('Frantic Firebolt', () => {
  it('deals 2 plus the instant cards, sorcery cards and cards with an Adventure in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['frantic-firebolt'],
        battlefield: n('mountain', 3),
        graveyard: ['shock', 'cut-in', 'bellowing-bruiser', 'savannah-lions', 'mountain'],
      },
      p2: { battlefield: ['realm-scorcher-hellkite'] },
    });
    const hellkite = g.id('p2', 'realm-scorcher-hellkite');
    cast(g, 'frantic-firebolt', [g.ref(hellkite)]);
    resolve(g);
    // Shock, Cut In and Bellowing Bruiser (it has an Adventure) count: 2 + 3.
    expect(g.obj(hellkite).damage).toBe(5);
  });

  it('is just 2 with nothing relevant in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['frantic-firebolt'],
        battlefield: n('mountain', 3),
        graveyard: ['savannah-lions'],
      },
      p2: { battlefield: ['realm-scorcher-hellkite'] },
    });
    const hellkite = g.id('p2', 'realm-scorcher-hellkite');
    cast(g, 'frantic-firebolt', [g.ref(hellkite)]);
    resolve(g);
    expect(g.obj(hellkite).damage).toBe(2);
  });

  it('does not count itself, and ignores the opponent’s graveyard', () => {
    const g = game({
      p1: { hand: ['frantic-firebolt'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['realm-scorcher-hellkite'], graveyard: ['shock', 'shock'] },
    });
    const hellkite = g.id('p2', 'realm-scorcher-hellkite');
    cast(g, 'frantic-firebolt', [g.ref(hellkite)]);
    resolve(g);
    expect(g.obj(hellkite).damage).toBe(2);
  });
});

describe('Gnawing Crescendo', () => {
  it('creatures you control get +2/+0, and a nontoken creature dying this turn makes a Rat', () => {
    const g = game({
      p1: {
        hand: ['gnawing-crescendo', 'shock'],
        battlefield: ['savannah-lions', 'serra-angel', ...n('mountain', 4)],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    const baloth = g.id('p2', 'rumbling-baloth');
    cast(g, 'gnawing-crescendo');
    resolve(g);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(pt(g, angel)).toEqual([6, 4]);
    expect(pt(g, baloth)).toEqual([4, 4]);
    // A nontoken creature of mine dies.
    cast(g, 'shock', [g.ref(lions)]);
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(ids(g, 'woe-rat-token')).toHaveLength(1);
  });

  it('does not trigger for tokens or opponents’ creatures', () => {
    const g = game({
      p1: {
        hand: ['edgewall-pack', 'gnawing-crescendo', 'shock', 'shock'],
        battlefield: n('mountain', 9),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'edgewall-pack');
    resolve(g);
    const rat = ids(g, 'woe-rat-token')[0]!;
    cast(g, 'gnawing-crescendo');
    resolve(g);
    expect(pt(g, rat)).toEqual([3, 1]);
    // A token dies.
    cast(g, 'shock', [g.ref(rat)]);
    resolve(g);
    expect(g.zoneOf(rat)).not.toBe('battlefield');
    expect(ids(g, 'woe-rat-token')).toHaveLength(0);
    // An opponent's creature dies.
    cast(g, 'shock', [g.ref(g.id('p2', 'savannah-lions'))]);
    resolve(g);
    expect(ids(g, 'savannah-lions', 'p2')).toHaveLength(0);
    expect(ids(g, 'woe-rat-token')).toHaveLength(0);
  });

  it('is over at the end of the turn', () => {
    const g = game({
      p1: {
        hand: ['gnawing-crescendo'],
        battlefield: ['savannah-lions', ...n('mountain', 3)],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'gnawing-crescendo');
    resolve(g);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(g.state.emblems?.length ?? 0).toBe(1);
    toMain1(g, 5);
    expect(pt(g, lions)).toEqual([2, 1]);
    expect(g.state.emblems?.length ?? 0).toBe(0);
  });
});

describe('Kindled Heroism', () => {
  it('target creature gets +1/+0 and first strike until end of turn, and you scry 1', () => {
    const g = game({
      p1: {
        hand: ['kindled-heroism'],
        battlefield: ['savannah-lions', 'mountain'],
        library: ['forest', 'island', 'swamp'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'kindled-heroism', [g.ref(lions)]);
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(has(g, lions, 'firstStrike')).toBe(true);
    // Bottom the card: the next one is on top.
    const top = (g.decision as { cards: string[] }).cards[0]!;
    g.do({ type: 'scry', player: 'p1', top: [], bottom: [top] });
    expect(g.state.players.p1.library.at(-1)).toBe(top);
  });
});

// ---------------------------------------------------------------------------
// Grabby Giant // That's Mine
// ---------------------------------------------------------------------------

describe('Grabby Giant // That’s Mine', () => {
  it('That’s Mine creates a Treasure, then the Giant can be cast from exile', () => {
    const g = game({
      p1: { hand: ['grabby-giant'], battlefield: n('mountain', 6) },
    });
    castAdventure(g, 'grabby-giant');
    resolve(g);
    expect(ids(g, 'treasure-token')).toHaveLength(1);
    expect(exileOf(g)).toEqual(['grabby-giant']);
    castCreatureFromExile(g, 'grabby-giant');
    resolve(g);
    const giant = ids(g, 'grabby-giant')[0]!;
    expect(pt(g, giant)).toEqual([4, 3]);
    expect(has(g, giant, 'reach')).toBe(true);
  });

  it('{2}{R}, Sacrifice an artifact or land: draw a card (not a creature)', () => {
    const g = game({
      p1: {
        battlefield: ['grabby-giant', 'savannah-lions', 'treasure-token', ...n('mountain', 4)],
        library: ['forest', 'island'],
      },
    });
    const giant = ids(g, 'grabby-giant')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    const treasure = ids(g, 'treasure-token')[0]!;
    const acts = activations(g, giant);
    const sacrificed = new Set(acts.map((a) => a.sacrifice));
    expect(sacrificed.has(treasure)).toBe(true);
    expect(sacrificed.has(lions)).toBe(false);
    expect(sacrificed.has(giant)).toBe(false);
    expect([...sacrificed].some((id) => id && g.obj(id).defId === 'mountain')).toBe(true);
    g.do(acts.find((a) => a.sacrifice === treasure)!);
    resolve(g);
    expect(g.zoneOf(treasure)).not.toBe('battlefield');
    expect(handOf(g)).toEqual(['forest']);
  });

  it('can sacrifice a land', () => {
    const g = game({
      p1: { battlefield: ['grabby-giant', ...n('mountain', 4)], library: ['forest'] },
    });
    const acts = activations(g, ids(g, 'grabby-giant')[0]!);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    resolve(g);
    expect(handOf(g)).toEqual(['forest']);
    expect(ids(g, 'mountain')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Harried Spearguard, Imodane's Recruiter // Train Troops
// ---------------------------------------------------------------------------

describe('Harried Spearguard', () => {
  it('is a 1/1 with haste that leaves a Rat token when it dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['harried-spearguard', 'mountain'] },
    });
    const guard = ids(g, 'harried-spearguard')[0]!;
    expect(pt(g, guard)).toEqual([1, 1]);
    expect(has(g, guard, 'haste')).toBe(true);
    cast(g, 'shock', [g.ref(guard)]);
    resolve(g);
    expect(g.zoneOf(guard)).toBe('graveyard');
    expect(ids(g, 'woe-rat-token')).toHaveLength(1);
  });
});

describe('Imodane’s Recruiter // Train Troops', () => {
  it('enters: creatures you control get +1/+0 and haste until end of turn', () => {
    const g = game({
      p1: {
        hand: ['imodanes-recruiter'],
        battlefield: ['serra-angel', ...n('mountain', 3)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'imodanes-recruiter');
    resolve(g);
    const recruiter = ids(g, 'imodanes-recruiter')[0]!;
    expect(pt(g, recruiter)).toEqual([3, 2]);
    expect(has(g, recruiter, 'haste')).toBe(true);
    expect(pt(g, angel)).toEqual([5, 4]);
    expect(pt(g, g.id('p2', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('Train Troops: two 2/2 white Knight tokens with vigilance, then the Recruiter from exile', () => {
    const g = game({
      p1: { hand: ['imodanes-recruiter'], battlefield: ['plains', ...n('mountain', 7)] },
    });
    castAdventure(g, 'imodanes-recruiter');
    resolve(g);
    const knights = ids(g, 'woe-w-knight-token');
    expect(knights).toHaveLength(2);
    for (const k of knights) {
      expect(pt(g, k)).toEqual([2, 2]);
      expect(has(g, k, 'vigilance')).toBe(true);
      expect(chars(g, k).subtypes).toEqual(['Knight']);
    }
    expect(exileOf(g)).toEqual(['imodanes-recruiter']);
    castCreatureFromExile(g, 'imodanes-recruiter');
    resolve(g);
    // The Knights get +1/+0 and haste too.
    expect(pt(g, knights[0]!)).toEqual([3, 2]);
    expect(has(g, knights[0]!, 'haste')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Imodane, the Pyrohammer
// ---------------------------------------------------------------------------

describe('Imodane, the Pyrohammer', () => {
  it('a spell that targets only one creature and damages it deals that much to each opponent', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['imodane-the-pyrohammer', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'shock', [g.ref(g.id('p2', 'serra-angel'))]);
    resolve(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
    expect(g.life('p2')).toBe(18);
  });

  it('works for your own creature, too', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['imodane-the-pyrohammer', 'savannah-lions', 'mountain'],
      },
    });
    cast(g, 'shock', [g.ref(ids(g, 'savannah-lions')[0]!)]);
    resolve(g);
    expect(g.life('p2')).toBe(18);
  });

  it('not for a spell that targets a player', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['imodane-the-pyrohammer', 'mountain'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    resolve(g);
    expect(g.life('p2')).toBe(18);
  });

  it('not for a spell with two different creature targets, but yes when both targets are the same creature', () => {
    const g = game({
      p1: {
        hand: ['cut-in', 'cut-in'],
        battlefield: [
          'imodane-the-pyrohammer',
          'realm-scorcher-hellkite',
          'savannah-lions',
          ...n('mountain', 8),
        ],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const hellkite = ids(g, 'realm-scorcher-hellkite')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'cut-in', [g.ref(g.id('p2', 'serra-angel')), g.ref(lions)]);
    resolve(g);
    expect(g.life('p2')).toBe(20);
    cast(g, 'cut-in', [g.ref(hellkite), g.ref(hellkite)]);
    resolve(g);
    expect(g.life('p2')).toBe(16);
  });

  it('not for a spell that targets one creature but only another source deals the damage, nor for abilities', () => {
    const g = game({
      p1: {
        battlefield: ['imodane-the-pyrohammer', 'realm-scorcher-hellkite', ...n('mountain', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const hellkite = ids(g, 'realm-scorcher-hellkite')[0]!;
    const ping = activations(g, hellkite).find((a) =>
      a.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel')),
    );
    expect(ping).toBeDefined();
    g.do(ping!);
    resolve(g);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(1);
    expect(g.life('p2')).toBe(20);
  });

  it('only for spells you control', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['imodane-the-pyrohammer', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [g.ref(ids(g, 'savannah-lions')[0]!)]);
    resolve(g);
    expect(g.life('p2')).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Kellan, the Fae-Blooded // Birthright Boon
// ---------------------------------------------------------------------------

describe('Kellan, the Fae-Blooded // Birthright Boon', () => {
  it('other creatures you control get +1/+0 for each Aura and Equipment attached to Kellan', () => {
    const g = game({
      p1: {
        battlefield: [
          'kellan-the-fae-blooded',
          'savannah-lions',
          'bespoke-battlegarb',
          ...n('mountain', 2),
        ],
      },
    });
    const kellan = ids(g, 'kellan-the-fae-blooded')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    expect(has(g, kellan, 'doubleStrike')).toBe(true);
    expect(pt(g, lions)).toEqual([2, 1]);
    const equip = activations(g, ids(g, 'bespoke-battlegarb')[0]!)[0]!;
    g.do({ ...equip, targets: [g.ref(kellan)] });
    resolve(g);
    // Kellan himself gets the Equipment's +2/+0 and nothing from his own ability.
    expect(pt(g, kellan)).toEqual([4, 2]);
    expect(pt(g, lions)).toEqual([3, 1]);
  });

  it('counts Auras of any controller, a Role included, but not things on other creatures', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['kellan-the-fae-blooded', 'savannah-lions', 'serra-angel'] },
      p2: { hand: ['pacifism', 'pacifism'], battlefield: ['plains', 'plains', 'plains', 'plains'] },
    });
    const kellan = ids(g, 'kellan-the-fae-blooded')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'pacifism', [g.ref(kellan)]);
    resolve(g);
    expect(pt(g, lions)).toEqual([3, 1]);
    // An Aura on another creature does not count.
    cast(g, 'pacifism', [g.ref(ids(g, 'serra-angel')[0]!)]);
    resolve(g);
    expect(pt(g, lions)).toEqual([3, 1]);
  });

  it('a Role on Kellan counts', () => {
    const g = game({
      p1: {
        hand: ['charming-scoundrel'],
        battlefield: ['kellan-the-fae-blooded', 'savannah-lions', ...n('mountain', 2)],
      },
    });
    const kellan = ids(g, 'kellan-the-fae-blooded')[0]!;
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: naming(kellan, 2) });
    expect(rolesOn(g, kellan)).toEqual(['woe-wicked-role']);
    // Kellan is now 3/3 and the Scoundrel and the Lions get +1/+0.
    expect(pt(g, ids(g, 'savannah-lions')[0]!)).toEqual([3, 1]);
    expect(pt(g, ids(g, 'charming-scoundrel')[0]!)).toEqual([2, 1]);
  });

  it('Birthright Boon: search for an Aura or Equipment card, reveal it, put it into your hand', () => {
    const g = game({
      p1: {
        hand: ['kellan-the-fae-blooded'],
        battlefield: ['plains', 'mountain'],
        library: ['forest', 'savannah-lions', 'pacifism', 'bespoke-battlegarb', 'island'],
      },
    });
    castAdventure(g, 'kellan-the-fae-blooded');
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    const offered = g
      .legal()
      .filter(
        (a): a is Extract<Action, { type: 'chooseCard' }> => a.type === 'chooseCard' && !!a.card,
      )
      .map((a) => g.obj(a.card!).defId)
      .sort();
    expect(offered).toEqual(['bespoke-battlegarb', 'pacifism']);
    g.do(
      g
        .legal()
        .find(
          (a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'bespoke-battlegarb',
        )!,
    );
    resolve(g);
    expect(handOf(g)).toEqual(['bespoke-battlegarb']);
    expect(exileOf(g)).toEqual(['kellan-the-fae-blooded']);
  });
});

// ---------------------------------------------------------------------------
// Korvold and the Noble Thief
// ---------------------------------------------------------------------------

describe('Korvold and the Noble Thief', () => {
  it('I, II: a Treasure each; III: exile the top three of target opponent’s library and play them this turn', () => {
    const g = game({
      p1: {
        hand: ['korvold-and-the-noble-thief'],
        battlefield: n('mountain', 4),
        library: n('forest', 10),
      },
      // (p2 draws two of these before the third chapter.)
      p2: {
        library: [
          'island',
          'island',
          'mountain',
          'shock',
          'savannah-lions',
          'island',
          'island',
          'island',
        ],
      },
    });
    cast(g, 'korvold-and-the-noble-thief');
    resolve(g);
    expect(ids(g, 'treasure-token')).toHaveLength(1);
    toMain1(g, 5);
    expect(ids(g, 'treasure-token')).toHaveLength(2);
    expect(exileOf(g, 'p2')).toEqual([]);
    toMain1(g, 7);
    // Chapter III has resolved: the saga is sacrificed, the top three are exiled.
    expect(exileOf(g, 'p2')).toEqual(['mountain', 'shock', 'savannah-lions']);
    expect(ids(g, 'korvold-and-the-noble-thief')).toHaveLength(0);
    expect(g.state.players.p2.library).toHaveLength(3);
    // The land can be played, the instant cast with R, the creature cast with W (no Plains: a Treasure).
    const exiled = g.state.players.p2.exile;
    const land = exiled.find((id) => g.obj(id).defId === 'mountain')!;
    const shock = exiled.find((id) => g.obj(id).defId === 'shock')!;
    const lions = exiled.find((id) => g.obj(id).defId === 'savannah-lions')!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === land)).toBe(true);
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === shock)).toBe(true);
    // Savannah Lions needs {W}: only red mana and Treasures here, so a Treasure pays for it.
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === lions)).toBe(true);
    g.do({ type: 'castSpell', player: 'p1', card: shock, targets: [{ player: 'p2' }] });
    resolve(g);
    expect(g.life('p2')).toBe(18);
    expect(gyOf(g, 'p2')).toContain('shock');
    g.do({ type: 'playLand', player: 'p1', card: land });
    expect(g.zoneOf(land)).toBe('battlefield');
    expect(g.obj(land).controller).toBe('p1');
  });

  it('the exiled cards can not be played on a later turn', () => {
    const g = game({
      p1: {
        hand: ['korvold-and-the-noble-thief'],
        battlefield: n('mountain', 4),
        library: n('forest', 12),
      },
      p2: {
        library: [
          'island',
          'island',
          'mountain',
          'shock',
          'savannah-lions',
          'island',
          'island',
          'island',
        ],
      },
    });
    cast(g, 'korvold-and-the-noble-thief');
    resolve(g);
    toMain1(g, 7);
    toMain1(g, 9);
    const shock = g.state.players.p2.exile.find((id) => g.obj(id).defId === 'shock')!;
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === shock)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Merry Bards
// ---------------------------------------------------------------------------

describe('Merry Bards', () => {
  it('may pay {1} when it enters; when you do, a Young Hero Role on target creature you control', () => {
    const g = game({
      p1: { hand: ['merry-bards'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
    });
    const lions = ids(g, 'savannah-lions')[0]!;
    cast(g, 'merry-bards');
    resolve(g, { accept: true, pick: naming(lions) });
    expect(rolesOn(g, lions)).toEqual(['woe-young-hero-role']);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'mountain'),
    ).toHaveLength(4);
  });

  it('can be declined, and then nothing happens', () => {
    const g = game({
      p1: { hand: ['merry-bards'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
    });
    cast(g, 'merry-bards');
    resolve(g, { accept: false });
    expect(ids(g, 'woe-young-hero-role')).toHaveLength(0);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'mountain'),
    ).toHaveLength(3);
  });

  it('the Role may go on the Bards themselves', () => {
    const g = game({ p1: { hand: ['merry-bards'], battlefield: n('mountain', 4) } });
    cast(g, 'merry-bards');
    resolve(g, { accept: true });
    const bards = ids(g, 'merry-bards')[0]!;
    expect(rolesOn(g, bards)).toEqual(['woe-young-hero-role']);
  });
});
