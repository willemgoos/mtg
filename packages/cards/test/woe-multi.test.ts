import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  casts,
  chars,
  choose,
  done,
  engine,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import { HIDDEN_CARD, getColors, playRandomGame, redactFor, variantIdOf } from '@mtg/engine';

// Wilds of Eldraine 23b: the multicolour, colorless and land groups.

const MULTI = [
  'Agatha of the Vile Cauldron',
  'Ash, Party Crasher',
  'Beluna Grandsquall',
  'Faunsbane Troll',
  'Greta, Sweettooth Scourge',
  'Hylda of the Icy Crown',
  'Johann, Apprentice Sorcerer',
  'Obyra, Dreaming Duelist',
  'Rowan, Scion of War',
  'Sharae of Numbing Depths',
  'Syr Armont, the Redeemer',
  'Talion, the Kindly Lord',
  "The Apprentice's Folly",
  'The Goose Mother',
  'Totentanz, Swarm Piper',
  'Will, Scion of Peace',
  'Yenna, Redtooth Regent',
];
const COLORLESS = [
  "Agatha's Soul Cauldron",
  'Candy Trail',
  "Collector's Vault",
  "Eriette's Tempting Apple",
  'Gingerbrute',
  "Hylda's Crown of Winter",
  'Prophetic Prism',
  'Scarecrow Guide',
  'Syr Ginger, the Meal Ender',
];
const LANDS = [
  'Crystal Grotto',
  'Edgewall Inn',
  'Restless Bivouac',
  'Restless Fortress',
  'Restless Spire',
  'Restless Vinestalk',
  'The Autonomous Furnace',
  'The Dross Pits',
  'The Fair Basilica',
  'The Hunter Maze',
  'The Surgical Bay',
];

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type Game = ReturnType<typeof game>;
type CastAction = Extract<Action, { type: 'castSpell' }>;

const cast = (g: Game, defId: string, pick?: (a: CastAction) => boolean): Game => {
  const a = casts(g, defId).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't cast ${defId}`);
  return g.do(a);
};
/** The first activate action of an ability (optionally the one `pick` accepts). */
const activateFirst = (
  g: Game,
  source: string,
  index: number,
  pick?: (a: Extract<Action, { type: 'activateAbility' }>) => boolean,
): Game => {
  const a = (
    abilityActions(g, source, index) as Extract<Action, { type: 'activateAbility' }>[]
  ).find((x) => !pick || pick(x));
  if (!a) throw new Error(`can't activate ${source}#${index}`);
  return g.do(a);
};
/** The permanents of a def on the battlefield. */
const onField = (g: Game, defId: string, p?: 'p1' | 'p2') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === defId && (!p || g.obj(id).controller === p),
  );
const tokensOf = (g: Game, defId: string, p: 'p1' | 'p2' = 'p1') =>
  onField(g, defId, p).filter((id) => g.obj(id).isToken);

describe('the groups are in the pool', () => {
  it('every card exists', () => {
    for (const name of [...MULTI, ...COLORLESS, ...LANDS])
      expect(cardDb.get(idOf(name)), name).toBeDefined();
  });
  it("Beluna's Adventure side is Seek Thrills", () => {
    expect(cardDb.get('beluna-grandsquall')?.adventure).toBe(true);
    expect(cardDb.get(cardDb.get('beluna-grandsquall')!.back!)?.name).toBe('Seek Thrills');
  });
});

describe('Agatha of the Vile Cauldron', () => {
  it('activated abilities of creatures cost {X} less, X her power, but not below one mana', () => {
    // Agatha is 1/1: her own {4}{R}{G} ability costs {3}{R}{G}. A creature's {1} ability stays at one mana.
    const g = game({
      p1: {
        battlefield: [
          'agatha-of-the-vile-cauldron',
          'gingerbrute',
          ...n('mountain', 3),
          ...n('forest', 2),
          'island',
        ],
      },
    });
    const agatha = g.id('p1', 'agatha-of-the-vile-cauldron');
    const gb = g.id('p1', 'gingerbrute');
    // Gingerbrute's {1}: can't be blocked except by haste: still {1}.
    expect(abilityActions(g, gb, 0).length).toBeGreaterThan(0);
    activateFirst(g, agatha, 1);
    stop(g);
    // 5 mana ({3}{R}{G}) were tapped, one land is left.
    const untapped = g.state.battlefield.filter(
      (id) =>
        g.obj(id).controller === 'p1' &&
        !g.obj(id).tapped &&
        cardDb.get(g.obj(id).defId)!.types.includes('Land'),
    );
    expect(untapped).toHaveLength(1);
    expect(pt(g, gb)).toEqual([2, 2]);
    expect(chars(g, gb).keywords.has('trample')).toBe(true);
    expect(chars(g, gb).keywords.has('haste')).toBe(true);
    // Agatha herself doesn't get the bonus ("other creatures").
    expect(pt(g, agatha)).toEqual([1, 1]);
  });
  it('does not make an ability free', () => {
    const g = game({
      p1: { battlefield: ['agatha-of-the-vile-cauldron', 'gingerbrute', 'mountain'] },
    });
    const gb = g.id('p1', 'gingerbrute');
    // Gingerbrute's {1} is still payable and needs the Mountain.
    activateFirst(g, gb, 0);
    expect(g.obj(g.id('p1', 'mountain')).tapped).toBe(true);
  });
});

/** Passes priority (and answers prompts) until the attackers are declared. */
const toAttackers = (g: Game) => {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
};
/** Resolves the stack and the prompts that come with it. */
const settle = (g: Game, opts: Parameters<typeof done>[1] = {}) => {
  for (let i = 0; i < 30; i++) {
    stop(g);
    const before = JSON.stringify(g.decision);
    done(g, opts);
    if (g.state.stack.length === 0 && g.decision.kind === 'priority') break;
    if (JSON.stringify(g.decision) === before && g.decision.kind !== 'priority') break;
  }
  return g;
};
/** Passes through the rest of this turn, then until it is `player`'s `step` on a later turn, answering prompts with defaults. */
const toStep = (
  g: Game,
  step: string,
  player: 'p1' | 'p2',
  opts: Parameters<typeof done>[1] = {},
) => {
  const start = g.state.turn.number;
  for (let i = 0; i < 400; i++) {
    const t = g.state.turn;
    if (
      t.number > start &&
      t.step === step &&
      t.activePlayer === player &&
      g.decision.kind === 'priority'
    )
      return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g, opts);
  }
  throw new Error(`never reached ${step}`);
};
const landsOf = (g: Game, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).controller === p && cardDb.get(g.obj(id).defId)!.types.includes('Land'),
  );
const untappedLands = (g: Game, p: 'p1' | 'p2' = 'p1') =>
  landsOf(g, p).filter((id) => !g.obj(id).tapped);
/** Picks the trigger-target action for a mode (or the decline with `'decline'`). */
const pickTrigger = (g: Game, mode: number | 'decline') => {
  const acts = g.legal().filter((a) => a.type === 'chooseTargets') as Extract<
    Action,
    { type: 'chooseTargets' }
  >[];
  const a = acts.find((x) =>
    mode === 'decline' ? x.targets.length === 0 && x.mode === undefined : x.mode === mode,
  );
  if (!a) throw new Error(`no trigger action ${mode}: ${JSON.stringify(acts)}`);
  return g.do(a);
};
const targetsObject = (a: { targets: unknown[] }, id: string) => {
  const t = a.targets[0] as { object?: { id: string } } | undefined;
  return t?.object?.id === id;
};

describe('Ash, Party Crasher', () => {
  it('gets a +1/+1 counter when it attacks after two nonland permanents entered (celebration)', () => {
    const g = game({ p1: { battlefield: ['ash-party-crasher'] } });
    g.state.turn.nonlandEntered = { p1: 2 };
    toAttackers(g);
    g.attack(g.id('p1', 'ash-party-crasher'));
    settle(g);
    expect(g.obj(g.id('p1', 'ash-party-crasher')).plusOneCounters).toBe(1);
  });
  it('does nothing with fewer than two', () => {
    const g = game({ p1: { battlefield: ['ash-party-crasher'] } });
    g.state.turn.nonlandEntered = { p1: 1 };
    toAttackers(g);
    g.attack(g.id('p1', 'ash-party-crasher'));
    settle(g);
    expect(g.obj(g.id('p1', 'ash-party-crasher')).plusOneCounters).toBe(0);
  });
  it('has haste', () => {
    const g = game({ p1: { hand: ['ash-party-crasher'] } });
    expect(chars(g, g.id('p1', 'ash-party-crasher', 'hand')).keywords.has('haste')).toBe(true);
  });
});

