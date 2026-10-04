import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

const keywords = (g: ReturnType<typeof game>, id: string) =>
  getCharacteristics(g.state, cardDb, id).keywords;

describe("Foundations cards from Arena's Jump In packets", () => {
  it('Fleeting Flight: a counter, flying, and no combat damage to it', () => {
    const g = game({
      p1: { hand: ['fleeting-flight'], battlefield: ['plains', 'bear-cub'] },
      p2: { battlefield: ['empyrean-eagle'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const eagle = g.id('p2', 'empyrean-eagle');
    settle(cast(g, 'fleeting-flight', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(keywords(g, bear)).toContain('flying');
    g.passUntilStep('beginCombat').passBoth().attack(bear).passBoth();
    g.block([eagle, bear]);
    g.passUntilStep('main2');
    expect(g.obj(bear).damage).toBe(0);
    expect(g.zoneOf(eagle)).toBe('graveyard');
  });

  it('Eaten by Piranhas makes a creature a 1/1 with no abilities', () => {
    const g = game({
      p1: { hand: ['eaten-by-piranhas'], battlefield: n('island', 2) },
      p2: { battlefield: ['empyrean-eagle'] },
    });
    const eagle = g.id('p2', 'empyrean-eagle');
    settle(cast(g, 'eaten-by-piranhas', [g.ref(eagle)]));
    expect(pt(g, eagle)).toEqual([1, 1]);
    expect(keywords(g, eagle)).not.toContain('flying');
  });

  it('Uncharted Voyage: the owner picks top or bottom, then you surveil', () => {
    const g = game({
      p1: { hand: ['uncharted-voyage'], battlefield: n('island', 4) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    cast(g, 'uncharted-voyage', [g.ref(bear)]).passBoth();
    expect(g.actor).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    const lib = g.state.players.p2.library;
    expect(g.obj(lib[lib.length - 1]!).defId).toBe('bear-cub');
    expect(g.decision.kind).not.toBe('chooseOption');
  });

  it('Garna: a creature that dies attacking draws; any other pings', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['garna-bloodfist-of-keld', 'bear-cub', 'savannah-lions', 'mountain'],
      },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    settle(cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(g.life('p2')).toBe(19);
    const lions = g.id('p1', 'savannah-lions');
    const hand = g.state.players.p1.hand.length;
    g.passUntilStep('beginCombat').passBoth().attack(lions).passBoth();
    g.block([g.id('p2', 'gnarlback-rhino'), lions]);
    settle(g.passUntilStep('main2'));
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.state.players.p1.hand.length).toBe(hand + 1);
    expect(g.life('p2')).toBe(19);
  });

  it('Feed the Swarm costs life equal to the mana value', () => {
    const g = game({
      p1: { hand: ['feed-the-swarm'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const rhino = g.id('p2', 'gnarlback-rhino');
    settle(cast(g, 'feed-the-swarm', [g.ref(rhino)]));
    expect(g.zoneOf(rhino)).toBe('graveyard');
    expect(g.life('p1')).toBe(16);
  });

  it('Obliterating Bolt exiles what it kills', () => {
    const g = game({
      p1: { hand: ['obliterating-bolt'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['gnarlback-rhino'] },
    });
    const rhino = g.id('p2', 'gnarlback-rhino');
    settle(cast(g, 'obliterating-bolt', [g.ref(rhino)]));
    expect(g.zoneOf(rhino)).toBe('exile');
  });

  it('Goblin Negotiation makes a Goblin per point of excess damage', () => {
    const g = game({
      p1: { hand: ['goblin-negotiation'], battlefield: n('mountain', 7) },
      p2: { battlefield: ['bear-cub'] },
    });
    settle(cast(g, 'goblin-negotiation', [g.ref(g.id('p2', 'bear-cub'))], { x: 5 }));
    expect(all(g, 'goblin-token')).toHaveLength(3);
  });

  it('Wildwood Scourge enters with X counters and grows when another creature gets one', () => {
    const g = game({
      p1: {
        hand: ['wildwood-scourge', 'fleeting-flight'],
        battlefield: [...n('forest', 3), 'plains', 'bear-cub'],
      },
    });
    settle(cast(g, 'wildwood-scourge', [], { x: 2 }));
    const scourge = g.id('p1', 'wildwood-scourge');
    expect(g.obj(scourge).plusOneCounters).toBe(2);
    settle(cast(g, 'fleeting-flight', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(g.obj(scourge).plusOneCounters).toBe(3);
  });

  it('Ingenious Leonin: a counter on another attacker, and first strike for a Cat', () => {
    const g = game({
      p1: { battlefield: ['ingenious-leonin', 'savannah-lions', 'bear-cub', ...n('plains', 8)] },
    });
    const leonin = g.id('p1', 'ingenious-leonin');
    const lions = g.id('p1', 'savannah-lions');
    const bear = g.id('p1', 'bear-cub');
    g.passUntilStep('beginCombat').passBoth().attack(lions, bear);
    const activate = (id: string) =>
      settle(
        g.do({
          type: 'activateAbility',
          player: 'p1',
          source: leonin,
          abilityIndex: 0,
          targets: [g.ref(id)],
        }),
      );
    activate(lions);
    activate(bear);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(keywords(g, lions)).toContain('firstStrike');
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(keywords(g, bear)).not.toContain('firstStrike');
  });

  it('Soul-Shackled Zombie drains 2 if it exiles a creature card', () => {
    const g = game({
      p1: { hand: ['soul-shackled-zombie'], battlefield: n('swamp', 4) },
      p2: { graveyard: ['bear-cub', 'shock'] },
    });
    settle(cast(g, 'soul-shackled-zombie'), (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 2),
    );
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('Knight of Malice: +1/+0 while anyone has a white permanent; hexproof from white', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['knight-of-malice'] },
      p2: { hand: ['pacifism'], battlefield: ['plains', 'plains'] },
    });
    const knight = g.id('p1', 'knight-of-malice');
    expect(pt(g, knight)).toEqual([2, 2]);
    expect(g.legal('p2').some((a) => a.type === 'castSpell')).toBe(false);
    const g2 = game({
      p1: { battlefield: ['knight-of-malice'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(pt(g2, g2.id('p1', 'knight-of-malice'))).toEqual([3, 2]);
  });

  it('Skyknight Squire flies once three creatures have entered after it', () => {
    const g = game({
      p1: { hand: n('savannah-lions', 3), battlefield: ['skyknight-squire', ...n('plains', 3)] },
    });
    const squire = g.id('p1', 'skyknight-squire');
    for (let i = 0; i < 3; i++) {
      expect(keywords(g, squire)).not.toContain('flying');
      settle(cast(g, 'savannah-lions').passBoth());
    }
    expect(g.obj(squire).plusOneCounters).toBe(3);
    expect(keywords(g, squire)).toContain('flying');
  });
});
