import { describe, expect, it } from 'vitest';
import { type Action, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckIds } from '../src/index.ts';
import { POOL } from '../src/pool.ts';
import { cast, engine, game, n, pt, settle } from './blb-helpers.ts';
import FIN_BOOSTER from './fixtures/fin-booster.json' with { type: 'json' };

// Final Fantasy 11c (leftovers): the last FIN booster cards, and the whole booster set.

type G = ReturnType<typeof game>;

/** Answers pending choices (accepting optional effects, taking real targets) until priority returns. */
function answer(g: G): G {
  for (let i = 0; i < 40 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
    if (g.decision.kind === 'priority') {
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do(
      legal.find((a) => a.type === 'chooseEffect' && a.accept) ??
        legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
        legal[0]!,
    );
  }
  return g;
}

function toAttack(g: G): G {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else g.do(g.legal()[0]!);
  }
  return g;
}

/** Passes until the next turn begins. */
function nextTurn(g: G): G {
  const turn = g.state.turn.number;
  for (let i = 0; i < 100 && g.state.turn.number === turn; i++) {
    const d = g.decision;
    if (d.kind === 'priority') g.pass();
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else g.do(g.legal()[0]!);
  }
  return g;
}

describe('the Final Fantasy booster set', () => {
  it('every FIN booster card (collector numbers 1-293, the basics aside) is in the pool', () => {
    // From Scryfall: the front face of each nonbasic booster card, in collector number order.
    expect(FIN_BOOSTER.length).toBe(293);
    const pool = new Set(POOL.map((p) => p.name));
    expect(FIN_BOOSTER.filter((name) => !pool.has(name))).toEqual([]);
  });
});