describe('Beluna Grandsquall and Seek Thrills', () => {
  it('permanent spells that have an Adventure cost {1} less (the Adventure spell does not)', () => {
    // Frolicking Familiar is {2}{U} (an Adventure creature): two Islands are enough with Beluna.
    const g = game({
      p1: {
        hand: ['frolicking-familiar'],
        battlefield: ['beluna-grandsquall', 'island', 'island'],
      },
    });
    expect(casts(g, 'frolicking-familiar').filter((a) => !a.back).length).toBeGreaterThan(0);
    // Without Beluna it isn't castable with two lands.
    const h = game({ p1: { hand: ['frolicking-familiar'], battlefield: ['island', 'island'] } });
    expect(casts(h, 'frolicking-familiar').filter((a) => !a.back)).toHaveLength(0);
  });
  it('a creature without an Adventure is not cheaper', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['beluna-grandsquall', ...n('plains', 4)] },
    });
    expect(casts(g, 'serra-angel')).toHaveLength(0);
  });
  it('Seek Thrills mills seven, then puts the milled cards that have an Adventure into your hand', () => {
    const g = game({
      p1: {
        hand: ['beluna-grandsquall'],
        battlefield: [...n('forest', 2), ...n('island', 2), ...n('mountain', 2)],
        library: [
          'frolicking-familiar',
          'forest',
          'hypnotic-sprite',
          'island',
          'forest',
          'shock',
          'forest',
          'frolicking-familiar',
          'island',
        ],
      },
    });
    cast(g, 'beluna-grandsquall', (a) => a.back === true);
    settle(g);
    // Seven are milled; the eighth card (another Frolicking Familiar) stays in the library.
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(hand(g).sort()).toEqual(['frolicking-familiar', 'hypnotic-sprite']);
    expect(gy(g).filter((d) => d === 'forest')).toHaveLength(3);
    expect(gy(g)).toContain('shock');
    // The Adventure goes to exile ("on an adventure") after it resolves.
    expect(exile(g)).toContain('beluna-grandsquall');
  });
});

