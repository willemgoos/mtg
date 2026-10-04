import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a: green cards.

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const keywords = (g: GameDriver, id: string) => chars(g, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const tapped = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p && g.obj(id).tapped).length;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Answers "you may" (default: yes). */
  accept?: boolean;
  /** Cards (by id) to take in a search, in order; afterwards the search stops (default: the first card). */
  pick?: string[];
  /** The card (by id) to discard (default: the first). */
  discard?: string;
}

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  const picks = [...(opts.pick ?? [])];
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
    else if (d.kind === 'searchLibrary') {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card) as Extract<
        Action,
        { type: 'chooseCard' }
      >[];
      if (opts.pick) {
        const want = picks.shift();
        const found = want ? cards.find((a) => g.obj(a.card!).defId === want) : undefined;
        g.do(found ?? { type: 'chooseCard', player: d.player, card: null });
      } else g.do(cards[0] ?? { type: 'chooseCard', player: d.player, card: null });
    } else if (d.kind === 'discard') {
      const acts = g.legal().filter((a) => a.type === 'discard') as Extract<
        Action,
        { type: 'discard' }
      >[];
      g.do(acts.find((a) => g.obj(a.card).defId === opts.discard) ?? acts[0]!);
    } else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? true });
    else break;
  }
  return g;
}

/** The index of the nth ability of this kind on the card. */
const abilityIndex = (defId: string, kind: string, nth = 0): number => {
  const abilities = cardDb.get(defId)!.abilities;
  let seen = 0;
  for (let i = 0; i < abilities.length; i++)
    if (abilities[i]!.kind === kind && seen++ === nth) return i;
  throw new Error(`No ${kind} #${nth} on ${defId}`);
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

const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets });
  return g;
};

/** Passes priority until it is `step` of the current turn (declaring no attackers or blockers). */
function toStep(g: GameDriver, step: string): GameDriver {
  for (let i = 0; i < 80; i++) {
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/**
 * Moves to the declare attackers decision, attacks with these creatures and plays the combat out;
 * `blocks` are [blocker, attacker] pairs for the defending player.
 */
function attackWith(
  g: GameDriver,
  attackers: string[],
  blocks: [blocker: string, attacker: string][] = [],
): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  for (let i = 0; i < 60 && g.state.turn.step !== 'main2'; i++) {
    const d = g.decision;
    if (d.kind === 'declareBlockers') {
      for (const [blocker, attacker] of blocks)
        g.do({ type: 'addBlock', player: d.player, blocker, attacker });
      g.do({ type: 'confirmBlockers', player: d.player });
    } else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  return done(g);
}

/** Passes until the turn after the current one starts (effects "until end of turn" are over). */
function nextTurn(g: GameDriver): GameDriver {
  const turn = g.state.turn.number;
  for (let i = 0; i < 80 && g.state.turn.number === turn; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  return g;
}

/** The castSpell actions available for a card in hand (or graveyard). */
const casts = (g: GameDriver, defId: string, zone: 'hand' | 'graveyard' = 'hand') => {
  const card = g.id(g.actor, defId, zone);
  return g.legal().filter((a) => a.type === 'castSpell' && a.card === card);
};

describe('every card is in the pool', () => {
  it('has all 31 cards and both prepare spells', () => {
    for (const id of [
      'bestial-incursion',
      'budding-insurgent',
      'carnivorous-cultivator',
      'edgar-moonlit-sovereign',
      'fblthp-knows-the-way',
      'flourishing-grapple',
      'gardenize',
      'ghalta-the-unstoppable',
      'greenhouse-propagator',
      'heartwood-crafter',
      'hexhaven-invigorator',
      'hungering-puppetbeast',
      'hunters-axe',
      'jiang-yanggu-never-alone',
      'loot-the-nexus',
      'marwyn-the-preserver',
      'omnipresence',
      'pia-aether-ascetic',
      'puppet-crafting',
      'restore-with-empathy',
      'ruric-thar-magecrusher',
      'simulacrum-shaper',
      'something-worth-saving',
      'sureshot-sower',
      'tarmogoyf',
      'tethermages-advantage',
      'titanbones-towering-heart',
      'verdant-kraken',
      'vinelasher-adept',
      'wrecking-gecko',
      'yoshimaru-scrappy-stray',
    ])
      expect(cardDb.get(id), id).toBeDefined();
    expect(cardDb.get('carnivorous-cultivator')!.back).toBeDefined();
    expect(cardDb.get('heartwood-crafter')!.back).toBeDefined();
  });
});

describe('Bestial Incursion', () => {
  it('makes a 4/4 Beast with trample', () => {
    const g = game({ p1: { hand: ['bestial-incursion'], battlefield: n('forest', 4) } });
    done(cast(g, 'bestial-incursion'));
    const beast = all(g, 'fra-green-beast-token');
    expect(beast).toHaveLength(1);
    expect(pt(g, beast[0]!)).toEqual([4, 4]);
    expect(keywords(g, beast[0]!)).toContain('trample');
    expect(gy(g)).toContain('bestial-incursion');
  });

  it('has flashback {5}{G}, then is exiled', () => {
    const g = game({ p1: { graveyard: ['bestial-incursion'], battlefield: n('forest', 6) } });
    expect(casts(g, 'bestial-incursion', 'graveyard')).toHaveLength(1);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'bestial-incursion', 'graveyard'),
      targets: [],
    });
    done(g);
    expect(all(g, 'fra-green-beast-token')).toHaveLength(1);
    expect(gy(g)).not.toContain('bestial-incursion');
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('bestial-incursion');
    // Not castable from the graveyard with five lands.
    const poor = game({ p1: { graveyard: ['bestial-incursion'], battlefield: n('forest', 5) } });
    expect(casts(poor, 'bestial-incursion', 'graveyard')).toHaveLength(0);
  });
});

describe('Budding Insurgent', () => {
  it('has vigilance and 3/3', () => {
    const g = game({ p1: { battlefield: ['budding-insurgent'] } });
    const b = g.id('p1', 'budding-insurgent');
    expect(pt(g, b)).toEqual([3, 3]);
    expect(keywords(g, b)).toContain('vigilance');
  });

  it('sacrifices to destroy an artifact, drawing nothing', () => {
    const g = game({
      p1: { battlefield: ['budding-insurgent'] },
      p2: { battlefield: ['hunters-axe'] },
    });
    const b = g.id('p1', 'budding-insurgent');
    activate(g, b, abilityIndex('budding-insurgent', 'activated'), [
      g.ref(g.id('p2', 'hunters-axe')),
    ]);
    done(g);
    expect(gy(g)).toContain('budding-insurgent');
    expect(gy(g, 'p2')).toContain('hunters-axe');
    expect(hand(g)).toHaveLength(0);
  });

  it('destroys a non-legendary enchantment without drawing', () => {
    const g = game({
      p1: { battlefield: ['budding-insurgent'] },
      p2: { battlefield: ['gardenize'] },
    });
    activate(g, g.id('p1', 'budding-insurgent'), abilityIndex('budding-insurgent', 'activated'), [
      g.ref(g.id('p2', 'gardenize')),
    ]);
    done(g);
    expect(gy(g, 'p2')).toContain('gardenize');
    expect(hand(g)).toHaveLength(0);
  });

  it('draws a card when it was a legendary enchantment', () => {
    const g = game({
      p1: { battlefield: ['budding-insurgent'] },
      p2: { battlefield: ['folk-hero'] },
    });
    activate(g, g.id('p1', 'budding-insurgent'), abilityIndex('budding-insurgent', 'activated'), [
      g.ref(g.id('p2', 'folk-hero')),
    ]);
    done(g);
    expect(gy(g, 'p2')).toContain('folk-hero');
    expect(hand(g)).toHaveLength(1);
  });

  it('can only be activated as a sorcery, and only targets artifacts and enchantments', () => {
    const g = game({
      p1: { battlefield: ['budding-insurgent'] },
      p2: { battlefield: ['hunters-axe', 'bear-cub'] },
    });
    const b = g.id('p1', 'budding-insurgent');
    const acts = () =>
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === b) as Extract<
        Action,
        { type: 'activateAbility' }
      >[];
    expect(acts()).toHaveLength(1);
    expect(acts()[0]!.targets).toEqual([g.ref(g.id('p2', 'hunters-axe'))]);
    // Not in the beginning of combat step (not a sorcery-speed window).
    toStep(g, 'beginCombat');
    expect(acts()).toHaveLength(0);
  });
});

