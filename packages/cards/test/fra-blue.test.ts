import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a: the blue cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const stun = (g: GameDriver, id: string) => g.obj(id).counters?.stun ?? 0;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
  /** Which trigger target action to take (default: the first with targets). */
  pick?: (legal: Action[]) => Action | undefined;
  /** Which scry or surveil answer to give (default: keep everything on top). */
  scry?: (legal: Action[]) => Action | undefined;
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
    else if (d.kind === 'chooseTriggerTargets') settle(g, opts.pick);
    else if (d.kind === 'scry')
      g.do(opts.scry?.(g.legal()) ?? g.legal().find((a) => a.type === 'scry')!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({
        type: 'chooseEffect',
        player: g.actor,
        // Accepting is only offered when it can be paid for.
        accept: !!opts.accept && g.legal().some((a) => a.type === 'chooseEffect' && a.accept),
      });
    else break;
  }
  return g;
}

const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: g.actor, card: copy, targets });
  return g;
};

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

/** Passes priority (taking default choices) until `step` of the current turn's next occurrence. */
function toStep(g: GameDriver, step: string, nextTurn = false): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 80; i++) {
    if (g.decision.kind === 'gameOver') return;
    if (
      g.state.turn.step === step &&
      (!nextTurn || g.state.turn.number > start) &&
      g.decision.kind === 'priority' &&
      !g.state.stack.length
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

describe('Arni, Humble Scribe', () => {
  it('untaps when another nontoken creature enters under your control, not for a token', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'semester-foreseer'],
        battlefield: [
          { card: 'arni-humble-scribe', tapped: true },
          ...n('plains', 2),
          ...n('island', 6),
        ],
      },
    });
    const arni = g.id('p1', 'arni-humble-scribe');
    done(cast(g, 'savannah-lions'));
    expect(g.obj(arni).tapped).toBe(false);
    g.obj(arni).tapped = true;
    // Semester Foreseer enters (nontoken: untaps), then its Peer Review makes a Cadet token (doesn't).
    done(cast(g, 'semester-foreseer'));
    expect(g.obj(arni).tapped).toBe(false);
    g.obj(arni).tapped = true;
    castCopy(g, g.id('p1', 'semester-foreseer'));
    done(g);
    expect(all(g, 'fra-cadet-token')).toHaveLength(1);
    expect(g.obj(arni).tapped).toBe(true);
  });

  it('{T}: draw a card, then discard a card', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['arni-humble-scribe'], library: ['island', 'forest'] },
    });
    activate(g, g.id('p1', 'arni-humble-scribe'), 1);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(1);
    expect(g.obj(g.id('p1', 'arni-humble-scribe')).tapped).toBe(true);
  });
});

/** A surveil answer that puts `count` cards into the graveyard. */
const toGraveyard = (count: number) => (legal: Action[]) =>
  legal.find((a) => a.type === 'scry' && a.bottom.length === count);

/** Picks the trigger-target action for a mode (and the first target set). */
const mode = (m: number) => (legal: Action[]) =>
  legal.find((a) => a.type === 'chooseTargets' && a.mode === m);

