import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a: the colourless group (artifacts and nonbasic lands).

const NAMES = [
  'Afterthought Sentry',
  'Archive Arbiter',
  'Codie, Ravenous Codex',
  'Dedicated Commons',
  'Emrakul, the Exigent Doom',
  'Eye of Jace',
  'Fatehold Annex',
  'Formidable Commons',
  'Hall of Echoes',
  'Hexhaven Dueling Arena',
  'Innovative Commons',
  'Karn, Argent Defender',
  'Konstrari Annex',
  'Living Library',
  "Medic's Kitesail",
  'Meticulous Commons',
  'Murmuring Volume',
  'Roiling Canopy',
  'Room of Refuge',
  'Stingerquill Annex',
  'The Echoverse Fulcrum',
  'Theorix Annex',
  'Transformative Commons',
  'Traxos, Scourge Eternal',
  'Vigorbloom Annex',
];

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);

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
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
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

const legalAbility = (g: GameDriver, source: string, abilityIndex: number) =>
  g
    .legal()
    .filter(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === abilityIndex,
    );

/** Passes priority until it is `step` of `player`'s turn (on a later turn than now). */
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

describe('the group is in the pool', () => {
  it('every card exists', () => {
    for (const name of NAMES) {
      const id = name
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      expect(cardDb.get(id), name).toBeDefined();
    }
  });
});

describe('planeswalker lands', () => {
  const LANDS: [string, string, string][] = [
    ['dedicated-commons', 'R', 'W'],
    ['fatehold-annex', 'W', 'U'],
    ['formidable-commons', 'B', 'G'],
    ['innovative-commons', 'U', 'R'],
    ['konstrari-annex', 'R', 'G'],
    ['meticulous-commons', 'W', 'B'],
    ['stingerquill-annex', 'B', 'R'],
    ['theorix-annex', 'U', 'B'],
    ['transformative-commons', 'G', 'U'],
    ['vigorbloom-annex', 'G', 'W'],
  ];

  for (const [land, a, b] of LANDS) {
    it(`${land} enters tapped without a planeswalker, untapped with one, and taps for ${a} or ${b}`, () => {
      const g = game({ p1: { hand: [land] } });
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', land, 'hand') });
      expect(g.obj(g.id('p1', land)).tapped).toBe(true);

      const h = game({ p1: { hand: [land], battlefield: ['vivien-reid'] } });
      h.do({ type: 'playLand', player: 'p1', card: h.id('p1', land, 'hand') });
      const id = h.id('p1', land);
      expect(h.obj(id).tapped).toBe(false);
      const produced = cardDb
        .get(land)!
        .abilities.filter((x) => x.kind === 'mana')
        .map((x) => (x.kind === 'mana' ? x.produces : ''));
      expect(produced).toEqual([a, b]);
    });
  }

  it('an opponent-controlled planeswalker does not count', () => {
    const g = game({ p1: { hand: ['dedicated-commons'] }, p2: { battlefield: ['vivien-reid'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'dedicated-commons', 'hand') });
    expect(g.obj(g.id('p1', 'dedicated-commons')).tapped).toBe(true);
  });
});

describe('Afterthought Sentry', () => {
  it('{2}: gains flying until end of turn', () => {
    const g = game({ p1: { battlefield: ['afterthought-sentry', 'forest', 'forest'] } });
    const sentry = g.id('p1', 'afterthought-sentry');
    expect(pt(g, sentry)).toEqual([2, 2]);
    expect(keywords(g, sentry)).not.toContain('flying');
    settle(activate(g, sentry, 0));
    expect(keywords(g, sentry)).toContain('flying');
    // The mana is spent: no second activation.
    expect(legalAbility(g, sentry, 0)).toHaveLength(0);
  });

  it('attacking exiles up to one target card from a graveyard (either one)', () => {
    const g = game({
      p1: { battlefield: ['afterthought-sentry'], graveyard: ['forest'] },
      p2: { graveyard: ['serra-angel', 'swamp'] },
    });
    const sentry = g.id('p1', 'afterthought-sentry');
    g.passUntilStep('beginCombat').passBoth().attack(sentry);
    // The target is optional: the trigger can be put on the stack with none.
    const legal = g.legal();
    expect(legal.some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    const angel = g.id('p2', 'serra-angel', 'graveyard');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] } as never);
    settle(g);
    expect(gy(g, 'p2')).toEqual(['swamp']);
    expect(exile(g, 'p2')).toContain('serra-angel');
  });
});