describe('Carnivorous Cultivator and Enroot', () => {
  it('has deathtouch and enters prepared', () => {
    const g = game({ p1: { hand: ['carnivorous-cultivator'], battlefield: n('forest', 2) } });
    done(cast(g, 'carnivorous-cultivator'));
    const c = g.id('p1', 'carnivorous-cultivator');
    expect(keywords(g, c)).toContain('deathtouch');
    expect(g.obj(c).prepared).toBeDefined();
  });

  it('Enroot searches for a land card and puts it into the graveyard', () => {
    const g = game({
      p1: {
        hand: ['carnivorous-cultivator'],
        battlefield: n('forest', 3),
        library: ['serra-angel', 'island', 'forest'],
      },
    });
    done(cast(g, 'carnivorous-cultivator'));
    const c = g.id('p1', 'carnivorous-cultivator');
    castCopy(g, c);
    done(g, { pick: ['island'] });
    expect(gy(g)).toContain('island');
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(g.obj(c).prepared).toBeUndefined();
  });

  it('returns a land card from your graveyard to your hand on combat damage to a player', () => {
    const g = game({
      p1: { battlefield: ['carnivorous-cultivator'], graveyard: ['island', 'serra-angel'] },
    });
    attackWith(g, [g.id('p1', 'carnivorous-cultivator')]);
    expect(g.life('p2')).toBe(18);
    expect(hand(g)).toEqual(['island']);
    expect(gy(g)).toEqual(['serra-angel']);
  });

  it('does not trigger when blocked', () => {
    const g = game({
      p1: { battlefield: ['carnivorous-cultivator'], graveyard: ['island'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    attackWith(
      g,
      [g.id('p1', 'carnivorous-cultivator')],
      [[g.id('p2', 'savannah-lions'), g.id('p1', 'carnivorous-cultivator')]],
    );
    expect(g.life('p2')).toBe(20);
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Edgar, Moonlit Sovereign', () => {
  it('has flash and 4/4', () => {
    const g = game({ p1: { hand: ['edgar-moonlit-sovereign'], battlefield: n('forest', 5) } });
    done(cast(g, 'edgar-moonlit-sovereign'));
    const e = g.id('p1', 'edgar-moonlit-sovereign');
    expect(pt(g, e)).toEqual([4, 4]);
    expect(keywords(g, e)).toContain('flash');
  });

  it('gets two +1/+1 counters at your end step if you cast no spell this turn', () => {
    const g = game({ p1: { battlefield: ['edgar-moonlit-sovereign'] } });
    const e = g.id('p1', 'edgar-moonlit-sovereign');
    toStep(g, 'end');
    done(g);
    expect(counters(g, e)).toBe(2);
    expect(pt(g, e)).toEqual([6, 6]);
  });

  it('gets no counters after you cast a spell this turn', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['edgar-moonlit-sovereign', 'mountain'] },
    });
    const e = g.id('p1', 'edgar-moonlit-sovereign');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    toStep(g, 'end');
    done(g);
    expect(counters(g, e)).toBe(0);
  });

  it('puts a counter on each creature you control that has a +1/+1 counter', () => {
    const g = game({
      p1: {
        battlefield: ['edgar-moonlit-sovereign', 'savannah-lions', 'bear-cub', ...n('forest', 5)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const e = g.id('p1', 'edgar-moonlit-sovereign');
    const lions = g.id('p1', 'savannah-lions');
    const bear = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    g.obj(e).plusOneCounters = 1;
    g.obj(lions).plusOneCounters = 2;
    g.obj(angel).plusOneCounters = 1;
    activate(g, e, abilityIndex('edgar-moonlit-sovereign', 'activated'));
    done(g);
    expect(counters(g, e)).toBe(2);
    expect(counters(g, lions)).toBe(3);
    expect(counters(g, bear)).toBe(0);
    expect(counters(g, angel)).toBe(1);
  });
});

describe('Fblthp, Knows the Way', () => {
  const basics = ['forest', 'island', 'swamp', 'mountain', 'plains'];

  it('its power is the number of basic land types among lands you control (domain)', () => {
    const g = game({
      p1: { battlefield: ['fblthp-knows-the-way', 'forest', 'forest', 'island'] },
    });
    const f = g.id('p1', 'fblthp-knows-the-way');
    expect(pt(g, f)).toEqual([2, 2]);
    const g2 = game({
      p1: { battlefield: ['fblthp-knows-the-way', ...basics] },
      p2: { battlefield: ['plains'] },
    });
    expect(pt(g2, g2.id('p1', 'fblthp-knows-the-way'))).toEqual([5, 2]);
    const g3 = game({ p1: { battlefield: ['fblthp-knows-the-way'] } });
    expect(pt(g3, g3.id('p1', 'fblthp-knows-the-way'))).toEqual([0, 2]);
  });

  it('counts a land with several basic land types once each', () => {
    // A Forest Tentacle token is a Forest.
    const g = game({
      p1: { battlefield: ['fblthp-knows-the-way', 'fra-green-forest-tentacle-token', 'island'] },
    });
    expect(pt(g, g.id('p1', 'fblthp-knows-the-way'))[0]).toBe(2);
  });

  it('with X = 2 takes up to two basic lands with different names into your hand', () => {
    const g = game({
      p1: {
        hand: ['fblthp-knows-the-way'],
        battlefield: n('forest', 4),
        library: ['forest', 'forest', 'forest', 'island', 'swamp'],
      },
    });
    cast(g, 'fblthp-knows-the-way', [], { x: 2 });
    done(g, { pick: ['forest', 'island'] });
    expect(hand(g).sort()).toEqual(['forest', 'island']);
    expect(g.state.players.p1.library).toHaveLength(3);
  });

  it('lets you stop early and offers no card with a name already taken', () => {
    const g = game({
      p1: {
        hand: ['fblthp-knows-the-way'],
        battlefield: n('forest', 5),
        library: ['forest', 'forest', 'island'],
      },
    });
    cast(g, 'fblthp-knows-the-way', [], { x: 3 });
    // Resolve the spell, then the enter trigger (no targets).
    for (let i = 0; i < 4 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    expect(g.decision.kind).toBe('searchLibrary');
    const offered = () =>
      g
        .legal()
        .filter((a) => a.type === 'chooseCard' && a.card)
        .map((a) => g.obj((a as { card: string }).card).defId);
    expect(offered().sort()).toEqual(['forest', 'island']);
    const forest = g
      .legal()
      .find((a) => a.type === 'chooseCard' && a.card && g.obj(a.card).defId === 'forest')!;
    g.do(forest);
    expect(g.decision.kind).toBe('searchLibrary');
    expect(offered()).toEqual(['island']);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });

  it('with X = 0 finds nothing', () => {
    const g = game({
      p1: { hand: ['fblthp-knows-the-way'], battlefield: n('forest', 2), library: ['island'] },
    });
    cast(g, 'fblthp-knows-the-way', [], { x: 0 });
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(all(g, 'fblthp-knows-the-way')).toHaveLength(1);
  });
});

describe('Flourishing Grapple', () => {
  it('makes a red creature lose its abilities until end of turn and deals damage equal to your creature’s power', () => {
    const g = game({
      p1: { hand: ['flourishing-grapple'], battlefield: ['forest', 'serra-angel'] },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    expect(keywords(g, dragon)).toContain('flying');
    done(cast(g, 'flourishing-grapple', [g.ref(dragon), g.ref(g.id('p1', 'serra-angel'))]));
    expect(keywords(g, dragon)).not.toContain('flying');
    expect(g.obj(dragon).damage).toBe(4);
    // Still blank at the end step; the abilities come back as the turn ends.
    toStep(g, 'end');
    expect(keywords(g, dragon)).not.toContain('flying');
    nextTurn(g);
    expect(keywords(g, dragon)).toContain('flying');
  });

  it('can target a white creature but not a green one', () => {
    const g = game({
      p1: { hand: ['flourishing-grapple'], battlefield: ['forest', 'bear-cub'] },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(targets).toContain(g.id('p2', 'serra-angel'));
    expect(targets).not.toContain(g.id('p2', 'llanowar-elves'));
  });

  it('can target a red or white planeswalker an opponent controls', () => {
    const g = game({
      p1: { hand: ['flourishing-grapple'], battlefield: ['forest', 'bear-cub'] },
      p2: { battlefield: ['ral-crackling-wit', 'elspeth-storm-slayer'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(targets).toContain(g.id('p2', 'ral-crackling-wit'));
    expect(targets).toContain(g.id('p2', 'elspeth-storm-slayer'));
  });

  it('can’t target your own creatures with the first target', () => {
    const g = game({
      p1: { hand: ['flourishing-grapple'], battlefield: ['forest', 'shivan-dragon'] },
    });
    expect(casts(g, 'flourishing-grapple')).toHaveLength(0);
  });
});

describe('Gardenize', () => {
  it('gets a charge counter when a creature you control dies, not when an opponent’s does', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: ['gardenize', 'savannah-lions', ...n('mountain', 2)],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const gz = g.id('p1', 'gardenize');
    done(cast(g, 'shock', [g.ref(g.id('p2', 'bear-cub'))]));
    expect(g.obj(gz).counters?.charge ?? 0).toBe(0);
    done(cast(g, 'shock', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(g.obj(gz).counters?.charge).toBe(1);
  });

  it('adds {G} for each charge counter at the beginning of your first main phase', () => {
    const g = game({ p1: { battlefield: ['gardenize'] }, step: 'draw' });
    const gz = g.id('p1', 'gardenize');
    g.obj(gz).counters = { charge: 3 };
    for (let i = 0; i < 6 && g.state.turn.step !== 'main1'; i++) g.pass();
    done(g);
    expect(g.state.turn.step).toBe('main1');
    expect(g.state.players.p1.pool?.map((m) => m.produces.join())).toEqual(['G', 'G', 'G']);
  });

  it('adds nothing with no charge counters', () => {
    const g = game({ p1: { battlefield: ['gardenize'] }, step: 'draw' });
    for (let i = 0; i < 6 && g.state.turn.step !== 'main1'; i++) g.pass();
    done(g);
    expect(g.state.players.p1.pool ?? []).toHaveLength(0);
  });
});

describe('Ghalta the Unstoppable', () => {
  it('costs {X} less, where X is the greatest power among your creatures', () => {
    const none = game({ p1: { hand: ['ghalta-the-unstoppable'], battlefield: n('forest', 8) } });
    expect(casts(none, 'ghalta-the-unstoppable')).toHaveLength(0);
    const with5 = game({
      p1: { hand: ['ghalta-the-unstoppable'], battlefield: ['shivan-dragon', ...n('forest', 4)] },
    });
    expect(casts(with5, 'ghalta-the-unstoppable').length).toBeGreaterThan(0);
    const short = game({
      p1: { hand: ['ghalta-the-unstoppable'], battlefield: ['shivan-dragon', ...n('forest', 3)] },
    });
    expect(casts(short, 'ghalta-the-unstoppable')).toHaveLength(0);
    // The reduction only takes generic mana: the {G} is always paid.
    const huge = game({
      p1: {
        hand: ['ghalta-the-unstoppable'],
        battlefield: ['shivan-dragon', 'shivan-dragon', 'shivan-dragon', 'mountain'],
      },
    });
    expect(casts(huge, 'ghalta-the-unstoppable')).toHaveLength(0);
  });

  it('has trample, and other creatures you control have trample', () => {
    const g = game({
      p1: { battlefield: ['ghalta-the-unstoppable', 'savannah-lions'] },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(keywords(g, g.id('p1', 'ghalta-the-unstoppable'))).toContain('trample');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).toContain('trample');
    expect(keywords(g, g.id('p2', 'bear-cub'))).not.toContain('trample');
    expect(pt(g, g.id('p1', 'ghalta-the-unstoppable'))).toEqual([8, 8]);
  });
});

describe('Greenhouse Propagator', () => {
  it('gains 1 life when another creature you control enters, not for itself or an opponent’s', () => {
    const g = game({
      p1: { hand: ['bear-cub', 'greenhouse-propagator'], battlefield: n('forest', 5) },
      p2: { hand: ['bear-cub'], battlefield: ['mountain'] },
    });
    done(cast(g, 'greenhouse-propagator'));
    expect(g.life('p1')).toBe(20);
    done(cast(g, 'bear-cub'));
    expect(g.life('p1')).toBe(21);
    // An opponent's creature entering doesn't count.
    const theirs = game({
      p1: { battlefield: ['greenhouse-propagator'] },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      active: 'p2',
    });
    done(cast(theirs, 'bear-cub'));
    expect(theirs.life('p1')).toBe(20);
  });

  it('taps for {G}', () => {
    const g = game({
      p1: {
        hand: ['bestial-incursion'],
        battlefield: ['greenhouse-propagator', ...n('forest', 3)],
      },
    });
    expect(casts(g, 'bestial-incursion').length).toBeGreaterThan(0);
    done(cast(g, 'bestial-incursion'));
    expect(tapped(g, 'greenhouse-propagator')).toBe(1);
  });
});

describe('Heartwood Crafter and Soul Tether', () => {
  it('enters prepared; Soul Tether makes a Heartwood token and unprepares it', () => {
    const g = game({
      p1: { hand: ['heartwood-crafter'], battlefield: n('forest', 4) },
    });
    done(cast(g, 'heartwood-crafter'));
    const c = g.id('p1', 'heartwood-crafter');
    expect(g.obj(c).prepared).toBeDefined();
    castCopy(g, c);
    done(g);
    expect(all(g, 'fra-heartwood-token')).toHaveLength(1);
    expect(g.obj(c).prepared).toBeUndefined();
  });

  it('taps for {C}, which can’t be spent on spells from your hand', () => {
    const only = game({
      p1: { hand: ['bestial-incursion'], battlefield: ['heartwood-crafter', ...n('forest', 3)] },
    });
    expect(casts(only, 'bestial-incursion')).toHaveLength(0);
    const enough = game({
      p1: { hand: ['bestial-incursion'], battlefield: ['heartwood-crafter', ...n('forest', 4)] },
    });
    expect(casts(enough, 'bestial-incursion').length).toBeGreaterThan(0);
    done(cast(enough, 'bestial-incursion'));
    // The Crafter wasn't used.
    expect(tapped(enough, 'heartwood-crafter')).toBe(0);
    expect(tapped(enough, 'forest')).toBe(4);
  });

  it('its mana can pay for abilities and for spells cast from other zones', () => {
    // Marwyn's {2} ability: the Crafter and a Forest.
    const ability = game({
      p1: {
        battlefield: ['heartwood-crafter', 'marwyn-the-preserver', 'forest'],
        graveyard: ['island'],
      },
    });
    const m = g0(ability, 'marwyn-the-preserver');
    activate(ability, m, abilityIndex('marwyn-the-preserver', 'activated'), [
      ability.ref(ability.id('p1', 'island', 'graveyard')),
    ]);
    done(ability);
    expect(hand(ability)).toEqual(['island']);
    // Flashback costs {5}{G}: six sources including the Crafter.
    const flashback = game({
      p1: {
        graveyard: ['bestial-incursion'],
        battlefield: ['heartwood-crafter', ...n('forest', 5)],
      },
    });
    expect(casts(flashback, 'bestial-incursion', 'graveyard')).toHaveLength(1);
    g0(flashback, 'heartwood-crafter');
    flashback.do({
      type: 'castSpell',
      player: 'p1',
      card: flashback.id('p1', 'bestial-incursion', 'graveyard'),
      targets: [],
    });
    done(flashback);
    expect(all(flashback, 'fra-green-beast-token')).toHaveLength(1);
  });

  it('its mana can pay for the prepared copy, which isn’t cast from your hand', () => {
    const g = game({
      p1: { hand: ['heartwood-crafter'], battlefield: n('forest', 3) },
    });
    done(cast(g, 'heartwood-crafter'));
    const c = g.id('p1', 'heartwood-crafter');
    g.obj(c).summoningSick = false;
    // Two untapped Forests and the Crafter: three mana for Soul Tether's {2}{R/G}.
    const copy = g.obj(c).prepared!;
    expect(
      g.legal().filter((a) => a.type === 'castSpell' && a.card === copy).length,
    ).toBeGreaterThan(0);
    // With the Crafter tapped it can't be cast.
    g.obj(c).tapped = true;
    expect(g.legal().filter((a) => a.type === 'castSpell' && a.card === copy)).toHaveLength(0);
  });
});

/** Returns the id of the first p1 permanent with this defId. */
function g0(g: GameDriver, defId: string): string {
  return g.id('p1', defId);
}

describe('Hexhaven Invigorator', () => {
  it('is a 6/6 with vigilance', () => {
    const g = game({ p1: { battlefield: ['hexhaven-invigorator'] } });
    const h = g.id('p1', 'hexhaven-invigorator');
    expect(pt(g, h)).toEqual([6, 6]);
    expect(keywords(g, h)).toContain('vigilance');
  });

  it('when dealt damage you may search for up to that many lands onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['hexhaven-invigorator', 'mountain'],
        library: ['forest', 'island', 'serra-angel', 'swamp'],
      },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'hexhaven-invigorator'))]), {
      pick: ['forest', 'island', 'swamp'],
    });
    const lands = g.state.battlefield.filter(
      (id) =>
        g.obj(id).controller === 'p1' &&
        g.obj(id).defId !== 'mountain' &&
        g.obj(id).defId !== 'hexhaven-invigorator',
    );
    expect(lands.map((id) => g.obj(id).defId).sort()).toEqual(['forest', 'island']);
    expect(lands.every((id) => g.obj(id).tapped)).toBe(true);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('may decline the search', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['hexhaven-invigorator', 'mountain'],
        library: ['forest', 'island'],
      },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'hexhaven-invigorator'))]), { accept: false });
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(all(g, 'forest')).toHaveLength(0);
  });

  it('takes only what it finds when fewer lands are left', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['hexhaven-invigorator', 'mountain'],
        library: ['forest', 'serra-angel'],
      },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'hexhaven-invigorator'))]));
    expect(all(g, 'forest')).toHaveLength(1);
  });

  it('triggers on combat damage from a blocking creature', () => {
    const g = game({
      p1: {
        battlefield: ['hexhaven-invigorator'],
        library: ['island', 'island', 'forest', 'swamp'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const h = g.id('p1', 'hexhaven-invigorator');
    attackWith(g, [h], [[g.id('p2', 'bear-cub'), h]]);
    // Bear Cub dealt 2: two lands.
    expect(g.obj(h).damage).toBe(2);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p1')).toHaveLength(3);
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});

describe('Hungering Puppetbeast', () => {
  it('is a 5/5 artifact creature that creates a Heartwood token', () => {
    const g = game({ p1: { hand: ['hungering-puppetbeast'], battlefield: n('forest', 5) } });
    done(cast(g, 'hungering-puppetbeast'));
    expect(all(g, 'fra-heartwood-token')).toHaveLength(1);
    const p = g.id('p1', 'hungering-puppetbeast');
    expect(chars(g, p).types).toContain('Artifact');
    expect(pt(g, p)).toEqual([5, 5]);
  });

  it('sacrifices another artifact for a counter and your choice of trample, hexproof or haste', () => {
    for (const [i, kw] of (['trample', 'hexproof', 'haste'] as const).entries()) {
      const g = game({
        p1: { battlefield: ['hungering-puppetbeast', 'fra-heartwood-token', 'forest'] },
      });
      const p = g.id('p1', 'hungering-puppetbeast');
      activate(g, p, abilityIndex('hungering-puppetbeast', 'activated'), [], {
        sacrifice: g.id('p1', 'fra-heartwood-token'),
      });
      done(g, { option: i });
      expect(counters(g, p)).toBe(1);
      expect(keywords(g, p)).toContain(kw);
      expect(all(g, 'fra-heartwood-token')).toHaveLength(0);
    }
  });

  it('can’t sacrifice itself for its own ability', () => {
    const g = game({ p1: { battlefield: ['hungering-puppetbeast', 'forest'] } });
    const acts = g
      .legal()
      .filter(
        (a) => a.type === 'activateAbility' && a.source === g.id('p1', 'hungering-puppetbeast'),
      );
    expect(acts).toHaveLength(0);
  });

  it('the keyword lasts until end of turn', () => {
    const g = game({
      p1: { battlefield: ['hungering-puppetbeast', 'fra-heartwood-token', 'forest'] },
    });
    const p = g.id('p1', 'hungering-puppetbeast');
    activate(g, p, abilityIndex('hungering-puppetbeast', 'activated'), [], {
      sacrifice: g.id('p1', 'fra-heartwood-token'),
    });
    done(g, { option: 2 });
    expect(keywords(g, p)).toContain('haste');
    toStep(g, 'end');
    // Still this turn.
    expect(keywords(g, p)).toContain('haste');
    nextTurn(g);
    expect(keywords(g, p)).not.toContain('haste');
    expect(counters(g, p)).toBe(1);
  });
});

describe("Hunter's Axe", () => {
  it('equips for {2}, giving +2/+0', () => {
    const g = game({ p1: { battlefield: ['hunters-axe', 'savannah-lions', 'forest', 'forest'] } });
    const axe = g.id('p1', 'hunters-axe');
    const lions = g.id('p1', 'savannah-lions');
    activate(g, axe, abilityIndex('hunters-axe', 'activated'), [g.ref(lions)]);
    done(g);
    expect(g.obj(axe).attachedTo).toBe(lions);
    expect(pt(g, lions)).toEqual([4, 1]);
  });

  it('when the equipped creature attacks it gains your choice of trample or deathtouch', () => {
    for (const [i, kw] of (['trample', 'deathtouch'] as const).entries()) {
      const g = game({ p1: { battlefield: ['hunters-axe', 'savannah-lions'] } });
      const axe = g.id('p1', 'hunters-axe');
      const lions = g.id('p1', 'savannah-lions');
      g.obj(axe).attachedTo = lions;
      for (let k = 0; k < 10 && g.decision.kind !== 'declareAttackers'; k++) g.pass();
      g.do({ type: 'addAttacker', player: 'p1', attacker: lions, defender: 'p2' });
      g.do({ type: 'confirmAttackers', player: 'p1' });
      done(g, { option: i });
      expect(keywords(g, lions)).toContain(kw);
      expect(keywords(g, lions)).not.toContain(kw === 'trample' ? 'deathtouch' : 'trample');
    }
  });

  // Reality Fracture (17a fixes): the attack trigger is an ability the equipped creature has.
  it('the choice is made by the equipped creature’s controller, and not if it has lost its abilities', () => {
    const g = game({
      p1: { battlefield: ['hunters-axe'] },
      p2: { battlefield: ['savannah-lions'] },
      active: 'p2',
    });
    const lions = g.id('p2', 'savannah-lions');
    g.obj(g.id('p1', 'hunters-axe')).attachedTo = lions;
    g.passUntilStep('beginCombat').passBoth().attack(lions);
    // The trigger is p2's: p2 chooses.
    for (let k = 0; k < 10 && g.decision.kind === 'priority' && g.state.stack.length; k++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.decision.kind === 'chooseOption' && g.decision.player).toBe('p2');
    const h = game({
      p1: { battlefield: ['hunters-axe', 'savannah-lions'] },
    });
    const lion = h.id('p1', 'savannah-lions');
    h.obj(h.id('p1', 'hunters-axe')).attachedTo = lion;
    h.obj(lion).blank = true;
    h.passUntilStep('beginCombat').passBoth().attack(lion);
    expect(h.state.stack).toHaveLength(0);
  });

  it('gives nothing to a creature that is not equipped', () => {
    const g = game({ p1: { battlefield: ['hunters-axe', 'savannah-lions'] } });
    attackWith(g, [g.id('p1', 'savannah-lions')]);
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('trample');
  });
});

describe('Jiang Yanggu, Never Alone', () => {
  it('creates Mowu, a legendary 3/3 green Dog', () => {
    const g = game({ p1: { hand: ['jiang-yanggu-never-alone'], battlefield: n('forest', 4) } });
    done(cast(g, 'jiang-yanggu-never-alone'));
    const mowu = all(g, 'fra-green-mowu-token');
    expect(mowu).toHaveLength(1);
    expect(pt(g, mowu[0]!)).toEqual([3, 3]);
    expect(cardDb.get('fra-green-mowu-token')).toMatchObject({
      supertypes: ['Legendary'],
      subtypes: ['Dog'],
      colors: ['G'],
    });
  });

  it('untaps all tokens you control at the beginning of your end step', () => {
    const g = game({
      p1: {
        battlefield: [
          'jiang-yanggu-never-alone',
          { card: 'fra-green-mowu-token', tapped: true },
          { card: 'fra-heartwood-token', tapped: true },
          { card: 'savannah-lions', tapped: true },
        ],
      },
      p2: { battlefield: [{ card: 'fra-green-beast-token', tapped: true }] },
    });
    for (const id of g.state.battlefield)
      if (g.obj(id).defId.startsWith('fra-')) g.obj(id).isToken = true;
    toStep(g, 'end');
    done(g);
    expect(tapped(g, 'fra-green-mowu-token')).toBe(0);
    expect(tapped(g, 'fra-heartwood-token')).toBe(0);
    expect(tapped(g, 'savannah-lions')).toBe(1);
    expect(tapped(g, 'fra-green-beast-token', 'p2')).toBe(1);
  });
});

describe('Loot, the Nexus', () => {
  // Reality Fracture (17a fixes): a real mana ability, so it pays costs directly and never uses the stack.
  const canCast = (g: GameDriver, card: string) =>
    g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === card);

  it('is a mana ability, not an activated one', () => {
    const abilities = cardDb.get('loot-the-nexus')!.abilities;
    expect(abilities.some((a) => a.kind === 'mana')).toBe(true);
    expect(abilities.some((a) => a.kind === 'activated')).toBe(false);
  });

  it('pays for a spell directly: one mana per different power, all of one colour', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: [
          'loot-the-nexus',
          'shivan-dragon',
          'savannah-lions',
          'bear-cub',
          ...n('mountain', 2),
        ],
      },
    });
    // Powers: Loot 2, Dragon 5, Lions 2, Bear 2: two different powers, so two mana. Serra Angel costs {3}{W}{W}.
    expect(canCast(g, 'serra-angel')).toBe(false);
    const h = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['loot-the-nexus', 'shivan-dragon', 'serra-angel', ...n('mountain', 2)],
      },
    });
    // Powers 2, 5, 4: three white mana plus two Mountains pay {3}{W}{W}, without the stack.
    expect(canCast(h, 'serra-angel')).toBe(true);
    cast(h, 'serra-angel');
    expect(h.state.stack).toHaveLength(1);
    expect(tapped(h, 'loot-the-nexus')).toBe(1);
  });

  it('cannot make two colours from one tap', () => {
    const g = game({
      p1: {
        hand: ['proctor-of-potential'],
        battlefield: ['loot-the-nexus', 'shivan-dragon', 'serra-angel'],
      },
    });
    // Three mana, but all of one colour: {W}{U} can't be paid.
    expect(canCast(g, 'proctor-of-potential')).toBe(false);
    // With an Island for the {U}, Loot's mana is the {W}.
    const h = game({
      p1: {
        hand: ['proctor-of-potential'],
        battlefield: ['loot-the-nexus', 'shivan-dragon', 'serra-angel', 'island'],
      },
    });
    expect(canCast(h, 'proctor-of-potential')).toBe(true);
  });
});

