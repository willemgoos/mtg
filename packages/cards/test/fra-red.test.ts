import { describe, expect, it } from 'vitest';
import { getCharacteristics, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { FRA_CADET } from '../src/fra/tokens.ts';

// Reality Fracture 17a: the red cards.

const DRAGON = 'fra-dragon-token';
const THOPTER = 'fra-thopter-token';

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
}

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

/** Resolves the stack; a trigger's target is `pick` (default: the first legal one). */
const settleAt = (g: GameDriver, pick: (a: Action) => boolean) =>
  settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && pick(a)));
const player = (p: 'p1' | 'p2') => (a: Action) =>
  a.type === 'chooseTargets' &&
  a.targets.length === 1 &&
  'player' in a.targets[0]! &&
  a.targets[0].player === p;

const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets });
  return g;
};

const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

/** Passes priority until the active player must declare attackers. */
function toAttackers(g: GameDriver): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
}

/** Passes priority until it is `step` of `who`'s turn (after the turn we're in). */
function passTo(g: GameDriver, step: string, who: 'p1' | 'p2' = 'p1'): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 200; i++) {
    const t = g.state.turn;
    if (t.number > start && t.step === step && t.activePlayer === who) return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority to the end step of this turn. */
function toEndStep(g: GameDriver): void {
  for (let i = 0; i < 40 && g.state.turn.step !== 'end'; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.state.turn.step).toBe('end');
}

const tokens = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === defId && g.obj(id).controller === p && g.obj(id).isToken,
  );

/** After the attackers are confirmed: passes priority until the defending player must declare blockers. */
function toBlockers(g: GameDriver): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareBlockers');
}

/** Passes priority until the stack is empty and combat damage has been dealt. */
function toEndOfCombat(g: GameDriver): void {
  for (
    let i = 0;
    i < 20 && g.state.turn.step !== 'endCombat' && g.state.turn.step !== 'main2';
    i++
  ) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
}

