import { describe, expect, it } from 'vitest';
import { getCharacteristics, playRandomGame } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, deckById, deckIds } from '../src/index.ts';
import { all, cast, engine, game, n, pt, settle } from './blb-helpers.ts';

// Lorwyn Eclipsed 18b: green cards.

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const keywords = (g: GameDriver, id: string) => [...chars(g, id).keywords];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p);

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
  index: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets,
    ...extra,
  } as never);

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

/** Player 2 (holding Doom Blade and two Swamps) destroys this creature, then priority is back with player 1. */
function killWithDoomBlade(g: GameDriver, target: string): GameDriver {
  g.pass();
  expect(g.actor).toBe('p2');
  g.do({
    type: 'castSpell',
    player: 'p2',
    card: g.id('p2', 'doom-blade', 'hand'),
    targets: [g.ref(target)],
  });
  done(g);
  expect(g.actor).toBe('p1');
  return g;
}

/** Passes until the declare attackers decision. */
function toAttackers(g: GameDriver): GameDriver {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  return g;
}

/** Passes until the defending player declares blockers. */
function toBlockers(g: GameDriver): GameDriver {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
  return g;
}

/** The castSpell actions available for a card in hand. */
const casts = (g: GameDriver, defId: string) => {
  const card = g.id(g.actor, defId, 'hand');
  return g.legal().filter((a) => a.type === 'castSpell' && a.card === card) as Extract<
    Action,
    { type: 'castSpell' }
  >[];
};

