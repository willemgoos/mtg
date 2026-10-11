import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  choose,
  done,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// The Lord of the Rings 21d: the multicolour rares (part two: Galadriel, Doors of Durin, Shagrat, Sméagol, Faramir, Gimli, The
// Balrog, Gandalf the Grey).

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'ltr-orc-army-token';
const SOLDIER = 'hob-human-soldier-token';
const GALADRIEL = 'galadriel-of-lothl-rien';
const SMEAGOL = 'sm-agol-helpful-guide';
const BALROG = 'the-balrog-durins-bane';
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
const bearer = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.bearer?.id;
/** Moves to the declare attackers decision and attacks p2 with these creatures. */
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}
/** The decision is a scry: keep every card on top. */
const keepScry = (g: GameDriver) => g.do(g.legal().find((a) => a.type === 'scry')!);

describe('Galadriel of Lothlórien', () => {
  const setup = (extra: string[] = []) =>
    game({
      p1: {
        hand: ['claim-the-precious'],
        battlefield: [...n('swamp', 3), GALADRIEL, 'savannah-lions', ...extra],
        library: ['plains', 'island', 'swamp', 'forest', 'forest'],
      },
      p2: { battlefield: ['serra-angel'] },
    });

  it('when the Ring tempts you and you chose another creature as Ring-bearer, scry 3', () => {
    const g = setup();
    const lions = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g, { card: (id) => id === lions });
    expect(bearer(g)).toBe(lions);
    // The scry looks at three cards.
    const scried = g.events.filter((e) => e.type === 'scried');
    expect(scried).toHaveLength(1);
    const s = scried[0]! as { top: number; bottom: number };
    expect(s.top + s.bottom).toBe(3);
  });

  it('not when you chose Galadriel herself', () => {
    const g = setup();
    const galadriel = g.id('p1', GALADRIEL);
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g, { card: (id) => id === galadriel });
    expect(bearer(g)).toBe(galadriel);
    expect(g.decision.kind).toBe('priority');
    expect(ringLevel(g)).toBe(1);
  });

  it('whenever you scry, you may reveal the top card; a land goes onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: ['island', GALADRIEL],
        // Opt scries the first card and draws it; then the forest is on top.
        library: ['swamp', 'forest', 'plains'],
      },
    });
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    const forest = board(g, 'forest', 'p1');
    expect(forest).toHaveLength(1);
    expect(g.obj(forest[0]!).tapped).toBe(true);
    expect(hand(g)).toEqual(['swamp']);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('a card that is not a land stays on top', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: ['island', GALADRIEL],
        library: ['swamp', 'savannah-lions', 'plains'],
      },
    });
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toEqual([
      'savannah-lions',
      'plains',
    ]);
    expect(board(g, 'plains', 'p1')).toHaveLength(0);
  });

  it('you may decline to reveal', () => {
    const g = game({
      p1: {
        hand: ['opt'],
        battlefield: ['island', GALADRIEL],
        library: ['swamp', 'forest', 'plains'],
      },
    });
    g.do(casts(g, 'opt')[0]!);
    stop(g);
    keepScry(g);
    done(g, { accept: false });
    expect(board(g, 'forest', 'p1')).toHaveLength(0);
    expect(g.state.players.p1.library).toHaveLength(2);
  });
});

