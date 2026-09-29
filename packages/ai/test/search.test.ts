import { createEngine, type GameState, type PlayerId, redactFor } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb, deckIds, MONO_GREEN, MONO_RED } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, createSearchBot, playMatch } from '../src/index.ts';

const engine = createEngine(cardDb);

/** Decklists consistent with a hand-built scenario (every non-token card each player owns). */
function decksOf(s: GameState): Record<PlayerId, string[]> {
  const out: Record<PlayerId, string[]> = { p1: [], p2: [] };
  for (const o of Object.values(s.objects)) if (!o.isToken) out[o.owner].push(o.defId);
  return out;
}

function setup(spec: ScenarioSpec, rollouts = 24) {
  const g = new GameDriver(engine, buildScenario(cardDb, spec));
  const bot = createSearchBot(cardDb, decksOf(g.state), { rollouts, seed: 7 });
  const choose = (p: PlayerId = g.actor) => bot.chooseAction(redactFor(g.state, p), p);
  return { g, bot, choose };
}

describe('search bot', () => {
  it('takes lethal burn to the face', () => {
    const { choose } = setup({
      p1: { hand: ['lightning-strike'], battlefield: ['mountain', 'mountain'] },
      p2: { life: 3, battlefield: ['thornweald-archer'] },
    });
    expect(choose()).toMatchObject({ type: 'castSpell', targets: [{ player: 'p2' }] });
  });

  it('kills a creature with burn rather than going face at high life', () => {
    const { g, choose } = setup({
      p1: { hand: ['shock'], battlefield: ['mountain', 'fire-elemental'] },
      p2: { battlefield: ['thornweald-archer'] },
    });
    const a = choose();
    expect(a.type).toBe('castSpell');
    expect(a.type === 'castSpell' && a.targets[0]).toEqual(g.ref(g.id('p2', 'thornweald-archer')));
  });

  it('attacks with everything when that is lethal', () => {
    const { g, bot } = setup({
      step: 'beginCombat',
      p1: { battlefield: ['bear-cub', 'bear-cub', 'swab-goblin'] },
      p2: { life: 4, battlefield: ['magnigoth-sentry'] },
    });
    g.passBoth();
    for (let i = 0; i < 6 && g.state.decision.kind === 'declareAttackers'; i++) {
      g.do(bot.chooseAction(redactFor(g.state, 'p1'), 'p1'));
    }
    expect(g.state.combat!.attackers).toHaveLength(3);
  });

  it('is deterministic for a given seed', () => {
    const spec: ScenarioSpec = {
      p1: {
        hand: ['shock', 'lightning-strike'],
        battlefield: ['mountain', 'mountain', 'mountain'],
      },
      p2: { battlefield: ['thornweald-archer', 'bear-cub'] },
    };
    const a = setup(spec).choose();
    const b = setup(spec).choose();
    expect(a).toEqual(b);
  });

  it('plays a legal full game against the heuristic bot', () => {
    const decks = { p1: deckIds(MONO_RED), p2: deckIds(MONO_GREEN) };
    const r = playMatch(
      engine,
      decks,
      {
        p1: createSearchBot(cardDb, decks, { rollouts: 12, seed: 3 }),
        p2: createHeuristicBot(cardDb),
      },
      11,
    );
    expect(r.winner).not.toBeNull();
  }, 60_000);
});
