import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, handSize, n, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Geniuses.

const PACKET = [
  'Kid Loki',
  'Bold Biochemist',
  'Brawn, Amadeus Cho',
  'Shuri, Vibranium Technologist',
  'Ant-Man, Reformed Rogue',
  'Beast, Erudite Aerialist',
  'Blue Marvel, Adam Brashear',
  'Reed Richards, Smartest Man',
  'Super Intelligence',
  'Futurist Forge',
  'Frozen in Ice',
  'Fantastic Bounce',
  'Thriving Isle',
  'Island',
];

const keywords = (g: ReturnType<typeof game>, id: string) =>
  getCharacteristics(g.state, cardDb, id).keywords;

describe('Geniuses packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it('Beast flies the turn he gets a +1/+1 counter and draws on combat damage', () => {
    const g = game({
      p1: {
        hand: ['stony-strength'],
        battlefield: ['beast-erudite-aerialist', 'forest'],
        library: n('island', 5),
      },
    });
    const beast = g.id('p1', 'beast-erudite-aerialist');
    expect(keywords(g, beast).has('flying')).toBe(false);
    settle(cast(g, 'stony-strength', [g.ref(beast)]));
    expect(keywords(g, beast).has('flying')).toBe(true);
    g.passUntilStep('beginCombat').passBoth().attack(beast);
    settle(g);
    const hand = handSize(g, 'p1');
    g.passUntilStep('end');
    expect(g.life('p2')).toBe(16);
    expect(handSize(g, 'p1')).toBe(hand + 1);
    // Next turn he no longer flies.
    g.passUntilStep('main1');
    expect(keywords(g, beast).has('flying')).toBe(false);
  });

  it('Blue Marvel gets a +1/+1 counter when you draw your second card each turn', () => {
    const g = game({
      p1: {
        hand: ['think-twice', 'think-twice'],
        battlefield: ['blue-marvel-adam-brashear', ...n('island', 4)],
        library: n('island', 5),
      },
    });
    const marvel = g.id('p1', 'blue-marvel-adam-brashear');
    expect(keywords(g, marvel).has('flying')).toBe(true);
    expect(keywords(g, marvel).has('ward')).toBe(true);
    settle(cast(g, 'think-twice'));
    expect(g.obj(marvel).plusOneCounters).toBe(0);
    settle(cast(g, 'think-twice'));
    expect(g.obj(marvel).plusOneCounters).toBe(1);
  });

  it("Reed Richards turns the first draw each turn (not the draw step's) into four", () => {
    const g = game({
      step: 'upkeep',
      p1: {
        hand: ['think-twice', 'think-twice'],
        battlefield: ['reed-richards-smartest-man', ...n('island', 4)],
        library: n('island', 10),
      },
    });
    g.passUntilStep('main1');
    // The draw step's card is drawn normally.
    expect(handSize(g, 'p1')).toBe(3);
    settle(cast(g, 'think-twice'));
    expect(handSize(g, 'p1')).toBe(2 + 4);
    // Only the first time each turn.
    settle(cast(g, 'think-twice'));
    expect(handSize(g, 'p1')).toBe(5 + 1);
  });

  it('Super Intelligence draws for the enchanted creature controller in their upkeep', () => {
    const g = game({
      p1: {
        hand: ['super-intelligence', 'super-intelligence'],
        battlefield: ['bear-cub', ...n('island', 2)],
        library: n('island', 5),
      },
      p2: { battlefield: ['bear-cub'], library: n('forest', 5) },
    });
    settle(cast(g, 'super-intelligence', [g.ref(g.id('p1', 'bear-cub'))]));
    settle(cast(g, 'super-intelligence', [g.ref(g.id('p2', 'bear-cub'))]));
    expect(handSize(g, 'p1')).toBe(0);
    g.passUntilStep('end').passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p2');
    settle(g);
    // p2 drew for the Aura on their Bear Cub; p1 didn't.
    expect(handSize(g, 'p2')).toBe(1);
    expect(handSize(g, 'p1')).toBe(0);
    g.passUntilStep('end').passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p1');
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Fantastic Bounce costs {2} less against a tapped creature, bounces and draws', () => {
    const g = game({
      p1: {
        hand: ['fantastic-bounce'],
        battlefield: n('island', 2),
        library: n('island', 5),
      },
      p2: { battlefield: [{ card: 'bear-cub', tapped: true }] },
    });
    const bear = g.id('p2', 'bear-cub');
    const card = g.id('p1', 'fantastic-bounce', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(true);
    settle(cast(g, 'fantastic-bounce', [g.ref(bear)]));
    expect(g.zoneOf(bear)).toBe('hand');
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Fantastic Bounce costs full price for an untapped permanent', () => {
    const g = game({
      p1: { hand: ['fantastic-bounce'], battlefield: n('island', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    const card = g.id('p1', 'fantastic-bounce', 'hand');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });
});