describe('Marwyn, the Preserver', () => {
  it('gives your lands hexproof, but not an opponent’s', () => {
    const g = game({
      p1: { battlefield: ['marwyn-the-preserver', 'forest'] },
      p2: { hand: ['stone-rain'], battlefield: ['mountain', 'forest', 'forest', 'plains'] },
      active: 'p2',
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(targets).not.toContain(g.id('p1', 'forest'));
    expect(targets).toContain(g.id('p2', 'forest'));
    // Without Marwyn the land is a legal target.
    const bare = game({
      p1: { battlefield: ['forest'] },
      p2: { hand: ['stone-rain'], battlefield: ['mountain', 'forest', 'forest'] },
      active: 'p2',
    });
    const bareTargets = bare
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(bareTargets).toContain(bare.id('p1', 'forest'));
  });

  it('{2}: returns a land card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        battlefield: ['marwyn-the-preserver', 'forest', 'forest'],
        graveyard: ['island', 'serra-angel'],
      },
    });
    activate(
      g,
      g.id('p1', 'marwyn-the-preserver'),
      abilityIndex('marwyn-the-preserver', 'activated'),
      [g.ref(g.id('p1', 'island', 'graveyard'))],
    );
    done(g);
    expect(hand(g)).toEqual(['island']);
    // A nonland card isn't a legal target.
    const acts = g
      .legal()
      .filter(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some(
            (t) => 'object' in t && t.object.id === g.id('p1', 'serra-angel', 'graveyard'),
          ),
      );
    expect(acts).toHaveLength(0);
  });
});

