import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Reality Fracture 17a: the white cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const lib = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  all(g, defId).filter((id) => !p || g.obj(id).controller === p);

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
  /** Surveil/scry: send these cards (defIds) to the bottom/graveyard. */
  bin?: string[];
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
    else if (d.kind === 'scry') {
      const bin = opts.bin ?? [];
      const bottom = d.cards.filter((id) => bin.includes(g.obj(id).defId));
      g.do({
        type: 'scry',
        player: d.player,
        top: d.cards.filter((id) => !bottom.includes(id)),
        bottom,
      });
    } else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseCard'))
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
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

/** A scenario planeswalker starts with no loyalty counters and would die: give it some. */
const loyal = (g: GameDriver, p: 'p1' | 'p2', defId: string, loyalty = 5) => {
  const id = g.id(p, defId);
  g.obj(id).counters = { loyalty };
  return id;
};

/** The index of the first ability of a card that matches. */
const abilityIndex = (defId: string, kind: 'activated' | 'triggered') =>
  cardDb.get(defId)!.abilities.findIndex((a) => a.kind === kind);

/** Can this player cast this card (any targets) right now? */
const canCast = (g: GameDriver, p: 'p1' | 'p2', card: string) =>
  g.engine.getLegalActions(g.state, p).some((a) => a.type === 'castSpell' && a.card === card);

/** Picks the chooseTargets action for a given mode (with targets). */
const mode = (m: number) => (legal: Action[]) =>
  legal.find((a) => a.type === 'chooseTargets' && a.mode === m && a.targets.length > 0);

