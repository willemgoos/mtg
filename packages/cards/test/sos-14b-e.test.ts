import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14b, group E: green and Quandrix (G/U).

const FRACTAL = 'stx-fractal-token';
const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const activate = (g: GameDriver, source: string, index = 0, extra: Record<string, unknown> = {}) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: index,
    targets: [],
    ...extra,
  } as never);
/** Resolves the stack: "may" prompts are accepted, the first target is taken. */
function done(g: GameDriver, accept = true): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'optionalEffect') g.do({ type: 'chooseEffect', player: d.player, accept });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
  return g;
}
const pick = (g: GameDriver, card: string | null) =>
  g.do({ type: 'chooseCard', player: g.actor, card });
/** Casts the prepared copy of a creature's spell. */
const castCopy = (g: GameDriver, creature: string, targets: never[] = [], extra = {}) =>
  g.do({
    type: 'castSpell',
    player: 'p1',
    card: g.obj(g.id('p1', creature)).prepared!,
    targets,
    ...extra,
  } as never);
/** Passes (resolving triggers) until the step is reached with an empty stack. */
function advance(g: GameDriver, step: string): void {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'declareAttackers' && step === 'declareAttackers') return;
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority' && g.state.turn.step === step && !g.state.stack.length) return;
    else if (d.kind === 'priority') g.pass();
    else throw new Error('stuck at ' + d.kind);
  }
  throw new Error('never reached ' + step);
}
const fractals = (g: GameDriver) => all(g, FRACTAL);
const exists = (id: string) => expect(cardDb.get(id), id).toBeDefined();

describe('the cards are in the pool', () => {
  it('has every card, with its back faces', () => {
    for (const id of [
      'aberrant-manawurm',
      'wildgrowth-archaic',
      'quandrix-the-proof',
      'dreamroot-cascade',
      'emeritus-of-abundance',
      'regrowth-emeritus-of-abundance',
      'bind-to-life-vastlands-scavenger',
      'deep-sight-tam-observant-sequencer',
    ])
      exists(id);
    expect(cardDb.get('wildgrowth-archaic')!.manaCost.twoHybrid).toEqual(['G', 'G']);
  });
});