const NAMES = [
  'Assert Perfection',
  'Aurora Awakener',
  'Bloom Tender',
  'Blossoming Defense',
  'Bristlebane Battler',
  'Bristlebane Outrider',
  'Celestial Reunion',
  'Champions of the Perfect',
  'Chomping Changeling',
  'Crossroads Watcher',
  "Dawn's Light Archer",
  'Dundoolin Weaver',
  'Formidable Speaker',
  "Gilt-Leaf's Embrace",
  'Great Forest Druid',
  'Luminollusk',
  'Lys Alana Dignitary',
  'Lys Alana Informant',
  'Midnight Tilling',
  'Mistmeadow Council',
  'Moon-Vigil Adherents',
  "Morcant's Eyes",
  'Mutable Explorer',
  'Pitiless Fists',
  'Prismabasher',
  'Prismatic Undercurrents',
  'Pummeler for Hire',
  'Safewright Cavalry',
  'Sapling Nursery',
  'Selfless Safewright',
  'Shimmerwilds Growth',
  'Spry and Mighty',
  'Surly Farrier',
  'Thoughtweft Charge',
  'Unforgiving Aim',
  'Vinebred Brawler',
  'Virulent Emissary',
  'Wildvine Pummeler',
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('every card is in the pool', () => {
  it('has all 38 green cards', () => {
    expect(NAMES).toHaveLength(38);
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('Surly Farrier', () => {
  it('taps for +1/+1 and vigilance on a creature you control, only as a sorcery', () => {
    const g = game({ p1: { battlefield: ['surly-farrier', 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    activate(g, g.id('p1', 'surly-farrier'), abilityIndex('surly-farrier', 'activated'), [
      g.ref(bear),
    ]);
    done(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(keywords(g, bear)).toContain('vigilance');
    expect(g.obj(g.id('p1', 'surly-farrier')).tapped).toBe(true);
    const h = game({ p1: { battlefield: ['surly-farrier', 'bear-cub'] } });
    toStep(h, 'beginCombat');
    expect(
      h.legal().filter((a) => a.type === 'activateAbility' && a.source === h.id('p1', 'surly-farrier')),
    ).toHaveLength(0);
  });
});

describe('Virulent Emissary', () => {
  it('gains 1 life whenever another creature enters under your control, not for itself', () => {
    const g = game({
      p1: { hand: ['virulent-emissary', 'bear-cub'], battlefield: n('forest', 3) },
    });
    done(cast(g, 'virulent-emissary'));
    expect(g.life('p1')).toBe(20);
    expect(keywords(g, g.id('p1', 'virulent-emissary'))).toContain('deathtouch');
    done(cast(g, 'bear-cub'));
    expect(g.life('p1')).toBe(21);
  });
});

describe('Bloom Tender', () => {
  it('adds one mana of each color among permanents you control', () => {
    // Bloom Tender (G) and a white creature: it alone pays for {G}{W}.
    const cost = cardDb.get('burrowguard-mentor')!.manaCost;
    expect(cost.generic + (cost.colored.G ?? 0) + (cost.colored.W ?? 0)).toBe(2);
    const g = game({
      p1: { hand: ['burrowguard-mentor'], battlefield: ['bloom-tender', 'savannah-lions'] },
    });
    expect(casts(g, 'burrowguard-mentor').length).toBeGreaterThan(0);
    done(cast(g, 'burrowguard-mentor'));
    expect(bf(g, 'burrowguard-mentor')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'bloom-tender')).tapped).toBe(true);
  });

  it('makes only the one color when only one color is among permanents', () => {
    const g = game({
      p1: { hand: ['burrowguard-mentor'], battlefield: ['bloom-tender', 'forest'] },
    });
    expect(casts(g, 'burrowguard-mentor')).toHaveLength(0);
  });
});

describe('Unforgiving Aim', () => {
  const setup = () =>
    game({
      p1: { hand: ['unforgiving-aim'], battlefield: n('forest', 3) },
      p2: { battlefield: ['serra-angel', 'bear-cub', 'gardenize'] },
    });
  it('destroys a creature with flying', () => {
    const g = setup();
    const acts = casts(g, 'unforgiving-aim').filter((a) => a.mode === 0);
    expect(acts.map((a) => a.targets)).toEqual([[g.ref(g.id('p2', 'serra-angel'))]]);
    g.do(acts[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
  it('destroys an enchantment', () => {
    const g = setup();
    g.do(casts(g, 'unforgiving-aim').find((a) => a.mode === 1)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['gardenize']);
  });
  it('creates a 2/2 black and green Elf', () => {
    const g = setup();
    g.do(casts(g, 'unforgiving-aim').find((a) => a.mode === 2)!);
    done(g);
    const elf = all(g, 'ecl-elf-token');
    expect(elf).toHaveLength(1);
    expect(pt(g, elf[0]!)).toEqual([2, 2]);
    expect([...cardDb.get('ecl-elf-token')!.colors].sort()).toEqual(['B', 'G']);
  });
});

describe('Wildvine Pummeler', () => {
  it('costs {1} less for each color among permanents you control', () => {
    // Green (Bloom Tender) and white (Savannah Lions): {6}{G} - 2 = {4}{G}.
    const five = game({
      p1: {
        hand: ['wildvine-pummeler'],
        battlefield: ['bloom-tender', 'savannah-lions', ...n('forest', 5)],
      },
    });
    expect(casts(five, 'wildvine-pummeler').length).toBeGreaterThan(0);
    const four = game({
      p1: {
        hand: ['wildvine-pummeler'],
        battlefield: ['bloom-tender', 'savannah-lions', ...n('forest', 4)],
      },
    });
    // Bloom Tender itself taps for mana, so four forests plus it is enough for {4}{G}...
    expect(casts(four, 'wildvine-pummeler').length).toBeGreaterThan(0);
    const three = game({
      p1: {
        hand: ['wildvine-pummeler'],
        battlefield: ['savannah-lions', ...n('forest', 4)],
      },
    });
    expect(casts(three, 'wildvine-pummeler')).toHaveLength(0);
    expect(keywords(five, five.id('p1', 'bloom-tender'))).not.toContain('reach');
  });
  it('is a 6/5 with reach and trample', () => {
    const g = game({ p1: { battlefield: ['wildvine-pummeler'] } });
    const id = g.id('p1', 'wildvine-pummeler');
    expect(pt(g, id)).toEqual([6, 5]);
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['reach', 'trample']));
  });
});

describe('Formidable Speaker', () => {
  it('may discard a card to search for a creature card', () => {
    const g = game({
      p1: {
        hand: ['formidable-speaker', 'island'],
        battlefield: n('forest', 3),
        library: ['forest', 'serra-angel', 'bear-cub'],
      },
    });
    done(cast(g, 'formidable-speaker'), { pick: ['serra-angel'], discard: 'island' });
    expect(gy(g)).toContain('island');
    expect(hand(g)).toEqual(['serra-angel']);
  });
  it('does nothing if you decline to discard', () => {
    const g = game({
      p1: {
        hand: ['formidable-speaker', 'island'],
        battlefield: n('forest', 3),
        library: ['forest', 'serra-angel'],
      },
    });
    done(cast(g, 'formidable-speaker'), { accept: false });
    expect(hand(g)).toEqual(['island']);
  });
  it('{1}, {T}: untaps another target permanent', () => {
    const g = game({
      p1: { battlefield: ['formidable-speaker', 'forest', { card: 'bear-cub', tapped: true }] },
    });
    activate(g, g.id('p1', 'formidable-speaker'), abilityIndex('formidable-speaker', 'activated'), [
      g.ref(g.id('p1', 'bear-cub')),
    ]);
    done(g);
    expect(g.obj(g.id('p1', 'bear-cub')).tapped).toBe(false);
    // It can't target itself.
    const h = game({ p1: { battlefield: ['formidable-speaker', 'forest'] } });
    const speaker = h.id('p1', 'formidable-speaker');
    const targets = h
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === speaker)
      .flatMap((a) => (a as Extract<Action, { type: 'activateAbility' }>).targets);
    expect(targets).toEqual([h.ref(h.id('p1', 'forest'))]);
  });
});

describe('Spry and Mighty', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['spry-and-mighty'],
        battlefield: ['bear-cub', 'tajuru-pathwarden', 'savannah-lions', ...n('forest', 5)],
        library: n('forest', 8),
      },
    });
  it('chooses two creatures one at a time; draws and pumps by the difference of their powers', () => {
    const g = setup();
    const bear = g.id('p1', 'bear-cub');
    const elf = g.id('p1', 'tajuru-pathwarden');
    cast(g, 'spry-and-mighty');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const first = (g.decision as { options: { label: string }[] }).options;
    expect(first).toHaveLength(3);
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: first.findIndex((o) => o.label.startsWith('Bear Cub')),
    });
    const second = (g.decision as { options: { label: string }[] }).options;
    expect(second).toHaveLength(2);
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: second.findIndex((o) => o.label.startsWith('Tajuru')),
    });
    // Powers 2 and 5: X = 3.
    expect(hand(g)).toHaveLength(3);
    expect(pt(g, bear)).toEqual([5, 5]);
    expect(pt(g, elf)).toEqual([8, 7]);
    expect(keywords(g, bear)).toContain('trample');
    expect(keywords(g, elf)).toContain('trample');
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
  });
  it('equal powers make X zero', () => {
    const g = game({
      p1: {
        hand: ['spry-and-mighty'],
        battlefield: ['bear-cub', 'diregraf-ghoul', ...n('forest', 5)],
      },
    });
    cast(g, 'spry-and-mighty');
    g.pass();
    g.pass();
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(hand(g)).toHaveLength(0);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
  });
  it('is not targeted: hexproof creatures can be chosen', () => {
    const g = game({
      p1: {
        hand: ['spry-and-mighty', 'blossoming-defense'],
        battlefield: ['bear-cub', 'savannah-lions', ...n('forest', 6)],
      },
    });
    expect(casts(g, 'spry-and-mighty').length).toBeGreaterThan(0);
  });
});

describe('Thoughtweft Charge', () => {
  it('gives +3/+3 and draws if a creature entered under your control this turn', () => {
    const g = game({
      p1: {
        hand: ['thoughtweft-charge', 'bear-cub'],
        battlefield: ['savannah-lions', ...n('forest', 4)],
      },
    });
    done(cast(g, 'bear-cub'));
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'thoughtweft-charge', [g.ref(lions)]));
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(hand(g)).toHaveLength(1);
  });
  it("doesn't draw when none entered", () => {
    const g = game({
      p1: { hand: ['thoughtweft-charge'], battlefield: ['savannah-lions', ...n('forest', 4)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'thoughtweft-charge', [g.ref(lions)]));
    expect(pt(g, lions)).toEqual([5, 4]);
    expect(hand(g)).toHaveLength(0);
  });
  it('counts a creature that has since died', () => {
    const g = game({
      p1: {
        hand: ['thoughtweft-charge', 'bear-cub'],
        battlefield: ['savannah-lions', ...n('forest', 4)],
      },
      p2: { hand: ['doom-blade'], battlefield: n('swamp', 2) },
    });
    const lions = g.id('p1', 'savannah-lions');
    done(cast(g, 'bear-cub'));
    // The Bear dies; it still entered this turn.
    killWithDoomBlade(g, g.id('p1', 'bear-cub'));
    expect(bf(g, 'bear-cub')).toHaveLength(0);
    done(cast(g, 'thoughtweft-charge', [g.ref(lions)]));
    expect(hand(g)).toHaveLength(1);
  });
});

describe('Dundoolin Weaver', () => {
  it('with three or more creatures returns a permanent card from your graveyard', () => {
    const g = game({
      p1: {
        hand: ['dundoolin-weaver'],
        battlefield: ['bear-cub', 'savannah-lions', ...n('forest', 2)],
        graveyard: ['serra-angel', 'lightning-bolt'],
      },
    });
    done(cast(g, 'dundoolin-weaver'));
    expect(hand(g)).toEqual(['serra-angel']);
  });
  it('does nothing with fewer than three creatures', () => {
    const g = game({
      p1: {
        hand: ['dundoolin-weaver'],
        battlefield: ['bear-cub', ...n('forest', 2)],
        graveyard: ['serra-angel'],
      },
    });
    done(cast(g, 'dundoolin-weaver'));
    expect(hand(g)).toHaveLength(0);
  });
});

describe('Selfless Safewright', () => {
  it('has flash and convoke', () => {
    const d = cardDb.get('selfless-safewright')!;
    expect(d.keywords).toContain('flash');
    expect(d.convoke).toBe(true);
  });
  it('other permanents you control of the chosen type gain hexproof and indestructible', () => {
    const g = game({
      p1: {
        hand: ['selfless-safewright'],
        battlefield: [
          'thornweald-archer',
          'bear-cub',
          'morcants-eyes',
          ...n('forest', 5),
        ],
      },
      p2: { battlefield: ['dawns-light-archer'] },
    });
    cast(g, 'selfless-safewright');
    g.pass();
    g.pass();
    settle(g, () => undefined);
    const d = g.decision as { kind: string; options: { label: string }[] };
    expect(d.kind).toBe('chooseOption');
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: d.options.findIndex((o) => o.label === 'Elf'),
    });
    done(g);
    for (const id of [bf(g, 'thornweald-archer')[0]!, bf(g, 'morcants-eyes')[0]!]) {
      expect(keywords(g, id)).toEqual(expect.arrayContaining(['hexproof', 'indestructible']));
    }
    expect(keywords(g, bf(g, 'bear-cub')[0]!)).not.toContain('hexproof');
    // Not itself (it's an Elf), and not the opponent's Elf.
    expect(keywords(g, bf(g, 'selfless-safewright')[0]!)).not.toContain('hexproof');
    expect(keywords(g, bf(g, 'dawns-light-archer', 'p2')[0]!)).not.toContain('indestructible');
  });
});

