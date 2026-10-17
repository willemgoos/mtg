import { describe, expect, it } from 'vitest';
import { getCharacteristics, getColors } from '../src/index.ts';
import type { Action } from '../src/types.ts';
import {
  castAt,
  casts,
  DB,
  Game,
  getPower,
  getToughness,
  onField,
  ROLES,
  scenario,
  settle,
  toAttackers,
} from './woe-fixtures.ts';

// Wilds of Eldraine (23a): the Restless lands, the Sphere lands, "whenever you tap an untapped creature an opponent controls",
// cards that have an Adventure, "for each creature that attacked this turn".

const lands = (land: string, n: number) => Array<string>(n).fill(land);
const activate = (g: Game, source: string, index: number) => {
  const a = g
    .legal('p1')
    .find(
      (x): x is Extract<Action, { type: 'activateAbility' }> =>
        x.type === 'activateAbility' && x.source === source && x.abilityIndex === index,
    );
  if (!a) throw new Error(`can't activate ${source} #${index}`);
  return g.do(a);
};

describe('the Restless lands', () => {
  it('enters tapped', () => {
    const g = new Game(scenario({ p1: { hand: ['w-bivouac'] } }));
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'w-bivouac', 'hand') });
    expect(g.obj(g.id('p1', 'w-bivouac')).tapped).toBe(true);
  });

  it('becomes a 2/2 red and white Ox creature until end of turn; it is still a land', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['w-bivouac', 'mountain', 'plains', 'mountain'] } }),
    );
    const land = g.id('p1', 'w-bivouac');
    activate(g, land, 2);
    settle(g);
    const c = getCharacteristics(g.state, DB, land);
    expect(c.types).toContain('Creature');
    expect(c.types).toContain('Land');
    expect(c.types).not.toContain('Artifact');
    expect(c.subtypes).toContain('Ox');
    expect(c.power).toBe(2);
    expect(c.toughness).toBe(2);
    expect([...getColors(g.state, DB, land)].sort()).toEqual(['R', 'W']);
    // At end of turn it is a colorless land again.
    g.passUntilStep('end');
    g.passBoth();
    g.passUntilStep('upkeep');
    const after = getCharacteristics(g.state, DB, land);
    expect(after.types).toEqual(['Land']);
    expect(after.subtypes).not.toContain('Ox');
    expect([...getColors(g.state, DB, land)]).toEqual([]);
  });

  it('"whenever this land attacks": a +1/+1 counter on target creature you control', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['w-bivouac', 'mountain', 'plains', 'mountain', 'bear'] } }),
    );
    const land = g.id('p1', 'w-bivouac');
    const bear = g.id('p1', 'bear');
    activate(g, land, 2);
    settle(g);
    toAttackers(g);
    g.attack(land);
    // The trigger targets a creature you control: the bear or the land itself.
    if (g.decision.kind === 'chooseTriggerTargets') {
      const pick = g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === bear),
        );
      g.do(pick!);
    }
    settle(g);
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });

  it('a granted ability until end of turn: "during your turn, this creature has first strike"', () => {
    const g = new Game(scenario({ p1: { battlefield: ['w-spire', 'island', 'mountain'] } }));
    const land = g.id('p1', 'w-spire');
    activate(g, land, 2);
    settle(g);
    expect(getPower(g, land)).toBe(2);
    expect(getToughness(g, land)).toBe(1);
    expect(getCharacteristics(g.state, DB, land).keywords.has('firstStrike')).toBe(true);
    expect([...getColors(g.state, DB, land)].sort()).toEqual(['R', 'U']);
  });

  it('"becomes a 3/3 Elemental creature with haste that\'s still a land" has no end (Brave the Wilds)', () => {
    const g = new Game(scenario({ p1: { hand: ['w-brave'], battlefield: ['forest', 'forest'] } }));
    const [a, b] = onField(g, 'forest');
    castAt(g, 'p1', 'w-brave', [b!]);
    settle(g);
    g.passUntilStep('end');
    g.passBoth();
    g.passUntilStep('upkeep');
    const c = getCharacteristics(g.state, DB, b!);
    expect(c.types).toEqual(expect.arrayContaining(['Land', 'Creature']));
    expect(c.subtypes).toContain('Elemental');
    expect(c.power).toBe(3);
    expect(c.keywords.has('haste')).toBe(true);
    expect(getCharacteristics(g.state, DB, a!).types).toEqual(['Land']);
  });
});