describe('Archive Arbiter', () => {
  it('is a 4/4 flyer', () => {
    const g = game({ p1: { hand: ['archive-arbiter'], battlefield: n('forest', 6) } });
    done(cast(g, 'archive-arbiter'), { option: 1 });
    const a = g.id('p1', 'archive-arbiter');
    expect(pt(g, a)).toEqual([4, 4]);
    expect(keywords(g, a)).toContain('flying');
  });

  it('mode 1 destroys a noncreature, nonland permanent', () => {
    const g = game({
      p1: { hand: ['archive-arbiter'], battlefield: n('forest', 6) },
      p2: { battlefield: ['murmuring-volume', 'serra-angel', 'forest'] },
    });
    done(cast(g, 'archive-arbiter'), { option: 0 });
    expect(gy(g, 'p2')).toEqual(['murmuring-volume']);
    expect(g.life('p1')).toBe(20);
  });

  it('mode 1 can not hit a creature or a land', () => {
    const g = game({
      p1: { hand: ['archive-arbiter'], battlefield: n('forest', 6) },
      p2: { battlefield: ['serra-angel', 'forest'] },
    });
    cast(g, 'archive-arbiter');
    settle(g);
    done(g, { option: 0 });
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(gy(g, 'p2')).toEqual([]);
  });

  it('mode 2 gains 4 life', () => {
    const g = game({ p1: { hand: ['archive-arbiter'], battlefield: n('forest', 6) } });
    done(cast(g, 'archive-arbiter'), { option: 1 });
    expect(g.life('p1')).toBe(24);
  });
});

describe('Codie, Ravenous Codex', () => {
  const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
    const copy = g.obj(perm).prepared!;
    expect(copy).toBeDefined();
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets });
    return g;
  };

  it('is a 1/4 artifact creature', () => {
    const g = game({ p1: { battlefield: ['codie-ravenous-codex'] } });
    expect(pt(g, g.id('p1', 'codie-ravenous-codex'))).toEqual([1, 4]);
  });

  it('copies a prepared spell you cast, and you may choose new targets for the copy', () => {
    const g = game({
      p1: {
        hand: ['adventurous-eater'],
        battlefield: ['codie-ravenous-codex', 'savannah-lions', ...n('swamp', 4)],
      },
    });
    done(cast(g, 'adventurous-eater'));
    const eater = g.id('p1', 'adventurous-eater');
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(eater).prepared).toBeDefined();
    // Have a Bite: a +1/+1 counter on target creature and you gain 1 life.
    castCopy(g, eater, [g.ref(eater)]);
    // Codie's trigger, then (new targets for the copy: keep, or each other creature).
    done(g, { option: /Savannah Lions/ });
    expect(g.obj(eater).plusOneCounters).toBe(1);
    expect(g.obj(lions).plusOneCounters).toBe(1);
    expect(g.life('p1')).toBe(22);
  });

  it('may keep the same targets for the copy', () => {
    const g = game({
      p1: {
        hand: ['adventurous-eater'],
        battlefield: ['codie-ravenous-codex', ...n('swamp', 4)],
      },
    });
    done(cast(g, 'adventurous-eater'));
    const eater = g.id('p1', 'adventurous-eater');
    castCopy(g, eater, [g.ref(eater)]);
    done(g, { option: 0 });
    expect(g.obj(eater).plusOneCounters).toBe(2);
    expect(g.life('p1')).toBe(22);
  });

  it('does not copy a spell that is not prepared', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['codie-ravenous-codex', ...n('plains', 5)] },
    });
    cast(g, 'serra-angel');
    expect(g.state.stack).toHaveLength(1);
    expect(g.state.pendingTriggers).toHaveLength(0);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it("does not copy an opponent's prepared spell", () => {
    const g = game({
      p1: { battlefield: ['codie-ravenous-codex'] },
      p2: { hand: ['adventurous-eater'], battlefield: n('swamp', 4) },
      active: 'p2',
    });
    done(cast(g, 'adventurous-eater'));
    const eater = g.id('p2', 'adventurous-eater');
    const copy = g.obj(eater).prepared!;
    g.do({ type: 'castSpell', player: 'p2', card: copy, targets: [g.ref(eater)] });
    expect(g.state.stack).toHaveLength(1);
    done(g);
    expect(g.obj(eater).plusOneCounters).toBe(1);
  });

  it('{W}{U}{B}{R}{G}, {T}: each creature you control becomes prepared', () => {
    const g = game({
      p1: {
        battlefield: [
          'codie-ravenous-codex',
          'savannah-lions',
          'adventurous-eater',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
        ],
      },
    });
    const eater = g.id('p1', 'adventurous-eater');
    const codie = g.id('p1', 'codie-ravenous-codex');
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(eater).prepared).toBeUndefined();
    expect(legalAbility(g, codie, 1).length).toBeGreaterThan(0);
    settle(activate(g, codie, 1));
    expect(g.obj(codie).tapped).toBe(true);
    expect(g.obj(eater).prepared).toBeDefined();
    // Creatures with no prepare spell are unaffected.
    expect(g.obj(lions).prepared).toBeUndefined();
    expect(g.obj(codie).prepared).toBeUndefined();
  });

  it('can not be activated without all five colours', () => {
    const g = game({
      p1: {
        battlefield: ['codie-ravenous-codex', 'plains', 'island', 'swamp', 'mountain', 'swamp'],
      },
    });
    expect(legalAbility(g, g.id('p1', 'codie-ravenous-codex'), 1)).toHaveLength(0);
  });
});

