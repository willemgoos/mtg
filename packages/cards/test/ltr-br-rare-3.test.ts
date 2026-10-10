import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cast } from './blb-helpers.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  choose,
  done,
  game,
  gy,
  labels,
  n,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb, slug } from '../src/index.ts';

// The Lord of the Rings 21d: the black and red rares of the random slot (part three: Display of Power, Fall of Cair Andros, Glóin,
// Hew the Entwood).

const LIONS = 'savannah-lions';
const ELVES = 'llanowar-elves';
const BALOTH = 'rumbling-baloth';
const ARMY = 'ltr-orc-army-token';
const TREASURE = 'treasure-token';
const ALESHA = 'krenko-mob-boss';
const mountains = (k: number) => n('mountain', k);
const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') => board(g, defId, p);

describe('Display of Power', () => {
  const DISPLAY = 'display-of-power';
  const pickedOf = (g: GameDriver) => {
    const d = g.decision;
    return d.kind === 'spellTargets' ? d.picked : [];
  };
  /** Casts Display of Power on these spells (one at a time, then done). */
  const castDisplay = (g: GameDriver, spells: string[]) => {
    cast(g, DISPLAY);
    for (const s of spells) {
      expect(g.decision.kind).toBe('spellTargets');
      g.do({ type: 'chooseTargets', player: g.actor, targets: [...pickedOf(g), g.ref(s)] });
    }
    expect(g.decision.kind).toBe('spellTargets');
    g.do({ type: 'chooseTargets', player: g.actor, targets: pickedOf(g) });
  };
  const shockOn = (g: GameDriver, target: string) => {
    cast(g, 'shock', [g.ref(target)]);
    return g.state.stack[g.state.stack.length - 1]!.id;
  };

  it("can't be copied", () => {
    expect(cardDb.get(DISPLAY)!.cantBeCopied).toBe(true);
  });

  it('copies an instant; the copy keeps its target, or you choose a new one', () => {
    const g = game({
      p1: { hand: ['shock', DISPLAY], battlefield: mountains(4) },
      p2: { battlefield: [ELVES, BALOTH] },
    });
    const elves = g.id('p2', ELVES);
    const shock = shockOn(g, elves);
    castDisplay(g, [shock]);
    g.pass();
    g.pass();
    // Display resolves: a copy; "you may choose new targets".
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)[0]).toMatch(/Keep the same targets/);
    expect(labels(g).length).toBeGreaterThan(2);
    // Point the copy at the opponent instead.
    choose(g, /Your opponent/);
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(gy(g, 'p2')).toEqual([ELVES]);
  });

  it('keeping the same targets: both spells hit the same creature', () => {
    const g = game({
      p1: { hand: ['shock', DISPLAY], battlefield: mountains(4) },
      p2: { battlefield: [BALOTH] },
    });
    const baloth = g.id('p2', BALOTH);
    const shock = shockOn(g, baloth);
    castDisplay(g, [shock]);
    g.pass();
    g.pass();
    choose(g, /Keep/);
    done(g);
    // 2 + 2 = 4 damage kills the 4/4.
    expect(gy(g, 'p2')).toEqual([BALOTH]);
    expect(g.life('p2')).toBe(20);
  });

  it('copies any number of spells: one copy for each target', () => {
    const g = game({
      p1: { hand: ['shock', 'shock', DISPLAY], battlefield: mountains(5) },
      p2: { battlefield: [ELVES] },
    });
    const first = shockOn(g, g.id('p2', ELVES));
    // The second Shock goes at the opponent's face.
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.state.players.p1.hand.find((id) => g.obj(id).defId === 'shock')!,
      targets: [{ player: 'p2' }],
    });
    const second = g.state.stack[g.state.stack.length - 1]!.id;
    castDisplay(g, [first, second]);
    g.pass();
    g.pass();
    // Two copies, each with its own choice of new targets.
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /Keep/);
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /Keep/);
    done(g);
    expect(gy(g, 'p2')).toEqual([ELVES]);
    // The second Shock and its copy: 4 damage to the face.
    expect(g.life('p2')).toBe(16);
  });

  it('can be cast with no targets at all', () => {
    const g = game({ p1: { hand: [DISPLAY], battlefield: mountains(3) } });
    castDisplay(g, []);
    done(g);
    expect(gy(g)).toEqual([DISPLAY]);
  });

  it("a creature spell isn't a legal target (instant and/or sorcery spells only)", () => {
    const g = game({
      p1: { hand: [LIONS, DISPLAY], battlefield: [...mountains(3), 'plains'] },
    });
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', LIONS, 'hand'), targets: [] });
    cast(g, DISPLAY);
    expect(g.decision.kind).toBe('spellTargets');
    // Only "done" is on offer.
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(picks.every((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
  });

  it("can't target itself", () => {
    const g = game({ p1: { hand: [DISPLAY], battlefield: mountains(3) } });
    cast(g, DISPLAY);
    const picks = g.legal().filter((a) => a.type === 'chooseTargets');
    expect(picks.every((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
  });

  it("copies the opponent's spell too, and you control the copy", () => {
    const g = game({
      p1: { hand: [DISPLAY], battlefield: mountains(3) },
      p2: { hand: ['shock'], battlefield: mountains(1) },
      active: 'p2',
    });
    // The opponent shocks p1's face; p1 copies it and sends the copy back.
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [{ player: 'p1' }],
    });
    const shock = g.state.stack[g.state.stack.length - 1]!.id;
    g.pass(); // p2 passes; p1 holds priority now
    castDisplay(g, [shock]);
    g.pass();
    g.pass();
    choose(g, /Your opponent/);
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Fall of Cair Andros', () => {
  const FALL = 'fall-of-cair-andros';

  it("whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X (X = the excess)", () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: [FALL, ...mountains(2)] },
      p2: { battlefield: [ELVES] },
    });
    cast(g, 'lightning-strike', [g.ref(g.id('p2', ELVES))]);
    done(g);
    // Lightning Strike deals 3 to a 1/1: 2 excess.
    const army = bf(g, ARMY);
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([2, 2]);
  });

  it('no excess, no Army', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [FALL, ...mountains(2)] },
      p2: { battlefield: [BALOTH] },
    });
    cast(g, 'shock', [g.ref(g.id('p2', BALOTH))]);
    done(g);
    expect(bf(g, ARMY)).toHaveLength(0);
  });

  it("your own creatures' excess damage doesn't count", () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [FALL, ...mountains(2), ELVES] },
    });
    cast(g, 'shock', [g.ref(g.id('p1', ELVES))]);
    done(g);
    expect(bf(g, ARMY)).toHaveLength(0);
  });

  it('each creature dealt excess damage triggers separately and they add to the same Army', () => {
    const g = game({
      p1: { hand: ['fear-fire-foes'], battlefield: [FALL, ...mountains(4)] },
      p2: { battlefield: [ELVES, LIONS] },
    });
    // Fear, Fire, Foes! X=3: 3 damage to the target (2 excess on a 1/1) and 1 to each other creature with the same controller
    // (the 2/1 Lions: no excess).
    cast(g, 'fear-fire-foes', [g.ref(g.id('p2', ELVES))], { x: 3 });
    done(g);
    const army = bf(g, ARMY);
    expect(army).toHaveLength(1);
    expect(g.obj(army[0]!).plusOneCounters).toBe(2);
  });

  it('{7}{R}: deals 7 damage to target creature', () => {
    const g = game({
      p1: { battlefield: [FALL, ...mountains(8)] },
      p2: { battlefield: [BALOTH] },
    });
    activate(g, g.id('p1', FALL), 1, [g.ref(g.id('p2', BALOTH))]);
    done(g);
    expect(gy(g, 'p2')).toEqual([BALOTH]);
    // Seven damage on a 4/4: three excess, noncombat, so an Army of 3.
    const army = bf(g, ARMY);
    expect(army).toHaveLength(1);
    expect(g.obj(army[0]!).plusOneCounters).toBe(3);
  });

  it('the activated ability needs {7}{R}', () => {
    const g = game({
      p1: { battlefield: [FALL, ...mountains(7)] },
      p2: { battlefield: [BALOTH] },
    });
    expect(abilityActions(g, g.id('p1', FALL), 1)).toHaveLength(0);
  });
});