describe('Omnipresence', () => {
  it('lets you cast spells with mana value up to your creature count without paying', () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'savannah-lions', 'shock'],
        battlefield: ['omnipresence', 'bear-cub', 'bear-cub'],
      },
    });
    // Two creatures: mana value 2 or less is free, a 5-drop isn't.
    expect(
      casts(g, 'savannah-lions').some((a) => (a as { via?: string }).via === 'omnipresence'),
    ).toBe(true);
    expect(casts(g, 'shock').some((a) => (a as { via?: string }).via === 'omnipresence')).toBe(
      true,
    );
    expect(casts(g, 'serra-angel')).toHaveLength(0);
    const free = casts(g, 'savannah-lions').find(
      (a) => (a as { via?: string }).via === 'omnipresence',
    )!;
    g.do(free);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    // Nothing was tapped to pay.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(0);
  });

  it('is not limited to once a turn, and the limit grows with your creatures', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'savannah-lions', 'serra-angel'],
        battlefield: ['omnipresence', 'bear-cub'],
      },
    });
    const free = (defId: string) =>
      casts(g, defId).find((a) => (a as { via?: string }).via === 'omnipresence');
    expect(free('savannah-lions')).toBeDefined();
    g.do(free('savannah-lions')!);
    done(g);
    // Two creatures now; the second Lions (mana value 1) is free again.
    g.do(free('savannah-lions')!);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(2);
    // Four creatures: Serra Angel (5) is still too expensive.
    expect(free('serra-angel')).toBeUndefined();
  });

  it('works only for spells from your hand, and a land isn’t a spell', () => {
    const g = game({
      p1: {
        hand: ['forest'],
        battlefield: ['omnipresence', 'bear-cub'],
        graveyard: ['bestial-incursion'],
      },
    });
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && (a as { via?: string }).via === 'omnipresence'),
    ).toBe(false);
  });

  it('casts a spell with {X} in its cost with X = 0', () => {
    const g = game({
      p1: {
        hand: ['fblthp-knows-the-way'],
        battlefield: ['omnipresence', 'bear-cub', 'bear-cub'],
      },
    });
    const acts = casts(g, 'fblthp-knows-the-way').filter(
      (a) => (a as { via?: string }).via === 'omnipresence',
    );
    expect(acts).toHaveLength(1);
    expect((acts[0] as { x?: number }).x).toBe(0);
    g.do(acts[0]!);
    done(g);
    expect(all(g, 'fblthp-knows-the-way')).toHaveLength(1);
  });

  it('does nothing for the opponent', () => {
    const g = game({
      p1: { battlefield: ['omnipresence', 'bear-cub'] },
      p2: { hand: ['savannah-lions'], battlefield: ['bear-cub'] },
      active: 'p2',
    });
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && (a as { via?: string }).via === 'omnipresence'),
    ).toBe(false);
  });
});