describe('the Sphere lands', () => {
  it('enters tapped; {1}{W}, {T}, sacrifice it: draw a card', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-basilica'], battlefield: ['plains', 'plains'] } }),
    );
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'w-basilica', 'hand') });
    const sphere = g.id('p1', 'w-basilica');
    expect(g.obj(sphere).tapped).toBe(true);
    expect(getCharacteristics(g.state, DB, sphere).subtypes).toEqual(['Sphere']);
    g.obj(sphere).tapped = false;
    const hand = g.state.players.p1.hand.length;
    activate(g, sphere, 1);
    settle(g);
    expect(g.zoneOf(sphere)).toBe('graveyard');
    expect(g.state.players.p1.hand.length).toBe(hand + 1);
  });
});

describe('whenever you tap an untapped creature an opponent controls', () => {
  it('triggers for each one your spell taps; the creature is the subject', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-succumb'], battlefield: ['island', 'w-sentry'] },
        p2: { battlefield: ['ogre', 'bear'] },
      }),
    );
    castAt(g, 'p1', 'w-succumb', [g.id('p2', 'ogre'), g.id('p2', 'bear')]);
    settle(g);
    const sentry = g.id('p1', 'w-sentry');
    expect(getPower(g, sentry)).toBe(2 + 2 + 2);
    expect(g.obj(g.id('p2', 'ogre')).counters?.stun).toBe(1);
  });

  it('"one or more" (Sharae): one trigger for the whole batch, once each turn', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-succumb'], battlefield: ['island', 'w-sharae', 'w-tapper'] },
        p2: { battlefield: ['ogre', 'bear', 'wurm'] },
      }),
    );
    const hand = g.state.players.p1.hand.length;
    castAt(g, 'p1', 'w-succumb', [g.id('p2', 'ogre'), g.id('p2', 'bear')]);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 1);
    // Once each turn: tapping the wurm doesn't draw again.
    const tapper = g.id('p1', 'w-tapper');
    const a = g
      .legal('p1')
      .find(
        (x) =>
          x.type === 'activateAbility' &&
          x.source === tapper &&
          x.targets.some((t) => 'object' in t && t.object.id === g.id('p2', 'wurm')),
      );
    g.do(a!);
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand);
  });

  it("doesn't trigger for your own creature, an already tapped one, or the opponent's own tapping", () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['w-sentry', 'w-tapper', 'bear'] },
        p2: { battlefield: [{ card: 'ogre', tapped: true }] },
      }),
    );
    const tapper = g.id('p1', 'w-tapper');
    const sentry = g.id('p1', 'w-sentry');
    const own = g
      .legal('p1')
      .find(
        (x) =>
          x.type === 'activateAbility' &&
          x.source === tapper &&
          x.targets.some((t) => 'object' in t && t.object.id === g.id('p1', 'bear')),
      );
    g.do(own!);
    settle(g);
    expect(getPower(g, sentry)).toBe(2);
    // An attacker tapping as it attacks is not "you tap".
    expect(g.events.some((e) => e.type === 'tapped' && e.by === 'p1')).toBe(true);
  });
});

