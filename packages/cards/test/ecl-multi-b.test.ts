import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Lorwyn Eclipsed 18b, multi-b: W/B, U/R, B/G, R/W, G/U and three-colour gold cards.

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;
const colorsOf = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).colors,
];

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
}

/** Resolves the stack and any choices with simple defaults (bounded). */
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
    else if (d.kind === 'chooseObject' || d.kind === 'searchLibrary') {
      const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card);
      g.do(pick ?? { type: 'chooseCard', player: d.player, card: null });
    } else if (d.kind === 'sacrificeSeveral' || d.kind === 'sacrifice') {
      g.do(g.legal()[0]!);
    } else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

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

const NAMES = [
  'Abigale, Eloquent First-Year',
  "Ashling's Command",
  'Bre of Clan Stoutarm',
  'Chitinous Graspling',
  'Doran, Besieged by Time',
  'Eclipsed Elf',
  'Eclipsed Flamekin',
  'Feisty Spikeling',
  'Flaring Cinder',
  'Glister Bairn',
  'High Perfect Morcant',
  'Hovel Hurler',
  'Kirol, Attentive First-Year',
  'Lluwen, Imperfect Naturalist',
  'Maralen, Fae Ascendant',
  "Morcant's Loyalist",
  'Prideful Feastling',
  'Reaping Willow',
  'Sanar, Innovative First-Year',
  'Stoic Grove-Guide',
  'Tam, Mindful First-Year',
  "Trystan's Command",
  'Twinflame Travelers',
];
const get = (name: string) => [...cardDb.values()].find((c) => c.name === name && !c.isToken)!;

describe('the pool', () => {
  it('has every multi-b card with its printed characteristics', () => {
    for (const name of NAMES) expect(get(name), name).toBeDefined();
    expect(get('Abigale, Eloquent First-Year').keywords).toEqual(
      expect.arrayContaining(['flying', 'firstStrike', 'lifelink']),
    );
    expect(get('Chitinous Graspling').keywords).toEqual(expect.arrayContaining(['changeling', 'reach']));
    expect(get('Prideful Feastling').keywords).toEqual(
      expect.arrayContaining(['changeling', 'lifelink']),
    );
    expect(get('Feisty Spikeling').keywords).toContain('changeling');
    expect(get('Reaping Willow').keywords).toContain('lifelink');
    expect(get('Twinflame Travelers').keywords).toContain('flying');
    expect(get('Maralen, Fae Ascendant').keywords).toContain('flying');
    expect(get('Eclipsed Elf').manaCost.hybrid).toHaveLength(3);
    expect(get("Ashling's Command").types).toContain('Instant');
    expect(get("Trystan's Command").types).toContain('Sorcery');
  });
});

describe('Chitinous Graspling and Prideful Feastling', () => {
  it('are every creature type', () => {
    const g = game({ p1: { battlefield: ['chitinous-graspling', 'prideful-feastling'] } });
    const elfGuide = game({
      p1: { battlefield: ['prideful-feastling', 'morcants-loyalist'] },
    });
    expect(pt(g, g.id('p1', 'chitinous-graspling'))).toEqual([3, 4]);
    // A changeling is an Elf: the Loyalist's anthem reaches it.
    expect(pt(elfGuide, elfGuide.id('p1', 'prideful-feastling'))).toEqual([3, 4]);
  });
});