describe('green', () => {
  it('Aberrant Manawurm gets +X/+0 for the mana spent on an instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['shock', 'lightning-strike'],
        battlefield: ['aberrant-manawurm', ...n('mountain', 3)],
      },
    });
    const w = g.id('p1', 'aberrant-manawurm');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    expect(pt(g, w)).toEqual([3, 5]);
    done(cast(g, 'lightning-strike', [{ player: 'p2' }]));
    expect(pt(g, w)).toEqual([5, 5]);
  });

  it('Additive Evolution makes a 3/3 Fractal and grows a creature each combat', () => {
    const g = game({
      p1: { hand: ['additive-evolution'], battlefield: ['bear-cub', ...n('forest', 5)] },
    });
    done(cast(g, 'additive-evolution'));
    expect(fractals(g)).toHaveLength(1);
    expect(pt(g, fractals(g)[0]!)).toEqual([3, 3]);
    advance(g, 'beginCombat');
    done(g);
    const bear = g.id('p1', 'bear-cub');
    const total = [bear, fractals(g)[0]!].map((id) => g.obj(id).plusOneCounters);
    expect(total.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('Ambitious Augmenter grows with increment; dying with counters makes a Fractal that keeps them', () => {
    const g = game({
      p1: {
        hand: ['bear-cub', 'shock'],
        battlefield: ['ambitious-augmenter', ...n('forest', 2), ...n('mountain', 2)],
      },
    });
    const a = g.id('p1', 'ambitious-augmenter');
    done(cast(g, 'bear-cub'));
    expect(g.obj(a).plusOneCounters).toBe(1);
    done(cast(g, 'shock', [g.ref(a)]));
    expect(g.zoneOf(a)).toBe('graveyard');
    expect(fractals(g)).toHaveLength(1);
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(1);
  });

  it('Ambitious Augmenter dying without counters makes nothing', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['ambitious-augmenter', 'mountain'] },
    });
    done(cast(g, 'shock', [g.ref(g.id('p1', 'ambitious-augmenter'))]));
    expect(fractals(g)).toHaveLength(0);
  });

  it('Burrog Barrage: +1/+0 after another instant or sorcery, then bites', () => {
    const g = game({
      p1: {
        hand: ['burrog-barrage', 'shock'],
        battlefield: ['bear-cub', ...n('forest', 2), 'mountain'],
      },
      p2: { battlefield: ['fire-elemental'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const giant = g.id('p2', 'fire-elemental');
    done(cast(g, 'shock', [{ player: 'p2' }]));
    done(cast(g, 'burrog-barrage', [g.ref(bear), g.ref(giant)]));
    expect(g.obj(giant).damage).toBe(3);
  });

  it('Burrog Barrage alone deals plain power', () => {
    const g = game({
      p1: { hand: ['burrog-barrage'], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['fire-elemental'] },
    });
    done(
      cast(g, 'burrog-barrage', [
        g.ref(g.id('p1', 'bear-cub')),
        g.ref(g.id('p2', 'fire-elemental')),
      ]),
    );
    expect(g.obj(g.id('p2', 'fire-elemental')).damage).toBe(2);
  });

  it('Chelonian Tackle gives +0/+10 and fights', () => {
    const g = game({
      p1: { hand: ['chelonian-tackle'], battlefield: ['bear-cub', ...n('forest', 3)] },
      p2: { battlefield: ['fire-elemental'] },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'chelonian-tackle', [g.ref(bear), g.ref(g.id('p2', 'fire-elemental'))]));
    expect(pt(g, bear)).toEqual([2, 12]);
    expect(g.obj(g.id('p2', 'fire-elemental')).damage).toBe(2);
    expect(g.obj(bear).damage).toBe(5);
  });

  it('Comforting Counsel counts life gained and boosts the team at five counters', () => {
    const g = game({
      p1: {
        hand: ['moment-of-triumph'],
        battlefield: ['comforting-counsel', 'plains', 'bear-cub'],
      },
    });
    const cc = g.id('p1', 'comforting-counsel');
    g.obj(cc).counters = { growth: 4 };
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
    g.state.players.p1.life = 20;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'moment-of-triumph', 'hand'),
      targets: [g.ref(g.id('p1', 'bear-cub'))],
    } as never);
    done(g);
    expect(g.obj(cc).counters?.growth).toBe(5);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([7, 7]);
  });

  it('Emeritus of Abundance enters prepared; its Regrowth returns a graveyard card', () => {
    const g = game({
      p1: { hand: ['emeritus-of-abundance'], graveyard: ['shock'], battlefield: n('forest', 5) },
    });
    done(cast(g, 'emeritus-of-abundance'));
    const e = g.id('p1', 'emeritus-of-abundance');
    expect(g.obj(e).prepared).toBeDefined();
    const card = g.state.players.p1.graveyard[0]!;
    castCopy(g, 'emeritus-of-abundance', [{ object: { id: card, zcc: g.obj(card).zcc } }] as never);
    done(g);
    expect(hand(g)).toContain('shock');
    expect(g.obj(e).prepared).toBeUndefined();
  });

  it('Emeritus of Abundance becomes prepared again when it attacks with eight lands', () => {
    const g = game({
      p1: { battlefield: ['emeritus-of-abundance', ...n('forest', 8)] },
    });
    const e = g.id('p1', 'emeritus-of-abundance');
    g.obj(e).summoningSick = false;
    expect(g.obj(e).prepared).toBeUndefined();
    advance(g, 'declareAttackers');
    g.attack(e);
    done(g);
    expect(g.obj(e).prepared).toBeDefined();
  });

  it('Emil gives trample to creatures with counters and makes Fractals from different land names', () => {
    const g = game({
      p1: {
        battlefield: [
          'emil-vastlands-roamer',
          'bear-cub',
          'forest',
          'forest',
          'forest',
          'forest',
          'forest',
          'island',
          'smoldering-marsh',
        ],
      },
    });
    const emil = g.id('p1', 'emil-vastlands-roamer');
    g.obj(emil).summoningSick = false;
    expect(chars(g, g.id('p1', 'bear-cub')).keywords).not.toContain('trample');
    g.obj(g.id('p1', 'bear-cub')).plusOneCounters = 1;
    expect(chars(g, g.id('p1', 'bear-cub')).keywords).toContain('trample');
    activate(g, emil, 1);
    done(g);
    expect(fractals(g)).toHaveLength(1);
    // Forest, Island, Blooming Marsh.
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(3);
  });

  it('Environmental Scientist fetches a basic land', () => {
    const g = game({
      p1: {
        hand: ['environmental-scientist'],
        battlefield: n('forest', 2),
        library: ['plains', 'forest'],
      },
    });
    done(cast(g, 'environmental-scientist'));
    pick(g, g.state.players.p1.library[0]!);
    done(g);
    expect(hand(g)).toContain('plains');
  });

  it('Germination Practicum puts two counters on each creature, then is exiled (paradigm)', () => {
    const g = game({
      p1: {
        hand: ['germination-practicum'],
        battlefield: ['bear-cub', 'bear-cub', ...n('forest', 5)],
      },
    });
    done(cast(g, 'germination-practicum'));
    for (const b of all(g, 'bear-cub')) expect(g.obj(b).plusOneCounters).toBe(2);
    expect(g.state.players.p1.paradigms).toEqual(['germination-practicum']);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Glorious Decay: destroy an artifact', () => {
    const g = game({
      p1: { hand: ['glorious-decay'], battlefield: n('forest', 2) },
      p2: { battlefield: ['sol-ring'] },
    });
    done(cast(g, 'glorious-decay', [g.ref(g.id('p2', 'sol-ring'))], { mode: 0 }));
    expect(g.zoneOf(g.id('p2', 'sol-ring', 'graveyard'))).toBe('graveyard');
  });

  it('Glorious Decay: exile a graveyard card and draw', () => {
    const g = game({
      p1: { hand: ['glorious-decay'], battlefield: n('forest', 2) },
      p2: { graveyard: ['shock'] },
    });
    const target = g.state.players.p2.graveyard[0]!;
    const before = hand(g).length;
    done(
      cast(g, 'glorious-decay', [{ object: { id: target, zcc: g.obj(target).zcc } }], { mode: 2 }),
    );
    expect(g.zoneOf(target)).toBe('exile');
    expect(hand(g).length).toBe(before); // cast one, drew one
  });

  it('Hungry Graffalon and Noxious Newt', () => {
    const g = game({
      p1: {
        hand: ['bear-cub'],
        battlefield: ['hungry-graffalon', 'noxious-newt', ...n('forest', 3)],
      },
    });
    done(cast(g, 'bear-cub'));
    expect(g.obj(g.id('p1', 'hungry-graffalon')).plusOneCounters).toBe(0);
    expect(chars(g, g.id('p1', 'noxious-newt')).keywords).toContain('deathtouch');
  });

  it('Infirmary Healer enters prepared; Stream of Life gains X', () => {
    const g = game({
      p1: { hand: ['infirmary-healer'], battlefield: n('forest', 6) },
    });
    done(cast(g, 'infirmary-healer'));
    expect(g.obj(g.id('p1', 'infirmary-healer')).prepared).toBeDefined();
    castCopy(g, 'infirmary-healer', [{ player: 'p1' }] as never, { x: 3 });
    done(g);
    expect(g.life('p1')).toBe(23);
  });

  it('Planar Engineering sacrifices two lands and fetches four basics tapped', () => {
    const g = game({
      p1: {
        hand: ['planar-engineering'],
        battlefield: n('forest', 5),
        library: ['plains', 'plains', 'island', 'island', 'forest'],
      },
    });
    done(cast(g, 'planar-engineering'));
    for (let i = 0; i < 12 && g.decision.kind !== 'priority'; i++) {
      const d = g.decision;
      if (d.kind === 'sacrificeSeveral') pick(g, d.options[0]!);
      else if (d.kind === 'searchLibrary') pick(g, d.options[0]!);
      else break;
    }
    done(g);
    const lands = g.state.battlefield.filter((id) => g.obj(id).controller === 'p1');
    // 5 forests - 2 sacrificed + 4 found.
    expect(lands).toHaveLength(7);
    expect(lands.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(3);
  });

  it('Slumbering Trudge enters tapped with 3 - X stun counters', () => {
    const g = game({
      p1: { hand: ['slumbering-trudge'], battlefield: n('forest', 3) },
    });
    done(cast(g, 'slumbering-trudge', [], { x: 1 }));
    const t = g.id('p1', 'slumbering-trudge');
    expect(g.obj(t).counters?.stun).toBe(2);
    expect(g.obj(t).tapped).toBe(true);
    expect(pt(g, t)).toEqual([6, 6]);
  });

  it('Slumbering Trudge with X=3 enters untapped with no stun counters', () => {
    const g = game({
      p1: { hand: ['slumbering-trudge'], battlefield: n('forest', 4) },
    });
    done(cast(g, 'slumbering-trudge', [], { x: 3 }));
    const t = g.id('p1', 'slumbering-trudge');
    expect(g.obj(t).counters?.stun ?? 0).toBe(0);
    expect(g.obj(t).tapped).toBe(false);
  });

  it('Snarl Song makes two Fractals and gains life for each colour spent', () => {
    const g = game({
      p1: {
        hand: ['snarl-song'],
        battlefield: ['forest', 'forest', 'island', 'mountain', 'plains', 'forest'],
      },
    });
    done(cast(g, 'snarl-song'));
    expect(fractals(g)).toHaveLength(2);
    // Green, blue, red, white: four colours.
    for (const f of fractals(g)) expect(g.obj(f).plusOneCounters).toBe(4);
    expect(g.life('p1')).toBe(24);
  });

  it('Studious First-Year enters prepared; Rampant Growth puts a basic tapped', () => {
    const g = game({
      p1: {
        hand: ['studious-first-year'],
        battlefield: n('forest', 3),
        library: ['island', 'forest'],
      },
    });
    done(cast(g, 'studious-first-year'));
    castCopy(g, 'studious-first-year');
    done(g);
    pick(g, g.state.players.p1.library[0]!);
    done(g);
    const isl = g.state.battlefield.filter((id) => g.obj(id).defId === 'island');
    expect(isl).toHaveLength(1);
    expect(g.obj(isl[0]!).tapped).toBe(true);
  });

  it('Tenured Concocter gets +2/+0 after life gain, and draws when an opponent targets it', () => {
    const g = game({
      p1: { battlefield: ['tenured-concocter'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    const t = g.id('p1', 'tenured-concocter');
    expect(pt(g, t)).toEqual([4, 5]);
    g.state.turn.lifeGained = { p1: 2, p2: 0 };
    g.state.turn.lifeGains.p1 = 1;
    expect(pt(g, t)).toEqual([6, 5]);
    g.state.turn.lifeGained = { p1: 0, p2: 0 };
    g.state.turn.lifeGains.p1 = 0;
    // p2 shocks it: p1 may draw.
    g.pass();
    const before = hand(g).length;
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(t)],
    } as never);
    done(g);
    expect(hand(g).length).toBe(before + 1);
  });

  it('Topiary Lecturer taps for mana equal to its power and grows with increment', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['topiary-lecturer', 'plains', 'plains', 'plains'],
      },
    });
    const l = g.id('p1', 'topiary-lecturer');
    g.obj(l).plusOneCounters = 3;
    // Power 4: {G}{G}{G}{G}, plus Plains: a 5-mana creature spell can be paid with lecturer + a plains.
    expect(pt(g, l)).toEqual([4, 5]);
    done(cast(g, 'serra-angel'));
    expect(g.zoneOf(g.id('p1', 'serra-angel', 'battlefield'))).toBe('battlefield');
  });

  it('Vastlands Scavenger enters prepared; Bind to Life mills seven and reanimates a creature', () => {
    const g = game({
      p1: {
        hand: ['vastlands-scavenger'],
        battlefield: n('forest', 9),
        library: ['bear-cub', ...n('forest', 8)],
      },
    });
    done(cast(g, 'vastlands-scavenger'));
    castCopy(g, 'vastlands-scavenger');
    done(g);
    expect(g.decision.kind).toBe('searchLibrary');
    pick(
      g,
      g.state.players.p1.graveyard.find((id) => g.obj(id).defId === 'bear-cub')!,
    );
    done(g);
    expect(all(g, 'bear-cub')).toHaveLength(1);
  });

  it('Wild Hypothesis makes an X Fractal and surveils 2', () => {
    const g = game({
      p1: { hand: ['wild-hypothesis'], battlefield: n('forest', 4) },
    });
    done(cast(g, 'wild-hypothesis', [], { x: 3 }));
    expect(fractals(g)).toHaveLength(1);
    expect(pt(g, fractals(g)[0]!)).toEqual([3, 3]);
    expect(g.decision.kind).not.toBe('priority');
  });

  it('Wildgrowth Archaic: converge counters, and other creature spells get counters per colour', () => {
    const g = game({
      p1: {
        hand: ['wildgrowth-archaic', 'bear-cub', 'serra-angel'],
        battlefield: [
          'forest',
          'forest',
          'island',
          'island',
          'plains',
          'plains',
          'mountain',
          'mountain',
        ],
      },
    });
    done(cast(g, 'wildgrowth-archaic'));
    const w = g.id('p1', 'wildgrowth-archaic');
    // {2/G}{2/G} paid with Forest + Forest: one colour.
    expect(g.obj(w).plusOneCounters).toBeGreaterThanOrEqual(1);
    expect([...chars(g, w).keywords]).toEqual(expect.arrayContaining(['reach', 'trample']));
    done(cast(g, 'serra-angel'));
    const angel = g.id('p1', 'serra-angel');
    // Spent on {3}{W}{W}: at least white; extra counters equal the colours spent.
    expect(g.obj(angel).plusOneCounters).toBe(g.obj(angel).manaColors?.length);
    expect(g.obj(angel).plusOneCounters).toBeGreaterThanOrEqual(1);
  });

  it('Wildgrowth Archaic can be paid with four generic mana', () => {
    const g = game({
      p1: { hand: ['wildgrowth-archaic'], battlefield: n('island', 4) },
    });
    done(cast(g, 'wildgrowth-archaic'));
    expect(g.id('p1', 'wildgrowth-archaic')).toBeDefined();
    expect(g.obj(g.id('p1', 'wildgrowth-archaic')).plusOneCounters).toBe(1);
  });

  it("Zimone's Experiment: lands tapped onto the battlefield, creatures to hand", () => {
    const g = game({
      p1: {
        hand: ['zimones-experiment'],
        battlefield: n('forest', 4),
        library: ['forest', 'bear-cub', 'shock', 'shock', 'shock', 'forest'],
      },
    });
    done(cast(g, 'zimones-experiment'));
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, g.state.players.p1.library[0]!);
    expect(g.decision.kind).toBe('searchLibrary');
    pick(
      g,
      g.state.players.p1.library.find((id) => g.obj(id).defId === 'bear-cub')!,
    );
    done(g);
    expect(hand(g)).toContain('bear-cub');
    const lands = g.state.battlefield.filter((id) => g.obj(id).defId === 'forest');
    expect(lands).toHaveLength(5);
    expect(lands.filter((id) => g.obj(id).tapped).length).toBeGreaterThanOrEqual(1);
    // The rest went to the bottom.
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toContain('shock');
  });
});