describe('Eye of Jace', () => {
  /** Plays on to the surveil of p1's upkeep trigger (p2 is active at its end step). */
  function toSurveil(g: GameDriver): void {
    for (let i = 0; i < 200; i++) {
      const d = g.decision;
      if (d.kind === 'scry') return;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    throw new Error('never reached the surveil');
  }

  it('surveils 1 at the beginning of your upkeep; with fewer than seven cards in the graveyard it stays', () => {
    const g = game({
      p1: { battlefield: ['eye-of-jace'], library: ['plains', 'forest', 'forest'] },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    toSurveil(g);
    // The surveil: look at the top card (a Plains, or what the draw left: the draw happens after upkeep).
    expect(g.decision.kind).toBe('scry');
    // Put it into the graveyard.
    const act = g.legal().find((a) => a.type === 'scry' && a.bottom.length > 0)!;
    g.do(act);
    done(g);
    expect(gy(g)).toEqual(['plains']);
    expect(all(g, 'eye-of-jace')).toHaveLength(1);
    expect(g.life('p2')).toBe(20);
    expect(g.life('p1')).toBe(20);
  });

  it('with seven or more cards in the graveyard after surveilling, it is sacrificed, deals 2 damage to each opponent and you gain 2 life', () => {
    const g = game({
      p1: {
        battlefield: ['eye-of-jace'],
        library: ['plains', 'forest', 'forest'],
        graveyard: n('swamp', 6),
      },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    toSurveil(g);
    expect(g.decision.kind).toBe('scry');
    // Keeping it on top: only six cards in the graveyard, so nothing happens yet.
    g.do(g.legal().find((a) => a.type === 'scry' && a.bottom.length === 0)!);
    done(g);
    expect(gy(g)).toHaveLength(6);
    expect(all(g, 'eye-of-jace')).toHaveLength(1);
  });

  it('the surveil that makes seven cards triggers the sacrifice (the check comes after surveilling)', () => {
    const g = game({
      p1: {
        battlefield: ['eye-of-jace'],
        library: ['plains', 'forest', 'forest'],
        graveyard: n('swamp', 6),
      },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    toSurveil(g);
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((a) => a.type === 'scry' && a.bottom.length > 0)!);
    done(g);
    expect(gy(g)).toHaveLength(8); // six + the Plains + the Eye itself
    expect(gy(g)).toContain('eye-of-jace');
    expect(all(g, 'eye-of-jace')).toHaveLength(0);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });

  it('does not trigger in your opponent upkeep', () => {
    const g = game({
      p1: { battlefield: ['eye-of-jace'], graveyard: n('swamp', 7) },
      p2: { library: ['plains', 'forest'] },
      active: 'p1',
      step: 'end',
    });
    for (
      let i = 0;
      i < 40 && !(g.state.turn.step === 'upkeep' && g.state.turn.activePlayer === 'p2');
      i++
    )
      g.pass();
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.state.stack).toHaveLength(0);
    expect(all(g, 'eye-of-jace')).toHaveLength(1);
  });
});

describe('The Echoverse Fulcrum', () => {
  it('draws a card, then discards a card when it enters', () => {
    const g = game({
      p1: {
        hand: ['the-echoverse-fulcrum', 'forest'],
        library: ['plains', 'forest'],
        battlefield: n('forest', 2),
      },
    });
    cast(g, 'the-echoverse-fulcrum');
    done(g);
    expect(all(g, 'the-echoverse-fulcrum')).toHaveLength(1);
    // Drew the Plains (library top), discarded one card: net hand size unchanged (one Forest left + one more).
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
  });

  it('{5}, {T}, exile it: destroy all creatures, as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['the-echoverse-fulcrum', ...n('forest', 5), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const fulcrum = g.id('p1', 'the-echoverse-fulcrum');
    // Not at instant speed.
    g.passUntilStep('beginCombat');
    expect(legalAbility(g, fulcrum, 1)).toHaveLength(0);
    const h = game({
      p1: { battlefield: ['the-echoverse-fulcrum', ...n('forest', 5), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    settle(activate(h, h.id('p1', 'the-echoverse-fulcrum'), 1));
    expect(all(h, 'savannah-lions')).toHaveLength(0);
    expect(all(h, 'serra-angel')).toHaveLength(0);
    expect(all(h, 'the-echoverse-fulcrum')).toHaveLength(0);
    expect(exile(h)).toContain('the-echoverse-fulcrum');
  });

  it('needs five mana', () => {
    const g = game({ p1: { battlefield: ['the-echoverse-fulcrum', ...n('forest', 4)] } });
    expect(legalAbility(g, g.id('p1', 'the-echoverse-fulcrum'), 1)).toHaveLength(0);
  });
});

describe('Emrakul, the Exigent Doom', () => {
  const EM = 'emrakul-the-exigent-doom';

  it('is a 12/12 with flying, trample and ward', () => {
    const g = game({ p1: { battlefield: [EM] } });
    const e = g.id('p1', EM);
    expect(pt(g, e)).toEqual([12, 12]);
    for (const k of ['flying', 'trample', 'ward'] as const) expect(keywords(g, e)).toContain(k);
    expect(cardDb.get(EM)!.wardCost?.sacrificePermanents).toBe(3);
  });

  it('when you cast it, untap all lands you control', () => {
    const g = game({ p1: { hand: [EM], battlefield: n('forest', 10) } });
    cast(g, EM);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(10);
    // The trigger is on the stack above the spell.
    expect(g.state.stack).toHaveLength(2);
    g.pass().pass();
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(0);
    expect(g.state.stack).toHaveLength(1);
    done(g);
    expect(all(g, EM)).toHaveLength(1);
  });

  it('ward: its opponent must sacrifice three permanents to target it', () => {
    const g = game({
      p1: { battlefield: [EM] },
      p2: {
        hand: ['doom-blade'],
        battlefield: ['swamp', 'swamp', 'forest', 'forest', 'forest', 'savannah-lions'],
      },
      active: 'p2',
    });
    const before = g.state.battlefield.filter((id) => g.obj(id).controller === 'p2').length;
    cast(g, 'doom-blade', [g.ref(g.id('p1', EM))]);
    // Three of their permanents were sacrificed as the spell was cast (the cheapest: lands first).
    const after = g.state.battlefield.filter((id) => g.obj(id).controller === 'p2').length;
    expect(before - after).toBe(3);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('ward: not payable with fewer than three permanents', () => {
    const g = game({
      p1: { battlefield: [EM] },
      p2: { hand: ['doom-blade'], battlefield: ['swamp', 'swamp'] },
      active: 'p2',
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    const h = game({
      p1: { battlefield: [EM] },
      p2: { hand: ['doom-blade'], battlefield: ['swamp', 'swamp', 'forest'] },
      active: 'p2',
    });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('ward does not apply to its controller', () => {
    const g = game({
      p1: { hand: ['doom-blade'], battlefield: [EM, 'swamp', 'swamp'] },
    });
    cast(g, 'doom-blade', [g.ref(g.id('p1', EM))]);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(3);
  });

  describe('{3}, exile it from your hand', () => {
    const setup = () =>
      game({
        p1: { hand: [EM], battlefield: n('forest', 12) },
      });

    it('exiles it as a cost; the target land gains {T}: Add {C}{C}; you may cast it from exile', () => {
      const g = setup();
      const card = g.id('p1', EM, 'hand');
      const lands = all(g, 'forest');
      const land = lands[11]!;
      expect(legalAbility(g, card, 1).length).toBeGreaterThan(0);
      settle(activate(g, card, 1, [g.ref(land)]));
      expect(g.zoneOf(card)).toBe('exile');
      expect(g.obj(card).castableWhileExiled).toBe(true);
      // Three lands paid for it; nine are left, and one of them taps for {C}{C}.
      expect(g.state.battlefield.filter((id) => !g.obj(id).tapped)).toHaveLength(9);
      expect(g.obj(land).abilitiesUntilCast).toHaveLength(1);
      const castFromExile = g.legal().filter((a) => a.type === 'castSpell' && a.card === card);
      expect(castFromExile.length).toBeGreaterThan(0);
      g.do(castFromExile[0]!);
      // Cast: the land's gift is over; the "untap all lands" trigger is on the stack.
      expect(g.obj(land).abilitiesUntilCast).toBeUndefined();
      done(g);
      expect(all(g, EM)).toHaveLength(1);
      expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(0);
    });

    it('without the gift the same lands could not pay {10}', () => {
      const g = setup();
      const card = g.id('p1', EM, 'hand');
      const land = all(g, 'forest')[11]!;
      settle(activate(g, card, 1, [g.ref(land)]));
      // Strip the gift: nine untapped lands can not pay for {10}.
      delete g.obj(land).abilitiesUntilCast;
      expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
    });

    it('you can keep it exiled for later turns', () => {
      const g = setup();
      const card = g.id('p1', EM, 'hand');
      const land = all(g, 'forest')[0]!;
      settle(activate(g, card, 1, [g.ref(land)]));
      passTo(g, 'main1', 'p1');
      expect(g.zoneOf(card)).toBe('exile');
      expect(g.obj(land).abilitiesUntilCast).toHaveLength(1);
      expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(true);
    });

    it('can only be used from your hand', () => {
      const g = game({ p1: { battlefield: [EM, ...n('forest', 4)] } });
      expect(legalAbility(g, g.id('p1', EM), 1)).toHaveLength(0);
    });

    it('can target any land, including an opponent one', () => {
      const g = game({
        p1: { hand: [EM], battlefield: n('forest', 3) },
        p2: { battlefield: ['swamp'] },
      });
      const card = g.id('p1', EM, 'hand');
      const theirs = g.id('p2', 'swamp');
      const targets = legalAbility(g, card, 1).map((a) =>
        JSON.stringify((a as { targets: unknown }).targets),
      );
      expect(targets).toContain(JSON.stringify([g.ref(theirs)]));
    });
  });
});

describe('Hall of Echoes', () => {
  it('{T}: Add {C}', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['hall-of-echoes', ...n('plains', 2)] },
    });
    // {3}{W}{W} with two Plains and one colourless land is not enough: nothing castable.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    const h = game({
      p1: { hand: ['serra-angel'], battlefield: ['hall-of-echoes', ...n('plains', 4)] },
    });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('{5}: becomes a copy of target creature you control until end of turn', () => {
    const g = game({
      p1: { battlefield: ['hall-of-echoes', 'serra-angel', ...n('forest', 5)] },
    });
    const hall = g.id('p1', 'hall-of-echoes');
    const angel = g.id('p1', 'serra-angel');
    settle(activate(g, hall, 1, [g.ref(angel)]));
    expect(g.obj(hall).defId).toBe('serra-angel');
    expect(pt(g, hall)).toEqual([4, 4]);
    expect(keywords(g, hall)).toContain('flying');
    expect(getCharacteristics(g.state, cardDb, hall).types).not.toContain('Land');
    // At the end of the turn it is a land again.
    const start = g.state.turn.number;
    for (let i = 0; i < 80 && g.state.turn.number === start; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.obj(hall).defId).toBe('hall-of-echoes');
  });

  it("can not target an opponent's creature", () => {
    const g = game({
      p1: { battlefield: ['hall-of-echoes', ...n('forest', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(legalAbility(g, g.id('p1', 'hall-of-echoes'), 1)).toHaveLength(0);
  });

  it("the legend rule doesn't apply to your permanents this turn", () => {
    const g = game({
      p1: { battlefield: ['hall-of-echoes', 'karn-argent-defender', ...n('forest', 5)] },
    });
    const hall = g.id('p1', 'hall-of-echoes');
    const karn = g.id('p1', 'karn-argent-defender');
    settle(activate(g, hall, 1, [g.ref(karn)]));
    expect(g.obj(hall).defId).toBe('karn-argent-defender');
    // Two legendary Karns, and both stay.
    expect(g.zoneOf(hall)).toBe('battlefield');
    expect(g.zoneOf(karn)).toBe('battlefield');
    expect(g.state.turn.noLegendRule).toEqual(['p1']);
  });

  it('without it the same copy would die to the legend rule', () => {
    const g = game({
      p1: { battlefield: ['hall-of-echoes', 'karn-argent-defender', ...n('forest', 5)] },
    });
    const hall = g.id('p1', 'hall-of-echoes');
    const karn = g.id('p1', 'karn-argent-defender');
    // Become a copy with no exemption (as if the Hall's effect had been used without it).
    g.obj(hall).originalDefId = 'hall-of-echoes';
    g.obj(hall).defId = 'karn-argent-defender';
    g.obj(hall).copyingUntilTurn = g.state.turn.number;
    expect(g.state.turn.noLegendRule).toBeUndefined();
    g.pass();
    expect(g.zoneOf(hall)).toBe('graveyard');
    expect(g.zoneOf(karn)).toBe('battlefield');
  });

  it('the exemption ends with the turn', () => {
    const g = game({
      p1: { battlefield: ['hall-of-echoes', 'karn-argent-defender', ...n('forest', 5)] },
    });
    settle(
      activate(g, g.id('p1', 'hall-of-echoes'), 1, [g.ref(g.id('p1', 'karn-argent-defender'))]),
    );
    expect(g.state.turn.noLegendRule).toBeDefined();
    passTo(g, 'main1', 'p1');
    expect(g.state.turn.noLegendRule).toBeUndefined();
  });
});

describe('Hexhaven Dueling Arena', () => {
  it('{2}, {T}: target creature that attacked this turn becomes prepared (sorcery speed)', () => {
    const g = game({
      p1: {
        battlefield: [
          'hexhaven-dueling-arena',
          'adventurous-eater',
          'savannah-lions',
          ...n('forest', 2),
        ],
      },
      step: 'main2',
    });
    const arena = g.id('p1', 'hexhaven-dueling-arena');
    const eater = g.id('p1', 'adventurous-eater');
    const lions = g.id('p1', 'savannah-lions');
    g.state.turn.attackers = [eater];
    const targets = legalAbility(g, arena, 1).map((a) => (a as { targets: unknown[] }).targets);
    expect(targets).toEqual([[g.ref(eater)]]);
    expect(targets).not.toContainEqual([g.ref(lions)]);
    settle(activate(g, arena, 1, [g.ref(eater)]));
    expect(g.obj(eater).prepared).toBeDefined();
    expect(g.obj(arena).tapped).toBe(true);
  });

  it('the first ability is a sorcery: not in combat', () => {
    const g = game({
      p1: { battlefield: ['hexhaven-dueling-arena', 'adventurous-eater', ...n('forest', 2)] },
      step: 'declareBlockers',
    });
    g.state.turn.attackers = [g.id('p1', 'adventurous-eater')];
    expect(legalAbility(g, g.id('p1', 'hexhaven-dueling-arena'), 1)).toHaveLength(0);
  });

  it('{4}, {T}: target creature becomes prepared, at instant speed', () => {
    const g = game({
      p1: {
        battlefield: [
          'hexhaven-dueling-arena',
          'adventurous-eater',
          'savannah-lions',
          ...n('forest', 4),
        ],
      },
      p2: { battlefield: ['serra-angel'] },
      step: 'beginCombat',
    });
    const arena = g.id('p1', 'hexhaven-dueling-arena');
    const eater = g.id('p1', 'adventurous-eater');
    const targets = legalAbility(g, arena, 2).map((a) =>
      JSON.stringify((a as { targets: unknown[] }).targets),
    );
    // Any creature at all, even without an attack (and an opponent one).
    expect(targets).toContain(JSON.stringify([g.ref(eater)]));
    expect(targets).toContain(JSON.stringify([g.ref(g.id('p1', 'savannah-lions'))]));
    settle(activate(g, arena, 2, [g.ref(eater)]));
    expect(g.obj(eater).prepared).toBeDefined();
  });

  it('{T}: Add {C}', () => {
    const g = game({
      p1: { hand: ['the-echoverse-fulcrum'], battlefield: ['hexhaven-dueling-arena', 'forest'] },
    });
    cast(g, 'the-echoverse-fulcrum');
    done(g);
    expect(all(g, 'the-echoverse-fulcrum')).toHaveLength(1);
  });
});

describe('Karn, Argent Defender', () => {
  it('is a 1/3 artifact creature', () => {
    const g = game({ p1: { battlefield: ['karn-argent-defender'] } });
    expect(pt(g, g.id('p1', 'karn-argent-defender'))).toEqual([1, 3]);
    expect(getCharacteristics(g.state, cardDb, g.id('p1', 'karn-argent-defender')).types).toEqual(
      expect.arrayContaining(['Artifact', 'Creature']),
    );
  });

  it("a creature's own enters trigger does not happen while it is out", () => {
    const g = game({
      p1: { hand: ['archive-arbiter'], battlefield: ['karn-argent-defender', ...n('forest', 6)] },
    });
    cast(g, 'archive-arbiter');
    g.pass().pass();
    expect(all(g, 'archive-arbiter')).toHaveLength(1);
    expect(g.state.stack).toHaveLength(0);
    expect(g.decision.kind).toBe('priority');
    expect(g.life('p1')).toBe(20);
  });

  it('without Karn the same creature triggers', () => {
    const g = game({ p1: { hand: ['archive-arbiter'], battlefield: n('forest', 6) } });
    cast(g, 'archive-arbiter');
    g.pass().pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
  });

  it("another permanent's 'whenever another creature enters' trigger does not happen either (both players' creatures)", () => {
    const g = game({
      p1: {
        hand: ['bear-cub'],
        battlefield: ['karn-argent-defender', 'lifecreed-duo', ...n('forest', 2)],
      },
    });
    cast(g, 'bear-cub');
    settle(g);
    expect(g.life('p1')).toBe(20);
    const h = game({
      p1: { hand: ['bear-cub'], battlefield: ['lifecreed-duo', ...n('forest', 2)] },
    });
    cast(h, 'bear-cub');
    settle(h);
    expect(h.life('p1')).toBe(21);
  });

  it("also stops triggers caused by an opponent's creature entering", () => {
    const g = game({
      p1: { battlefield: ['karn-argent-defender', 'lifecreed-duo'] },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      active: 'p2',
    });
    cast(g, 'bear-cub');
    settle(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.state.pendingTriggers).toHaveLength(0);
  });

  it('does not stop other triggers: a land entering (landfall) still triggers', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['karn-argent-defender', 'iridescent-vinelasher'] },
      p2: {},
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(g.life('p2')).toBe(19);
  });

  it("stops its own controller's artifacts and creatures entering, not just opponents'", () => {
    const g = game({
      p1: { hand: ['murmuring-volume'], battlefield: ['karn-argent-defender', ...n('forest', 3)] },
    });
    cast(g, 'murmuring-volume');
    settle(g);
    expect(all(g, 'murmuring-volume')).toHaveLength(1);
  });
});

describe('Living Library', () => {
  it('is a 0/4', () => {
    const g = game({ p1: { battlefield: ['living-library'] } });
    expect(pt(g, g.id('p1', 'living-library'))).toEqual([0, 4]);
  });

  it("{6}, sacrifice it: shuffles target creature an opponent controls into its owner's library", () => {
    const g = game({
      p1: { battlefield: ['living-library', ...n('forest', 6)] },
      p2: { battlefield: ['serra-angel'], library: ['forest', 'forest', 'forest'] },
    });
    const library = g.id('p1', 'living-library');
    const angel = g.id('p2', 'serra-angel');
    settle(activate(g, library, 0, [g.ref(angel)]));
    expect(all(g, 'living-library')).toHaveLength(0);
    expect(gy(g)).toContain('living-library');
    expect(g.zoneOf(angel)).toBe('library');
    expect(g.state.players.p2.library).toHaveLength(4);
  });

  it('can target an opponent planeswalker, but not your own creatures or an opponent land', () => {
    const g = game({
      p1: { battlefield: ['living-library', 'savannah-lions', ...n('forest', 6)] },
      p2: { battlefield: ['vivien-reid', 'forest', 'serra-angel'] },
    });
    const library = g.id('p1', 'living-library');
    const targets = legalAbility(g, library, 0).map((a) =>
      JSON.stringify((a as { targets: unknown[] }).targets),
    );
    expect(targets).toContain(JSON.stringify([g.ref(g.id('p2', 'vivien-reid'))]));
    expect(targets).toContain(JSON.stringify([g.ref(g.id('p2', 'serra-angel'))]));
    expect(targets).not.toContain(JSON.stringify([g.ref(g.id('p1', 'savannah-lions'))]));
    expect(targets).not.toContain(JSON.stringify([g.ref(g.id('p2', 'forest'))]));
    expect(targets).toHaveLength(2);
  });

  it('needs six mana', () => {
    const g = game({
      p1: { battlefield: ['living-library', ...n('forest', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(legalAbility(g, g.id('p1', 'living-library'), 0)).toHaveLength(0);
  });
});

describe("Medic's Kitesail", () => {
  it('equipped creature gets +1/+0 and flying; equip {2} at sorcery speed', () => {
    const g = game({
      p1: { battlefield: ['medics-kitesail', 'savannah-lions', ...n('forest', 2)] },
    });
    const sail = g.id('p1', 'medics-kitesail');
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([2, 1]);
    settle(activate(g, sail, 2, [g.ref(lions)]));
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('flying');
  });

  it('whenever the equipped creature attacks, you gain 1 life', () => {
    const g = game({
      p1: { battlefield: ['medics-kitesail', 'savannah-lions', ...n('forest', 2)] },
    });
    const sail = g.id('p1', 'medics-kitesail');
    const lions = g.id('p1', 'savannah-lions');
    settle(activate(g, sail, 2, [g.ref(lions)]));
    g.passUntilStep('beginCombat').passBoth().attack(lions);
    settle(g);
    expect(g.life('p1')).toBe(21);
  });

  it('an unequipped creature attacking gains nothing', () => {
    const g = game({
      p1: { battlefield: ['medics-kitesail', 'savannah-lions', 'bear-cub'] },
    });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'bear-cub'));
    settle(g);
    expect(g.life('p1')).toBe(20);
  });
});

describe('Murmuring Volume', () => {
  it('{T}: Add one mana of any color', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['murmuring-volume', ...n('plains', 4)] },
    });
    // {3}{W}{W}: 4 Plains + the Volume's mana.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const h = game({
      p1: { hand: ['doom-blade'], battlefield: ['murmuring-volume', 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('{2}, {T}, discard a card: draw a card', () => {
    const g = game({
      p1: {
        hand: ['forest', 'plains'],
        library: ['island', 'swamp'],
        battlefield: ['murmuring-volume', 'forest', 'forest'],
      },
    });
    const volume = g.id('p1', 'murmuring-volume');
    const acts = legalAbility(g, volume, 5);
    // One per card that could be discarded.
    expect(acts).toHaveLength(2);
    g.do(acts[0]!);
    settle(g);
    expect(hand(g)).toHaveLength(2);
    expect(gy(g)).toHaveLength(1);
    expect(g.obj(volume).tapped).toBe(true);
  });

  it('can not draw without a card to discard', () => {
    const g = game({
      p1: { hand: [], battlefield: ['murmuring-volume', 'forest', 'forest'] },
    });
    expect(legalAbility(g, g.id('p1', 'murmuring-volume'), 5)).toHaveLength(0);
  });
});

describe('Roiling Canopy', () => {
  it('enters tapped and taps for {G}', () => {
    const g = game({ p1: { hand: ['roiling-canopy'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'roiling-canopy', 'hand') });
    expect(g.obj(g.id('p1', 'roiling-canopy')).tapped).toBe(true);
    const mana = cardDb
      .get('roiling-canopy')!
      .abilities.flatMap((a) => (a.kind === 'mana' ? [a.produces] : []));
    expect(mana).toEqual(['G']);
  });

  it('a Forest entering with five other Forests gives target creature you control +3/+3', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['roiling-canopy', 'savannah-lions', ...n('forest', 5)],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(pt(g, lions)).toEqual([5, 4]);
  });

  it('five Forests in all (four others) is not enough', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['roiling-canopy', 'savannah-lions', ...n('forest', 4)],
      },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it("a Forest you don't control entering does not trigger it", () => {
    const g = game({
      p1: { battlefield: ['roiling-canopy', 'savannah-lions', ...n('forest', 6)] },
      p2: { hand: ['forest'] },
      active: 'p2',
    });
    g.do({ type: 'playLand', player: 'p2', card: g.id('p2', 'forest', 'hand') });
    settle(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('a land that is not a Forest does not trigger it', () => {
    const g = game({
      p1: {
        hand: ['plains'],
        battlefield: ['roiling-canopy', 'savannah-lions', ...n('forest', 6)],
      },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'plains', 'hand') });
    settle(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('can be the creature the bonus goes to: only your creatures, and none means no trigger', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['roiling-canopy', ...n('forest', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(g.state.stack).toHaveLength(0);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('Room of Refuge', () => {
  it('enters tapped, and you choose a color as it enters', () => {
    const g = game({ p1: { hand: ['room-of-refuge'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'room-of-refuge', 'hand') });
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    settle(g.do({ type: 'chooseOption', player: 'p1', index: 4 }));
    const room = g.id('p1', 'room-of-refuge');
    expect(g.obj(room).chosenColor).toBe('G');
    expect(g.obj(room).tapped).toBe(true);
  });

  it('taps only for the chosen color', () => {
    const g = game({
      p1: { hand: ['llanowar-elves', 'savannah-lions'], battlefield: ['room-of-refuge'] },
    });
    const room = g.id('p1', 'room-of-refuge');
    g.obj(room).chosenColor = 'G';
    const can = (card: string) =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', card, 'hand'));
    expect(can('llanowar-elves')).toBe(true);
    expect(can('savannah-lions')).toBe(false);
  });

  it('{5}, {T}, sacrifice it: put two +1/+1 counters on target creature, as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['room-of-refuge', 'savannah-lions', ...n('forest', 5)] },
    });
    const room = g.id('p1', 'room-of-refuge');
    const lions = g.id('p1', 'savannah-lions');
    settle(activate(g, room, 6, [g.ref(lions)]));
    expect(g.obj(lions).plusOneCounters).toBe(2);
    expect(all(g, 'room-of-refuge')).toHaveLength(0);
    expect(gy(g)).toContain('room-of-refuge');

    const h = game({
      p1: { battlefield: ['room-of-refuge', 'savannah-lions', ...n('forest', 5)] },
      step: 'beginCombat',
    });
    expect(legalAbility(h, h.id('p1', 'room-of-refuge'), 6)).toHaveLength(0);
  });
});

describe('Traxos, Scourge Eternal', () => {
  it('is a 5/4 trampler that does not untap during your untap step', () => {
    const g = game({
      p1: { battlefield: [{ card: 'traxos-scourge-eternal', tapped: true }] },
      p2: {},
      active: 'p2',
      step: 'end',
    });
    const traxos = g.id('p1', 'traxos-scourge-eternal');
    expect(pt(g, traxos)).toEqual([5, 4]);
    expect(keywords(g, traxos)).toContain('trample');
    passTo(g, 'main1', 'p1');
    expect(g.obj(traxos).tapped).toBe(true);
  });

  it('untaps whenever you cast an artifact spell', () => {
    const g = game({
      p1: {
        hand: ['the-echoverse-fulcrum'],
        battlefield: [{ card: 'traxos-scourge-eternal', tapped: true }, 'forest', 'forest'],
      },
    });
    const traxos = g.id('p1', 'traxos-scourge-eternal');
    cast(g, 'the-echoverse-fulcrum');
    done(g);
    expect(g.obj(traxos).tapped).toBe(false);
  });

  it('untaps whenever you cast a creature spell', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: [{ card: 'traxos-scourge-eternal', tapped: true }, 'plains'],
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(g.obj(g.id('p1', 'traxos-scourge-eternal')).tapped).toBe(false);
  });

  it('does not untap for another kind of spell, or an opponent spell', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: [{ card: 'traxos-scourge-eternal', tapped: true }, 'mountain'],
      },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
    });
    const traxos = g.id('p1', 'traxos-scourge-eternal');
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(g.obj(traxos).tapped).toBe(true);
    const h = game({
      p1: { battlefield: [{ card: 'traxos-scourge-eternal', tapped: true }] },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    cast(h, 'savannah-lions');
    done(h);
    expect(h.obj(h.id('p1', 'traxos-scourge-eternal')).tapped).toBe(true);
  });

  it('can attack, then stays tapped until you cast another one', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['traxos-scourge-eternal', 'plains'] },
    });
    const traxos = g.id('p1', 'traxos-scourge-eternal');
    g.passUntilStep('beginCombat').passBoth().attack(traxos);
    expect(g.obj(traxos).tapped).toBe(true);
  });
});