describe('Doors of Durin', () => {
  const lib = (...ids: string[]) => ids;
  const attacker = 'savannah-lions';

  it('whenever you attack, scry 2, then a revealed creature card enters tapped and attacking', () => {
    const g = game({
      p1: {
        battlefield: ['doors-of-durin', attacker],
        library: lib('serra-angel', 'forest', 'forest'),
      },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    expect((g.decision as { cards: string[] }).cards).toHaveLength(2);
    keepScry(g);
    done(g, { accept: true });
    const angel = g.id('p1', 'serra-angel');
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.state.combat!.attackers.find((a) => a.id === angel)).toMatchObject({ defender: 'p2' });
    // No trample (no Dwarf) and no hexproof (no Elf).
    expect(kw(g, angel).has('trample')).toBe(false);
    expect(kw(g, angel).has('hexproof')).toBe(false);
  });

  it('it gains trample if you control a Dwarf and hexproof if you control an Elf, until your next turn', () => {
    const g = game({
      p1: {
        battlefield: ['doors-of-durin', 'axgard-cavalry', 'llanowar-elves'],
        library: lib('serra-angel', 'forest', 'forest'),
      },
    });
    attack(g, [g.id('p1', 'axgard-cavalry')]);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    const angel = g.id('p1', 'serra-angel');
    expect(kw(g, angel).has('trample')).toBe(true);
    expect(kw(g, angel).has('hexproof')).toBe(true);
    // Through the opponent's turn, gone when your next turn begins.
    passTo(g, 'main1', 'p2');
    expect(kw(g, angel).has('trample')).toBe(true);
    passTo(g, 'main1', 'p1');
    expect(kw(g, angel).has('trample')).toBe(false);
  });

  it('only a Dwarf: trample but not hexproof', () => {
    const g = game({
      p1: {
        battlefield: ['doors-of-durin', 'axgard-cavalry'],
        library: lib('serra-angel', 'forest', 'forest'),
      },
    });
    attack(g, [g.id('p1', 'axgard-cavalry')]);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    const angel = g.id('p1', 'serra-angel');
    expect(kw(g, angel).has('trample')).toBe(true);
    expect(kw(g, angel).has('hexproof')).toBe(false);
  });

  it('a card that is not a creature stays on top', () => {
    const g = game({
      p1: { battlefield: ['doors-of-durin', attacker], library: lib('forest', 'plains', 'plains') },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    expect(g.state.players.p1.library.map((id) => g.obj(id).defId)).toEqual([
      'forest',
      'plains',
      'plains',
    ]);
    expect(g.state.combat!.attackers).toHaveLength(1);
  });

  it('you may decline to reveal', () => {
    const g = game({
      p1: { battlefield: ['doors-of-durin', attacker], library: lib('serra-angel', 'forest') },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    keepScry(g);
    done(g, { accept: false });
    expect(board(g, 'serra-angel', 'p1')).toHaveLength(0);
  });

  it('is put in attacking without attack triggers (it was never declared)', () => {
    const g = game({
      p1: {
        battlefield: ['doors-of-durin', attacker, 'merry-esquire-of-rohan'],
        library: lib('merry-esquire-of-rohan', 'forest'),
      },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    keepScry(g);
    done(g, { accept: true });
    // Merry came from the library; nothing about attacking triggered (her trigger needs a declared attack).
    expect(hand(g)).toHaveLength(0);
  });

  it('with planeswalkers on the other side: choose the player or a planeswalker', () => {
    const g = game({
      p1: { battlefield: ['doors-of-durin', attacker], library: lib('serra-angel', 'forest') },
      p2: { battlefield: [{ card: 'ajani-resolute', loyalty: 3 }] },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    keepScry(g);
    done(g, { accept: true, option: /Ajani/ });
    const angel = g.id('p1', 'serra-angel');
    const entry = g.state.combat!.attackers.find((a) => a.id === angel);
    expect(entry).toBeDefined();
    expect(entry!.planeswalker).toBe(g.id('p2', 'ajani-resolute'));
  });

  it('with planeswalkers on the other side, it may attack the player', () => {
    const g = game({
      p1: { battlefield: ['doors-of-durin', attacker], library: lib('serra-angel', 'forest') },
      p2: { battlefield: [{ card: 'ajani-resolute', loyalty: 3 }] },
    });
    attack(g, [g.id('p1', attacker)]);
    stop(g);
    keepScry(g);
    done(g, { accept: true, option: /Attack player/ });
    const entry = g.state.combat!.attackers.find((a) => a.id === g.id('p1', 'serra-angel'));
    expect(entry).toMatchObject({ defender: 'p2' });
    expect(entry!.planeswalker).toBeUndefined();
  });
});

describe('Shagrat, Loot Bearer', () => {
  it('attaches up to one target Equipment to it and amasses Orcs X (X = Equipment attached)', () => {
    const g = game({
      p1: { battlefield: ['shagrat-loot-bearer', 'short-bow'] },
    });
    const shagrat = g.id('p1', 'shagrat-loot-bearer');
    const bow = g.id('p1', 'short-bow');
    attack(g, [shagrat]);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === bow) });
    expect(g.obj(bow).attachedTo).toBe(shagrat);
    const army = board(g, ARMY, 'p1');
    expect(army).toHaveLength(1);
    expect(plus(g, army[0]!)).toBe(1);
  });

  it('counts every Equipment attached to it, including ones already on it and ones an opponent controls', () => {
    const g = game({
      p1: { battlefield: ['shagrat-loot-bearer', 'short-bow'] },
      p2: { battlefield: ['pirates-cutlass'] },
    });
    const shagrat = g.id('p1', 'shagrat-loot-bearer');
    g.obj(g.id('p1', 'short-bow')).attachedTo = shagrat;
    const cutlass = g.id('p2', 'pirates-cutlass');
    attack(g, [shagrat]);
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === cutlass) });
    // The control of the Equipment doesn't change.
    expect(g.obj(cutlass).controller).toBe('p2');
    expect(g.obj(cutlass).attachedTo).toBe(shagrat);
    expect(plus(g, board(g, ARMY, 'p1')[0]!)).toBe(2);
  });

  it('with no Equipment to attach, X is the Equipment already attached', () => {
    const g = game({ p1: { battlefield: ['shagrat-loot-bearer', 'short-bow'] } });
    const shagrat = g.id('p1', 'shagrat-loot-bearer');
    g.obj(g.id('p1', 'short-bow')).attachedTo = shagrat;
    attack(g, [shagrat]);
    // Choose no target.
    done(g, { target: (a) => a.targets.length === 0 });
    expect(plus(g, board(g, ARMY, 'p1')[0]!)).toBe(1);
  });

  it('puts the counters on an Army you already control', () => {
    const g = game({ p1: { battlefield: ['shagrat-loot-bearer', 'short-bow', ARMY] } });
    const army = g.id('p1', ARMY);
    g.obj(army).plusOneCounters = 3;
    const shagrat = g.id('p1', 'shagrat-loot-bearer');
    attack(g, [shagrat]);
    done(g);
    expect(board(g, ARMY, 'p1')).toHaveLength(1);
    expect(plus(g, army)).toBe(4);
  });
});

describe('Sméagol, Helpful Guide', () => {
  it('at your end step, if a creature died under your control this turn, the Ring tempts you', () => {
    const g = game({ p1: { battlefield: [SMEAGOL] }, p2: { library: ['forest'] } });
    g.state.turn.creaturesLost = { p1: 1, p2: 0 };
    passTo(g, 'end');
    done(g);
    expect(ringLevel(g)).toBe(1);
  });

  it('not if no creature of yours died', () => {
    const g = game({ p1: { battlefield: [SMEAGOL] } });
    g.state.turn.creaturesLost = { p1: 0, p2: 3 };
    passTo(g, 'end');
    done(g);
    expect(ringLevel(g)).toBe(0);
  });

  it('whenever the Ring tempts you, the opponent reveals until a land: it enters tapped under your control, the rest go to their graveyard', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), SMEAGOL] },
      p2: {
        battlefield: ['serra-angel'],
        library: ['llanowar-elves', 'shock', 'mountain', 'plains', 'plains'],
      },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g);
    const mountain = board(g, 'mountain', 'p1');
    expect(mountain).toHaveLength(1);
    expect(g.obj(mountain[0]!).tapped).toBe(true);
    expect(g.obj(mountain[0]!).owner).toBe('p2');
    expect(gy(g, 'p2')).toEqual(expect.arrayContaining(['llanowar-elves', 'shock', 'serra-angel']));
    expect(gy(g, 'p2')).toHaveLength(3);
    expect(g.state.players.p2.library.map((id) => g.obj(id).defId)).toEqual(['plains', 'plains']);
  });

  it('with no land in their library, everything is put into the graveyard', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), SMEAGOL] },
      p2: { battlefield: ['serra-angel'], library: ['llanowar-elves', 'shock'] },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g);
    expect(gy(g, 'p2')).toHaveLength(3);
    expect(g.state.players.p2.library).toHaveLength(0);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).owner === 'p2' && g.obj(id).controller === 'p1'),
    ).toHaveLength(0);
  });

  it('the land is the first card when it is on top', () => {
    const g = game({
      p1: { hand: ['claim-the-precious'], battlefield: [...n('swamp', 3), SMEAGOL] },
      p2: { battlefield: ['serra-angel'], library: ['mountain', 'plains'] },
    });
    g.do(casts(g, 'claim-the-precious').find(targeting(g.id('p2', 'serra-angel')))!);
    done(g);
    expect(board(g, 'mountain', 'p1')).toHaveLength(1);
    expect(g.state.players.p2.library).toHaveLength(1);
  });
});