describe('the white group is registered', () => {
  const names = [
    'Blossom-Blessed Angel',
    'Danitha, Sword of Hope',
    'Enlightened Confidant',
    'Fateshaper Aspirant',
    'Flickering Hound',
    'Generous Revival',
    'Germinate Recruits',
    'Ghalta the Immovable',
    "Gideon's Memorial",
    'Graft Surgeon',
    'Guiding Hydra',
    'Kindred Judgment',
    'Koth of the Homestead',
    'Liliana the Faultless',
    'Loyal Tutor',
    'Lyra, Archangel of Dawn',
    'Memory Trap',
    'Predictive Preparations',
    'Prophesied End',
    'Refute Destiny',
    'Rescue Girl, First Responder',
    'Return to the Light Realms',
    'Saheeli, Consul of Oversight',
    'Shatterwing Pegasus',
    'Surgical Precision',
    'Thalia, the Survivor',
    'Unflinching Hortimancer',
    'Yoshimaru, Beloved Companion',
    'Your Fate Ends Here',
    'Yuriko, Blade of the Mighty',
  ];
  it('has behaviour and a card for each of the 30 names', () => {
    expect(names).toHaveLength(30);
    for (const name of names) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Blossom-Blessed Angel // Seed Suture', () => {
  it('has flying and vigilance and enters prepared; Seed Suture adds a counter and gains 1', () => {
    const g = game({
      p1: { hand: ['blossom-blessed-angel'], battlefield: [...n('plains', 5), 'savannah-lions'] },
    });
    done(cast(g, 'blossom-blessed-angel'));
    const angel = g.id('p1', 'blossom-blessed-angel');
    expect([...keywords(g, angel)]).toEqual(expect.arrayContaining(['flying', 'vigilance']));
    expect(pt(g, angel)).toEqual([2, 4]);
    expect(g.obj(angel).prepared).toBeDefined();
    expect(cardDb.get('seed-suture-blossom-blessed-angel')!.manaCost.hybrid).toEqual([['G', 'W']]);
    const lion = g.id('p1', 'savannah-lions');
    castCopy(g, angel, [g.ref(lion)]);
    done(g);
    expect(counters(g, lion)).toBe(1);
    expect(g.life('p1')).toBe(21);
    expect(g.obj(angel).prepared).toBeUndefined();
  });
});

describe('Danitha, Sword of Hope', () => {
  it('has first strike; the first Equipment spell or spell targeting your creature each turn draws', () => {
    const g = game({
      p1: {
        hand: ['pirates-cutlass', 'predictive-preparations'],
        battlefield: [...n('plains', 6), 'danitha-sword-of-hope', 'savannah-lions'],
        library: ['forest', 'forest', 'forest'],
      },
    });
    expect(keywords(g, g.id('p1', 'danitha-sword-of-hope')).has('firstStrike')).toBe(true);
    done(cast(g, 'pirates-cutlass'));
    expect(hand(g)).toEqual(['predictive-preparations', 'forest']);
    // A second qualifying spell the same turn doesn't draw again.
    done(cast(g, 'predictive-preparations', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(hand(g)).toEqual(['forest']);
  });

  it('draws for a spell that targets your creature, but not one that targets theirs', () => {
    const g = game({
      p1: {
        hand: ['predictive-preparations', 'predictive-preparations'],
        battlefield: [...n('plains', 4), 'danitha-sword-of-hope', 'savannah-lions'],
        library: ['forest', 'forest'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    done(cast(g, 'predictive-preparations', [g.ref(g.id('p2', 'savannah-lions'))]));
    expect(hand(g)).toEqual(['predictive-preparations']);
    done(cast(g, 'predictive-preparations', [g.ref(g.id('p1', 'savannah-lions'))]));
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Enlightened Confidant', () => {
  it('has lifelink', () => {
    const g = game({ p1: { battlefield: ['enlightened-confidant'] } });
    expect(keywords(g, g.id('p1', 'enlightened-confidant')).has('lifelink')).toBe(true);
  });

  const endStep = (library: string[], gain: boolean) => {
    const g = game({
      p1: {
        hand: ['surgical-precision'],
        battlefield: [...n('plains', 2), 'enlightened-confidant'],
        library,
      },
    });
    if (gain) done(cast(g, 'surgical-precision', [], { mode: 1 }));
    return g;
  };

  it('surveils at your end step if you gained life; a card with mana value up to the life gained goes to hand', () => {
    const g = endStep(['savannah-lions', 'forest', 'forest', 'forest'], true);
    expect(g.life('p1')).toBe(22);
    g.passUntilStep('end');
    // Draw from Surgical Precision took the lions; the top is now a Forest (mana value 0 <= 2).
    done(g, { bin: ['forest'] });
    expect(hand(g)).toContain('forest');
    expect(gy(g)).not.toContain('forest');
  });

  it('a card with mana value greater than the life gained stays in the graveyard', () => {
    const g = endStep(['forest', 'serra-angel', 'forest', 'forest'], true);
    g.passUntilStep('end');
    done(g, { bin: ['serra-angel'] });
    expect(gy(g)).toContain('serra-angel');
    expect(hand(g)).not.toContain('serra-angel');
  });

  it('the limit is the life gained this turn: mana value 2 returns, mana value 3 does not', () => {
    const cheap = endStep(['forest', 'felidar-cub', 'forest'], true);
    cheap.passUntilStep('end');
    done(cheap, { bin: ['felidar-cub'] });
    expect(hand(cheap)).toContain('felidar-cub');
    const dear = endStep(['forest', 'inspiring-paladin', 'forest'], true);
    dear.passUntilStep('end');
    done(dear, { bin: ['inspiring-paladin'] });
    expect(hand(dear)).not.toContain('inspiring-paladin');
    expect(gy(dear)).toContain('inspiring-paladin');
  });

  it('a card kept on top is not put into the graveyard, so nothing returns', () => {
    const g = endStep(['forest', 'savannah-lions', 'forest'], true);
    g.passUntilStep('end');
    done(g);
    expect(lib(g)[0]).toBe('savannah-lions');
    expect(gy(g)).toEqual(['surgical-precision']);
  });

  it("does nothing if you didn't gain life", () => {
    const g = endStep(['savannah-lions', 'forest'], false);
    g.passUntilStep('end');
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(lib(g)[0]).toBe('savannah-lions');
  });
});

describe('Fateshaper Aspirant', () => {
  it('returns a target legendary card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        hand: ['fateshaper-aspirant'],
        battlefield: n('plains', 5),
        graveyard: ['jazal-goldmane', 'savannah-lions'],
      },
    });
    settle(cast(g, 'fateshaper-aspirant'), mode(0));
    expect(hand(g)).toEqual(['jazal-goldmane']);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('puts a +1/+1 counter on a creature, which gains vigilance and indestructible until end of turn', () => {
    const g = game({
      p1: { hand: ['fateshaper-aspirant'], battlefield: [...n('plains', 5), 'savannah-lions'] },
    });
    const lion = g.id('p1', 'savannah-lions');
    settle(cast(g, 'fateshaper-aspirant'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.mode === 1 &&
          a.targets.some((t) => 'object' in t && t.object.id === lion),
      ),
    );
    expect(counters(g, lion)).toBe(1);
    expect(keywords(g, lion).has('vigilance')).toBe(true);
    expect(keywords(g, lion).has('indestructible')).toBe(true);
    g.passUntilStep('end');
    g.passBoth();
    expect(keywords(g, lion).has('indestructible')).toBe(false);
    expect(counters(g, lion)).toBe(1);
  });

  it('the legendary mode is not offered without a legendary card in the graveyard', () => {
    const g = game({
      p1: { hand: ['fateshaper-aspirant'], battlefield: [...n('plains', 5), 'savannah-lions'] },
    });
    cast(g, 'fateshaper-aspirant');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const modes = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .map((a) => (a as { mode?: number }).mode);
    expect(modes).not.toContain(0);
    expect(modes).toContain(1);
  });
});

describe('Flickering Hound', () => {
  it('blinks up to one other creature you control when you cast a creature spell', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['plains', 'flickering-hound', 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).plusOneCounters = 2;
    const zcc = g.obj(angel).zcc;
    cast(g, 'savannah-lions');
    // The Hound can't target itself: its only choices are the Angel or nothing.
    const legal = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(legal.flatMap((a) => (a as { targets: unknown[] }).targets)).toHaveLength(1);
    done(g);
    expect(g.obj(angel).zcc).toBeGreaterThan(zcc);
    expect(counters(g, angel)).toBe(0);
    expect(g.obj(angel).zone).toBe('battlefield');
  });

  it("doesn't trigger for noncreature spells and may target nothing", () => {
    const g = game({
      p1: {
        hand: ['felidar-cub', 'giant-growth'],
        battlefield: ['plains', 'plains', 'forest', 'flickering-hound', 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).plusOneCounters = 1;
    done(cast(g, 'giant-growth', [g.ref(angel)]));
    expect(counters(g, angel)).toBe(1);
    // Choose no target for the creature spell's trigger.
    cast(g, 'felidar-cub');
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(counters(g, angel)).toBe(1);
  });
});

describe('Generous Revival', () => {
  it('returns a creature card with mana value 3 or less with an additional +1/+1 counter', () => {
    const g = game({
      p1: {
        hand: ['generous-revival'],
        battlefield: n('plains', 3),
        graveyard: ['savannah-lions', 'serra-angel'],
      },
    });
    cast(g, 'generous-revival', [g.ref(g.id('p1', 'savannah-lions', 'graveyard'))]);
    done(g);
    const lion = g.id('p1', 'savannah-lions');
    expect(counters(g, lion)).toBe(1);
    expect(gy(g)).toContain('serra-angel');
  });

  it('can only target a creature card with mana value 3 or less', () => {
    const g = game({
      p1: { hand: ['generous-revival'], battlefield: n('plains', 3), graveyard: ['serra-angel'] },
    });
    expect(canCast(g, 'p1', g.id('p1', 'generous-revival', 'hand'))).toBe(false);
  });

  it('has flashback {4}{W}', () => {
    const g = game({
      p1: {
        battlefield: n('plains', 5),
        graveyard: ['generous-revival', 'savannah-lions'],
      },
    });
    const card = g.id('p1', 'generous-revival', 'graveyard');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card,
      targets: [g.ref(g.id('p1', 'savannah-lions', 'graveyard'))],
    });
    done(g);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(1);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it('a card that enters with counters of its own gets them as well: Graft Surgeon returns with two', () => {
    const g = game({
      p1: { hand: ['generous-revival'], battlefield: n('plains', 3), graveyard: ['graft-surgeon'] },
    });
    cast(g, 'generous-revival', [g.ref(g.id('p1', 'graft-surgeon', 'graveyard'))]);
    done(g);
    expect(counters(g, g.id('p1', 'graft-surgeon'))).toBe(2);
  });
});

describe('Germinate Recruits', () => {
  it('creates a Cadet for each life you gained this turn', () => {
    const g = game({
      p1: { hand: ['surgical-precision', 'germinate-recruits'], battlefield: n('plains', 5) },
    });
    done(cast(g, 'surgical-precision', [], { mode: 1 }));
    done(cast(g, 'germinate-recruits'));
    const cadets = on(g, 'fra-cadet-token', 'p1');
    expect(cadets).toHaveLength(2);
    const c = getCharacteristics(g.state, cardDb, cadets[0]!);
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.subtypes).toEqual(['Wizard', 'Soldier']);
    expect(g.obj(cadets[0]!).isToken).toBe(true);
  });

  it('creates nothing if you gained no life', () => {
    const g = game({ p1: { hand: ['germinate-recruits'], battlefield: n('plains', 3) } });
    done(cast(g, 'germinate-recruits'));
    expect(on(g, 'fra-cadet-token')).toHaveLength(0);
  });

  it('does not count life the opponent gained', () => {
    const g = game({ p1: { hand: ['germinate-recruits'], battlefield: n('plains', 3) } });
    g.state.turn.lifeGained = { p1: 0, p2: 5 };
    done(cast(g, 'germinate-recruits'));
    expect(on(g, 'fra-cadet-token')).toHaveLength(0);
  });
});

describe('Ghalta the Immovable', () => {
  it('costs {X} less, where X is the greatest toughness among creatures you control', () => {
    const none = game({ p1: { hand: ['ghalta-the-immovable'], battlefield: n('plains', 8) } });
    expect(canCast(none, 'p1', none.id('p1', 'ghalta-the-immovable', 'hand'))).toBe(false);
    // Serra Angel's toughness is 4: {4}{W} is enough.
    const g = game({
      p1: { hand: ['ghalta-the-immovable'], battlefield: [...n('plains', 5), 'serra-angel'] },
    });
    expect(canCast(g, 'p1', g.id('p1', 'ghalta-the-immovable', 'hand'))).toBe(true);
    const four = game({
      p1: { hand: ['ghalta-the-immovable'], battlefield: [...n('plains', 4), 'serra-angel'] },
    });
    expect(canCast(four, 'p1', four.id('p1', 'ghalta-the-immovable', 'hand'))).toBe(false);
    done(cast(g, 'ghalta-the-immovable'));
    expect(on(g, 'ghalta-the-immovable')).toHaveLength(1);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'plains' && g.obj(id).tapped),
    ).toHaveLength(5);
  });

  it('lets your creatures attack as though they didn’t have defender, and assigns toughness as damage', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['ghalta-the-immovable', 'gleaming-barrier', 'savannah-lions'] },
    });
    const wall = g.id('p1', 'gleaming-barrier');
    const lions = g.id('p1', 'savannah-lions');
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    expect(g.legal().some((a) => a.type === 'addAttacker' && a.attacker === wall)).toBe(true);
    g.attack(wall, lions);
    done(g);
    g.passUntilStep('endCombat');
    // The 0/4 wall deals 4; the 2/1 lion (toughness not greater than power) deals 2.
    expect(g.life('p2')).toBe(20 - 4 - 2);
  });

  it("without Ghalta a defender can't attack and damage uses power", () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['gleaming-barrier'] },
    });
    g.passBoth();
    expect(g.legal().some((a) => a.type === 'addAttacker')).toBe(false);
  });
});

