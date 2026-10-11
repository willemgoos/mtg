import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { casts, DB, Game, getPower, ORC_ARMY, scenario, SOLDIER } from './ltr-fixtures.ts';

// The Lord of the Rings (21a): "whenever you scry" (not surveil) with the cards looked at, "whenever you create a token", and
// amass Orcs (built on the general amass of The Hobbit).

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

/** Resolves the stack, answering a scry or surveil by keeping everything on top (bounded). */
const settle = (g: Game) => {
  for (let i = 0; i < 30; i++) {
    if (g.decision.kind === 'scry') g.do(g.legal('p1').find((a) => a.type === 'scry')!);
    else if (g.state.stack.length > 0 && g.decision.kind === 'priority') g.passBoth();
    else return;
  }
};

const counters = (g: Game, id: string) => g.state.objects[id]!.plusOneCounters;

describe('Whenever you scry', () => {
  it('a scry triggers it; the cards looked at are its amount', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-scry-2'], battlefield: ['l-scry-elf', 'l-scry-draw'] },
      }),
    );
    const hand = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-scry-2');
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
    settle(g);
    expect(counters(g, g.id('p1', 'l-scry-elf'))).toBe(1);
    // Scry 2 looked at two cards: draw two.
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 2);
  });

  it('looking at fewer cards than the number (a short library) counts the cards looked at', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-scry-2'], battlefield: ['l-scry-draw'], library: ['forest', 'forest', 'forest'] },
      }),
    );
    // Scry 2 from a library of 3 looks at 2; make it 1.
    g.state.players.p1.library.splice(1);
    const hand = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-scry-2');
    g.passBoth();
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 1);
  });

  it('a surveil is not a scry, but it is "scry or surveil"', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['l-surveil-2'],
          battlefield: ['l-scry-elf', 'l-scry-draw', 'l-scry-or-surveil'],
        },
      }),
    );
    const hand = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-surveil-2');
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
    settle(g);
    expect(counters(g, g.id('p1', 'l-scry-elf'))).toBe(0);
    expect(g.state.players.p1.hand.length).toBe(hand - 1);
    expect(counters(g, g.id('p1', 'l-scry-or-surveil'))).toBe(1);
  });

  it('a scry triggers "scry or surveil" too, and an opponent\'s scry triggers nothing of yours', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['l-scry-elf', 'l-scry-or-surveil'] },
        p2: { hand: ['l-scry-2'] },
        active: 'p2',
      }),
    );
    castFirst(g, 'p2', 'l-scry-2');
    g.passBoth();
    for (let i = 0; i < 5 && g.decision.kind === 'scry'; i++)
      g.do(g.legal('p2').find((a) => a.type === 'scry')!);
    settle(g);
    expect(counters(g, g.id('p1', 'l-scry-elf'))).toBe(0);
    expect(counters(g, g.id('p1', 'l-scry-or-surveil'))).toBe(0);
  });
});

describe('Whenever you create a token', () => {
  it('once for each token created', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-two-tokens'], battlefield: ['l-rosie', 'l-bats'] },
      }),
    );
    castFirst(g, 'p1', 'l-two-tokens');
    settle(g);
    expect(counters(g, g.id('p1', 'l-rosie'))).toBe(2);
    expect(g.life('p2')).toBe(18);
  });

  it('the token can be required to match a filter', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-two-tokens', 'l-make-treasure'], battlefield: ['l-token-fan'] },
      }),
    );
    castFirst(g, 'p1', 'l-two-tokens');
    settle(g);
    expect(counters(g, g.id('p1', 'l-token-fan'))).toBe(0);
    castFirst(g, 'p1', 'l-make-treasure');
    settle(g);
    expect(counters(g, g.id('p1', 'l-token-fan'))).toBe(1);
  });

  it('only tokens you create: not the opponent\'s, and not a card entering', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['l-rosie'], hand: ['l-bear'] },
        p2: { hand: ['l-two-tokens'] },
        active: 'p2',
      }),
    );
    castFirst(g, 'p2', 'l-two-tokens');
    settle(g);
    expect(counters(g, g.id('p1', 'l-rosie'))).toBe(0);
    expect(g.life('p1')).toBe(20);
  });

  it('amass making its Army token counts as creating a token', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-muster'], battlefield: ['l-rosie'] },
      }),
    );
    castFirst(g, 'p1', 'l-muster');
    settle(g);
    expect(counters(g, g.id('p1', 'l-rosie'))).toBe(1);
  });
});

