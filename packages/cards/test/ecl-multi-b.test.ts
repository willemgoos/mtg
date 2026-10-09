import { describe, expect, it } from 'vitest';
import { getCharacteristics, getColors } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { ECL_WORM } from '../src/ecl/multi-b.ts';
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
const colorsOf = (g: GameDriver, id: string) => [...getColors(g.state, cardDb, id)];

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
    } else if (d.kind === 'discard') {
      g.do(g.legal()[0]!);
    } else if (d.kind === 'sacrificeSeveral' || d.kind === 'sacrifice') {
      g.do(g.legal()[0]!);
    } else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

/** Passes priority while something is on the stack, until a decision other than priority comes up. */
function resolveStack(g: GameDriver): GameDriver {
  for (let i = 0; i < 20 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
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

describe('Eclipsed Elf and Eclipsed Flamekin', () => {
  it('Eclipsed Elf: look at four, take an Elf, Swamp or Forest card, the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-elf'],
        battlefield: n('swamp', 3),
        library: ['bear-cub', 'island', 'thornweald-archer', 'mountain', ...n('plains', 6)],
      },
    });
    cast(g, 'eclipsed-elf');
    done(g);
    expect(hand(g)).toEqual(['thornweald-archer']);
    const lib = library(g);
    expect(lib).toHaveLength(9);
    expect(lib.slice(0, 6)).toEqual(n('plains', 6));
    expect([...lib.slice(6)].sort()).toEqual(['bear-cub', 'island', 'mountain']);
  });

  it('Eclipsed Elf: a Forest card counts, a Plains does not, and you may take nothing', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-elf'],
        battlefield: n('swamp', 3),
        library: ['plains', 'forest', 'bear-cub', 'island', ...n('plains', 6)],
      },
    });
    cast(g, 'eclipsed-elf');
    done(g);
    expect(hand(g)).toEqual(['forest']);
    const g2 = game({
      p1: {
        hand: ['eclipsed-elf'],
        battlefield: n('swamp', 3),
        library: ['plains', 'mountain', 'bear-cub', 'island', ...n('plains', 6)],
      },
    });
    cast(g2, 'eclipsed-elf');
    done(g2);
    expect(hand(g2)).toEqual([]);
    expect(library(g2)).toHaveLength(10);
  });

  it('Eclipsed Flamekin: an Elemental, Island or Mountain card', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-flamekin'],
        battlefield: n('island', 3),
        library: ['bear-cub', 'fire-elemental', 'forest', 'plains', ...n('forest', 6)],
      },
    });
    cast(g, 'eclipsed-flamekin');
    done(g);
    expect(hand(g)).toEqual(['fire-elemental']);
    const g2 = game({
      p1: {
        hand: ['eclipsed-flamekin'],
        battlefield: n('island', 3),
        library: ['bear-cub', 'mountain', 'forest', 'plains', ...n('forest', 6)],
      },
    });
    cast(g2, 'eclipsed-flamekin');
    done(g2);
    expect(hand(g2)).toEqual(['mountain']);
  });
});

describe('Feisty Spikeling', () => {
  it('has first strike only during your turn', () => {
    const g = game({ p1: { battlefield: ['feisty-spikeling'] } });
    const sp = g.id('p1', 'feisty-spikeling');
    expect(keywords(g, sp)).toContain('firstStrike');
    const g2 = game({ p1: { battlefield: ['feisty-spikeling'] }, active: 'p2' });
    expect(keywords(g2, g2.id('p1', 'feisty-spikeling'))).not.toContain('firstStrike');
  });
});