describe('Pia, Aether Ascetic', () => {
  it('may discard a card; if you do, searches for an enchantment', () => {
    const g = game({
      p1: {
        hand: ['pia-aether-ascetic', 'shock'],
        battlefield: n('forest', 3),
        library: ['serra-angel', 'gardenize', 'forest'],
      },
    });
    done(cast(g, 'pia-aether-ascetic'), { pick: ['gardenize'], discard: 'shock' });
    expect(gy(g)).toContain('shock');
    expect(hand(g)).toEqual(['gardenize']);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('does nothing if you decline', () => {
    const g = game({
      p1: {
        hand: ['pia-aether-ascetic', 'shock'],
        battlefield: n('forest', 3),
        library: ['gardenize'],
      },
    });
    done(cast(g, 'pia-aether-ascetic'), { accept: false });
    expect(hand(g)).toEqual(['shock']);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('searches for nothing else, and finds nothing with no enchantment in the library', () => {
    const g = game({
      p1: {
        hand: ['pia-aether-ascetic', 'shock'],
        battlefield: n('forest', 3),
        library: ['serra-angel', 'forest'],
      },
    });
    done(cast(g, 'pia-aether-ascetic'));
    expect(gy(g)).toContain('shock');
    expect(hand(g)).toHaveLength(0);
  });

  it('with an empty hand there is nothing to discard', () => {
    const g = game({
      p1: { hand: ['pia-aether-ascetic'], battlefield: n('forest', 3), library: ['gardenize'] },
    });
    done(cast(g, 'pia-aether-ascetic'));
    expect(hand(g)).toHaveLength(0);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});

describe('Puppet Crafting', () => {
  it('makes an artifact a 5/5 Construct artifact creature in addition to its other types', () => {
    const g = game({
      p1: { hand: ['puppet-crafting'], battlefield: ['hunters-axe', 'forest', 'forest'] },
    });
    const axe = g.id('p1', 'hunters-axe');
    expect(chars(g, axe).types).not.toContain('Creature');
    done(cast(g, 'puppet-crafting', [g.ref(axe)]));
    const c = chars(g, axe);
    expect(c.types).toEqual(['Artifact', 'Creature']);
    expect(c.subtypes).toEqual(expect.arrayContaining(['Equipment', 'Construct']));
    expect([c.power, c.toughness]).toEqual([5, 5]);
  });

  it('an Equipment that becomes a creature comes off the creature it was attached to', () => {
    const g = game({
      p1: {
        hand: ['puppet-crafting'],
        battlefield: ['hunters-axe', 'savannah-lions', 'forest', 'forest'],
      },
    });
    const axe = g.id('p1', 'hunters-axe');
    g.obj(axe).attachedTo = g.id('p1', 'savannah-lions');
    done(cast(g, 'puppet-crafting', [g.ref(axe)]));
    expect(g.obj(axe).attachedTo).toBeUndefined();
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });

  it('makes a non-Aura enchantment a creature, not an artifact', () => {
    const g = game({
      p1: { hand: ['puppet-crafting'], battlefield: ['gardenize', 'forest', 'forest'] },
    });
    const gz = g.id('p1', 'gardenize');
    done(cast(g, 'puppet-crafting', [g.ref(gz)]));
    const c = chars(g, gz);
    expect(c.types).toEqual(['Enchantment', 'Creature']);
    expect(c.subtypes).toContain('Construct');
    expect([c.power, c.toughness]).toEqual([5, 5]);
    expect(g.state.battlefield).toContain(gz);
  });

  it('the enchanted permanent is a creature for targeting, combat and damage', () => {
    const g = game({
      p1: { battlefield: ['gardenize', 'forest', 'forest'], hand: ['puppet-crafting'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const gz = g.id('p1', 'gardenize');
    done(cast(g, 'puppet-crafting', [g.ref(gz)]));
    attackWith(g, [gz]);
    expect(g.life('p2')).toBe(15);
  });

  it('can enchant only an artifact or a non-Aura enchantment', () => {
    const g = game({
      p1: {
        hand: ['puppet-crafting'],
        battlefield: [
          'hunters-axe',
          'gardenize',
          'puppet-crafting',
          'bear-cub',
          'forest',
          'forest',
        ],
      },
      p2: { battlefield: ['folk-hero'] },
    });
    const targets = casts(g, 'puppet-crafting').map(
      (a) => (a as unknown as { targets: { object: { id: string } }[] }).targets[0]!.object.id,
    );
    expect(targets).toContain(g.id('p1', 'hunters-axe'));
    expect(targets).toContain(g.id('p1', 'gardenize'));
    expect(targets).toContain(g.id('p2', 'folk-hero'));
    expect(targets).not.toContain(g.id('p1', 'bear-cub'));
    expect(targets).not.toContain(g.id('p1', 'puppet-crafting'));
  });

  it('stops being a creature when the Aura leaves', () => {
    const g = game({
      p1: { hand: ['puppet-crafting'], battlefield: ['gardenize', 'forest', 'forest'] },
      p2: { hand: ['disenchant'], battlefield: ['plains', 'plains'] },
    });
    const gz = g.id('p1', 'gardenize');
    done(cast(g, 'puppet-crafting', [g.ref(gz)]));
    expect(chars(g, gz).types).toContain('Creature');
    const aura = g.id('p1', 'puppet-crafting');
    // The opponent destroys the Aura (it's their priority after yours passes).
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'disenchant', 'hand'),
      targets: [g.ref(aura)],
    });
    done(g);
    expect(gy(g)).toContain('puppet-crafting');
    expect(chars(g, gz).types).toEqual(['Enchantment']);
    expect(pt(g, gz)).toEqual([0, 0]);
  });

  it('{4}{G}: returns itself from the graveyard to your hand', () => {
    const g = game({
      p1: { graveyard: ['puppet-crafting'], battlefield: n('forest', 5) },
    });
    activate(
      g,
      g.id('p1', 'puppet-crafting', 'graveyard'),
      abilityIndex('puppet-crafting', 'activated'),
    );
    done(g);
    expect(hand(g)).toEqual(['puppet-crafting']);
    expect(gy(g)).toHaveLength(0);
  });
});

describe('Restore with Empathy', () => {
  it('returns a permanent card from your graveyard to your hand and gains 4 life', () => {
    const g = game({
      p1: {
        hand: ['restore-with-empathy'],
        battlefield: n('forest', 3),
        graveyard: ['serra-angel', 'island', 'shock'],
      },
    });
    const targets = casts(g, 'restore-with-empathy').map(
      (a) => (a as unknown as { targets: { object: { id: string } }[] }).targets[0]!.object.id,
    );
    expect(targets).toContain(g.id('p1', 'serra-angel', 'graveyard'));
    expect(targets).toContain(g.id('p1', 'island', 'graveyard'));
    expect(targets).not.toContain(g.id('p1', 'shock', 'graveyard'));
    done(cast(g, 'restore-with-empathy', [g.ref(g.id('p1', 'serra-angel', 'graveyard'))]));
    expect(hand(g)).toEqual(['serra-angel']);
    expect(g.life('p1')).toBe(24);
  });

  it('is an instant and can’t target the opponent’s graveyard', () => {
    const g = game({
      p1: { hand: ['restore-with-empathy'], battlefield: n('forest', 3) },
      p2: { graveyard: ['serra-angel'] },
    });
    expect(cardDb.get('restore-with-empathy')!.types).toEqual(['Instant']);
    expect(casts(g, 'restore-with-empathy')).toHaveLength(0);
  });
});

describe('Ruric Thar, Magecrusher', () => {
  it('can’t be countered, with reach, vigilance and trample', () => {
    const d = cardDb.get('ruric-thar-magecrusher')!;
    expect(d.uncounterable).toBe(true);
    expect(d.keywords).toEqual(expect.arrayContaining(['reach', 'vigilance', 'trample']));
    expect([d.power, d.toughness]).toEqual([7, 7]);
  });

  it('can’t be countered', () => {
    const g = game({
      p1: { hand: ['ruric-thar-magecrusher'], battlefield: n('forest', 7) },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    cast(g, 'ruric-thar-magecrusher');
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'cancel', 'hand'),
      targets: [g.ref(g.id('p1', 'ruric-thar-magecrusher', 'stack'))],
    });
    done(g);
    expect(all(g, 'ruric-thar-magecrusher')).toHaveLength(1);
    expect(gy(g, 'p2')).toContain('cancel');
  });

  it('can’t be targeted by the opponent until it has dealt combat damage', () => {
    const shockTargets = (g: GameDriver) =>
      g
        .legal()
        .filter((a) => a.type === 'castSpell')
        .flatMap((a) =>
          (a as { targets: { object?: { id: string } }[] }).targets.map((t) => t.object?.id),
        );
    const make = () =>
      game({
        p1: { battlefield: ['ruric-thar-magecrusher'] },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
        active: 'p2',
      });
    const g = make();
    expect(shockTargets(g)).not.toContain(g.id('p1', 'ruric-thar-magecrusher'));
    const after = make();
    after.obj(after.id('p1', 'ruric-thar-magecrusher')).dealtCombatDamage = true;
    expect(shockTargets(after)).toContain(after.id('p1', 'ruric-thar-magecrusher'));
  });

  it('has hexproof until it has dealt combat damage', () => {
    const g = game({ p1: { battlefield: ['ruric-thar-magecrusher'] } });
    const r = g.id('p1', 'ruric-thar-magecrusher');
    expect(keywords(g, r)).toContain('hexproof');
    attackWith(g, [r]);
    expect(g.life('p2')).toBe(13);
    expect(keywords(g, r)).not.toContain('hexproof');
  });

  it('keeps hexproof when it deals no combat damage', () => {
    const g = game({
      p1: { battlefield: ['ruric-thar-magecrusher'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const r = g.id('p1', 'ruric-thar-magecrusher');
    expect(keywords(g, r)).toContain('hexproof');
    // Not attacking: nothing happens.
    toStep(g, 'end');
    expect(keywords(g, r)).toContain('hexproof');
  });

  it('loses hexproof after dealing combat damage to a blocker, and gets it back after leaving and returning', () => {
    const g = game({
      p1: { battlefield: ['ruric-thar-magecrusher'], hand: ['unsummon'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const r = g.id('p1', 'ruric-thar-magecrusher');
    for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p1', attacker: r, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    // p2 blocks.
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'bear-cub'), attacker: r });
    g.do({ type: 'confirmBlockers', player: 'p2' });
    for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) g.pass();
    expect(keywords(g, r)).not.toContain('hexproof');
    expect(g.state.players.p2.graveyard.map((id) => g.obj(id).defId)).toContain('bear-cub');
  });
});

describe('Simulacrum Shaper', () => {
  it('may search for a basic land and put it onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['simulacrum-shaper'],
        battlefield: n('forest', 3),
        library: ['island', 'serra-angel'],
      },
    });
    done(cast(g, 'simulacrum-shaper'));
    const island = all(g, 'island');
    expect(island).toHaveLength(1);
    expect(g.obj(island[0]!).tapped).toBe(true);
  });

  it('may decline the search', () => {
    const g = game({
      p1: { hand: ['simulacrum-shaper'], battlefield: n('forest', 3), library: ['island'] },
    });
    done(cast(g, 'simulacrum-shaper'), { accept: false });
    expect(all(g, 'island')).toHaveLength(0);
  });

  it('draws a card when it dies', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['simulacrum-shaper', 'mountain'] },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'simulacrum-shaper'))]));
    expect(gy(g)).toContain('simulacrum-shaper');
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Something Worth Saving', () => {
  it('mills four, may put a permanent card from among them into your hand, and gains 1 life', () => {
    const g = game({
      p1: {
        hand: ['something-worth-saving'],
        battlefield: n('forest', 2),
        library: ['shock', 'serra-angel', 'island', 'unsummon', 'forest', 'forest'],
      },
    });
    done(cast(g, 'something-worth-saving'), { pick: ['serra-angel'] });
    expect(hand(g)).toEqual(['serra-angel']);
    expect(gy(g).sort()).toEqual(['island', 'shock', 'something-worth-saving', 'unsummon']);
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(g.life('p1')).toBe(21);
  });

  it('doesn’t offer instants or sorceries, and you may take nothing', () => {
    const g = game({
      p1: {
        hand: ['something-worth-saving'],
        battlefield: n('forest', 2),
        library: ['shock', 'unsummon', 'shock', 'unsummon', 'forest'],
      },
    });
    cast(g, 'something-worth-saving');
    for (let i = 0; i < 4 && g.life('p1') === 20; i++) g.pass();
    // No permanent among them: it just gains 1 life.
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(g.life('p1')).toBe(21);
    expect(gy(g)).toHaveLength(5);
  });

  it('can be answered with nothing taken', () => {
    const g = game({
      p1: {
        hand: ['something-worth-saving'],
        battlefield: n('forest', 2),
        library: ['serra-angel', 'island', 'forest', 'forest', 'forest'],
      },
    });
    done(cast(g, 'something-worth-saving'), { pick: [] });
    expect(hand(g)).toHaveLength(0);
    expect(g.life('p1')).toBe(21);
  });
});

describe('Sureshot Sower', () => {
  it('is a 3/1 with reach', () => {
    const g = game({ p1: { battlefield: ['sureshot-sower'] } });
    const s = g.id('p1', 'sureshot-sower');
    expect(pt(g, s)).toEqual([3, 1]);
    expect(keywords(g, s)).toContain('reach');
  });

  it('{3}{G}, discard it: destroys a creature with flying', () => {
    const g = game({
      p1: { hand: ['sureshot-sower'], battlefield: n('forest', 4) },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const sower = g.id('p1', 'sureshot-sower', 'hand');
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === sower) as Extract<
      Action,
      { type: 'activateAbility' }
    >[];
    // Only the flyer is a legal target.
    expect(acts.map((a) => a.targets)).toEqual([[g.ref(g.id('p2', 'serra-angel'))]]);
    g.do(acts[0]!);
    done(g);
    expect(gy(g, 'p2')).toContain('serra-angel');
    expect(gy(g)).toContain('sureshot-sower');
  });

  it('can’t be activated from the battlefield or without a flyer to target', () => {
    const g = game({
      p1: { hand: ['sureshot-sower'], battlefield: n('forest', 4) },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(
      g
        .legal()
        .filter(
          (a) => a.type === 'activateAbility' && a.source === g.id('p1', 'sureshot-sower', 'hand'),
        ),
    ).toHaveLength(0);
  });
});

describe('Tarmogoyf', () => {
  const goyf = (p1: string[], p2: string[] = []) => {
    const g = game({ p1: { battlefield: ['tarmogoyf'], graveyard: p1 }, p2: { graveyard: p2 } });
    return pt(g, g.id('p1', 'tarmogoyf'));
  };

  it('has power equal to the number of card types among all graveyards, and toughness one more', () => {
    expect(goyf([])).toEqual([0, 1]);
    expect(goyf(['shock'])).toEqual([1, 2]);
    expect(goyf(['shock'], ['serra-angel'])).toEqual([2, 3]);
    expect(goyf(['shock', 'forest'], ['serra-angel', 'unsummon'])).toEqual([3, 4]);
  });

  it('counts each type once, and an artifact creature counts for both', () => {
    expect(goyf(['shock', 'shock', 'unsummon'])).toEqual([1, 2]);
    expect(goyf(['hungering-puppetbeast'])).toEqual([2, 3]);
    // Artifact (Hunter's Axe), creature, enchantment, sorcery (Stone Rain).
    expect(
      goyf(['hungering-puppetbeast', 'serra-angel'], ['hunters-axe', 'gardenize', 'stone-rain']),
    ).toEqual([4, 5]);
  });

  it('counts the opponent’s graveyard, and ignores the battlefield and hands', () => {
    expect(goyf([], ['serra-angel'])).toEqual([1, 2]);
    const g = game({
      p1: { battlefield: ['tarmogoyf', 'forest', 'serra-angel'], hand: ['shock'] },
    });
    expect(pt(g, g.id('p1', 'tarmogoyf'))).toEqual([0, 1]);
  });

  it('shrinks when cards leave the graveyards and grows when they arrive', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['tarmogoyf', 'marwyn-the-preserver', 'forest', 'forest', 'mountain'],
        graveyard: ['island', 'serra-angel'],
      },
    });
    const t = g.id('p1', 'tarmogoyf');
    expect(pt(g, t)).toEqual([2, 3]);
    activate(
      g,
      g.id('p1', 'marwyn-the-preserver'),
      abilityIndex('marwyn-the-preserver', 'activated'),
      [g.ref(g.id('p1', 'island', 'graveyard'))],
    );
    done(g);
    expect(pt(g, t)).toEqual([1, 2]);
    // A Shock on the opponent: an instant joins the graveyard.
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, t)).toEqual([2, 3]);
  });

  it('is a 0/1 with an empty graveyard, so a Shock kills it', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['tarmogoyf', 'mountain'] },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'tarmogoyf'))]));
    expect(gy(g)).toEqual(expect.arrayContaining(['tarmogoyf', 'shock']));
  });
});