describe('Pitiless Fists', () => {
  it('enchanted creature fights up to one target creature an opponent controls, and gets +2/+2', () => {
    const g = game({
      p1: { hand: ['pitiless-fists'], battlefield: ['bear-cub', ...n('forest', 4)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'pitiless-fists', [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
    // The Bear (2 or 4 power) killed the Lions.
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.obj(bear).damage).toBe(2);
  });
  it('works with no creature to fight', () => {
    const g = game({ p1: { hand: ['pitiless-fists'], battlefield: ['bear-cub', ...n('forest', 4)] } });
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'pitiless-fists', [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
  });
  it('can only enchant a creature you control', () => {
    const g = game({
      p1: { hand: ['pitiless-fists'], battlefield: ['bear-cub', ...n('forest', 4)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const targets = casts(g, 'pitiless-fists').flatMap((a) => a.targets);
    expect(targets).toEqual([g.ref(g.id('p1', 'bear-cub'))]);
  });
});

describe('Champions of the Perfect', () => {
  it('beholds an Elf and exiles it; draws when you cast a creature; returns the Elf when it leaves', () => {
    const g = game({
      p1: {
        hand: ['champions-of-the-perfect', 'thornweald-archer', 'bear-cub'],
        battlefield: n('forest', 7),
      },
      p2: { hand: ['doom-blade'], battlefield: n('swamp', 2) },
    });
    const archer = g.id('p1', 'thornweald-archer', 'hand');
    const acts = casts(g, 'champions-of-the-perfect');
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(g.zoneOf(archer)).toBe('exile');
    const champ = g.id('p1', 'champions-of-the-perfect');
    expect(pt(g, champ)).toEqual([6, 6]);
    const before = hand(g).length;
    done(cast(g, 'bear-cub'));
    // Cast a creature: draw a card (net: -1 for the cast, +1 drawn).
    expect(hand(g)).toHaveLength(before);
    // It leaves: the exiled Elf goes back to hand.
    killWithDoomBlade(g, champ);
    expect(g.zoneOf(champ)).toBe('graveyard');
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('thornweald-archer');
    expect(g.zoneOf(archer)).toBe('hand');
  });
  it("can't be cast without an Elf to behold", () => {
    const g = game({ p1: { hand: ['champions-of-the-perfect'], battlefield: n('forest', 5) } });
    expect(casts(g, 'champions-of-the-perfect')).toHaveLength(0);
  });
});

describe('Sapling Nursery', () => {
  it('costs {1} less for each Forest you control', () => {
    // {6}{G}{G} with four Forests costs {2}{G}{G}.
    const g = game({
      p1: { hand: ['sapling-nursery'], battlefield: n('forest', 4) },
    });
    expect(casts(g, 'sapling-nursery').length).toBeGreaterThan(0);
    const h = game({ p1: { hand: ['sapling-nursery'], battlefield: n('forest', 3) } });
    expect(casts(h, 'sapling-nursery')).toHaveLength(0);
  });
  it('landfall makes a 3/4 Treefolk with reach; the ability gives Treefolk and Forests indestructible', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['sapling-nursery', 'forest', 'forest', 'bear-cub'] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    done(g);
    const tree = all(g, 'ecl-treefolk-token');
    expect(tree).toHaveLength(1);
    expect(pt(g, tree[0]!)).toEqual([3, 4]);
    expect(keywords(g, tree[0]!)).toContain('reach');
    activate(g, g.id('p1', 'sapling-nursery'), abilityIndex('sapling-nursery', 'activated'));
    done(g);
    expect(g.zoneOf(bf(g, 'sapling-nursery')[0] ?? 'x')).toBe('gone');
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toContain('sapling-nursery');
    expect(keywords(g, tree[0]!)).toContain('indestructible');
    expect(keywords(g, g.id('p1', 'forest'))).toContain('indestructible');
    expect(keywords(g, g.id('p1', 'bear-cub'))).not.toContain('indestructible');
  });
});

describe('Bristlebane Outrider', () => {
  it("can't be blocked by creatures with power 2 or less", () => {
    const g = game({
      p1: { battlefield: ['bristlebane-outrider'] },
      p2: { battlefield: ['savannah-lions', 'tajuru-pathwarden'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'bristlebane-outrider'));
    toBlockers(g);
    const blocks = g
      .legal()
      .filter((a) => a.type === 'addBlock')
      .map((a) => (a as Extract<Action, { type: 'addBlock' }>).blocker);
    expect(blocks).toEqual([g.id('p2', 'tajuru-pathwarden')]);
  });
  it('gets +2/+0 once another creature entered under your control this turn', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['bristlebane-outrider', 'forest', 'forest'] },
    });
    const id = g.id('p1', 'bristlebane-outrider');
    expect(pt(g, id)).toEqual([3, 5]);
    done(cast(g, 'bear-cub'));
    expect(pt(g, id)).toEqual([5, 5]);
  });
});

describe('Blossoming Defense', () => {
  it('gives +2/+2 and hexproof', () => {
    const g = game({ p1: { hand: ['blossoming-defense'], battlefield: ['bear-cub', 'forest'] } });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'blossoming-defense', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toContain('hexproof');
  });
});

describe('Luminollusk', () => {
  it('gains life equal to the colors among permanents you control', () => {
    const g = game({
      p1: { hand: ['luminollusk'], battlefield: ['savannah-lions', 'diregraf-ghoul', ...n('forest', 4)] },
    });
    done(cast(g, 'luminollusk'));
    // Green (itself), white, black.
    expect(g.life('p1')).toBe(23);
    expect(keywords(g, g.id('p1', 'luminollusk'))).toContain('deathtouch');
  });
});

describe('Pummeler for Hire', () => {
  it('gains life equal to the greatest power among Giants you control', () => {
    const g = game({
      p1: { hand: ['pummeler-for-hire'], battlefield: ['skyraker-giant', ...n('forest', 5)] },
    });
    done(cast(g, 'pummeler-for-hire'));
    // Itself and Skyraker Giant are Giants with power 4.
    expect(g.life('p1')).toBe(24);
    const id = g.id('p1', 'pummeler-for-hire');
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['reach', 'vigilance', 'ward']));
  });
  it('ignores bigger creatures that are not Giants', () => {
    const g = game({
      p1: { hand: ['pummeler-for-hire'], battlefield: ['tajuru-pathwarden', ...n('forest', 5)] },
    });
    done(cast(g, 'pummeler-for-hire'));
    expect(g.life('p1')).toBe(24);
  });
});

describe('Celestial Reunion', () => {
  it('searches for a creature card with mana value X or less', () => {
    const g = game({
      p1: {
        hand: ['celestial-reunion'],
        battlefield: n('forest', 4),
        library: ['serra-angel', 'bear-cub', 'forest'],
      },
    });
    const x2 = casts(g, 'celestial-reunion').find((a) => !a.kicked && a.x === 2)!;
    g.do(x2);
    done(g, { pick: ['bear-cub'] });
    expect(hand(g)).toEqual(['bear-cub']);
  });
});

describe('Moon-Vigil Adherents', () => {
  it('gets +1/+1 for each creature you control and each creature card in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['moon-vigil-adherents', 'bear-cub'],
        graveyard: ['serra-angel', 'island', 'savannah-lions'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    // Two creatures it controls plus two creature cards.
    expect(pt(g, g.id('p1', 'moon-vigil-adherents'))).toEqual([4, 4]);
    expect(keywords(g, g.id('p1', 'moon-vigil-adherents'))).toContain('trample');
  });
});

describe('Vinebred Brawler', () => {
  it('must be blocked if able', () => {
    const g = game({
      p1: { battlefield: ['vinebred-brawler'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'vinebred-brawler'));
    toBlockers(g);
    expect(g.decision.kind).toBe('declareBlockers');
    g.do({ type: 'confirmBlockers', player: 'p2' });
    // The Lions were made to block.
    const att = g.state.combat!.attackers[0]!;
    expect(att.blockers).toEqual([g.id('p2', 'savannah-lions')]);
  });
  it('when it attacks, another target Elf you control gets +2/+1', () => {
    const g = game({ p1: { battlefield: ['vinebred-brawler', 'thornweald-archer', 'bear-cub'] } });
    toAttackers(g);
    g.attack(g.id('p1', 'vinebred-brawler'));
    settle(g);
    expect(pt(g, g.id('p1', 'thornweald-archer'))).toEqual([4, 2]);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'vinebred-brawler'))).toEqual([4, 2]);
  });
});

describe('Prismabasher', () => {
  it('up to X target creatures you control get +X/+X, X = colors among permanents you control', () => {
    const g = game({
      p1: {
        hand: ['prismabasher'],
        battlefield: ['bear-cub', 'savannah-lions', 'diregraf-ghoul', ...n('forest', 6)],
      },
    });
    cast(g, 'prismabasher');
    g.pass();
    g.pass();
    // X = 3 (green, white, black).
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const pick = (defId: string) => {
      const a = g
        .legal()
        .find(
          (x) =>
            x.type === 'chooseTargets' &&
            x.targets.length > 0 &&
            JSON.stringify(x.targets.at(-1)) === JSON.stringify(g.ref(g.id('p1', defId))),
        )!;
      g.do(a);
    };
    pick('bear-cub');
    pick('savannah-lions');
    pick('diregraf-ghoul');
    // Four creatures are possible but three are the most allowed.
    const more = g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length > 3);
    expect(more).toHaveLength(0);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 3)!);
    done(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([5, 5]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([5, 4]);
    expect(pt(g, g.id('p1', 'prismabasher'))).toEqual([6, 6]);
  });
});

describe('Assert Perfection', () => {
  it('gives +1/+0, then the creature deals damage equal to its power to up to one opposing creature', () => {
    const g = game({
      p1: { hand: ['assert-perfection'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['tajuru-pathwarden', 'savannah-lions'] },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'assert-perfection', [g.ref(bear), g.ref(g.id('p2', 'savannah-lions'))]));
    expect(pt(g, bear)).toEqual([3, 2]);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    // Without a second target it's just the pump.
    const h = game({
      p1: { hand: ['assert-perfection'], battlefield: ['bear-cub', ...n('forest', 2)] },
    });
    done(cast(h, 'assert-perfection', [h.ref(h.id('p1', 'bear-cub'))]));
    expect(pt(h, h.id('p1', 'bear-cub'))).toEqual([3, 2]);
  });
  it('is castable with no opposing creatures', () => {
    const g = game({ p1: { hand: ['assert-perfection'], battlefield: ['bear-cub', 'forest', 'forest'] } });
    expect(casts(g, 'assert-perfection').length).toBeGreaterThan(0);
  });
});

describe('Crossroads Watcher', () => {
  it('gets +1/+0 until end of turn whenever another creature enters under your control', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['crossroads-watcher', 'forest', 'forest'] },
    });
    const w = g.id('p1', 'crossroads-watcher');
    done(cast(g, 'bear-cub'));
    expect(pt(g, w)).toEqual([4, 3]);
  });
});