describe('Flaring Cinder', () => {
  it('when it enters, you may discard a card; if you do, draw a card', () => {
    const g = game({
      p1: {
        hand: ['flaring-cinder', 'savannah-lions'],
        battlefield: [...n('island', 2), 'mountain'],
        library: ['bear-cub', ...n('forest', 9)],
      },
    });
    cast(g, 'flaring-cinder');
    done(g, { accept: true });
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(hand(g)).toEqual(['bear-cub']);
  });

  it('declining draws nothing', () => {
    const g = game({
      p1: {
        hand: ['flaring-cinder', 'savannah-lions'],
        battlefield: [...n('island', 2), 'mountain'],
        library: ['bear-cub', ...n('forest', 9)],
      },
    });
    cast(g, 'flaring-cinder');
    done(g, { accept: false });
    expect(gy(g)).toEqual([]);
    expect(hand(g)).toEqual(['savannah-lions']);
  });

  it('triggers on a spell with mana value 4 or more, not on a cheaper one', () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'savannah-lions', 'bear-cub'],
        battlefield: ['flaring-cinder', ...n('plains', 6)],
        library: ['island', ...n('forest', 9)],
      },
    });
    cast(g, 'savannah-lions');
    expect(g.state.stack.some((x) => x.kind === 'ability')).toBe(false);
    done(g, { accept: true });
    cast(g, 'serra-angel');
    expect(g.state.stack.some((x) => x.kind === 'ability')).toBe(true);
    done(g, { accept: true });
    // One card was discarded and one drawn (the Island): the Cub is gone from the hand.
    expect(gy(g)).toEqual(['bear-cub']);
    expect(hand(g)).toEqual(['island']);
  });
});