describe("Gideon's Memorial", () => {
  it('gives creature tokens you control +1/+0 and vigilance, and nothing else', () => {
    const g = game({
      p1: { battlefield: ['gideons-memorial', 'fra-cadet-token', 'savannah-lions'] },
      p2: { battlefield: ['fra-cadet-token'] },
    });
    const cadet = g.id('p1', 'fra-cadet-token');
    g.obj(cadet).isToken = true;
    g.obj(g.id('p2', 'fra-cadet-token')).isToken = true;
    expect(pt(g, cadet)).toEqual([3, 2]);
    expect(keywords(g, cadet).has('vigilance')).toBe(true);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    expect(keywords(g, g.id('p1', 'savannah-lions')).has('vigilance')).toBe(false);
    expect(pt(g, g.id('p2', 'fra-cadet-token'))).toEqual([2, 2]);
  });

  it('taps for one mana of any colour, only to cast a planeswalker spell', () => {
    // Elspeth, Storm Slayer costs {3}{W}{W}: four Plains and the Memorial.
    const g = game({
      p1: {
        hand: ['elspeth-storm-slayer', 'serra-angel'],
        battlefield: [...n('plains', 4), 'gideons-memorial'],
      },
    });
    expect(canCast(g, 'p1', g.id('p1', 'serra-angel', 'hand'))).toBe(false);
    expect(canCast(g, 'p1', g.id('p1', 'elspeth-storm-slayer', 'hand'))).toBe(true);
    cast(g, 'elspeth-storm-slayer');
    done(g);
    expect(on(g, 'elspeth-storm-slayer')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'gideons-memorial')).tapped).toBe(true);
  });

  it('{1}{W}, discard it: 4 damage to target attacking or blocking creature', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { hand: ['gideons-memorial'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    g.passBoth();
    g.attack(angel);
    g.pass(); // p2 passes; p1 has priority
    expect(g.actor).toBe('p1');
    const memorial = g.id('p1', 'gideons-memorial', 'hand');
    const idx = abilityIndex('gideons-memorial', 'activated');
    // The non-attacking Lions are not a legal target.
    const legal = g.legal().filter((a) => a.type === 'activateAbility' && a.source === memorial);
    const hits = legal.map(
      (a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id,
    );
    expect(hits).toEqual([angel]);
    expect(hits).not.toContain(lions);
    activate(g, memorial, idx, [g.ref(angel)]);
    expect(g.zoneOf(memorial)).toBe('graveyard');
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
  });
});

