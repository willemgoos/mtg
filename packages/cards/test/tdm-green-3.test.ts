import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { deckById, deckIds } from '../src/index.ts';
import { all, cast, engine, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  casts,
  counters,
  done,
  gy,
  hand,
  keywords,
  toStep,
} from './tdm-green-helpers.ts';

// Tarkir: Dragonstorm 19b: green cards, part 3.

describe('Rite of Renewal', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['rite-of-renewal'],
        battlefield: n('forest', 4),
        graveyard: ['bear-cub', 'serra-angel', 'shock'],
        library: n('forest', 4),
      },
      p2: { graveyard: ['dragon-sniper', 'sagu-pummeler', 'bear-cub', 'shock', 'forest', 'island'] },
    });
  const modeOf = (g: GameDriver, mode: number) => casts(g, 'rite-of-renewal').filter((a) => a.mode === mode);

  it('offers the number of permanent cards (up to two) and a player', () => {
    const g = setup();
    // Two permanent cards in the graveyard (the Shock is no permanent card): 0, 1 or 2 of them.
    expect(modeOf(g, 0)).toHaveLength(2); // each player
    expect(modeOf(g, 1)).toHaveLength(4); // 2 cards x 2 players
    expect(modeOf(g, 2).length).toBeGreaterThanOrEqual(4);
    expect(
      modeOf(g, 1).every((a) => !JSON.stringify(a.targets).includes(g.id('p1', 'shock', 'graveyard'))),
    ).toBe(true);
  });

  it('returns two permanent cards to your hand and shuffles up to four cards of their graveyard into their library, then is exiled', () => {
    const g = setup();
    const bear = g.id('p1', 'bear-cub', 'graveyard');
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    const rite = g.id('p1', 'rite-of-renewal', 'hand');
    const sniper = g.id('p2', 'dragon-sniper', 'graveyard');
    const pummeler = g.id('p2', 'sagu-pummeler', 'graveyard');
    const act = modeOf(g, 2).find(
      (a) =>
        JSON.stringify(a.targets).includes(bear) &&
        JSON.stringify(a.targets).includes(angel) &&
        JSON.stringify(a.targets).includes('"p2"'),
    )!;
    g.do(act);
    // The cards for the shuffle are picked one at a time, only from the player's graveyard.
    expect(g.decision.kind).toBe('spellTargets');
    const candidates = g.legal().flatMap((a) => (a.type === 'chooseTargets' && a.targets.length === 1 ? a.targets : []));
    expect(candidates).toHaveLength(6);
    for (const t of candidates) expect(g.state.players.p2.graveyard).toContain('object' in t ? t.object.id : '');
    const first = candidates.find((t) => 'object' in t && t.object.id === sniper)!;
    g.do({ type: 'chooseTargets', player: 'p1', targets: [first] });
    const second = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' && a.targets.length === 2 ? [a.targets[1]!] : []))
      .find((t) => 'object' in t && t.object.id === pummeler)!;
    g.do({ type: 'chooseTargets', player: 'p1', targets: [first, second] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: [first, second] }); // done
    done(g);
    expect(hand(g).sort()).toEqual(['bear-cub', 'serra-angel']);
    expect(gy(g, 'p2').sort()).toEqual(['bear-cub', 'forest', 'island', 'shock']);
    expect(g.state.players.p2.library).toContain(sniper);
    expect(g.state.players.p2.library).toContain(pummeler);
    expect(g.zoneOf(rite)).toBe('exile');
  });

  it('picks at most four cards for the shuffle', () => {
    const g = setup();
    g.do(modeOf(g, 0).find((a) => JSON.stringify(a.targets).includes('"p2"'))!);
    let picked: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const next = g
        .legal()
        .find((a) => a.type === 'chooseTargets' && a.targets.length === picked.length + 1)!;
      expect(next).toBeDefined();
      picked = (next as Extract<Action, { type: 'chooseTargets' }>).targets;
      g.do(next);
    }
    // Four are picked: only "done" is left.
    const acts = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(acts.every((a) => a.type === 'chooseTargets' && a.targets.length === 4)).toBe(true);
  });

  it('with no cards chosen it just exiles itself (or goes to the graveyard when countered)', () => {
    const g = setup();
    const rite = g.id('p1', 'rite-of-renewal', 'hand');
    g.do(modeOf(g, 0).find((a) => JSON.stringify(a.targets).includes('"p1"'))!);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    done(g);
    expect(g.zoneOf(rite)).toBe('exile');
    expect(gy(g)).toHaveLength(3);
  });

  it("can't target cards in a graveyard other than the chosen player's", () => {
    const g = setup();
    g.do(modeOf(g, 0).find((a) => JSON.stringify(a.targets).includes('"p1"'))!);
    const cands = g.legal().flatMap((a) => (a.type === 'chooseTargets' && a.targets.length === 1 ? a.targets : []));
    expect(cands).toHaveLength(3);
    for (const t of cands) expect(g.state.players.p1.graveyard).toContain('object' in t ? t.object.id : '');
  });
});