describe('Glister Bairn', () => {
  it('at the beginning of combat, another target creature you control gets +X/+X for the colors among your permanents', () => {
    const g = game({
      p1: { battlefield: ['glister-bairn', 'savannah-lions', 'forest'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    for (let i = 0; i < 6 && g.state.turn.step !== 'beginCombat'; i++) g.pass();
    done(g);
    // Bairn is green and blue, the Lions white: three colors.
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(pt(g, g.id('p1', 'glister-bairn'))).toEqual([1, 4]);
  });

  it('counts colors again as they change', () => {
    const g = game({
      p1: { battlefield: ['glister-bairn', 'savannah-lions', 'morcants-loyalist'] },
    });
    for (let i = 0; i < 6 && g.state.turn.step !== 'beginCombat'; i++) g.pass();
    done(g);
    // Green, blue, white, black.
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([6, 5]);
  });
});

describe('Hovel Hurler', () => {
  it('enters with two -1/-1 counters on it', () => {
    const g = game({
      p1: { hand: ['hovel-hurler'], battlefield: n('mountain', 5) },
    });
    cast(g, 'hovel-hurler');
    done(g);
    const hurler = g.id('p1', 'hovel-hurler');
    expect(minus(g, hurler)).toBe(2);
    expect(pt(g, hurler)).toEqual([4, 5]);
  });

  it('removes a counter to give another creature +1/+0 and flying, only as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['hovel-hurler', 'savannah-lions', 'mountain', 'plains'] },
    });
    const hurler = g.id('p1', 'hovel-hurler');
    g.obj(hurler).counters = { '-1/-1': 2 };
    const lions = g.id('p1', 'savannah-lions');
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === hurler && a.targets.length === 1);
    expect(act).toBeDefined();
    g.do(act!);
    done(g);
    expect(minus(g, hurler)).toBe(1);
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('flying');
    // It can't be activated while a spell is on the stack.
    const g2 = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['hovel-hurler', 'savannah-lions', 'plains', 'plains', 'mountain'],
      },
    });
    g2.obj(g2.id('p1', 'hovel-hurler')).counters = { '-1/-1': 2 };
    cast(g2, 'savannah-lions');
    expect(g2.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it("can't be activated with no counters on it", () => {
    const g = game({
      p1: { battlefield: ['hovel-hurler', 'savannah-lions', 'mountain', 'plains'] },
    });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Reaping Willow', () => {
  it('enters with two -1/-1 counters; removing both returns a creature card with mana value 3 or less', () => {
    const g = game({
      p1: {
        hand: ['reaping-willow'],
        battlefield: n('swamp', 4),
        graveyard: ['savannah-lions', 'serra-angel'],
      },
    });
    cast(g, 'reaping-willow');
    done(g);
    const willow = g.id('p1', 'reaping-willow');
    expect(minus(g, willow)).toBe(2);
    expect(pt(g, willow)).toEqual([1, 4]);
    // Untap lands (they were tapped for the cast) by building a fresh position with the Willow on the field.
    const h = game({
      p1: {
        battlefield: ['reaping-willow', 'swamp', 'plains'],
        graveyard: ['savannah-lions', 'serra-angel'],
      },
    });
    const w = h.id('p1', 'reaping-willow');
    h.obj(w).counters = { '-1/-1': 2 };
    const acts = h.legal().filter((a) => a.type === 'activateAbility');
    // Only the Lions (mana value 1) is a legal target, not the Angel (5).
    expect(acts).toHaveLength(1);
    h.do(acts[0]!);
    done(h);
    expect(all(h, 'savannah-lions')).toHaveLength(1);
    expect(gy(h)).toEqual(['serra-angel']);
    expect(minus(h, w)).toBe(0);
    expect(pt(h, w)).toEqual([3, 6]);
  });

  it('needs two counters to activate', () => {
    const g = game({
      p1: { battlefield: ['reaping-willow', 'swamp', 'plains'], graveyard: ['savannah-lions'] },
    });
    g.obj(g.id('p1', 'reaping-willow')).counters = { '-1/-1': 1 };
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Stoic Grove-Guide', () => {
  it('exiles itself from the graveyard to create a 2/2 black and green Elf, as a sorcery', () => {
    const g = game({
      p1: { graveyard: ['stoic-grove-guide'], battlefield: ['swamp', 'forest'] },
    });
    activate(g, g.id('p1', 'stoic-grove-guide', 'graveyard'), 0);
    done(g);
    const elf = g.state.battlefield.find((id) => g.obj(id).defId === 'ecl-elf-token')!;
    expect(elf).toBeDefined();
    expect(pt(g, elf)).toEqual([2, 2]);
    expect(colorsOf(g, elf).sort()).toEqual(['B', 'G']);
    expect(exile(g)).toContain('stoic-grove-guide');
    expect(gy(g)).not.toContain('stoic-grove-guide');
    const g2 = game({
      p1: { graveyard: ['stoic-grove-guide'], battlefield: ['swamp', 'forest'] },
      step: 'declareAttackers',
    });
    expect(g2.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe("Morcant's Loyalist", () => {
  it('gives other Elves +1/+1', () => {
    const g = game({
      p1: { battlefield: ['morcants-loyalist', 'thornweald-archer', 'savannah-lions'] },
    });
    expect(pt(g, g.id('p1', 'morcants-loyalist'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'thornweald-archer'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('when it dies, return another target Elf card from your graveyard to your hand', () => {
    const g = game({
      p1: { battlefield: ['morcants-loyalist'], graveyard: ['thornweald-archer', 'bear-cub'] },
      p2: { hand: ['lightning-strike'], battlefield: ['mountain', 'mountain'] },
      active: 'p2',
    });
    cast(g, 'lightning-strike', [g.ref(g.id('p1', 'morcants-loyalist'))]);
    g.pass();
    g.pass();
    settle(g);
    done(g);
    expect(hand(g)).toEqual(['thornweald-archer']);
    expect(gy(g)).toEqual(expect.arrayContaining(['bear-cub', 'morcants-loyalist']));
  });
});

describe('High Perfect Morcant', () => {
  it('whenever she or another Elf you control enters, each opponent blights 1', () => {
    const g = game({
      p1: { hand: ['thornweald-archer'], battlefield: ['high-perfect-morcant', 'forest', 'forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'thornweald-archer');
    done(g);
    // The opponent has one creature: no choice, the counter goes on it.
    expect(minus(g, g.id('p2', 'bear-cub'))).toBe(1);
    // Morcant herself entering also blights.
    const h = game({
      p1: { hand: ['high-perfect-morcant'], battlefield: [...n('swamp', 2), ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(h, 'high-perfect-morcant');
    done(h);
    expect(minus(h, h.id('p2', 'bear-cub'))).toBe(1);
  });

  it('the opponent chooses which of their creatures to blight', () => {
    const g = game({
      p1: { hand: ['thornweald-archer'], battlefield: ['high-perfect-morcant', 'forest', 'forest'] },
      p2: { battlefield: ['bear-cub', 'savannah-lions'] },
    });
    cast(g, 'thornweald-archer');
    resolveStack(g);
    // Blight is the opponent's choice: a creature of theirs, chosen by them.
    expect(g.actor).toBe('p2');
    const lions = g.id('p2', 'savannah-lions');
    const pick = g.legal().find((a) => JSON.stringify(a).includes(lions));
    expect(pick).toBeDefined();
    g.do(pick!);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(minus(g, g.id('p2', 'bear-cub'))).toBe(0);
  });

  it('tap three untapped Elves you control: proliferate, as a sorcery', () => {
    const g = game({
      p1: {
        battlefield: ['high-perfect-morcant', 'thornweald-archer', 'morcants-loyalist', 'savannah-lions'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const morcant = g.id('p1', 'high-perfect-morcant');
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === morcant);
    // Three Elves, so the three of them are the only way to pay, in any order.
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect((a as { tapArtifacts: string[] }).tapArtifacts).toHaveLength(3);
      expect(new Set((a as { tapArtifacts: string[] }).tapArtifacts).size).toBe(3);
      expect((a as { tapArtifacts: string[] }).tapArtifacts).not.toContain(lions);
    }
    g.do(acts[0]!);
    for (const id of ['high-perfect-morcant', 'thornweald-archer', 'morcants-loyalist'])
      expect(g.obj(g.id('p1', id)).tapped).toBe(true);
    // Proliferate: choose the Lions.
    expect(g.state.stack).toHaveLength(1);
    g.pass();
    g.pass();
    const pick = g.legal().find((a) => JSON.stringify(a).includes(lions));
    if (pick) g.do(pick);
    done(g);
    expect(g.obj(lions).plusOneCounters).toBe(2);
  });

  it("needs three untapped Elves (a changeling is one), and isn't an instant", () => {
    const g = game({
      p1: {
        battlefield: [
          'high-perfect-morcant',
          'thornweald-archer',
          { card: 'morcants-loyalist', tapped: true },
        ],
      },
    });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
    const h = game({
      p1: { battlefield: ['high-perfect-morcant', 'thornweald-archer', 'prideful-feastling'] },
    });
    expect(h.legal().some((a) => a.type === 'activateAbility')).toBe(true);
    const i = game({
      p1: {
        battlefield: ['high-perfect-morcant', 'thornweald-archer', 'prideful-feastling'],
      },
      step: 'declareAttackers',
    });
    expect(i.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('offers one action per way of choosing which Elves to tap', () => {
    const g = game({
      p1: {
        battlefield: [
          'high-perfect-morcant',
          'thornweald-archer',
          'morcants-loyalist',
          'prideful-feastling',
        ],
      },
    });
    const morcant = g.id('p1', 'high-perfect-morcant');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === morcant);
    // Four Elves, ordered picks of three: 4 * 3 * 2.
    expect(acts).toHaveLength(24);
  });
});

describe('Kirol, Attentive First-Year', () => {
  it('tap two untapped creatures: copy target triggered ability you control (once each turn)', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-flamekin'],
        battlefield: ['kirol-attentive-first-year', 'savannah-lions', ...n('island', 3)],
        library: [
          'fire-elemental',
          ...n('forest', 3),
          'quaketusk-boar',
          ...n('forest', 3),
          ...n('plains', 3),
        ],
      },
    });
    const kirol = g.id('p1', 'kirol-attentive-first-year');
    cast(g, 'eclipsed-flamekin');
    g.pass();
    g.pass();
    // The enters trigger is on the stack (it may need no targets).
    expect(g.state.stack.some((x) => x.kind === 'ability')).toBe(true);
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === kirol);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    // Two creatures tapped for the cost.
    const tapped = (acts[0] as { tapArtifacts: string[] }).tapArtifacts;
    expect(tapped).toHaveLength(2);
    for (const id of tapped) expect(g.obj(id).tapped).toBe(true);
    done(g);
    // The copy and the original each looked at four: both Elementals are in hand.
    expect(hand(g).sort()).toEqual(['fire-elemental', 'quaketusk-boar']);
    // Once each turn.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === kirol)).toBe(false);
  });

  it("can't copy an activated ability", () => {
    const g = game({
      p1: {
        battlefield: [
          'kirol-attentive-first-year',
          'bre-of-clan-stoutarm',
          'savannah-lions',
          'plains',
          'plains',
        ],
      },
    });
    const bre = g.id('p1', 'bre-of-clan-stoutarm');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, bre, 0, [g.ref(lions)]);
    // Bre's activated ability is on the stack: Kirol has nothing to copy.
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === g.id('p1', 'kirol-attentive-first-year'),
        ),
    ).toBe(false);
  });
});

describe('Lluwen, Imperfect Naturalist', () => {
  it('mills four, then you may put a creature or land card from among them on top of your library', () => {
    const g = game({
      p1: {
        hand: ['lluwen-imperfect-naturalist'],
        battlefield: ['swamp', 'forest'],
        library: ['bear-cub', 'forest', 'lightning-strike', 'mountain', ...n('plains', 6)],
      },
    });
    cast(g, 'lluwen-imperfect-naturalist');
    resolveStack(g);
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as { options: { label: string }[] };
    // Bear Cub, Forest and Mountain are eligible; the Lightning Strike is not.
    expect(d.options.map((o) => o.label)).toEqual([
      'Put Bear Cub on top of your library',
      'Put Forest on top of your library',
      'Put Mountain on top of your library',
      'Put none of them on top',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    done(g);
    expect(library(g)[0]).toBe('bear-cub');
    expect(gy(g).sort()).toEqual(['forest', 'lightning-strike', 'mountain']);
  });

  it('may put none of them back', () => {
    const g = game({
      p1: {
        hand: ['lluwen-imperfect-naturalist'],
        battlefield: ['swamp', 'forest'],
        library: ['bear-cub', 'forest', 'lightning-strike', 'mountain', ...n('plains', 6)],
      },
    });
    cast(g, 'lluwen-imperfect-naturalist');
    done(g, { option: /none/ });
    expect(library(g)).toEqual(n('plains', 6));
    expect(gy(g)).toHaveLength(4);
  });

  it('offers nothing when no creature or land was milled', () => {
    const g = game({
      p1: {
        hand: ['lluwen-imperfect-naturalist'],
        battlefield: ['swamp', 'forest'],
        library: [...n('lightning-strike', 4), ...n('plains', 6)],
      },
    });
    cast(g, 'lluwen-imperfect-naturalist');
    resolveStack(g);
    expect(g.decision.kind).toBe('priority');
    expect(gy(g)).toHaveLength(4);
  });

  it('{2}{B/G}{B/G}{B/G}, {T}, discard a land: a Worm for each land card in your graveyard', () => {
    const g = game({
      p1: {
        hand: ['forest', 'bear-cub'],
        battlefield: ['lluwen-imperfect-naturalist', ...n('swamp', 3), ...n('forest', 2)],
        graveyard: ['island', 'mountain', 'bear-cub'],
      },
    });
    const lluwen = g.id('p1', 'lluwen-imperfect-naturalist');
    // Only a land card can be discarded.
    const acts = g.legal().filter((a) => a.type === 'activateAbility');
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    // The discarded Forest counts: three land cards.
    expect(all(g, ECL_WORM)).toHaveLength(3);
    expect(g.obj(lluwen).tapped).toBe(true);
    expect(hand(g)).toEqual(['bear-cub']);
    for (const w of all(g, ECL_WORM)) {
      expect(pt(g, w)).toEqual([1, 1]);
      expect(colorsOf(g, w).sort()).toEqual(['B', 'G']);
    }
  });
});

describe('Maralen, Fae Ascendant', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['thornweald-archer'],
        battlefield: ['maralen-fae-ascendant', 'forest', 'forest'],
      },
      p2: {
        library: ['savannah-lions', 'serra-angel', 'bear-cub', 'island', ...n('forest', 6)],
      },
    });

  /** The cast actions offered for a card in exile. */
  const exileCasts = (g: GameDriver) =>
    g
      .legal()
      .filter(
        (a) => a.type === 'castSpell' && g.obj(a.card).zone === 'exile',
      ) as unknown as { card: string; via?: string }[];

  it('whenever she or another Elf or Faerie you control enters, exile the top two cards of target opponent library', () => {
    const g = setup();
    cast(g, 'thornweald-archer');
    resolveStack(g);
    settle(g);
    resolveStack(g);
    expect(exile(g, 'p2')).toEqual(['savannah-lions', 'serra-angel']);
    expect(library(g, 'p2')[0]).toBe('bear-cub');
  });

  it('you may cast one of them free if its mana value is at most the Elves and Faeries you control, once each turn', () => {
    const g = setup();
    cast(g, 'thornweald-archer');
    resolveStack(g);
    settle(g);
    resolveStack(g);
    // Maralen and the Archer: two Elves and Faeries. The Lions (1) can be cast, the Angel (5) cannot.
    const casts = exileCasts(g);
    expect(casts).toHaveLength(1);
    expect(g.obj(casts[0]!.card).defId).toBe('savannah-lions');
    expect(casts[0]!.via).toBe('freeOnceEachTurn');
    // Only for free: it costs no mana, though the lands are tapped out anyway.
    g.do(casts[0] as never);
    done(g);
    const lions = all(g, 'savannah-lions')[0]!;
    expect(lions).toBeDefined();
    expect(g.obj(lions).controller).toBe('p1');
    // Once each turn: the Angel is out of reach anyway, but nothing else is offered either.
    expect(exileCasts(g)).toHaveLength(0);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });

  it('only cards exiled this turn, and once a turn even if two are cheap enough', () => {
    const g = game({
      p1: {
        hand: ['thornweald-archer'],
        battlefield: ['maralen-fae-ascendant', 'forest', 'forest'],
      },
      p2: { library: ['savannah-lions', 'savannah-lions', ...n('forest', 8)] },
    });
    cast(g, 'thornweald-archer');
    resolveStack(g);
    settle(g);
    resolveStack(g);
    expect(exileCasts(g)).toHaveLength(2);
    g.do(exileCasts(g)[0] as never);
    done(g);
    expect(exileCasts(g)).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    // Next turn: the other Lions are no longer castable.
    for (let i = 0; i < 80 && g.state.turn.number < 4; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.turn.number).toBeGreaterThanOrEqual(4);
    expect(exileCasts(g)).toHaveLength(0);
  });

  it("can't be cast with mana from exile, and her own count grows with Elves and Faeries", () => {
    const g = setup();
    cast(g, 'thornweald-archer');
    resolveStack(g);
    settle(g);
    resolveStack(g);
    // Every cast offered from exile is the free one.
    for (const c of exileCasts(g)) expect(c.via).toBe('freeOnceEachTurn');
    // A third Elf or Faerie makes the Bear Cub reach.
    const h = game({
      p1: {
        hand: ['thornweald-archer'],
        battlefield: ['maralen-fae-ascendant', 'prideful-feastling', 'forest', 'forest'],
      },
      p2: { library: ['serra-angel', 'serra-angel', ...n('forest', 8)] },
    });
    cast(h, 'thornweald-archer');
    resolveStack(h);
    settle(h);
    resolveStack(h);
    // Three: Maralen, Feastling (a changeling) and the Archer; the Angel costs five.
    expect(exileCasts(h)).toHaveLength(0);
  });
});

describe('Sanar, Innovative First-Year', () => {
  it('at the beginning of your first main phase: reveal until X nonland cards, exile a card of each color, shuffle, cast them this turn', () => {
    const g = game({
      p1: {
        battlefield: [
          'sanar-innovative-first-year',
          'savannah-lions',
          'bear-cub',
          ...n('plains', 2),
          ...n('forest', 2),
        ],
        library: [
          'island',
          'serra-angel',
          'forest',
          'thornweald-archer',
          'savannah-lions',
          'bear-cub',
          'island',
          ...n('forest', 3),
        ],
      },
      step: 'upkeep',
    });
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    expect(g.state.turn.step).toBe('main1');
    resolveStack(g);
    // White, blue, red, green among the permanents (Sanar is blue-red): four colors, four nonland cards.
    // White: Serra Angel or Savannah Lions.
    expect(g.decision.kind).toBe('chooseOption');
    const w = g.decision as { options: { label: string }[] };
    expect(w.options.map((o) => o.label)).toEqual([
      'Exile Serra Angel',
      'Exile Savannah Lions',
      'Exile no white card',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    // Blue and red: nothing among the revealed cards, so the prompt goes straight to green.
    expect(g.decision.kind).toBe('chooseOption');
    const gr = g.decision as { options: { label: string }[] };
    expect(gr.options.map((o) => o.label)).toEqual([
      'Exile Thornweald Archer',
      'Exile Bear Cub',
      'Exile no green card',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    resolveStack(g);
    expect(exile(g).sort()).toEqual(['bear-cub', 'serra-angel']);
    // The rest of the revealed cards went back into the library, which was shuffled.
    // Ten cards, one drawn for the turn, two exiled.
    expect(library(g)).toHaveLength(7);
    expect(library(g)).toEqual(expect.arrayContaining(['forest', 'thornweald-archer', 'savannah-lions']));
    // Cast the exiled Bear Cub this turn with mana.
    const casts = g.legal().filter((a) => a.type === 'castSpell' && g.obj(a.card).zone === 'exile');
    expect(casts.length).toBeGreaterThan(0);
    const cub = casts.find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bear-cub')!;
    g.do(cub);
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(2);
  });

  it('may exile no card of a color', () => {
    const g = game({
      p1: {
        battlefield: ['sanar-innovative-first-year'],
        library: ['forest', 'lightning-strike', 'island', 'savannah-lions', ...n('forest', 6)],
      },
      step: 'upkeep',
    });
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    resolveStack(g);
    // Blue and red: Lightning Strike is red.
    expect(g.decision.kind).toBe('chooseOption');
    expect((g.decision as { options: { label: string }[] }).options.map((o) => o.label)).toEqual([
      'Exile Lightning Strike',
      'Exile no red card',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    resolveStack(g);
    expect(exile(g)).toEqual([]);
    expect(library(g)).toHaveLength(9);
  });

  it('a card of two colors exiled for one color is not available for the other', () => {
    const g = game({
      p1: {
        battlefield: ['sanar-innovative-first-year'],
        library: ['forest', 'eclipsed-flamekin', 'island', 'forest', ...n('forest', 6)],
      },
      step: 'upkeep',
    });
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    resolveStack(g);
    // Blue first: the Flamekin is blue and red; exiling it leaves no red card to offer.
    expect((g.decision as { options: { label: string }[] }).options[0]!.label).toBe(
      'Exile Eclipsed Flamekin',
    );
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    resolveStack(g);
    expect(g.decision.kind).toBe('priority');
    expect(exile(g)).toEqual(['eclipsed-flamekin']);
  });
});

describe('Tam, Mindful First-Year', () => {
  it('each other creature you control has hexproof from each of its colors', () => {
    const g = game({
      p1: { battlefield: ['tam-mindful-first-year', 'eclipsed-flamekin', 'savannah-lions'] },
      p2: { hand: ['lightning-strike'], battlefield: ['mountain', 'mountain'] },
      active: 'p2',
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a as { targets: { object?: { id: string } }[] }).targets)
      .map((t) => t.object?.id);
    // The red Strike can target Tam (green-blue, and not "other"), the white Lions, but not the blue-red Flamekin.
    expect(targets).toContain(g.id('p1', 'tam-mindful-first-year'));
    expect(targets).toContain(g.id('p1', 'savannah-lions'));
    expect(targets).not.toContain(g.id('p1', 'eclipsed-flamekin'));
    // Your own red spell can still target it.
    const h = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['tam-mindful-first-year', 'eclipsed-flamekin', 'mountain', 'mountain'],
      },
    });
    const own = h
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a as { targets: { object?: { id: string } }[] }).targets)
      .map((t) => t.object?.id);
    expect(own).toContain(h.id('p1', 'eclipsed-flamekin'));
  });

  it("{T}: target creature you control becomes all colors until end of turn", () => {
    const g = game({
      p1: { battlefield: ['tam-mindful-first-year', 'savannah-lions'] },
      p2: { hand: ['lightning-strike'], battlefield: ['mountain', 'mountain'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(colorsOf(g, lions)).toEqual(['W']);
    activate(g, g.id('p1', 'tam-mindful-first-year'), 1, [g.ref(lions)]);
    done(g);
    expect(colorsOf(g, lions).sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    // Hexproof from each of its colors, including red now.
    // The opponent gets priority in my main phase and may cast the instant.
    g.pass();
    expect(g.actor).toBe('p2');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a as { targets: { object?: { id: string } }[] }).targets)
      .map((t) => t.object?.id);
    expect(targets).not.toContain(lions);
    // It is all colors only this turn.
    for (let i = 0; i < 80 && g.state.turn.number < 4; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(colorsOf(g, lions)).toEqual(['W']);
  });

  it('all colors counts for vivid', () => {
    const g = game({
      p1: { battlefield: ['tam-mindful-first-year', 'glister-bairn', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'tam-mindful-first-year'), 1, [g.ref(lions)]);
    done(g);
    for (let i = 0; i < 6 && g.state.turn.step !== 'beginCombat'; i++) g.pass();
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(lions)),
    );
    done(g);
    // Five colors among permanents: Glister Bairn gives +5/+5.
    expect(pt(g, lions)).toEqual([7, 6]);
  });
});

describe('Twinflame Travelers', () => {
  it("another Elemental's triggered ability triggers an additional time", () => {
    const g = game({
      p1: {
        hand: ['eclipsed-flamekin'],
        battlefield: ['twinflame-travelers', ...n('island', 3)],
        library: [
          'fire-elemental',
          ...n('forest', 3),
          'quaketusk-boar',
          ...n('forest', 3),
          ...n('plains', 3),
        ],
      },
    });
    cast(g, 'eclipsed-flamekin');
    resolveStack(g);
    done(g);
    expect(hand(g).sort()).toEqual(['fire-elemental', 'quaketusk-boar']);
  });

  it("doesn't double its own triggers or those of non-Elementals, or an opponent's Elementals", () => {
    const g = game({
      p1: {
        hand: ['eclipsed-elf'],
        battlefield: ['twinflame-travelers', ...n('swamp', 3)],
        library: ['thornweald-archer', ...n('forest', 3), 'thornweald-archer', ...n('forest', 6)],
      },
    });
    cast(g, 'eclipsed-elf');
    resolveStack(g);
    done(g);
    expect(hand(g)).toEqual(['thornweald-archer']);
    const h = game({
      p1: { battlefield: ['twinflame-travelers'] },
      p2: {
        hand: ['eclipsed-flamekin'],
        battlefield: n('island', 3),
        library: ['fire-elemental', ...n('forest', 3), 'quaketusk-boar', ...n('forest', 6)],
      },
      active: 'p2',
    });
    cast(h, 'eclipsed-flamekin');
    resolveStack(h);
    done(h);
    expect(hand(h, 'p2')).toEqual(['fire-elemental']);
  });

  it('two Travelers double it twice', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-flamekin'],
        battlefield: ['twinflame-travelers', 'twinflame-travelers', ...n('island', 3)],
        library: [
          'fire-elemental',
          ...n('forest', 3),
          'quaketusk-boar',
          ...n('forest', 3),
          'galewind-moose',
          ...n('forest', 3),
          ...n('plains', 3),
        ],
      },
    });
    cast(g, 'eclipsed-flamekin');
    resolveStack(g);
    done(g);
    expect(hand(g)).toHaveLength(3);
  });
});