describe('Graft Surgeon', () => {
  it('enters with a +1/+1 counter; when it dies its counters go onto up to one creature you control', () => {
    const g = game({
      p1: {
        hand: ['graft-surgeon', 'prophesied-end'],
        battlefield: [...n('plains', 5), 'savannah-lions'],
      },
    });
    done(cast(g, 'graft-surgeon'));
    const surgeon = g.id('p1', 'graft-surgeon');
    expect(counters(g, surgeon)).toBe(1);
    expect(pt(g, surgeon)).toEqual([3, 3]);
    // It also has a stun counter, which moves with the rest.
    g.obj(surgeon).counters = { stun: 1 };
    cast(g, 'prophesied-end', [g.ref(surgeon)]);
    done(g);
    const lion = g.id('p1', 'savannah-lions');
    expect(counters(g, lion)).toBe(1);
    expect(g.obj(lion).counters?.stun).toBe(1);
    expect(g.zoneOf(surgeon)).toBe('graveyard');
  });

  it('can choose no creature', () => {
    const g = game({
      p1: {
        hand: ['prophesied-end'],
        battlefield: [...n('plains', 2), 'graft-surgeon', 'savannah-lions'],
      },
    });
    const surgeon = g.id('p1', 'graft-surgeon');
    g.obj(surgeon).plusOneCounters = 1;
    cast(g, 'prophesied-end', [g.ref(surgeon)]);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0)!);
    done(g);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });
});

describe('Guiding Hydra', () => {
  it('enters with X +1/+1 counters', () => {
    const g = game({ p1: { hand: ['guiding-hydra'], battlefield: n('plains', 4) } });
    done(cast(g, 'guiding-hydra', [], { x: 3 }));
    const hydra = g.id('p1', 'guiding-hydra');
    expect(counters(g, hydra)).toBe(3);
    expect(pt(g, hydra)).toEqual([4, 3]);
  });

  it('at the beginning of combat you may move a counter from it to each other creature you control', () => {
    const g = game({
      step: 'main1',
      p1: {
        hand: ['guiding-hydra'],
        battlefield: [...n('plains', 4), 'savannah-lions', 'felidar-cub'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    done(cast(g, 'guiding-hydra', [], { x: 3 }));
    const hydra = g.id('p1', 'guiding-hydra');
    g.passUntilStep('beginCombat');
    done(g, { accept: true });
    expect(counters(g, hydra)).toBe(2);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(1);
    expect(counters(g, g.id('p1', 'felidar-cub'))).toBe(1);
    expect(counters(g, g.id('p2', 'savannah-lions'))).toBe(0);
  });

  it('you may decline', () => {
    const g = game({
      p1: { hand: ['guiding-hydra'], battlefield: [...n('plains', 3), 'savannah-lions'] },
    });
    done(cast(g, 'guiding-hydra', [], { x: 2 }));
    g.passUntilStep('beginCombat');
    done(g, { accept: false });
    expect(counters(g, g.id('p1', 'guiding-hydra'))).toBe(2);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(0);
  });

  it('with no counters left there is nothing to remove (and no question)', () => {
    const g = game({
      p1: { hand: ['guiding-hydra'], battlefield: [...n('plains', 1), 'savannah-lions'] },
    });
    done(cast(g, 'guiding-hydra', [], { x: 0 }));
    // A 1/0 creature dies right away.
    expect(g.zoneOf(g.id('p1', 'guiding-hydra', 'graveyard'))).toBe('graveyard');
  });
});

describe('Kindred Judgment', () => {
  it('destroys all creatures that are not of the chosen type', () => {
    const g = game({
      p1: {
        hand: ['kindred-judgment'],
        battlefield: [...n('plains', 7), 'savannah-lions', 'serra-angel'],
      },
      p2: { battlefield: ['savannah-lions', 'felidar-cub', 'gleaming-barrier'] },
    });
    cast(g, 'kindred-judgment');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    expect(d.options.map((o) => o.label)).toContain('Cat');
    done(g, { option: /^Cat$/ });
    expect(on(g, 'savannah-lions')).toHaveLength(2);
    expect(on(g, 'serra-angel')).toHaveLength(0);
    expect(on(g, 'gleaming-barrier')).toHaveLength(0);
    // Felidar Cub is a Cat too.
    expect(on(g, 'felidar-cub')).toHaveLength(1);
  });
});

describe('Koth of the Homestead', () => {
  it('gains 1 life for any land and puts a +1/+1 counter on a creature for a Plains', () => {
    const g = game({
      p1: { hand: ['plains', 'forest'], battlefield: ['koth-of-the-homestead', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    done(g);
    expect(g.life('p1')).toBe(21);
    expect(counters(g, lions)).toBe(0);
    g.state.players.p1.landsPlayedThisTurn = 0;
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'plains', 'hand') });
    // The Plains trigger targets: choose the Lions.
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      ),
    );
    expect(g.life('p1')).toBe(22);
    expect(counters(g, lions)).toBe(1);
  });
});

describe('Liliana the Faultless', () => {
  it('gains 1 life when another creature or planeswalker you control enters', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'elspeth-storm-slayer'],
        battlefield: [...n('plains', 6), 'liliana-the-faultless'],
      },
    });
    done(cast(g, 'savannah-lions'));
    expect(g.life('p1')).toBe(21);
    done(cast(g, 'elspeth-storm-slayer'));
    expect(g.life('p1')).toBe(22);
  });

  it("doesn't trigger for an opponent's creature or for a noncreature, nonplaneswalker permanent", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['liliana-the-faultless'] },
      p2: { hand: ['savannah-lions', 'pirates-cutlass'], battlefield: n('plains', 4) },
    });
    done(cast(g, 'savannah-lions'));
    done(cast(g, 'pirates-cutlass'));
    expect(g.life('p1')).toBe(20);
  });

  it('{1}, {T}, discard a card: another target creature or planeswalker you control gains hexproof', () => {
    const g = game({
      p1: {
        hand: ['felidar-cub'],
        battlefield: ['plains', 'liliana-the-faultless', 'serra-angel', 'elspeth-storm-slayer'],
      },
    });
    const lili = g.id('p1', 'liliana-the-faultless');
    const angel = g.id('p1', 'serra-angel');
    const walker = loyal(g, 'p1', 'elspeth-storm-slayer');
    const idx = abilityIndex('liliana-the-faultless', 'activated');
    // Liliana can't target herself; the Angel and the planeswalker are legal.
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === lili)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(new Set(targets)).toEqual(new Set([angel, walker]));
    activate(g, lili, idx, [g.ref(walker)], { discard: g.id('p1', 'felidar-cub', 'hand') });
    done(g);
    expect(keywords(g, walker).has('hexproof')).toBe(true);
    expect(keywords(g, angel).has('hexproof')).toBe(false);
    expect(g.obj(lili).tapped).toBe(true);
    expect(gy(g)).toContain('felidar-cub');
  });
});