describe('Bristlebane Battler', () => {
  it('enters with five -1/-1 counters, losing one for each other creature that enters', () => {
    const g = game({
      p1: {
        hand: ['bristlebane-battler', 'bear-cub', 'thornweald-archer'],
        battlefield: n('forest', 8),
      },
    });
    done(cast(g, 'bristlebane-battler'));
    const b = g.id('p1', 'bristlebane-battler');
    expect(g.obj(b).counters?.['-1/-1']).toBe(5);
    expect(pt(g, b)).toEqual([1, 1]);
    done(cast(g, 'bear-cub'));
    expect(g.obj(b).counters?.['-1/-1']).toBe(4);
    expect(pt(g, b)).toEqual([2, 2]);
    done(cast(g, 'thornweald-archer'));
    expect(pt(g, b)).toEqual([3, 3]);
    expect(keywords(g, b)).toEqual(expect.arrayContaining(['trample', 'ward']));
  });
});

describe("Gilt-Leaf's Embrace", () => {
  it('has flash; the creature gains trample and indestructible until end of turn, and +2/+0', () => {
    const g = game({
      p1: { hand: ['gilt-leafs-embrace'], battlefield: ['bear-cub', ...n('forest', 3)] },
    });
    expect(cardDb.get('gilt-leafs-embrace')!.keywords).toContain('flash');
    const bear = g.id('p1', 'bear-cub');
    cast(g, 'gilt-leafs-embrace', [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 2]);
    expect(keywords(g, bear)).toEqual(expect.arrayContaining(['trample', 'indestructible']));
  });
});