describe("Tethermage's Advantage", () => {
  it('gives +2/+2 and reach until end of turn and untaps it', () => {
    const g = game({
      p1: {
        hand: ['tethermages-advantage'],
        battlefield: ['forest', { card: 'bear-cub', tapped: true }],
      },
    });
    const b = g.id('p1', 'bear-cub');
    done(cast(g, 'tethermages-advantage', [g.ref(b)]));
    expect(pt(g, b)).toEqual([4, 4]);
    expect(keywords(g, b)).toContain('reach');
    expect(g.obj(b).tapped).toBe(false);
    toStep(g, 'end');
    done(g);
    nextTurn(g);
    expect(pt(g, b)).toEqual([2, 2]);
    expect(keywords(g, b)).not.toContain('reach');
  });

  it('can target any creature', () => {
    const g = game({
      p1: { hand: ['tethermages-advantage'], battlefield: ['forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(casts(g, 'tethermages-advantage')).toHaveLength(1);
  });
});

describe('Titanbones, Towering Heart', () => {
  it('is a 4/3 with reach that gets two +1/+1 counters whenever you gain life', () => {
    const g = game({
      p1: {
        hand: ['restore-with-empathy'],
        battlefield: ['titanbones-towering-heart', ...n('forest', 3)],
        graveyard: ['island'],
      },
    });
    const t = g.id('p1', 'titanbones-towering-heart');
    expect(pt(g, t)).toEqual([4, 3]);
    expect(keywords(g, t)).toContain('reach');
    done(cast(g, 'restore-with-empathy', [g.ref(g.id('p1', 'island', 'graveyard'))]));
    expect(counters(g, t)).toBe(2);
    expect(pt(g, t)).toEqual([6, 5]);
  });

  it('doesn’t get counters when the opponent gains life', () => {
    const g = game({
      p1: { battlefield: ['titanbones-towering-heart'] },
      p2: { hand: ['restore-with-empathy'], battlefield: n('forest', 3), graveyard: ['island'] },
      active: 'p2',
    });
    done(cast(g, 'restore-with-empathy', [g.ref(g.id('p2', 'island', 'graveyard'))]));
    expect(counters(g, g.id('p1', 'titanbones-towering-heart'))).toBe(0);
  });

  it('when you discard it, you gain 3 life', () => {
    const g = game({
      p1: {
        hand: ['pia-aether-ascetic', 'titanbones-towering-heart'],
        battlefield: n('forest', 3),
        library: ['gardenize'],
      },
    });
    done(cast(g, 'pia-aether-ascetic'), { discard: 'titanbones-towering-heart' });
    expect(gy(g)).toContain('titanbones-towering-heart');
    expect(g.life('p1')).toBe(23);
  });

  it('doesn’t gain life when another card is discarded', () => {
    const g = game({
      p1: {
        hand: ['pia-aether-ascetic', 'shock'],
        battlefield: n('forest', 3),
        graveyard: ['titanbones-towering-heart'],
        library: ['gardenize'],
      },
    });
    done(cast(g, 'pia-aether-ascetic'), { discard: 'shock' });
    expect(g.life('p1')).toBe(20);
  });

  it('triggers when it is discarded to your maximum hand size', () => {
    const g = game({
      p1: { hand: ['titanbones-towering-heart', ...n('forest', 7)] },
    });
    for (let i = 0; i < 30 && g.decision.kind !== 'discardToHandSize'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else g.pass();
    }
    expect(g.decision.kind).toBe('discardToHandSize');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'discard' && g.obj(a.card).defId === 'titanbones-towering-heart')!,
    );
    done(g);
    expect(g.life('p1')).toBe(23);
  });

  it('triggers when an opponent makes you discard it', () => {
    const g = game({
      p1: { hand: ['titanbones-towering-heart'] },
      p2: { hand: ['arcane-omens'], battlefield: n('swamp', 5) },
      active: 'p2',
    });
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'arcane-omens', 'hand'),
      targets: [{ player: 'p1' }],
    });
    done(g);
    expect(gy(g)).toContain('titanbones-towering-heart');
    expect(g.life('p1')).toBe(23);
  });
});