describe('Loyal Tutor', () => {
  it('searches for a planeswalker card and puts it on top of your library', () => {
    const g = game({
      p1: {
        hand: ['loyal-tutor'],
        battlefield: ['plains'],
        library: ['forest', 'forest', 'elspeth-storm-slayer', 'forest'],
      },
    });
    cast(g, 'loyal-tutor');
    done(g);
    expect(lib(g)[0]).toBe('elspeth-storm-slayer');
    expect(lib(g)).toHaveLength(4);
    expect(g.state.decision.kind).toBe('priority');
  });

  it('may find nothing when there is no planeswalker in the library', () => {
    const g = game({ p1: { hand: ['loyal-tutor'], battlefield: ['plains'] } });
    cast(g, 'loyal-tutor');
    done(g);
    expect(lib(g)).toHaveLength(10);
    expect(gy(g)).toEqual(['loyal-tutor']);
  });
});

describe('Lyra, Archangel of Dawn', () => {
  it('has flying and puts a +1/+1 counter on each Angel you control whenever you gain life', () => {
    const g = game({
      p1: {
        hand: ['surgical-precision'],
        battlefield: [...n('plains', 2), 'lyra-archangel-of-dawn', 'serra-angel', 'savannah-lions'],
      },
      p2: { battlefield: ['angel-of-finality'] },
    });
    expect(keywords(g, g.id('p1', 'lyra-archangel-of-dawn')).has('flying')).toBe(true);
    done(cast(g, 'surgical-precision', [], { mode: 1 }));
    expect(counters(g, g.id('p1', 'lyra-archangel-of-dawn'))).toBe(1);
    expect(counters(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(counters(g, g.id('p1', 'savannah-lions'))).toBe(0);
    expect(counters(g, g.id('p2', 'angel-of-finality'))).toBe(0);
  });
});

describe('Memory Trap', () => {
  it('exiles a nonland permanent an opponent controls until it leaves the battlefield', () => {
    const g = game({
      p1: { hand: ['memory-trap', 'disenchant'], battlefield: n('plains', 5) },
      p2: { battlefield: ['serra-angel', 'plains'] },
    });
    done(cast(g, 'memory-trap'));
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
    expect(on(g, 'plains', 'p2')).toHaveLength(1);
    // Removing the enchantment brings it back.
    done(cast(g, 'disenchant', [g.ref(g.id('p1', 'memory-trap'))]));
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
  });

  it("can't target a land, or your own permanent", () => {
    const g = game({
      p1: { hand: ['memory-trap'], battlefield: [...n('plains', 3), 'savannah-lions'] },
      p2: { battlefield: ['plains'] },
    });
    cast(g, 'memory-trap');
    g.passBoth();
    // No legal target: the trigger is removed, nothing is exiled.
    done(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'plains', 'p2')).toHaveLength(1);
  });
});

describe('Predictive Preparations', () => {
  it('puts a +1/+1 counter on each of one or two target creatures', () => {
    const g = game({
      p1: { hand: ['predictive-preparations'], battlefield: [...n('plains', 2), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    done(cast(g, 'predictive-preparations', [g.ref(lions), g.ref(angel)]));
    expect(counters(g, lions)).toBe(1);
    expect(counters(g, angel)).toBe(1);
  });

  it('works with a single target, and flashback {3}{W} casts it again', () => {
    const g = game({
      p1: { hand: ['predictive-preparations'], battlefield: [...n('plains', 6), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'predictive-preparations', [g.ref(lions)]));
    expect(counters(g, lions)).toBe(1);
    const card = g.id('p1', 'predictive-preparations', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [g.ref(lions)] });
    done(g);
    expect(counters(g, lions)).toBe(2);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it('can’t target the same creature twice', () => {
    const g = game({
      p1: { hand: ['predictive-preparations'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    const same = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.length === 2 &&
          (a.targets[0] as { object: { id: string } }).object.id ===
            (a.targets[1] as { object: { id: string } }).object.id,
      );
    expect(same).toHaveLength(0);
  });
});

describe('Prophesied End', () => {
  it("destroys a creature and its controller draws if it wasn't attacking", () => {
    const g = game({
      p1: { hand: ['prophesied-end'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'], library: ['forest', 'forest'] },
    });
    done(cast(g, 'prophesied-end', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(on(g, 'serra-angel')).toHaveLength(0);
    expect(hand(g, 'p2')).toEqual(['forest']);
    expect(hand(g, 'p1')).toEqual([]);
  });

  it('the creature’s controller draws, even if you stole it', () => {
    const g = game({
      p1: { hand: ['prophesied-end'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).controller = 'p1';
    done(cast(g, 'prophesied-end', [g.ref(angel)]));
    expect(hand(g, 'p1')).toEqual(['forest']);
    expect(hand(g, 'p2')).toEqual([]);
  });

  it('draws nothing when the creature was attacking', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { hand: ['prophesied-end'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.passBoth();
    g.attack(angel);
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, 'prophesied-end', [g.ref(angel)]);
    done(g);
    expect(on(g, 'serra-angel')).toHaveLength(0);
    expect(hand(g, 'p2')).toEqual([]);
  });
});

describe('Refute Destiny', () => {
  it('exiles a green or blue creature or planeswalker and surveils 1', () => {
    const g = game({
      p1: {
        hand: ['refute-destiny', 'refute-destiny', 'refute-destiny'],
        battlefield: n('plains', 6),
        library: ['serra-angel', 'forest', 'forest'],
      },
      p2: { battlefield: ['fierce-empath', 'tempest-djinn', 'serra-angel', 'vivien-reid'] },
    });
    const empath = g.id('p2', 'fierce-empath');
    const djinn = g.id('p2', 'tempest-djinn');
    const vivien = loyal(g, 'p2', 'vivien-reid');
    // The white Angel is not a legal target.
    const targetsOf = (): string[] =>
      g
        .legal()
        .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'refute-destiny', 'hand'))
        .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(new Set(targetsOf())).toEqual(new Set([empath, djinn, vivien]));
    cast(g, 'refute-destiny', [g.ref(empath)]);
    done(g, { bin: ['serra-angel'] });
    expect(g.zoneOf(empath)).toBe('exile');
    expect(gy(g)).toContain('serra-angel');
    cast(g, 'refute-destiny', [g.ref(vivien)]);
    done(g);
    expect(g.zoneOf(vivien)).toBe('exile');
  });
});

describe('Rescue Girl, First Responder', () => {
  it('has flying; {T}: return another permanent you control to its owner’s hand, only during your turn', () => {
    const g = game({
      p1: { battlefield: ['rescue-girl-first-responder', 'savannah-lions', 'plains'] },
    });
    const girl = g.id('p1', 'rescue-girl-first-responder');
    expect(keywords(g, girl).has('flying')).toBe(true);
    const idx = abilityIndex('rescue-girl-first-responder', 'activated');
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === girl)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    // Not herself; a creature or a land.
    expect(targets).toHaveLength(2);
    expect(targets).not.toContain(girl);
    activate(g, girl, idx, [g.ref(g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(g.obj(girl).tapped).toBe(true);
  });

  it("can't be activated during an opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['rescue-girl-first-responder', 'savannah-lions'] },
      p2: { hand: ['felidar-cub'], battlefield: n('plains', 2) },
    });
    cast(g, 'felidar-cub');
    g.pass(); // p2 passes priority with the spell on the stack
    expect(g.actor).toBe('p1');
    const girl = g.id('p1', 'rescue-girl-first-responder');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === girl)).toBe(false);
  });
});

describe('Return to the Light Realms', () => {
  it('returns all nonland permanent cards from your graveyard to the battlefield', () => {
    const g = game({
      p1: {
        hand: ['return-to-the-light-realms'],
        battlefield: n('plains', 9),
        graveyard: [
          'savannah-lions',
          'serra-angel',
          'graft-surgeon',
          'elspeth-storm-slayer',
          'pirates-cutlass',
          'plains',
          'giant-growth',
        ],
      },
      p2: { graveyard: ['felidar-cub'] },
    });
    cast(g, 'return-to-the-light-realms');
    done(g);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(1);
    expect(on(g, 'pirates-cutlass', 'p1')).toHaveLength(1);
    expect(on(g, 'elspeth-storm-slayer', 'p1')).toHaveLength(1);
    // A planeswalker comes back with its loyalty; Graft Surgeon with its own counter.
    expect(g.obj(g.id('p1', 'elspeth-storm-slayer')).counters?.loyalty).toBe(5);
    expect(counters(g, g.id('p1', 'graft-surgeon'))).toBe(1);
    // A land card, an instant and another player's graveyard stay where they were.
    expect(gy(g)).toEqual(
      expect.arrayContaining(['plains', 'giant-growth', 'return-to-the-light-realms']),
    );
    expect(gy(g, 'p2')).toEqual(['felidar-cub']);
    expect(on(g, 'plains', 'p1')).toHaveLength(9);
  });

  it('an Aura card comes back attached to a permanent you choose', () => {
    const g = game({
      p1: {
        hand: ['return-to-the-light-realms'],
        battlefield: n('plains', 9),
        graveyard: ['savannah-lions', 'pacifism'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'return-to-the-light-realms');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const d = g.decision as Extract<typeof g.decision, { kind: 'chooseOption' }>;
    const pick = d.options.findIndex(
      (o) => (o.effects[0] as unknown as { params: { host: string } }).params.host === angel,
    );
    expect(pick).toBeGreaterThanOrEqual(0);
    // Hosts: the Lions and the Angel (the Plains aren't creatures).
    expect(d.options).toHaveLength(2);
    g.do({ type: 'chooseOption', player: 'p1', index: pick });
    done(g);
    const aura = g.id('p1', 'pacifism');
    expect(g.obj(aura).attachedTo).toBe(angel);
    expect(g.zoneOf(aura)).toBe('battlefield');
  });

  it('an Aura card with nothing to enchant stays in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['return-to-the-light-realms'],
        battlefield: n('plains', 9),
        graveyard: ['pacifism'],
      },
    });
    cast(g, 'return-to-the-light-realms');
    done(g);
    expect(gy(g)).toContain('pacifism');
  });
});

describe('Saheeli, Consul of Oversight', () => {
  it('has flying and makes a Thopter the first time each turn you scry or surveil', () => {
    const g = game({
      p1: {
        hand: ['refute-destiny', 'refute-destiny'],
        battlefield: [...n('plains', 4), 'saheeli-consul-of-oversight'],
      },
      p2: { battlefield: ['fierce-empath', 'gnarlid-colony'] },
    });
    expect(keywords(g, g.id('p1', 'saheeli-consul-of-oversight')).has('flying')).toBe(true);
    cast(g, 'refute-destiny', [g.ref(g.id('p2', 'fierce-empath'))]);
    done(g);
    const thopters = on(g, 'fra-white-thopter-token', 'p1');
    expect(thopters).toHaveLength(1);
    const c = getCharacteristics(g.state, cardDb, thopters[0]!);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.keywords.has('flying')).toBe(true);
    expect(c.types).toEqual(['Artifact', 'Creature']);
    expect(c.subtypes).toEqual(['Thopter']);
    expect(g.obj(thopters[0]!).isToken).toBe(true);
    // A second surveil the same turn makes no second Thopter.
    cast(g, 'refute-destiny', [g.ref(g.id('p2', 'gnarlid-colony'))]);
    done(g);
    expect(on(g, 'fra-white-thopter-token', 'p1')).toHaveLength(1);
  });
});

describe('Shatterwing Pegasus', () => {
  it('{4}{W}: creatures you control get +1/+1 until end of turn', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 5), 'shatterwing-pegasus', 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(keywords(g, g.id('p1', 'shatterwing-pegasus')).has('flying')).toBe(true);
    activate(
      g,
      g.id('p1', 'shatterwing-pegasus'),
      abilityIndex('shatterwing-pegasus', 'activated'),
    );
    done(g);
    expect(pt(g, g.id('p1', 'shatterwing-pegasus'))).toEqual([3, 4]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p2', 'savannah-lions'))).toEqual([2, 1]);
    g.passUntilStep('end');
    expect(pt(g, g.id('p1', 'shatterwing-pegasus'))).toEqual([3, 4]);
    g.passUntilStep('upkeep');
    expect(pt(g, g.id('p1', 'shatterwing-pegasus'))).toEqual([2, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('Surgical Precision', () => {
  it('destroys a creature with toughness 4 or greater and gains 1 life', () => {
    const g = game({
      p1: { hand: ['surgical-precision'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.mode === 0)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(targets).toEqual([g.id('p2', 'serra-angel')]);
    done(cast(g, 'surgical-precision', [g.ref(g.id('p2', 'serra-angel'))], { mode: 0 }));
    expect(on(g, 'serra-angel')).toHaveLength(0);
    expect(g.life('p1')).toBe(21);
    expect(hand(g)).toEqual([]);
  });

  it('or draws a card and gains 2 life', () => {
    const g = game({
      p1: { hand: ['surgical-precision'], battlefield: n('plains', 2), library: ['serra-angel'] },
    });
    done(cast(g, 'surgical-precision', [], { mode: 1 }));
    expect(hand(g)).toEqual(['serra-angel']);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Thalia, the Survivor', () => {
  it('has lifelink; noncreature spells your opponents cast cost {1} more', () => {
    const lands = (...l: string[]) =>
      game({
        active: 'p2',
        p1: { battlefield: ['thalia-the-survivor'] },
        p2: { hand: ['burst-lightning'], battlefield: l },
      });
    const g = lands('mountain', 'plains');
    expect(keywords(g, g.id('p1', 'thalia-the-survivor')).has('lifelink')).toBe(true);
    // {R} becomes {1}{R}: two lands are enough; one is not.
    expect(canCast(g, 'p2', g.id('p2', 'burst-lightning', 'hand'))).toBe(true);
    const one = lands('mountain');
    expect(canCast(one, 'p2', one.id('p2', 'burst-lightning', 'hand'))).toBe(false);
  });

  it('a creature spell costs no more, and your own noncreature spells are not taxed', () => {
    const mine = game({
      p1: { hand: ['burst-lightning'], battlefield: ['thalia-the-survivor', 'mountain'] },
    });
    expect(canCast(mine, 'p1', mine.id('p1', 'burst-lightning', 'hand'))).toBe(true);
    const theirs = game({
      active: 'p2',
      p1: { battlefield: ['thalia-the-survivor'] },
      p2: { hand: ['savannah-lions', 'burst-lightning'], battlefield: ['plains', 'mountain'] },
    });
    expect(canCast(theirs, 'p2', theirs.id('p2', 'savannah-lions', 'hand'))).toBe(true);
    // The spell is paid for with both lands.
    cast(theirs, 'burst-lightning', [{ player: 'p1' }]);
    expect(theirs.state.battlefield.filter((id) => theirs.obj(id).tapped)).toHaveLength(2);
  });

  it('the tax is gone once Thalia leaves', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['thalia-the-survivor'] },
      p2: { hand: ['burst-lightning'], battlefield: ['mountain'] },
    });
    expect(canCast(g, 'p2', g.id('p2', 'burst-lightning', 'hand'))).toBe(false);
    g.state.battlefield = g.state.battlefield.filter(
      (id) => g.obj(id).defId !== 'thalia-the-survivor',
    );
    expect(canCast(g, 'p2', g.id('p2', 'burst-lightning', 'hand'))).toBe(true);
  });
});

describe('Unflinching Hortimancer', () => {
  it('gets a +1/+1 counter whenever you gain life', () => {
    const g = game({
      p1: {
        hand: ['surgical-precision'],
        battlefield: [...n('plains', 2), 'unflinching-hortimancer'],
      },
    });
    done(cast(g, 'surgical-precision', [], { mode: 1 }));
    expect(counters(g, g.id('p1', 'unflinching-hortimancer'))).toBe(1);
  });

  it('has ward {1}: an opponent targeting it must pay {1} more', () => {
    const def = cardDb.get('unflinching-hortimancer')!;
    expect(def.keywords).toContain('ward');
    expect(def.wardCost?.mana).toEqual({ generic: 1, colored: {} });
    const hort = (lands: number) =>
      game({
        active: 'p2',
        p1: { battlefield: ['unflinching-hortimancer'] },
        p2: { hand: ['burst-lightning'], battlefield: n('mountain', lands) },
      });
    const two = hort(1);
    const target = (g: GameDriver) => [g.ref(g.id('p1', 'unflinching-hortimancer'))];
    // Burst Lightning costs {R}; with ward {1} it takes two lands.
    const castable = (g: GameDriver) =>
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.targets.some((t) => 'object' in t && t.object.id === target(g)[0]!.object.id),
        );
    expect(castable(two)).toBe(false);
    expect(castable(hort(2))).toBe(true);
  });
});

describe('Yoshimaru, Beloved Companion', () => {
  it('puts one more +1/+1 counter on creatures you control, however they get them', () => {
    const g = game({
      p1: {
        hand: ['predictive-preparations', 'graft-surgeon'],
        battlefield: [...n('plains', 6), 'yoshimaru-beloved-companion', 'savannah-lions'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const mine = g.id('p1', 'savannah-lions');
    const theirs = g.id('p2', 'savannah-lions');
    done(cast(g, 'predictive-preparations', [g.ref(mine), g.ref(theirs)]));
    expect(counters(g, mine)).toBe(2);
    expect(counters(g, theirs)).toBe(1);
    // A creature entering with a counter gets two.
    done(cast(g, 'graft-surgeon'));
    expect(counters(g, g.id('p1', 'graft-surgeon'))).toBe(2);
  });

  it('{6}: puts a +1/+1 counter on target legendary creature (Yoshimaru himself gets two)', () => {
    const g = game({
      p1: {
        battlefield: [
          ...n('plains', 6),
          'yoshimaru-beloved-companion',
          'savannah-lions',
          'jazal-goldmane',
        ],
      },
    });
    const yoshi = g.id('p1', 'yoshimaru-beloved-companion');
    const idx = abilityIndex('yoshimaru-beloved-companion', 'activated');
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === yoshi)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(new Set(targets)).toEqual(new Set([yoshi, g.id('p1', 'jazal-goldmane')]));
    activate(g, yoshi, idx, [g.ref(g.id('p1', 'jazal-goldmane'))]);
    done(g);
    expect(counters(g, g.id('p1', 'jazal-goldmane'))).toBe(2);
  });
});

describe('Your Fate Ends Here', () => {
  it('destroys a creature or planeswalker with mana value 3 or greater and surveils 1', () => {
    const g = game({
      p1: {
        hand: ['your-fate-ends-here', 'your-fate-ends-here'],
        battlefield: n('plains', 6),
        library: ['serra-angel', 'forest', 'forest'],
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'elspeth-storm-slayer'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const walker = loyal(g, 'p2', 'elspeth-storm-slayer');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id);
    expect(new Set(targets)).toEqual(new Set([angel, walker]));
    expect(targets).not.toContain(lions);
    cast(g, 'your-fate-ends-here', [g.ref(angel)]);
    done(g, { bin: ['serra-angel'] });
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(0);
    expect(gy(g)).toContain('serra-angel');
    cast(g, 'your-fate-ends-here', [g.ref(walker)]);
    done(g);
    expect(on(g, 'elspeth-storm-slayer')).toHaveLength(0);
  });
});

describe('Yuriko, Blade of the Mighty', () => {
  it("players can't cast spells or activate non-mana abilities during combat", () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['felidar-cub'],
        battlefield: ['yuriko-blade-of-the-mighty', ...n('plains', 3), 'shatterwing-pegasus'],
      },
      p2: { hand: ['burst-lightning'], battlefield: ['mountain'] },
    });
    // At the beginning of combat both players can only pass.
    expect(g.legal().map((a) => a.type)).toEqual(['passPriority']);
    g.pass();
    expect(g.legal('p2').map((a) => a.type)).toEqual(['passPriority']);
  });

  it('outside combat spells and abilities work as usual', () => {
    const g = game({
      p1: { hand: ['felidar-cub'], battlefield: ['yuriko-blade-of-the-mighty', ...n('plains', 2)] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('a creature that attacks a player alone gains double strike until end of turn', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['yuriko-blade-of-the-mighty', 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.passBoth();
    g.attack(lions);
    done(g);
    expect(keywords(g, lions).has('doubleStrike')).toBe(true);
    g.passUntilStep('endCombat');
    // Double strike: 2 + 2.
    expect(g.life('p2')).toBe(16);
  });

  it("doesn't trigger when two creatures attack, or when the creature attacks a planeswalker", () => {
    const two = game({
      step: 'beginCombat',
      p1: { battlefield: ['yuriko-blade-of-the-mighty', 'savannah-lions'] },
    });
    two.passBoth();
    two.attack(two.id('p1', 'savannah-lions'), two.id('p1', 'yuriko-blade-of-the-mighty'));
    done(two);
    expect(keywords(two, two.id('p1', 'savannah-lions')).has('doubleStrike')).toBe(false);

    const walker = game({
      step: 'beginCombat',
      p1: { battlefield: ['yuriko-blade-of-the-mighty', 'savannah-lions'] },
      p2: { battlefield: ['elspeth-storm-slayer'] },
    });
    loyal(walker, 'p2', 'elspeth-storm-slayer');
    const lions = walker.id('p1', 'savannah-lions');
    walker.passBoth();
    walker.do({
      type: 'addAttacker',
      player: 'p1',
      attacker: lions,
      defender: 'p2',
      planeswalker: walker.id('p2', 'elspeth-storm-slayer'),
    });
    walker.do({ type: 'confirmAttackers', player: 'p1' });
    done(walker);
    expect(keywords(walker, lions).has('doubleStrike')).toBe(false);
  });

  it('works for an opponent’s attack too: only its controller’s creatures get double strike', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { battlefield: ['yuriko-blade-of-the-mighty'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    g.passBoth();
    g.attack(lions);
    done(g);
    expect(keywords(g, lions).has('doubleStrike')).toBe(false);
  });
});