describe('Glóin, Dwarf Emissary', () => {
  const GLOIN = slug('Glóin, Dwarf Emissary');
  const setup = (hand: string[] = [], extra: string[] = []) =>
    game({
      p1: { hand, battlefield: [GLOIN, ...mountains(5), ...extra] },
      p2: { battlefield: [ELVES] },
    });

  it('whenever you cast a historic spell (artifact), create a Treasure token', () => {
    const g = setup(["pirates-cutlass"]);
    cast(g, 'pirates-cutlass');
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(1);
  });

  it('a legendary spell is historic too', () => {
    const g = setup([ALESHA]);
    expect(cardDb.get(ALESHA)!.supertypes).toContain('Legendary');
    void g;
    const g2 = setup([ALESHA]);
    g2.do(casts(g2, ALESHA)[0]!);
    done(g2);
    expect(bf(g2, TREASURE).length).toBe(1);
  });

  it('a Saga is historic too', () => {
    const g = setup(['book-of-mazarbul']);
    cast(g, 'book-of-mazarbul');
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(1);
  });

  it("a spell that isn't historic does nothing", () => {
    const g = setup(['shock']);
    cast(g, 'shock', [g.ref(g.id('p2', ELVES))]);
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(0);
  });

  it('only once each turn', () => {
    const g = setup(['pirates-cutlass', 'fireshrieker'], mountains(4));
    cast(g, 'pirates-cutlass');
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(1);
    cast(g, 'fireshrieker');
    done(g);
    expect(bf(g, TREASURE)).toHaveLength(1);
  });

  it("an opponent's historic spell doesn't trigger it", () => {
    const g = game({
      p1: { battlefield: [GLOIN] },
      p2: { hand: ['pirates-cutlass'], battlefield: n('plains', 4) },
      active: 'p2',
    });
    cast(g, 'pirates-cutlass');
    done(g);
    expect(bf(g, TREASURE, 'p1')).toHaveLength(0);
  });

  it('{T}, Sacrifice a Treasure: goad target creature', () => {
    const g = setup([], [TREASURE]);
    const gloin = g.id('p1', GLOIN);
    const elves = g.id('p2', ELVES);
    const acts = abilityActions(g, gloin, 1);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts.find((a) => a.type === 'activateAbility' && JSON.stringify(a.targets).includes(elves))!);
    done(g);
    expect(g.obj(gloin).tapped).toBe(true);
    expect(bf(g, TREASURE)).toHaveLength(0);
    expect(g.state.effects.some((e) => e.mustAttack && e.affected.id === elves)).toBe(true);
  });

  it('the goaded creature attacks each combat if able on its controller’s turn', () => {
    const g = setup([], [TREASURE]);
    const elves = g.id('p2', ELVES);
    const acts = abilityActions(g, g.id('p1', GLOIN), 1);
    g.do(acts.find((a) => a.type === 'activateAbility' && JSON.stringify(a.targets).includes(elves))!);
    done(g);
    for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    const d = g.decision;
    expect(d.kind).toBe('declareAttackers');
    if (d.kind !== 'declareAttackers') return;
    expect(d.declared.map((x) => x.id)).toContain(elves);
  });

  it('needs a Treasure to sacrifice and an untapped Glóin', () => {
    const g = setup();
    expect(abilityActions(g, g.id('p1', GLOIN), 1)).toHaveLength(0);
    const g2 = game({
      p1: { battlefield: [{ card: GLOIN, tapped: true }, TREASURE, ...mountains(2)] },
      p2: { battlefield: [ELVES] },
    });
    expect(abilityActions(g2, g2.id('p1', GLOIN), 1)).toHaveLength(0);
  });
});

