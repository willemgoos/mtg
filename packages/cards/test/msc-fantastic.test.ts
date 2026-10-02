import { determinize, getCharacteristics, redactFor } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// The Fantastic Four (9d): rebound, cascade, discover, escalate, goad and the
// "if you've cast a noncreature spell this turn" cards.

const castable = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
/** Passes priority until the decision is of this kind (or gives up). */
const passUntil = (g: ReturnType<typeof game>, kind: string, max = 60) => {
  for (let i = 0; i < max && g.decision.kind !== kind; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else g.pass();
  }
  return g;
};

describe('The Fantastic Four', () => {
  it('rebound: exiled as it resolves, cast free at your next upkeep', () => {
    const g = game({
      p1: { hand: ['terramorph'], battlefield: n('forest', 4), library: n('plains', 10) },
    });
    const card = g.id('p1', 'terramorph', 'hand');
    cast(g, 'terramorph');
    settle(g);
    // A search for a basic land: take the first.
    if (g.decision.kind === 'searchLibrary')
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    settle(g);
    expect(g.zoneOf(card)).toBe('exile');
    passUntil(g, 'castFree');
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.decision.kind).toBe('castFree');
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    if (g.decision.kind === 'searchLibrary')
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    settle(g);
    // Cast from exile: no second rebound, it goes to the graveyard.
    expect(g.zoneOf(card)).toBe('graveyard');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'plains')).toHaveLength(2);
  });

  it('cascade: exiles to a cheaper nonland card and casts it free', () => {
    const g = game({
      p1: {
        hand: ['into-the-time-vortex'],
        battlefield: n('mountain', 5),
        library: ['forest', 'savannah-lions', ...n('forest', 5)],
      },
    });
    cast(g, 'into-the-time-vortex');
    settle(g);
    const d = g.decision;
    if (d.kind !== 'castFree') throw new Error(`expected castFree, got ${d.kind}`);
    expect(d.cards.map((id) => g.obj(id).defId)).toEqual(['savannah-lions']);
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(1);
    // The land it passed went to the bottom.
    expect(g.obj(g.state.players.p1.library.at(-1)!).defId).toBe('forest');
  });

  it('discover: Franklin Richards casts or takes a card with mana value 6 or less', () => {
    const g = game({
      p1: {
        battlefield: ['franklin-richards-ascendant', 'mountain'],
        hand: ['shock'],
        library: ['forest', 'rumbling-baloth', ...n('forest', 5)],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    passUntil(g, 'castFree');
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    // Declined: it goes into the hand.
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('rumbling-baloth');
  });

  it('escalate: each extra mode taps a creature', () => {
    const g = game({
      p1: { hand: ['collective-effort'], battlefield: ['savannah-lions', ...n('plains', 3)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const two = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' &&
          (cardDb.get('collective-effort')!.modes![a.mode!]!.escalate ?? 0) === 1,
      );
    expect(two.length).toBeGreaterThan(0);
    g.do(two[0]!);
    settle(g);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
  });

  it('Invisible Woman makes a Wall at combat once a noncreature spell was cast', () => {
    const g = game({
      p1: { battlefield: ['invisible-woman', 'mountain'], hand: ['shock'] },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    passUntil(g, 'declareAttackers');
    expect(all(g, 'wall-0-3-token')).toHaveLength(1);
  });

  it('goad: Taunt from the Rampart makes their creatures attack and stops them blocking', () => {
    const g = game({
      p1: {
        hand: ['taunt-from-the-rampart'],
        battlefield: [...n('mountain', 3), ...n('plains', 2)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'taunt-from-the-rampart');
    settle(g);
    const lions = g.id('p2', 'savannah-lions');
    expect(getCharacteristics(g.state, cardDb, lions).cantBlock).toBe(true);
    passUntil(g, 'declareAttackers');
    passUntil(g, 'declareAttackers', 80);
    const d = g.decision;
    if (d.kind !== 'declareAttackers') throw new Error(d.kind);
    expect(d.player).toBe('p2');
    expect(d.declared.map((x) => x.id)).toEqual([lions]);
    expect(g.legal().some((a) => a.type === 'removeAttacker')).toBe(false);
  });

  it('Council of Reeds ignores the legend rule for your creatures', () => {
    const g = game({ p1: { battlefield: ['council-of-reeds', 'mountain'], hand: ['shock'] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    passUntil(g, 'declareAttackers');
    expect(all(g, 'council-of-reeds')).toHaveLength(2);
  });

  it('Path to Exile lets the creature’s controller fetch a basic land', () => {
    const g = game({
      p1: { hand: ['path-to-exile'], battlefield: ['plains'] },
      p2: { battlefield: ['rumbling-baloth'], library: n('forest', 5) },
    });
    cast(g, 'path-to-exile', [g.ref(g.id('p2', 'rumbling-baloth'))]);
    g.passBoth();
    expect(g.decision).toMatchObject({ kind: 'searchLibrary', player: 'p2' });
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    settle(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).controller === 'p2')).toHaveLength(1);
  });

  it('Deep Analysis flashback costs 3 life', () => {
    const g = game({ p1: { graveyard: ['deep-analysis'], battlefield: n('island', 2) } });
    const da = g.state.players.p1.graveyard[0]!;
    const flash = g.legal().find((a) => a.type === 'castSpell' && a.card === da);
    expect(flash).toBeDefined();
    g.do(flash!);
    settle(g);
    expect(g.life('p1')).toBe(17);
  });

  it('Clever Concealment phases out your nonland permanents, with convoke', () => {
    const g = game({
      p1: {
        hand: ['clever-concealment'],
        battlefield: ['savannah-lions', 'bear-cub', ...n('plains', 2)],
      },
    });
    expect(castable(g, 'clever-concealment')).toBe(true);
    cast(g, 'clever-concealment');
    settle(g);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(g.state.phasedOut?.length).toBe(2);
  });

  it('Mirage Mirror copies a creature until end of turn', () => {
    const g = game({
      p1: { battlefield: ['mirage-mirror', ...n('plains', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const mirror = g.id('p1', 'mirage-mirror');
    const baloth = g.id('p2', 'rumbling-baloth');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === mirror &&
            a.targets.some((t) => 'object' in t && t.object.id === baloth),
        )!,
    );
    settle(g);
    expect(g.obj(mirror).defId).toBe('rumbling-baloth');
    expect(pt(g, mirror)).toEqual([4, 4]);
    g.passUntilStep('upkeep');
    expect(g.obj(mirror).defId).toBe('mirage-mirror');
  });

  it('Annie Joins Up makes a legendary creature’s triggers happen twice', () => {
    const g = game({
      p1: {
        battlefield: ['annie-joins-up', 'black-bolt-inhuman-king', 'mountain'],
        hand: ['shock'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(pt(g, g.id('p1', 'black-bolt-inhuman-king'))).toEqual([7, 7]);
  });

  it('Valeria Richards draws for the first noncreature spell each turn and makes them cheaper', () => {
    const g = game({
      p1: {
        battlefield: ['valeria-richards-precocious', ...n('mountain', 2)],
        hand: ['lightning-strike', 'lightning-strike'],
      },
    });
    // Lightning Strike costs {1}{R}: {R} with Valeria, so both fit in two Mountains.
    const hand = handSize(g, 'p1');
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    cast(g, 'lightning-strike', [{ player: 'p2' }]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(hand - 2 + 1);
  });

  it('Ultimate Nullification needs a legendary creature to sacrifice and ends up at the bottom', () => {
    const g = game({
      p1: {
        hand: ['ultimate-nullification'],
        battlefield: ['savannah-lions', ...n('plains', 5)],
      },
    });
    expect(castable(g, 'ultimate-nullification')).toBe(false);
    const h = game({
      p1: {
        hand: ['ultimate-nullification'],
        battlefield: ['council-of-reeds', ...n('plains', 5)],
      },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const card = h.id('p1', 'ultimate-nullification', 'hand');
    h.do(h.legal().find((a) => a.type === 'castSpell' && a.card === card)!);
    settle(h);
    expect(all(h, 'rumbling-baloth')).toHaveLength(0);
    expect(h.state.players.p1.library.at(-1)).toBe(card);
  });

  it('Dragon Man’s power counts noncreature cards; it can be cast from the graveyard with a discard', () => {
    const g = game({
      p1: {
        graveyard: ['dragon-man-reformed-robot', 'genesis-ultimatum'],
        hand: ['shock'],
        battlefield: [...n('plains', 2), ...n('island', 2)],
      },
    });
    const dm = g.state.players.p1.graveyard[0]!;
    const fromGy = g.legal().find((a) => a.type === 'castSpell' && a.card === dm);
    expect(fromGy).toBeDefined();
    g.do(fromGy!);
    settle(g);
    expect(pt(g, dm)[0]).toBe(7);
  });
});

describe('hidden information', () => {
  it('the search bot’s guesses survive Mirage Mirror copying an opposing card', () => {
    const g = game({
      p1: { battlefield: ['mirage-mirror', ...n('plains', 2)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const mirror = g.id('p1', 'mirage-mirror');
    const baloth = g.id('p2', 'rumbling-baloth');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.targets.some((t) => 'object' in t && t.object.id === baloth),
        )!,
    );
    settle(g);
    const decks = {
      p1: Object.values(g.state.objects)
        .filter((o) => o.owner === 'p1')
        .map((o) => o.originalDefId ?? o.defId),
      p2: Object.values(g.state.objects)
        .filter((o) => o.owner === 'p2')
        .map((o) => o.defId),
    };
    expect(g.obj(mirror).defId).toBe('rumbling-baloth');
    expect(() => determinize(redactFor(g.state, 'p2', cardDb), decks, 1)).not.toThrow();
  });
});
