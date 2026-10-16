import { createEngine, redactFor, type Action, type PlayerId } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createEasyBot, type EasyOptions } from '../src/index.ts';

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const easy = (opts: Omit<EasyOptions, 'seed'>, seed = 1) =>
  createEasyBot(cardDb, { seed, ...opts });
const choose = (g: GameDriver, opts: Omit<EasyOptions, 'seed'>, p: PlayerId = g.actor): Action =>
  easy(opts).chooseAction(redactFor(g.state, p), p);

/** The easy bot's whole declaration for `p`, applied one action at a time. */
function declare(g: GameDriver, opts: Omit<EasyOptions, 'seed'>, p: PlayerId) {
  const bot = easy(opts);
  for (let i = 0; i < 20 && g.actor === p; i++) {
    const a = bot.chooseAction(redactFor(g.state, p), p);
    g.do(a);
    if (a.type === 'confirmBlockers' || a.type === 'confirmAttackers') break;
  }
}

const NONE = { skipBlockChance: 0, skipAttackChance: 0, holdChance: 0 };

describe('easy bot: flyers', () => {
  const blockScenario = () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['shivan-dragon'] },
      p2: { battlefield: ['thornweald-archer'] },
    });
    g.passBoth().attack(g.id('p1', 'shivan-dragon')).passBoth();
    return g;
  };

  it('plays like the heuristic bot with the chance at 0', () => {
    const g = blockScenario();
    declare(g, { ...NONE, flyerChance: 0 }, 'p2');
    expect(g.state.combat!.attackers[0]!.blockers).toHaveLength(1);
  });

  it('lets a flyer through with the chance at 1', () => {
    const g = blockScenario();
    declare(g, { ...NONE, flyerChance: 1 }, 'p2');
    expect(g.state.combat!.attackers[0]!.blockers).toHaveLength(0);
  });

  it('still blocks the flyer when it would be lethal', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['shivan-dragon'] },
      p2: { life: 5, battlefield: ['thornweald-archer'] },
    });
    g.passBoth().attack(g.id('p1', 'shivan-dragon')).passBoth();
    declare(g, { ...NONE, flyerChance: 1 }, 'p2');
    expect(g.state.combat!.attackers[0]!.blockers).toHaveLength(1);
  });
});

describe('easy bot: burn', () => {
  const burnScenario = (life = 20) =>
    game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { life, battlefield: ['thornweald-archer'] },
    });
  const target = (a: Action) => (a.type === 'castSpell' ? a.targets[0] : undefined);

  it('kills the creature with the chance at 0', () => {
    const t = target(choose(burnScenario(), { holdChance: 0, faceBurnChance: 0 }));
    expect(t).toMatchObject({ object: { id: expect.anything() } });
  });

  it('burns the face at high life with the chance at 1', () => {
    expect(target(choose(burnScenario(), { holdChance: 0, faceBurnChance: 1 }))).toEqual({
      player: 'p2',
    });
  });

  it('keeps burning the creature when the opponent is low', () => {
    const t = target(choose(burnScenario(6), { holdChance: 0, faceBurnChance: 1 }));
    expect(t).toMatchObject({ object: { id: expect.anything() } });
  });
});

describe('easy bot: attacks and blocks', () => {
  it('leaves an attacker home with the chance at 1', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['fire-elemental'] },
    });
    g.passBoth();
    declare(g, { ...NONE, dropAttackerChance: 1 }, 'p1');
    expect(g.state.turn.attackers).toHaveLength(0);
    const h = game({ step: 'beginCombat', p1: { battlefield: ['fire-elemental'] } });
    h.passBoth();
    declare(h, { ...NONE, dropAttackerChance: 0 }, 'p1');
    expect(h.state.turn.attackers).toHaveLength(1);
  });

  it('puts its best creature in front when the cheap one would do', () => {
    const make = () => {
      const g = game({
        step: 'beginCombat',
        p1: { battlefield: ['thornweald-archer'] },
        p2: { battlefield: ['fire-elemental', 'swab-goblin'] },
      });
      g.passBoth().attack(g.id('p1', 'thornweald-archer')).passBoth();
      return g;
    };
    const blocker = (opts: Omit<EasyOptions, 'seed'>) => {
      const g = make();
      declare(g, { ...NONE, ...opts }, 'p2');
      return g.state.combat!.attackers[0]!.blockers.map((id) => g.obj(id).defId);
    };
    expect(blocker({ badBlockChance: 1 })).toEqual(['fire-elemental']);
    expect(blocker({ badBlockChance: 0 })).toEqual(['swab-goblin']);
  });
});
