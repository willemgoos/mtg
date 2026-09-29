import { createEngine, redactFor, type Action, type PlayerId } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb, deckIds, MONO_GREEN, MONO_RED } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, createRandomBot, playMatch } from '../src/index.ts';

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);
const lands = (name: string, n: number) => Array<string>(n).fill(name);
const name = (g: GameDriver, id: string) => g.obj(id).defId;

/** Lets the bot make decisions until it passes priority or it's not its decision. */
function botActs(g: GameDriver, p: PlayerId): Action[] {
  const taken: Action[] = [];
  for (let i = 0; i < 20 && g.state.decision.kind !== 'gameOver' && g.actor === p; i++) {
    const a = choose(g, p);
    if (a.type === 'passPriority') break;
    taken.push(a);
    g.do(a);
  }
  return taken;
}

describe('heuristic bot: spells', () => {
  it('burns a creature it can kill rather than the face at high life', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: lands('mountain', 1) },
      p2: { battlefield: ['thornweald-archer'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    expect(a.type === 'castSpell' && a.targets[0]).toEqual(g.ref(g.id('p2', 'thornweald-archer')));
  });

  it('goes face when the burn is lethal', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: lands('mountain', 2) },
      p2: { life: 3, battlefield: ['thornweald-archer'] },
    });
    const a = choose(g);
    expect(a.type === 'castSpell' && a.targets[0]).toEqual({ player: 'p2' });
  });

  it('holds a pump spell when it would do nothing', () => {
    const g = game({ p1: { hand: ['giant-growth'], battlefield: ['forest', 'bear-cub'] } });
    expect(choose(g).type).toBe('passPriority');
  });

  it('casts creatures in its main phase', () => {
    const g = game({
      p1: { hand: ['bear-cub', 'magnigoth-sentry'], battlefield: lands('forest', 4) },
    });
    const taken = botActs(g, 'p1');
    expect(taken.map((a) => (a.type === 'castSpell' ? name(g, a.card) : a.type))).toEqual([
      'magnigoth-sentry',
    ]);
  });

  it('pumps a blocked attacker to win the combat', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['giant-growth'], battlefield: ['forest', 'bear-cub'] },
      p2: { battlefield: ['swab-goblin'] },
    });
    const cub = g.id('p1', 'bear-cub');
    g.passBoth().attack(cub).passBoth();
    g.block([g.id('p2', 'swab-goblin'), cub]);
    const a = choose(g, 'p1');
    expect(a.type === 'castSpell' && name(g, a.card)).toBe('giant-growth');
  });

  it('uses a sacrifice ability to kill a creature', () => {
    const g = game({
      p1: { battlefield: ['fanatical-firebrand'] },
      p2: { battlefield: ['thornweald-archer'] },
    });
    const a = choose(g);
    expect(a.type === 'activateAbility' && a.targets[0]).toEqual(
      g.ref(g.id('p2', 'thornweald-archer')),
    );
  });
});

describe('heuristic bot: combat', () => {
  it('attacks an empty board and holds back against a bigger blocker', () => {
    const open = game({ step: 'beginCombat', p1: { battlefield: ['bear-cub'] } });
    open.passBoth();
    expect(choose(open)).toMatchObject({ type: 'addAttacker' });

    const walled = game({
      step: 'beginCombat',
      p1: { battlefield: ['bear-cub'] },
      p2: { battlefield: ['magnigoth-sentry'] },
    });
    walled.passBoth();
    expect(choose(walled)).toMatchObject({ type: 'confirmAttackers' });
  });

  it('attacks with fliers past ground blockers', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['shivan-dragon'] },
      p2: { battlefield: ['bear-cub'] },
    });
    g.passBoth();
    expect(choose(g)).toMatchObject({ type: 'addAttacker', attacker: g.id('p1', 'shivan-dragon') });
  });

  it('blocks for value and never chump-blocks at high life', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['fire-elemental', 'bear-cub'] },
      p2: { battlefield: ['swab-goblin', 'magnigoth-sentry'] },
    });
    g.passBoth().attack(g.id('p1', 'fire-elemental'), g.id('p1', 'bear-cub')).passBoth();
    botActs(g, 'p2');
    const blocked = g.state.combat!.attackers.filter((a) => a.blockers.length > 0).map((a) => a.id);
    g.passUntilStep('endCombat');
    // Every creature p2 lost took an attacker down with it.
    for (const id of blocked) expect(g.zoneOf(id)).toBe('graveyard');
    expect(g.state.players.p2.graveyard.length).toBeLessThanOrEqual(blocked.length);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('does not block a bigger attacker at high life', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['fire-elemental'] },
      p2: { battlefield: ['swab-goblin'] },
    });
    g.passBoth().attack(g.id('p1', 'fire-elemental')).passBoth();
    expect(choose(g, 'p2')).toMatchObject({ type: 'confirmBlockers' });
  });

  it('chump-blocks when the damage would be lethal', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['fire-elemental'] },
      p2: { life: 5, battlefield: ['swab-goblin'] },
    });
    g.passBoth().attack(g.id('p1', 'fire-elemental')).passBoth();
    botActs(g, 'p2');
    expect(g.state.combat!.attackers[0]!.blockers).toHaveLength(1);
  });
});

describe('heuristic bot: full games', () => {
  const decks = { p1: deckIds(MONO_RED), p2: deckIds(MONO_GREEN) };

  it('plays legal games to completion and beats a random bot with either deck', () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const heuristicSeat: PlayerId = seed % 2 ? 'p1' : 'p2';
      const bots = {
        p1: heuristicSeat === 'p1' ? bot : createRandomBot(cardDb, seed),
        p2: heuristicSeat === 'p2' ? bot : createRandomBot(cardDb, seed),
      };
      const r = playMatch(engine, decks, bots, seed);
      expect(r.winner).not.toBeNull();
      if (r.winner === heuristicSeat) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });
});