describe("Dawn's Light Archer", () => {
  it('is a 4/2 with flash and reach', () => {
    const d = cardDb.get('dawns-light-archer')!;
    expect(d.keywords).toEqual(expect.arrayContaining(['flash', 'reach']));
    expect([d.power, d.toughness]).toEqual([4, 2]);
  });
});

describe('Great Forest Druid', () => {
  it('taps for one mana of any color', () => {
    // It alone pays for {W}.
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['great-forest-druid'] },
    });
    expect(casts(g, 'savannah-lions').length).toBeGreaterThan(0);
    done(cast(g, 'savannah-lions'));
    expect(g.obj(g.id('p1', 'great-forest-druid')).tapped).toBe(true);
  });
});

describe('Mutable Explorer', () => {
  it('creates a tapped Mutavault token that becomes a 2/2 with all creature types for {1}', () => {
    const g = game({
      p1: { hand: ['mutable-explorer'], battlefield: n('forest', 4) },
    });
    done(cast(g, 'mutable-explorer'));
    const vault = all(g, 'ecl-green-mutavault-token');
    expect(vault).toHaveLength(1);
    expect(g.obj(vault[0]!).tapped).toBe(true);
    expect(chars(g, vault[0]!).types).toEqual(['Land']);
    // Animate it with {1}.
    activate(g, vault[0]!, abilityIndex('ecl-green-mutavault-token', 'activated'));
    done(g);
    const c = chars(g, vault[0]!);
    expect(c.types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(c.types).not.toContain('Artifact');
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(keywords(g, g.id('p1', 'mutable-explorer'))).toContain('changeling');
  });
  it('as a creature it has every creature type (an Elf for Vinebred Brawler)', () => {
    const g = game({
      p1: {
        battlefield: ['vinebred-brawler', 'ecl-green-mutavault-token', ...n('forest', 2)],
      },
    });
    const vault = g.id('p1', 'ecl-green-mutavault-token');
    activate(g, vault, abilityIndex('ecl-green-mutavault-token', 'activated'));
    done(g);
    toAttackers(g);
    g.attack(g.id('p1', 'vinebred-brawler'));
    const targets = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a as Extract<Action, { type: 'chooseTargets' }>).targets);
    expect(targets).toEqual([g.ref(vault)]);
  });
});

