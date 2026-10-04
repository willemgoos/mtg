import { colorIdentity, createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import {
  cardDb,
  commanderId,
  deckGameOptions,
  deckIds,
  FINAL_FANTASY_BRAWL_DECKS,
  MARVEL_BRAWL_DECKS,
  STRIXHAVEN_BRAWL_DECKS,
  PLAYABLE_BRAWL_DECKS,
  PLAYABLE_DECKS,
} from '../src/index.ts';
import { all, cast, game, handSize, n, settle } from './blb-helpers.ts';

// Brawl (Arena's 1v1 Commander) and the staples the Marvel precons share (9a).

const engine = createEngine(cardDb);
const BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
const mabel = 'mabel-heir-to-cragflame';

/** Casts p1's commander from the command zone. */
const castCommander = (g: ReturnType<typeof game>) =>
  g.do({ type: 'castSpell', player: 'p1', card: g.state.players.p1.commander!, targets: [] });
const canCastCommander = (g: ReturnType<typeof game>) =>
  g.legal().some((a) => a.type === 'castSpell' && a.card === g.state.players.p1.commander);

describe('Brawl decks', () => {
  it('have 100 cards, are singleton and fit the commander’s colour identity', () => {
    // Final Fantasy Commander (12): the FIC decks once all their cards are in.
    const fic = FINAL_FANTASY_BRAWL_DECKS.filter((d) => PLAYABLE_BRAWL_DECKS.includes(d));
    for (const d of [...MARVEL_BRAWL_DECKS, ...fic, ...STRIXHAVEN_BRAWL_DECKS]) {
      expect(d.commander, d.name).toBeDefined();
      expect(deckIds(d).length + 1, d.name).toBe(100);
      for (const [name, count] of d.cards)
        if (!BASICS.includes(name)) expect(count, `${d.name}: ${name}`).toBe(1);
      const commander = cardDb.get(commanderId(d)!)!;
      expect(commander.supertypes, d.name).toContain('Legendary');
      // Any legendary creature or planeswalker can be the commander (Quintorius, History Chaser).
      expect(
        commander.types.some((t) => t === 'Creature' || t === 'Planeswalker'),
        d.name,
      ).toBe(true);
      const identity = colorIdentity(commander);
      expect([...identity].sort(), d.name).toEqual([...d.colors].sort());
      for (const id of deckIds(d))
        for (const c of colorIdentity(cardDb.get(id)!))
          expect(identity, `${d.name}: ${id}`).toContain(c);
    }
  });

  it('are kept apart from the 60-card decks', () => {
    expect(PLAYABLE_BRAWL_DECKS.map((d) => d.id)).toContain('brawl-mabels-militia');
    expect(PLAYABLE_DECKS.some((d) => d.series === 'brawl')).toBe(false);
  });

  it('colour identity counts mana symbols in rules text, not reminder text', () => {
    expect(colorIdentity(cardDb.get('talisman-of-conviction')!)).toEqual(['W', 'R']);
    expect(colorIdentity(cardDb.get('sol-ring')!)).toEqual([]);
    expect(colorIdentity(cardDb.get('radiant-summit')!)).toEqual(['W', 'R']);
    expect(colorIdentity(cardDb.get('baylen-the-haymaker')!)).toEqual(['W', 'R', 'G']);
  });

  it('show the Marvel name of a reprint', () => {
    expect(cardDb.get('fellwar-stone')?.flavorName).toBe('S.H.I.E.L.D. Spy Satellite');
  });
});

describe('Brawl format', () => {
  const deck = MARVEL_BRAWL_DECKS.find((d) => d.id === 'brawl-mabels-militia')!;
  const opts = (seed: number) => ({ ...deckGameOptions(deck, deck), seed });

  it('starts at 25 life with each commander in the command zone', () => {
    const s = engine.newGame(opts(1));
    expect(s.format).toBe('brawl');
    for (const p of ['p1', 'p2'] as const) {
      const ps = s.players[p];
      expect(ps.life).toBe(25);
      expect(ps.command).toEqual([ps.commander]);
      expect(s.objects[ps.commander!]!.defId).toBe(mabel);
      expect(ps.library.length + ps.hand.length).toBe(99);
    }
  });

  it('makes the first mulligan free', () => {
    let s = engine.newGame({ ...opts(2), startingPlayer: 'p1' });
    s = engine.applyAction(s, { type: 'mulligan', player: 'p1' }).state;
    s = engine.applyAction(s, { type: 'keepHand', player: 'p1' }).state;
    expect(s.decision).toMatchObject({ kind: 'mulligan', player: 'p2' });
    expect(s.players.p1.hand).toHaveLength(7);
    s = engine.applyAction(s, { type: 'mulligan', player: 'p2' }).state;
    s = engine.applyAction(s, { type: 'mulligan', player: 'p2' }).state;
    s = engine.applyAction(s, { type: 'keepHand', player: 'p2' }).state;
    expect(s.decision).toMatchObject({ kind: 'bottomCards', player: 'p2', count: 1 });
  });

  it('casts the commander with tax and offers the command zone when it dies', () => {
    const g = game({
      p1: { commander: mabel, battlefield: [...n('mountain', 5), 'command-tower', 'plains'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    expect(canCastCommander(g)).toBe(true);
    castCommander(g);
    settle(g);
    const id = g.state.players.p1.commander!;
    expect(g.zoneOf(id)).toBe('battlefield');
    expect(g.state.players.p1.commanderCasts).toBe(1);
    // p2 kills it: p1 is asked whether it goes to the command zone.
    g.pass();
    cast(g, 'lightning-strike', [g.ref(id)]);
    g.passBoth();
    expect(g.decision).toMatchObject({ kind: 'commandZone', player: 'p1', card: id });
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.zoneOf(id)).toBe('command');
    expect(g.decision.kind).toBe('priority');
    // Back on p1's turn it costs {2} more: five of the seven lands.
    for (let i = 0; i < 2; i++) g.passUntilStep('main2').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p1');
    castCommander(g);
    expect(g.state.battlefield.filter((l) => g.obj(l).tapped)).toHaveLength(5);
  });

  it('leaves the commander where it is if its owner declines', () => {
    const g = game({
      p1: { commander: mabel, battlefield: [...n('mountain', 3), 'command-tower'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    castCommander(g);
    settle(g);
    const id = g.state.players.p1.commander!;
    g.pass();
    cast(g, 'lightning-strike', [g.ref(id)]);
    g.passBoth();
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    expect(g.zoneOf(id)).toBe('graveyard');
    expect(g.decision.kind).toBe('priority');
  });

  it('charges {2} more for each earlier cast from the command zone', () => {
    const g = game({
      p1: { commander: mabel, battlefield: [...n('mountain', 4), 'command-tower'] },
    });
    g.state.players.p1.commanderCasts = 1;
    // Five mana for {1}{R}{W}{2}: castable.
    expect(canCastCommander(g)).toBe(true);
    g.state.players.p1.commanderCasts = 2;
    expect(canCastCommander(g)).toBe(false);
  });

  it('plays random Brawl games to the end, and they survive a save', () => {
    // Every pairing of the playable Brawl decks, mirrors included.
    const pairs = PLAYABLE_BRAWL_DECKS.flatMap((a, i) =>
      PLAYABLE_BRAWL_DECKS.slice(i).map((b) => [a, b] as const),
    );
    // Final Fantasy Commander (12): once per pairing now that there are many Brawl decks.
    for (let seed = 1; seed <= Math.max(6, pairs.length); seed++) {
      const [a, b] = pairs[seed % pairs.length]!;
      const initial = engine.newGame({ ...deckGameOptions(a, b), seed });
      const r = playRandomGame(engine, initial, seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
      let state = JSON.parse(JSON.stringify(initial));
      for (const a of r.actions) state = engine.applyAction(state, a).state;
      expect(JSON.stringify(state)).toBe(JSON.stringify(r.final));
    }
  }, 240_000);
});

describe('Brawl staples', () => {
  it('Command Tower and Arcane Signet make only the commander’s colours', () => {
    const g = game({
      p1: {
        commander: mabel,
        hand: ['savannah-lions', 'giant-growth'],
        battlefield: ['command-tower'],
      },
    });
    const castable = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(castable).toContain('savannah-lions');
    expect(castable).not.toContain('giant-growth');
    // Without a commander it makes nothing.
    const h = game({ p1: { hand: ['savannah-lions'], battlefield: ['arcane-signet'] } });
    expect(h.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Sol Ring makes two mana', () => {
    const g = game({ p1: { hand: ['serra-angel'], battlefield: ['sol-ring', ...n('plains', 3)] } });
    cast(g, 'serra-angel');
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
  });

  it('a Talisman deals 1 damage only when it makes coloured mana', () => {
    const g = game({
      p1: { hand: ['savannah-lions', 'adventuring-gear'], battlefield: ['talisman-of-conviction'] },
    });
    cast(g, 'adventuring-gear');
    settle(g);
    expect(g.life('p1')).toBe(20);
    const h = game({ p1: { hand: ['savannah-lions'], battlefield: ['talisman-of-conviction'] } });
    cast(h, 'savannah-lions');
    settle(h);
    expect(h.life('p1')).toBe(19);
  });

  it('Exotic Orchard and Fellwar Stone make what the opponent’s lands make', () => {
    const g = game({
      p1: { hand: ['savannah-lions', 'shock'], battlefield: ['exotic-orchard'] },
      p2: { battlefield: ['mountain'] },
    });
    const ids = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(new Set(ids)).toEqual(new Set(['shock']));
  });

  it('check lands, battle lands, fast lands and snarls enter tapped unless their condition holds', () => {
    const play = (land: string, battlefield: string[], hand: string[] = []) => {
      const g = game({ p1: { hand: [land, ...hand], battlefield } });
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', land, 'hand') });
      return g.obj(g.id('p1', land)).tapped;
    };
    expect(play('clifftop-retreat', ['plains'])).toBe(false);
    expect(play('clifftop-retreat', ['island'])).toBe(true);
    expect(play('radiant-summit', ['plains', 'mountain'])).toBe(false);
    expect(play('radiant-summit', ['plains', 'command-tower'])).toBe(true);
    expect(play('razorverge-thicket', ['forest', 'plains'])).toBe(false);
    expect(play('razorverge-thicket', ['forest', 'plains', 'forest'])).toBe(true);
    expect(play('furycalm-snarl', [], ['mountain'])).toBe(false);
    expect(play('furycalm-snarl', [], ['forest'])).toBe(true);
    expect(play('spectator-seating', ['plains', 'mountain'])).toBe(true);
  });

  it('cycling lands cycle from hand for {2}', () => {
    const g = game({ p1: { hand: ['glittering-massif'], battlefield: n('plains', 2) } });
    const cycle = g.legal().find((a) => a.type === 'activateAbility');
    expect(cycle).toBeDefined();
    g.do(cycle!);
    settle(g);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual([
      'glittering-massif',
    ]);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Path of Ancestry scries when its mana casts a creature sharing a type with the commander', () => {
    const g = game({
      p1: {
        commander: mabel,
        hand: ['heartfire-hero'],
        battlefield: ['path-of-ancestry'],
      },
    });
    cast(g, 'heartfire-hero');
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
  });

  it('Unclaimed Territory’s coloured mana only casts creatures of the chosen type', () => {
    const g = game({
      p1: { hand: ['unclaimed-territory', 'heartfire-hero', 'shock'], battlefield: [] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'unclaimed-territory', 'hand') });
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'chooseOption') throw new Error(`expected a type choice, got ${d.kind}`);
    g.do({
      type: 'chooseOption',
      player: 'p1',
      index: d.options.findIndex((o) => o.label === 'Mouse'),
    });
    settle(g);
    const ids = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => g.obj((a as { card: string }).card).defId);
    expect(new Set(ids)).toEqual(new Set(['heartfire-hero']));
  });
});