describe('Surrak, Elusive Hunter', () => {
  it("can't be countered", () => {
    const g = game({
      p1: { hand: ['surrak-elusive-hunter'], battlefield: n('forest', 3) },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    cast(g, 'surrak-elusive-hunter');
    g.pass();
    const spell = g.state.stack[0]!.id;
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'cancel', 'hand'),
      targets: [g.ref(spell)],
    });
    done(g);
    expect(bf(g, 'surrak-elusive-hunter')).toHaveLength(1);
    expect(gy(g, 'p1')).toEqual([]);
  });
  it('draws a card when an opponent targets a creature you control', () => {
    const g = game({
      p1: { battlefield: ['surrak-elusive-hunter', 'bear-cub'], library: n('forest', 3) },
      p2: { hand: ['doom-blade'], battlefield: n('swamp', 2) },
    });
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'doom-blade', 'hand'),
      targets: [g.ref(g.id('p1', 'bear-cub'))],
    });
    expect(g.state.stack.some((s) => s.kind === 'ability')).toBe(true);
    done(g);
    expect(hand(g)).toEqual(['forest']);
    expect(gy(g)).toEqual(['bear-cub']);
  });
  it('draws a card when an opponent targets a creature spell you control', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['surrak-elusive-hunter', ...n('forest', 2)], library: n('forest', 3) },
      p2: { hand: ['essence-scatter'], battlefield: n('island', 2) },
    });
    cast(g, 'bear-cub');
    g.pass();
    const spell = g.state.stack[0]!.id;
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'essence-scatter', 'hand'),
      targets: [g.ref(spell)],
    });
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });
  it("doesn't draw for your own spells or for an opponent's creature", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['surrak-elusive-hunter', 'bear-cub', 'mountain'], library: n('forest', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]);
    done(g);
    const h = game({
      p1: { hand: ['shock'], battlefield: ['surrak-elusive-hunter', 'mountain'], library: n('forest', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(h, 'shock', [h.ref(h.id('p2', 'bear-cub'))]);
    done(h);
    expect(hand(h)).toEqual([]);
    expect(hand(g)).toEqual([]);
  });
  it('is a 4/3 with trample', () => {
    const g = game({ p1: { battlefield: ['surrak-elusive-hunter'] } });
    const id = g.id('p1', 'surrak-elusive-hunter');
    expect(pt(g, id)).toEqual([4, 3]);
    expect(keywords(g, id)).toContain('trample');
  });
});

