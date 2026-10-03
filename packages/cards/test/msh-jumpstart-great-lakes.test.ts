import type { TargetChoice } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Great Lakes Avengers packet (docs/marvel-jumpstart.md).

const GREAT_LAKES = [
  'Guerrilla Gorilla',
  'Doorman',
  'Mister Immortal',
  'Tippy-Toe, Terrific Partner',
  'Flatman',
  'The Unbeatable Squirrel Girl',
  'Big Bertha',
  'Savage Land Dinosaur',
  'Rapid Rescue',
  'Go Nuts!',
  'Beast Mode',
  'Training Regimen',
  'Thriving Grove',
  'Forest',
];

type G = ReturnType<typeof game>;

const activate = (g: G, source: string, abilityIndex = 0, targets: TargetChoice[] = []) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets });

/** The creatures the defending player may block `attacker` with. */
const blockersFor = (g: G, attacker: string) =>
  g.legal().flatMap((a) => (a.type === 'addBlock' && a.attacker === attacker ? [a.blocker] : []));

describe('Great Lakes Avengers packet', () => {
  it('has every card implemented', () => {
    for (const name of GREAT_LAKES) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('Doorman', () => {
  it('makes a creature unblockable by power 2 or less this turn, but not by bigger creatures', () => {
    const g = game({
      p1: { battlefield: ['doorman', 'gnarlback-rhino'] },
      p2: { battlefield: ['bear-cub', 'fog-bank', 'gnarlback-rhino'] },
    });
    const rhino = g.id('p1', 'gnarlback-rhino');
    settle(activate(g, g.id('p1', 'doorman'), 0, [g.ref(rhino)]));
    expect(g.obj(g.id('p1', 'doorman')).tapped).toBe(true);
    g.passUntilStep('beginCombat').passBoth().attack(rhino).passBoth();
    expect(g.decision.kind).toBe('declareBlockers');
    expect(blockersFor(g, rhino)).toEqual([g.id('p2', 'gnarlback-rhino')]);
  });

  it('wears off at end of turn', () => {
    const g = game({
      p1: { battlefield: ['doorman', 'gnarlback-rhino'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const rhino = g.id('p1', 'gnarlback-rhino');
    settle(activate(g, g.id('p1', 'doorman'), 0, [g.ref(rhino)]));
    expect(g.state.effects.some((e) => e.cantBeBlockedBy)).toBe(true);
    g.passUntilStep('upkeep'); // the opponent's turn
    expect(g.state.effects.some((e) => e.cantBeBlockedBy)).toBe(false);
  });
});

describe('Mister Immortal', () => {
  it('returns from the graveyard tapped for {2}{G}', () => {
    const g = game({ p1: { graveyard: ['mister-immortal'], battlefield: n('forest', 3) } });
    const mi = g.id('p1', 'mister-immortal', 'graveyard');
    settle(activate(g, mi));
    expect(g.zoneOf(mi)).toBe('battlefield');
    expect(g.obj(mi).tapped).toBe(true);
  });

  it('returns from exile too, but not from the battlefield', () => {
    const g = game({
      p1: {
        hand: ['eaten-alive'],
        battlefield: ['mister-immortal', 'bear-cub', ...n('swamp', 1), ...n('forest', 3)],
      },
    });
    const mi = g.id('p1', 'mister-immortal');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === mi)).toBe(false);
    const eat = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.some((t) => 'object' in t && t.object.id === mi) &&
          a.sacrifice === g.id('p1', 'bear-cub'),
      );
    expect(eat).toBeTruthy();
    settle(g.do(eat!));
    expect(g.zoneOf(mi)).toBe('exile');
    settle(activate(g, mi));
    expect(g.zoneOf(mi)).toBe('battlefield');
    expect(g.obj(mi).tapped).toBe(true);
  });
});

describe('Flatman', () => {
  it('switches power and toughness until end of turn, after other changes', () => {
    const g = game({
      p1: { hand: ['giant-growth'], battlefield: ['flatman', ...n('forest', 4)] },
    });
    const flat = g.id('p1', 'flatman');
    expect(pt(g, flat)).toEqual([1, 10]);
    settle(activate(g, flat));
    expect(pt(g, flat)).toEqual([10, 1]);
    // +3/+3 applies before the switch: 4/13 switched is 13/4.
    settle(cast(g, 'giant-growth', [g.ref(flat)]));
    expect(pt(g, flat)).toEqual([13, 4]);
    g.passUntilStep('upkeep'); // the opponent's turn
    expect(pt(g, flat)).toEqual([1, 10]);
  });
});

describe('Big Bertha', () => {
  it('enters with X +1/+1 counters and grows for {1}{G}, tapping', () => {
    const g = game({ p1: { hand: ['big-bertha'], battlefield: n('forest', 6) } });
    settle(cast(g, 'big-bertha', [], { x: 3 }));
    const bertha = g.id('p1', 'big-bertha');
    expect(pt(g, bertha)).toEqual([4, 4]);
    expect(g.obj(bertha).summoningSick).toBe(true);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === bertha)).toBe(false);
  });

  it('has vigilance and puts a counter on herself', () => {
    const g = game({ p1: { battlefield: ['big-bertha', ...n('forest', 2)] } });
    const bertha = g.id('p1', 'big-bertha');
    expect(pt(g, bertha)).toEqual([1, 1]);
    settle(activate(g, bertha));
    expect(pt(g, bertha)).toEqual([2, 2]);
    expect(g.obj(bertha).tapped).toBe(true);
    const fresh = game({ p1: { battlefield: ['big-bertha'] } });
    const b = fresh.id('p1', 'big-bertha');
    fresh.passUntilStep('beginCombat').passBoth().attack(b);
    expect(fresh.obj(b).tapped).toBe(false);
  });
});
