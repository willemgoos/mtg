import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14b (group C): black, Witherbloom (B/G) and colourless cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
}

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (d.kind === 'castFree' && opts.accept)
      g.do(g.legal().find((a) => a.type === 'castSpell')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets });
  return g;
};

/** Passes priority until it is `step` of `player`'s turn (after the turn `after`), taking default choices. */
function passTo(g: GameDriver, step: string, player: 'p1' | 'p2' = 'p1'): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 200; i++) {
    const t = g.state.turn;
    if (t.number > start && t.step === step && t.activePlayer === player) return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

describe('black prepare cards', () => {
  it('Adventurous Eater enters prepared; Have a Bite puts a counter on a creature and gains 1', () => {
    const g = game({ p1: { hand: ['adventurous-eater'], battlefield: n('swamp', 4) } });
    done(cast(g, 'adventurous-eater'));
    const eater = g.id('p1', 'adventurous-eater');
    castCopy(g, eater, [g.ref(eater)]);
    done(g);
    expect(counters(g, eater)).toBe(1);
    expect(g.life('p1')).toBe(21);
    expect(g.obj(eater).prepared).toBeUndefined();
  });

  it('Cheerful Osteomancer: Raise Dead returns a creature card to your hand', () => {
    const g = game({
      p1: {
        hand: ['cheerful-osteomancer'],
        battlefield: n('swamp', 5),
        graveyard: ['serra-angel'],
      },
    });
    done(cast(g, 'cheerful-osteomancer'));
    const o = g.id('p1', 'cheerful-osteomancer');
    castCopy(g, o, [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]);
    done(g);
    expect(hand(g)).toContain('serra-angel');
  });

  it('Emeritus of Woe becomes prepared at your end step after two creatures died; Demonic Tutor finds a card', () => {
    const g = game({
      p1: {
        hand: ['emeritus-of-woe'],
        battlefield: ['savannah-lions', 'savannah-lions', ...n('swamp', 6)],
        library: ['serra-angel', 'forest'],
      },
    });
    done(cast(g, 'emeritus-of-woe'));
    const e = g.id('p1', 'emeritus-of-woe');
    expect(g.obj(e).prepared).toBeDefined();
    castCopy(g, e);
    done(g, { option: 0 });
    expect(hand(g)).toHaveLength(1);
    expect(g.obj(e).prepared).toBeUndefined();
    // Two creatures die; at the end step it becomes prepared again.
    for (const l of all(g, 'savannah-lions')) g.obj(l).damage = 5;
    g.state.turn.creaturesDied = 2;
    for (let i = 0; i < 10 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.obj(e).prepared).toBeDefined();
  });

  it('Emeritus of Woe stays unprepared if only one creature died', () => {
    const g = game({ p1: { battlefield: ['emeritus-of-woe'] } });
    g.state.turn.creaturesDied = 1;
    for (let i = 0; i < 10 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.obj(g.id('p1', 'emeritus-of-woe')).prepared).toBeUndefined();
  });

  it('Grave Researcher surveils at upkeep, and with three creature cards in the graveyard becomes prepared; Reanimate costs life', () => {
    const g = game({
      p1: {
        battlefield: ['grave-researcher', 'swamp'],
        graveyard: ['serra-angel', 'savannah-lions', 'savannah-lions'],
      },
      p2: { graveyard: ['bear-cub'] },
    });
    passTo(g, 'upkeep');
    done(g);
    const r = g.id('p1', 'grave-researcher');
    expect(g.obj(r).prepared).toBeDefined();
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    done(g);
    const copy = g.obj(r).prepared!;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: copy,
      targets: [g.ref(g.id('p1', 'serra-angel', 'graveyard'))],
    });
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(g.life('p1')).toBe(20 - 5);
  });

  it('Grave Researcher stays unprepared with two creature cards', () => {
    const g = game({
      p1: { battlefield: ['grave-researcher'], graveyard: ['serra-angel', 'savannah-lions'] },
    });
    passTo(g, 'upkeep');
    done(g);
    expect(g.obj(g.id('p1', 'grave-researcher')).prepared).toBeUndefined();
  });

  it('Scathing Shadelock becomes prepared at your first main phase; Venomous Words gives +2/+0 and deathtouch', () => {
    const g = game({ p1: { battlefield: ['scathing-shadelock', ...n('swamp', 1)] } });
    passTo(g, 'main1');
    done(g);
    const s = g.id('p1', 'scathing-shadelock');
    expect(g.obj(s).prepared).toBeDefined();
    castCopy(g, s, [g.ref(s)]);
    done(g);
    expect(pt(g, s)).toEqual([6, 6]);
    expect(keywords(g, s)).toContain('deathtouch');
  });

  it('Scheming Silvertongue becomes prepared at your second main phase if you gained 2 or more life; Sign in Blood draws two and loses 2', () => {
    const g = game({ p1: { battlefield: ['scheming-silvertongue', ...n('swamp', 2)] } });
    const s = g.id('p1', 'scheming-silvertongue');
    g.state.turn.lifeGained = { p1: 2, p2: 0 };
    g.state.turn.lifeGains = { p1: 1, p2: 0 };
    for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.obj(s).prepared).toBeDefined();
    castCopy(g, s, [{ player: 'p1' }]);
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
  });

  it('Scheming Silvertongue does not become prepared after gaining only 1 life', () => {
    const g = game({ p1: { battlefield: ['scheming-silvertongue'] } });
    g.state.turn.lifeGained = { p1: 1, p2: 0 };
    g.state.turn.lifeGains = { p1: 1, p2: 0 };
    for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.obj(g.id('p1', 'scheming-silvertongue')).prepared).toBeUndefined();
  });
});
describe('black spells and creatures', () => {
  it('Arcane Omens: the target player discards a card per colour of mana spent', () => {
    const g = game({
      p1: {
        hand: ['arcane-omens'],
        battlefield: ['swamp', 'mountain', 'island', 'plains', 'forest'],
      },
      p2: { hand: n('forest', 6) },
    });
    done(cast(g, 'arcane-omens', [{ player: 'p2' }]));
    expect(hand(g, 'p2')).toHaveLength(1);
  });

  it('Arcane Omens with mono-black mana discards one', () => {
    const g = game({
      p1: { hand: ['arcane-omens'], battlefield: n('swamp', 5) },
      p2: { hand: n('forest', 3) },
    });
    done(cast(g, 'arcane-omens', [{ player: 'p2' }]));
    expect(hand(g, 'p2')).toHaveLength(2);
  });

  it('Arnyn drains 2 when a creature with power or toughness 1 or less dies, not a bigger one', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: [
          'arnyn-deathbloom-botanist',
          'savannah-lions',
          'serra-angel',
          ...n('mountain', 4),
        ],
      },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    // Serra Angel (4/4) dying with damage already marked does not trigger it.
    g.obj(g.id('p1', 'serra-angel')).damage = 3;
    done(cast(g, 'shock', [g.ref(g.id('p1', 'serra-angel'))]));
    expect(g.life('p2')).toBe(18);
  });

  it('Burrog Banemaker gets +1/+1 for {1}{B}', () => {
    const g = game({ p1: { battlefield: ['burrog-banemaker', ...n('swamp', 2)] } });
    const b = g.id('p1', 'burrog-banemaker');
    expect(keywords(g, b)).toContain('deathtouch');
    activate(g, b, 0);
    done(g);
    expect(pt(g, b)).toEqual([2, 2]);
  });

  it('Decorum Dissertation draws two and loses 2, then comes back each turn with paradigm', () => {
    const g = game({ p1: { hand: ['decorum-dissertation'], battlefield: n('swamp', 5) } });
    done(cast(g, 'decorum-dissertation', [{ player: 'p1' }]));
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.paradigms).toEqual(['decorum-dissertation']);
    expect(g.state.players.p1.exile.some((id) => g.obj(id).defId === 'decorum-dissertation')).toBe(
      true,
    );
    for (let i = 0; i < 80 && g.decision.kind !== 'castFree'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.decision.player });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.decision.kind).toBe('castFree');
  });

  it('End of the Hunt exiles the opponent’s creature with the greatest mana value', () => {
    const g = game({
      p1: { hand: ['end-of-the-hunt'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['savannah-lions', 'serra-angel', 'bear-cub'] },
    });
    done(cast(g, 'end-of-the-hunt', [{ player: 'p2' }]));
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Eternal Student makes two Inklings from the graveyard', () => {
    const g = game({ p1: { graveyard: ['eternal-student'], battlefield: n('swamp', 2) } });
    activate(g, g.id('p1', 'eternal-student', 'graveyard'), 0);
    done(g);
    expect(all(g, 'sos-inkling-token')).toHaveLength(2);
    expect(gy(g)).not.toContain('eternal-student');
  });

  it('Forum Necroscribe has ward—discard, and repartee returns a creature from your graveyard', () => {
    expect(cardDb.get('forum-necroscribe')!.wardCost).toMatchObject({ discard: true });
    const g = game({
      p1: {
        hand: ['masterful-flourish'],
        battlefield: ['forum-necroscribe', 'savannah-lions', ...n('swamp', 2)],
        graveyard: ['serra-angel'],
      },
    });
    done(cast(g, 'masterful-flourish', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it('Lecturing Scornmage grows from a spell that targets a creature', () => {
    const g = game({
      p1: {
        hand: ['masterful-flourish'],
        battlefield: ['lecturing-scornmage', ...n('swamp', 1)],
      },
    });
    const s = g.id('p1', 'lecturing-scornmage');
    done(cast(g, 'masterful-flourish', [g.ref(s)]));
    expect(counters(g, s)).toBe(1);
    expect(pt(g, s)).toEqual([3, 2]);
    expect(keywords(g, s)).toContain('indestructible');
  });

  it('Postmortem Professor returns from the graveyard by exiling an instant or sorcery', () => {
    const g = game({
      p1: {
        battlefield: ['postmortem-professor', ...n('swamp', 2)],
        graveyard: ['postmortem-professor', 'shock'],
      },
    });
    activate(g, g.id('p1', 'postmortem-professor', 'graveyard'), 2);
    done(g);
    expect(all(g, 'postmortem-professor')).toHaveLength(2);
    expect(gy(g)).toEqual([]);
  });

  it('Postmortem Professor drains 1 on attack', () => {
    const g = game({ p1: { battlefield: ['postmortem-professor'] } });
    const pp = g.id('p1', 'postmortem-professor');
    for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p1', attacker: pp, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('Pox Plague halves life, hand and permanents for each player', () => {
    const g = game({
      p1: {
        hand: ['pox-plague', ...n('forest', 4)],
        battlefield: [...n('swamp', 5), 'serra-angel'],
      },
      p2: { hand: n('forest', 5), battlefield: n('plains', 4) },
    });
    done(cast(g, 'pox-plague'));
    expect(g.life('p1')).toBe(10);
    expect(g.life('p2')).toBe(10);
    expect(hand(g, 'p1')).toHaveLength(2);
    expect(hand(g, 'p2')).toHaveLength(3);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(3);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(2);
  });

  it('Pull from the Grave returns two creature cards and gains 2', () => {
    const g = game({
      p1: {
        hand: ['pull-from-the-grave'],
        battlefield: n('swamp', 3),
        graveyard: ['serra-angel', 'savannah-lions', 'shock'],
      },
    });
    done(
      cast(g, 'pull-from-the-grave', [
        g.ref(g.id('p1', 'serra-angel', 'graveyard')),
        g.ref(g.id('p1', 'savannah-lions', 'graveyard')),
      ]),
    );
    expect(hand(g).sort()).toEqual(['savannah-lions', 'serra-angel']);
    expect(g.life('p1')).toBe(22);
  });

  it('Rabid Attack pumps the targets and draws when one dies', () => {
    const g = game({
      p1: {
        hand: ['rabid-attack', 'shock'],
        battlefield: ['savannah-lions', 'bear-cub', ...n('swamp', 2), 'mountain'],
      },
    });
    const a = g.id('p1', 'savannah-lions');
    const b = g.id('p1', 'bear-cub');
    done(cast(g, 'rabid-attack', [g.ref(a), g.ref(b)]));
    expect(pt(g, a)).toEqual([3, 1]);
    expect(pt(g, b)).toEqual([3, 2]);
    done(cast(g, 'shock', [g.ref(a)]));
    expect(g.zoneOf(a)).toBe('graveyard');
    expect(hand(g)).toHaveLength(1);
  });

  it('Tragedy Feaster is a 7/6 that sacrifices a permanent at your end step unless you gained life', () => {
    const g = game({ p1: { battlefield: ['tragedy-feaster', 'forest'] } });
    expect(pt(g, g.id('p1', 'tragedy-feaster'))).toEqual([7, 6]);
    for (let i = 0; i < 30 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(1);
  });

  it('Tragedy Feaster keeps everything when you gained life this turn', () => {
    const g = game({ p1: { battlefield: ['tragedy-feaster', 'forest'] } });
    g.state.turn.lifeGains = { p1: 1, p2: 0 };
    g.state.turn.lifeGained = { p1: 1, p2: 0 };
    for (let i = 0; i < 30 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(2);
  });

  it('Withering Curse gives -2/-2, or destroys all creatures with infusion', () => {
    const base = () =>
      game({
        p1: { hand: ['withering-curse'], battlefield: ['serra-angel', ...n('swamp', 3)] },
        p2: { battlefield: ['savannah-lions'] },
      });
    const g = base();
    done(cast(g, 'withering-curse'));
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([2, 2]);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    const h = base();
    h.state.turn.lifeGains = { p1: 1, p2: 0 };
    h.state.turn.lifeGained = { p1: 1, p2: 0 };
    done(cast(h, 'withering-curse'));
    expect(all(h, 'serra-angel')).toHaveLength(0);
  });

  it('Masterful Flourish gives +1/+0 and indestructible', () => {
    const g = game({ p1: { hand: ['masterful-flourish'], battlefield: ['bear-cub', 'swamp'] } });
    done(cast(g, 'masterful-flourish', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([3, 2]);
  });
});

describe('Ral Zarek, Guest Lecturer', () => {
  const ral = (loyaltyCounters = 3) => {
    const g = ralGame();
    g.obj(g.id('p1', 'ral-zarek-guest-lecturer')).counters = { loyalty: loyaltyCounters };
    return g;
  };
  const ralGame = () =>
    game({
      p1: {
        battlefield: ['ral-zarek-guest-lecturer'],
        graveyard: ['serra-angel', 'savannah-lions'],
      },
      p2: { hand: ['forest', 'forest'] },
    });
  const loyalty = (g: GameDriver) =>
    g.obj(g.id('p1', 'ral-zarek-guest-lecturer')).counters?.loyalty;

  it('+1 surveils 2', () => {
    const g = ral();
    activate(g, g.id('p1', 'ral-zarek-guest-lecturer'), 0);
    done(g);
    expect(loyalty(g)).toBe(4);
  });

  it('−1 makes target players discard', () => {
    const g = ral();
    activate(g, g.id('p1', 'ral-zarek-guest-lecturer'), 1, [{ player: 'p2' }]);
    done(g);
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(loyalty(g)).toBe(2);
  });

  it('−2 returns a creature card with mana value 3 or less (not a bigger one)', () => {
    const g = ral();
    const legalTargets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.abilityIndex === 2)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(legalTargets).toEqual([g.id('p1', 'savannah-lions', 'graveyard')]);
    activate(g, g.id('p1', 'ral-zarek-guest-lecturer'), 2, [
      g.ref(g.id('p1', 'savannah-lions', 'graveyard')),
    ]);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('−7 flips five coins; the opponent skips that many turns', () => {
    const g = ral(7);
    const walker = g.id('p1', 'ral-zarek-guest-lecturer');
    activate(g, walker, 3, [{ player: 'p2' }]);
    done(g);
    const skips = g.state.players.p2.skipTurns ?? 0;
    expect(skips).toBeGreaterThanOrEqual(0);
    expect(skips).toBeLessThanOrEqual(5);
    expect(g.zoneOf(walker)).toBe('graveyard');
  });

  it('a player who skips a turn is passed over', () => {
    const g = game({ p1: { battlefield: [] } });
    g.state.players.p2.skipTurns = 1;
    const start = g.state.turn.number;
    for (let i = 0; i < 40 && g.state.turn.number === start; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else g.pass();
    }
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.state.players.p2.skipTurns).toBe(0);
  });
});

describe('Witherbloom (B/G)', () => {
  it('Cauldron of Essence drains when your creature dies, and reanimates by sacrificing one', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: [
          'cauldron-of-essence',
          'savannah-lions',
          'swamp',
          'forest',
          'swamp',
          'mountain',
        ],
        graveyard: ['serra-angel'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'shock', [g.ref(lions)]));
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    const g2 = game({
      p1: {
        battlefield: ['cauldron-of-essence', 'savannah-lions', 'swamp', 'forest', 'swamp'],
        graveyard: ['serra-angel'],
      },
    });
    activate(
      g2,
      g2.id('p1', 'cauldron-of-essence'),
      1,
      [g2.ref(g2.id('p1', 'serra-angel', 'graveyard'))],
      { sacrifice: g2.id('p1', 'savannah-lions') },
    );
    done(g2);
    expect(all(g2, 'serra-angel')).toHaveLength(1);
    expect(gy(g2)).toContain('savannah-lions');
    // The sacrificed creature triggered the drain too.
    expect(g2.life('p2')).toBe(19);
  });

  it("Dina's Guidance puts a creature into your hand or graveyard", () => {
    const mk = () =>
      game({
        p1: {
          hand: ['dinas-guidance'],
          battlefield: ['swamp', 'forest', 'swamp'],
          library: ['serra-angel', 'forest'],
        },
      });
    const a = mk();
    done(cast(a, 'dinas-guidance'), { option: 0 });
    expect(hand(a)).toEqual(['serra-angel']);
    const b = mk();
    done(cast(b, 'dinas-guidance'), { option: 1 });
    expect(gy(b)).toContain('serra-angel');
  });

  it('Mind Roots: the target player discards two cards and you may keep a land among them', () => {
    const g = game({
      p1: { hand: ['mind-roots'], battlefield: ['swamp', 'forest', 'swamp'] },
      p2: { hand: ['forest', 'plains', 'savannah-lions'] },
    });
    done(cast(g, 'mind-roots', [{ player: 'p2' }]), { option: 0 });
    expect(hand(g, 'p2')).toEqual(['savannah-lions']);
    expect(gy(g, 'p2')).toHaveLength(1);
    const lands = g.state.battlefield.filter(
      (id) =>
        g.obj(id).controller === 'p1' &&
        g.obj(id).tapped &&
        ['forest', 'plains'].includes(g.obj(id).defId),
    );
    expect(lands.length).toBeGreaterThanOrEqual(1);
    expect(
      g.state.battlefield.some(
        (id) => g.obj(id).defId === 'plains' || g.obj(id).defId === 'forest',
      ),
    ).toBe(true);
  });

  describe('Professor Dellian Fel', () => {
    const dellian = (loyalty = 5) => {
      const g = game({
        p1: { battlefield: ['professor-dellian-fel'], library: n('forest', 5) },
        p2: { battlefield: ['serra-angel'] },
      });
      g.obj(g.id('p1', 'professor-dellian-fel')).counters = { loyalty };
      return g;
    };
    const id = (g: GameDriver) => g.id('p1', 'professor-dellian-fel');

    it('+2 gains 3 life; 0 draws a card and loses 1 life', () => {
      const g = dellian();
      activate(g, id(g), 0);
      done(g);
      expect(g.life('p1')).toBe(23);
      expect(g.obj(id(g)).counters?.loyalty).toBe(7);
      const h = dellian();
      activate(h, id(h), 1);
      done(h);
      expect(hand(h)).toHaveLength(1);
      expect(h.life('p1')).toBe(19);
    });

    it('−3 destroys a creature', () => {
      const g = dellian();
      activate(g, id(g), 2, [g.ref(g.id('p2', 'serra-angel'))]);
      done(g);
      expect(all(g, 'serra-angel')).toHaveLength(0);
    });

    it('−6 gives an emblem that makes an opponent lose life when you gain life', () => {
      const g = game({
        p1: {
          hand: ['mindful-biomancer'],
          battlefield: ['professor-dellian-fel', 'forest', 'forest'],
        },
      });
      g.obj(id(g)).counters = { loyalty: 6 };
      activate(g, id(g), 3);
      done(g);
      expect(g.state.emblems).toHaveLength(1);
      done(cast(g, 'mindful-biomancer'));
      // Mindful Biomancer gains 1 life when it enters: the opponent loses that much.
      expect(g.life('p1')).toBe(21);
      expect(g.life('p2')).toBe(19);
    });
  });

  it('Vicious Rivalry: pay X life, destroy artifacts and creatures with mana value X or less', () => {
    const g = game({
      p1: {
        hand: ['vicious-rivalry'],
        battlefield: ['savannah-lions', 'serra-angel', ...n('swamp', 2), ...n('forest', 2)],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const rivalry = g.id('p1', 'vicious-rivalry', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: rivalry, targets: [], x: 2 });
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it('Witherbloom, the Balancer costs {1} less per creature, and so do your instants and sorceries', () => {
    const g = game({
      p1: {
        hand: ['witherbloom-the-balancer'],
        battlefield: [
          'bear-cub',
          'bear-cub',
          'savannah-lions',
          'swamp',
          'forest',
          ...n('mountain', 3),
        ],
      },
    });
    // {6}{B}{G} minus three creatures leaves {3}{B}{G}: five lands.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    done(cast(g, 'witherbloom-the-balancer'));
    expect(all(g, 'witherbloom-the-balancer')).toHaveLength(1);
    expect(keywords(g, g.id('p1', 'witherbloom-the-balancer'))).toContain('deathtouch');
    // Now four creatures: Last Gasp ({1}{B}) costs only {B}.
    const h = game({
      p1: {
        hand: ['last-gasp'],
        battlefield: ['witherbloom-the-balancer', 'bear-cub', 'swamp'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    done(cast(h, 'last-gasp', [h.ref(h.id('p2', 'savannah-lions'))]));
    expect(all(h, 'savannah-lions')).toHaveLength(0);
  });
});

describe('colourless', () => {
  it('The Dawning Archaic costs less per instant and sorcery card, and casts one from the graveyard when it attacks', () => {
    const g = game({
      p1: {
        hand: ['the-dawning-archaic'],
        battlefield: n('swamp', 7),
        graveyard: ['shock', 'shock', 'shock'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const h = game({
      p1: { battlefield: ['the-dawning-archaic'], graveyard: ['shock'] },
    });
    for (let i = 0; i < 10 && h.decision.kind !== 'declareAttackers'; i++) h.pass();
    h.do({
      type: 'addAttacker',
      player: 'p1',
      attacker: h.id('p1', 'the-dawning-archaic'),
      defender: 'p2',
    });
    h.do({ type: 'confirmAttackers', player: 'p1' });
    settle(h);
    expect(h.decision.kind).toBe('castFree');
    h.do(
      h
        .legal()
        .find(
          (a) =>
            a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
        )!,
    );
    done(h);
    expect(h.life('p2')).toBe(18);
    expect(h.state.players.p1.exile.some((id) => h.obj(id).defId === 'shock')).toBe(true);
    expect(gy(h)).not.toContain('shock');
  });

  it('Rancorous Archaic enters with a +1/+1 counter per colour of mana spent', () => {
    const g = game({
      p1: {
        hand: ['rancorous-archaic'],
        battlefield: ['swamp', 'island', 'plains', 'mountain', 'forest'],
      },
    });
    done(cast(g, 'rancorous-archaic'));
    const a = g.id('p1', 'rancorous-archaic');
    expect(counters(g, a)).toBe(5);
    expect(pt(g, a)).toEqual([7, 7]);
    expect(keywords(g, a)).toContain('trample');
  });

  it('Sundering Archaic exiles a nonland permanent with mana value up to the colours spent', () => {
    const mk = (lands: string[]) =>
      game({
        p1: { hand: ['sundering-archaic'], battlefield: lands },
        p2: { battlefield: ['serra-angel', 'savannah-lions'] },
      });
    const mono = mk(n('swamp', 6));
    done(cast(mono, 'sundering-archaic'));
    expect(all(mono, 'savannah-lions')).toHaveLength(0);
    expect(all(mono, 'serra-angel')).toHaveLength(1);
    const rainbow = mk(['swamp', 'island', 'plains', 'mountain', 'forest', 'swamp']);
    done(cast(rainbow, 'sundering-archaic'), { option: 0 });
    expect(all(rainbow, 'serra-angel')).toHaveLength(0);
  });

  it('Sundering Archaic puts a graveyard card on the bottom of its owner’s library for {2}', () => {
    const g = game({
      p1: { battlefield: ['sundering-archaic', 'swamp', 'swamp'] },
      p2: { graveyard: ['serra-angel'] },
    });
    const target = g.id('p2', 'serra-angel', 'graveyard');
    activate(g, g.id('p1', 'sundering-archaic'), 1, [g.ref(target)]);
    done(g);
    const lib = g.state.players.p2.library;
    expect(g.obj(lib[lib.length - 1]!).defId).toBe('serra-angel');
  });

  it('Together as One draws, deals damage and gains life equal to the colours spent', () => {
    const g = game({
      p1: {
        hand: ['together-as-one'],
        battlefield: ['swamp', 'island', 'plains', 'swamp', 'swamp', 'swamp'],
      },
    });
    done(cast(g, 'together-as-one', [{ player: 'p1' }, { player: 'p2' }]));
    expect(hand(g)).toHaveLength(3);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });

  it('Transcendent Archaic may draw X cards, then discards two', () => {
    const g = game({
      p1: {
        hand: ['transcendent-archaic'],
        battlefield: ['swamp', 'island', 'plains', 'swamp', 'swamp', 'swamp', 'swamp'],
      },
    });
    done(cast(g, 'transcendent-archaic'), { accept: true });
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(2);
    expect(keywords(g, g.id('p1', 'transcendent-archaic'))).toContain('vigilance');
  });

  it('Biblioplex Tomekeeper prepares or unprepares a creature', () => {
    const g = game({
      p1: {
        hand: ['biblioplex-tomekeeper', 'biblioplex-tomekeeper'],
        battlefield: ['goblin-glasswright', ...n('swamp', 8)],
      },
    });
    const glass = g.id('p1', 'goblin-glasswright');
    cast(g, 'biblioplex-tomekeeper');
    settle(g);
    done(g);
    expect(g.obj(glass).prepared).toBeDefined();
    cast(g, 'biblioplex-tomekeeper');
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.mode === 1 && a.targets.length > 0),
    );
    done(g);
    expect(g.obj(glass).prepared).toBeUndefined();
  });

  it('Diary of Dreams collects page counters and draws for less', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['diary-of-dreams', 'mountain', 'mountain', 'mountain', 'mountain'],
      },
    });
    const diary = g.id('p1', 'diary-of-dreams');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.obj(diary).counters?.page).toBe(1);
    g.obj(diary).counters = { page: 2 };
    activate(g, diary, 1);
    done(g);
    expect(hand(g)).toHaveLength(1);
  });

  it('Diary of Dreams costs the full {5} with no page counters', () => {
    const g = game({ p1: { battlefield: ['diary-of-dreams', ...n('mountain', 3)] } });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('Mage Tower Referee grows from multicolored spells only', () => {
    const g = game({
      p1: {
        hand: ['dinas-guidance', 'shock'],
        battlefield: ['mage-tower-referee', 'swamp', 'forest', 'mountain', 'swamp'],
        library: ['serra-angel'],
      },
    });
    const r = g.id('p1', 'mage-tower-referee');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(counters(g, r)).toBe(0);
    done(cast(g, 'dinas-guidance'));
    expect(counters(g, r)).toBe(1);
  });

  it('Page, Loose Leaf taps for {C} and its grandeur finds an instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['page-loose-leaf', 'page-loose-leaf'],
        battlefield: ['page-loose-leaf'],
        library: ['forest', 'shock', 'forest'],
      },
    });
    const [a, b] = g.state.players.p1.hand;
    activate(g, a!, 1, [], { discard: b });
    done(g);
    expect(hand(g).sort()).toEqual(['page-loose-leaf', 'shock']);
    expect(gy(g)).toEqual(['page-loose-leaf']);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toEqual(['forest', 'forest']);
  });

  it('Potioner’s Trove gains 2 life only after an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['potioners-trove', 'mountain'] },
    });
    const trove = g.id('p1', 'potioners-trove');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.abilityIndex === 5)).toBe(false);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    activate(g, trove, 5);
    done(g);
    expect(g.life('p1')).toBe(22);
  });

  it('Strixhaven Skycoach fetches a basic land and can be crewed', () => {
    const g = game({
      p1: {
        hand: ['strixhaven-skycoach'],
        battlefield: [...n('swamp', 3), 'bear-cub'],
        library: ['plains', 'serra-angel'],
      },
    });
    done(cast(g, 'strixhaven-skycoach'), { accept: true });
    expect(hand(g)).toContain('plains');
    const coach = g.id('p1', 'strixhaven-skycoach');
    expect(keywords(g, coach)).toContain('flying');
    activate(g, coach, 1);
    done(g);
    expect(getCharacteristics(g.state, cardDb, coach).power).toBe(3);
    expect(g.obj(g.id('p1', 'bear-cub')).tapped).toBe(true);
  });
});

describe('lands', () => {
  it('Great Hall of the Biblioplex pays for instants and sorceries only, and animates for {5}', () => {
    const g = game({
      p1: { hand: ['shock', 'savannah-lions'], battlefield: ['great-hall-of-the-biblioplex'] },
    });
    const castable = new Set(
      g
        .legal()
        .filter((a) => a.type === 'castSpell')
        .map((a) => g.obj((a as { card: string }).card).defId),
    );
    expect([...castable]).toEqual(['shock']);
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(19);
    const h = game({
      p1: {
        hand: ['shock'],
        battlefield: ['great-hall-of-the-biblioplex', ...n('swamp', 5), 'mountain'],
      },
    });
    const hall = h.id('p1', 'great-hall-of-the-biblioplex');
    const animate = h
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === hall && a.abilityIndex === 11);
    expect(animate).toBeDefined();
    h.do(animate!);
    done(h);
    expect(pt(h, hall)).toEqual([2, 4]);
    expect(getCharacteristics(h.state, cardDb, hall).subtypes).toContain('Wizard');
    expect(cardDb.get('great-hall-of-the-biblioplex')!.types).toEqual(['Land']);
    // It's a creature now: the animate ability is no longer offered, and instants pump it.
    expect(
      h
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === hall && a.abilityIndex === 11),
    ).toBe(false);
    done(cast(h, 'shock', [{ player: 'p2' }]));
    expect(pt(h, hall)).toEqual([3, 4]);
  });

  it('Petrified Hamlet names a land: its abilities can’t be activated', () => {
    const g = game({
      p1: {
        hand: ['petrified-hamlet'],
        battlefield: ['skycoach-waypoint', ...n('swamp', 3), 'goblin-glasswright'],
      },
    });
    const waypoint = g.id('p1', 'skycoach-waypoint');
    const prepAbility = () =>
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === waypoint && a.abilityIndex === 1);
    expect(prepAbility()).toBe(true);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'petrified-hamlet', 'hand') });
    done(g, { option: /^Skycoach Waypoint$/ });
    expect(g.obj(g.id('p1', 'petrified-hamlet')).chosenName).toBe('skycoach-waypoint');
    expect(prepAbility()).toBe(false);
  });

  it('Skycoach Waypoint prepares a creature for {3}', () => {
    const g = game({
      p1: { battlefield: ['skycoach-waypoint', ...n('swamp', 3), 'goblin-glasswright'] },
    });
    const glass = g.id('p1', 'goblin-glasswright');
    activate(g, g.id('p1', 'skycoach-waypoint'), 1, [g.ref(glass)]);
    done(g);
    expect(g.obj(glass).prepared).toBeDefined();
  });
});

// @@END