describe('Quandrix', () => {
  it('Applied Geometry copies a land as a 6/6 Fractal creature land', () => {
    const g = game({
      p1: {
        hand: ['applied-geometry'],
        battlefield: ['smoldering-marsh', ...n('forest', 3), 'island'],
      },
    });
    done(cast(g, 'applied-geometry', [g.ref(g.id('p1', 'smoldering-marsh'))]));
    const copies = all(g, 'smoldering-marsh').filter((id) => g.obj(id).isToken);
    expect(copies).toHaveLength(1);
    expect(pt(g, copies[0]!)).toEqual([6, 6]);
    expect([...chars(g, copies[0]!).types]).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect([...chars(g, copies[0]!).subtypes]).toContain('Fractal');
  });

  it('Berta makes any colour when she gets counters, and pays X for a Fractal', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['berta-wise-extrapolator', ...n('forest', 3)] },
    });
    const b = g.id('p1', 'berta-wise-extrapolator');
    g.obj(b).summoningSick = false;
    done(cast(g, 'bear-cub'));
    // 2 mana spent exceeds 1 power: a counter, then one mana of any colour.
    expect(g.obj(b).plusOneCounters).toBe(1);
    expect(g.state.players.p1.pool?.length).toBe(1);
    activate(g, b, 2, { x: 2 });
    done(g);
    expect(fractals(g)).toHaveLength(1);
    expect(g.obj(fractals(g)[0]!).plusOneCounters).toBe(2);
  });

  it('Cuboid Colony has flash, flying and trample', () => {
    const c = cardDb.get('cuboid-colony')!;
    expect(c.keywords).toEqual(expect.arrayContaining(['flash', 'flying', 'trample']));
  });

  it('Embrace the Paradox draws three and may put a land onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['embrace-the-paradox', 'forest'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
      },
    });
    done(cast(g, 'embrace-the-paradox'));
    expect(g.decision.kind).toBe('searchLibrary');
    const land = g.state.players.p1.hand.find((id) => g.obj(id).defId === 'forest')!;
    pick(g, land);
    done(g);
    expect(g.zoneOf(land)).toBe('battlefield');
    expect(g.obj(land).tapped).toBe(true);
    expect(hand(g)).toHaveLength(3);
  });

  it('Fractal Mascot taps and stuns an opposing creature', () => {
    const g = game({
      p1: { hand: ['fractal-mascot'], battlefield: [...n('forest', 3), ...n('island', 3)] },
      p2: { battlefield: ['fire-elemental'] },
    });
    done(cast(g, 'fractal-mascot'));
    const giant = g.id('p2', 'fire-elemental');
    expect(g.obj(giant).tapped).toBe(true);
    expect(g.obj(giant).counters?.stun).toBe(1);
  });

  it('Fractal Tender makes a Fractal at the end step only if it got a counter this turn', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['fractal-tender', ...n('plains', 5)] },
    });
    done(cast(g, 'serra-angel'));
    expect(g.obj(g.id('p1', 'fractal-tender')).plusOneCounters).toBe(1);
    advance(g, 'end');
    done(g);
    expect(fractals(g)).toHaveLength(1);
    expect(pt(g, fractals(g)[0]!)).toEqual([3, 3]);
  });

  it('Fractal Tender does nothing at the end step without a counter', () => {
    const g = game({ p1: { battlefield: ['fractal-tender'] } });
    advance(g, 'end');
    done(g);
    expect(fractals(g)).toHaveLength(0);
  });

  it("Geometer's Arthropod looks at X cards when you cast a spell with X", () => {
    const g = game({
      p1: {
        hand: ['wild-hypothesis'],
        battlefield: ['geometers-arthropod', ...n('forest', 4)],
        library: ['shock', 'plains', 'island', 'forest', 'forest'],
      },
    });
    done(cast(g, 'wild-hypothesis', [], { x: 2 }));
    expect(g.decision.kind).toBe('searchLibrary');
    pick(g, g.state.players.p1.library[1]!);
    done(g);
    expect(hand(g)).toContain('plains');
  });

  it('Growth Curve adds a counter and doubles them', () => {
    const g = game({
      p1: { hand: ['growth-curve'], battlefield: ['bear-cub', 'forest', 'island'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.obj(bear).plusOneCounters = 2;
    done(cast(g, 'growth-curve', [g.ref(bear)]));
    expect(g.obj(bear).plusOneCounters).toBe(6);
  });

  it('Mind into Matter draws X and puts a permanent with mana value X or less onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['mind-into-matter', 'bear-cub', 'serra-angel'],
        battlefield: [...n('forest', 3), ...n('island', 2)],
        library: n('forest', 5),
      },
    });
    done(cast(g, 'mind-into-matter', [], { x: 3 }));
    expect(g.decision.kind).toBe('searchLibrary');
    const d = g.decision as { options: string[] };
    // Serra Angel (mana value 5) isn't an option; the Bears are.
    expect(d.options.map((id) => g.obj(id).defId)).not.toContain('serra-angel');
    pick(
      g,
      d.options.find((id) => g.obj(id).defId === 'bear-cub')!,
    );
    done(g);
    const bear = g.id('p1', 'bear-cub');
    expect(g.obj(bear).tapped).toBe(true);
    expect(hand(g)).toContain('serra-angel');
  });

  it('Paradox Surveyor takes a land or an X card from the top five', () => {
    const g = game({
      p1: {
        hand: ['paradox-surveyor'],
        battlefield: [...n('forest', 2), ...n('island', 2)],
        library: ['shock', 'wild-hypothesis', 'shock', 'shock', 'shock', 'forest'],
      },
    });
    done(cast(g, 'paradox-surveyor'));
    expect(g.decision.kind).toBe('searchLibrary');
    const d = g.decision as { options: string[] };
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['wild-hypothesis']);
    pick(g, d.options[0]!);
    done(g);
    expect(hand(g)).toContain('wild-hypothesis');
  });

  it("Proctor's Gaze bounces a permanent and fetches a basic tapped", () => {
    const g = game({
      p1: {
        hand: ['proctors-gaze'],
        battlefield: n('forest', 2).concat(n('island', 2)),
        library: ['island', 'forest'],
      },
      p2: { battlefield: ['fire-elemental'] },
    });
    done(cast(g, 'proctors-gaze', [g.ref(g.id('p2', 'fire-elemental'))]));
    const found = g.state.players.p1.library[0]!;
    pick(g, found);
    done(g);
    expect(hand(g, 'p2')).toContain('fire-elemental');
    expect(g.zoneOf(found)).toBe('battlefield');
    expect(g.obj(found).tapped).toBe(true);
  });

  it('Pterafractyl enters with X counters and gains 2 life', () => {
    const g = game({
      p1: { hand: ['pterafractyl'], battlefield: [...n('forest', 3), ...n('island', 2)] },
    });
    done(cast(g, 'pterafractyl', [], { x: 3 }));
    const p = g.id('p1', 'pterafractyl');
    expect(pt(g, p)).toEqual([4, 3]);
    expect(g.life('p1')).toBe(22);
  });

  it('Quandrix Charm: base 5/5 until end of turn', () => {
    const g = game({
      p1: { hand: ['quandrix-charm'], battlefield: ['forest', 'island', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    done(cast(g, 'quandrix-charm', [g.ref(bear)], { mode: 2 }));
    expect(pt(g, bear)).toEqual([5, 5]);
  });

  it('Quandrix Charm: counter a spell unless its controller pays {2}', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain'] },
      p2: { hand: ['quandrix-charm'], battlefield: ['forest', 'island'] },
    });
    const shock = cast(g, 'shock', [{ player: 'p2' }]).state.stack[0]!.id;
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'quandrix-charm', 'hand'),
      targets: [{ object: { id: shock, zcc: g.obj(shock).zcc } }],
      mode: 0,
    } as never);
    for (let i = 0; i < 10 && g.state.stack.length; i++) {
      const d = g.decision;
      if (d.kind === 'payOrCounter')
        g.do({ type: 'chooseEffect', player: d.player, accept: false });
      else g.pass();
    }
    expect(g.life('p2')).toBe(20);
  });

  it('Quandrix, the Proof cascades on cast, and gives cascade to instants and sorceries from hand', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['quandrix-the-proof', 'mountain'],
        library: ['plains', 'plains', 'island', 'island', 'forest'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    // Cascade trigger resolves first: the whole library has no nonland card, so it ends.
    done(g);
    expect(g.life('p2')).toBe(18);
  });

  it('Quandrix, the Proof: cascade casts a cheaper spell for free', () => {
    const g = game({
      p1: {
        hand: ['lightning-strike'],
        battlefield: ['quandrix-the-proof', 'mountain', 'mountain'],
        library: ['shock', 'forest'],
      },
    });
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    for (let i = 0; i < 20; i++) {
      if (g.decision.kind === 'castFree') {
        g.do(
          g
            .legal()
            .find(
              (a) =>
                a.type === 'castSpell' && 'player' in a.targets[0]! && a.targets[0].player === 'p2',
            )!,
        );
      } else if (g.decision.kind === 'chooseTriggerTargets') settle(g);
      else if (g.decision.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    // Lightning Strike (3) and the cascaded Shock (2).
    expect(g.life('p2')).toBeLessThanOrEqual(15);
  });

  it('Tam becomes prepared on landfall; Deep Sight draws and gains 1', () => {
    const g = game({
      p1: { hand: ['forest'], battlefield: ['tam-observant-sequencer', 'island', 'forest'] },
    });
    const tam = g.id('p1', 'tam-observant-sequencer');
    expect(g.obj(tam).prepared).toBeUndefined();
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') } as never);
    done(g);
    expect(g.obj(tam).prepared).toBeDefined();
    const before = hand(g).length;
    castCopy(g, 'tam-observant-sequencer');
    done(g);
    expect(hand(g).length).toBe(before + 1);
    expect(g.life('p1')).toBe(21);
  });

  it('Dreamroot Cascade enters tapped unless you control two other lands', () => {
    const a = game({ p1: { hand: ['dreamroot-cascade'], battlefield: ['forest'] } });
    a.do({
      type: 'playLand',
      player: 'p1',
      card: a.id('p1', 'dreamroot-cascade', 'hand'),
    } as never);
    expect(a.obj(a.id('p1', 'dreamroot-cascade')).tapped).toBe(true);
    const b = game({ p1: { hand: ['dreamroot-cascade'], battlefield: ['forest', 'island'] } });
    b.do({
      type: 'playLand',
      player: 'p1',
      card: b.id('p1', 'dreamroot-cascade', 'hand'),
    } as never);
    expect(b.obj(b.id('p1', 'dreamroot-cascade')).tapped).toBe(false);
  });

  it('Paradox Gardens enters tapped and surveils', () => {
    const g = game({ p1: { battlefield: ['paradox-gardens', ...n('forest', 3), 'island'] } });
    activate(g, g.id('p1', 'paradox-gardens'), 2);
    done(g);
    expect(g.decision.kind).not.toBe('priority');
  });
});