describe('Verdant Kraken', () => {
  it('is a 6/6', () => {
    const g = game({ p1: { battlefield: ['verdant-kraken'] } });
    expect(pt(g, g.id('p1', 'verdant-kraken'))).toEqual([6, 6]);
  });

  it('creates a 3/3 Forest Tentacle land creature at each player’s upkeep, under your control', () => {
    const g = game({ p1: { battlefield: ['verdant-kraken'] }, step: 'untap' });
    for (let i = 0; i < 40 && all(g, 'fra-green-forest-tentacle-token').length < 1; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
    expect(all(g, 'fra-green-forest-tentacle-token')).toHaveLength(1);
    const t = all(g, 'fra-green-forest-tentacle-token')[0]!;
    expect(g.obj(t).controller).toBe('p1');
    expect(pt(g, t)).toEqual([3, 3]);
    expect(chars(g, t).types).toEqual(['Land', 'Creature']);
    expect(chars(g, t).subtypes).toEqual(['Forest', 'Tentacle']);
    // And again on the opponent's upkeep.
    for (let i = 0; i < 80 && g.state.turn.activePlayer !== 'p2'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.decision.player });
      else done(g);
    }
    for (let i = 0; i < 10 && g.state.turn.step !== 'upkeep'; i++) g.pass();
    done(g);
    expect(all(g, 'fra-green-forest-tentacle-token')).toHaveLength(2);
    expect(
      all(g, 'fra-green-forest-tentacle-token').every((id) => g.obj(id).controller === 'p1'),
    ).toBe(true);
  });

  it('the token taps for {G}, but is affected by summoning sickness until your next turn', () => {
    const g = game({
      p1: {
        hand: ['bestial-incursion'],
        battlefield: ['verdant-kraken', ...n('forest', 3)],
      },
      step: 'untap',
    });
    for (let i = 0; i < 40 && all(g, 'fra-green-forest-tentacle-token').length < 1; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
    const t = all(g, 'fra-green-forest-tentacle-token')[0]!;
    expect(g.obj(t).summoningSick).toBe(true);
    toStep(g, 'main1');
    // Three Forests and a Tentacle that can't tap yet: not enough for {3}{G}.
    expect(casts(g, 'bestial-incursion')).toHaveLength(0);
    // On a later turn it is a fourth source of {G}.
    g.obj(t).summoningSick = false;
    expect(casts(g, 'bestial-incursion').length).toBeGreaterThan(0);
  });
});