describe('Faunsbane Troll', () => {
  const troll = () =>
    game({
      p1: { hand: ['faunsbane-troll'], battlefield: [...n('swamp', 2), ...n('forest', 3)] },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
  it('enters with a Monster Role attached to it', () => {
    const g = troll();
    cast(g, 'faunsbane-troll');
    settle(g);
    const t = g.id('p1', 'faunsbane-troll');
    expect(pt(g, t)).toEqual([5, 5]);
    expect(chars(g, t).keywords.has('trample')).toBe(true);
    expect(tokensOf(g, 'woe-monster-role')).toHaveLength(1);
  });
  it('{1}, sacrifice an Aura attached to it: fights a creature you do not control; it is exiled if it would die', () => {
    const g = troll();
    cast(g, 'faunsbane-troll');
    settle(g);
    const t = g.id('p1', 'faunsbane-troll');
    const lions = g.id('p2', 'savannah-lions');
    expect(abilityActions(g, t, 1).length).toBeGreaterThan(0);
    activateFirst(g, t, 1, (a) => targetsObject(a, lions));
    settle(g);
    expect(tokensOf(g, 'woe-monster-role')).toHaveLength(0);
    // The Troll is 4/4 again and survived; the Lions would have died and were exiled instead.
    expect(g.zoneOf(t)).toBe('battlefield');
    expect(g.zoneOf(lions)).toBe('exile');
    expect(gy(g, 'p2')).not.toContain('savannah-lions');
    expect(g.obj(t).damage).toBe(2);
  });
  it('is not offered without an Aura on it, and only at sorcery speed', () => {
    const g = game({
      p1: { battlefield: ['faunsbane-troll', 'swamp', 'forest'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(abilityActions(g, g.id('p1', 'faunsbane-troll'), 1)).toHaveLength(0);
    const h = troll();
    cast(h, 'faunsbane-troll');
    settle(h);
    toAttackers(h);
    expect(abilityActions(h, h.id('p1', 'faunsbane-troll'), 1)).toHaveLength(0);
  });
});

describe('Greta, Sweettooth Scourge', () => {
  const greta = () =>
    game({
      p1: {
        hand: ['greta-sweettooth-scourge'],
        battlefield: [...n('swamp', 3), ...n('forest', 3), 'llanowar-elves'],
      },
    });
  it('creates a Food when it enters', () => {
    const g = greta();
    cast(g, 'greta-sweettooth-scourge');
    settle(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
  });
  it('{G}, sacrifice a Food: a +1/+1 counter on target creature, as a sorcery', () => {
    const g = greta();
    cast(g, 'greta-sweettooth-scourge');
    settle(g);
    const elves = g.id('p1', 'llanowar-elves');
    const g0 = g.id('p1', 'greta-sweettooth-scourge');
    activateFirst(g, g0, 1, (a) => targetsObject(a, elves));
    settle(g);
    expect(g.obj(elves).plusOneCounters).toBe(1);
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
  });
  it('{1}{B}, sacrifice a Food: draw a card and lose 1 life, at instant speed', () => {
    const g = greta();
    cast(g, 'greta-sweettooth-scourge');
    settle(g);
    const g0 = g.id('p1', 'greta-sweettooth-scourge');
    const handBefore = g.state.players.p1.hand.length;
    toAttackers(g);
    g.attack(g.id('p1', 'llanowar-elves'));
    // Not a sorcery: usable in combat. (The counter ability is not.)
    expect(abilityActions(g, g0, 1)).toHaveLength(0);
    activateFirst(g, g0, 2);
    settle(g);
    expect(g.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(g.life('p1')).toBe(19);
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
  });
});

describe('Hylda of the Icy Crown', () => {
  // Hylda's Crown of Winter taps a creature for {0} on our own turn.
  const setup = () =>
    game({
      p1: {
        battlefield: [
          'hylda-of-the-icy-crown',
          'hyldas-crown-of-winter',
          ...n('plains', 2),
          ...n('island', 2),
        ],
      },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
  const tapLions = (g: Game) => {
    const lions = g.id('p2', 'savannah-lions');
    activateFirst(g, g.id('p1', 'hyldas-crown-of-winter'), 0, (a) => targetsObject(a, lions));
    stop(g);
    return lions;
  };
  it('offers the modes (or to decline) when you tap an untapped creature an opponent controls', () => {
    const g = setup();
    tapLions(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const modes = (g.legal().filter((a) => a.type === 'chooseTargets') as { mode?: number }[]).map(
      (a) => a.mode,
    );
    expect(modes.sort()).toEqual([undefined, 0, 1, 2].sort());
  });
  it('declining pays nothing and does nothing', () => {
    const g = setup();
    tapLions(g);
    pickTrigger(g, 'decline');
    settle(g);
    expect(untappedLands(g)).toHaveLength(4);
    expect(tokensOf(g, 'woe-elemental-white-blue-token')).toHaveLength(0);
  });
  it('pay {1}: create a 4/4 white and blue Elemental', () => {
    const g = setup();
    tapLions(g);
    pickTrigger(g, 0);
    settle(g);
    expect(untappedLands(g)).toHaveLength(3);
    const [t] = tokensOf(g, 'woe-elemental-white-blue-token');
    expect(t).toBeDefined();
    expect(pt(g, t!)).toEqual([4, 4]);
    expect([...getColors(g.state, cardDb, t!)].sort()).toEqual(['U', 'W']);
    expect(chars(g, t!).subtypes).toContain('Elemental');
  });
  it('pay {1}: a +1/+1 counter on each creature you control', () => {
    const g = setup();
    g.state.turn.nonlandEntered = undefined;
    tapLions(g);
    pickTrigger(g, 1);
    settle(g);
    expect(g.obj(g.id('p1', 'hylda-of-the-icy-crown')).plusOneCounters).toBe(1);
    // Not the opponent's creatures.
    expect(g.obj(g.id('p2', 'savannah-lions')).plusOneCounters).toBe(0);
  });
  it('pay {1}: scry 2, then draw a card', () => {
    const g = setup();
    const before = g.state.players.p1.hand.length;
    tapLions(g);
    pickTrigger(g, 2);
    settle(g);
    expect(g.state.players.p1.hand).toHaveLength(before + 1);
  });
  it('cannot pay: only the decline', () => {
    const g = game({
      p1: { battlefield: ['hylda-of-the-icy-crown', 'hyldas-crown-of-winter'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    tapLions(g);
    const acts = g.legal().filter((a) => a.type === 'chooseTargets') as { mode?: number }[];
    expect(acts.every((a) => a.mode === undefined)).toBe(true);
  });
});

describe('Johann, Apprentice Sorcerer', () => {
  const topCasts = (g: Game) => {
    const top = g.state.players.p1.library[0]!;
    return g.legal().filter((a) => a.type === 'castSpell' && a.card === top);
  };
  it('lets you cast an instant or sorcery from the top of your library, once each turn', () => {
    const g = game({
      p1: {
        battlefield: ['johann-apprentice-sorcerer', 'mountain', 'mountain', ...n('plains', 4)],
        library: ['shock', 'day-of-judgment', 'forest', 'forest'],
      },
    });
    expect(topCasts(g).length).toBeGreaterThan(0);
    g.do(topCasts(g)[0]!);
    settle(g);
    expect(gy(g)).toContain('shock');
    // The next top card is a sorcery we could pay for, but it is the second this turn.
    expect(g.state.players.p1.library[0] && g.obj(g.state.players.p1.library[0]).defId).toBe(
      'day-of-judgment',
    );
    expect(topCasts(g)).toHaveLength(0);
  });
  it('cannot cast a creature or a land from the top', () => {
    const g = game({
      p1: {
        battlefield: ['johann-apprentice-sorcerer', ...n('plains', 4)],
        library: ['savannah-lions', 'forest'],
      },
    });
    expect(topCasts(g)).toHaveLength(0);
    const h = game({
      p1: { battlefield: ['johann-apprentice-sorcerer'], library: ['forest', 'forest'] },
    });
    expect(h.legal().some((a) => a.type === 'playLand')).toBe(false);
  });
  it('can cast one again on another turn', () => {
    const g = game({
      p1: {
        battlefield: ['johann-apprentice-sorcerer', 'mountain', 'mountain', 'mountain'],
        library: ['shock', 'forest', 'shock', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    g.do(topCasts(g)[0]!);
    settle(g);
    expect(gy(g)).toEqual(['shock']);
    toStep(g, 'main1', 'p1');
    // The turn-two draw took the forest; the next top is the second Shock.
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('shock');
    expect(topCasts(g).length).toBeGreaterThan(0);
  });
  it('you may look at the top card of your library any time', () => {
    const g = game({
      p1: { battlefield: ['johann-apprentice-sorcerer'], library: ['shock', 'forest'] },
    });
    expect(g.state.players.p1.library[0]).toBeDefined();
    const topId = g.state.players.p1.library[0]!;
    expect(redactFor(g.state, 'p1', cardDb).objects[topId]!.defId).toBe('shock');
    const h = game({ p1: { battlefield: ['savannah-lions'], library: ['shock', 'forest'] } });
    expect(redactFor(h.state, 'p1', cardDb).objects[h.state.players.p1.library[0]!]!.defId).toBe(
      HIDDEN_CARD,
    );
  });
});

describe('Obyra, Dreaming Duelist', () => {
  it('has flash and flying', () => {
    const g = game({ p1: { hand: ['obyra-dreaming-duelist'] } });
    const k = chars(g, g.id('p1', 'obyra-dreaming-duelist', 'hand')).keywords;
    expect(k.has('flash') && k.has('flying')).toBe(true);
  });
  it('another Faerie entering makes each opponent lose 1 life; a non-Faerie does not', () => {
    const g = game({
      p1: {
        hand: ['mocking-sprite', 'savannah-lions'],
        battlefield: ['obyra-dreaming-duelist', ...n('island', 3), 'plains'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p2')).toBe(20);
    cast(g, 'mocking-sprite');
    settle(g);
    expect(g.life('p2')).toBe(19);
  });
  it('Obyra herself entering does not trigger', () => {
    const g = game({
      p1: { hand: ['obyra-dreaming-duelist'], battlefield: [...n('island', 2), 'swamp'] },
    });
    cast(g, 'obyra-dreaming-duelist');
    settle(g);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Rowan, Scion of War', () => {
  const rowan = (lost: number, lands: string[], hand: string[]) => {
    const g = game({ p1: { hand, battlefield: ['rowan-scion-of-war', ...lands] } });
    g.state.turn.lifeLostTotal = { p1: lost, p2: 0 };
    return g;
  };
  it('{T}: black and red spells cost {X} less, X the life you lost this turn', () => {
    // Shivan Dragon is {4}{R}{R}: three Mountains cast it only after the {3} discount.
    const g = rowan(3, n('mountain', 3), ['shivan-dragon']);
    expect(casts(g, 'shivan-dragon')).toHaveLength(0);
    activateFirst(g, g.id('p1', 'rowan-scion-of-war'), 0);
    settle(g);
    expect(casts(g, 'shivan-dragon')).toHaveLength(1);
    cast(g, 'shivan-dragon');
    settle(g);
    expect(onField(g, 'shivan-dragon')).toHaveLength(1);
  });
  it('X is the life lost when the spell is cast: less life lost, a smaller discount', () => {
    const g = rowan(2, n('mountain', 3), ['shivan-dragon']);
    activateFirst(g, g.id('p1', 'rowan-scion-of-war'), 0);
    settle(g);
    // {4}{R}{R} minus 2 is {2}{R}{R}: four mana.
    expect(casts(g, 'shivan-dragon')).toHaveLength(0);
    g.state.turn.lifeLostTotal = { p1: 3, p2: 0 };
    expect(casts(g, 'shivan-dragon')).toHaveLength(1);
  });
  it('does not discount white spells, and does nothing when no life was lost', () => {
    const g = rowan(3, n('plains', 3), ['serra-angel']);
    activateFirst(g, g.id('p1', 'rowan-scion-of-war'), 0);
    settle(g);
    expect(casts(g, 'serra-angel')).toHaveLength(0);
    const h = rowan(0, n('mountain', 3), ['shivan-dragon']);
    activateFirst(h, h.id('p1', 'rowan-scion-of-war'), 0);
    settle(h);
    expect(casts(h, 'shivan-dragon')).toHaveLength(0);
  });
  it('lasts only this turn', () => {
    const g = rowan(3, n('mountain', 3), ['shivan-dragon']);
    activateFirst(g, g.id('p1', 'rowan-scion-of-war'), 0);
    settle(g);
    toStep(g, 'main1', 'p1');
    g.state.turn.lifeLostTotal = { p1: 3, p2: 0 };
    expect(casts(g, 'shivan-dragon')).toHaveLength(0);
  });
  it('is a sorcery-speed ability: not in combat', () => {
    const g = rowan(2, [], []);
    toAttackers(g);
    expect(abilityActions(g, g.id('p1', 'rowan-scion-of-war'), 0)).toHaveLength(0);
  });
  it('has menace', () => {
    const g = rowan(0, [], []);
    expect(chars(g, g.id('p1', 'rowan-scion-of-war')).keywords.has('menace')).toBe(true);
  });
});

describe('Will, Scion of Peace', () => {
  const will = (gained: number, lands: string[], hand: string[]) => {
    const g = game({ p1: { hand, battlefield: ['will-scion-of-peace', ...lands] } });
    g.state.turn.lifeGained = { p1: gained, p2: 0 };
    return g;
  };
  it('{T}: white and blue spells cost {X} less, X the life you gained this turn', () => {
    // Serra Angel {3}{W}{W} minus {3}: two Plains.
    const g = will(3, n('plains', 2), ['serra-angel']);
    expect(casts(g, 'serra-angel')).toHaveLength(0);
    activateFirst(g, g.id('p1', 'will-scion-of-peace'), 0);
    settle(g);
    expect(casts(g, 'serra-angel')).toHaveLength(1);
  });
  it('blue spells too, but not red ones', () => {
    // Mocking Sprite {2}{U} minus {2} is {U}.
    const g = will(2, ['island'], ['mocking-sprite']);
    activateFirst(g, g.id('p1', 'will-scion-of-peace'), 0);
    settle(g);
    expect(casts(g, 'mocking-sprite')).toHaveLength(1);
    const h = will(3, n('mountain', 3), ['shivan-dragon']);
    activateFirst(h, h.id('p1', 'will-scion-of-peace'), 0);
    settle(h);
    expect(casts(h, 'shivan-dragon')).toHaveLength(0);
  });
  it('is a sorcery-speed ability, and Will has vigilance', () => {
    const g = will(0, [], []);
    expect(chars(g, g.id('p1', 'will-scion-of-peace')).keywords.has('vigilance')).toBe(true);
    toAttackers(g);
    expect(abilityActions(g, g.id('p1', 'will-scion-of-peace'), 0)).toHaveLength(0);
  });
});

describe('Sharae of Numbing Depths', () => {
  it('taps and stuns a creature when it enters, and the tap draws a card (once each turn)', () => {
    const g = game({
      p1: {
        hand: ['sharae-of-numbing-depths'],
        battlefield: ['hyldas-crown-of-winter', ...n('plains', 2), ...n('island', 2)],
      },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
    cast(g, 'sharae-of-numbing-depths');
    const lions = g.id('p2', 'savannah-lions');
    settle(g, { target: (a) => targetsObject(a, lions) });
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.obj(lions).counters?.stun).toBe(1);
    // Sharae saw it: one card drawn.
    expect(g.state.players.p1.hand).toHaveLength(1);
    // A second tap this turn (the Crown) draws nothing more.
    const elves = g.id('p2', 'llanowar-elves');
    activateFirst(g, g.id('p1', 'hyldas-crown-of-winter'), 0, (a) => targetsObject(a, elves));
    settle(g);
    expect(g.obj(elves).tapped).toBe(true);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
  it('draws again on a later turn', () => {
    const g = game({
      p1: { battlefield: ['sharae-of-numbing-depths', 'hyldas-crown-of-winter', 'plains'] },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
    const tap = (id: string) => {
      activateFirst(g, g.id('p1', 'hyldas-crown-of-winter'), 0, (a) => targetsObject(a, id));
      settle(g);
    };
    const hand0 = g.state.players.p1.hand.length;
    tap(g.id('p2', 'savannah-lions'));
    expect(g.state.players.p1.hand).toHaveLength(hand0 + 1);
    toStep(g, 'main1', 'p1');
    const hand1 = g.state.players.p1.hand.length;
    tap(g.id('p2', 'llanowar-elves'));
    expect(g.state.players.p1.hand).toHaveLength(hand1 + 1);
  });
});

describe('Syr Armont, the Redeemer', () => {
  it('puts a Monster Role on another creature you control, and enchanted creatures you control get +1/+1', () => {
    const g = game({
      p1: {
        hand: ['syr-armont-the-redeemer'],
        battlefield: ['llanowar-elves', 'savannah-lions', ...n('forest', 3), ...n('plains', 2)],
      },
    });
    cast(g, 'syr-armont-the-redeemer');
    const elves = g.id('p1', 'llanowar-elves');
    // The target must be another creature (Armont himself is on the stack, not a target).
    settle(g, { target: (a) => targetsObject(a, elves) });
    // Llanowar Elves 1/1, Monster Role +1/+1 and trample, Armont's anthem +1/+1.
    expect(pt(g, elves)).toEqual([3, 3]);
    expect(chars(g, elves).keywords.has('trample')).toBe(true);
    // Unenchanted creatures get nothing: Savannah Lions stay 2/1, Armont is 4/4.
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    expect(pt(g, g.id('p1', 'syr-armont-the-redeemer'))).toEqual([4, 4]);
  });
  it("an opponent's enchanted creatures are not pumped", () => {
    const g = game({
      p1: { battlefield: ['syr-armont-the-redeemer'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    expect(pt(g, g.id('p2', 'llanowar-elves'))).toEqual([1, 1]);
  });
});

describe('Talion, the Kindly Lord', () => {
  it('asks for a number from 1 to 10 as it enters', () => {
    const g = game({
      p1: { hand: ['talion-the-kindly-lord'], battlefield: [...n('island', 3), ...n('swamp', 2)] },
    });
    cast(g, 'talion-the-kindly-lord');
    stop(g);
    expect(labels(g)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect((g.decision as { title?: string }).title).toMatch(/choose a number between 1 and 10/);
    choose(g, /^5$/);
    settle(g);
    const t = g.id('p1', variantIdOf('talion-the-kindly-lord', '5'));
    expect(chars(g, t).keywords.has('flying')).toBe(true);
    expect(pt(g, t)).toEqual([3, 4]);
  });
  const talion = (num: number, active: 'p1' | 'p2' = 'p2') =>
    game({
      p1: { battlefield: [variantIdOf('talion-the-kindly-lord', String(num))] },
      p2: { hand: ['serra-angel', 'savannah-lions'], battlefield: n('plains', 5) },
      active,
    });
  const castP2 = (g: Game, defId: string) => g.do(casts(g, defId, 'p2')[0]!);
  const lose2Draw1 = (num: number, spell: string) => {
    const g = talion(num);
    const hand0 = g.state.players.p1.hand.length;
    castP2(g, spell);
    settle(g);
    return { life: g.life('p2'), drawn: g.state.players.p1.hand.length - hand0 };
  };
  it('a spell with the chosen mana value makes that player lose 2 life and you draw a card', () => {
    // Savannah Lions: mana value 1, power 2, toughness 1. Serra Angel: mana value 5, 4/4.
    expect(lose2Draw1(1, 'savannah-lions')).toEqual({ life: 18, drawn: 1 });
    expect(lose2Draw1(5, 'serra-angel')).toEqual({ life: 18, drawn: 1 });
  });
  it('power or toughness equal to the chosen number counts too', () => {
    expect(lose2Draw1(2, 'savannah-lions')).toEqual({ life: 18, drawn: 1 }); // power 2
    expect(lose2Draw1(4, 'serra-angel')).toEqual({ life: 18, drawn: 1 }); // power and toughness 4
  });
  it('any other number does nothing', () => {
    expect(lose2Draw1(3, 'savannah-lions')).toEqual({ life: 20, drawn: 0 });
    expect(lose2Draw1(6, 'serra-angel')).toEqual({ life: 20, drawn: 0 });
  });
  it('your own spells do not trigger it', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: [variantIdOf('talion-the-kindly-lord', '1'), 'plains'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(20);
  });
});

describe("The Apprentice's Folly", () => {
  const folly = () =>
    game({
      p1: {
        hand: ['the-apprentices-folly'],
        battlefield: [
          'agatha-of-the-vile-cauldron',
          'llanowar-elves',
          ...n('island', 2),
          ...n('mountain', 2),
        ],
      },
    });
  const reflections = (g: Game) =>
    g.state.battlefield.filter(
      (id) => g.obj(id).isToken && chars(g, id).subtypes.includes('Reflection'),
    );
  it('I: a token copy of a nontoken creature: not legendary, a Reflection, with haste', () => {
    const g = folly();
    cast(g, 'the-apprentices-folly');
    const agatha = g.id('p1', 'agatha-of-the-vile-cauldron');
    settle(g, { target: (a) => targetsObject(a, agatha) });
    const copies = reflections(g);
    expect(copies).toHaveLength(1);
    const c = copies[0]!;
    expect(g.obj(c).defId).toBe('agatha-of-the-vile-cauldron');
    expect(g.obj(c).nonlegendary).toBe(true);
    expect(chars(g, c).keywords.has('haste')).toBe(true);
    expect(chars(g, c).subtypes).toEqual(
      expect.arrayContaining(['Human', 'Warlock', 'Reflection']),
    );
    // The legend rule doesn't apply (the copy isn't legendary) and the original isn't a Reflection or hasty.
    expect(g.zoneOf(agatha)).toBe('battlefield');
    expect(g.zoneOf(c)).toBe('battlefield');
    expect(chars(g, agatha).subtypes).not.toContain('Reflection');
    // The Saga has one lore counter.
    expect(g.obj(g.id('p1', 'the-apprentices-folly')).counters?.lore).toBe(1);
  });
  it('only a nontoken creature that does not share a name with a token you control can be chosen', () => {
    const g = folly();
    cast(g, 'the-apprentices-folly');
    const agatha = g.id('p1', 'agatha-of-the-vile-cauldron');
    const elves = g.id('p1', 'llanowar-elves');
    // Chapter I: both are legal targets.
    expect(g.decision.kind).toBe('priority');
    stop(g);
    const first = (
      g.legal().filter((a) => a.type === 'chooseTargets') as { targets: unknown[] }[]
    ).map((a) => (a.targets[0] as { object: { id: string } }).object.id);
    expect(first.sort()).toEqual([agatha, elves].sort());
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && targetsObject(a, agatha))!);
    settle(g);
    // Chapter II, next turn: Agatha shares a name with the token, so only Llanowar Elves may be chosen.
    const seen: string[][] = [];
    const start = g.state.turn.number;
    for (let i = 0; i < 200 && g.state.turn.number === start; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    for (let i = 0; i < 200; i++) {
      if (g.decision.kind === 'chooseTriggerTargets') {
        seen.push(
          (g.legal().filter((a) => a.type === 'chooseTargets') as { targets: unknown[] }[]).map(
            (a) => (a.targets[0] as { object: { id: string } }).object.id,
          ),
        );
        break;
      }
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(seen).toEqual([[elves]]);
    settle(g);
    expect(reflections(g)).toHaveLength(2);
    expect(
      reflections(g)
        .map((id) => g.obj(id).defId)
        .sort(),
    ).toEqual(['agatha-of-the-vile-cauldron', 'llanowar-elves']);
  });
  it('III: sacrifice all Reflections you control', () => {
    const g = folly();
    cast(g, 'the-apprentices-folly');
    const agatha = g.id('p1', 'agatha-of-the-vile-cauldron');
    settle(g, { target: (a) => targetsObject(a, agatha) });
    expect(reflections(g)).toHaveLength(1);
    toStep(g, 'main1', 'p1');
    settle(g);
    toStep(g, 'main1', 'p1');
    settle(g);
    expect(reflections(g)).toHaveLength(0);
    // The original creatures stay, and the Saga is sacrificed after chapter III.
    expect(g.zoneOf(agatha)).toBe('battlefield');
    expect(onField(g, 'llanowar-elves')).toHaveLength(1);
    expect(onField(g, 'the-apprentices-folly')).toHaveLength(0);
  });
});

describe('The Goose Mother', () => {
  const mother = (x: number) => {
    const g = game({
      p1: { hand: ['the-goose-mother'], battlefield: [...n('forest', 3), ...n('island', 3)] },
    });
    const a = casts(g, 'the-goose-mother').find((c) => c.x === x);
    if (!a) throw new Error(`no cast with X=${x}`);
    g.do(a);
    settle(g);
    return g;
  };
  it('enters with X +1/+1 counters and creates half X Food tokens, rounded up', () => {
    const g = mother(3);
    const m = g.id('p1', 'the-goose-mother');
    expect(g.obj(m).plusOneCounters).toBe(3);
    expect(pt(g, m)).toEqual([5, 5]);
    expect(chars(g, m).keywords.has('flying')).toBe(true);
    expect(tokensOf(g, 'food-token')).toHaveLength(2);
    expect(tokensOf(mother(1), 'food-token')).toHaveLength(1);
    const z = mother(0);
    expect(tokensOf(z, 'food-token')).toHaveLength(0);
    expect(pt(z, z.id('p1', 'the-goose-mother'))).toEqual([2, 2]);
    expect(tokensOf(mother(4), 'food-token')).toHaveLength(2);
  });
  const attack = (g: Game, accept: boolean) => {
    const m = g.id('p1', 'the-goose-mother');
    g.obj(m).summoningSick = false;
    toAttackers(g);
    g.attack(m);
    settle(g, { accept });
  };
  it('whenever it attacks, you may sacrifice a Food; if you do, draw a card', () => {
    const g = mother(3);
    const before = g.state.players.p1.hand.length;
    attack(g, true);
    expect(tokensOf(g, 'food-token')).toHaveLength(1);
    expect(g.state.players.p1.hand).toHaveLength(before + 1);
  });
  it('you may decline to sacrifice a Food', () => {
    const g = mother(3);
    const before = g.state.players.p1.hand.length;
    attack(g, false);
    expect(tokensOf(g, 'food-token')).toHaveLength(2);
    expect(g.state.players.p1.hand).toHaveLength(before);
  });
  it('with no Food nothing happens', () => {
    const g = mother(0);
    const before = g.state.players.p1.hand.length;
    attack(g, true);
    expect(g.state.players.p1.hand).toHaveLength(before);
  });
});

describe('Totentanz, Swarm Piper', () => {
  const rats = (g: Game) => tokensOf(g, 'woe-rat-token');
  const kill = (g: Game, spell: string, target: string) => {
    const a = casts(g, spell).find((c) => targetsObject(c, target));
    if (!a) throw new Error(`can't ${spell} ${target}`);
    g.do(a);
    settle(g);
  };
  it('creates a Rat token when another nontoken creature you control dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['totentanz-swarm-piper', 'llanowar-elves', 'mountain'] },
    });
    kill(g, 'shock', g.id('p1', 'llanowar-elves'));
    expect(rats(g)).toHaveLength(1);
    expect(chars(g, rats(g)[0]!).cantBlock).toBe(true);
    expect(pt(g, rats(g)[0]!)).toEqual([1, 1]);
  });
  it('creates a Rat when Totentanz herself dies', () => {
    const g = game({
      p1: {
        battlefield: ['totentanz-swarm-piper', 'mountain', 'mountain'],
        hand: ['lightning-strike'],
      },
    });
    kill(g, 'lightning-strike', g.id('p1', 'totentanz-swarm-piper'));
    expect(
      g.zoneOf(
        g.state.players.p1.graveyard.find((id) => g.obj(id).defId === 'totentanz-swarm-piper')!,
      ),
    ).toBe('graveyard');
    expect(rats(g)).toHaveLength(1);
  });
  it("does not trigger for a token dying, or for an opponent's creature", () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['totentanz-swarm-piper', 'llanowar-elves', ...n('mountain', 2)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    // The opponent's Lions die: no Rat.
    kill(g, 'shock', g.id('p2', 'savannah-lions'));
    expect(rats(g)).toHaveLength(0);
    // Make the Elves a token: its death makes no Rat.
    g.obj(g.id('p1', 'llanowar-elves')).isToken = true;
    kill(g, 'shock', g.id('p1', 'llanowar-elves'));
    expect(rats(g)).toHaveLength(0);
  });
  it('{1}{B}: target attacking Rat you control gains deathtouch until end of turn', () => {
    const g = game({
      p1: { battlefield: ['totentanz-swarm-piper', 'woe-rat-token', 'swamp', 'swamp'] },
    });
    const rat = g.id('p1', 'woe-rat-token');
    g.obj(rat).isToken = true;
    // Not attacking: no legal target.
    expect(abilityActions(g, g.id('p1', 'totentanz-swarm-piper'), 2)).toHaveLength(0);
    toAttackers(g);
    g.attack(rat);
    expect(chars(g, rat).keywords.has('deathtouch')).toBe(false);
    activateFirst(g, g.id('p1', 'totentanz-swarm-piper'), 2, (a) => targetsObject(a, rat));
    settle(g);
    expect(chars(g, rat).keywords.has('deathtouch')).toBe(true);
    // A Rat that is not attacking, or a non-Rat attacker, isn't a target.
  });
});

describe('Yenna, Redtooth Regent', () => {
  const yenna = () =>
    game({
      p1: {
        hand: ['pacifism'],
        battlefield: ['yenna-redtooth-regent', 'banishing-light', ...n('plains', 4)],
      },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves'] },
    });
  const withPacifism = () => {
    const g = yenna();
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'pacifism');
    settle(g, { target: (a) => targetsObject(a, lions) });
    return g;
  };
  it('copies an Aura: the token enters attached to a permanent its controller chooses, then untap Yenna and scry 2', () => {
    const g = withPacifism();
    // Banishing Light has no ETB target here (it was put on the battlefield by the scenario).
    const y = g.id('p1', 'yenna-redtooth-regent');
    const pac = g.id('p1', 'pacifism');
    const elves = g.id('p2', 'llanowar-elves');
    activateFirst(g, y, 0, (a) => targetsObject(a, pac));
    stop(g);
    // Rule 303.4f: the copy chooses what it enchants as it enters.
    expect(labels(g)).toEqual(
      expect.arrayContaining([
        'Enchant Llanowar Elves',
        'Enchant Savannah Lions',
        'Enchant Yenna, Redtooth Regent',
      ]),
    );
    choose(g, /Enchant Llanowar Elves/);
    settle(g);
    const copies = tokensOf(g, 'pacifism');
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).attachedTo).toBe(elves);
    expect(g.obj(copies[0]!).nonlegendary).toBe(true);
    // Yenna untapped (she tapped as a cost).
    expect(g.obj(y).tapped).toBe(false);
  });
  it('the Aura copy and the original now share a name, so neither can be copied again', () => {
    const g = withPacifism();
    const y = g.id('p1', 'yenna-redtooth-regent');
    activateFirst(g, y, 0, (a) => targetsObject(a, g.id('p1', 'pacifism')));
    stop(g);
    choose(g, /Enchant Llanowar Elves/);
    settle(g);
    expect(abilityActions(g, y, 0).filter((a) => a.type === 'activateAbility')).toHaveLength(0);
  });
  it('copies an enchantment that is not an Aura: Yenna stays tapped', () => {
    const g = yenna();
    const y = g.id('p1', 'yenna-redtooth-regent');
    const bl = g.id('p1', 'banishing-light');
    const lions = g.id('p2', 'savannah-lions');
    activateFirst(g, y, 0, (a) => targetsObject(a, bl));
    // The copy of Banishing Light enters: its enters trigger exiles a nonland permanent an opponent controls.
    settle(g, { target: (a) => targetsObject(a, lions) });
    const copies = tokensOf(g, 'banishing-light');
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).nonlegendary).toBe(true);
    expect(g.obj(y).tapped).toBe(true);
    expect(g.zoneOf(lions)).toBe('exile');
  });
  it('copies a Saga: the token enters with a lore counter, so chapter I triggers', () => {
    const g = game({
      p1: {
        battlefield: [
          'yenna-redtooth-regent',
          'the-apprentices-folly',
          'llanowar-elves',
          ...n('plains', 2),
        ],
      },
    });
    const saga = g.id('p1', 'the-apprentices-folly');
    activateFirst(g, g.id('p1', 'yenna-redtooth-regent'), 0, (a) => targetsObject(a, saga));
    settle(g);
    const copy = tokensOf(g, 'the-apprentices-folly')[0]!;
    expect(copy).toBeDefined();
    expect(g.obj(copy).counters?.lore).toBe(1);
    // Chapter I of the copy made a Reflection of the Elves (the only nontoken creature besides Yenna).
    expect(
      g.state.battlefield.filter(
        (id) => g.obj(id).isToken && g.obj(id).defId !== 'the-apprentices-folly',
      ),
    ).toHaveLength(1);
  });
  it('is a sorcery-speed ability', () => {
    const g = yenna();
    toAttackers(g);
    expect(abilityActions(g, g.id('p1', 'yenna-redtooth-regent'), 0)).toHaveLength(0);
  });
  it('an enchantment sharing its name with another permanent you control is not a legal target', () => {
    const g = game({
      p1: {
        battlefield: [
          'yenna-redtooth-regent',
          'banishing-light',
          'banishing-light',
          ...n('plains', 4),
        ],
      },
    });
    expect(abilityActions(g, g.id('p1', 'yenna-redtooth-regent'), 0)).toHaveLength(0);
  });
});

/** Passes through combat to the second main phase of this turn. */
const toMain2 = (g: Game) => {
  for (let i = 0; i < 60 && g.state.turn.step !== 'main2'; i++) {
    const d = g.decision;
    if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.state.turn.step).toBe('main2');
};

describe("Agatha's Soul Cauldron", () => {
  const cauldron = (graveyard: string[], extra: string[] = []) =>
    game({
      p1: {
        battlefield: [
          'agathas-soul-cauldron',
          'llanowar-elves',
          'savannah-lions',
          ...n('island', 6),
          ...extra,
        ],
        graveyard,
      },
    });
  const exileFrom = (g: Game, defId: string, elves = 'llanowar-elves') => {
    const card = g.state.players.p1.graveyard.find((id) => g.obj(id).defId === defId)!;
    activateFirst(g, g.id('p1', 'agathas-soul-cauldron'), 2, (a) => targetsObject(a, card));
    // The reflexive trigger (a +1/+1 counter on target creature you control) picks Llanowar Elves.
    settle(g, { target: (a) => targetsObject(a, g.id('p1', elves)) });
    return card;
  };
  it('{T}: exile target card from a graveyard; a creature card exiled this way puts a +1/+1 counter on a creature you control', () => {
    const g = cauldron(['agatha-of-the-vile-cauldron']);
    const card = exileFrom(g, 'agatha-of-the-vile-cauldron');
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.obj(g.id('p1', 'llanowar-elves')).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', 'agathas-soul-cauldron')).tapped).toBe(true);
  });
  it('a card that is not a creature card is exiled without a counter', () => {
    const g = cauldron(['shock']);
    const card = exileFrom(g, 'shock');
    expect(g.zoneOf(card)).toBe('exile');
    expect(g.obj(g.id('p1', 'llanowar-elves')).plusOneCounters).toBe(0);
  });
  it("can exile a card from an opponent's graveyard", () => {
    const g = game({
      p1: { battlefield: ['agathas-soul-cauldron', 'llanowar-elves'] },
      p2: { graveyard: ['savannah-lions'] },
    });
    const lions = g.state.players.p2.graveyard[0]!;
    activateFirst(g, g.id('p1', 'agathas-soul-cauldron'), 2, (a) => targetsObject(a, lions));
    settle(g);
    expect(g.zoneOf(lions)).toBe('exile');
    expect(g.obj(g.id('p1', 'llanowar-elves')).plusOneCounters).toBe(1);
  });
  it('creatures you control with +1/+1 counters have the activated abilities of the creature cards exiled with it', () => {
    const g = cauldron(['agatha-of-the-vile-cauldron']);
    const elves = g.id('p1', 'llanowar-elves');
    const lions = g.id('p1', 'savannah-lions');
    exileFrom(g, 'agatha-of-the-vile-cauldron');
    // Llanowar Elves (with a counter) has Agatha's {4}{R}{G} ability as its second ability; Savannah Lions (no counter) has none.
    expect(abilityActions(g, elves, 1)).toHaveLength(1);
    expect(abilityActions(g, lions, 1)).toHaveLength(0);
    // Mana of any color pays for abilities of creatures: six Islands pay {4}{R}{G}.
    activateFirst(g, elves, 1);
    settle(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(chars(g, lions).keywords.has('trample')).toBe(true);
    expect(untappedLands(g)).toHaveLength(0);
  });
  it('the abilities are lost with the counter, and only creatures cards exiled with this Cauldron count', () => {
    const g = cauldron(['agatha-of-the-vile-cauldron']);
    const elves = g.id('p1', 'llanowar-elves');
    exileFrom(g, 'agatha-of-the-vile-cauldron');
    expect(abilityActions(g, elves, 1)).toHaveLength(1);
    g.obj(elves).plusOneCounters = 0;
    expect(abilityActions(g, elves, 1)).toHaveLength(0);
  });
  it('spend mana as though it were mana of any color to activate abilities of creatures you control', () => {
    // Agatha's {4}{R}{G} ability with six Islands: only possible with the Cauldron.
    const withC = game({
      p1: {
        battlefield: ['agathas-soul-cauldron', 'agatha-of-the-vile-cauldron', ...n('island', 6)],
      },
    });
    // Agatha is 1/1, so her own ability costs {3}{R}{G}: five Islands pay it.
    expect(abilityActions(withC, withC.id('p1', 'agatha-of-the-vile-cauldron'), 1)).toHaveLength(1);
    const without = game({
      p1: { battlefield: ['agatha-of-the-vile-cauldron', ...n('island', 6)] },
    });
    expect(
      abilityActions(without, without.id('p1', 'agatha-of-the-vile-cauldron'), 1),
    ).toHaveLength(0);
  });
});

describe('Candy Trail', () => {
  it('is a Food Clue: scry 2 when it enters, then {2}, {T}, sacrifice: gain 3 life and draw a card', () => {
    const g = game({ p1: { hand: ['candy-trail'], battlefield: n('plains', 3) } });
    const trail = g.id('p1', 'candy-trail', 'hand');
    expect(chars(g, trail).subtypes).toEqual(expect.arrayContaining(['Food', 'Clue']));
    cast(g, 'candy-trail');
    stop(g);
    expect(g.decision.kind).toBe('scry');
    settle(g);
    const before = g.state.players.p1.hand.length;
    activateFirst(g, g.id('p1', 'candy-trail'), 1);
    settle(g);
    expect(g.life('p1')).toBe(23);
    expect(g.state.players.p1.hand).toHaveLength(before + 1);
    expect(onField(g, 'candy-trail')).toHaveLength(0);
  });
});

describe("Collector's Vault", () => {
  it('{2}, {T}: draw a card, then discard a card; create a Treasure token', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['collectors-vault', 'plains', 'plains'] },
    });
    activateFirst(g, g.id('p1', 'collectors-vault'), 0);
    settle(g);
    // Drew a Forest, discarded the first card the default picks.
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(tokensOf(g, 'treasure-token')).toHaveLength(1);
  });
});

describe("Eriette's Tempting Apple", () => {
  const apple = () =>
    game({
      p1: { hand: ['eriettes-tempting-apple'], battlefield: n('plains', 6) },
      p2: { battlefield: [{ card: 'savannah-lions', tapped: true, sick: true }] },
    });
  it('gains control of target creature until end of turn, untaps it and gives it haste', () => {
    const g = apple();
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'eriettes-tempting-apple');
    settle(g, { target: (a) => targetsObject(a, lions) });
    expect(g.obj(lions).controller).toBe('p1');
    expect(g.obj(lions).tapped).toBe(false);
    expect(chars(g, lions).keywords.has('haste')).toBe(true);
    // Control returns at the end of the turn.
    toStep(g, 'main1', 'p2');
    expect(g.obj(lions).controller).toBe('p2');
  });
  it('{2}, {T}, sacrifice: you gain 3 life, or target opponent loses 3 life', () => {
    const g = apple();
    cast(g, 'eriettes-tempting-apple');
    settle(g);
    const a = g.id('p1', 'eriettes-tempting-apple');
    activateFirst(g, a, 1);
    settle(g);
    expect(g.life('p1')).toBe(23);
    expect(onField(g, 'eriettes-tempting-apple')).toHaveLength(0);
    const h = apple();
    cast(h, 'eriettes-tempting-apple');
    settle(h);
    activateFirst(h, h.id('p1', 'eriettes-tempting-apple'), 2);
    settle(h);
    expect(h.life('p2')).toBe(17);
    expect(onField(h, 'eriettes-tempting-apple')).toHaveLength(0);
  });
  it('is a legendary Food artifact', () => {
    const d = cardDb.get('eriettes-tempting-apple')!;
    expect(d.supertypes).toContain('Legendary');
    expect(d.subtypes).toContain('Food');
  });
});

describe('Gingerbrute', () => {
  it('has haste and is a Food Golem', () => {
    const g = game({ p1: { hand: ['gingerbrute'] } });
    const id = g.id('p1', 'gingerbrute', 'hand');
    expect(chars(g, id).keywords.has('haste')).toBe(true);
    expect(chars(g, id).subtypes).toEqual(expect.arrayContaining(['Food', 'Golem']));
  });
  it('{1}: can’t be blocked this turn except by creatures with haste', () => {
    const g = game({
      p1: { battlefield: ['gingerbrute', 'plains'] },
      p2: { battlefield: ['savannah-lions', 'ash-party-crasher'] },
    });
    const gb = g.id('p1', 'gingerbrute');
    toAttackers(g);
    g.attack(gb);
    activateFirst(g, gb, 0);
    settle(g);
    // Pass to the block declaration.
    let guard = 0;
    while (g.decision.kind !== 'declareBlockers' && guard++ < 10) g.pass();
    const blocks = g.legal().filter((a) => a.type === 'addBlock') as { blocker: string }[];
    expect(blocks.map((b) => g.obj(b.blocker).defId)).toEqual(['ash-party-crasher']);
  });
  it('without the activation it can be blocked normally', () => {
    const g = game({
      p1: { battlefield: ['gingerbrute'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'gingerbrute'));
    let guard = 0;
    while (g.decision.kind !== 'declareBlockers' && guard++ < 10) g.pass();
    expect(g.legal().some((a) => a.type === 'addBlock')).toBe(true);
  });
  it('{2}, {T}, sacrifice: you gain 3 life', () => {
    const g = game({ p1: { battlefield: ['gingerbrute', 'plains', 'plains'] } });
    activateFirst(g, g.id('p1', 'gingerbrute'), 1);
    settle(g);
    expect(g.life('p1')).toBe(23);
    expect(onField(g, 'gingerbrute')).toHaveLength(0);
  });
});

describe("Hylda's Crown of Winter", () => {
  it('{1}, {T}: tap target creature, for {0} during your turn', () => {
    const g = game({
      p1: { battlefield: ['hyldas-crown-of-winter'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    activateFirst(g, g.id('p1', 'hyldas-crown-of-winter'), 0, (a) => targetsObject(a, lions));
    settle(g);
    expect(g.obj(lions).tapped).toBe(true);
  });
  it('costs {1} during the opponent’s turn', () => {
    const mk = (lands: string[]) => {
      const g = game({
        p1: { battlefield: ['hyldas-crown-of-winter', ...lands] },
        p2: { battlefield: ['savannah-lions'] },
        active: 'p2',
      });
      g.state.decision = { kind: 'priority', player: 'p1' };
      return g;
    };
    const none = mk([]);
    expect(abilityActions(none, none.id('p1', 'hyldas-crown-of-winter'), 0)).toHaveLength(0);
    const one = mk(['plains']);
    expect(abilityActions(one, one.id('p1', 'hyldas-crown-of-winter'), 0).length).toBeGreaterThan(
      0,
    );
  });
  it('{3}, sacrifice: draw a card for each tapped creature your opponents control', () => {
    const g = game({
      p1: { battlefield: ['hyldas-crown-of-winter', ...n('plains', 3)] },
      p2: {
        battlefield: [
          { card: 'savannah-lions', tapped: true },
          { card: 'savannah-lions', tapped: true },
          'llanowar-elves',
        ],
      },
    });
    const before = g.state.players.p1.hand.length;
    activateFirst(g, g.id('p1', 'hyldas-crown-of-winter'), 1);
    settle(g);
    expect(g.state.players.p1.hand).toHaveLength(before + 2);
    expect(onField(g, 'hyldas-crown-of-winter')).toHaveLength(0);
  });
});

describe('Prophetic Prism', () => {
  it('draws a card when it enters, and {1}, {T}: adds one mana of any color', () => {
    const g = game({
      p1: { hand: ['prophetic-prism', 'shock'], battlefield: n('plains', 3) },
    });
    cast(g, 'prophetic-prism');
    settle(g);
    expect(g.state.players.p1.hand).toHaveLength(2); // Shock and the drawn Forest
    activateFirst(g, g.id('p1', 'prophetic-prism'), 1);
    // A mana ability: the mana is in the pool at once, no stack.
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.players.p1.pool).toHaveLength(1);
    // Red mana from the Prism pays for Shock (the Plains can't).
    cast(g, 'shock');
    settle(g);
    expect(gy(g)).toContain('shock');
  });
});

describe('Scarecrow Guide', () => {
  it('has reach; {1}: add one mana of any color, once each turn', () => {
    const g = game({
      p1: { battlefield: ['scarecrow-guide', 'plains', 'plains'], hand: ['shock'] },
    });
    expect(chars(g, g.id('p1', 'scarecrow-guide')).keywords.has('reach')).toBe(true);
    const guide = g.id('p1', 'scarecrow-guide');
    expect(abilityActions(g, guide, 0).length).toBeGreaterThan(0);
    activateFirst(g, guide, 0);
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.players.p1.pool).toHaveLength(1);
    // Only once each turn.
    expect(abilityActions(g, guide, 0)).toHaveLength(0);
    cast(g, 'shock');
    settle(g);
    expect(gy(g)).toContain('shock');
  });
  it('can be used again the next turn', () => {
    const g = game({ p1: { battlefield: ['scarecrow-guide', 'plains', 'plains'] } });
    activateFirst(g, g.id('p1', 'scarecrow-guide'), 0);
    toStep(g, 'main1', 'p1');
    expect(abilityActions(g, g.id('p1', 'scarecrow-guide'), 0).length).toBeGreaterThan(0);
  });
});

describe('Syr Ginger, the Meal Ender', () => {
  const walker = [...cardDb.values()].find(
    (d) => d.types.includes('Planeswalker') && !d.isToken,
  )!.id;
  const kw = (g: Game, id: string) => [...chars(g, id).keywords].sort();
  it('has trample, hexproof and haste as long as an opponent controls a planeswalker', () => {
    const g = game({ p1: { battlefield: ['syr-ginger-the-meal-ender'] } });
    const id = g.id('p1', 'syr-ginger-the-meal-ender');
    expect(kw(g, id)).toEqual([]);
    const h = game({
      p1: { battlefield: ['syr-ginger-the-meal-ender'] },
      p2: { battlefield: [{ card: walker, loyalty: 3 }] },
    });
    expect(kw(h, h.id('p1', 'syr-ginger-the-meal-ender'))).toEqual([
      'haste',
      'hexproof',
      'trample',
    ]);
    // Its own planeswalker doesn't count.
    const own = game({
      p1: { battlefield: ['syr-ginger-the-meal-ender', { card: walker, loyalty: 3 }] },
    });
    expect(kw(own, own.id('p1', 'syr-ginger-the-meal-ender'))).toEqual([]);
  });
  it('another artifact you control going to a graveyard: a +1/+1 counter and scry 1', () => {
    const g = game({
      p1: { battlefield: ['syr-ginger-the-meal-ender', 'candy-trail', ...n('plains', 2)] },
    });
    const ginger = g.id('p1', 'syr-ginger-the-meal-ender');
    activateFirst(g, g.id('p1', 'candy-trail'), 1);
    settle(g);
    expect(g.obj(ginger).plusOneCounters).toBe(1);
    expect(pt(g, ginger)).toEqual([4, 2]);
  });
  it('{2}, {T}, sacrifice: you gain life equal to its power', () => {
    const g = game({
      p1: { battlefield: ['syr-ginger-the-meal-ender', ...n('plains', 2)] },
    });
    const ginger = g.id('p1', 'syr-ginger-the-meal-ender');
    g.obj(ginger).plusOneCounters = 2;
    activateFirst(g, ginger, 2);
    settle(g);
    expect(g.life('p1')).toBe(25);
    expect(onField(g, 'syr-ginger-the-meal-ender')).toHaveLength(0);
  });
  it("its own death does not trigger the counter ability, and an opponent's artifacts do not", () => {
    const g = game({
      p1: { battlefield: ['syr-ginger-the-meal-ender'] },
      p2: { battlefield: ['candy-trail', ...n('plains', 2)] },
    });
    const ginger = g.id('p1', 'syr-ginger-the-meal-ender');
    g.state.decision = { kind: 'priority', player: 'p2' };
    activateFirst(g, g.id('p2', 'candy-trail'), 1);
    settle(g);
    expect(g.obj(ginger).plusOneCounters).toBe(0);
  });
});

describe('Crystal Grotto', () => {
  it('scry 1 when it enters, {T}: add {C}, {1}, {T}: add one mana of any color', () => {
    const g = game({ p1: { hand: ['crystal-grotto'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    settle(g);
    const grotto = g.id('p1', 'crystal-grotto');
    expect(g.obj(grotto).tapped).toBe(false);
    expect(chars(g, grotto).types).toContain('Land');
  });
  it('{1}, {T}: any color mana pays for a coloured spell', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['crystal-grotto', 'plains'] } });
    activateFirst(g, g.id('p1', 'crystal-grotto'), 2);
    expect(g.state.stack).toHaveLength(0);
    cast(g, 'shock');
    settle(g);
    expect(gy(g)).toContain('shock');
  });
});

describe('Edgewall Inn', () => {
  it('enters tapped, as it enters you choose a color, and it taps for mana of the chosen color', () => {
    const g = game({ p1: { hand: ['edgewall-inn', 'shock'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    stop(g);
    expect(labels(g)).toEqual(['White', 'Blue', 'Black', 'Red', 'Green']);
    choose(g, /Red/);
    settle(g);
    const inn = g.id('p1', 'edgewall-inn');
    expect(g.obj(inn).tapped).toBe(true);
    expect(g.obj(inn).chosenColor).toBe('R');
  });
  it('{T}: Add one mana of the chosen color', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['edgewall-inn'] } });
    const inn = g.id('p1', 'edgewall-inn');
    g.obj(inn).chosenColor = 'R';
    cast(g, 'shock');
    settle(g);
    expect(gy(g)).toContain('shock');
    // Another color: not castable.
    const h = game({ p1: { hand: ['shock'], battlefield: ['edgewall-inn'] } });
    h.obj(h.id('p1', 'edgewall-inn')).chosenColor = 'U';
    expect(casts(h, 'shock')).toHaveLength(0);
  });
  it('{3}, {T}, sacrifice: return target card that has an Adventure from your graveyard to your hand', () => {
    const g = game({
      p1: {
        battlefield: ['edgewall-inn', ...n('plains', 3)],
        graveyard: ['shock', 'frolicking-familiar'],
      },
    });
    const inn = g.id('p1', 'edgewall-inn');
    // Only the Adventure card is a legal target.
    const acts = abilityActions(g, inn, 6);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    settle(g);
    expect(hand(g)).toEqual(['frolicking-familiar']);
    expect(gy(g).sort()).toEqual(['edgewall-inn', 'shock']);
    expect(onField(g, 'edgewall-inn')).toHaveLength(0);
  });
});

describe('Restless Bivouac', () => {
  it('enters tapped, taps for {R} or {W}', () => {
    const g = game({ p1: { hand: ['restless-bivouac'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    expect(g.obj(g.id('p1', 'restless-bivouac')).tapped).toBe(true);
    const d = cardDb.get('restless-bivouac')!;
    expect(
      d.abilities.filter((a) => a.kind === 'mana').map((a) => (a as { produces: string }).produces),
    ).toEqual(['R', 'W']);
  });
  it('{1}{R}{W}: becomes a 2/2 red and white Ox until end of turn; attacks: a +1/+1 counter on target creature you control', () => {
    const g = game({
      p1: { battlefield: ['restless-bivouac', 'mountain', 'plains', 'forest', 'llanowar-elves'] },
    });
    const land = g.id('p1', 'restless-bivouac');
    const elves = g.id('p1', 'llanowar-elves');
    expect(chars(g, land).types).not.toContain('Creature');
    activateFirst(g, land, 2);
    settle(g);
    expect(chars(g, land).types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(chars(g, land).subtypes).toContain('Ox');
    expect(pt(g, land)).toEqual([2, 2]);
    expect([...getColors(g.state, cardDb, land)].sort()).toEqual(['R', 'W']);
    toAttackers(g);
    g.attack(land);
    settle(g, { target: (a) => targetsObject(a, elves) });
    expect(g.obj(elves).plusOneCounters).toBe(1);
    // Until end of turn: no longer a creature next turn.
    toStep(g, 'main1', 'p1');
    expect(chars(g, land).types).not.toContain('Creature');
    // The counter on a land that stays a land is still there for a creature target; the Elves keep it.
    expect(g.obj(elves).plusOneCounters).toBe(1);
  });
});

describe('Restless Fortress', () => {
  it('{2}{W}{B}: a 1/4 white and black Nightmare; attacks: defending player loses 2 life and you gain 2 life', () => {
    const g = game({
      p1: { battlefield: ['restless-fortress', 'plains', 'swamp', 'plains', 'swamp'] },
    });
    const land = g.id('p1', 'restless-fortress');
    activateFirst(g, land, 2);
    settle(g);
    expect(pt(g, land)).toEqual([1, 4]);
    expect(chars(g, land).subtypes).toContain('Nightmare');
    expect([...getColors(g.state, cardDb, land)].sort()).toEqual(['B', 'W']);
    toAttackers(g);
    g.attack(land);
    settle(g);
    toMain2(g);
    // 2 from the trigger, 1 combat damage.
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Restless Spire', () => {
  it('{U}{R}: a 2/1 blue and red Elemental with first strike during your turn; attacks: scry 1', () => {
    const g = game({ p1: { battlefield: ['restless-spire', 'island', 'mountain'] } });
    const land = g.id('p1', 'restless-spire');
    activateFirst(g, land, 2);
    settle(g);
    expect(pt(g, land)).toEqual([2, 1]);
    expect(chars(g, land).subtypes).toContain('Elemental');
    expect([...getColors(g.state, cardDb, land)].sort()).toEqual(['R', 'U']);
    expect(chars(g, land).keywords.has('firstStrike')).toBe(true);
    toAttackers(g);
    g.attack(land);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    settle(g);
    toMain2(g);
    expect(g.life('p2')).toBe(18);
  });
  it('has no first strike during the opponent’s turn', () => {
    const g = game({
      p1: { battlefield: ['restless-spire', 'island', 'mountain'] },
      active: 'p2',
    });
    g.state.decision = { kind: 'priority', player: 'p1' };
    const land = g.id('p1', 'restless-spire');
    activateFirst(g, land, 2);
    settle(g);
    expect(chars(g, land).types).toContain('Creature');
    expect(chars(g, land).keywords.has('firstStrike')).toBe(false);
  });
});

describe('Restless Vinestalk', () => {
  const vine = () =>
    game({
      p1: { battlefield: ['restless-vinestalk', ...n('forest', 3), ...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
  it('{3}{G}{U}: a 5/5 green and blue Plant with trample; attacks: up to one other creature has base power and toughness 3/3', () => {
    const g = vine();
    const land = g.id('p1', 'restless-vinestalk');
    const angel = g.id('p2', 'serra-angel');
    activateFirst(g, land, 2);
    settle(g);
    expect(pt(g, land)).toEqual([5, 5]);
    expect(chars(g, land).keywords.has('trample')).toBe(true);
    expect(chars(g, land).subtypes).toContain('Plant');
    expect([...getColors(g.state, cardDb, land)].sort()).toEqual(['G', 'U']);
    toAttackers(g);
    g.attack(land);
    settle(g, { target: (a) => targetsObject(a, angel) });
    expect(pt(g, angel)).toEqual([3, 3]);
    // Not the animated land itself: "other".
    expect(pt(g, land)).toEqual([5, 5]);
  });
  it('the target is optional', () => {
    const g = vine();
    const land = g.id('p1', 'restless-vinestalk');
    activateFirst(g, land, 2);
    settle(g);
    toAttackers(g);
    g.attack(land);
    stop(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(
      (g.legal().filter((a) => a.type === 'chooseTargets') as { targets: unknown[] }[]).some(
        (a) => a.targets.length === 0,
      ),
    ).toBe(true);
    const none = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!;
    g.do(none);
    settle(g);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('the Sphere lands', () => {
  const SPHERES: [string, string, string][] = [
    ['the-autonomous-furnace', 'R', 'mountain'],
    ['the-dross-pits', 'B', 'swamp'],
    ['the-fair-basilica', 'W', 'plains'],
    ['the-hunter-maze', 'G', 'forest'],
    ['the-surgical-bay', 'U', 'island'],
  ];
  for (const [id, color, basic] of SPHERES) {
    it(`${id}: enters tapped, {T}: Add {${color}}, {1}{${color}}, {T}, sacrifice: draw a card`, () => {
      const g = game({ p1: { hand: [id] } });
      expect(cardDb.get(id)!.subtypes).toContain('Sphere');
      g.do(g.legal().find((a) => a.type === 'playLand')!);
      expect(g.obj(g.id('p1', id)).tapped).toBe(true);
      const h = game({ p1: { battlefield: [id, basic, basic] } });
      const land = h.id('p1', id);
      const before = h.state.players.p1.hand.length;
      activateFirst(h, land, 1);
      settle(h);
      expect(h.state.players.p1.hand).toHaveLength(before + 1);
      expect(onField(h, id)).toHaveLength(0);
      // It taps for its color.
      const m = cardDb.get(id)!.abilities.find((a) => a.kind === 'mana') as { produces: string };
      expect(m.produces).toBe(color);
    });
  }
});

describe('random games with the groups', () => {
  it('play to completion (every legal action offered is accepted)', () => {
    const cards = [...MULTI, ...COLORLESS, ...LANDS].map(idOf);
    const basics = ['plains', 'island', 'swamp', 'mountain', 'forest'];
    const deck = (offset: number): string[] => {
      const rot = [...cards.slice(offset), ...cards.slice(0, offset)];
      return [...rot, ...rot.slice(0, 12), ...basics.flatMap((b) => n(b, 5))].slice(0, 60);
    };
    for (let seed = 1; seed <= 16; seed++) {
      const decks = { p1: deck(seed % cards.length), p2: deck((seed * 7) % cards.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 240_000);
});
