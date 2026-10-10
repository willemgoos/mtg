import { describe, expect, it } from 'vitest';
import type { Action } from '../src/types.ts';
import { Game, scenario } from './hob-fixtures.ts';

type Activate = Extract<Action, { type: 'activateAbility' }>;
const cycles = (g: Game, id: string) =>
  g.legal('p1').filter((a): a is Activate => a.type === 'activateAbility' && a.source === id);

// Landcycling / basic landcycling / Mountaincycling / Halflingcycling —
// {N}, Discard this card: Search your library for a [land / basic land / Mountain / Halfling] card, reveal it, put it into your
// hand, then shuffle.

const setup = (hand: string[], library: string[], lands = 4) =>
  new Game(
    scenario({
      p1: { hand, library, battlefield: Array<string>(lands).fill('plains') },
      p2: {},
    }),
  );

describe('typecycling', () => {
  it('is activated from the hand (any time you have priority), paying its cost and discarding the card', () => {
    const g = setup(['h-hobbit-hole'], ['h-halfling', 'forest']);
    const hole = g.id('p1', 'h-hobbit-hole', 'hand');
    const [act] = cycles(g, hole);
    expect(act).toBeDefined();
    g.do(act!);
    // The discard is part of the cost.
    expect(g.zoneOf(hole)).toBe('graveyard');
    expect(g.state.stack).toHaveLength(1);
    expect(g.state.players.p1.hand).toHaveLength(0);
  });

  it('is not offered without the mana for its cost', () => {
    const g = setup(['h-hobbit-hole'], ['h-halfling'], 3);
    expect(cycles(g, g.id('p1', 'h-hobbit-hole', 'hand'))).toHaveLength(0);
  });

  it('Halflingcycling {4} finds a Halfling card, reveals it and puts it into your hand, then shuffles', () => {
    const g = setup(['h-hobbit-hole'], ['forest', 'h-halfling', 'bear', 'h-halfling-2']);
    g.do(cycles(g, g.id('p1', 'h-hobbit-hole', 'hand'))[0]!);
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    if (g.decision.kind !== 'searchLibrary') return;
    const names = g.decision.options.map((id) => g.state.objects[id]!.defId).sort();
    expect(names).toEqual(['h-halfling', 'h-halfling-2']);
    const pick = g.decision.options.find((id) => g.state.objects[id]!.defId === 'h-halfling')!;
    g.do({ type: 'chooseCard', player: 'p1', card: pick });
    expect(g.zoneOf(pick)).toBe('hand');
    expect(g.events).toContainEqual(
      expect.objectContaining({ type: 'cardsRevealed', player: 'p1' }),
    );
    expect(g.events).toContainEqual({ type: 'shuffled', player: 'p1' });
  });

  it('Mountaincycling {2} finds any card with the Mountain subtype, basic or not', () => {
    const g = setup(
      ['h-last-light'],
      ['forest', 'h-mountain-land', 'h-basic-mountain', 'h-plain-land'],
      2,
    );
    g.do(cycles(g, g.id('p1', 'h-last-light', 'hand'))[0]!);
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    if (g.decision.kind !== 'searchLibrary') return;
    expect(g.decision.options.map((id) => g.state.objects[id]!.defId).sort()).toEqual([
      'h-basic-mountain',
      'h-mountain-land',
    ]);
  });

  it('Landcycling {2} finds any land card; Basic landcycling {1} only a basic land card', () => {
    const lib = ['bear', 'h-plain-land', 'forest', 'ogre'];
    const g = setup(['h-landcycler'], lib, 2);
    g.do(cycles(g, g.id('p1', 'h-landcycler', 'hand'))[0]!);
    g.passBoth();
    if (g.decision.kind !== 'searchLibrary') throw new Error('no search');
    expect(g.decision.options.map((id) => g.state.objects[id]!.defId).sort()).toEqual([
      'forest',
      'h-plain-land',
    ]);

    const b = setup(['h-basic-cycler'], lib, 1);
    b.do(cycles(b, b.id('p1', 'h-basic-cycler', 'hand'))[0]!);
    b.passBoth();
    if (b.decision.kind !== 'searchLibrary') throw new Error('no search');
    expect(b.decision.options.map((id) => b.state.objects[id]!.defId)).toEqual(['forest']);
  });

  it('may find nothing (a search for a quality can fail), and still discards and shuffles', () => {
    const g = setup(['h-hobbit-hole'], ['forest', 'bear']);
    g.do(cycles(g, g.id('p1', 'h-hobbit-hole', 'hand'))[0]!);
    g.passBoth();
    // Nothing to find: the search is still made (and revealed to be empty-handed), then the library is shuffled.
    if (g.decision.kind === 'searchLibrary') {
      expect(g.decision.options).toHaveLength(0);
      g.do({ type: 'chooseCard', player: 'p1', card: null });
    }
    expect(g.state.players.p1.hand).toHaveLength(0);
    expect(g.decision.kind).toBe('priority');
    expect(g.events).toContainEqual({ type: 'shuffled', player: 'p1' });
  });

  it('the card cannot be cycled from anywhere but the hand', () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['h-hobbit-hole'], battlefield: ['plains', 'plains', 'plains', 'plains'] },
      }),
    );
    expect(cycles(g, g.id('p1', 'h-hobbit-hole', 'graveyard'))).toHaveLength(0);
  });
});