describe('Abigale, Eloquent First-Year', () => {
  it('makes another creature lose all abilities and gives it flying, first strike and lifelink counters', () => {
    const g = game({
      p1: { hand: ['abigale-eloquent-first-year'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'abigale-eloquent-first-year');
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    done(g);
    const angel = g.id('p2', 'serra-angel');
    const k = keywords(g, angel);
    expect(k).toEqual(expect.arrayContaining(['flying', 'firstStrike', 'lifelink']));
    expect(k).not.toContain('vigilance');
    expect(g.obj(angel).counters).toMatchObject({ flying: 1, firstStrike: 1, lifelink: 1 });
    // The loss is permanent: it is still blank next turn.
    expect(g.obj(angel).blank).toBe(true);
    expect(g.state.effects.some((e) => e.loseAbilities && e.expires === 'permanent')).toBe(true);
  });

  it('may choose no target', () => {
    const g = game({
      p1: { hand: ['abigale-eloquent-first-year'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'abigale-eloquent-first-year');
    g.pass();
    g.pass();
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 0));
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).counters?.flying).toBeUndefined();
    expect(all(g, 'abigale-eloquent-first-year')).toHaveLength(1);
  });
});

const player = (p: 'p1' | 'p2') => ({ player: p });
// Modes of a "choose two" command, in pair order.
const PAIRS = { '0+1': 0, '0+2': 1, '0+3': 2, '1+2': 3, '1+3': 4, '2+3': 5 } as const;
const tokens = (g: GameDriver, defId: string, p: 'p1' | 'p2') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === p);

describe("Ashling's Command", () => {
  const base = () =>
    game({
      p1: {
        hand: ['ashlings-command'],
        battlefield: [...n('island', 3), ...n('mountain', 2), 'eclipsed-flamekin'],
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });

  it('has six choose-two options', () => {
    expect(cardDb.get('ashlings-command')!.modes).toHaveLength(6);
  });

  it('copy of an Elemental and target player draws two', () => {
    const g = base();
    const fk = g.id('p1', 'eclipsed-flamekin');
    cast(g, 'ashlings-command', [g.ref(fk), player('p1')], { mode: PAIRS['0+1'] });
    done(g);
    expect(all(g, 'eclipsed-flamekin')).toHaveLength(2);
    expect(hand(g).length).toBeGreaterThanOrEqual(2);
  });

  it('2 damage to each creature target player controls and that player creates two Treasures', () => {
    const g = base();
    cast(g, 'ashlings-command', [player('p2'), player('p2')], { mode: PAIRS['2+3'] });
    done(g);
    // The Angel (4/4) survives, the Lions (2/1) die.
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
    expect(tokens(g, 'treasure-token', 'p2')).toHaveLength(2);
    // Mine is untouched.
    expect(g.obj(g.id('p1', 'eclipsed-flamekin')).damage).toBe(0);
  });

  it('draw two (opponent) and two Treasures (you) can name different players', () => {
    const g = base();
    cast(g, 'ashlings-command', [player('p2'), player('p1')], { mode: PAIRS['1+3'] });
    done(g);
    expect(hand(g, 'p2')).toHaveLength(2);
    expect(tokens(g, 'treasure-token', 'p1')).toHaveLength(2);
    expect(tokens(g, 'treasure-token', 'p2')).toHaveLength(0);
  });
});

describe("Trystan's Command", () => {
  const lands = [...n('swamp', 3), ...n('forest', 3)];

  it('copy of an Elf you control and destroy a creature', () => {
    const g = game({
      p1: { hand: ['trystans-command'], battlefield: [...lands, 'morcants-loyalist'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const loyalist = g.id('p1', 'morcants-loyalist');
    cast(g, 'trystans-command', [g.ref(loyalist), g.ref(g.id('p2', 'serra-angel'))], {
      mode: PAIRS['0+2'],
    });
    done(g);
    expect(all(g, 'morcants-loyalist')).toHaveLength(2);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('returns one or two permanent cards from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['trystans-command'],
        battlefield: lands,
        graveyard: ['savannah-lions', 'forest', 'bear-cub'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const a = g.id('p1', 'savannah-lions', 'graveyard');
    const b = g.id('p1', 'forest', 'graveyard');
    // The mode with the optional second target comes last in the target list.
    cast(g, 'trystans-command', [g.ref(g.id('p2', 'serra-angel')), g.ref(a), g.ref(b)], {
      mode: PAIRS['1+2'],
    });
    done(g);
    expect(hand(g)).toEqual(expect.arrayContaining(['savannah-lions', 'forest']));
    expect(gy(g)).toContain('bear-cub');
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('can return just one card', () => {
    const g = game({
      p1: { hand: ['trystans-command'], battlefield: lands, graveyard: ['savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const a = g.id('p1', 'savannah-lions', 'graveyard');
    cast(g, 'trystans-command', [g.ref(g.id('p2', 'serra-angel')), g.ref(a)], {
      mode: PAIRS['1+2'],
    });
    done(g);
    expect(hand(g)).toContain('savannah-lions');
  });

  it('creatures target player controls get +3/+3 and untap', () => {
    const g = game({
      p1: {
        hand: ['trystans-command'],
        battlefield: [...lands, { card: 'savannah-lions', tapped: true }, 'morcants-loyalist'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const loyalist = g.id('p1', 'morcants-loyalist');
    cast(g, 'trystans-command', [g.ref(loyalist), player('p1')], { mode: PAIRS['0+3'] });
    done(g);
    const lions = all(g, 'savannah-lions')[0]!;
    expect(g.obj(lions).tapped).toBe(false);
    // 2/1 with +3/+3 (Savannah Lions is no Elf).
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

/** Passes priority until it is `step` (of the turn after the current one if it already is). */
function passToStep(g: GameDriver, step: string): void {
  for (let i = 0; i < 60; i++) {
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority until the end step has begun (its triggers are on the stack). */
function toEndStep(g: GameDriver): void {
  for (let i = 0; i < 40 && g.state.turn.step !== 'end'; i++) {
    if (g.decision.kind !== 'priority') throw new Error(`stuck at ${g.decision.kind}`);
    g.pass();
  }
  expect(g.state.turn.step).toBe('end');
}

/** Passes priority until the attackers are to be declared. */
function toAttackers(g: GameDriver): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareAttackers');
}

/** Pretends `amount` life was gained by `p` this turn (the scenario state isn't frozen yet). */
function gainedLife(g: GameDriver, amount: number, p: 'p1' | 'p2' = 'p1'): void {
  g.state.turn.lifeGains[p] = 1;
  g.state.turn.lifeGained = { p1: 0, p2: 0, [p]: amount };
}

/** Answers a free-cast decision by casting the card, if it is offered. */
function castFreeNow(g: GameDriver): boolean {
  const cast = g.legal().find((a) => a.type === 'castSpell');
  if (!cast) return false;
  g.do(cast);
  return true;
}

describe('Bre of Clan Stoutarm', () => {
  it('{1}{W}, {T}: another target creature you control gains flying and lifelink until end of turn', () => {
    const g = game({
      p1: { battlefield: ['bre-of-clan-stoutarm', 'savannah-lions', 'plains', 'plains'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'bre-of-clan-stoutarm'), 0, [g.ref(lions)]);
    done(g);
    expect(keywords(g, lions)).toEqual(expect.arrayContaining(['flying', 'lifelink']));
    expect(g.obj(g.id('p1', 'bre-of-clan-stoutarm')).tapped).toBe(true);
    // She can't target herself.
    const g2 = game({ p1: { battlefield: ['bre-of-clan-stoutarm', 'plains', 'plains'] } });
    expect(g2.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('end step: you may cast the nonland card for free if its mana value is at most the life gained', () => {
    const g = game({
      p1: {
        battlefield: ['bre-of-clan-stoutarm'],
        library: ['forest', 'forest', 'savannah-lions', 'bear-cub'],
      },
      step: 'main2',
    });
    gainedLife(g, 3);
    toEndStep(g);
    // The trigger is on the stack; resolve it up to the cast.
    for (let i = 0; i < 6 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).toBe('castFree');
    expect(exile(g)).toEqual(['forest', 'forest', 'savannah-lions']);
    expect(castFreeNow(g)).toBe(true);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(library(g)[0]).toBe('bear-cub');
  });

  it('end step: a card with a higher mana value goes into your hand', () => {
    const g = game({
      p1: { battlefield: ['bre-of-clan-stoutarm'], library: ['serra-angel', 'forest'] },
      step: 'main2',
    });
    gainedLife(g, 2);
    passToStep(g, 'end');
    done(g);
    expect(hand(g)).toEqual(['serra-angel']);
  });

  it('end step: declining the free cast leaves the card in exile', () => {
    const g = game({
      p1: { battlefield: ['bre-of-clan-stoutarm'], library: ['savannah-lions', 'forest'] },
      step: 'main2',
    });
    gainedLife(g, 4);
    toEndStep(g);
    for (let i = 0; i < 6 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(exile(g)).toEqual(['savannah-lions']);
    expect(hand(g)).toEqual([]);
  });

  it('does nothing at the end step if you gained no life', () => {
    const g = game({
      p1: { battlefield: ['bre-of-clan-stoutarm'], library: ['savannah-lions', 'forest'] },
      step: 'main2',
    });
    passToStep(g, 'end');
    done(g);
    expect(exile(g)).toEqual([]);
    expect(library(g)[0]).toBe('savannah-lions');
  });
});

describe('Doran, Besieged by Time', () => {
  it('creature spells with toughness greater than power cost {1} less', () => {
    const g = game({
      p1: {
        hand: ['glister-bairn', 'savannah-lions'],
        battlefield: ['doran-besieged-by-time', ...n('forest', 5)],
      },
    });
    // The 1/4 Bairn costs {5}; with Doran it costs {4}, and a fifth land stays untapped.
    cast(g, 'glister-bairn');
    done(g);
    expect(all(g, 'glister-bairn')).toHaveLength(1);
    // Four of the five lands were tapped.
    const untapped = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'forest' && !g.obj(id).tapped,
    );
    expect(untapped).toHaveLength(1);
  });

  it("a creature spell that isn't toughness over power gets no discount", () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['doran-besieged-by-time', ...n('plains', 4)],
      },
    });
    // Serra Angel is 4/4 and costs {3}{W}{W}: no discount, so four lands are not enough.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('an attacking creature gets +X/+X, X the difference between its power and toughness', () => {
    const g = game({
      p1: { battlefield: ['doran-besieged-by-time'] },
    });
    const doran = g.id('p1', 'doran-besieged-by-time');
    toAttackers(g);
    g.attack(doran);
    done(g);
    // 0/5: X = 5.
    expect(pt(g, doran)).toEqual([5, 10]);
  });

  it('a blocking creature gets it too, including one that is not Doran', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['doran-besieged-by-time', 'glister-bairn'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    toAttackers(g);
    g.attack(lions);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    const bairn = g.id('p2', 'glister-bairn');
    g.do({ type: 'addBlock', player: 'p2', blocker: bairn, attacker: lions });
    g.do({ type: 'confirmBlockers', player: 'p2' });
    done(g);
    // The 1/4 Bairn: X = 3.
    expect(pt(g, bairn)).toEqual([4, 7]);
  });
});