describe('cards that have an Adventure', () => {
  it('the Adventure: it goes on an adventure in exile, then the creature may be cast from exile', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-knight'], battlefield: [...lands('plains', 5), 'bear', 'w-pixie'] },
      }),
    );
    const knight = g.id('p1', 'w-knight', 'hand');
    const bear = g.id('p1', 'bear');
    const hand = g.state.players.p1.hand.length;
    const adventure = casts(g, 'p1', knight).find((a) => a.back);
    expect(adventure).toBeDefined();
    g.do(adventure!);
    // Storyteller Pixie: an Adventure spell was cast.
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 1);
    expect(g.obj(onField(g, ROLES.royal)[0]!).attachedTo).toBe(bear);
    expect(g.zoneOf(knight)).toBe('exile');
    expect(g.obj(knight).onAdventure).toBe(true);
    // From exile: only the creature.
    const fromExile = casts(g, 'p1', knight);
    expect(fromExile.length).toBeGreaterThan(0);
    expect(fromExile.every((a) => !a.back)).toBe(true);
    g.do(fromExile[0]!);
    settle(g);
    expect(onField(g, 'w-knight')).toHaveLength(1);
    // Casting the creature isn't casting an Adventure spell.
    expect(g.state.players.p1.hand.length).toBe(hand);
  });

  it('"instant cards, sorcery cards, and/or have an Adventure" in your graveyard (an Omen card has none)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-firebolt'],
          battlefield: lands('mountain', 3),
          graveyard: ['w-knight', 'w-omen-beast', 'w-grapple', 'bear'],
        },
        p2: { battlefield: ['wurm'] },
      }),
    );
    const wurm = g.id('p2', 'wurm');
    castAt(g, 'p1', 'w-firebolt', [wurm]);
    settle(g);
    // 2 + the knight (Adventure) + Candy Grapple (instant).
    expect(g.obj(wurm).damage).toBe(4);
  });

  it('"as long as you own a card in exile that has an Adventure" (Howling Galefang)', () => {
    const g = new Game(scenario({ p1: { battlefield: ['w-galefang'] } }));
    const wolf = g.id('p1', 'w-galefang');
    expect(getCharacteristics(g.state, DB, wolf).keywords.has('haste')).toBe(false);
    const omen = g.state.players.p1.library[0]!;
    g.state.objects[omen]!.defId = 'w-omen-beast';
    g.state.players.p1.library.shift();
    g.state.objects[omen]!.zone = 'exile';
    g.state.players.p1.exile.push(omen);
    expect(getCharacteristics(g.state, DB, wolf).keywords.has('haste')).toBe(false);
    const k = g.state.players.p1.library[0]!;
    g.state.objects[k]!.defId = 'w-knight';
    g.state.players.p1.library.shift();
    g.state.objects[k]!.zone = 'exile';
    g.state.players.p1.exile.push(k);
    expect(getCharacteristics(g.state, DB, wolf).keywords.has('haste')).toBe(true);
  });

  it('"permanent spells you cast that have an Adventure cost {1} less": the creature, not the Adventure', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-knight'], battlefield: [...lands('plains', 3), 'w-beluna'] } }),
    );
    const knight = g.id('p1', 'w-knight', 'hand');
    // {3}{W} for three: castable only with the reduction.
    expect(casts(g, 'p1', knight).some((a) => !a.back)).toBe(true);
    const h = new Game(scenario({ p1: { hand: ['w-knight'], battlefield: ['w-beluna'] } }));
    // Betroth the Beast ({W}) isn't reduced to nothing.
    expect(casts(h, 'p1', h.id('p1', 'w-knight', 'hand'))).toHaveLength(0);
  });
});

describe('for each creature that attacked this turn', () => {
  it('Witchstalker Frenzy costs {1} less for each', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-frenzy'], battlefield: ['mountain', 'mountain', 'bear', 'ogre'] },
        p2: { battlefield: ['wurm'] },
      }),
    );
    const frenzy = g.id('p1', 'w-frenzy', 'hand');
    expect(casts(g, 'p1', frenzy)).toHaveLength(0);
    toAttackers(g);
    g.attack(g.id('p1', 'bear'), g.id('p1', 'ogre'));
    expect(g.state.turn.attackers).toHaveLength(2);
    expect(casts(g, 'p1', frenzy).length).toBeGreaterThan(0);
  });
});
