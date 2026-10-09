import { describe, expect, it } from 'vitest';
import { casts, Game, getPower, scenario } from './ecl-fixtures.ts';

describe('vivid', () => {
  it("counts the colours among permanents you control (not colourless, not the opponent's)", () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['red-guy', 'green-guy', 'thin', 'forest', 'squawk'] },
        p2: { battlefield: ['white-guy'] },
      }),
    );
    // Red (three of them) and green: two colours.
    expect(getPower(g, g.id('p1', 'squawk'))).toBe(2);
  });

  it('a vivid cost reduction takes {1} off for each colour', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['vivid-drake'],
          battlefield: ['red-guy', 'green-guy', 'island', 'island', 'island', 'island'],
        },
      }),
    );
    // {5}{U} less 2 is {3}{U}: four islands pay it.
    const drake = g.id('p1', 'vivid-drake', 'hand');
    expect(casts(g, 'p1', drake)).toHaveLength(1);
    g.do(casts(g, 'p1', drake)[0]!);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(4);
    g.passBoth();
    g.passBoth();
    // Its enter trigger draws a card for each colour: red, green and (now) blue.
    expect(g.state.players.p1.hand).toHaveLength(3);
  });

  it('is too expensive without the colours', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['vivid-drake'], battlefield: ['island', 'island', 'island', 'island'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 'vivid-drake', 'hand'))).toHaveLength(0);
  });
});

describe('evoke', () => {
  it('offers the evoke cost as another way to cast it', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['vibrance'], battlefield: ['mountain', 'mountain'] },
        p2: { battlefield: ['wall'] },
      }),
    );
    const options = casts(g, 'p1', g.id('p1', 'vibrance', 'hand'));
    // Two Mountains can't pay the full {3}{R/G}{R/G}, only the evoke cost.
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((a) => a.evoked)).toBe(true);
  });

  it('is sacrificed when it enters, after its enter triggers (RR spent: 3 damage)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['vibrance'], battlefield: ['mountain', 'mountain'] },
        p2: { battlefield: ['wall'] },
      }),
    );
    const v = g.id('p1', 'vibrance', 'hand');
    g.do(casts(g, 'p1', v).find((a) => a.evoked)!);
    g.passBoth();
    expect(g.zoneOf(v)).toBe('battlefield');
    expect(g.obj(v).evoked).toBe(true);
    // Choose the target of the RR trigger, then resolve everything.
    for (let i = 0; i < 12 && g.zoneOf(v) === 'battlefield'; i++) {
      if (g.decision.kind === 'chooseTriggerTargets') {
        const pick = g
          .legal(g.actor)
          .find(
            (a) =>
              a.type === 'chooseTargets' &&
              a.targets.some((t) => 'player' in t && t.player === 'p2'),
          );
        g.do(pick ?? g.legal(g.actor)[0]!);
      } else g.pass();
    }
    expect(g.zoneOf(v)).toBe('graveyard');
    expect(g.life('p2')).toBe(17);
    // Only RR was spent: the GG trigger didn't happen.
    expect(g.life('p1')).toBe(20);
  });

  it('cast normally with GG spent it stays, and its GG trigger gains life', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['vibrance'], battlefield: ['forest', 'forest', 'forest', 'forest', 'forest'] },
        p2: { battlefield: ['wall'] },
      }),
    );
    const v = g.id('p1', 'vibrance', 'hand');
    g.do(casts(g, 'p1', v).find((a) => !a.evoked)!);
    g.passBoth();
    g.passBoth();
    expect(g.zoneOf(v)).toBe('battlefield');
    expect(g.obj(v).evoked).toBeUndefined();
    expect(g.life('p1')).toBe(22);
  });

  it('"if it was evoked" and "if it wasn\'t" are conditions, and the flag goes away when it leaves', () => {
    const evoke = new Game(
      scenario({
        p1: { hand: ['evoker'], battlefield: ['mountain'] },
        p2: {},
      }),
    );
    const e = evoke.id('p1', 'evoker', 'hand');
    evoke.do(casts(evoke, 'p1', e).find((a) => a.evoked)!);
    for (let i = 0; i < 6 && evoke.zoneOf(e) !== 'graveyard'; i++) evoke.passBoth();
    // Evoked: its "if it was evoked" trigger gained 5 life, the "wasn't" one did nothing.
    expect(evoke.life('p1')).toBe(25);
    expect(evoke.obj(e).evoked).toBeUndefined();

    const hard = new Game(
      scenario({
        p1: { hand: ['evoker'], battlefield: ['mountain', 'mountain', 'mountain'] },
        p2: {},
      }),
    );
    const h = hard.id('p1', 'evoker', 'hand');
    hard.do(casts(hard, 'p1', h).find((a) => !a.evoked)!);
    hard.passBoth();
    hard.passBoth();
    expect(hard.life('p1')).toBe(20);
    expect(hard.state.players.p1.hand).toHaveLength(1);
  });
});
