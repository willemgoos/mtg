import { type Action } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Kang Dynasty.

const PACKET = [
  'Bold Biochemist',
  'TVA Bureaucrat',
  'S.H.I.E.L.D. Deployment Drone',
  'Iron Lad, Young Avenger',
  'Immortus, Master of Eternity',
  'Victor Timely, Wily Tycoon',
  'Pharaoh Rama-Tut',
  'Think Twice',
  'Depower',
  'Timeline Inquiry',
  'Multiversal Recruitment',
  'Time Warp',
  'Thriving Isle',
  'Island',
];

type G = ReturnType<typeof game>;
const castable = (g: G, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', defId, 'hand'));

describe('Kang Dynasty packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it("TVA Bureaucrat gets +1/+0 and can't be blocked after a noncreature spell", () => {
    const g = game({
      p1: {
        hand: ['think-twice'],
        battlefield: ['tva-bureaucrat', ...n('island', 2)],
        library: n('island', 3),
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const tva = g.id('p1', 'tva-bureaucrat');
    expect(pt(g, tva)).toEqual([1, 3]);
    settle(cast(g, 'think-twice'));
    expect(pt(g, tva)).toEqual([2, 3]);
    g.passUntilStep('beginCombat').passBoth().attack(tva);
    settle(g);
    g.passUntilStep('declareBlockers', 10);
    expect(g.legal('p2').filter((a) => a.type === 'addBlock')).toHaveLength(0);
  });

  it('Immortus taps for {U} per card drawn this turn, only for noncreature spells', () => {
    const g = game({
      p1: {
        hand: ['think-twice', 'think-twice', 'tva-bureaucrat'],
        battlefield: ['immortus-master-of-eternity', ...n('island', 3)],
        library: n('island', 5),
      },
    });
    // Nothing drawn yet: Immortus makes no mana.
    settle(cast(g, 'think-twice'));
    // One card drawn: Immortus's {U} plus the last Island pay for a second Think Twice...
    expect(castable(g, 'think-twice')).toBe(true);
    // ...but not for a creature spell.
    expect(castable(g, 'tva-bureaucrat')).toBe(false);
    settle(cast(g, 'think-twice'));
    expect(g.obj(g.id('p1', 'immortus-master-of-eternity')).tapped).toBe(true);
  });

  it('Immortus with nothing drawn adds no mana', () => {
    const g = game({
      p1: {
        hand: ['think-twice'],
        battlefield: ['immortus-master-of-eternity', 'island'],
        library: n('island', 2),
      },
    });
    expect(castable(g, 'think-twice')).toBe(false);
  });

  it("Immortus's power-up: everyone shuffles hand and graveyard away and draws seven", () => {
    const g = game({
      p1: {
        hand: ['think-twice', 'bear-cub'],
        graveyard: ['time-warp', 'depower'],
        battlefield: ['immortus-master-of-eternity', ...n('island', 7)],
        library: n('island', 4),
      },
      p2: {
        hand: ['bear-cub'],
        graveyard: n('plains', 3),
        library: n('plains', 6),
      },
    });
    const imm = g.id('p1', 'immortus-master-of-eternity');
    g.do({ type: 'activateAbility', player: 'p1', source: imm, abilityIndex: 1, targets: [] });
    settle(g);
    for (const p of ['p1', 'p2'] as const) {
      expect(handSize(g, p)).toBe(7);
      expect(g.state.players[p].graveyard).toHaveLength(0);
    }
    expect(g.state.players.p1.library).toHaveLength(1);
    expect(g.state.players.p2.library).toHaveLength(3);
    expect(pt(g, imm)).toEqual([3, 3]);
  });

  it('Victor Timely casts an instant from the graveyard for free, then exiles it', () => {
    const g = game({
      p1: {
        hand: ['victor-timely-wily-tycoon'],
        graveyard: ['time-warp', 'timeline-inquiry'],
        battlefield: n('island', 5),
        library: n('island', 4),
      },
    });
    const inquiry = g.id('p1', 'timeline-inquiry', 'graveyard');
    const warp = g.id('p1', 'time-warp', 'graveyard');
    cast(g, 'victor-timely-wily-tycoon');
    let offered: string[] = [];
    for (let i = 0; i < 40; i++) {
      const d = g.decision;
      if (d.kind === 'chooseTriggerTargets') {
        const legal = g.legal();
        offered = legal.flatMap((a) =>
          a.type === 'chooseTargets'
            ? a.targets.flatMap((t) => ('object' in t ? [t.object.id] : []))
            : [],
        );
        g.do(
          legal.find(
            (a) =>
              a.type === 'chooseTargets' &&
              a.targets.some((t) => 'object' in t && t.object.id === inquiry),
          )!,
        );
        continue;
      }
      if (d.kind === 'castFree') {
        const free = g
          .legal()
          .find((a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell');
        g.do(free!);
        continue;
      }
      if (d.kind === 'discard') {
        g.do(g.legal().find((a) => a.type === 'discard')!);
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      break;
    }
    expect(offered).toContain(inquiry);
    expect(offered).not.toContain(warp);
    expect(g.obj(inquiry).zone).toBe('exile');
    // Drew three, discarded one.
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('Pharaoh Rama-Tut has ward and connives when you cast a noncreature spell', () => {
    expect(cardDb.get('pharaoh-rama-tut')!.keywords).toContain('ward');
    const g = game({
      p1: {
        hand: ['think-twice'],
        battlefield: ['pharaoh-rama-tut', ...n('island', 2)],
        library: ['bear-cub', 'island'],
      },
    });
    const rama = g.id('p1', 'pharaoh-rama-tut');
    cast(g, 'think-twice');
    for (let i = 0; i < 20; i++) {
      const d = g.decision;
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'bear-cub', 'hand') });
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      break;
    }
    expect(pt(g, rama)).toEqual([5, 5]);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('bear-cub');
  });

  it('Timeline Inquiry draws three and discards one, or keeps all three with teamwork', () => {
    const g = game({
      p1: {
        hand: n('timeline-inquiry', 2),
        battlefield: ['bear-cub', ...n('island', 8)],
        library: n('island', 8),
      },
    });
    cast(g, 'timeline-inquiry');
    for (let i = 0; i < 20; i++) {
      const d = g.decision;
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'island', 'hand') });
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      break;
    }
    // 1 left + 3 drawn - 1 discarded.
    expect(handSize(g, 'p1')).toBe(3);
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'timeline-inquiry', [], { kicked: true, teamwork: [bear] }));
    expect(g.obj(bear).tapped).toBe(true);
    expect(handSize(g, 'p1')).toBe(5);
  });
});