describe('Cruel Calculations', () => {
  it('draws a card for each card put into your graveyard from your library this turn', () => {
    const g = game({
      p1: {
        hand: ['yuriko-hope-from-the-shadows', 'cruel-calculations'],
        battlefield: n('island', 8),
        library: n('forest', 8),
      },
    });
    // Yuriko surveils 2 and puts both cards into the graveyard.
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(1), scry: toGraveyard(2) });
    expect(gy(g)).toHaveLength(2);
    cast(g, 'cruel-calculations', [{ player: 'p1' }]);
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(g.state.turn.milled).toEqual({ p1: 2, p2: 0 });
  });

  it('counts the target player, not its controller', () => {
    const g = game({ p1: { hand: ['cruel-calculations'], battlefield: n('island', 3) } });
    g.state.turn.milled = { p1: 1, p2: 4 };
    cast(g, 'cruel-calculations', [{ player: 'p2' }]);
    done(g);
    expect(hand(g)).toHaveLength(4);
    expect(hand(g, 'p2')).toHaveLength(0);
  });

  it('cards that were not milled this turn count for nothing', () => {
    const g = game({
      p1: { hand: ['cruel-calculations'], battlefield: n('island', 3), graveyard: n('forest', 5) },
    });
    cast(g, 'cruel-calculations', [{ player: 'p1' }]);
    done(g);
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Cryotheory Adept', () => {
  it('has prowess', () => {
    const g = game({
      p1: { hand: ['perfected-theory'], battlefield: ['cryotheory-adept', ...n('island', 2)] },
    });
    const adept = g.id('p1', 'cryotheory-adept');
    expect(pt(g, adept)).toEqual([2, 1]);
    cast(g, 'perfected-theory', [g.ref(adept)], { mode: 0 });
    done(g);
    // Perfected Theory's first mode sets it to 1/1; prowess adds +1/+1 until end of turn.
    expect(pt(g, adept)).toEqual([2, 2]);
  });

  it('from the graveyard: tap target creature and put a stun counter on it, as a sorcery', () => {
    const g = game({
      p1: { graveyard: ['cryotheory-adept'], battlefield: n('island', 4) },
      p2: { battlefield: ['savannah-lions'] },
    });
    const adept = g.id('p1', 'cryotheory-adept', 'graveyard');
    const lions = g.id('p2', 'savannah-lions');
    activate(g, adept, 1, [g.ref(lions)]);
    done(g);
    expect(g.obj(lions).tapped).toBe(true);
    expect(stun(g, lions)).toBe(1);
    expect(exile(g)).toContain('cryotheory-adept');
    // It stays tapped through its controller's next untap step, losing the counter instead.
    toStep(g, 'main1', true);
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(lions).tapped).toBe(true);
    expect(stun(g, lions)).toBe(0);
  });

  it("can't be activated at instant speed", () => {
    const g = game({
      step: 'beginCombat',
      p1: { graveyard: ['cryotheory-adept'], battlefield: n('island', 4) },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('Diviner of Victory', () => {
  it('enters prepared and gets +1/+1 whenever you scry or surveil; Unwind History bounces a creature with mana value 3 or less and surveils 1', () => {
    const g = game({
      p1: { hand: ['diviner-of-victory'], battlefield: n('island', 3), library: n('forest', 5) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    done(cast(g, 'diviner-of-victory'));
    const d = g.id('p1', 'diviner-of-victory');
    expect(g.obj(d).prepared).toBeDefined();
    expect(pt(g, d)).toEqual([1, 1]);
    const lions = g.id('p2', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    // Only the cheap creature is a legal target.
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.obj(d).prepared)
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets).toContainEqual(g.ref(lions));
    expect(targets).not.toContainEqual(g.ref(angel));
    castCopy(g, d, [g.ref(lions)]);
    done(g);
    expect(hand(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.obj(d).prepared).toBeUndefined();
    expect(pt(g, d)).toEqual([2, 2]);
  });
});

describe('Divining Duelist', () => {
  const setup = () =>
    game({
      p1: { hand: ['divining-duelist'], battlefield: n('island', 3), library: n('forest', 5) },
      p2: { battlefield: ['savannah-lions'] },
    });

  it('has flash', () => {
    const g = setup();
    cast(g, 'divining-duelist');
    expect(keywords(g, g.state.stack[0]!.id).has('flash')).toBe(true);
  });

  it('mode 1: tap target creature', () => {
    const g = setup();
    cast(g, 'divining-duelist');
    done(g, { pick: mode(0) });
    expect(g.obj(g.id('p2', 'savannah-lions')).tapped).toBe(true);
  });

  it('mode 2: untap target creature', () => {
    const g = setup();
    g.obj(g.id('p2', 'savannah-lions')).tapped = true;
    cast(g, 'divining-duelist');
    done(g, { pick: mode(1) });
    expect(g.obj(g.id('p2', 'savannah-lions')).tapped).toBe(false);
  });

  it('mode 3: draw a card, then discard a card', () => {
    const g = setup();
    cast(g, 'divining-duelist');
    done(g, { pick: mode(2) });
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(4);
  });
});

/** A game at the declare attackers decision. */
const combat = (p1: string[], p2: string[] = [], library?: string[]) =>
  game({
    step: 'beginCombat',
    p1: { battlefield: p1, ...(library ? { library } : {}) },
    p2: { battlefield: p2 },
  }).passBoth();

describe('Fblthp, Impossibly Lost', () => {
  const attackWith = (g: GameDriver) => {
    g.attack(g.id('p1', 'fblthp-impossibly-lost'));
    toStep(g, 'endCombat');
  };

  it('draws two cards when an opponent is dealt combat damage, then shuffles itself into your library', () => {
    const g = combat(['fblthp-impossibly-lost'], [], n('forest', 6));
    const f = g.id('p1', 'fblthp-impossibly-lost');
    attackWith(g);
    expect(g.life('p2')).toBe(19);
    expect(hand(g)).toHaveLength(2);
    expect(g.zoneOf(f)).toBe('library');
    expect(g.state.players.p1.library).toHaveLength(5);
    expect(g.state.winner).toBeNull();
  });

  it('does nothing if it is blocked', () => {
    const g = combat(['fblthp-impossibly-lost'], ['savannah-lions'], n('forest', 6));
    const f = g.id('p1', 'fblthp-impossibly-lost');
    g.attack(f);
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    g.block([g.id('p2', 'savannah-lions'), f]);
    toStep(g, 'endCombat');
    expect(hand(g)).toHaveLength(0);
    expect(g.zoneOf(f)).toBe('graveyard');
  });

  it('wins the game if the library is empty afterwards', () => {
    const g = combat(['fblthp-impossibly-lost'], [], n('forest', 2));
    attackWith(g);
    expect(g.state.winner).toBe('p1');
  });

  it('wins even when drawing from an already empty library', () => {
    const g = combat(['fblthp-impossibly-lost'], [], []);
    attackWith(g);
    expect(g.state.winner).toBe('p1');
  });

  it('does not win while cards remain in the library', () => {
    const g = combat(['fblthp-impossibly-lost'], [], n('forest', 3));
    attackWith(g);
    expect(g.state.winner).toBeNull();
    expect(hand(g)).toHaveLength(2);
  });
});

describe('Geist of Saint Thalia', () => {
  it('has flying and makes noncreature spells cost {1} less (not creature spells)', () => {
    const g = game({
      p1: {
        hand: ['icy-reception', 'divining-duelist'],
        battlefield: ['geist-of-saint-thalia', 'island', 'island'],
      },
    });
    expect(keywords(g, g.id('p1', 'geist-of-saint-thalia')).has('flying')).toBe(true);
    const can = (card: string) =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', card, 'hand'));
    expect(can('icy-reception')).toBe(true);
    expect(can('divining-duelist')).toBe(false);
  });

  it('with only one land, a {1}{U} noncreature spell is castable', () => {
    const g = game({
      p1: { hand: ['icy-reception'], battlefield: ['geist-of-saint-thalia', 'island'] },
    });
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', 'icy-reception', 'hand')),
    ).toBe(true);
  });
});

/** A stack object as a target. */
const onStack = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });

describe('Hapatra, the Desert Frost', () => {
  it('when it enters, taps up to one target creature an opponent controls and puts a stun counter on it', () => {
    const g = game({
      p1: { hand: ['hapatra-the-desert-frost'], battlefield: n('island', 4) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    expect(pt(g, g.id('p1', 'hapatra-the-desert-frost', 'hand'))).toEqual([4, 3]);
    cast(g, 'hapatra-the-desert-frost');
    const angel = g.id('p2', 'serra-angel');
    done(g, {
      pick: (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === angel),
        ),
    });
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
    expect(stun(g, g.id('p2', 'savannah-lions'))).toBe(0);
  });

  it('only offers the opponent\'s creatures, and "up to one" may be no target', () => {
    const g = game({
      p1: {
        hand: ['hapatra-the-desert-frost'],
        battlefield: ['savannah-lions', ...n('island', 4)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'hapatra-the-desert-frost');
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const choices = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(choices.some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    for (const a of choices)
      if (a.type === 'chooseTargets')
        for (const t of a.targets)
          expect('object' in t && g.obj(t.object.id).controller).toBe('p2');
    // Choosing nothing taps and stuns nothing.
    g.do(choices.find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
    expect(stun(g, g.id('p2', 'serra-angel'))).toBe(0);
  });

  it('{2}{U}: untap target creature', () => {
    const g = game({
      p1: { battlefield: [{ card: 'hapatra-the-desert-frost', tapped: true }, ...n('island', 3)] },
    });
    const h = g.id('p1', 'hapatra-the-desert-frost');
    activate(g, h, 1, [g.ref(h)]);
    done(g);
    expect(g.obj(h).tapped).toBe(false);
  });
});

describe('Icy Reception', () => {
  const p2Turn = (p2Hand: string[], p2Battlefield: string[] = []) =>
    game({
      active: 'p2',
      p1: {
        hand: ['icy-reception', 'precise-redaction'],
        battlefield: [...n('island', 4), 'serra-angel'],
      },
      p2: { hand: p2Hand, battlefield: p2Battlefield },
    });

  it('counters a creature spell unless its controller pays {3}', () => {
    const g = p2Turn(['savannah-lions'], ['plains']);
    cast(g, 'savannah-lions');
    const spell = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'icy-reception', [onStack(g, spell)], { mode: 0 });
    done(g);
    expect(gy(g, 'p2')).toContain('savannah-lions');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it("doesn't counter it if its controller pays {3}", () => {
    const g = p2Turn(['savannah-lions'], n('plains', 4));
    cast(g, 'savannah-lions');
    const spell = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'icy-reception', [onStack(g, spell)], { mode: 0 });
    // Resolve Icy Reception; its target's controller chooses to pay.
    for (let i = 0; i < 3 && g.decision.kind === 'priority'; i++) g.pass();
    g.do({ type: 'chooseEffect', player: g.actor, accept: true });
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('can counter a legendary noncreature spell, but not another noncreature spell', () => {
    const g = p2Turn(['captain-americas-shield', 'shock'], n('mountain', 2));
    cast(g, 'captain-americas-shield');
    const shield = g.state.stack[0]!.id;
    g.pass();
    const modeZero = (id: string) =>
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.card === g.id('p1', 'icy-reception', 'hand') &&
            a.mode === 0 &&
            a.targets.some((t) => 'object' in t && t.object.id === id),
        );
    expect(modeZero(shield)).toBe(true);
    // Put Shock on the stack instead: not a creature or legendary spell.
    const g2 = p2Turn(['shock'], n('mountain', 2));
    cast(g2, 'shock', [{ player: 'p1' }]);
    const shock = g2.state.stack[0]!.id;
    g2.pass();
    expect(
      g2
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.card === g2.id('p1', 'icy-reception', 'hand') &&
            a.mode === 0 &&
            a.targets.some((t) => 'object' in t && t.object.id === shock),
        ),
    ).toBe(false);
  });

  it('mode 2: target creature gets -5/-0 until end of turn', () => {
    const g = game({
      p1: { hand: ['icy-reception'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'icy-reception', [g.ref(angel)], { mode: 1 });
    done(g);
    expect(pt(g, angel)).toEqual([-1, 4]);
    toStep(g, 'main1', true);
    expect(pt(g, angel)).toEqual([4, 4]);
  });
});

describe('Infinite Coursework', () => {
  it('taps the enchanted creature and it loses all abilities and does not untap', () => {
    const g = game({
      p1: { hand: ['infinite-coursework'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(keywords(g, angel).has('flying')).toBe(true);
    cast(g, 'infinite-coursework', [g.ref(angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(keywords(g, angel).has('flying')).toBe(false);
    expect(keywords(g, angel).has('vigilance')).toBe(false);
    toStep(g, 'main1', true);
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('makes the enchanted creature unprepared', () => {
    const g = game({
      p1: { hand: ['semester-foreseer', 'infinite-coursework'], battlefield: n('island', 8) },
    });
    done(cast(g, 'semester-foreseer'));
    const f = g.id('p1', 'semester-foreseer');
    expect(g.obj(f).prepared).toBeDefined();
    cast(g, 'infinite-coursework', [g.ref(f)]);
    done(g);
    expect(g.obj(f).prepared).toBeUndefined();
    expect(g.obj(f).tapped).toBe(true);
  });
});

describe('Lyra, Tolarian Archangel', () => {
  it('has flying; at the end step, if you drew three or more cards this turn, makes a 3/3 blue Angel with flying', () => {
    const g = game({
      p1: {
        hand: n('opt', 3),
        battlefield: ['lyra-tolarian-archangel', ...n('island', 3)],
        library: n('forest', 10),
      },
    });
    expect(keywords(g, g.id('p1', 'lyra-tolarian-archangel')).has('flying')).toBe(true);
    for (let i = 0; i < 3; i++) done(cast(g, 'opt'));
    expect(g.state.turn.cardsDrawn.p1).toBe(3);
    toStep(g, 'end');
    done(g);
    const angels = all(g, 'fra-blue-angel-token');
    expect(angels).toHaveLength(1);
    expect(pt(g, angels[0]!)).toEqual([3, 3]);
    expect(keywords(g, angels[0]!).has('flying')).toBe(true);
    expect(g.obj(angels[0]!).isToken).toBe(true);
  });

  it('makes no Angel after only two cards drawn', () => {
    const g = game({
      p1: {
        hand: n('opt', 2),
        battlefield: ['lyra-tolarian-archangel', ...n('island', 2)],
        library: n('forest', 10),
      },
    });
    for (let i = 0; i < 2; i++) done(cast(g, 'opt'));
    toStep(g, 'end');
    done(g);
    expect(all(g, 'fra-blue-angel-token')).toHaveLength(0);
  });

  it("triggers at each end step: three cards drawn during an opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: n('opt', 3),
        battlefield: ['lyra-tolarian-archangel', ...n('island', 3)],
        library: n('forest', 10),
      },
    });
    g.pass(); // p2 passes priority; p1 may now respond
    for (let i = 0; i < 3; i++) {
      cast(g, 'opt');
      done(g);
      if (g.actor !== 'p1') g.pass();
    }
    expect(g.state.turn.cardsDrawn.p1).toBe(3);
    toStep(g, 'end');
    done(g);
    expect(all(g, 'fra-blue-angel-token')).toHaveLength(1);
  });

  it('{3}{U}{U}: until end of turn, whenever it deals combat damage to a player, draw two cards (once per activation)', () => {
    const g = game({
      p1: {
        battlefield: ['lyra-tolarian-archangel', ...n('island', 10)],
        library: n('forest', 10),
      },
    });
    const lyra = g.id('p1', 'lyra-tolarian-archangel');
    activate(g, lyra, 1);
    done(g);
    activate(g, lyra, 1);
    done(g);
    for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('declareAttackers');
    g.attack(lyra);
    toStep(g, 'endCombat');
    expect(g.life('p2')).toBe(17);
    expect(hand(g)).toHaveLength(4);
  });

  it('the draw ability ends with the turn', () => {
    const g = game({
      p1: { battlefield: ['lyra-tolarian-archangel', ...n('island', 5)], library: n('forest', 10) },
    });
    const lyra = g.id('p1', 'lyra-tolarian-archangel');
    activate(g, lyra, 1);
    done(g);
    expect(g.obj(lyra).tempAbilities).toHaveLength(1);
    toStep(g, 'main1', true);
    expect(g.obj(lyra).tempAbilities ?? []).toHaveLength(0);
  });
});

describe('Perfected Theory', () => {
  it('mode 1: base power and toughness 1/1; mode 2: 4/5; both until end of turn', () => {
    for (const [m, expected] of [
      [0, [1, 1]],
      [1, [4, 5]],
    ] as const) {
      const g = game({
        p1: { hand: ['perfected-theory'], battlefield: ['island'] },
        p2: { battlefield: ['serra-angel'] },
      });
      const angel = g.id('p2', 'serra-angel');
      cast(g, 'perfected-theory', [g.ref(angel)], { mode: m });
      done(g);
      expect(pt(g, angel)).toEqual(expected);
      toStep(g, 'main1', true);
      expect(pt(g, angel)).toEqual([4, 4]);
    }
  });

  it('keeps counters and other bonuses on top of the new base', () => {
    const g = game({
      p1: { hand: ['perfected-theory'], battlefield: ['island', 'cryotheory-adept'] },
    });
    const adept = g.id('p1', 'cryotheory-adept');
    g.obj(adept).plusOneCounters = 2;
    cast(g, 'perfected-theory', [g.ref(adept)], { mode: 1 });
    done(g);
    // Base 4/5, two counters, prowess +1/+1.
    expect(pt(g, adept)).toEqual([7, 8]);
  });
});

describe('Precise Redaction', () => {
  const setup = (p2Hand: string[]) =>
    game({
      active: 'p2',
      p1: { hand: ['precise-redaction'], battlefield: [...n('island', 2), 'serra-angel'] },
      p2: { hand: p2Hand, battlefield: ['mountain', 'plains', 'swamp', 'forest'] },
    });
  const redactable = (g: GameDriver, id: string) =>
    g
      .legal()
      .some(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p1', 'precise-redaction', 'hand') &&
          a.targets.some((t) => 'object' in t && t.object.id === id),
      );

  it('counters a white spell', () => {
    const g = setup(['savannah-lions']);
    cast(g, 'savannah-lions');
    const spell = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'precise-redaction', [onStack(g, spell)]);
    done(g);
    expect(gy(g, 'p2')).toContain('savannah-lions');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
  });

  it('counters a black spell', () => {
    const g = setup(['doom-blade']);
    cast(g, 'doom-blade', [g.ref(g.id('p1', 'serra-angel'))]);
    const spell = g.state.stack[0]!.id;
    g.pass();
    cast(g, 'precise-redaction', [onStack(g, spell)]);
    done(g);
    expect(gy(g, 'p2')).toContain('doom-blade');
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it("can't target a red or green spell", () => {
    const g = setup(['shock', 'giant-growth']);
    cast(g, 'shock', [{ player: 'p1' }]);
    expect(redactable(g, g.state.stack[0]!.id)).toBe(false);
    const g2 = setup(['giant-growth']);
    cast(g2, 'giant-growth', [g2.ref(g2.id('p1', 'serra-angel'))]);
    expect(redactable(g2, g2.state.stack[0]!.id)).toBe(false);
  });
});

describe('Proft, Consulting Detective', () => {
  const setup = (lands = 3) =>
    game({
      p1: {
        hand: ['yuriko-hope-from-the-shadows'],
        battlefield: ['proft-consulting-detective', ...n('island', lands)],
        library: n('forest', 6),
      },
    });

  it('whenever you scry or surveil, you may pay {2}: a +1/+1 counter and draw a card', () => {
    const g = setup();
    const proft = g.id('p1', 'proft-consulting-detective');
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(1), accept: true });
    expect(g.obj(proft).plusOneCounters).toBe(1);
    expect(hand(g)).toHaveLength(1);
    expect(pt(g, proft)).toEqual([3, 3]);
  });

  it('does nothing if you decline', () => {
    const g = setup();
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(1), accept: false });
    expect(g.obj(g.id('p1', 'proft-consulting-detective')).plusOneCounters).toBe(0);
    expect(hand(g)).toHaveLength(0);
  });

  it("can't pay without {2} available", () => {
    const g = setup(1);
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(1), accept: true });
    expect(g.obj(g.id('p1', 'proft-consulting-detective')).plusOneCounters).toBe(0);
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Ruric Thar, Biomagus', () => {
  it('has flying and two instances of prowess', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: ['ruric-thar-biomagus', 'island'] },
    });
    const r = g.id('p1', 'ruric-thar-biomagus');
    expect(keywords(g, r).has('flying')).toBe(true);
    expect(pt(g, r)).toEqual([4, 6]);
    cast(g, 'opt');
    done(g);
    expect(pt(g, r)).toEqual([6, 8]);
  });

  it('draws a card whenever a spell or ability an opponent controls targets it', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['ruric-thar-biomagus'], library: n('forest', 5) },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [g.ref(g.id('p1', 'ruric-thar-biomagus'))]);
    done(g);
    expect(hand(g, 'p1')).toHaveLength(1);
  });

  it("doesn't draw when you target it yourself", () => {
    const g = game({
      p1: {
        hand: ['perfected-theory'],
        battlefield: ['ruric-thar-biomagus', 'island'],
        library: n('forest', 5),
      },
    });
    cast(g, 'perfected-theory', [g.ref(g.id('p1', 'ruric-thar-biomagus'))], { mode: 0 });
    done(g);
    expect(hand(g, 'p1')).toHaveLength(0);
  });
});

/** Answers each trigger target decision with exactly these creatures (the rest are left out). */
function chooseTriggerTargets(g: GameDriver, ids: string[]): void {
  for (let i = 0; i < 20 && g.decision.kind === 'chooseTriggerTargets'; i++) {
    const legal = g.legal().filter((a) => a.type === 'chooseTargets');
    const targetIds = (a: Action) =>
      a.type === 'chooseTargets'
        ? a.targets.map((t) => ('object' in t ? t.object.id : t.player))
        : [];
    const picked = (g.decision as { picked?: unknown[] }).picked;
    const have = picked?.length ?? 0;
    // Add the next wanted target while there is one; otherwise finish.
    const next = legal.find(
      (a) =>
        targetIds(a).length === have + 1 && ids.length > have && targetIds(a)[have] === ids[have],
    );
    const finish = legal.find((a) => targetIds(a).length === have);
    g.do((next ?? finish ?? legal[0])!);
  }
}

describe('Samut, Tyrant of Naktamun', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['opt', 'savannah-lions'],
        battlefield: ['samut-tyrant-of-naktamun', 'island', 'plains'],
      },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
  const p2CanRespond = (g: GameDriver) => g.legal('p2').some((a) => a.type === 'castSpell');

  it('instant and sorcery spells you control have split second: the opponent cannot respond', () => {
    const g = setup();
    cast(g, 'opt');
    g.pass();
    expect(g.actor).toBe('p2');
    expect(g.legal('p2').every((a) => a.type === 'passPriority')).toBe(true);
    expect(p2CanRespond(g)).toBe(false);
  });

  it("doesn't give split second to creature spells", () => {
    const g = setup();
    cast(g, 'savannah-lions');
    g.pass();
    expect(p2CanRespond(g)).toBe(true);
  });

  it("doesn't give split second to the opponent's instants", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['opt'], battlefield: ['samut-tyrant-of-naktamun', 'island'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.pass();
    expect(g.actor).toBe('p1');
    expect(g.legal('p1').some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('without Samut a spell has no split second', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: ['island'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    cast(g, 'opt');
    g.pass();
    expect(p2CanRespond(g)).toBe(true);
  });
});

describe('Seasoned Cryomancer', () => {
  const setup = (library: string[], opponentCreatures = 3) =>
    game({
      p1: { hand: ['seasoned-cryomancer'], battlefield: n('island', 3), library },
      p2: { battlefield: n('savannah-lions', opponentCreatures) },
    });
  const lions = (g: GameDriver) => all(g, 'savannah-lions');

  it('draws two cards, then discards two cards', () => {
    const g = setup(['forest', 'forest', 'forest']);
    cast(g, 'seasoned-cryomancer');
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toEqual(['forest', 'forest']);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('with two nonland discards, taps up to two target creatures (chosen one at a time) and stuns each', () => {
    const g = setup(['savannah-lions', 'savannah-lions', 'forest']);
    cast(g, 'seasoned-cryomancer');
    // Resolve the enters trigger and the discards by hand.
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      if (g.decision.kind === 'discard') g.do(g.legal().find((x) => x.type === 'discard')!);
      else g.pass();
    }
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const targets = lions(g).filter((id) => g.obj(id).controller === 'p2');
    expect(targets).toHaveLength(3);
    chooseTriggerTargets(g, [targets[0]!, targets[1]!]);
    done(g);
    expect(g.obj(targets[0]!).tapped).toBe(true);
    expect(g.obj(targets[1]!).tapped).toBe(true);
    expect(g.obj(targets[2]!).tapped).toBe(false);
    expect(stun(g, targets[0]!)).toBe(1);
    expect(stun(g, targets[1]!)).toBe(1);
    expect(stun(g, targets[2]!)).toBe(0);
  });

  it("can't pick more targets than nonland cards discarded", () => {
    // One nonland and one land discarded: up to one target.
    const g = setup(['savannah-lions', 'forest', 'forest']);
    cast(g, 'seasoned-cryomancer');
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      if (g.decision.kind === 'discard') g.do(g.legal().find((x) => x.type === 'discard')!);
      else g.pass();
    }
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const first = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!;
    g.do(first);
    // Having picked one, only "done" is left.
    const after = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(after).toHaveLength(1);
    expect(after[0]!.type === 'chooseTargets' && after[0]!.targets).toHaveLength(1);
  });

  it('with only lands discarded, nothing is tapped or stunned and there is no trigger', () => {
    const g = setup(['forest', 'forest', 'forest']);
    cast(g, 'seasoned-cryomancer');
    for (
      let i = 0;
      i < 10 && !['chooseTriggerTargets', 'gameOver'].includes(g.decision.kind);
      i++
    ) {
      if (g.decision.kind === 'discard') g.do(g.legal().find((x) => x.type === 'discard')!);
      else if (g.decision.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(g.decision.kind).not.toBe('chooseTriggerTargets');
    for (const id of lions(g)) expect(stun(g, id)).toBe(0);
  });

  it('{3}{U}{U}, exile from your graveyard: draw two cards', () => {
    const g = game({
      p1: {
        graveyard: ['seasoned-cryomancer'],
        battlefield: n('island', 5),
        library: n('forest', 4),
      },
    });
    activate(g, g.id('p1', 'seasoned-cryomancer', 'graveyard'), 2);
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(exile(g)).toEqual(['seasoned-cryomancer']);
  });
});

describe('Semester Foreseer', () => {
  it('is a 3/4 that enters prepared and surveils 1 when it enters', () => {
    const g = game({
      p1: {
        hand: ['semester-foreseer'],
        battlefield: n('island', 4),
        library: ['forest', 'island'],
      },
    });
    cast(g, 'semester-foreseer');
    done(g, { scry: toGraveyard(1) });
    const f = g.id('p1', 'semester-foreseer');
    expect(pt(g, f)).toEqual([3, 4]);
    expect(g.obj(f).prepared).toBeDefined();
    expect(gy(g)).toEqual(['forest']);
  });

  it('Peer Review ({2}{W/U}) makes a 2/2 colorless Wizard Soldier named Cadet, then surveils 1', () => {
    const g = game({
      p1: { hand: ['semester-foreseer'], battlefield: n('island', 7), library: n('forest', 5) },
    });
    done(cast(g, 'semester-foreseer'));
    castCopy(g, g.id('p1', 'semester-foreseer'));
    done(g, { scry: toGraveyard(1) });
    const cadets = all(g, 'fra-cadet-token');
    expect(cadets).toHaveLength(1);
    expect(pt(g, cadets[0]!)).toEqual([2, 2]);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.obj(g.id('p1', 'semester-foreseer')).prepared).toBeUndefined();
  });

  it('Peer Review can be paid with white mana for the hybrid symbol', () => {
    const canPeerReview = (plains: number) => {
      const g = game({
        p1: {
          hand: ['semester-foreseer'],
          battlefield: [...n('island', 4), ...n('plains', plains)],
        },
      });
      // The four Islands pay for Semester Foreseer; only Plains are left for its spell.
      done(cast(g, 'semester-foreseer'));
      const copy = g.obj(g.id('p1', 'semester-foreseer')).prepared;
      return g.legal().some((a) => a.type === 'castSpell' && a.card === copy);
    };
    expect(canPeerReview(3)).toBe(true);
    expect(canPeerReview(2)).toBe(false);
  });
});

describe('Sphinx of False Conclusions', () => {
  it('has flash and flying', () => {
    const g = game({ p1: { hand: ['sphinx-of-false-conclusions'], battlefield: n('island', 4) } });
    const k = keywords(g, g.id('p1', 'sphinx-of-false-conclusions', 'hand'));
    expect(k.has('flash')).toBe(true);
    expect(k.has('flying')).toBe(true);
    expect(pt(g, g.id('p1', 'sphinx-of-false-conclusions', 'hand'))).toEqual([4, 2]);
  });

  it('whenever it attacks, draw a card, then discard a card', () => {
    const g = combat(['sphinx-of-false-conclusions'], [], n('forest', 5));
    g.attack(g.id('p1', 'sphinx-of-false-conclusions'));
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toEqual(['forest']);
    expect(g.state.players.p1.library).toHaveLength(4);
  });

  it("when it dies, if it isn't a token, creates a token copy; the token doesn't make another", () => {
    const g = game({ p1: { battlefield: ['sphinx-of-false-conclusions'] } });
    const sphinx = g.id('p1', 'sphinx-of-false-conclusions');
    g.obj(sphinx).damage = 2;
    g.pass();
    done(g);
    expect(gy(g)).toContain('sphinx-of-false-conclusions');
    const tokens = all(g, 'sphinx-of-false-conclusions');
    expect(tokens).toHaveLength(1);
    expect(g.obj(tokens[0]!).isToken).toBe(true);
    expect(g.obj(tokens[0]!).controller).toBe('p1');
    expect(pt(g, tokens[0]!)).toEqual([4, 2]);
    expect(keywords(g, tokens[0]!).has('flying')).toBe(true);
    // The token dies: no new token.
    g.obj(tokens[0]!).damage = 2;
    g.pass();
    g.pass();
    done(g);
    expect(all(g, 'sphinx-of-false-conclusions')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });
});

describe("Sphinx's Approach", () => {
  const approaches = (n: number) => Array<string>(n).fill('sphinxs-approach');
  const setup = (inGraveyard: number, graveyardExtra: string[] = []) =>
    game({
      p1: {
        hand: ['sphinxs-approach'],
        battlefield: n('island', 3),
        graveyard: [...approaches(inGraveyard), ...graveyardExtra],
        library: ['forest', 'forest', 'sphinx-of-false-conclusions', 'island', 'forest'],
      },
    });

  it('draws two cards', () => {
    const g = setup(0);
    cast(g, 'sphinxs-approach');
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest']);
    expect(gy(g)).toEqual(['sphinxs-approach']);
  });

  it('with four others in your graveyard, you may exile all five to put a Sphinx from your library onto the battlefield', () => {
    const g = setup(4);
    cast(g, 'sphinxs-approach');
    done(g, { accept: true });
    expect(exile(g)).toEqual(approaches(5));
    expect(gy(g)).toEqual([]);
    expect(all(g, 'sphinx-of-false-conclusions')).toHaveLength(1);
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).not.toContain(
      'sphinx-of-false-conclusions',
    );
  });

  it('declining leaves everything in the graveyard', () => {
    const g = setup(4);
    cast(g, 'sphinxs-approach');
    done(g, { accept: false });
    expect(gy(g)).toEqual(approaches(5));
    expect(all(g, 'sphinx-of-false-conclusions')).toHaveLength(0);
  });

  it("with only three others, or other cards in the graveyard, there's no choice", () => {
    const g = setup(3, ['forest', 'forest']);
    cast(g, 'sphinxs-approach');
    for (let i = 0; i < 6 && g.state.stack.length; i++) g.pass();
    expect(g.legal().some((a) => a.type === 'chooseEffect')).toBe(false);
    expect(g.decision.kind).toBe('priority');
    expect(all(g, 'sphinx-of-false-conclusions')).toHaveLength(0);
    expect(gy(g).filter((c) => c === 'sphinxs-approach')).toHaveLength(4);
  });
});

describe('Surveillance Phantasm', () => {
  const attackers = (g: GameDriver) => g.legal().filter((a) => a.type === 'addAttacker').length;

  it('has defender, flying and vigilance', () => {
    const g = game({ p1: { battlefield: ['surveillance-phantasm'] } });
    const k = keywords(g, g.id('p1', 'surveillance-phantasm'));
    expect(k.has('defender')).toBe(true);
    expect(k.has('flying')).toBe(true);
    expect(k.has('vigilance')).toBe(true);
    expect(pt(g, g.id('p1', 'surveillance-phantasm'))).toEqual([2, 3]);
  });

  it("can't attack until you've scried or surveilled this turn", () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['surveillance-phantasm'] },
    }).passBoth();
    // With nothing able to attack, the declare attackers step is skipped.
    expect(g.decision.kind).not.toBe('declareAttackers');
  });

  it('can attack after you surveil this turn', () => {
    const g = game({
      p1: { battlefield: ['surveillance-phantasm', ...n('island', 4)], library: n('forest', 5) },
    });
    activate(g, g.id('p1', 'surveillance-phantasm'), 1);
    done(g);
    expect(g.state.turn.scriedOrSurveilled).toContain('p1');
    for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('declareAttackers');
    expect(attackers(g)).toBe(1);
  });

  it('the opponent scrying does not count, and it resets each turn', () => {
    const g = game({ p1: { battlefield: ['surveillance-phantasm'] } });
    g.state.turn.scriedOrSurveilled = ['p2'];
    for (let i = 0; i < 6 && g.decision.kind === 'priority' && g.state.turn.step !== 'main2'; i++)
      g.pass();
    expect(g.decision.kind).not.toBe('declareAttackers');
    // The next turn it is back to nothing.
    g.state.turn.scriedOrSurveilled = ['p1'];
    toStep(g, 'main1', true);
    expect(g.state.turn.scriedOrSurveilled ?? []).toEqual([]);
  });

  it('{3}{U}: surveil 1', () => {
    const g = game({
      p1: {
        battlefield: ['surveillance-phantasm', ...n('island', 4)],
        library: ['forest', 'island'],
      },
    });
    activate(g, g.id('p1', 'surveillance-phantasm'), 1);
    done(g, { scry: toGraveyard(1) });
    expect(gy(g)).toEqual(['forest']);
  });
});

describe('Tetsuko Umezawa, Fugitive', () => {
  const blockers = (g: GameDriver, attacker: string) =>
    g.legal('p2').filter((a) => a.type === 'addBlock' && a.attacker === attacker).length;
  const toBlocks = (g: GameDriver) => {
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else break;
    }
    expect(g.decision.kind).toBe('declareBlockers');
  };

  it('creatures you control with power or toughness 1 or less cannot be blocked; others can', () => {
    const g = combat(
      ['tetsuko-umezawa-fugitive', 'savannah-lions', 'serra-angel', 'fblthp-impossibly-lost'],
      ['serra-angel'],
    );
    const tetsuko = g.id('p1', 'tetsuko-umezawa-fugitive');
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    const fblthp = g.id('p1', 'fblthp-impossibly-lost');
    g.attack(tetsuko, lions, angel, fblthp);
    done(g);
    toBlocks(g);
    expect(blockers(g, tetsuko)).toBe(0); // power 1
    expect(blockers(g, lions)).toBe(0); // toughness 1
    expect(blockers(g, fblthp)).toBe(0); // 1/1
    expect(blockers(g, angel)).toBe(1);
  });

  it('is checked as it is: a creature that gets bigger can be blocked, smaller cannot', () => {
    const g = game({
      p1: {
        hand: ['perfected-theory'],
        battlefield: ['tetsuko-umezawa-fugitive', 'serra-angel', 'island'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'perfected-theory', [g.ref(angel)], { mode: 0 });
    done(g);
    for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.pass();
    g.attack(angel);
    done(g);
    // Nothing can block it, so there's no declare blockers decision.
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).not.toBe('declareBlockers');
    expect(g.life('p2')).toBe(19);
  });

  it("doesn't help the opponent's creatures", () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { battlefield: ['tetsuko-umezawa-fugitive', 'serra-angel'] },
      p2: { battlefield: ['savannah-lions'] },
    }).passBoth();
    const lions = g.id('p2', 'savannah-lions');
    g.attack(lions);
    done(g);
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    expect(
      g.legal('p1').filter((a) => a.type === 'addBlock' && a.attacker === lions).length,
    ).toBeGreaterThan(0);
  });
});

describe('Traxos, Academy Guardian', () => {
  const canCast = (g: GameDriver) =>
    g
      .legal()
      .some(
        (a) => a.type === 'castSpell' && a.card === g.id('p1', 'traxos-academy-guardian', 'hand'),
      );

  it('is a 1/5 with flying, vigilance and prowess', () => {
    const g = game({ p1: { battlefield: ['traxos-academy-guardian', 'island'], hand: ['opt'] } });
    const t = g.id('p1', 'traxos-academy-guardian');
    const k = keywords(g, t);
    expect(k.has('flying')).toBe(true);
    expect(k.has('vigilance')).toBe(true);
    expect(pt(g, t)).toEqual([1, 5]);
    cast(g, 'opt');
    done(g);
    expect(pt(g, t)).toEqual([2, 6]);
  });

  it('costs {2} less if you have cast a noncreature spell this turn', () => {
    const g = game({
      p1: { hand: ['traxos-academy-guardian', 'opt'], battlefield: n('island', 3) },
    });
    cast(g, 'opt');
    done(g);
    // Two Islands left: {3}{U} less {2} is {1}{U}.
    expect(canCast(g)).toBe(true);
    cast(g, 'traxos-academy-guardian');
    done(g);
    expect(all(g, 'traxos-academy-guardian')).toHaveLength(1);
  });

  it('costs full price otherwise', () => {
    const g = game({ p1: { hand: ['traxos-academy-guardian'], battlefield: n('island', 3) } });
    expect(canCast(g)).toBe(false);
  });

  it('a creature spell does not count', () => {
    const g = game({
      p1: {
        hand: ['traxos-academy-guardian', 'savannah-lions'],
        battlefield: [...n('island', 3), 'plains'],
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(canCast(g)).toBe(false);
  });
});

describe('Undulating Witness', () => {
  it('is a 3/5 with flying; {2}: +1/-1 until end of turn, any number of times', () => {
    const g = game({ p1: { battlefield: ['undulating-witness', ...n('island', 4)] } });
    const w = g.id('p1', 'undulating-witness');
    expect(keywords(g, w).has('flying')).toBe(true);
    expect(pt(g, w)).toEqual([3, 5]);
    activate(g, w, 0);
    done(g);
    activate(g, w, 0);
    done(g);
    expect(pt(g, w)).toEqual([5, 3]);
    toStep(g, 'main1', true);
    expect(pt(g, w)).toEqual([3, 5]);
  });

  it('basic landcycling {2}: discard it to search for a basic land card', () => {
    const g = game({
      p1: {
        hand: ['undulating-witness'],
        battlefield: n('island', 2),
        library: ['serra-angel', 'swamp', 'forest'],
      },
    });
    const w = g.id('p1', 'undulating-witness', 'hand');
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === w && a.abilityIndex === 1),
    ).toBe(true);
    activate(g, w, 1);
    // The search offers only basic lands.
    for (let i = 0; i < 4 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options)
      if (o.type === 'chooseCard' && o.card)
        expect(['swamp', 'forest']).toContain(g.obj(o.card).defId);
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(['swamp', 'forest']).toContain(hand(g)[0]);
    expect(gy(g)).toEqual(['undulating-witness']);
  });
});

describe('Variable Chaser', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['variable-chaser', 'forest', 'forest'],
        battlefield: n('island', 6),
        library: n('island', 10),
      },
      p2: { hand: ['forest', 'forest', 'forest'], library: n('mountain', 10) },
    });

  /** Casts Arc of Fortune from the prepared Variable Chaser and answers each player's choice. */
  const arc = (g: GameDriver, answers: Record<'p1' | 'p2', 0 | 1>) => {
    done(cast(g, 'variable-chaser'));
    castCopy(g, g.id('p1', 'variable-chaser'));
    for (let i = 0; i < 10; i++) {
      const d = g.decision;
      if (d.kind === 'chooseOption')
        g.do({ type: 'chooseOption', player: d.player, index: answers[d.player] });
      else if (d.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
  };

  it('is a 2/3 with flying and prowess that enters prepared', () => {
    const g = setup();
    done(cast(g, 'variable-chaser'));
    const v = g.id('p1', 'variable-chaser');
    expect(keywords(g, v).has('flying')).toBe(true);
    expect(pt(g, v)).toEqual([2, 3]);
    expect(g.obj(v).prepared).toBeDefined();
  });

  it('Arc of Fortune: each player may discard their hand and draw seven cards', () => {
    const g = setup();
    arc(g, { p1: 0, p2: 0 });
    expect(hand(g, 'p1')).toEqual(n('island', 7));
    expect(hand(g, 'p2')).toEqual(n('mountain', 7));
    expect(gy(g, 'p1')).toContain('forest');
    expect(gy(g, 'p2')).toEqual(n('forest', 3));
  });

  it('only the players who choose to do it discard and draw', () => {
    const g = setup();
    arc(g, { p1: 1, p2: 0 });
    expect(hand(g, 'p1')).toEqual(['forest', 'forest']);
    expect(hand(g, 'p2')).toEqual(n('mountain', 7));
    const g2 = setup();
    arc(g2, { p1: 0, p2: 1 });
    expect(hand(g2, 'p1')).toEqual(n('island', 7));
    expect(hand(g2, 'p2')).toEqual(n('forest', 3));
    const g3 = setup();
    arc(g3, { p1: 1, p2: 1 });
    expect(hand(g3, 'p1')).toEqual(['forest', 'forest']);
    expect(hand(g3, 'p2')).toEqual(n('forest', 3));
  });

  it('both choose before anything happens (the opponent chooses while your hand is still there)', () => {
    const g = setup();
    done(cast(g, 'variable-chaser'));
    castCopy(g, g.id('p1', 'variable-chaser'));
    for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p1');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    expect(hand(g, 'p1')).toEqual(['forest', 'forest']);
    expect(hand(g, 'p2')).toHaveLength(3);
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    done(g);
    expect(hand(g, 'p1')).toHaveLength(7);
  });
});

describe('Yargle, Goliath of Otaria', () => {
  it('is a 3/9 with no abilities', () => {
    const g = game({ p1: { battlefield: ['yargle-goliath-of-otaria'] } });
    const y = g.id('p1', 'yargle-goliath-of-otaria');
    expect(pt(g, y)).toEqual([3, 9]);
    expect(cardDb.get('yargle-goliath-of-otaria')!.abilities).toEqual([]);
  });
});

describe('Yuriko, Hope from the Shadows', () => {
  const setup = (graveyard: string[] = [], library = n('forest', 6)) =>
    game({
      p1: { hand: ['yuriko-hope-from-the-shadows'], battlefield: ['island'], graveyard, library },
      p2: { battlefield: ['serra-angel'] },
    });

  it('has flash', () => {
    const g = setup();
    expect(keywords(g, g.id('p1', 'yuriko-hope-from-the-shadows', 'hand')).has('flash')).toBe(true);
  });

  it('mode 1: target creature gets -X/-0, X the number of cards in your graveyard', () => {
    const g = setup(n('forest', 3));
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(0) });
    expect(pt(g, angel)).toEqual([1, 4]);
    toStep(g, 'main1', true);
    expect(pt(g, angel)).toEqual([4, 4]);
  });

  it('mode 1 with an empty graveyard does nothing', () => {
    const g = setup();
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(0) });
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
  });

  it('mode 2: surveil 2', () => {
    const g = setup([], ['island', 'forest', 'swamp']);
    cast(g, 'yuriko-hope-from-the-shadows');
    done(g, { pick: mode(1), scry: toGraveyard(2) });
    expect(gy(g)).toEqual(['island', 'forest']);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});