describe('11c leftovers', () => {
  it("Cargo Ship's mana casts artifact spells only", () => {
    const g = game({ p1: { hand: ['elixir', 'iron-giant'], battlefield: ['cargo-ship'] } });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts.map((a) => a.type === 'castSpell' && g.obj(a.card).defId)).toEqual(['elixir']);
  });

  it("Stolen Uniform borrows an opponent's Equipment until end of turn", () => {
    const g = game({
      p1: { hand: ['stolen-uniform'], battlefield: ['island', 'iron-giant'] },
      p2: { battlefield: ['coral-sword'] },
    });
    const giant = g.id('p1', 'iron-giant');
    const sword = g.id('p2', 'coral-sword');
    settle(cast(g, 'stolen-uniform', [g.ref(giant), g.ref(sword)]));
    expect(g.obj(sword).controller).toBe('p1');
    expect(g.obj(sword).attachedTo).toBe(giant);
    expect(pt(g, giant)).toEqual([7, 6]);
    nextTurn(g);
    expect(g.obj(sword).controller).toBe('p2');
    expect(g.obj(sword).attachedTo).toBeUndefined();
    expect(pt(g, giant)).toEqual([6, 6]);
  });

  it("Vincent's Limit Break sets base power and toughness and brings the creature back", () => {
    const g = game({
      p1: {
        hand: ['vincents-limit-break', 'self-destruct'],
        battlefield: [...n('swamp', 3), ...n('mountain', 2), 'iron-giant'],
      },
    });
    const giant = g.id('p1', 'iron-giant');
    settle(cast(g, 'vincents-limit-break', [g.ref(giant)], { mode: 1 }));
    expect(pt(g, giant)).toEqual([5, 2]);
    // Self-Destruct: 5 to the opponent and 5 to itself.
    settle(cast(g, 'self-destruct', [g.ref(giant), { player: 'p2' }]));
    answer(g);
    expect(g.life('p2')).toBe(15);
    expect(g.zoneOf(giant)).toBe('battlefield');
    expect(g.obj(giant).tapped).toBe(true);
    expect(pt(g, giant)).toEqual([6, 6]);
  });

  it('Coral Sword flashes in onto a creature, which gains first strike', () => {
    const g = game({ p1: { hand: ['coral-sword'], battlefield: ['mountain', 'iron-giant'] } });
    const giant = g.id('p1', 'iron-giant');
    settle(cast(g, 'coral-sword'));
    expect(g.obj(g.id('p1', 'coral-sword')).attachedTo).toBe(giant);
    expect(pt(g, giant)).toEqual([7, 6]);
  });

  it('Haste Magic pumps and exiles the top card to play', () => {
    const g = game({
      p1: { hand: ['haste-magic'], battlefield: [...n('mountain', 2), 'iron-giant'] },
    });
    const giant = g.id('p1', 'iron-giant');
    settle(cast(g, 'haste-magic', [g.ref(giant)]));
    expect(pt(g, giant)).toEqual([9, 7]);
    const exiled = g.state.players.p1.exile;
    expect(exiled.length).toBe(1);
    expect(g.obj(exiled[0]!).playableUntilTurn).toBe(g.state.turn.number);
  });

  it('Sandworm destroys a land; its controller fetches a basic land tapped', () => {
    const g = game({
      p1: { hand: ['sandworm'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['plains'], library: ['island', 'island'] },
    });
    const plains = g.id('p2', 'plains');
    settle(cast(g, 'sandworm'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === plains),
      ),
    );
    expect(g.zoneOf(plains)).toBe('graveyard');
    const island = g.id('p2', 'island');
    expect(g.obj(island).tapped).toBe(true);
  });

  it('Unexpected Request steals a creature and lends it an Equipment for the turn', () => {
    const g = game({
      p1: { hand: ['unexpected-request'], battlefield: [...n('mountain', 3), 'coral-sword'] },
      p2: { battlefield: ['iron-giant'] },
    });
    const giant = g.id('p2', 'iron-giant');
    const sword = g.id('p1', 'coral-sword');
    cast(g, 'unexpected-request', [g.ref(giant)]);
    answer(g);
    expect(g.obj(giant).controller).toBe('p1');
    expect(g.obj(sword).attachedTo).toBe(giant);
    nextTurn(g);
    expect(g.obj(giant).controller).toBe('p2');
    expect(g.obj(sword).attachedTo).toBeUndefined();
  });

  it("Galuf's Final Act passes the creature's power on as counters when it dies", () => {
    const g = game({
      p1: {
        hand: ['galufs-final-act', 'self-destruct'],
        battlefield: [...n('forest', 2), ...n('mountain', 2), 'iron-giant', 'sandworm'],
      },
    });
    const giant = g.id('p1', 'iron-giant');
    const worm = g.id('p1', 'sandworm');
    settle(cast(g, 'galufs-final-act', [g.ref(giant)]));
    expect(pt(g, giant)).toEqual([7, 6]);
    cast(g, 'self-destruct', [g.ref(giant), { player: 'p2' }]);
    answer(g);
    expect(g.life('p2')).toBe(13);
    expect(g.zoneOf(giant)).toBe('graveyard');
    expect(pt(g, worm)).toEqual([12, 11]);
  });

  it('Elixir enters tapped, then shuffles nonland cards back and gains that much life', () => {
    const g = game({
      p1: {
        hand: ['elixir'],
        battlefield: n('plains', 6),
        graveyard: ['iron-giant', 'sandworm', 'forest'],
      },
    });
    settle(cast(g, 'elixir'));
    const elixir = g.id('p1', 'elixir');
    expect(g.obj(elixir).tapped).toBe(true);
    g.obj(elixir).tapped = false;
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === elixir)!);
    settle(g);
    expect(g.zoneOf(elixir)).toBe('exile');
    expect(g.life('p1')).toBe(22);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['forest']);
  });

  it("Relentless X-ATM092 can't be blocked by fewer than three, and returns with a finality counter", () => {
    const g = game({
      p1: { battlefield: ['relentless-x-atm092'] },
      p2: { battlefield: ['iron-giant', 'sandworm', 'coral-sword'] },
    });
    const spider = g.id('p1', 'relentless-x-atm092');
    toAttack(g).attack(spider);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'iron-giant'), attacker: spider });
    expect(g.legal('p2').some((a: Action) => a.type === 'confirmBlockers')).toBe(false);

    const h = game({
      p1: { battlefield: n('plains', 8), graveyard: ['relentless-x-atm092'] },
    });
    const card = h.id('p1', 'relentless-x-atm092', 'graveyard');
    h.do(h.legal().find((a) => a.type === 'activateAbility' && a.source === card)!);
    settle(h);
    expect(h.zoneOf(card)).toBe('battlefield');
    expect(h.obj(card).tapped).toBe(true);
    expect(h.obj(card).counters?.finality).toBe(1);
  });
});

describe('random games', () => {
  const LEFTOVERS = [
    'cargo-ship',
    'stolen-uniform',
    'vincents-limit-break',
    'coral-sword',
    'haste-magic',
    'sandworm',
    'self-destruct',
    'unexpected-request',
    'galufs-final-act',
    'adventurers-airship',
    'elixir',
    'iron-giant',
    'relentless-x-atm092',
    'coral-sword',
    'unexpected-request',
    'self-destruct',
    'haste-magic',
    'adventurers-airship',
  ];
  const withCards = (deck: string, cards: string[]) => {
    const out = deckIds(deckById(deck));
    let k = 0;
    for (let i = 0; i < out.length && k < cards.length; i++) {
      if (cardDb.get(out[i]!)?.types.includes('Land')) continue;
      out[i] = cards[k++]!;
    }
    return out;
  };

  it('decks with the leftover cards play random games to completion', () => {
    const a = withCards('fin-heroes-arsenal', LEFTOVERS);
    const b = withCards('fin-time-compression', [...LEFTOVERS].reverse());
    const starter = deckIds(deckById('learn-from-the-land'));
    const pairings = [
      { p1: a, p2: b },
      { p1: b, p2: starter },
      { p1: starter, p2: a },
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