describe('Aurora Awakener', () => {
  const setup = (library: string[], extra: string[] = []) =>
    game({
      p1: {
        hand: ['aurora-awakener'],
        battlefield: ['savannah-lions', ...n('forest', 7), ...extra],
        library,
      },
    });
  it('reveals until X permanent cards, puts any number onto the battlefield, the rest on the bottom', () => {
    // X = 2 (green Awakener and white Lions). Revealed: Bolt (not a permanent), Bear Cub, Serra Angel; then stop.
    const g = setup(['lightning-bolt', 'bear-cub', 'serra-angel', 'diregraf-ghoul', 'forest']);
    cast(g, 'aurora-awakener');
    g.pass();
    g.pass();
    settle(g);
    const first = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(first).toEqual([
      'Put Bear Cub onto the battlefield',
      'Put Serra Angel onto the battlefield',
      'Put none of them onto the battlefield',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    // Bear Cub was picked; next choice: Serra Angel or finish.
    expect(g.decision.kind).toBe('chooseOption');
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels).toEqual([
      'Put Serra Angel onto the battlefield',
      'Done: put the rest on the bottom of the library',
    ]);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    done(g);
    expect(bf(g, 'bear-cub')).toHaveLength(1);
    expect(bf(g, 'serra-angel')).toHaveLength(0);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    // The unrevealed cards stay on top; the rest are on the bottom (in some order).
    expect(lib.slice(0, 2)).toEqual(['diregraf-ghoul', 'forest']);
    expect(lib.slice(2).sort()).toEqual(['lightning-bolt', 'serra-angel']);
    expect(gy(g)).toEqual([]);
  });
  it('may put none of them onto the battlefield', () => {
    const g = setup(['bear-cub', 'serra-angel', 'forest']);
    cast(g, 'aurora-awakener');
    g.pass();
    g.pass();
    settle(g);
    const labels = (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    expect(labels[labels.length - 1]).toBe('Put none of them onto the battlefield');
    g.do({ type: 'chooseOption', player: 'p1', index: labels.length - 1 });
    expect(bf(g, 'bear-cub')).toHaveLength(0);
    expect(g.state.players.p1.library).toHaveLength(3);
  });
  it('stops when the library runs out', () => {
    const g = setup(['lightning-bolt', 'lightning-bolt']);
    cast(g, 'aurora-awakener');
    g.pass();
    g.pass();
    settle(g);
    // Two non-permanent cards were revealed; there is nothing to choose.
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});

describe('Lys Alana Dignitary', () => {
  it('is cast by beholding an Elf or paying {2}', () => {
    const g = game({
      p1: { hand: ['lys-alana-dignitary', 'thornweald-archer'], battlefield: n('forest', 4) },
    });
    const acts = casts(g, 'lys-alana-dignitary');
    // With four Forests: the behold way and the pay way are both offered.
    expect(acts.length).toBeGreaterThanOrEqual(2);
    const poor = game({ p1: { hand: ['lys-alana-dignitary'], battlefield: n('forest', 4) } });
    expect(casts(poor, 'lys-alana-dignitary').length).toBeGreaterThan(0);
    const none = game({ p1: { hand: ['lys-alana-dignitary'], battlefield: n('forest', 3) } });
    expect(casts(none, 'lys-alana-dignitary')).toHaveLength(0);
  });
  it('taps for {G}{G} only if there is an Elf card in your graveyard', () => {
    // {G}{G} pays for Bear Cub's cost twice over: with an Elf in the graveyard it can cast a {G}{G} spell alone.
    const withElf = game({
      p1: {
        hand: ['rumbling-baloth'],
        battlefield: ['lys-alana-dignitary', ...n('forest', 2)],
        graveyard: ['thornweald-archer'],
      },
    });
    expect(casts(withElf, 'rumbling-baloth').length).toBeGreaterThan(0);
    const without = game({
      p1: { hand: ['rumbling-baloth'], battlefield: ['lys-alana-dignitary', ...n('forest', 2)], graveyard: ['bear-cub'] },
    });
    expect(casts(without, 'rumbling-baloth')).toHaveLength(0);
  });
  it('a changeling card in the graveyard counts as an Elf card', () => {
    const g = game({
      p1: {
        hand: ['rumbling-baloth'],
        battlefield: ['lys-alana-dignitary', ...n('forest', 2)],
        graveyard: ['mutable-explorer'],
      },
    });
    expect(casts(g, 'rumbling-baloth').length).toBeGreaterThan(0);
  });
});

describe("Morcant's Eyes", () => {
  it('surveils 1 at the beginning of your upkeep', () => {
    const g = game({
      p1: { battlefield: ['morcants-eyes'], library: ['bear-cub', 'forest', 'forest'] },
    });
    // Through the opponent's turn to my next upkeep: a surveil decision with the top card.
    for (let i = 0; i < 120 && g.decision.kind !== 'scry'; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else break;
    }
    expect(g.decision.kind).toBe('scry');
    expect(g.state.turn.step).toBe('upkeep');
    expect(g.state.turn.activePlayer).toBe('p1');
    g.do(g.legal().find((a) => a.type === 'scry' && a.bottom.length === 1)!);
    expect(gy(g)).toEqual(['bear-cub']);
  });
  it('sacrifice: creates X 2/2 Elves, X being the Elf cards in your graveyard (counting itself)', () => {
    const g = game({
      p1: {
        battlefield: ['morcants-eyes', ...n('forest', 6)],
        graveyard: ['thornweald-archer', 'bear-cub', 'mutable-explorer'],
      },
    });
    activate(g, g.id('p1', 'morcants-eyes'), abilityIndex('morcants-eyes', 'activated'));
    done(g);
    // Archer, the changeling and Morcant's Eyes itself.
    expect(all(g, 'ecl-elf-token')).toHaveLength(3);
    expect(gy(g)).toContain('morcants-eyes');
  });
  it('is a Kindred Enchantment Elf', () => {
    const d = cardDb.get('morcants-eyes')!;
    expect(d.types).toEqual(expect.arrayContaining(['Enchantment']));
    expect(d.subtypes).toContain('Elf');
  });
});

describe('Lys Alana Informant', () => {
  it('surveils 1 when it enters and when it dies', () => {
    const g = game({
      p1: {
        hand: ['lys-alana-informant'],
        battlefield: n('forest', 2),
        library: ['bear-cub', 'forest', 'forest'],
      },
    });
    done(cast(g, 'lys-alana-informant'));
    expect(g.decision.kind).toBe('scry');
    expect(g.legal()).toHaveLength(2);
    g.do(g.legal().find((a) => a.type === 'scry' && a.bottom.length === 1)!);
    expect(gy(g)).toEqual(['bear-cub']);
  });
});

describe('Prismatic Undercurrents', () => {
  it('searches for up to X basic lands (X = colors among permanents you control) and allows an additional land', () => {
    const g = game({
      p1: {
        hand: ['prismatic-undercurrents', 'forest'],
        battlefield: ['savannah-lions', ...n('forest', 4)],
        library: ['plains', 'island', 'forest', 'serra-angel'],
      },
    });
    done(cast(g, 'prismatic-undercurrents'), { pick: ['plains', 'island'] });
    // Green (itself) and white: two lands.
    expect(hand(g).sort()).toEqual(['forest', 'island', 'plains'].sort());
    // Two land plays this turn.
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'plains', 'hand') });
    expect(
      g.legal().some((a) => a.type === 'playLand'),
    ).toBe(true);
  });
});

describe('Shimmerwilds Growth', () => {
  it('makes the land the chosen color and adds an additional mana of that color', () => {
    const g = game({
      p1: { hand: ['shimmerwilds-growth', 'savannah-lions'], battlefield: n('forest', 4) },
    });
    // Without the Aura only green mana is around, so the white Lions can't be cast.
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
    const land = bf(g, 'forest').at(-1)!;
    cast(g, 'shimmerwilds-growth', [g.ref(land)]);
    done(g, { option: /White/ });
    expect(g.obj(land).tapped).toBe(false);
    // The enchanted Forest taps for {G} and an additional {W}: the Lions are castable.
    expect(casts(g, 'savannah-lions').length).toBeGreaterThan(0);
    done(cast(g, 'savannah-lions'));
    expect(bf(g, 'savannah-lions')).toHaveLength(1);
    expect(g.obj(land).tapped).toBe(true);
  });
  it('the recolored land counts for vivid', () => {
    const g = game({
      p1: { hand: ['shimmerwilds-growth', 'luminollusk'], battlefield: n('forest', 7) },
    });
    cast(g, 'shimmerwilds-growth', [g.ref(g.id('p1', 'forest'))]);
    done(g, { option: /Red/ });
    done(cast(g, 'luminollusk'));
    // Red (the land) and green (Luminollusk): the Aura itself is green too.
    expect(g.life('p1')).toBe(22);
  });
});

describe('Midnight Tilling', () => {
  it('mills four, then you may return a permanent card from among them', () => {
    const g = game({
      p1: {
        hand: ['midnight-tilling'],
        battlefield: n('forest', 2),
        library: ['lightning-bolt', 'serra-angel', 'forest', 'lightning-bolt', 'plains'],
      },
    });
    done(cast(g, 'midnight-tilling'), { pick: ['serra-angel'] });
    expect(hand(g)).toEqual(['serra-angel']);
    expect(gy(g).sort()).toEqual(['forest', 'lightning-bolt', 'lightning-bolt', 'midnight-tilling'].sort());
  });
  it("can't return an instant or sorcery card", () => {
    const g = game({
      p1: {
        hand: ['midnight-tilling'],
        battlefield: n('forest', 2),
        library: ['lightning-bolt', 'lightning-bolt', 'lightning-bolt', 'lightning-bolt', 'plains'],
      },
    });
    done(cast(g, 'midnight-tilling'));
    expect(hand(g)).toEqual([]);
  });
});

describe('Mistmeadow Council', () => {
  it('costs {1} less if you control a Kithkin; draws when it enters', () => {
    const cost = cardDb.get('mistmeadow-council')!.manaCost;
    expect(cost.generic).toBe(4);
    // Kithkin: Surly Farrier.
    const yes = game({
      p1: { hand: ['mistmeadow-council'], battlefield: ['surly-farrier', ...n('forest', 4)] },
    });
    expect(casts(yes, 'mistmeadow-council').length).toBeGreaterThan(0);
    done(cast(yes, 'mistmeadow-council'));
    expect(hand(yes)).toHaveLength(1);
    const no = game({
      p1: { hand: ['mistmeadow-council'], battlefield: ['bear-cub', ...n('forest', 4)] },
    });
    expect(casts(no, 'mistmeadow-council')).toHaveLength(0);
  });
});

describe('Chomping Changeling', () => {
  it('destroys up to one target artifact or enchantment', () => {
    const g = game({
      p1: { hand: ['chomping-changeling'], battlefield: n('forest', 3) },
      p2: { battlefield: ['gardenize', 'bear-cub'] },
    });
    done(cast(g, 'chomping-changeling'));
    expect(gy(g, 'p2')).toEqual(['gardenize']);
    expect(keywords(g, g.id('p1', 'chomping-changeling'))).toContain('changeling');
  });
  it("can't target a plain creature", () => {
    const g = game({
      p1: { hand: ['chomping-changeling'], battlefield: n('forest', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    done(cast(g, 'chomping-changeling'));
    expect(gy(g, 'p2')).toEqual([]);
  });
});

describe('Safewright Cavalry', () => {
  it("can't be blocked by more than one creature", () => {
    const g = game({
      p1: { battlefield: ['safewright-cavalry'] },
      p2: { battlefield: ['savannah-lions', 'bear-cub'] },
    });
    toAttackers(g);
    g.attack(g.id('p1', 'safewright-cavalry'));
    toBlockers(g);
    const cav = g.id('p1', 'safewright-cavalry');
    const lions = g.id('p2', 'savannah-lions');
    const bear = g.id('p2', 'bear-cub');
    g.do({ type: 'addBlock', player: 'p2', blocker: lions, attacker: cav });
    const blocks = g.legal().filter((a) => a.type === 'addBlock');
    expect(blocks).toHaveLength(0);
    expect(g.legal().some((a) => a.type === 'removeBlock' && a.blocker === lions)).toBe(true);
    expect(bear).toBeDefined();
  });
  it('{5}: target Elf you control gets +2/+2 until end of turn', () => {
    const g = game({
      p1: { battlefield: ['safewright-cavalry', 'thornweald-archer', 'bear-cub', ...n('forest', 5)] },
    });
    const elf = g.id('p1', 'thornweald-archer');
    const targets = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'safewright-cavalry'))
      .flatMap((a) => (a as Extract<Action, { type: 'activateAbility' }>).targets);
    expect(targets).toHaveLength(2);
    activate(g, g.id('p1', 'safewright-cavalry'), abilityIndex('safewright-cavalry', 'activated'), [
      g.ref(elf),
    ]);
    done(g);
    expect(pt(g, elf)).toEqual([4, 3]);
  });
});

describe('Aurora Awakener with an Aura', () => {
  it('an Aura put onto the battlefield enchants a permanent chosen for it', () => {
    const g = game({
      p1: {
        hand: ['aurora-awakener'],
        battlefield: ['savannah-lions', ...n('forest', 7)],
        library: ['pitiless-fists', 'forest', 'forest'],
      },
    });
    cast(g, 'aurora-awakener');
    g.pass();
    g.pass();
    settle(g);
    const options = () => (g.decision as { options: { label: string }[] }).options.map((o) => o.label);
    const pick = (label: string) =>
      g.do({ type: 'chooseOption', player: 'p1', index: options().indexOf(label) });
    expect(options()).toContain('Put Pitiless Fists onto the battlefield');
    pick('Put Pitiless Fists onto the battlefield');
    expect(options().sort()).toEqual(['Enchant Aurora Awakener', 'Enchant Savannah Lions']);
    pick('Enchant Savannah Lions');
    // Back to the pick: the Forest or done.
    pick('Done: put the rest on the bottom of the library');
    done(g);
    expect(bf(g, 'pitiless-fists')).toHaveLength(1);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 3]);
  });
});

describe('random games with the green cards', () => {
  it('play to completion', () => {
    const deck = [...NAMES.map(slug), ...n('forest', 22)];
    const starter = deckIds(deckById('learn-from-the-land'));
    for (let seed = 1; seed <= 12; seed++) {
      const decks = seed % 2 ? { p1: deck, p2: starter } : { p1: starter, p2: deck };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
});
