import { createEngine, redactFor, type Action, type PlayerId } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb, deckById, deckIds } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createEasyBot, createHeuristicBot, createRandomBot, playMatch } from '../src/index.ts';

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
  const decks = {
    p1: deckIds(deckById('path-of-power')),
    p2: deckIds(deckById('might-of-the-legion')),
  };

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

  it('plays a two-colour deck: pays both colours and uses its lands', () => {
    const gruul = {
      p1: deckIds(deckById('cat-attack')),
      p2: deckIds(deckById('vampiric-hunger')),
    };
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = playMatch(engine, gruul, { p1: bot, p2: createRandomBot(cardDb, seed) }, seed);
      if (r.winner === 'p1') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });

  it('plays the Arena decks (modes, kicker, equipment, extra combats) to completion', () => {
    const deck = (id: string) => deckIds(deckById(id));
    const decks = { p1: deck('might-of-the-legion'), p2: deck('path-of-power') };
    for (let seed = 1; seed <= 4; seed++) {
      const r = playMatch(engine, decks, { p1: bot, p2: bot }, seed);
      expect(r.winner).not.toBeNull();
    }
  });
});

describe('heuristic bot: counterspells', () => {
  it('counters a big creature spell with Essence Scatter', () => {
    const g = game({
      p1: { hand: ['gnarlback-rhino'], battlefield: Array(4).fill('forest') },
      p2: { hand: ['essence-scatter'], battlefield: ['island', 'island'] },
    });
    const rhino = g.id('p1', 'gnarlback-rhino', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: rhino, targets: [] }).pass();
    const a = bot.chooseAction(redactFor(g.state, 'p2', cardDb), 'p2');
    expect(a).toMatchObject({ type: 'castSpell', targets: [{ object: { id: rhino } }] });
  });
});

describe('casting for free', () => {
  it("doesn't offer a free cast at a ward creature when the ward can't be paid", () => {
    // Regression: the bot picked Into the Flood Maw at Tolarian Terror with every land tapped.
    const g = game({
      p1: {
        hand: ['daring-waverider'],
        battlefield: lands('island', 6),
        graveyard: ['into-the-flood-maw'],
      },
      p2: { battlefield: ['tolarian-terror', 'thornweald-archer'] },
    });
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    for (let i = 0; i < 20 && g.state.decision.kind !== 'castFree'; i++)
      g.do(
        g.state.decision.kind === 'chooseTriggerTargets'
          ? g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!
          : { type: 'passPriority', player: g.actor },
      );
    expect(g.state.decision.kind).toBe('castFree');
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    const targets = casts.flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.map((t) => 'object' in t && name(g, t.object.id))).not.toContain(
      'tolarian-terror',
    );
    // And the bot's choice (with its lookahead) goes through.
    g.do(choose(g));
  });
});

describe('easy bot', () => {
  it('plays legal games to completion and loses to the heuristic bot most of the time', () => {
    const decks = {
      p1: deckIds(deckById('cat-attack')),
      p2: deckIds(deckById('vampiric-hunger')),
    };
    let heuristicWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const easySeat: PlayerId = seed % 2 ? 'p1' : 'p2';
      const easy = createEasyBot(cardDb, { seed });
      const r = playMatch(
        engine,
        decks,
        { p1: easySeat === 'p1' ? easy : bot, p2: easySeat === 'p2' ? easy : bot },
        seed,
      );
      expect(r.winner, `seed ${seed}`).not.toBeNull();
      if (r.winner !== easySeat) heuristicWins++;
    }
    expect(heuristicWins).toBeGreaterThanOrEqual(6);
  }, 30_000);

  it('never responds on the opponent’s turn', () => {
    const g = game({
      p1: { hand: ['gnarlback-rhino'], battlefield: Array(4).fill('forest') },
      p2: { hand: ['essence-scatter'], battlefield: ['island', 'island'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'gnarlback-rhino', 'hand'),
      targets: [],
    }).pass();
    const easy = createEasyBot(cardDb, { seed: 1 });
    expect(easy.chooseAction(redactFor(g.state, 'p2', cardDb), 'p2')).toEqual({
      type: 'passPriority',
      player: 'p2',
    });
  });
});

describe('heuristic bot: Codie, Vociferous Codex', () => {
  it('activates Codie in its main phase when an instant or sorcery in hand needs the mana', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['codie-vociferous-codex', ...lands('forest', 4)],
      },
    });
    const a = choose(g);
    expect(a.type).toBe('activateAbility');
    expect(a.type === 'activateAbility' && name(g, a.source)).toBe('codie-vociferous-codex');
  });

  it('leaves Codie alone with nothing to cast', () => {
    const g = game({
      p1: { hand: [], battlefield: ['codie-vociferous-codex', ...lands('forest', 4)] },
    });
    expect(choose(g).type).toBe('passPriority');
  });
});

// Reality Fracture (17a fixes): "choose a creature type" offers every creature type; the bot picks sensibly.
describe('heuristic bot: choosing a creature type', () => {
  const pickType = (g: GameDriver): string => {
    const d = g.state.decision;
    if (d.kind !== 'chooseOption') throw new Error(`Not choosing: ${d.kind}`);
    const a = choose(g);
    if (a.type !== 'chooseOption') throw new Error('Not an option');
    return d.options[a.index]!.label;
  };

  it('Kindred Judgment: keeps its own creatures and not the opponent’s', () => {
    const g = game({
      p1: {
        hand: ['kindred-judgment'],
        battlefield: [...lands('plains', 7), 'serra-angel', 'savannah-lions'],
      },
      p2: { battlefield: ['felidar-cub', 'bear-cub'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'kindred-judgment', 'hand'),
      targets: [],
    });
    g.passBoth();
    // Serra Angel's type (Angel) keeps the best creature and none of theirs.
    expect(pickType(g)).toBe('Angel');
  });

  it('Kindred Judgment with no creatures of its own names a type nobody has', () => {
    const g = game({
      p1: { hand: ['kindred-judgment'], battlefield: lands('plains', 7) },
      p2: { battlefield: ['felidar-cub', 'bear-cub'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'kindred-judgment', 'hand'),
      targets: [],
    });
    g.passBoth();
    expect(['Cat', 'Bear']).not.toContain(pickType(g));
  });
});