describe('Synchronized Charge', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['synchronized-charge'],
        battlefield: ['bear-cub', 'serra-angel', 'dragon-sniper', ...n('forest', 2)],
      },
    });
  it('puts both counters on one creature', () => {
    const g = setup();
    const bear = g.id('p1', 'bear-cub');
    const act = casts(g, 'synchronized-charge').find((a) => a.targets.length === 1 && JSON.stringify(a.targets).includes(bear))!;
    g.do(act);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toEqual(expect.arrayContaining(['vigilance', 'trample']));
    // Creatures without counters get nothing.
    expect(keywords(g, g.id('p1', 'serra-angel'))).not.toContain('trample');
    expect(pt(g, g.id('p1', 'dragon-sniper'))).toEqual([1, 1]);
  });
  it('puts one counter on each of two creatures', () => {
    const g = setup();
    const bear = g.id('p1', 'bear-cub');
    const sniper = g.id('p1', 'dragon-sniper');
    const act = casts(g, 'synchronized-charge').find(
      (a) => a.targets.length === 2 && JSON.stringify(a.targets).includes(bear) && JSON.stringify(a.targets).includes(sniper),
    )!;
    g.do(act);
    done(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(pt(g, sniper)).toEqual([2, 2]);
    expect(keywords(g, sniper)).toContain('trample');
  });
  it('gives vigilance and trample to every creature you control that has counters on it', () => {
    const g = setup();
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).plusOneCounters = 1;
    const bear = g.id('p1', 'bear-cub');
    g.do(casts(g, 'synchronized-charge').find((a) => a.targets.length === 1 && JSON.stringify(a.targets).includes(bear))!);
    done(g);
    expect(keywords(g, angel)).toEqual(expect.arrayContaining(['vigilance', 'trample']));
  });
  it('Harmonize {4}{G}: can be cast from the graveyard, then is exiled', () => {
    const g = game({
      p1: {
        graveyard: ['synchronized-charge'],
        battlefield: ['serra-angel', 'bear-cub', 'forest'],
      },
    });
    const card = g.id('p1', 'synchronized-charge', 'graveyard');
    const act = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === card &&
          (a as { harmonizeTap?: string }).harmonizeTap === g.id('p1', 'serra-angel') &&
          a.targets.length === 1 &&
          JSON.stringify(a.targets).includes(g.id('p1', 'bear-cub')),
      )!;
    expect(act).toBeDefined();
    g.do(act);
    done(g);
    expect(g.zoneOf(card)).toBe('exile');
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([4, 4]);
  });
});

describe('Trade Route Envoy', () => {
  it('draws a card if you control a creature with a counter on it', () => {
    const g = game({
      p1: {
        hand: ['trade-route-envoy'],
        battlefield: ['bear-cub', ...n('forest', 4)],
        library: n('forest', 3),
      },
    });
    g.obj(g.id('p1', 'bear-cub')).plusOneCounters = 1;
    done(cast(g, 'trade-route-envoy'));
    expect(hand(g)).toEqual(['forest']);
    expect(pt(g, g.id('p1', 'trade-route-envoy'))).toEqual([4, 3]);
  });
  it('otherwise gets a +1/+1 counter', () => {
    const g = game({
      p1: { hand: ['trade-route-envoy'], battlefield: ['bear-cub', ...n('forest', 4)], library: n('forest', 3) },
    });
    done(cast(g, 'trade-route-envoy'));
    expect(hand(g)).toEqual([]);
    expect(pt(g, g.id('p1', 'trade-route-envoy'))).toEqual([5, 4]);
  });
});

describe('Traveling Botanist', () => {
  const attackWith = (library: string[]) => {
    const g = game({ p1: { battlefield: ['traveling-botanist'], library } });
    toStep(g, 'beginCombat');
    g.passBoth();
    g.attack(g.id('p1', 'traveling-botanist'));
    return g;
  };
  it('reveals a land on top and puts it into your hand when it becomes tapped', () => {
    const g = attackWith(['island', 'forest']);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'island', 'library') });
    expect(hand(g)).toEqual(['island']);
    expect(
      g.events.some((e) => e.type === 'cardsRevealed' && e.cards.some((c) => c.defId === 'island')),
    ).toBe(true);
  });
  it('may leave the land on top', () => {
    const g = attackWith(['island', 'forest']);
    settle(g);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    expect(hand(g)).toEqual([]);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('island');
  });
  it("may put the card into the graveyard if it doesn't go to the hand", () => {
    const g = attackWith(['island', 'forest']);
    settle(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(gy(g)).toEqual(['island']);
  });
  it('a card that is not a land can only be put into the graveyard or left', () => {
    const g = attackWith(['bear-cub', 'forest']);
    settle(g);
    const picks = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(picks).toHaveLength(0);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(gy(g)).toEqual(['bear-cub']);
  });
});

describe('Undergrowth Leopard', () => {
  it('{1}, Sacrifice: destroys target artifact or enchantment', () => {
    const g = game({
      p1: { battlefield: ['undergrowth-leopard', 'forest'] },
      p2: { battlefield: ['gardenize', 'bear-cub', 'dragonbroods-relic'] },
    });
    const idx = abilityIndex('undergrowth-leopard', 'activated');
    const leopard = g.id('p1', 'undergrowth-leopard');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === leopard);
    expect(acts).toHaveLength(2); // Gardenize and the Relic, not the Bear
    activate(g, leopard, idx, [g.ref(g.id('p2', 'gardenize'))]);
    done(g);
    expect(gy(g, 'p2')).toEqual(['gardenize']);
    expect(gy(g)).toEqual(['undergrowth-leopard']);
    expect(keywords(g, leopard)).toContain('vigilance');
  });
});