describe('Amass Orcs', () => {
  const orcArmies = (g: Game, player: 'p1' | 'p2') =>
    g.state.battlefield.filter(
      (id) =>
        g.state.objects[id]!.controller === player &&
        getCharacteristics(g.state, DB, id).subtypes.includes('Army'),
    );

  it('makes a 0/0 black Orc Army and puts the counters on it, then adds to it', () => {
    const g = new Game(scenario({ p1: { hand: ['l-muster', 'l-muster'] } }));
    castFirst(g, 'p1', 'l-muster');
    settle(g);
    const [army] = orcArmies(g, 'p1');
    expect(g.obj(army!).defId).toBe(ORC_ARMY);
    expect(getCharacteristics(g.state, DB, army!).subtypes).toEqual(
      expect.arrayContaining(['Orc', 'Army']),
    );
    expect(counters(g, army!)).toBe(1);
    castFirst(g, 'p1', 'l-muster');
    settle(g);
    expect(orcArmies(g, 'p1')).toEqual([army]);
    expect(counters(g, army!)).toBe(2);
    expect(getPower(g, army!)).toBe(2);
  });

  it('amass Orcs X where X is the number of Equipment attached (Shagrat)', () => {
    const state = scenario({
      step: 'beginCombat',
      p1: { battlefield: ['l-shagrat', 'l-sword'] },
    });
    const shagrat = state.battlefield.find((id) => state.objects[id]!.defId === 'l-shagrat')!;
    const sword = state.battlefield.find((id) => state.objects[id]!.defId === 'l-sword')!;
    state.objects[sword]!.attachedTo = shagrat;
    const g = new Game(state);
    g.passBoth();
    g.attack(shagrat);
    settle(g);
    const [army] = orcArmies(g, 'p1');
    expect(counters(g, army!)).toBe(1);
  });

  it('"When you do, ... the amassed Army\'s power": Foray of Orcs', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-foray'] },
        p2: { battlefield: ['l-big', 'l-small'] },
      }),
    );
    castFirst(g, 'p1', 'l-foray');
    g.passBoth();
    // The reflexive trigger asks for its target.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const big = g.id('p2', 'l-big');
    g.do(
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === big),
        )!,
    );
    settle(g);
    // The Army is a 2/2: 2 damage.
    expect(g.obj(big).damage).toBe(2);
  });

  it('then Goblins and Orcs you control gain double strike and haste (Assault on Osgiliath)', () => {
    const g = new Game(scenario({ p1: { hand: ['l-assault'], battlefield: ['l-shagrat', 'l-bear'] } }));
    castFirst(g, 'p1', 'l-assault');
    settle(g);
    const keywords = (id: string) => getCharacteristics(g.state, DB, id).keywords;
    const army = orcArmies(g, 'p1')[0]!;
    expect(counters(g, army)).toBe(3);
    // The new Army is an Orc, so is Shagrat; the bear is neither.
    expect(keywords(army).has('doubleStrike')).toBe(true);
    expect(keywords(army).has('haste')).toBe(true);
    expect(keywords(g.id('p1', 'l-shagrat')).has('doubleStrike')).toBe(true);
    expect(keywords(g.id('p1', 'l-bear')).has('doubleStrike')).toBe(false);
  });

  it('whenever you cast your second spell each turn, amass Orcs 2 (Saruman the White)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-muster', 'l-tempt', 'l-tempt'], battlefield: ['l-saruman'] },
      }),
    );
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(orcArmies(g, 'p1')).toHaveLength(0);
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    const [army] = orcArmies(g, 'p1');
    expect(counters(g, army!)).toBe(2);
  });

  it('when a creature dies (Easterling Vanguard)', () => {
    const g = new Game(
      scenario({ p1: { hand: [], battlefield: ['l-vanguard'] }, p2: { hand: ['l-kill'] }, active: 'p2' }),
    );
    const target = g.id('p1', 'l-vanguard');
    g.do(
      casts(g, 'p2', g.id('p2', 'l-kill', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === target),
      )!,
    );
    settle(g);
    const [army] = orcArmies(g, 'p1');
    expect(counters(g, army!)).toBe(1);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]!.defId === SOLDIER)).toHaveLength(0);
  });
});