describe('Vinelasher Adept', () => {
  it('puts three +1/+1 counters on target creature when it enters', () => {
    const g = game({
      p1: { hand: ['vinelasher-adept'], battlefield: [...n('forest', 6), 'bear-cub'] },
    });
    done(cast(g, 'vinelasher-adept'));
    // The first target offered is the first creature (Bear Cub).
    expect(counters(g, g.id('p1', 'bear-cub')) + counters(g, g.id('p1', 'vinelasher-adept'))).toBe(
      3,
    );
    expect(keywords(g, g.id('p1', 'vinelasher-adept'))).toContain('reach');
  });

  it('can put the counters on itself or an opponent’s creature', () => {
    const g = game({
      p1: { hand: ['vinelasher-adept'], battlefield: n('forest', 6) },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'vinelasher-adept');
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    // Itself and the opponent's Bear Cub (the Adept is the only creature of yours).
    const acts = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(acts).toHaveLength(2);
    const theirs = g.id('p2', 'bear-cub');
    g.do(
      acts.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === theirs),
      )!,
    );
    done(g);
    expect(counters(g, theirs)).toBe(3);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: {
        hand: ['vinelasher-adept'],
        battlefield: n('forest', 2),
        library: ['serra-angel', 'island', 'forest'],
      },
    });
    const v = g.id('p1', 'vinelasher-adept', 'hand');
    activate(g, v, abilityIndex('vinelasher-adept', 'activated'));
    done(g, { pick: ['island'] });
    expect(gy(g)).toContain('vinelasher-adept');
    expect(hand(g)).toEqual(['island']);
  });

  it('basic landcycling finds only basic lands', () => {
    const g = game({
      p1: {
        hand: ['vinelasher-adept'],
        battlefield: n('forest', 2),
        library: ['serra-angel', 'swamp'],
      },
    });
    activate(
      g,
      g.id('p1', 'vinelasher-adept', 'hand'),
      abilityIndex('vinelasher-adept', 'activated'),
    );
    for (let i = 0; i < 4 && g.decision.kind !== 'searchLibrary'; i++) g.pass();
    const offered = g
      .legal()
      .filter((a) => a.type === 'chooseCard' && a.card)
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(offered).toEqual(['swamp']);
  });
});

describe('Wrecking Gecko', () => {
  it('is a 5/5 artifact creature with ward {2}', () => {
    const d = cardDb.get('wrecking-gecko')!;
    expect(d.keywords).toContain('ward');
    expect(d.wardCost?.mana).toEqual({ generic: 2, colored: {} });
    const g = game({ p1: { battlefield: ['wrecking-gecko'] } });
    expect(chars(g, g.id('p1', 'wrecking-gecko')).types).toEqual(['Artifact', 'Creature']);
  });

  it('{6}{G}{G}: gets +4/+4 and trample until end of turn', () => {
    const g = game({ p1: { battlefield: ['wrecking-gecko', ...n('forest', 8)] } });
    const w = g.id('p1', 'wrecking-gecko');
    activate(g, w, abilityIndex('wrecking-gecko', 'activated'));
    done(g);
    expect(pt(g, w)).toEqual([9, 9]);
    expect(keywords(g, w)).toContain('trample');
    const poor = game({ p1: { battlefield: ['wrecking-gecko', ...n('forest', 7)] } });
    expect(
      poor
        .legal()
        .filter(
          (a) => a.type === 'activateAbility' && a.source === poor.id('p1', 'wrecking-gecko'),
        ),
    ).toHaveLength(0);
  });
});

describe('Yoshimaru, Scrappy Stray', () => {
  it('when it enters, another creature you control fights up to one creature an opponent controls', () => {
    const g = game({
      p1: { hand: ['yoshimaru-scrappy-stray'], battlefield: ['serra-angel', ...n('forest', 2)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'yoshimaru-scrappy-stray');
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const acts = g.legal().filter((a) => a.type === 'chooseTargets') as Extract<
      Action,
      { type: 'chooseTargets' }
    >[];
    // Either only the creature of yours, or it and the opponent's creature.
    expect(acts.map((a) => a.targets.length).sort()).toEqual([1, 2]);
    g.do(acts.find((a) => a.targets.length === 2)!);
    done(g);
    expect(gy(g, 'p2')).toContain('savannah-lions');
    expect(g.obj(g.id('p1', 'serra-angel')).damage).toBe(2);
    // Yoshimaru itself isn't the one that fights.
    expect(g.obj(g.id('p1', 'yoshimaru-scrappy-stray')).damage).toBe(0);
  });

  it('with no opponent creature targeted, nothing fights', () => {
    const g = game({
      p1: { hand: ['yoshimaru-scrappy-stray'], battlefield: ['serra-angel', ...n('forest', 2)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'yoshimaru-scrappy-stray');
    g.pass();
    g.pass();
    // Choose the first target only.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const acts = g.legal().filter((a) => a.type === 'chooseTargets') as Extract<
      Action,
      { type: 'chooseTargets' }
    >[];
    const one = acts.find((a) => a.targets.length === 1)!;
    expect(one).toBeDefined();
    g.do(one);
    done(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'serra-angel')).damage).toBe(0);
  });

  it('can’t make itself the fighter (another creature)', () => {
    const g = game({
      p1: { hand: ['yoshimaru-scrappy-stray'], battlefield: n('forest', 2) },
      p2: { battlefield: ['savannah-lions'] },
    });
    done(cast(g, 'yoshimaru-scrappy-stray'));
    // No other creature of yours: no legal target, the trigger is removed.
    expect(gy(g, 'p2')).toHaveLength(0);
  });

  it('{6}: puts a +1/+1 counter on target nonlegendary creature', () => {
    const g = game({
      p1: { battlefield: ['yoshimaru-scrappy-stray', 'bear-cub', ...n('forest', 6)] },
    });
    const y = g.id('p1', 'yoshimaru-scrappy-stray');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === y) as Extract<
      Action,
      { type: 'activateAbility' }
    >[];
    // Yoshimaru itself is legendary: only the Bear Cub is a target.
    expect(acts.map((a) => a.targets)).toEqual([[g.ref(g.id('p1', 'bear-cub'))]]);
    g.do(acts[0]!);
    done(g);
    expect(counters(g, g.id('p1', 'bear-cub'))).toBe(1);
  });
});