describe('Faramir, Prince of Ithilien', () => {
  const FARAMIR = 'faramir-prince-of-ithilien';
  /** Plays p1's turn to its end step, then p2's turn (p2 attacks with these creatures, if any) to its end step. */
  function throughOpponentsTurn(g: GameDriver, attackers: string[] = []): void {
    passTo(g, 'end');
    done(g);
    for (
      let i = 0;
      i < 60 && !(g.state.turn.activePlayer === 'p2' && g.state.turn.step === 'end');
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers' && d.player === 'p2') {
        for (const a of attackers)
          g.do({ type: 'addAttacker', player: 'p2', attacker: a, defender: 'p1' });
        g.do({ type: 'confirmAttackers', player: 'p2' });
      } else if (d.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    expect(g.state.turn.step).toBe('end');
    done(g);
  }

  it('draws a card at the opponent’s end step if they did not attack you', () => {
    const g = game({ p1: { battlefield: [FARAMIR] }, p2: { battlefield: ['savannah-lions'] } });
    const before = hand(g).length;
    throughOpponentsTurn(g);
    // p1's own draw step comes after; this is p2's end step.
    expect(hand(g).length).toBe(before + 1 + 0);
    expect(board(g, SOLDIER, 'p1')).toHaveLength(0);
  });

  it('creates three Human Soldiers instead if they attacked you', () => {
    const g = game({ p1: { battlefield: [FARAMIR] }, p2: { battlefield: ['savannah-lions'] } });
    const lions = g.id('p2', 'savannah-lions');
    g.obj(lions).summoningSick = false;
    const before = hand(g).length;
    throughOpponentsTurn(g, [lions]);
    expect(board(g, SOLDIER, 'p1')).toHaveLength(3);
    expect(hand(g).length).toBe(before);
  });

  it('attacking a planeswalker of yours is not attacking you', () => {
    const g = game({
      p1: { battlefield: [FARAMIR, { card: 'ajani-resolute', loyalty: 3 }] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const before = hand(g).length;
    passTo(g, 'end');
    done(g);
    for (
      let i = 0;
      i < 60 && !(g.state.turn.activePlayer === 'p2' && g.state.turn.step === 'end');
      i++
    ) {
      const d = g.decision;
      if (d.kind === 'declareAttackers' && d.player === 'p2') {
        g.do({
          type: 'addAttacker',
          player: 'p2',
          attacker: g.id('p2', 'savannah-lions'),
          defender: 'p1',
          planeswalker: g.id('p1', 'ajani-resolute'),
        });
        g.do({ type: 'confirmAttackers', player: 'p2' });
      } else if (d.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
    expect(board(g, SOLDIER, 'p1')).toHaveLength(0);
    expect(hand(g).length).toBe(before + 1);
  });

  it('only at that opponent’s next end step: not again the turn after', () => {
    const g = game({ p1: { battlefield: [FARAMIR] }, p2: { battlefield: [] } });
    const before = hand(g).length;
    throughOpponentsTurn(g);
    expect(hand(g).length).toBe(before + 1);
    // The delayed trigger is used up.
    expect((g.state.delayed ?? []).length).toBe(0);
  });
});

describe('Gimli, Mournful Avenger', () => {
  const GIMLI = 'gimli-mournful-avenger';
  const lions = (k: number) => n('savannah-lions', k);

  it('has indestructible as long as two or more creatures died under your control this turn', () => {
    const g = game({ p1: { battlefield: [GIMLI] } });
    const gimli = g.id('p1', GIMLI);
    expect(kw(g, gimli).has('indestructible')).toBe(false);
    g.state.turn.creaturesLost = { p1: 1, p2: 5 };
    expect(kw(g, gimli).has('indestructible')).toBe(false);
    g.state.turn.creaturesLost = { p1: 2, p2: 0 };
    expect(kw(g, gimli).has('indestructible')).toBe(true);
  });

  it('whenever another creature you control dies, a +1/+1 counter on Gimli', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GIMLI, 'mountain', ...lions(1)] },
    });
    g.do(casts(g, 'shock').find(targeting(g.id('p1', 'savannah-lions')))!);
    done(g);
    expect(plus(g, g.id('p1', GIMLI))).toBe(1);
  });

  it('not when an opponent’s creature dies, or Gimli himself', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GIMLI, 'mountain'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.do(casts(g, 'shock').find(targeting(g.id('p2', 'savannah-lions')))!);
    done(g);
    expect(plus(g, g.id('p1', GIMLI))).toBe(0);
  });

  it('the third time this ability resolves this turn, Gimli fights up to one target creature you do not control', () => {
    const g = game({
      p1: { hand: n('shock', 3), battlefield: [GIMLI, ...n('mountain', 3), ...lions(3)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const gimli = g.id('p1', GIMLI);
    const enemy = g.id('p2', 'savannah-lions');
    for (let i = 0; i < 3; i++) {
      const mine = g.state.battlefield.find(
        (id) => g.obj(id).defId === 'savannah-lions' && g.obj(id).controller === 'p1',
      )!;
      g.do(casts(g, 'shock').find(targeting(mine))!);
      done(g, {
        target: (a) => a.targets.some((t) => 'object' in t && t.object.id === enemy),
      });
      // No fight before the third.
      if (i < 2) expect(g.obj(enemy).damage).toBe(0);
    }
    expect(plus(g, gimli)).toBe(3);
    // Gimli (6/5 with three counters) fought the opposing 2/1.
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(g.obj(gimli).damage).toBe(2);
  });

  it('may fight no creature (the target is optional)', () => {
    const g = game({
      p1: { hand: n('shock', 3), battlefield: [GIMLI, ...n('mountain', 3), ...lions(3)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    for (let i = 0; i < 3; i++) {
      const mine = g.state.battlefield.find(
        (id) => g.obj(id).defId === 'savannah-lions' && g.obj(id).controller === 'p1',
      )!;
      g.do(casts(g, 'shock').find(targeting(mine))!);
      done(g, { target: (a) => a.targets.length === 0 });
    }
    expect(board(g, 'savannah-lions', 'p2')).toHaveLength(1);
  });

  it('the count starts over each turn', () => {
    const g = game({
      p1: { hand: n('shock', 2), battlefield: [GIMLI, ...n('mountain', 2), ...lions(2)] },
    });
    const gimli = g.id('p1', GIMLI);
    g.obj(gimli).resolutions = { turn: g.state.turn.number - 1, count: 2 };
    const mine = g.id('p1', 'savannah-lions');
    g.do(casts(g, 'shock').find(targeting(mine))!);
    done(g);
    expect(g.obj(gimli).resolutions).toEqual({ turn: g.state.turn.number, count: 1 });
  });
});

describe('The Balrog, Durin’s Bane', () => {
  it('has haste and costs {1} less for each permanent sacrificed this turn', () => {
    const g = game({
      p1: {
        hand: [BALROG],
        battlefield: [
          ...n('plains', 5),
          ...n('swamp', 2),
          ...n('mountain', 2),
          'food-token',
          'food-token',
        ],
      },
    });
    expect(kw(g, g.id('p1', BALROG, 'hand')).has('haste')).toBe(true);
    // Sacrifice both Foods ({2}, {T}, sacrifice: gain 3 life): four of the nine lands are tapped, five are left, the Balrog costs seven.
    for (const food of g.state.battlefield.filter((id) => g.obj(id).defId === 'food-token')) {
      activate(g, food, 0);
      done(g);
    }
    expect(g.state.turn.ltrSacrificed).toBe(2);
    expect(g.life('p1')).toBe(26);
    const cast = casts(g, BALROG);
    expect(cast.length).toBeGreaterThan(0);
    g.do(cast[0]!);
    done(g);
    expect(board(g, BALROG, 'p1')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(9);
  });

  it('the reduction counts sacrifices by any player', () => {
    const g = game({
      p1: { hand: [BALROG], battlefield: ['swamp', 'mountain', 'forest', 'plains', 'plains'] },
    });
    expect(casts(g, BALROG)).toHaveLength(0);
    g.state.turn.ltrSacrificed = 2;
    expect(casts(g, BALROG).length).toBeGreaterThan(0);
  });

  it('can’t be blocked except by legendary creatures', () => {
    const g = game({
      p1: { battlefield: [BALROG] },
      p2: { battlefield: ['savannah-lions', 'gothmog-morgul-lieutenant'] },
    });
    attack(g, [g.id('p1', BALROG)]);
    done(g);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    const blocks = g.legal('p2').filter((a) => a.type === 'addBlock');
    expect(blocks.map((a) => (a.type === 'addBlock' ? g.obj(a.blocker).defId : ''))).toEqual([
      'gothmog-morgul-lieutenant',
    ]);
  });

  it('when it dies, destroy target artifact or creature an opponent controls', () => {
    const g = game({
      p1: { battlefield: [{ card: BALROG, damage: 9 }, 'savannah-lions', 'soul-guide-lantern'] },
      p2: { battlefield: ['serra-angel', 'soul-guide-lantern', 'forest'] },
    });
    g.pass();
    stop(g);
    const targets = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .flatMap((t) =>
        'object' in t ? [g.obj(t.object.id).defId + ':' + g.obj(t.object.id).controller] : [],
      );
    // Opponent's creature and artifact only (not their land, not mine).
    expect(new Set(targets)).toEqual(new Set(['serra-angel:p2', 'soul-guide-lantern:p2']));
    done(g, {
      target: (a) =>
        a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'serra-angel'),
    });
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g)).toContain(BALROG);
  });
});

describe('Gandalf the Grey', () => {
  const GANDALF = 'gandalf-the-grey';
  /** The mode choices offered now, by index. */
  const modesOffered = (g: GameDriver) =>
    g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .map((a) => (a.type === 'chooseTargets' ? a.mode : undefined));
  const pickMode = (
    g: GameDriver,
    mode: number,
    pred: (a: Extract<Action, { type: 'chooseTargets' }>) => boolean = () => true,
  ) => g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.mode === mode && pred(a))!);

  it('offers all four modes on the first instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock'],
        battlefield: [GANDALF, 'mountain', 'mountain'],
        graveyard: [],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(new Set(modesOffered(g))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('mode 1: tap or untap target permanent', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    pickMode(g, 0, (a) => a.targets.some((t) => 'object' in t && t.object.id === angel));
    done(g, { option: /Tap it/ });
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('mode 1 can untap, or do neither', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    pickMode(g, 0, (a) => a.targets.some((t) => 'object' in t && t.object.id === angel));
    done(g, { option: /Untap it/ });
    expect(g.obj(angel).tapped).toBe(false);
    const h = game({
      p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    h.do(casts(h, 'shock').find(targetingPlayer('p2'))!);
    pickMode(h, 0, (a) =>
      a.targets.some((t) => 'object' in t && t.object.id === h.id('p2', 'serra-angel')),
    );
    done(h, { option: /neither/ });
    expect(h.obj(h.id('p2', 'serra-angel')).tapped).toBe(true);
  });

  it('mode 2: 3 damage to each opponent', () => {
    const g = game({ p1: { hand: ['opt'], battlefield: [GANDALF, 'island'] } });
    g.do(casts(g, 'opt')[0]!);
    pickMode(g, 1);
    done(g);
    expect(g.life('p2')).toBe(17);
  });

  it('mode 3: copy target instant or sorcery spell you control (new targets allowed)', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    pickMode(g, 2);
    done(g);
    // Shock and its copy: 2 + 2.
    expect(g.life('p2')).toBe(16);
  });

  it('mode 4: put Gandalf on top of its owner’s library', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] } });
    const gandalf = g.id('p1', GANDALF);
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    pickMode(g, 3);
    done(g);
    expect(g.zoneOf(gandalf)).toBe('library');
    expect(g.state.players.p1.library[0]).toBe(gandalf);
  });

  it('a mode that has been chosen can’t be chosen again (for the same Gandalf)', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock', 'shock'],
        battlefield: [GANDALF, 'mountain', 'mountain', 'mountain'],
      },
    });
    for (const [i, mode] of [1, 0, 2].entries()) {
      g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
      const offered = new Set(modesOffered(g));
      // After k modes have been used, only the others are on offer.
      expect(offered.size).toBe(4 - i);
      pickMode(g, mode);
      done(g, { option: /neither/ });
    }
  });

  it('with every mode chosen, the ability does nothing', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.obj(g.id('p1', GANDALF)).usedModes = [0, 1, 2, 3];
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    // No trigger at all.
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(1);
  });

  it('only for instants and sorceries', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: [GANDALF, 'plains'] },
    });
    g.do(casts(g, 'savannah-lions')[0]!);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(1);
  });

  it('the used modes are forgotten when Gandalf leaves the battlefield', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: [GANDALF, 'mountain'] } });
    const gandalf = g.id('p1', GANDALF);
    g.obj(gandalf).usedModes = [0, 1];
    g.do(casts(g, 'shock').find(targetingPlayer('p2'))!);
    expect(new Set(modesOffered(g))).toEqual(new Set([2, 3]));
    pickMode(g, 3);
    done(g);
    // Back on the battlefield later, all four modes are on offer again.
    expect(g.zoneOf(gandalf)).toBe('library');
    expect(g.obj(gandalf).usedModes).toBeUndefined();
  });
});

void labels;
void choose;
void abilityActions;
void activate;
void exile;
void pt;
void SOLDIER;
