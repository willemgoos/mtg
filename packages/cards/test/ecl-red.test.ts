import { describe, expect, it } from 'vitest';
import { getCharacteristics, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import { ECL_GOBLIN } from '../src/ecl/tokens.ts';

// Lorwyn Eclipsed 18b: the red cards.

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;
const tokens = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === defId && g.obj(id).controller === p && g.obj(id).isToken,
  );

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
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
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

/** The legal casts of a card in hand. */
const casts = (g: GameDriver, defId: string): Extract<Action, { type: 'castSpell' }>[] =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && a.card === g.id(g.actor, defId, 'hand'),
    );

/** The legal casts of a card in hand aimed at this object. */
const castsAt = (g: GameDriver, defId: string, target: string) =>
  casts(g, defId).filter((a) =>
    a.targets.some((x) => 'object' in x && x.object.id === target),
  );

describe('Boldwyr Aggressor', () => {
  it('gives the other Giants you control double strike, and only those', () => {
    const g = game({
      p1: { battlefield: ['boldwyr-aggressor', 'brambleback-brute', 'savannah-lions'] },
      p2: { battlefield: ['brambleback-brute'] },
    });
    expect(keywords(g, g.id('p1', 'boldwyr-aggressor'))).toContain('doubleStrike');
    expect(keywords(g, g.id('p1', 'brambleback-brute'))).toContain('doubleStrike');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('doubleStrike');
    expect(keywords(g, g.id('p2', 'brambleback-brute'))).not.toContain('doubleStrike');
  });
});

describe('Boneclub Berserker', () => {
  it('gets +2/+0 for each other Goblin you control', () => {
    const g = game({
      p1: { battlefield: ['boneclub-berserker', 'scuzzback-scrounger', ECL_GOBLIN] },
      p2: { battlefield: ['scuzzback-scrounger'] },
    });
    const b = g.id('p1', 'boneclub-berserker');
    expect(pt(g, b)).toEqual([6, 4]);
  });
});

describe('Boulder Dash', () => {
  it('deals 2 damage to one target and 1 to another', () => {
    const g = game({
      p1: { hand: ['boulder-dash'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'boulder-dash', [g.ref(g.id('p2', 'serra-angel')), { player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });

  it('the two targets must be different', () => {
    const g = game({
      p1: { hand: ['boulder-dash'], battlefield: n('mountain', 2) },
    });
    expect(() => cast(g, 'boulder-dash', [{ player: 'p2' }, { player: 'p2' }])).toThrow();
  });
});

describe('Brambleback Brute', () => {
  it('enters with two -1/-1 counters; removing one makes a creature unable to block (sorcery speed)', () => {
    const g = game({
      p1: { hand: ['brambleback-brute'], battlefield: n('mountain', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'brambleback-brute');
    settle(g);
    const brute = g.id('p1', 'brambleback-brute');
    expect(minus(g, brute)).toBe(2);
    expect(pt(g, brute)).toEqual([2, 3]);
    const angel = g.id('p2', 'serra-angel');
    activate(g, brute, 0, [g.ref(angel)], { removeKinds: ['-1/-1'] });
    settle(g);
    expect(minus(g, brute)).toBe(1);
    expect(pt(g, brute)).toEqual([3, 4]);
    expect(
      g.state.effects.some((e) => e.affected.id === angel && e.cantBlock === true),
    ).toBe(true);
  });

  it('is not offered when there is no counter to remove', () => {
    const g = game({ p1: { battlefield: ['brambleback-brute', ...n('mountain', 2)] } });
    expect(
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'brambleback-brute')),
    ).toHaveLength(0);
  });
});

describe('Burning Curiosity', () => {
  it('exiles two cards you may play, or three if you blighted', () => {
    const lib = ['island', 'plains', 'swamp', 'forest', 'forest'];
    const plain = game({
      p1: { hand: ['burning-curiosity'], battlefield: n('mountain', 3), library: lib },
    });
    cast(plain, 'burning-curiosity');
    settle(plain);
    expect(exile(plain)).toEqual(['island', 'plains']);

    const kicked = game({
      p1: {
        hand: ['burning-curiosity'],
        battlefield: [...n('mountain', 3), 'serra-angel'],
        library: lib,
      },
    });
    const lions = kicked.id('p1', 'serra-angel');
    kicked.do(casts(kicked, 'burning-curiosity').find((a) => a.blight === lions)!);
    settle(kicked);
    expect(minus(kicked, lions)).toBe(1);
    expect(exile(kicked)).toEqual(['island', 'plains', 'swamp']);
  });
});

describe('Cinder Strike', () => {
  it('deals 2 damage, or 4 if you blighted', () => {
    const plain = game({
      p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = plain.id('p2', 'serra-angel');
    plain.do(castsAt(plain, 'cinder-strike', angel).find((a) => !a.blight)!);
    settle(plain);
    expect(plain.obj(angel).damage).toBe(2);

    const kicked = game({
      p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = kicked.id('p1', 'serra-angel');
    kicked.do(castsAt(kicked, 'cinder-strike', kicked.id('p2', 'serra-angel')).find((a) => a.blight === lions)!);
    settle(kicked);
    expect(minus(kicked, lions)).toBe(1);
    expect(gy(kicked, 'p2')).toEqual(['serra-angel']);
  });
});
