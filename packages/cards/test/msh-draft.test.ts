import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes cards added for the draft trophy decks.

/** Answers every prompt with its first option and resolves the stack (bounded). */
function drive(g: ReturnType<typeof game>, pick?: (legal: ReturnType<typeof g.legal>) => unknown) {
  for (let i = 0; i < 40; i++) {
    if (g.decision.kind === 'priority') {
      if (!g.state.stack.length) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do((pick?.(legal) as (typeof legal)[number] | undefined) ?? legal[0]!);
  }
  return g;
}

const activate = (g: ReturnType<typeof game>, source: string, abilityIndex: number, targets = []) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets });

describe('equipment', () => {
  it('S.H.I.E.L.D. Spy Kit untaps and scries once when the creature attacks alone', () => {
    const g = game({
      p1: { battlefield: ['s-h-i-e-l-d-spy-kit', 'bear-cub', 'plains'], library: n('plains', 3) },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(activate(g, g.id('p1', 's-h-i-e-l-d-spy-kit'), 2, [g.ref(bear)] as never));
    expect(pt(g, bear)).toEqual([3, 3]);
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    expect(g.state.stack).toHaveLength(1);
    drive(g);
    expect(g.obj(bear).tapped).toBe(false);
  });

  it('Captain America’s Shield triggers once per attack', () => {
    const g = game({
      p1: { battlefield: ['captain-americas-shield', 'bear-cub', ...n('plains', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.obj(g.id('p1', 'captain-americas-shield')).attachedTo = bear;
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    let asks = 0;
    for (let i = 0; i < 20 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      if (g.decision.kind === 'chooseTriggerTargets') asks++;
      if (g.decision.kind === 'priority') g.pass();
      else
        g.do(
          g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length) ?? g.legal()[0]!,
        );
    }
    expect(asks).toBe(1);
  });
});

describe('replacement effects', () => {
  it('Hawkeye, Young Avenger adds his power to noncombat damage to opponents', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['hawkeye-young-avenger', ...n('mountain', 2)],
      },
    });
    settle(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(g.state.players.p2.life).toBe(15);
  });

  it('Doc Samson puts one more counter on your permanents', () => {
    const g = game({
      p1: {
        hand: ['go-nuts'],
        battlefield: ['doc-samson-super-psychiatrist', 'bear-cub', ...n('forest', 3)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'go-nuts', [g.ref(bear)], { mode: 0 }));
    expect(g.obj(bear).plusOneCounters).toBeGreaterThanOrEqual(2);
  });
});

describe('changing creatures', () => {
  it('Reptil becomes a 3/5 with reach and vigilance', () => {
    const g = game({ p1: { battlefield: ['reptil-dinomorpher', ...n('forest', 3)] } });
    const reptil = g.id('p1', 'reptil-dinomorpher');
    settle(activate(g, reptil, 0));
    expect(pt(g, reptil)).toEqual([3, 5]);
    expect(getCharacteristics(g.state, cardDb, reptil).keywords.has('reach')).toBe(true);
  });

  it('I Am Iron Man makes a 4/4 flyer and draws', () => {
    const g = game({
      p1: {
        hand: ['i-am-iron-man'],
        battlefield: ['bear-cub', ...n('island', 3)],
        library: ['island'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'i-am-iron-man', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    const c = getCharacteristics(g.state, cardDb, bear);
    expect(c.keywords.has('flying')).toBe(true);
    expect(c.types).toContain('Artifact');
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Spider-Woman keeps the creature tapped while you control her', () => {
    const g = game({
      p1: { hand: ['spider-woman-secret-agent'], battlefield: n('plains', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'spider-woman-secret-agent'));
    expect(g.obj(angel).tapped).toBe(true);
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('Frozen in Ice taps the creature, which loses its abilities', () => {
    const g = game({
      p1: { hand: ['frozen-in-ice'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'frozen-in-ice', [g.ref(angel)]));
    expect(g.obj(angel).tapped).toBe(true);
    expect(getCharacteristics(g.state, cardDb, angel).keywords.has('flying')).toBe(false);
  });
});

describe('plans', () => {
  it('Political Triumph pays off on the fourth creature', () => {
    const g = game({
      p1: {
        hand: n('bear-cub', 4),
        battlefield: ['political-triumph', ...n('forest', 8)],
        library: n('forest', 8),
      },
    });
    for (let i = 0; i < 4; i++) {
      drive(cast(g, 'bear-cub'));
    }
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'political-triumph')).toBe(false);
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    for (const b of bears) expect(g.obj(b).plusOneCounters).toBe(1);
  });
});

describe('upkeep choices', () => {
  it('Mister Hyde can remove his counter to draw', () => {
    const g = game({
      p1: { battlefield: ['mister-hyde-monster-within'], library: n('forest', 3) },
    });
    const hyde = g.id('p1', 'mister-hyde-monster-within');
    g.obj(hyde).plusOneCounters = 1;
    const before = handSize(g, 'p1');
    // To p1's next upkeep, taking the second mode when the trigger asks.
    g.passUntilStep('end');
    for (
      let i = 0;
      i < 200 &&
      !(
        g.state.turn.activePlayer === 'p1' &&
        g.state.turn.number > 1 &&
        g.state.turn.step === 'main1'
      );
      i++
    ) {
      if (g.decision.kind === 'priority') g.pass();
      else {
        const legal = g.legal();
        g.do(legal.find((a) => a.type === 'chooseTargets' && a.mode === 1) ?? legal[0]!);
      }
    }
    expect(g.obj(hyde).plusOneCounters).toBe(0);
    expect(handSize(g, 'p1')).toBeGreaterThan(before);
  });
});
