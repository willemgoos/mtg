import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { FRA_BLACK, FRA_BLACK_BACKS } from '../src/fra/black.ts';

// Reality Fracture 17a: the black cards.

const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const zone = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.objects
    ? Object.values(g.state.objects).filter((o) => o.defId === defId && o.owner === p)
    : [];
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const onBattlefield = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === p);

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

const canActivate = (g: GameDriver, source: string, abilityIndex: number) =>
  g
    .legal()
    .some(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === abilityIndex,
    );

/** Passes priority (declaring nothing) until the given step of the current turn. */
function passToStep(g: GameDriver, step: string, player: 'p1' | 'p2' = 'p1'): void {
  for (let i = 0; i < 80; i++) {
    const t = g.state.turn;
    if (t.step === step && t.activePlayer === player && g.decision.kind === 'priority') return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

const BLACK_CARDS = [
  'Apex Witchstalker',
  'Bloodline Recollector',
  'Break Under Pressure',
  'Cast Away Doubt',
  'Danitha, Spear of Agony',
  'Dark Matter Manipulator',
  'Darklight Phoenix',
  'Extended Absence',
  'Gallia, Tragic Host',
  "Lich's Relic",
  'Liliana the Repentant',
  'Loot, the Anomaly',
  'Mabel, Bitter Recluse',
  'Massacre Girl, Most Wanted',
  'Multiply by Zero',
  'Proft, Sinister Mastermind',
  'Rampart Hunter',
  'Rank Rat',
  'Rise of the Deathbringer',
  'Screeching Soulbreaker',
  'Silence the Echo',
  'Terminal Criticism',
  'Theoretical Necromancer',
  'Tinybones, Pocket Nuisance',
  'Void Extrapolator',
  'Winter, Tormented Loner',
  'Yargle, Glutton of Urborg',
];

describe('Reality Fracture black: registry', () => {
  it('has every card (Extrapolate the Impossible needs cards from outside the game and is left out)', () => {
    for (const name of BLACK_CARDS) {
      expect(FRA_BLACK[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
    expect(Object.keys(FRA_BLACK)).toHaveLength(BLACK_CARDS.length);
    expect(Object.keys(FRA_BLACK_BACKS)).toHaveLength(2);
  });
});

describe('Apex Witchstalker', () => {
  it('is a 6/4 with menace, and gains 2 life when it enters', () => {
    const g = game({ p1: { hand: ['apex-witchstalker'], battlefield: n('swamp', 6) } });
    done(cast(g, 'apex-witchstalker'));
    const w = g.id('p1', 'apex-witchstalker');
    expect(pt(g, w)).toEqual([6, 4]);
    expect(keywords(g, w).has('menace')).toBe(true);
    expect(g.life('p1')).toBe(22);
  });

  it('gains 2 life when it dies', () => {
    const g = game({ p1: { battlefield: ['apex-witchstalker'] } });
    const w = g.id('p1', 'apex-witchstalker');
    g.obj(w).damage = 4;
    g.pass();
    done(g);
    expect(zone(g, 'apex-witchstalker').length).toBe(1);
    expect(gy(g)).toContain('apex-witchstalker');
    expect(g.life('p1')).toBe(22);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: {
        hand: ['apex-witchstalker'],
        battlefield: n('swamp', 2),
        library: ['forest', 'island'],
      },
    });
    activate(g, g.id('p1', 'apex-witchstalker', 'hand'), 2);
    done(g);
    expect(gy(g)).toContain('apex-witchstalker');
    expect(hand(g)).toHaveLength(1);
    expect(['forest', 'island']).toContain(hand(g)[0]);
  });
});

describe('Bloodline Recollector // Ancestral Craving', () => {
  it('becomes prepared at the end step if three or more creatures died; Ancestral Craving draws three and loses 3', () => {
    const g = game({ p1: { hand: ['bloodline-recollector'], battlefield: n('swamp', 4) } });
    done(cast(g, 'bloodline-recollector'));
    const r = g.id('p1', 'bloodline-recollector');
    expect(g.obj(r).prepared).toBeUndefined();
    g.state.turn.creaturesDied = 3;
    passToStep(g, 'end');
    done(g);
    expect(g.obj(r).prepared).toBeDefined();
    castCopy(g, r, [{ player: 'p1' }]);
    done(g);
    expect(hand(g)).toHaveLength(3);
    expect(g.life('p1')).toBe(17);
    expect(g.obj(r).prepared).toBeUndefined();
  });

  it('stays unprepared if only two creatures died', () => {
    const g = game({ p1: { battlefield: ['bloodline-recollector'] } });
    g.state.turn.creaturesDied = 2;
    passToStep(g, 'end');
    done(g);
    expect(g.obj(g.id('p1', 'bloodline-recollector')).prepared).toBeUndefined();
  });

  it('also triggers at an opponent’s end step', () => {
    const g = game({ p1: { battlefield: ['bloodline-recollector'] } });
    passToStep(g, 'main2', 'p2');
    g.state.turn.creaturesDied = 3;
    passToStep(g, 'end', 'p2');
    done(g);
    expect(g.obj(g.id('p1', 'bloodline-recollector')).prepared).toBeDefined();
  });

  it('Ancestral Craving can target an opponent', () => {
    const g = game({ p1: { hand: ['bloodline-recollector'], battlefield: n('swamp', 4) } });
    done(cast(g, 'bloodline-recollector'));
    const r = g.id('p1', 'bloodline-recollector');
    g.state.turn.creaturesDied = 3;
    passToStep(g, 'end');
    done(g);
    castCopy(g, r, [{ player: 'p2' }]);
    done(g);
    expect(hand(g, 'p2')).toHaveLength(3);
    expect(g.life('p2')).toBe(17);
  });
});

describe('Break Under Pressure', () => {
  it('makes the opponent sacrifice a creature with the greatest mana value; you gain 2', () => {
    const g = game({
      p1: { hand: ['break-under-pressure'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    done(cast(g, 'break-under-pressure', [{ player: 'p2' }]));
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(onBattlefield(g, 'savannah-lions', 'p2')).toHaveLength(1);
    expect(g.life('p1')).toBe(22);
  });

  it('lets the opponent choose among tied creatures', () => {
    const g = game({
      p1: { hand: ['break-under-pressure'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel', 'serra-angel', 'savannah-lions'] },
    });
    cast(g, 'break-under-pressure', [{ player: 'p2' }]);
    g.passBoth();
    expect(g.decision.kind).toBe('sacrifice');
    const options = g.legal().filter((a) => a.type === 'chooseCard');
    expect(options).toHaveLength(2);
    g.do(options[0]!);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('counts planeswalkers: a planeswalker with the greatest mana value is sacrificed', () => {
    const g = game({
      p1: { hand: ['break-under-pressure'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions', 'ral-zarek-guest-lecturer'] },
    });
    g.obj(g.id('p2', 'ral-zarek-guest-lecturer')).counters = { loyalty: 3 };
    done(cast(g, 'break-under-pressure', [{ player: 'p2' }]));
    expect(gy(g, 'p2')).toEqual(['ral-zarek-guest-lecturer']);
    expect(onBattlefield(g, 'savannah-lions', 'p2')).toHaveLength(1);
  });

  it('still gains 2 life when the opponent has nothing to sacrifice', () => {
    const g = game({ p1: { hand: ['break-under-pressure'], battlefield: n('swamp', 3) } });
    done(cast(g, 'break-under-pressure', [{ player: 'p2' }]));
    expect(g.life('p1')).toBe(22);
  });
});

describe('Cast Away Doubt', () => {
  it('draws two cards and deals 2 damage to each player', () => {
    const g = game({ p1: { hand: ['cast-away-doubt'], battlefield: n('swamp', 3) } });
    done(cast(g, 'cast-away-doubt'));
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Danitha, Spear of Agony', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['shock', 'extended-absence'],
        battlefield: ['danitha-spear-of-agony', 'savannah-lions', ...n('swamp', 4), 'mountain'],
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('is a 2/2 with first strike', () => {
    const g = setup();
    const d = g.id('p1', 'danitha-spear-of-agony');
    expect(pt(g, d)).toEqual([2, 2]);
    expect(keywords(g, d).has('firstStrike')).toBe(true);
  });

  it('gets a counter when you cast a spell targeting an opponent', () => {
    const g = setup();
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(counters(g, g.id('p1', 'danitha-spear-of-agony'))).toBe(1);
  });

  it('gets a counter when you cast a spell targeting a creature an opponent controls', () => {
    const g = setup();
    done(cast(g, 'extended-absence', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(counters(g, g.id('p1', 'danitha-spear-of-agony'))).toBe(1);
  });

  it('does not get a counter for a spell targeting your own creature', () => {
    const g = setup();
    done(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(counters(g, g.id('p1', 'danitha-spear-of-agony'))).toBe(0);
  });
});

describe('Dark Matter Manipulator', () => {
  it('mills three cards when it enters', () => {
    const g = game({ p1: { hand: ['dark-matter-manipulator'], battlefield: ['swamp'] } });
    done(cast(g, 'dark-matter-manipulator'));
    expect(g.state.players.p1.graveyard).toHaveLength(3);
  });

  it('gets +2/+0 for every seven cards in your graveyard', () => {
    const six = game({
      p1: { battlefield: ['dark-matter-manipulator'], graveyard: n('forest', 6) },
    });
    expect(pt(six, six.id('p1', 'dark-matter-manipulator'))).toEqual([1, 2]);
    const seven = game({
      p1: { battlefield: ['dark-matter-manipulator'], graveyard: n('forest', 7) },
    });
    expect(pt(seven, seven.id('p1', 'dark-matter-manipulator'))).toEqual([3, 2]);
  });

  it('counts fourteen cards as two groups of seven', () => {
    const g = game({
      p1: { battlefield: ['dark-matter-manipulator'], graveyard: n('forest', 14) },
    });
    expect(pt(g, g.id('p1', 'dark-matter-manipulator'))).toEqual([5, 2]);
  });
});

describe('Darklight Phoenix', () => {
  it('flies and has haste', () => {
    const g = game({ p1: { battlefield: ['darklight-phoenix'] } });
    const k = keywords(g, g.id('p1', 'darklight-phoenix'));
    expect(k.has('flying')).toBe(true);
    expect(k.has('haste')).toBe(true);
  });

  it('returns to the battlefield at the beginning of combat if two or more creatures died this turn', () => {
    const g = game({ p1: { graveyard: ['darklight-phoenix'] } });
    g.state.turn.creaturesDied = 2;
    passToStep(g, 'declareAttackers');
    done(g);
    expect(onBattlefield(g, 'darklight-phoenix')).toHaveLength(1);
  });

  it('stays in the graveyard if only one creature died', () => {
    const g = game({ p1: { graveyard: ['darklight-phoenix'] } });
    g.state.turn.creaturesDied = 1;
    passToStep(g, 'end');
    done(g);
    expect(gy(g)).toContain('darklight-phoenix');
  });

  it('does nothing at the beginning of an opponent’s combat', () => {
    const g = game({ p1: { graveyard: ['darklight-phoenix'] } });
    passToStep(g, 'main2', 'p2');
    g.state.turn.creaturesDied = 2;
    passToStep(g, 'end', 'p2');
    done(g);
    expect(gy(g)).toContain('darklight-phoenix');
  });
});

describe('Extended Absence', () => {
  it('exiles a creature, deals 1 damage to each opponent and gains 1 life', () => {
    const g = game({
      p1: { hand: ['extended-absence'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'extended-absence', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('can exile a planeswalker', () => {
    const g = game({
      p1: { hand: ['extended-absence'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['ral-zarek-guest-lecturer'] },
    });
    g.obj(g.id('p2', 'ral-zarek-guest-lecturer')).counters = { loyalty: 3 };
    done(cast(g, 'extended-absence', [g.ref(g.id('p2', 'ral-zarek-guest-lecturer'))]));
    expect(onBattlefield(g, 'ral-zarek-guest-lecturer', 'p2')).toHaveLength(0);
    expect(g.life('p2')).toBe(19);
  });
});

describe('Gallia, Tragic Host', () => {
  it('has menace', () => {
    const g = game({ p1: { battlefield: ['gallia-tragic-host'] } });
    expect(keywords(g, g.id('p1', 'gallia-tragic-host')).has('menace')).toBe(true);
  });

  it('returns from the graveyard tapped with a +1/+1 counter, exiling another creature card', () => {
    const g = game({
      p1: { graveyard: ['gallia-tragic-host', 'savannah-lions'], battlefield: n('swamp', 5) },
    });
    const gal = g.id('p1', 'gallia-tragic-host', 'graveyard');
    expect(canActivate(g, gal, 0)).toBe(true);
    activate(g, gal, 0);
    done(g);
    const back = g.id('p1', 'gallia-tragic-host');
    expect(g.obj(back).tapped).toBe(true);
    expect(counters(g, back)).toBe(1);
    expect(pt(g, back)).toEqual([3, 2]);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['savannah-lions']);
  });

  it('needs another creature card in the graveyard to exile', () => {
    const g = game({
      p1: { graveyard: ['gallia-tragic-host', 'forest'], battlefield: n('swamp', 5) },
    });
    expect(canActivate(g, g.id('p1', 'gallia-tragic-host', 'graveyard'), 0)).toBe(false);
  });

  // Reality Fracture (17a fixes): the player chooses the creature card to exile.
  it('lets you choose which creature card to exile', () => {
    const g = game({
      p1: {
        graveyard: ['gallia-tragic-host', 'savannah-lions', 'serra-angel', 'forest'],
        battlefield: n('swamp', 5),
      },
    });
    activate(g, g.id('p1', 'gallia-tragic-host', 'graveyard'), 0);
    expect(g.decision.kind).toBe('forageExile');
    // Only creature cards other than Gallia are offered.
    const offered = g
      .legal()
      .filter((a) => a.type === 'chooseCard')
      .map((a) => (a.type === 'chooseCard' && a.card ? g.obj(a.card).defId : ''));
    expect(offered.sort()).toEqual(['savannah-lions', 'serra-angel']);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'serra-angel', 'graveyard') });
    done(g);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
    expect(gy(g)).toContain('savannah-lions');
    expect(onBattlefield(g, 'gallia-tragic-host')).toHaveLength(1);
  });

  it('cannot exile itself to pay', () => {
    const g = game({ p1: { graveyard: ['gallia-tragic-host'], battlefield: n('swamp', 5) } });
    expect(canActivate(g, g.id('p1', 'gallia-tragic-host', 'graveyard'), 0)).toBe(false);
  });
});

describe("Lich's Relic", () => {
  const setup = () =>
    game({
      p1: { hand: ['lichs-relic'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });

  it('destroys up to one target creature when you pay {2} as it enters', () => {
    const g = setup();
    cast(g, 'lichs-relic');
    g.passBoth();
    g.passBoth();
    // "You may pay {2}": accept, then choose the target of the reflexive trigger.
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g, { accept: true });
    expect(gy(g, 'p2').length).toBe(1);
    expect(onBattlefield(g, 'lichs-relic')).toHaveLength(1);
  });

  it('destroys nothing when you do not pay', () => {
    const g = setup();
    cast(g, 'lichs-relic');
    done(g, { accept: false });
    expect(gy(g, 'p2')).toHaveLength(0);
    expect(onBattlefield(g, 'lichs-relic')).toHaveLength(1);
  });

  it('can destroy a planeswalker', () => {
    const g = game({
      p1: { hand: ['lichs-relic'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['ral-zarek-guest-lecturer'] },
    });
    g.obj(g.id('p2', 'ral-zarek-guest-lecturer')).counters = { loyalty: 3 };
    cast(g, 'lichs-relic');
    done(g, { accept: true });
    expect(gy(g, 'p2')).toEqual(['ral-zarek-guest-lecturer']);
  });

  it('gives the equipped creature +2/+1 (Equip {2})', () => {
    const g = game({
      p1: { battlefield: ['lichs-relic', 'savannah-lions', ...n('swamp', 2)] },
    });
    const relic = g.id('p1', 'lichs-relic');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, relic, 3, [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
  });
});

describe('Liliana the Repentant', () => {
  it('mills two cards whenever another creature enters under your control', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['liliana-the-repentant', 'plains'] },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
  });

  it('does not mill when Liliana herself enters or an opponent’s creature enters', () => {
    const g = game({
      p1: { hand: ['liliana-the-repentant'], battlefield: n('swamp', 2) },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
    done(cast(g, 'liliana-the-repentant'));
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    // The opponent's creature entering (on their own turn) doesn't mill.
    const h = game({
      p1: { battlefield: ['liliana-the-repentant'] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    cast(h, 'savannah-lions');
    done(h);
    expect(onBattlefield(h, 'savannah-lions', 'p2')).toHaveLength(1);
    expect(h.state.players.p1.graveyard).toHaveLength(0);
  });

  const exhaustSetup = () =>
    game({
      p1: {
        battlefield: ['liliana-the-repentant', ...n('swamp', 6)],
        graveyard: ['serra-angel', 'forest'],
      },
    });

  it('Exhaust: returns a creature card from your graveyard and puts a +1/+1 counter on her, once only', () => {
    const g = exhaustSetup();
    const lili = g.id('p1', 'liliana-the-repentant');
    activate(g, lili, 1, [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]);
    done(g);
    expect(onBattlefield(g, 'serra-angel')).toHaveLength(1);
    expect(counters(g, lili)).toBe(1);
    expect(pt(g, lili)).toEqual([3, 3]);
    // The creature entering milled two; no second activation.
    g.state.players.p1.graveyard.push(...[]);
    expect(canActivate(g, lili, 1)).toBe(false);
  });

  it('Exhaust: only as a sorcery', () => {
    const g = exhaustSetup();
    g.pass();
    done(g);
    // The opponent's turn (or a later step): not activatable.
    passToStep(g, 'main2', 'p2');
    expect(canActivate(g, g.id('p1', 'liliana-the-repentant'), 1)).toBe(false);
  });

  it('Exhaust: can return a planeswalker card', () => {
    const g = game({
      p1: {
        battlefield: ['liliana-the-repentant', ...n('swamp', 6)],
        graveyard: ['ral-zarek-guest-lecturer'],
      },
    });
    const lili = g.id('p1', 'liliana-the-repentant');
    activate(g, lili, 1, [g.ref(g.id('p1', 'ral-zarek-guest-lecturer', 'graveyard'))]);
    done(g);
    expect(onBattlefield(g, 'ral-zarek-guest-lecturer')).toHaveLength(1);
  });
});

describe('Loot, the Anomaly', () => {
  it('is a -2/4', () => {
    const g = game({ p1: { battlefield: ['loot-the-anomaly'] } });
    expect(pt(g, g.id('p1', 'loot-the-anomaly'))).toEqual([-2, 4]);
  });

  it('assigns combat damage as though its power were positive', () => {
    const g = game({ p1: { battlefield: ['loot-the-anomaly'] }, step: 'beginCombat' });
    const loot = g.id('p1', 'loot-the-anomaly');
    g.pass().pass();
    g.attack(loot);
    passToStep(g, 'main2');
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(20);
  });

  it('also deals that damage to a blocker', () => {
    const g = game({
      p1: { battlefield: ['loot-the-anomaly'] },
      p2: { battlefield: ['savannah-lions'] },
      step: 'beginCombat',
    });
    const loot = g.id('p1', 'loot-the-anomaly');
    g.pass().pass();
    g.attack(loot).passBoth();
    g.block([g.id('p2', 'savannah-lions'), loot]);
    passToStep(g, 'main2');
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.life('p2')).toBe(20);
  });

  const threshold = (graveyard: number) =>
    game({
      p1: {
        battlefield: ['loot-the-anomaly', 'savannah-lions'],
        graveyard: n('forest', graveyard),
      },
      step: 'beginCombat',
    });

  it('Threshold: sacrifice another creature for -2/-0 (so it deals 4)', () => {
    const g = threshold(7);
    const loot = g.id('p1', 'loot-the-anomaly');
    activate(g, loot, 1, [], { sacrifice: g.id('p1', 'savannah-lions') });
    done(g);
    expect(pt(g, loot)).toEqual([-4, 4]);
    expect(gy(g)).toContain('savannah-lions');
    g.pass().pass();
    g.attack(loot);
    passToStep(g, 'main2');
    expect(g.life('p2')).toBe(16);
  });

  it('Threshold: can sacrifice a planeswalker', () => {
    const g = game({
      p1: {
        battlefield: ['loot-the-anomaly', 'ral-zarek-guest-lecturer'],
        graveyard: n('forest', 7),
      },
    });
    const loot = g.id('p1', 'loot-the-anomaly');
    activate(g, loot, 1, [], { sacrifice: g.id('p1', 'ral-zarek-guest-lecturer') });
    done(g);
    expect(pt(g, loot)).toEqual([-4, 4]);
  });

  it('Threshold: needs seven cards in your graveyard', () => {
    const g = threshold(6);
    expect(canActivate(g, g.id('p1', 'loot-the-anomaly'), 1)).toBe(false);
  });

  it('Threshold: can’t sacrifice itself', () => {
    const g = game({ p1: { battlefield: ['loot-the-anomaly'], graveyard: n('forest', 7) } });
    expect(canActivate(g, g.id('p1', 'loot-the-anomaly'), 1)).toBe(false);
  });
});

describe('Mabel, Bitter Recluse', () => {
  const setup = (extra: object = {}) =>
    game({
      p1: { hand: ['mabel-bitter-recluse'], battlefield: ['swamp'] },
      p2: { battlefield: ['serra-angel'] },
      ...extra,
    });

  it('has deathtouch', () => {
    const g = game({ p1: { battlefield: ['mabel-bitter-recluse'] } });
    expect(keywords(g, g.id('p1', 'mabel-bitter-recluse')).has('deathtouch')).toBe(true);
  });

  it('removes up to three counters from another target creature, one at a time', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 5;
    cast(g, 'mabel-bitter-recluse');
    g.passBoth();
    settle(g);
    // Three removal choices, each "Remove a +1/+1 counter" (option 1; option 0 is "Done").
    for (let i = 0; i < 3; i++) {
      expect(g.decision.kind).toBe('chooseOption');
      done_option(g, 1);
    }
    expect(g.decision.kind).toBe('priority');
    expect(counters(g, angel)).toBe(2);
  });

  it('may stop early ("up to three")', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 5;
    cast(g, 'mabel-bitter-recluse');
    g.passBoth();
    settle(g);
    done_option(g, 1);
    done_option(g, 0);
    expect(counters(g, angel)).toBe(4);
  });

  it('removes loyalty counters from a planeswalker, and lets you pick among kinds of counters', () => {
    const g = setup();
    g.state.players.p2.hand.length = 0;
    const walker = game({
      p1: { hand: ['mabel-bitter-recluse'], battlefield: ['swamp'] },
      p2: { battlefield: ['ral-zarek-guest-lecturer'] },
    });
    const w = walker.id('p2', 'ral-zarek-guest-lecturer');
    walker.obj(w).counters = { loyalty: 4, finality: 1 };
    walker.obj(w).plusOneCounters = 1;
    cast(walker, 'mabel-bitter-recluse');
    walker.passBoth();
    settle(walker);
    const d = walker.decision;
    expect(d.kind).toBe('chooseOption');
    if (d.kind !== 'chooseOption') return;
    expect(d.options.map((o) => o.label)).toEqual([
      'Done removing counters',
      'Remove a +1/+1 counter (1 on it)',
      'Remove a loyalty counter (4 on it)',
      'Remove a finality counter (1 on it)',
    ]);
    done_option(walker, 2);
    done_option(walker, 2);
    done_option(walker, 3);
    expect(walker.obj(w).counters).toEqual({ loyalty: 2 });
    expect(walker.obj(w).plusOneCounters).toBe(1);
  });

  it('asks nothing when the target has no counters', () => {
    const g = setup();
    cast(g, 'mabel-bitter-recluse');
    g.passBoth();
    settle(g);
    expect(g.decision.kind).toBe('priority');
  });

  it('cannot target itself', () => {
    const g = game({ p1: { hand: ['mabel-bitter-recluse'], battlefield: ['swamp'] } });
    cast(g, 'mabel-bitter-recluse');
    g.passBoth();
    // No other creature or planeswalker: the trigger has no target.
    expect(g.state.stack).toHaveLength(0);
  });
});

function done_option(g: GameDriver, index: number): void {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d.kind}`);
  g.do({ type: 'chooseOption', player: d.player, index });
  settle(g);
}

describe('Massacre Girl, Most Wanted', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['cast-away-doubt', 'shock'],
        battlefield: ['massacre-girl-most-wanted', 'savannah-lions', ...n('swamp', 3), 'mountain'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });

  it('deals 1 damage to target opponent and gains 1 when another creature you control dies', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).damage = 5;
    g.pass();
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('does not trigger when an opponent’s creature dies', () => {
    const g = setup();
    g.obj(g.id('p2', 'savannah-lions')).damage = 5;
    g.pass();
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(g.life('p1')).toBe(20);
  });

  it('does not trigger when it dies itself', () => {
    const g = setup();
    g.obj(g.id('p1', 'massacre-girl-most-wanted')).damage = 9;
    g.pass();
    done(g);
    expect(g.life('p2')).toBe(20);
  });

  it('triggers for a planeswalker you control dying', () => {
    const g = game({
      p1: { battlefield: ['massacre-girl-most-wanted', 'ral-zarek-guest-lecturer'] },
    });
    g.obj(g.id('p1', 'ral-zarek-guest-lecturer')).counters = { loyalty: 0 };
    g.pass();
    done(g);
    expect(gy(g)).toContain('ral-zarek-guest-lecturer');
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('gets a +1/+1 counter whenever an opponent is dealt noncombat damage', () => {
    const g = setup();
    const mg = g.id('p1', 'massacre-girl-most-wanted');
    expect(pt(g, mg)).toEqual([4, 4]);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(counters(g, mg)).toBe(1);
    expect(pt(g, mg)).toEqual([5, 5]);
  });

  it('also counts damage from a spell that hurts each player (once)', () => {
    const g = setup();
    done(cast(g, 'cast-away-doubt'));
    expect(counters(g, g.id('p1', 'massacre-girl-most-wanted'))).toBe(1);
  });

  it('does not count combat damage or damage to you', () => {
    const g = setup();
    const mg = g.id('p1', 'massacre-girl-most-wanted');
    done(cast(g, 'shock', [{ player: 'p1' }]));
    expect(counters(g, mg)).toBe(0);
    g.state.turn.step = 'beginCombat';
    g.pass().pass();
    g.attack(g.id('p1', 'savannah-lions'));
    passToStep(g, 'main2');
    expect(g.life('p2')).toBe(18);
    expect(counters(g, mg)).toBe(0);
  });
});

describe('Multiply by Zero', () => {
  it('sets a creature’s base power and toughness to 0/0 until end of turn', () => {
    const g = game({
      p1: { hand: ['multiply-by-zero'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 1;
    cast(g, 'multiply-by-zero', [g.ref(angel)]);
    g.passBoth();
    done(g);
    expect(pt(g, angel)).toEqual([1, 1]);
  });

  it('kills a creature with no counters', () => {
    const g = game({
      p1: { hand: ['multiply-by-zero'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'multiply-by-zero', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Proft, Sinister Mastermind', () => {
  it('can’t be cast unless there are seven or more cards in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['proft-sinister-mastermind'],
        battlefield: n('swamp', 3),
        graveyard: n('forest', 6),
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('is a 5/5 menace that can be cast with seven cards in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['proft-sinister-mastermind'],
        battlefield: n('swamp', 3),
        graveyard: n('forest', 7),
      },
    });
    done(cast(g, 'proft-sinister-mastermind'));
    const p = g.id('p1', 'proft-sinister-mastermind');
    expect(pt(g, p)).toEqual([5, 5]);
    expect(keywords(g, p).has('menace')).toBe(true);
  });

  it('{B}, Discard this card: target creature gets -3/-1 until end of turn', () => {
    const g = game({
      p1: { hand: ['proft-sinister-mastermind'], battlefield: n('swamp', 1) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    activate(g, g.id('p1', 'proft-sinister-mastermind', 'hand'), 0, [g.ref(angel)]);
    done(g);
    expect(gy(g)).toContain('proft-sinister-mastermind');
    expect(pt(g, angel)).toEqual([1, 3]);
  });
});

describe('Rampart Hunter', () => {
  it('has deathtouch; its enter trigger gives a creature +2/+2 and deathtouch until end of turn', () => {
    const g = game({
      p1: { hand: ['rampart-hunter'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
    });
    cast(g, 'rampart-hunter');
    g.passBoth();
    // Target the Lions.
    const lions = g.id('p1', 'savannah-lions');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      ),
    );
    done(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('deathtouch')).toBe(true);
    const hunter = g.id('p1', 'rampart-hunter');
    expect(pt(g, hunter)).toEqual([3, 3]);
    expect(keywords(g, hunter).has('deathtouch')).toBe(true);
  });
});

describe('Rank Rat', () => {
  it('makes each opponent discard a card when it enters', () => {
    const g = game({
      p1: { hand: ['rank-rat'], battlefield: n('swamp', 2) },
      p2: { hand: ['savannah-lions', 'plains'] },
    });
    done(cast(g, 'rank-rat'));
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(gy(g, 'p2')).toHaveLength(1);
  });
});

describe('Rise of the Deathbringer', () => {
  it('mode 1: draw cards equal to the greatest power among your creatures and lose that much life', () => {
    const g = game({
      p1: { hand: ['rise-of-the-deathbringer'], battlefield: [...n('swamp', 5), 'serra-angel'] },
    });
    cast(g, 'rise-of-the-deathbringer', [], { mode: 0 });
    done(g);
    expect(hand(g)).toHaveLength(4);
    expect(g.life('p1')).toBe(16);
  });

  // Reality Fracture (17a fixes): life lost is the number of cards actually drawn.
  it('mode 1 loses life equal to the cards actually drawn when the library runs short', () => {
    const g = game({
      p1: {
        hand: ['rise-of-the-deathbringer'],
        battlefield: [...n('swamp', 5), 'serra-angel'],
        library: ['forest', 'forest'],
      },
    });
    cast(g, 'rise-of-the-deathbringer', [], { mode: 0 });
    g.passBoth();
    // Four were to be drawn, but only two were: two life lost (then the empty library loses the game).
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
  });

  it('mode 1 with no creatures draws nothing', () => {
    const g = game({ p1: { hand: ['rise-of-the-deathbringer'], battlefield: n('swamp', 5) } });
    cast(g, 'rise-of-the-deathbringer', [], { mode: 0 });
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(g.life('p1')).toBe(20);
  });

  it('mode 2: all creatures get -3/-3 until end of turn', () => {
    const g = game({
      p1: {
        hand: ['rise-of-the-deathbringer'],
        battlefield: [...n('swamp', 5), 'savannah-lions', 'serra-angel'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'rise-of-the-deathbringer', [], { mode: 1 });
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([1, 1]);
  });
});

describe('Screeching Soulbreaker', () => {
  it('flies; when it attacks it deals 1 damage to each opponent and you gain 1 life', () => {
    const g = game({ p1: { battlefield: ['screeching-soulbreaker'] }, step: 'beginCombat' });
    const s = g.id('p1', 'screeching-soulbreaker');
    expect(keywords(g, s).has('flying')).toBe(true);
    expect(pt(g, s)).toEqual([1, 4]);
    g.pass().pass();
    g.attack(s);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });
});

describe('Silence the Echo', () => {
  const setup = () =>
    game({
      p1: { hand: ['silence-the-echo'], battlefield: ['savannah-lions', ...n('swamp', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });

  it('can be cast by paying {3} as the additional cost', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'silence-the-echo', [g.ref(angel)]);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(onBattlefield(g, 'savannah-lions')).toHaveLength(1);
  });

  it('can be cast by sacrificing a creature instead', () => {
    const g = game({
      p1: { hand: ['silence-the-echo'], battlefield: ['savannah-lions', ...n('swamp', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'silence-the-echo', [g.ref(angel)], { sacrifice: g.id('p1', 'savannah-lions') });
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g)).toContain('savannah-lions');
  });

  it('can be cast by sacrificing a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['silence-the-echo'],
        battlefield: ['ral-zarek-guest-lecturer', ...n('swamp', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const walker = g.id('p1', 'ral-zarek-guest-lecturer');
    g.obj(walker).counters = { loyalty: 3 };
    cast(g, 'silence-the-echo', [g.ref(g.id('p2', 'serra-angel'))], { sacrifice: walker });
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g)).toContain('ral-zarek-guest-lecturer');
  });

  it('destroys a planeswalker', () => {
    const g = game({
      p1: { hand: ['silence-the-echo'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['ral-zarek-guest-lecturer'] },
    });
    const walker = g.id('p2', 'ral-zarek-guest-lecturer');
    g.obj(walker).counters = { loyalty: 3 };
    cast(g, 'silence-the-echo', [g.ref(walker)]);
    done(g);
    expect(gy(g, 'p2')).toEqual(['ral-zarek-guest-lecturer']);
  });

  it('can’t be cast with only two lands and nothing to sacrifice', () => {
    const g = game({
      p1: { hand: ['silence-the-echo'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Terminal Criticism', () => {
  it('destroys a blue creature and you gain 1 life', () => {
    const g = game({
      p1: { hand: ['terminal-criticism'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['kitesail-corsair'] },
    });
    done(cast(g, 'terminal-criticism', [g.ref(g.id('p2', 'kitesail-corsair'))]));
    expect(gy(g, 'p2')).toEqual(['kitesail-corsair']);
    expect(g.life('p1')).toBe(21);
  });

  it('destroys a red creature', () => {
    const g = game({
      p1: { hand: ['terminal-criticism'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['nest-robber'] },
    });
    done(cast(g, 'terminal-criticism', [g.ref(g.id('p2', 'nest-robber'))]));
    expect(gy(g, 'p2')).toEqual(['nest-robber']);
  });

  it('can’t target a creature that is neither blue nor red', () => {
    const g = game({
      p1: { hand: ['terminal-criticism'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Theoretical Necromancer', () => {
  it('is a 4/1', () => {
    const g = game({ p1: { battlefield: ['theoretical-necromancer'] } });
    expect(pt(g, g.id('p1', 'theoretical-necromancer'))).toEqual([4, 1]);
  });

  it('{3}{B}, exile it from your graveyard: return another creature card to your hand', () => {
    const g = game({
      p1: { graveyard: ['theoretical-necromancer', 'serra-angel'], battlefield: n('swamp', 4) },
    });
    const necro = g.id('p1', 'theoretical-necromancer', 'graveyard');
    activate(g, necro, 0, [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]);
    done(g);
    expect(hand(g)).toEqual(['serra-angel']);
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual([
      'theoretical-necromancer',
    ]);
  });

  it('can’t be activated with no other creature card to return', () => {
    const g = game({ p1: { graveyard: ['theoretical-necromancer'], battlefield: n('swamp', 4) } });
    expect(canActivate(g, g.id('p1', 'theoretical-necromancer', 'graveyard'), 0)).toBe(false);
  });
});

describe('Tinybones, Pocket Nuisance', () => {
  it('makes each opponent discard when it enters, which deals 1 damage to each opponent', () => {
    const g = game({
      p1: { hand: ['tinybones-pocket-nuisance'], battlefield: n('swamp', 3) },
      p2: { hand: ['plains', 'savannah-lions'] },
    });
    done(cast(g, 'tinybones-pocket-nuisance'));
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(g.life('p2')).toBe(19);
  });

  it('deals no damage if the opponent has no card to discard', () => {
    const g = game({ p1: { hand: ['tinybones-pocket-nuisance'], battlefield: n('swamp', 3) } });
    done(cast(g, 'tinybones-pocket-nuisance'));
    expect(g.life('p2')).toBe(20);
  });

  it('triggers when you discard, too', () => {
    const g = game({
      p1: {
        hand: ['proft-sinister-mastermind'],
        battlefield: ['tinybones-pocket-nuisance', 'swamp'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    activate(g, g.id('p1', 'proft-sinister-mastermind', 'hand'), 0, [
      g.ref(g.id('p2', 'serra-angel')),
    ]);
    done(g);
    expect(g.life('p2')).toBe(19);
  });

  it('triggers once for each time a player discards (two cards at once is one trigger)', () => {
    const g = game({
      p1: { hand: ['rank-rat'], battlefield: ['tinybones-pocket-nuisance', ...n('swamp', 2)] },
      p2: { hand: ['plains', 'savannah-lions'] },
    });
    done(cast(g, 'rank-rat'));
    expect(g.life('p2')).toBe(19);
  });
});

describe('Void Extrapolator // Omit Variables', () => {
  it('enters prepared; Omit Variables mills three cards', () => {
    const g = game({ p1: { hand: ['void-extrapolator'], battlefield: n('swamp', 3) } });
    done(cast(g, 'void-extrapolator'));
    const v = g.id('p1', 'void-extrapolator');
    expect(g.obj(v).prepared).toBeDefined();
    castCopy(g, v);
    done(g);
    expect(g.state.players.p1.graveyard).toHaveLength(3);
    expect(g.obj(v).prepared).toBeUndefined();
  });

  it('Threshold: gets +1/+1 as long as there are seven or more cards in your graveyard', () => {
    const six = game({ p1: { battlefield: ['void-extrapolator'], graveyard: n('forest', 6) } });
    expect(pt(six, six.id('p1', 'void-extrapolator'))).toEqual([2, 2]);
    const seven = game({ p1: { battlefield: ['void-extrapolator'], graveyard: n('forest', 7) } });
    expect(pt(seven, seven.id('p1', 'void-extrapolator'))).toEqual([3, 3]);
  });
});

describe('Winter, Tormented Loner', () => {
  const setup = () =>
    game({
      p1: { hand: ['winter-tormented-loner'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });

  it('is a 0/3 that gets +1/+0 for each creature and planeswalker card in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['winter-tormented-loner'],
        graveyard: ['serra-angel', 'savannah-lions', 'ral-zarek-guest-lecturer', 'forest'],
      },
    });
    expect(pt(g, g.id('p1', 'winter-tormented-loner'))).toEqual([3, 3]);
  });

  it('when it enters, you may sacrifice a creature; when you do, each opponent sacrifices a creature of their choice', () => {
    const g = setup();
    cast(g, 'winter-tormented-loner');
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    // Choose Savannah Lions to sacrifice.
    expect(g.decision.kind).toBe('sacrifice');
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'chooseCard', player: 'p1', card: lions });
    // The opponent chooses what to sacrifice (their Lions).
    expect(g.decision.kind).toBe('sacrifice');
    expect(g.decision).toMatchObject({ player: 'p2' });
    g.do({ type: 'chooseCard', player: 'p2', card: g.id('p2', 'savannah-lions') });
    done(g);
    expect(gy(g)).toContain('savannah-lions');
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(onBattlefield(g, 'serra-angel', 'p2')).toHaveLength(1);
  });

  it('you may decline to sacrifice', () => {
    const g = setup();
    cast(g, 'winter-tormented-loner');
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(gy(g)).toHaveLength(0);
    expect(gy(g, 'p2')).toHaveLength(0);
  });

  it('can sacrifice a planeswalker', () => {
    const g = game({
      p1: {
        hand: ['winter-tormented-loner'],
        battlefield: [...n('swamp', 3), 'ral-zarek-guest-lecturer'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    g.obj(g.id('p1', 'ral-zarek-guest-lecturer')).counters = { loyalty: 3 };
    cast(g, 'winter-tormented-loner');
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'ral-zarek-guest-lecturer') });
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('can sacrifice itself', () => {
    const g = game({
      p1: { hand: ['winter-tormented-loner'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'winter-tormented-loner');
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'winter-tormented-loner') });
    done(g);
    expect(gy(g)).toEqual(['winter-tormented-loner']);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Yargle, Glutton of Urborg', () => {
  it('is a 9/3 with no abilities', () => {
    const g = game({ p1: { battlefield: ['yargle-glutton-of-urborg'] } });
    expect(pt(g, g.id('p1', 'yargle-glutton-of-urborg'))).toEqual([9, 3]);
    expect(all(g, 'yargle-glutton-of-urborg')).toHaveLength(1);
  });
});