describe('Hew the Entwood', () => {
  const HEW = 'hew-the-entwood';
  /** Five Mountains for the cost, `lands` more lands, and the library top-first. */
  const setup = (lands: string[], library: string[]) =>
    game({
      p1: { hand: [HEW], battlefield: [...mountains(5), ...lands], library: [...library, ...n('forest', 6)] },
    });
  const sacLabel = (g: GameDriver) => labels(g).filter((l) => l.startsWith('Sacrifice'));

  it('sacrifice no lands: nothing is revealed and nothing else happens', () => {
    const g = setup([], ['celestial-armor', 'forest']);
    cast(g, HEW);
    stop(g);
    // The first prompt: sacrifice lands, "Done" first.
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /^Done$/);
    done(g);
    expect(g.state.players.p1.library[0]).toBe(g.state.players.p1.library[0]);
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId).slice(0, 2)).toEqual([
      'celestial-armor',
      'forest',
    ]);
    expect(bf(g, 'celestial-armor')).toHaveLength(0);
  });

  it('sacrifices lands one at a time (including the ones tapped for the cost), reveals that many cards', () => {
    const g = setup(n('forest', 2), ['celestial-armor', 'forest', 'shock']);
    cast(g, HEW);
    stop(g);
    // Prompt: the lands on offer are numbered by name and state.
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)[0]).toBe('Done');
    expect(sacLabel(g)).toEqual(
      expect.arrayContaining(['Sacrifice Forest (1)', 'Sacrifice Forest (2)']),
    );
    // Sacrifice three: one tapped Mountain and two Forests.
    choose(g, /^Sacrifice Forest \(1\)$/);
    choose(g, /^Sacrifice Forest/);
    choose(g, /^Sacrifice Mountain/);
    choose(g, /^Done$/);
    // Three cards revealed: the Simulacrum, a Forest and Shock. Choose the artifact and the land.
    expect(g.events.filter((e) => e.type === 'revealed')).toHaveLength(3);
    expect(labels(g)).toEqual(
      expect.arrayContaining(['Put Celestial Armor onto the battlefield', 'Put Forest onto the battlefield', 'Done']),
    );
    // Shock isn't an artifact or land: not on offer.
    expect(labels(g).some((l) => /Shock/.test(l))).toBe(false);
    choose(g, /Celestial/);
    choose(g, /Forest/);
    done(g);
    expect(bf(g, 'celestial-armor')).toHaveLength(1);
    // The Forest chosen enters tapped.
    const newForest = bf(g, 'forest').filter((id) => g.obj(id).tapped);
    expect(newForest.length).toBeGreaterThan(0);
    // Shock goes to the bottom of the library.
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib[lib.length - 1]).toBe('shock');
    expect(bf(g, 'mountain')).toHaveLength(4);
  });

  it('nonland cards enter before lands; lands enter tapped; the rest go to the bottom', () => {
    const g = setup(n('forest', 2), ['forest', 'celestial-armor', 'shock']);
    cast(g, HEW);
    stop(g);
    choose(g, /Sacrifice Forest \(1\)/);
    choose(g, /Sacrifice Forest/);
    choose(g, /Sacrifice Mountain/);
    choose(g, /^Done$/);
    choose(g, /Celestial Armor/);
    choose(g, /Forest/);
    done(g);
    const order = g.events
      .filter((e) => e.type === 'objectMoved' && e.to === 'battlefield' && e.from === 'library')
      .map((e) => e.type === 'objectMoved' && e.defId);
    expect(order).toEqual(['celestial-armor', 'forest']);
    expect(g.obj(bf(g, 'forest').find((id) => g.obj(id).tapped)!).tapped).toBe(true);
    expect(g.obj(bf(g, 'celestial-armor')[0]!).tapped).toBe(false);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib.at(-1)).toBe('shock');
  });

  it("choosing none of the revealed cards: all of them go to the bottom", () => {
    const g = setup(n('forest', 2), ['celestial-armor', 'forest', 'shock']);
    cast(g, HEW);
    stop(g);
    choose(g, /Sacrifice Forest \(1\)/);
    choose(g, /Sacrifice Forest/);
    choose(g, /Sacrifice Mountain/);
    choose(g, /^Done$/);
    choose(g, /^Done$/);
    done(g);
    expect(bf(g, 'celestial-armor')).toHaveLength(0);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toHaveLength(9);
    expect(lib.slice(-3).sort()).toEqual(['celestial-armor', 'forest', 'shock']);
  });

  it('with only nonartifact nonland cards revealed there is nothing to choose; they all go to the bottom', () => {
    const g = setup(n('forest', 1), ['shock', 'llanowar-elves']);
    cast(g, HEW);
    stop(g);
    choose(g, /Sacrifice Forest/);
    choose(g, /Sacrifice Mountain/);
    choose(g, /^Done$/);
    done(g);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib.slice(-2).sort()).toEqual(['llanowar-elves', 'shock']);
  });

  it('a library with fewer cards than lands sacrificed reveals what there is', () => {
    const g = game({
      p1: { hand: [HEW], battlefield: [...mountains(5), 'forest'], library: ['forest'] },
    });
    cast(g, HEW);
    stop(g);
    choose(g, /Sacrifice Forest/);
    choose(g, /Sacrifice Mountain/);
    choose(g, /^Done$/);
    choose(g, /Forest/);
    done(g);
    expect(bf(g, 'forest')).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(0);
  });

  it('the prompt is the controller’s, and the sorcery goes to the graveyard', () => {
    const g = setup([], []);
    cast(g, HEW);
    stop(g);
    expect((g.decision as { player: string }).player).toBe('p1');
    choose(g, /^Done$/);
    done(g);
    expect(gy(g)).toEqual([HEW]);
  });
});