describe('Ajani’s Anguish', () => {
  it('deals X damage to any target when it enters, and gives your creatures trample', () => {
    const g = game({
      p1: { hand: ['ajanis-anguish'], battlefield: [...n('mountain', 4), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'ajanis-anguish', [], { x: 3 });
    settleAt(g, player('p2'));
    expect(g.life('p2')).toBe(17);
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('trample');
    expect(keywords(g, g.id('p2', 'serra-angel'))).not.toContain('trample');
  });

  it('with X = 2 can kill a creature', () => {
    const g = game({
      p1: { hand: ['ajanis-anguish'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['hungry-ghoul'] },
    });
    cast(g, 'ajanis-anguish', [], { x: 2 });
    settleAt(g, (a) => a.type === 'chooseTargets' && 'object' in a.targets[0]!);
    expect(g.zoneOf(g.state.players.p2.graveyard[0]!)).toBe('graveyard');
    expect(gy(g, 'p2')).toEqual(['hungry-ghoul']);
  });
});

describe('Arni, Renowned Champion', () => {
  it('gets +X/+0 for the power of another creature entering under your control', () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'savannah-lions'],
        battlefield: ['arni-renowned-champion', ...n('plains', 6)],
      },
    });
    const arni = g.id('p1', 'arni-renowned-champion');
    expect(keywords(g, arni)).toContain('trample');
    expect(pt(g, arni)).toEqual([1, 5]);
    done(cast(g, 'serra-angel'));
    expect(pt(g, arni)).toEqual([5, 5]);
    done(cast(g, 'savannah-lions'));
    expect(pt(g, arni)).toEqual([7, 5]);
  });

  it('does not trigger for a creature an opponent controls', () => {
    const g = game({
      p1: { battlefield: ['arni-renowned-champion'] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    done(cast(g, 'savannah-lions'));
    expect(pt(g, g.id('p1', 'arni-renowned-champion'))).toEqual([1, 5]);
  });
});

describe('Artifist Acumen', () => {
  it('gives your creatures first strike until end of turn and draws a card', () => {
    const g = game({
      p1: {
        hand: ['artifist-acumen'],
        battlefield: ['mountain', 'savannah-lions', 'hungry-ghoul'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'artifist-acumen'));
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('firstStrike');
    expect(keywords(g, g.id('p1', 'hungry-ghoul'))).toContain('firstStrike');
    expect(keywords(g, g.id('p2', 'serra-angel'))).not.toContain('firstStrike');
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Awaken the Inferno', () => {
  it('deals 6 damage to an opponent’s creature and puts a +1/+1 counter on up to one of yours', () => {
    const g = game({
      p1: { hand: ['awaken-the-inferno'], battlefield: [...n('mountain', 5), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    done(
      cast(g, 'awaken-the-inferno', [
        g.ref(g.id('p2', 'serra-angel')),
        g.ref(g.id('p1', 'savannah-lions')),
      ]),
    );
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(1);
  });

  it('works without the second target, and can hit a planeswalker', () => {
    const g = game({
      p1: { hand: ['awaken-the-inferno'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['liliana-dreadhorde-general'] },
    });
    const lili = g.id('p2', 'liliana-dreadhorde-general');
    g.obj(lili).counters = { loyalty: 6 };
    done(cast(g, 'awaken-the-inferno', [g.ref(lili)]));
    expect(gy(g, 'p2')).toContain('liliana-dreadhorde-general');
  });

  it('can’t target your own creature as the first target', () => {
    const g = game({
      p1: { hand: ['awaken-the-inferno'], battlefield: [...n('mountain', 5), 'savannah-lions'] },
    });
    expect(() => cast(g, 'awaken-the-inferno', [g.ref(g.id('p1', 'savannah-lions'))])).toThrow();
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: {
        hand: ['awaken-the-inferno'],
        battlefield: n('mountain', 2),
        library: ['shock', 'forest', 'plains'],
      },
    });
    activate(g, g.id('p1', 'awaken-the-inferno', 'hand'), 0);
    done(g);
    expect(gy(g)).toEqual(['awaken-the-inferno']);
    expect(hand(g)).toHaveLength(1);
    expect(['forest', 'plains']).toContain(hand(g)[0]);
  });
});

describe('Chandra’s Emberling', () => {
  it('has haste and grows when you cast a noncreature spell, not a creature spell', () => {
    const g = game({
      p1: {
        hand: ['shock', 'goblin-smuggler'],
        battlefield: ['chandras-emberling', ...n('mountain', 4)],
      },
    });
    const e = g.id('p1', 'chandras-emberling');
    expect(keywords(g, e)).toContain('haste');
    done(cast(g, 'goblin-smuggler'));
    expect(counters(g, e)).toBe(0);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(counters(g, e)).toBe(1);
    expect(pt(g, e)).toEqual([3, 3]);
  });
});

describe('Command the Stage', () => {
  it('creates a Cadet, then puts a +1/+1 counter on each other Wizard token you control', () => {
    const g = game({
      p1: {
        hand: ['command-the-stage'],
        battlefield: [...n('mountain', 3), FRA_CADET, 'tomik-izzet-sparkmage'],
      },
      p2: { battlefield: [FRA_CADET] },
    });
    const old = g.id('p1', FRA_CADET);
    g.obj(old).isToken = true;
    g.obj(g.id('p2', FRA_CADET)).isToken = true;
    done(cast(g, 'command-the-stage'));
    const cadets = tokens(g, FRA_CADET);
    expect(cadets).toHaveLength(2);
    expect(counters(g, old)).toBe(1);
    const fresh = cadets.find((id) => id !== old)!;
    expect(counters(g, fresh)).toBe(0);
    // A Wizard that isn't a token, and the opponent's token, get nothing.
    expect(counters(g, g.id('p1', 'tomik-izzet-sparkmage'))).toBe(0);
    expect(counters(g, g.id('p2', FRA_CADET))).toBe(0);
  });

  it('returns to your hand at an upkeep if an opponent was dealt noncombat damage last turn', () => {
    const g = game({
      p1: { hand: ['shock'], graveyard: ['command-the-stage'], battlefield: ['mountain'] },
    });
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.state.turn.noncombatDamaged).toEqual(['p2']);
    // The next upkeep is the opponent's: "each upkeep".
    passTo(g, 'upkeep', 'p2');
    done(g);
    expect(hand(g)).toContain('command-the-stage');
    expect(gy(g)).not.toContain('command-the-stage');
  });

  it('stays in the graveyard if no opponent was dealt noncombat damage', () => {
    const g = game({ p1: { graveyard: ['command-the-stage'] } });
    passTo(g, 'upkeep', 'p2');
    done(g);
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(gy(g)).toContain('command-the-stage');
    expect(hand(g)).not.toContain('command-the-stage');
  });

  it('doesn’t count damage you dealt to yourself', () => {
    const g = game({
      p1: { hand: ['shock'], graveyard: ['command-the-stage'], battlefield: ['mountain'] },
    });
    done(cast(g, 'shock', [{ player: 'p1' }]));
    expect(g.life('p1')).toBe(18);
    passTo(g, 'upkeep', 'p2');
    done(g);
    expect(gy(g)).toContain('command-the-stage');
  });

  it('only looks back one turn', () => {
    const g = game({
      p1: { hand: ['shock', 'command-the-stage'], battlefield: ['mountain'] },
    });
    done(cast(g, 'shock', [{ player: 'p2' }]));
    passTo(g, 'upkeep', 'p2');
    done(g);
    // It lands in the graveyard after that upkeep; the damage was two turns ago by the next one.
    const card = g.id('p1', 'command-the-stage', 'hand');
    g.state.players.p1.hand = g.state.players.p1.hand.filter((id) => id !== card);
    g.state.players.p1.graveyard.push(card);
    g.obj(card).zone = 'graveyard';
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(gy(g)).toContain('command-the-stage');
  });

  it('returns at your own upkeep too', () => {
    const g = game({
      p1: { hand: ['shock'], graveyard: ['command-the-stage'], battlefield: ['mountain'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    // Opponent damages... no: damage during p2's turn by p1 isn't possible; use the state flag instead.
    passTo(g, 'upkeep', 'p2');
    done(g);
    g.state.turn.noncombatDamaged = ['p2'];
    passTo(g, 'upkeep', 'p1');
    done(g);
    expect(hand(g)).toContain('command-the-stage');
  });
});

describe('Craterclaw Colossus', () => {
  it('gives your creatures trample and +X/+0 for the artifacts you control', () => {
    const g = game({
      p1: {
        hand: ['craterclaw-colossus'],
        battlefield: [...n('mountain', 7), 'treasure-token', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const c = cast(g, 'craterclaw-colossus');
    done(c);
    const colossus = g.id('p1', 'craterclaw-colossus');
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, colossus)).toContain('haste');
    // Two artifacts: the Treasure and the Colossus itself.
    expect(pt(g, colossus)).toEqual([7, 5]);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(keywords(g, lions)).toContain('trample');
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
    expect(keywords(g, g.id('p2', 'serra-angel'))).not.toContain('trample');
  });
});

describe('Curse-Marred Demon', () => {
  it('searches for a card, then discards a card at random', () => {
    const g = game({
      p1: {
        hand: ['curse-marred-demon', 'shock'],
        battlefield: n('mountain', 4),
        library: ['serra-angel', 'forest', 'forest'],
      },
    });
    done(cast(g, 'curse-marred-demon'));
    expect(keywords(g, g.id('p1', 'curse-marred-demon'))).toEqual(
      expect.arrayContaining(['flying', 'trample']),
    );
    // Shock and the found card: one of them was discarded at random.
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
    expect(['shock', 'serra-angel', 'forest'].sort()).toEqual(
      expect.arrayContaining([...hand(g), ...gy(g)].sort()),
    );
  });

  it('discards the card it found if it is the only one in hand', () => {
    const g = game({
      p1: { hand: ['curse-marred-demon'], battlefield: n('mountain', 4), library: ['serra-angel'] },
    });
    done(cast(g, 'curse-marred-demon'));
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toEqual(['serra-angel']);
  });
});

describe('Draconic Visitor', () => {
  it('turns artifact tokens you would create into 5/5 Dragons, that many', () => {
    const g = game({
      p1: { hand: ['brasss-bounty'], battlefield: ['draconic-visitor', ...n('mountain', 7)] },
    });
    done(cast(g, 'brasss-bounty'));
    expect(tokens(g, 'treasure-token')).toHaveLength(0);
    // One for each land you control.
    const dragons = tokens(g, DRAGON);
    expect(dragons).toHaveLength(7);
    expect(pt(g, dragons[0]!)).toEqual([5, 5]);
  });

  it('doesn’t change creature tokens that aren’t artifacts, or an opponent’s tokens', () => {
    const g = game({
      p1: { hand: ['heartstring-puller'], battlefield: ['draconic-visitor', ...n('mountain', 4)] },
      p2: { hand: ['pia-determined-rebuilder'], battlefield: n('mountain', 3) },
    });
    done(cast(g, 'heartstring-puller'));
    expect(tokens(g, FRA_CADET)).toHaveLength(1);
    expect(tokens(g, DRAGON)).toHaveLength(0);
    // Pass to the opponent's turn and cast Pia: her Thopter is theirs, so it stays a Thopter.
    passTo(g, 'main1', 'p2');
    done(cast(g, 'pia-determined-rebuilder'));
    expect(tokens(g, THOPTER, 'p2')).toHaveLength(1);
  });

  it('turns an artifact creature token such as a Thopter into a Dragon', () => {
    const g = game({
      p1: {
        hand: ['pia-determined-rebuilder'],
        battlefield: ['draconic-visitor', ...n('mountain', 3)],
      },
    });
    done(cast(g, 'pia-determined-rebuilder'));
    expect(tokens(g, THOPTER)).toHaveLength(0);
    expect(tokens(g, DRAGON)).toHaveLength(1);
  });
});

describe('Draconic Visitor and Face Yourself', () => {
  it('a token copy of an artifact creature is an artifact token, so it becomes a Dragon', () => {
    const g = game({
      p1: { hand: ['face-yourself'], battlefield: ['draconic-visitor', ...n('mountain', 7)] },
      p2: { battlefield: [THOPTER, 'savannah-lions'] },
    });
    g.obj(g.id('p2', THOPTER)).isToken = true;
    done(cast(g, 'face-yourself', [{ player: 'p2' }]));
    expect(tokens(g, DRAGON)).toHaveLength(1);
    expect(tokens(g, THOPTER, 'p1')).toHaveLength(0);
    // The nonartifact creature is copied as usual.
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(1);
  });
});

describe('Eardrum Rattler', () => {
  it('makes another creature with power 2 or less unblockable', () => {
    const g = game({
      p1: { battlefield: ['eardrum-rattler', 'savannah-lions', 'serra-angel', 'mountain'] },
      p2: { battlefield: ['hungry-ghoul'] },
    });
    const rattler = g.id('p1', 'eardrum-rattler');
    const lions = g.id('p1', 'savannah-lions');
    // Power 4 and the Rattler itself are not legal targets.
    expect(() => activate(g, rattler, 0, [g.ref(g.id('p1', 'serra-angel'))])).toThrow();
    expect(() => activate(g, rattler, 0, [g.ref(rattler)])).toThrow();
    activate(g, rattler, 0, [g.ref(lions)]);
    done(g);
    toAttackers(g);
    g.attack(lions);
    // The Ghoul can't block it: the defending player is never asked to declare blockers.
    for (let i = 0; i < 12 && g.state.turn.step !== 'main2'; i++) {
      expect(g.decision.kind).not.toBe('declareBlockers');
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.life('p2')).toBe(18);
  });

  it('without it the same attacker can be blocked', () => {
    const g = game({
      p1: { battlefield: ['eardrum-rattler', 'savannah-lions'] },
      p2: { battlefield: ['hungry-ghoul'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'));
    toBlockers(g);
    expect(g.legal().filter((a) => a.type === 'addBlock')).toHaveLength(1);
  });
});

describe('Essence Burn', () => {
  it('deals 5 damage to a black creature and exiles it instead of dying', () => {
    const g = game({
      p1: { hand: ['essence-burn'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['hungry-ghoul'] },
    });
    const ghoul = g.id('p2', 'hungry-ghoul');
    done(cast(g, 'essence-burn', [g.ref(ghoul)]));
    expect(g.zoneOf(ghoul)).toBe('exile');
    expect(gy(g, 'p2')).toEqual([]);
  });

  it('can hit a green creature, but not a white one', () => {
    const g = game({
      p1: { hand: ['essence-burn', 'essence-burn'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    expect(() => cast(g, 'essence-burn', [g.ref(g.id('p2', 'serra-angel'))])).toThrow();
    const cub = g.id('p2', 'bear-cub');
    done(cast(g, 'essence-burn', [g.ref(cub)]));
    expect(g.zoneOf(cub)).toBe('exile');
  });

  it('hits a black or green planeswalker and exiles it if it would die', () => {
    const g = game({
      p1: { hand: ['essence-burn'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['liliana-dreadhorde-general'] },
    });
    const lili = g.id('p2', 'liliana-dreadhorde-general');
    g.obj(lili).counters = { loyalty: 4 };
    done(cast(g, 'essence-burn', [g.ref(lili)]));
    expect(g.zoneOf(lili)).toBe('exile');
  });

  it('a creature that survives is not exiled later this turn when it would die', () => {
    const g = game({
      p1: { hand: ['essence-burn'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['maalfeld-twins'] },
    });
    const twins = g.id('p2', 'maalfeld-twins');
    done(cast(g, 'essence-burn', [g.ref(twins)]));
    // 5 damage on a 4/4 kills it: exiled.
    expect(g.zoneOf(twins)).toBe('exile');
  });
});

describe('Face Yourself', () => {
  it('creates a hasty token copy of each creature target player controls, sacrificed at the end step', () => {
    const g = game({
      p1: { hand: ['face-yourself'], battlefield: n('mountain', 7) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    done(cast(g, 'face-yourself', [{ player: 'p2' }]));
    const angels = tokens(g, 'serra-angel', 'p1');
    const lions = tokens(g, 'savannah-lions', 'p1');
    expect(angels).toHaveLength(1);
    expect(lions).toHaveLength(1);
    expect(g.obj(angels[0]!).isToken).toBe(true);
    expect(keywords(g, angels[0]!)).toEqual(
      expect.arrayContaining(['flying', 'vigilance', 'haste']),
    );
    // The original creatures stay with the opponent.
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(2);
    toEndStep(g);
    done(g);
    expect(tokens(g, 'serra-angel', 'p1')).toHaveLength(0);
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(1);
  });

  it('can target yourself, and the copies stay while you control a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['face-yourself'],
        battlefield: [...n('mountain', 7), 'savannah-lions', 'vivien-reid'],
      },
    });
    g.obj(g.id('p1', 'vivien-reid')).counters = { loyalty: 5 };
    done(cast(g, 'face-yourself', [{ player: 'p1' }]));
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(all(g, 'savannah-lions')).toHaveLength(2);
    toEndStep(g);
    done(g);
    // You control a planeswalker as the end step begins: nothing is sacrificed.
    expect(all(g, 'savannah-lions')).toHaveLength(2);
  });

  it('the copies are sacrificed at a later end step once the planeswalker is gone', () => {
    const g = game({
      p1: {
        hand: ['face-yourself'],
        battlefield: [...n('mountain', 7), 'vivien-reid'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const viv = g.id('p1', 'vivien-reid');
    g.obj(viv).counters = { loyalty: 5 };
    done(cast(g, 'face-yourself', [{ player: 'p2' }]));
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(1);
    toEndStep(g);
    done(g);
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(1);
    // The planeswalker dies; at the next end step the copy is sacrificed.
    g.obj(viv).counters = { loyalty: 0 };
    passTo(g, 'end', 'p2');
    done(g);
    expect(tokens(g, 'savannah-lions', 'p1')).toHaveLength(0);
  });
});

describe('Fulminous Forte', () => {
  it('mode 1: 1 damage to each creature and planeswalker your opponents control', () => {
    const g = game({
      p1: { hand: ['fulminous-forte'], battlefield: [...n('mountain', 3), 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel', 'liliana-dreadhorde-general'] },
    });
    const lili = g.id('p2', 'liliana-dreadhorde-general');
    g.obj(lili).counters = { loyalty: 6 };
    done(cast(g, 'fulminous-forte', [], { mode: 0 }));
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(1);
    expect(g.obj(lili).counters?.loyalty).toBe(5);
    // Your own creatures aren't hurt.
    expect(g.obj(g.id('p1', 'savannah-lions')).damage).toBe(0);
  });

  it('mode 2: 5 damage to target creature or planeswalker', () => {
    const g = game({
      p1: { hand: ['fulminous-forte', 'fulminous-forte'], battlefield: n('mountain', 6) },
      p2: { battlefield: ['serra-angel', 'liliana-dreadhorde-general'] },
    });
    const lili = g.id('p2', 'liliana-dreadhorde-general');
    g.obj(lili).counters = { loyalty: 6 };
    done(cast(g, 'fulminous-forte', [g.ref(g.id('p2', 'serra-angel'))], { mode: 1 }));
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    done(cast(g, 'fulminous-forte', [g.ref(lili)], { mode: 1 }));
    expect(g.obj(lili).counters?.loyalty).toBe(1);
  });
});

describe('Gallia, the Merrymaker', () => {
  it('gives haste to your other creatures with a +1/+1 counter', () => {
    const g = game({
      p1: {
        battlefield: [
          'gallia-the-merrymaker',
          { card: 'savannah-lions', sick: true },
          { card: 'hungry-ghoul', sick: true },
        ],
      },
    });
    expect(keywords(g, g.id('p1', 'gallia-the-merrymaker'))).toContain('haste');
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, lions)).not.toContain('haste');
    g.obj(lions).plusOneCounters = 1;
    expect(keywords(g, lions)).toContain('haste');
    expect(keywords(g, g.id('p1', 'hungry-ghoul'))).not.toContain('haste');
  });

  it('puts a +1/+1 counter on a creature that entered this turn', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['gallia-the-merrymaker', 'hungry-ghoul', 'plains', 'mountain', 'mountain'],
      },
    });
    done(cast(g, 'savannah-lions'));
    const lions = g.id('p1', 'savannah-lions');
    const ghoul = g.id('p1', 'hungry-ghoul');
    // A creature that has been here a while is not a legal target.
    expect(() => activate(g, g.id('p1', 'gallia-the-merrymaker'), 1, [g.ref(ghoul)])).toThrow();
    activate(g, g.id('p1', 'gallia-the-merrymaker'), 1, [g.ref(lions)]);
    done(g);
    expect(counters(g, lions)).toBe(1);
    expect(g.obj(g.id('p1', 'gallia-the-merrymaker')).tapped).toBe(true);
  });
});

describe('Hallway Heckler', () => {
  it('enters prepared; Vicious Verse deals 1 damage to target opponent', () => {
    const g = game({ p1: { hand: ['hallway-heckler'], battlefield: n('mountain', 4) } });
    done(cast(g, 'hallway-heckler'));
    const h = g.id('p1', 'hallway-heckler');
    expect(g.obj(h).prepared).toBeDefined();
    castCopy(g, h, [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(h).prepared).toBeUndefined();
  });

  it('{T}, discard a card: draw a card', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['hallway-heckler'], library: ['serra-angel', 'forest'] },
    });
    const h = g.id('p1', 'hallway-heckler');
    activate(g, h, 0, [], { discard: g.id('p1', 'shock', 'hand') });
    done(g);
    expect(hand(g)).toEqual(['serra-angel']);
    expect(gy(g)).toEqual(['shock']);
    expect(g.obj(h).tapped).toBe(true);
  });
});

describe('Heartstring Puller', () => {
  it('has trample and creates a Cadet', () => {
    const g = game({ p1: { hand: ['heartstring-puller'], battlefield: n('mountain', 4) } });
    done(cast(g, 'heartstring-puller'));
    expect(keywords(g, g.id('p1', 'heartstring-puller'))).toContain('trample');
    const cadet = tokens(g, FRA_CADET);
    expect(cadet).toHaveLength(1);
    expect(pt(g, cadet[0]!)).toEqual([2, 2]);
    expect(g.obj(cadet[0]!).isToken).toBe(true);
  });
});

describe('Identity Echo', () => {
  it('exiles a creature you control, then reveals until a creature or planeswalker and puts it onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ['identity-echo'],
        battlefield: [...n('mountain', 7), 'savannah-lions'],
        library: ['forest', 'shock', 'serra-angel', 'mountain', 'forest'],
      },
    });
    done(cast(g, 'identity-echo'));
    const echo = g.id('p1', 'identity-echo');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, echo, 0, [g.ref(lions)]);
    done(g);
    expect(g.zoneOf(lions)).toBe('exile');
    const angel = g.id('p1', 'serra-angel');
    expect(g.obj(angel).tapped).toBe(false);
    // The revealed forest and shock went to the bottom; the rest is still on top.
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(4);
    expect(lib.slice(0, 2)).toEqual(['mountain', 'forest']);
    expect(lib.slice(2).sort()).toEqual(['forest', 'shock']);
  });

  it('can only be activated at sorcery speed, and only on your own creature or planeswalker', () => {
    const g = game({
      p1: { battlefield: ['identity-echo', ...n('mountain', 4), 'savannah-lions', 'vivien-reid'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const echo = g.id('p1', 'identity-echo');
    expect(() => activate(g, echo, 0, [g.ref(g.id('p2', 'serra-angel'))])).toThrow();
    // A planeswalker you control is a legal target.
    g.obj(g.id('p1', 'vivien-reid')).counters = { loyalty: 5 };
    activate(g, echo, 0, [g.ref(g.id('p1', 'vivien-reid'))]);
    // On the stack it's not sorcery speed any more: casting with the stack non-empty is rejected.
    expect(g.state.stack).toHaveLength(1);
    expect(() => activate(g, echo, 0, [g.ref(g.id('p1', 'savannah-lions'))])).toThrow();
  });
});

describe('Jiang Yanggu, Alone', () => {
  it('has menace; a creature attacking a player alone: discard, draw, then a counter per card discarded this turn', () => {
    const g = game({
      p1: {
        hand: ['shock', 'forest'],
        battlefield: ['jiang-yanggu-alone', 'savannah-lions'],
        library: ['serra-angel', 'forest'],
      },
    });
    expect(keywords(g, g.id('p1', 'jiang-yanggu-alone'))).toContain('menace');
    const lions = g.id('p1', 'savannah-lions');
    toAttackers(g);
    g.attack(lions);
    done(g);
    expect(gy(g)).toHaveLength(1);
    expect(hand(g)).toHaveLength(2);
    expect(counters(g, lions)).toBe(1);
  });

  it('counts cards discarded earlier in the turn', () => {
    const g = game({
      p1: { hand: ['shock', 'forest'], battlefield: ['jiang-yanggu-alone', 'savannah-lions'] },
    });
    g.state.turn.discards = { p1: 2, p2: 0 };
    const lions = g.id('p1', 'savannah-lions');
    toAttackers(g);
    g.attack(lions);
    done(g);
    expect(counters(g, lions)).toBe(3);
  });

  it('does not trigger when two creatures attack', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['jiang-yanggu-alone', 'savannah-lions'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'), g.id('p1', 'jiang-yanggu-alone'));
    done(g);
    expect(hand(g)).toEqual(['shock']);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });

  it('does not trigger when the lone attacker attacks a planeswalker', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['jiang-yanggu-alone', 'savannah-lions'] },
      p2: { battlefield: ['vivien-reid'] },
    });
    g.obj(g.id('p2', 'vivien-reid')).counters = { loyalty: 5 };
    const lions = g.id('p1', 'savannah-lions');
    toAttackers(g);
    g.do({
      type: 'addAttacker',
      player: 'p1',
      attacker: lions,
      defender: 'p2',
      planeswalker: g.id('p2', 'vivien-reid'),
    });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    done(g);
    expect(hand(g)).toEqual(['shock']);
    expect(counters(g, lions)).toBe(0);
  });
});

describe('Kiora of Fire and Ashes', () => {
  it('creates a 5/5 flying Dragon when it enters, and another for {8}', () => {
    const g = game({ p1: { hand: ['kiora-of-fire-and-ashes'], battlefield: n('mountain', 14) } });
    done(cast(g, 'kiora-of-fire-and-ashes'));
    const dragons = tokens(g, DRAGON);
    expect(dragons).toHaveLength(1);
    expect(pt(g, dragons[0]!)).toEqual([5, 5]);
    expect(keywords(g, dragons[0]!)).toContain('flying');
    expect(cardDb.get(DRAGON)!.colors).toEqual(['R']);
    activate(g, g.id('p1', 'kiora-of-fire-and-ashes'), 1);
    done(g);
    expect(tokens(g, DRAGON)).toHaveLength(2);
  });
});

describe('Koth, the Geomancer', () => {
  it('has reach; landfall: 1 damage to each opponent, and {R} if the land is a Mountain', () => {
    const g = game({
      p1: { hand: ['mountain', 'forest'], battlefield: ['koth-the-geomancer'] },
    });
    expect(keywords(g, g.id('p1', 'koth-the-geomancer'))).toContain('reach');
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
    // The second land drop isn't allowed, so move to the next turn.
    g.state.players.p1.landsPlayedThisTurn = 0;
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.pool?.map((m) => m.produces)).toEqual([['R']]);
  });

  it('does not trigger for a land an opponent controls', () => {
    const g = game({
      p1: { battlefield: ['koth-the-geomancer'] },
      p2: { hand: ['mountain'] },
      active: 'p2',
    });
    g.do({ type: 'playLand', player: 'p2', card: g.id('p2', 'mountain', 'hand') });
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });
});

describe('Marwyn, the Clearcutter', () => {
  it('{2}, {T}, sacrifice an artifact or land: draw a card', () => {
    const g = game({
      p1: {
        battlefield: [
          'marwyn-the-clearcutter',
          ...n('mountain', 3),
          'treasure-token',
          'savannah-lions',
        ],
      },
    });
    const marwyn = g.id('p1', 'marwyn-the-clearcutter');
    // A creature can't be sacrificed for it.
    expect(() => activate(g, marwyn, 0, [], { sacrifice: g.id('p1', 'savannah-lions') })).toThrow();
    const tre = g.id('p1', 'treasure-token');
    activate(g, marwyn, 0, [], { sacrifice: tre });
    done(g);
    expect(g.zoneOf(tre)).not.toBe('battlefield');
    expect(hand(g)).toEqual(['forest']);
    expect(g.obj(marwyn).tapped).toBe(true);
  });

  it('can sacrifice a land', () => {
    const g = game({
      p1: { battlefield: ['marwyn-the-clearcutter', ...n('mountain', 3)] },
    });
    const marwyn = g.id('p1', 'marwyn-the-clearcutter');
    const land = g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain')[2]!;
    activate(g, marwyn, 0, [], { sacrifice: land });
    done(g);
    expect(g.zoneOf(land)).toBe('graveyard');
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Master of Barbs', () => {
  it('has menace; noncombat damage to an opponent gives your creatures +1/+0', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['master-of-barbs', 'savannah-lions', 'mountain'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const m = g.id('p1', 'master-of-barbs');
    expect(keywords(g, m)).toContain('menace');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, m)).toEqual([3, 1]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 1]);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });

  it('triggers on any source of noncombat damage, but not for damage to a creature, you, or combat damage', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: ['master-of-barbs', 'mountain', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const m = g.id('p1', 'master-of-barbs');
    done(cast(g, 'shock', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(pt(g, m)).toEqual([2, 1]);
    done(cast(g, 'shock', [{ player: 'p1' }]));
    expect(pt(g, m)).toEqual([2, 1]);
  });

  it('triggers on damage dealt to your opponent by their own effects', () => {
    const g = game({
      p1: { battlefield: ['master-of-barbs'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    // "One or more opponents are dealt noncombat damage": p2 shocking itself damages an opponent of Master's controller.
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, g.id('p1', 'master-of-barbs'))).toEqual([3, 1]);
  });

  it('combat damage does not trigger it', () => {
    const g = game({
      p1: { battlefield: ['master-of-barbs', 'savannah-lions'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'));
    toEndOfCombat(g);
    expect(g.life('p2')).toBe(18);
    expect(pt(g, g.id('p1', 'master-of-barbs'))).toEqual([2, 1]);
  });
});

describe('Pia, Determined Rebuilder', () => {
  it('creates a Thopter, and {5}{R} gives +X/+0 for the artifacts you control', () => {
    const g = game({
      p1: {
        hand: ['pia-determined-rebuilder'],
        battlefield: [...n('mountain', 9), 'treasure-token'],
      },
    });
    done(cast(g, 'pia-determined-rebuilder'));
    const thopters = tokens(g, THOPTER);
    expect(thopters).toHaveLength(1);
    expect(pt(g, thopters[0]!)).toEqual([1, 1]);
    expect(keywords(g, thopters[0]!)).toContain('flying');
    expect(getCharacteristics(g.state, cardDb, thopters[0]!).types).toEqual([
      'Artifact',
      'Creature',
    ]);
    const pia = g.id('p1', 'pia-determined-rebuilder');
    activate(g, pia, 1, [g.ref(pia)]);
    done(g);
    // The Thopter and the Treasure.
    expect(pt(g, pia)).toEqual([4, 2]);
  });
});

describe('Pompous Battlemage', () => {
  it('has prowess and enters prepared; Improvised Act: you may discard a card, if you do draw a card', () => {
    const g = game({
      p1: {
        hand: ['pompous-battlemage', 'shock'],
        battlefield: n('mountain', 3),
        library: ['serra-angel', 'forest'],
      },
    });
    done(cast(g, 'pompous-battlemage'));
    const b = g.id('p1', 'pompous-battlemage');
    expect(g.obj(b).prepared).toBeDefined();
    castCopy(g, b);
    done(g, { accept: true });
    expect(hand(g)).toEqual(['serra-angel']);
    expect(gy(g)).toEqual(['shock']);
    expect(g.obj(b).prepared).toBeUndefined();
  });

  it('declining the discard draws nothing', () => {
    const g = game({
      p1: { hand: ['pompous-battlemage', 'shock'], battlefield: n('mountain', 2) },
    });
    done(cast(g, 'pompous-battlemage'));
    castCopy(g, g.id('p1', 'pompous-battlemage'));
    done(g, { accept: false });
    expect(hand(g)).toEqual(['shock']);
    expect(gy(g)).toEqual([]);
  });

  it('with an empty hand you draw nothing', () => {
    const g = game({ p1: { hand: ['pompous-battlemage'], battlefield: n('mountain', 2) } });
    done(cast(g, 'pompous-battlemage'));
    castCopy(g, g.id('p1', 'pompous-battlemage'));
    done(g, { accept: true });
    expect(hand(g)).toEqual([]);
  });

  it('has prowess', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['pompous-battlemage', 'mountain'] },
    });
    const b = g.id('p1', 'pompous-battlemage');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, b)).toEqual([2, 2]);
  });
});

describe('Pyre Rhymer', () => {
  it('has prowess; Molten Tide makes Mountains add an additional {R} this turn', () => {
    const g = game({
      p1: {
        hand: ['pyre-rhymer', 'lightning-strike'],
        battlefield: n('mountain', 5),
      },
    });
    done(cast(g, 'pyre-rhymer'));
    const r = g.id('p1', 'pyre-rhymer');
    expect(g.obj(r).prepared).toBeDefined();
    // Two Mountains left: cast Molten Tide with one; then the other pays for Lightning Strike alone.
    castCopy(g, r);
    done(g);
    expect(g.state.turn.moltenTide).toEqual(['p1']);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
    ).toHaveLength(1);
    done(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
    ).toHaveLength(0);
    // Prowess: Molten Tide and Lightning Strike.
    expect(pt(g, r)).toEqual([5, 5]);
  });

  it('a lone Mountain pays for {1}{R}, a Forest gives nothing extra, and it ends with the turn', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['pyre-rhymer', 'mountain'] },
    });
    g.state.turn.moltenTide = ['p1'];
    done(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);

    const h = game({
      p1: { hand: ['lightning-strike'], battlefield: ['pyre-rhymer', 'forest', 'forest'] },
    });
    h.state.turn.moltenTide = ['p1'];
    expect(() => cast(h, 'lightning-strike', [{ player: 'p2' }])).toThrow();

    // Next turn there is no bonus: one Mountain can't pay for {1}{R}.
    const k = game({
      p1: { hand: ['lightning-strike'], battlefield: ['pyre-rhymer', 'mountain'] },
    });
    k.state.turn.moltenTide = ['p1'];
    passTo(k, 'main1', 'p1');
    expect(k.state.turn.moltenTide).toBeUndefined();
    expect(() => cast(k, 'lightning-strike', [{ player: 'p2' }])).toThrow();
  });
});

describe('Samut, Hazoret’s Champion', () => {
  it('gives your creatures haste', () => {
    const g = game({
      p1: {
        battlefield: ['samut-hazorets-champion', { card: 'savannah-lions', sick: true }],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('haste');
    expect(keywords(g, g.id('p1', 'samut-hazorets-champion'))).toContain('haste');
    expect(keywords(g, g.id('p2', 'serra-angel'))).not.toContain('haste');
  });
});

describe('Skilled Battlecarver', () => {
  it('has first strike during your turn only', () => {
    const g = game({ p1: { battlefield: ['skilled-battlecarver'] } });
    const s = g.id('p1', 'skilled-battlecarver');
    expect(keywords(g, s)).toContain('firstStrike');
    const h = game({ p1: { battlefield: ['skilled-battlecarver'] }, active: 'p2' });
    expect(keywords(h, h.id('p1', 'skilled-battlecarver'))).not.toContain('firstStrike');
  });

  it('{1}{R}: +1/+0 until end of turn', () => {
    const g = game({ p1: { battlefield: ['skilled-battlecarver', ...n('mountain', 4)] } });
    const s = g.id('p1', 'skilled-battlecarver');
    activate(g, s, 1);
    done(g);
    activate(g, s, 1);
    done(g);
    expect(pt(g, s)).toEqual([4, 1]);
  });
});

describe('Stingcaster Mage', () => {
  it('has haste; target instant or sorcery in your graveyard gains flashback until end of turn at its mana cost', () => {
    const g = game({
      p1: {
        hand: ['stingcaster-mage'],
        graveyard: ['lightning-strike', 'savannah-lions'],
        battlefield: n('mountain', 4),
      },
    });
    done(cast(g, 'stingcaster-mage'));
    expect(keywords(g, g.id('p1', 'stingcaster-mage'))).toContain('haste');
    const strike = g.id('p1', 'lightning-strike', 'graveyard');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: strike,
      targets: [{ player: 'p2' }],
      via: 'conduit',
    });
    done(g);
    expect(g.life('p2')).toBe(17);
    // Flashback exiles it.
    expect(g.zoneOf(strike)).toBe('exile');
    // Two mana were spent on top of the Mage's two.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && !g.obj(id).tapped),
    ).toHaveLength(0);
  });

  it('can’t target a creature card, and the flashback ends with the turn', () => {
    const g = game({
      p1: {
        hand: ['stingcaster-mage'],
        graveyard: ['savannah-lions', 'lightning-strike'],
        battlefield: n('mountain', 6),
      },
    });
    done(cast(g, 'stingcaster-mage'));
    const strike = g.id('p1', 'lightning-strike', 'graveyard');
    const lions = g.id('p1', 'savannah-lions', 'graveyard');
    expect(g.obj(lions).flashbackGrantedTurn).toBeUndefined();
    const castable = () => g.legal().some((a) => a.type === 'castSpell' && a.card === strike);
    expect(castable()).toBe(true);
    passTo(g, 'main1', 'p1');
    done(g);
    expect(castable()).toBe(false);
  });
});

describe('Tether Technician', () => {
  it('has reach; you may discard a card: when you do, 2 damage to any target', () => {
    const g = game({
      p1: { hand: ['tether-technician', 'shock'], battlefield: n('mountain', 5) },
    });
    cast(g, 'tether-technician');
    // The creature resolves, then its trigger asks whether to discard.
    for (let i = 0; i < 10 && !g.legal().some((a) => a.type === 'chooseEffect'); i++) g.pass();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    g.do(g.legal().find((a) => a.type === 'discard')!);
    // "When you do": the reflexive trigger chooses its target.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settleAt(g, player('p2'));
    expect(keywords(g, g.id('p1', 'tether-technician'))).toContain('reach');
    expect(gy(g)).toEqual(['shock']);
    expect(g.life('p2')).toBe(18);
  });

  it('deals no damage if you decline, or if there is nothing to discard', () => {
    const g = game({
      p1: { hand: ['tether-technician', 'shock'], battlefield: n('mountain', 5) },
    });
    done(cast(g, 'tether-technician'));
    done(g, { accept: false });
    expect(g.life('p2')).toBe(20);
    expect(hand(g)).toEqual(['shock']);

    const h = game({ p1: { hand: ['tether-technician'], battlefield: n('mountain', 5) } });
    done(cast(h, 'tether-technician'));
    done(h, { accept: true });
    expect(h.life('p2')).toBe(20);
    expect(h.state.stack).toHaveLength(0);
  });
});

describe('Tetsuko Umezawa, Pursuer', () => {
  it('has double strike and prowess, and pings when a creature with power or toughness 1 or less blocks', () => {
    const g = game({
      p1: { battlefield: ['tetsuko-umezawa-pursuer', 'hungry-ghoul'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const t = g.id('p1', 'tetsuko-umezawa-pursuer');
    expect(keywords(g, t)).toContain('doubleStrike');
    toAttackers(g);
    g.attack(g.id('p1', 'hungry-ghoul'));
    toBlockers(g);
    // Savannah Lions (toughness 1) blocks.
    g.block([g.id('p2', 'savannah-lions'), g.id('p1', 'hungry-ghoul')]);
    done(g);
    expect(g.life('p2')).toBe(19);
  });

  it('does not trigger for a bigger blocker or for her controller’s own creatures', () => {
    const g = game({
      p1: { battlefield: ['tetsuko-umezawa-pursuer', 'hungry-ghoul'] },
      p2: { battlefield: ['serra-angel'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'hungry-ghoul'));
    toBlockers(g);
    g.block([g.id('p2', 'serra-angel'), g.id('p1', 'hungry-ghoul')]);
    done(g);
    expect(g.life('p2')).toBe(20);
  });

  it('pings the controller of a 0-power blocker, too', () => {
    const g = game({
      p1: { battlefield: ['tetsuko-umezawa-pursuer', 'hungry-ghoul'] },
      p2: { battlefield: ['burglar-rat'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'hungry-ghoul'));
    toBlockers(g);
    g.block([g.id('p2', 'burglar-rat'), g.id('p1', 'hungry-ghoul')]);
    done(g);
    expect(g.life('p2')).toBe(19);
  });
});

describe('Tomik, Izzet Sparkmage', () => {
  it('has prowess; noncombat damage to an opponent or their permanents is 1 greater', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock', 'shock'],
        battlefield: ['tomik-izzet-sparkmage', ...n('mountain', 3), 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    done(cast(g, 'shock', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(3);
    // Not your own creature or yourself.
    done(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(gy(g)).toContain('savannah-lions');
    expect(pt(g, g.id('p1', 'tomik-izzet-sparkmage'))).toEqual([4, 5]);
  });

  it('doesn’t increase damage dealt to you, or combat damage', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['tomik-izzet-sparkmage', 'mountain'] },
    });
    done(cast(g, 'shock', [{ player: 'p1' }]));
    expect(g.life('p1')).toBe(18);
    const h = game({
      p1: { battlefield: ['tomik-izzet-sparkmage', 'savannah-lions'] },
    });
    toAttackers(h);
    h.attack(h.id('p1', 'savannah-lions'));
    toEndOfCombat(h);
    expect(h.life('p2')).toBe(18);
  });
});

describe('Winter, Team Player', () => {
  it('has convoke, and noncreature spells give your creatures +1/+0', () => {
    const g = game({
      p1: {
        hand: ['winter-team-player', 'shock'],
        battlefield: [
          'savannah-lions',
          'hungry-ghoul',
          'burglar-rat',
          'bear-cub',
          'mountain',
          'mountain',
        ],
      },
    });
    const creatures = ['savannah-lions', 'hungry-ghoul', 'burglar-rat', 'bear-cub'].map((c) =>
      g.id('p1', c),
    );
    const mountains = g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain');
    // {4}{R}: a Mountain for {R} and four creatures for the rest.
    done(cast(g, 'winter-team-player', [], { payWith: [mountains[0]!, ...creatures] }));
    const w = g.id('p1', 'winter-team-player');
    for (const c of creatures) expect(g.obj(c).tapped).toBe(true);
    expect(g.obj(mountains[1]!).tapped).toBe(false);
    expect(pt(g, w)).toEqual([3, 3]);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, w)).toEqual([4, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 1]);
  });

  it('a creature spell does not trigger it', () => {
    const g = game({
      p1: {
        hand: ['goblin-smuggler'],
        battlefield: ['winter-team-player', 'savannah-lions', ...n('mountain', 3)],
      },
    });
    done(cast(g, 'goblin-smuggler'));
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('Wrath of the Bloodmane', () => {
  it('deals 4 damage to a creature or planeswalker', () => {
    const g = game({
      p1: {
        hand: ['wrath-of-the-bloodmane', 'wrath-of-the-bloodmane'],
        battlefield: n('mountain', 6),
      },
      p2: { battlefield: ['serra-angel', 'liliana-dreadhorde-general'] },
    });
    const lili = g.id('p2', 'liliana-dreadhorde-general');
    g.obj(lili).counters = { loyalty: 6 };
    done(cast(g, 'wrath-of-the-bloodmane', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    done(cast(g, 'wrath-of-the-bloodmane', [g.ref(lili)]));
    expect(g.obj(lili).counters?.loyalty).toBe(2);
  });

  it('costs {1} less while you control a legendary creature', () => {
    const g = game({
      p1: { hand: ['wrath-of-the-bloodmane'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(() => cast(g, 'wrath-of-the-bloodmane', [g.ref(g.id('p2', 'serra-angel'))])).toThrow();
    const h = game({
      p1: {
        hand: ['wrath-of-the-bloodmane'],
        battlefield: [...n('mountain', 2), 'samut-hazorets-champion'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(h, 'wrath-of-the-bloodmane', [h.ref(h.id('p2', 'serra-angel'))]));
    expect(gy(h, 'p2')).toEqual(['serra-angel']);
  });

  it('a nonlegendary creature doesn’t reduce the cost', () => {
    const g = game({
      p1: {
        hand: ['wrath-of-the-bloodmane'],
        battlefield: [...n('mountain', 2), 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(() => cast(g, 'wrath-of-the-bloodmane', [g.ref(g.id('p2', 'serra-angel'))])).toThrow();
  });
});

describe('the whole group is in the pool', () => {
  it('has every red card', () => {
    for (const id of [
      'ajanis-anguish',
      'arni-renowned-champion',
      'artifist-acumen',
      'awaken-the-inferno',
      'chandras-emberling',
      'command-the-stage',
      'craterclaw-colossus',
      'curse-marred-demon',
      'draconic-visitor',
      'eardrum-rattler',
      'essence-burn',
      'face-yourself',
      'fulminous-forte',
      'gallia-the-merrymaker',
      'hallway-heckler',
      'heartstring-puller',
      'identity-echo',
      'jiang-yanggu-alone',
      'kiora-of-fire-and-ashes',
      'koth-the-geomancer',
      'marwyn-the-clearcutter',
      'master-of-barbs',
      'pia-determined-rebuilder',
      'pompous-battlemage',
      'pyre-rhymer',
      'samut-hazorets-champion',
      'skilled-battlecarver',
      'stingcaster-mage',
      'tether-technician',
      'tetsuko-umezawa-pursuer',
      'tomik-izzet-sparkmage',
      'winter-team-player',
      'wrath-of-the-bloodmane',
    ])
      expect(cardDb.has(id), id).toBe(true);
  });
});