describe('Warden of the Grove', () => {
  it('puts a +1/+1 counter on itself at the beginning of your end step', () => {
    const g = game({ p1: { battlefield: ['warden-of-the-grove'] } });
    const warden = g.id('p1', 'warden-of-the-grove');
    g.passUntilStep('end');
    settle(g);
    done(g);
    expect(counters(g, warden)).toBe(1);
  });
  it('makes another nontoken creature that enters endure X, X the counters on it', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['warden-of-the-grove', ...n('forest', 2)] },
    });
    g.obj(g.id('p1', 'warden-of-the-grove')).plusOneCounters = 2;
    done(cast(g, 'bear-cub'), { option: /counters/ });
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([4, 4]);
  });
  it('or a Spirit token of that size (which does not endure again)', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['warden-of-the-grove', ...n('forest', 2)] },
    });
    g.obj(g.id('p1', 'warden-of-the-grove')).plusOneCounters = 3;
    done(cast(g, 'bear-cub'), { option: /Spirit/ });
    const spirits = all(g, 'tdm-spirit-token');
    expect(spirits).toHaveLength(1);
    expect(pt(g, spirits[0]!)).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
  });
  it('does not trigger for itself or for tokens', () => {
    const g = game({
      p1: { hand: ['warden-of-the-grove'], battlefield: n('forest', 3) },
    });
    done(cast(g, 'warden-of-the-grove'));
    expect(pt(g, g.id('p1', 'warden-of-the-grove'))).toEqual([2, 2]);
  });
});

describe('Claim Territory (details)', () => {
  it('the first Forest enters tapped, the second goes to the hand', () => {
    const g = game({
      p1: {
        hand: ['bloomvine-regent'],
        battlefield: n('plains', 1).concat(n('forest', 2)),
        library: ['forest', 'forest', 'bear-cub'],
      },
    });
    g.do(casts(g, 'bloomvine-regent').find((a) => a.back)!);
    done(g, { pick: ['forest', 'forest'] });
    const forests = bf(g, 'forest');
    expect(forests).toHaveLength(3);
    expect(forests.filter((id) => g.obj(id).tapped)).toHaveLength(3);
    expect(hand(g)).toEqual(['forest']);
  });
  it('finding only one Forest puts it onto the battlefield', () => {
    const g = game({
      p1: { hand: ['bloomvine-regent'], battlefield: n('forest', 3), library: ['forest', 'bear-cub'] },
    });
    g.do(casts(g, 'bloomvine-regent').find((a) => a.back)!);
    done(g, { pick: ['forest'] });
    expect(bf(g, 'forest')).toHaveLength(4);
    expect(hand(g)).toEqual([]);
  });
});

describe('random games with the green cards', () => {
  it('plays out without errors', () => {
    const GREEN = [
      'ainok-wayfarer',
      'attuned-hunter',
      'bloomvine-regent',
      'champion-of-dusan',
      'craterhoof-behemoth',
      'disruptive-stormbrood',
      'dragon-sniper',
      'dragonbroods-relic',
      'dusyut-earthcarver',
      'encroaching-dragonstorm',
      'formation-breaker',
      'herd-heirloom',
      'heritage-reclamation',
      'inspirited-vanguard',
      'krotiq-nestguard',
      'lasyd-prowler',
      'natures-rhythm',
      'piercing-exhale',
      'rainveil-rejuvenator',
      'rite-of-renewal',
      'roamers-routine',
      'sage-of-the-fang',
      'sagu-pummeler',
      'sagu-wildling',
      'sarkhans-resolve',
      'sultai-devotee',
      'surrak-elusive-hunter',
      'synchronized-charge',
      'trade-route-envoy',
      'traveling-botanist',
      'undergrowth-leopard',
      'warden-of-the-grove',
    ];
    const deck = [...GREEN, ...n('forest', 22)];
    const starter = deckIds(deckById('learn-from-the-land'));
    for (let seed = 1; seed <= 12; seed++) {
      const decks = seed % 2 ? { p1: deck, p2: starter } : { p1: starter, p2: deck };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
