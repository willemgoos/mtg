import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Lorwyn Eclipsed 18b, group multi-a: the W/U, U/B, B/R, R/G and G/W gold cards.

const NAMES = [
  'Boggart Cursecrafter',
  "Brigid's Command",
  'Chaos Spewer',
  'Deepchannel Duelist',
  'Deepway Navigator',
  'Dream Harvest',
  'Eclipsed Boggart',
  'Eclipsed Kithkin',
  'Eclipsed Merrow',
  'Figure of Fable',
  'Gangly Stompling',
  "Grub's Command",
  'Merrow Skyswimmer',
  'Mischievous Sneakling',
  'Noggle Robber',
  'Raiding Schemes',
  'Shadow Urchin',
  "Sygg's Command",
  'Thoughtweft Lieutenant',
  'Voracious Tome-Skimmer',
  'Wary Farmer',
];
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-');

const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
const subtypes = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).subtypes,
];
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p);
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, accept = false): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'castFree' && accept) g.do(g.legal().find((a) => a.type === 'castSpell')!);
    else if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept });
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else break;
  }
  return g;
}

/** Passes priority (taking default choices) until the given step is reached. */
function toStep(g: GameDriver, step: string): void {
  for (let i = 0; i < 80; i++) {
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes until the attackers are to be declared. */
function toAttackers(g: GameDriver): void {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
}

type Cast = Extract<ReturnType<GameDriver['legal']>[number], { type: 'castSpell' }>;
/** The cast of a "choose two" Command with this mode pair whose targets satisfy `ok`. */
function castPair(g: GameDriver, mode: number, ok: (targets: Cast['targets']) => boolean): Cast {
  const a = g
    .legal()
    .find((x): x is Cast => x.type === 'castSpell' && x.mode === mode && ok(x.targets));
  if (!a) throw new Error(`no cast of mode ${mode}`);
  return a;
}
const isObj = (id: string) => (t: Cast['targets'][number]) => 'object' in t && t.object.id === id;
const isPlayer = (p: string) => (t: Cast['targets'][number]) => 'player' in t && t.player === p;

const activate = (g: GameDriver, source: string, abilityIndex: number) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets: [],
  } as never);

describe('the cards are all there', () => {
  it('every multi-a card is in the card pool', () => {
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('white-blue: Merfolk', () => {
  it('Deepchannel Duelist: other Merfolk get +1/+1, and it untaps a Merfolk at your end step', () => {
    const g = game({
      p1: {
        battlefield: [
          'deepchannel-duelist',
          { card: 'ecl-merfolk-token', tapped: true },
          'ecl-kithkin-token',
        ],
      },
    });
    const duelist = g.id('p1', 'deepchannel-duelist');
    const token = g.id('p1', 'ecl-merfolk-token');
    expect(pt(g, duelist)).toEqual([2, 2]);
    expect(pt(g, token)).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'ecl-kithkin-token'))).toEqual([1, 1]);
    for (let i = 0; i < 60 && g.decision.kind !== 'chooseTriggerTargets'; i++) {
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else g.pass();
    }
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === token),
      ),
    );
    done(g);
    expect(g.obj(token).tapped).toBe(false);
  });

  it('Deepway Navigator: flash, untaps each other Merfolk, and attacking with three Merfolk gives +1/+0', () => {
    const g = game({
      p1: {
        hand: ['deepway-navigator'],
        battlefield: [
          'plains',
          'island',
          { card: 'ecl-merfolk-token', tapped: true },
          { card: 'ecl-merfolk-token', tapped: true },
          { card: 'ecl-kithkin-token', tapped: true },
        ],
      },
    });
    expect(keywords(g, g.id('p1', 'deepway-navigator', 'hand'))).toContain('flash');
    done(cast(g, 'deepway-navigator'));
    const tokens = bf(g, 'ecl-merfolk-token');
    expect(tokens.every((id) => !g.obj(id).tapped)).toBe(true);
    expect(g.obj(g.id('p1', 'ecl-kithkin-token')).tapped).toBe(true);
    const nav = g.id('p1', 'deepway-navigator');
    expect(pt(g, tokens[0]!)).toEqual([1, 1]);
    // Three Merfolk attacked this turn.
    g.state.turn.attackers = [tokens[0]!, tokens[1]!, nav];
    expect(pt(g, tokens[0]!)).toEqual([2, 1]);
    expect(pt(g, nav)).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'ecl-kithkin-token'))).toEqual([1, 1]);
    // Only two Merfolk (and a Kithkin) attacked: no bonus.
    g.state.turn.attackers = [tokens[0]!, tokens[1]!, g.id('p1', 'ecl-kithkin-token')];
    expect(pt(g, tokens[0]!)).toEqual([1, 1]);
  });

  it('Deepway Navigator: the bonus comes from really attacking with three Merfolk', () => {
    const g = game({
      p1: {
        battlefield: ['deepway-navigator', 'ecl-merfolk-token', 'ecl-merfolk-token'],
      },
    });
    const nav = g.id('p1', 'deepway-navigator');
    g.state.objects[nav]!.summoningSick = false;
    toAttackers(g);
    const [a, b] = bf(g, 'ecl-merfolk-token');
    g.state.objects[a!]!.summoningSick = false;
    g.state.objects[b!]!.summoningSick = false;
    g.attack(nav, a!, b!);
    expect(pt(g, a!)).toEqual([2, 1]);
  });

  it('Eclipsed Merrow: take a Merfolk, Plains or Island from the top four, the rest go to the bottom', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-merrow'],
        battlefield: ['plains', 'plains', 'island', 'island'],
        library: ['forest', 'swamp', 'island', 'forest', 'mountain', 'mountain'],
      },
    });
    cast(g, 'eclipsed-merrow');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(options).toEqual(['island']);
    done(g);
    expect(hand(g)).toEqual(['island']);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib.slice(0, 2)).toEqual(['mountain', 'mountain']);
    expect([...lib].sort()).toEqual(['forest', 'forest', 'mountain', 'mountain', 'swamp']);
  });

  it('Merrow Skyswimmer: convoke, flying, vigilance and a Merfolk token', () => {
    const g = game({
      p1: {
        hand: ['merrow-skyswimmer'],
        battlefield: ['plains', 'ecl-merfolk-token', 'ecl-kithkin-token', 'ecl-merfolk-token'],
      },
    });
    const sky = g.id('p1', 'merrow-skyswimmer', 'hand');
    expect(keywords(g, sky)).toEqual(expect.arrayContaining(['flying', 'vigilance']));
    expect(cardDb.get('merrow-skyswimmer')!.convoke).toBe(true);
    // {3}{W/U}{W/U} with one Plains and three creatures: not enough, only four mana.
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === sky)).toBe(false);
    const g2 = game({
      p1: {
        hand: ['merrow-skyswimmer'],
        battlefield: [
          'plains',
          'plains',
          'ecl-merfolk-token',
          'ecl-kithkin-token',
          'ecl-merfolk-token',
        ],
      },
    });
    cast(g2, 'merrow-skyswimmer');
    done(g2);
    expect(bf(g2, 'merrow-skyswimmer')).toHaveLength(1);
    expect(bf(g2, 'ecl-merfolk-token')).toHaveLength(3);
  });

  it("Sygg's Command: draw a card and tap + stun a creature", () => {
    const g = game({
      p1: { hand: ['syggs-command'], battlefield: ['plains', 'plains', 'island'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    // Modes: 0 copy, 1 lifelink, 2 draw, 3 tap: the pair (draw, tap) is number 5.
    g.do(castPair(g, 5, (t) => t.some(isPlayer('p1')) && t.some(isObj(lions))));
    done(g);
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.obj(lions).counters?.stun).toBe(1);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it("Sygg's Command: copy of a Merfolk, and lifelink for the target player's creatures", () => {
    const g = game({
      p1: {
        hand: ['syggs-command'],
        battlefield: ['plains', 'plains', 'island', 'ecl-merfolk-token', 'ecl-kithkin-token'],
      },
    });
    const token = g.id('p1', 'ecl-merfolk-token');
    g.do(castPair(g, 0, (t) => t.some(isObj(token)) && t.some(isPlayer('p1'))));
    done(g);
    expect(bf(g, 'ecl-merfolk-token')).toHaveLength(2);
    // The copy is made first (printed order), so only the original and the Kithkin gained lifelink... the copy is
    // created before the lifelink resolves, so it gets it too.
    for (const id of [...bf(g, 'ecl-merfolk-token'), g.id('p1', 'ecl-kithkin-token')])
      expect(keywords(g, id), id).toContain('lifelink');
  });

  it("Sygg's Command: lifelink goes to the creatures of the chosen player only", () => {
    const g = game({
      p1: {
        hand: ['syggs-command'],
        battlefield: ['plains', 'plains', 'island', 'ecl-kithkin-token'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    // Lifelink (1) + tap (3) is pair number 4; the player target is p2.
    g.do(castPair(g, 4, (t) => t.some(isPlayer('p2')) && t.some(isObj(lions))));
    done(g);
    expect(keywords(g, lions)).toContain('lifelink');
    expect(keywords(g, g.id('p1', 'ecl-kithkin-token'))).not.toContain('lifelink');
  });
});

describe('Commands: the modes are separate instances of "target"', () => {
  it("Sygg's Command: the same player can be chosen for lifelink and for drawing", () => {
    const g = game({
      p1: {
        hand: ['syggs-command'],
        battlefield: ['plains', 'plains', 'island', 'ecl-kithkin-token'],
      },
    });
    // (lifelink, draw) is pair number 3: both target p1.
    g.do(castPair(g, 3, (t) => t.length === 2 && t.every(isPlayer('p1'))));
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(keywords(g, g.id('p1', 'ecl-kithkin-token'))).toContain('lifelink');
  });
});

describe('blue-black', () => {
  it('Mischievous Sneakling is a flash changeling', () => {
    const g = game({ p1: { hand: ['mischievous-sneakling'], battlefield: ['island', 'island'] } });
    const id = g.id('p1', 'mischievous-sneakling', 'hand');
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['flash', 'changeling']));
  });

  it("Voracious Tome-Skimmer: you may pay 1 life to draw when you cast a spell on an opponent's turn", () => {
    const own = game({
      p1: {
        hand: ['mischievous-sneakling'],
        battlefield: ['voracious-tome-skimmer', 'island', 'island'],
      },
    });
    cast(own, 'mischievous-sneakling');
    done(own, true);
    expect(own.life('p1')).toBe(20);
    expect(own.state.players.p1.hand).toHaveLength(0);

    const make = () => {
      const g = game({
        active: 'p2',
        p1: {
          hand: ['mischievous-sneakling'],
          battlefield: ['voracious-tome-skimmer', 'island', 'island'],
        },
      });
      g.state.decision = { kind: 'priority', player: 'p1' };
      return g;
    };
    const pay = make();
    cast(pay, 'mischievous-sneakling');
    done(pay, true);
    expect(pay.life('p1')).toBe(19);
    expect(pay.state.players.p1.hand).toHaveLength(1);

    const decline = make();
    cast(decline, 'mischievous-sneakling');
    done(decline, false);
    expect(decline.life('p1')).toBe(20);
    expect(decline.state.players.p1.hand).toHaveLength(0);
  });

  it('Dream Harvest: exiles from the opponent until total mana value 5, you may cast them free this turn', () => {
    const g = game({
      p1: {
        hand: ['dream-harvest'],
        battlefield: ['island', 'island', 'island', 'island', 'island', 'swamp', 'swamp'],
      },
      p2: { library: ['forest', 'bear-cub', 'serra-angel', 'forest', 'forest'] },
    });
    cast(g, 'dream-harvest');
    done(g);
    // forest (0) + bear-cub (2) + serra-angel (5): the total passes 5 with the Angel.
    expect(exile(g, 'p2')).toEqual(['forest', 'bear-cub', 'serra-angel']);
    const angel = g.id('p2', 'serra-angel', 'exile');
    const bear = g.id('p2', 'bear-cub', 'exile');
    const forest = g.id('p2', 'forest', 'exile');
    const castable = g.legal().flatMap((a) => (a.type === 'castSpell' ? [a.card] : []));
    expect(castable).toContain(angel);
    expect(castable).toContain(bear);
    // A land can't be cast or played this way.
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === forest)).toBe(false);
    g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === angel)!);
    done(g);
    expect(g.obj(angel).zone).toBe('battlefield');
    expect(g.obj(angel).controller).toBe('p1');
    // Only until end of turn.
    g.state.turn.number++;
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(false);
  });

  it('Dream Harvest: stops exiling when the library runs out', () => {
    const g = game({
      p1: {
        hand: ['dream-harvest'],
        battlefield: ['island', 'island', 'island', 'island', 'island', 'swamp', 'swamp'],
      },
      p2: { library: ['forest', 'bear-cub'] },
    });
    cast(g, 'dream-harvest');
    done(g);
    expect(exile(g, 'p2')).toEqual(['forest', 'bear-cub']);
    expect(g.state.players.p2.library).toHaveLength(0);
  });
});

describe('black-red: Goblins and blight', () => {
  it('Boggart Cursecrafter: deathtouch; another Goblin you control dying pings each opponent', () => {
    const g = game({
      p1: {
        hand: ['grubs-command'],
        battlefield: [
          'boggart-cursecrafter',
          'ecl-goblin-token',
          'swamp',
          'swamp',
          'swamp',
          'mountain',
          'mountain',
        ],
      },
    });
    expect(keywords(g, g.id('p1', 'boggart-cursecrafter'))).toContain('deathtouch');
    const goblin = g.id('p1', 'ecl-goblin-token');
    // Modes: 0 copy, 1 haste, 2 destroy, 3 mill: (haste, destroy) is pair number 3; targets: player, permanent.
    g.do(castPair(g, 3, (t) => t.some(isPlayer('p1')) && t.some(isObj(goblin))));
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(goblin).zone).not.toBe('battlefield');
  });

  it("Boggart Cursecrafter doesn't trigger for itself or for a non-Goblin", () => {
    const g = game({
      p1: {
        hand: ['grubs-command'],
        battlefield: [
          'boggart-cursecrafter',
          'ecl-kithkin-token',
          'swamp',
          'swamp',
          'swamp',
          'mountain',
          'mountain',
        ],
      },
    });
    const kithkin = g.id('p1', 'ecl-kithkin-token');
    g.do(castPair(g, 3, (t) => t.some(isPlayer('p1')) && t.some(isObj(kithkin))));
    done(g);
    expect(g.obj(kithkin).zone).not.toBe('battlefield');
    expect(g.life('p2')).toBe(20);
    const cc = g.id('p1', 'boggart-cursecrafter');
    g.state.objects[cc]!.damage = 9;
    g.pass();
    done(g);
    expect(g.life('p2')).toBe(20);
  });

  it('Chaos Spewer: pay {2} or blight 2', () => {
    const decline = game({
      p1: { hand: ['chaos-spewer'], battlefield: ['swamp', 'swamp', 'swamp'] },
    });
    cast(decline, 'chaos-spewer');
    done(decline, false);
    const spewer = decline.id('p1', 'chaos-spewer');
    expect(minus(decline, spewer)).toBe(2);
    expect(pt(decline, spewer)).toEqual([3, 2]);

    const pay = game({
      p1: { hand: ['chaos-spewer'], battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'swamp'] },
    });
    cast(pay, 'chaos-spewer');
    done(pay, true);
    expect(minus(pay, pay.id('p1', 'chaos-spewer'))).toBe(0);
    expect(pt(pay, pay.id('p1', 'chaos-spewer'))).toEqual([5, 4]);
  });

  it('Eclipsed Boggart: Goblin, Swamp or Mountain (a changeling is a Goblin in the library too)', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-boggart'],
        battlefield: ['swamp', 'swamp', 'swamp'],
        library: ['forest', 'mischievous-sneakling', 'plains', 'mountain', 'forest'],
      },
    });
    cast(g, 'eclipsed-boggart');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(options.sort()).toEqual(['mischievous-sneakling', 'mountain']);
    done(g);
    expect(hand(g)).toHaveLength(1);
  });

  it('Shadow Urchin: blights on attack, and exiles that many cards when a creature with counters dies', () => {
    const g = game({
      p1: {
        battlefield: ['shadow-urchin'],
        library: ['mountain', 'swamp', 'forest', 'plains', 'island'],
      },
    });
    const urchin = g.id('p1', 'shadow-urchin');
    g.state.objects[urchin]!.summoningSick = false;
    toAttackers(g);
    g.attack(urchin);
    done(g);
    expect(minus(g, urchin)).toBe(1);
    expect(pt(g, urchin)).toEqual([2, 3]);
    // Kill it: it has one counter, so one card is exiled.
    g.state.objects[urchin]!.damage = 3;
    g.pass();
    done(g);
    expect(g.obj(urchin).zone).toBe('graveyard');
    expect(exile(g)).toEqual(['mountain']);
    const mountain = g.id('p1', 'mountain', 'exile');
    expect(g.obj(mountain).playableUntilTurn).toBeDefined();
    toStep(g, 'main2');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === mountain)).toBe(true);
  });

  it('Shadow Urchin: a creature without counters dying exiles nothing', () => {
    const g = game({
      p1: {
        battlefield: ['shadow-urchin', 'ecl-goblin-token'],
        library: ['mountain', 'swamp', 'forest'],
      },
    });
    g.state.objects[g.id('p1', 'ecl-goblin-token')]!.damage = 1;
    g.pass();
    done(g);
    expect(exile(g)).toEqual([]);
  });

  it("Grub's Command: mill five, Goblin cards go to hand; copy a Goblin", () => {
    const g = game({
      p1: {
        hand: ['grubs-command'],
        battlefield: ['swamp', 'swamp', 'swamp', 'mountain', 'mountain', 'ecl-goblin-token'],
      },
      p2: {
        library: [
          'ecl-goblin-token',
          'forest',
          'mischievous-sneakling',
          'forest',
          'forest',
          'forest',
          'forest',
        ],
      },
    });
    const goblin = g.id('p1', 'ecl-goblin-token');
    // Copy (0) + mill (3) is pair number 2; targets: Goblin, then player.
    g.do(castPair(g, 2, (t) => t.some(isObj(goblin)) && t.some(isPlayer('p2'))));
    done(g);
    expect(bf(g, 'ecl-goblin-token')).toHaveLength(2);
    // Five cards were milled: the token card (a Goblin card? tokens aren't in decks, but the fixture is a card), a
    // forest, the changeling, two forests. The Goblins among them went to hand.
    expect(g.state.players.p2.library).toHaveLength(2);
    expect(hand(g, 'p2').sort()).toEqual(['ecl-goblin-token', 'mischievous-sneakling']);
    expect(gy(g, 'p2')).toEqual(['forest', 'forest', 'forest']);
  });

  it("Grub's Command: the creatures of the target player get +1/+1 and haste", () => {
    const g = game({
      p1: {
        hand: ['grubs-command'],
        battlefield: ['swamp', 'swamp', 'swamp', 'mountain', 'mountain', 'ecl-goblin-token'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const goblin = g.id('p1', 'ecl-goblin-token');
    // Copy (0) + haste (1) is pair number 0; targets: Goblin, then player.
    g.do(castPair(g, 0, (t) => t.some(isObj(goblin)) && t.some(isPlayer('p1'))));
    done(g);
    for (const id of bf(g, 'ecl-goblin-token')) {
      expect(pt(g, id)).toEqual([2, 2]);
      expect(keywords(g, id)).toContain('haste');
    }
    expect(pt(g, g.id('p2', 'savannah-lions'))).toEqual([2, 1]);
  });
});

describe('red-green', () => {
  it('Gangly Stompling is a changeling with trample', () => {
    const g = game({ p1: { battlefield: ['gangly-stompling'] } });
    const id = g.id('p1', 'gangly-stompling');
    expect(keywords(g, id)).toEqual(expect.arrayContaining(['changeling', 'trample']));
  });

  it('Noggle Robber: a Treasure when it enters and when it dies', () => {
    const g = game({
      p1: { hand: ['noggle-robber'], battlefield: ['mountain', 'mountain', 'mountain'] },
    });
    done(cast(g, 'noggle-robber'));
    expect(bf(g, 'treasure-token')).toHaveLength(1);
    g.state.objects[g.id('p1', 'noggle-robber')]!.damage = 3;
    g.pass();
    done(g);
    expect(bf(g, 'treasure-token')).toHaveLength(2);
  });

  it('Raiding Schemes: noncreature spells may be cast with conspire, creature spells not', () => {
    const g = game({
      p1: {
        hand: ['syggs-command', 'mischievous-sneakling'],
        battlefield: [
          'raiding-schemes',
          'ecl-merfolk-token',
          'ecl-merfolk-token',
          'plains',
          'plains',
          'island',
          'island',
          'island',
        ],
      },
    });
    const command = g.id('p1', 'syggs-command', 'hand');
    const sneakling = g.id('p1', 'mischievous-sneakling', 'hand');
    const conspired = (card: string) =>
      g.legal().filter((a) => a.type === 'castSpell' && a.card === card && a.conspire);
    expect(conspired(command).length).toBeGreaterThan(0);
    expect(conspired(sneakling)).toHaveLength(0);
  });
});

describe('green-white: Kithkin', () => {
  it('Eclipsed Kithkin: Kithkin, Forest or Plains from the top four', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-kithkin'],
        battlefield: ['forest', 'forest'],
        library: ['island', 'plains', 'swamp', 'forest', 'mountain'],
      },
    });
    cast(g, 'eclipsed-kithkin');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(options.sort()).toEqual(['forest', 'plains']);
    done(g);
    expect(hand(g)).toHaveLength(1);
  });

  it('Figure of Fable: Scout, then Soldier (only from a Scout), then Avatar (only from a Soldier)', () => {
    const lands = [...n('forest', 13), ...n('plains', 13)];
    const g = game({ p1: { battlefield: ['figure-of-fable', ...lands] } });
    const fig = g.id('p1', 'figure-of-fable');
    expect(pt(g, fig)).toEqual([1, 1]);
    // The Soldier and Avatar levels do nothing yet.
    activate(g, fig, 2);
    done(g);
    activate(g, fig, 1);
    done(g);
    expect(pt(g, fig)).toEqual([1, 1]);
    expect(subtypes(g, fig)).toEqual(['Kithkin']);
    activate(g, fig, 0);
    done(g);
    expect(pt(g, fig)).toEqual([2, 3]);
    expect(subtypes(g, fig)).toEqual(['Kithkin', 'Scout']);
    // The Avatar level needs a Soldier.
    activate(g, fig, 2);
    done(g);
    expect(pt(g, fig)).toEqual([2, 3]);
    activate(g, fig, 1);
    done(g);
    expect(pt(g, fig)).toEqual([4, 5]);
    expect(subtypes(g, fig)).toEqual(['Kithkin', 'Soldier']);
    activate(g, fig, 2);
    done(g);
    expect(pt(g, fig)).toEqual([7, 8]);
    expect(subtypes(g, fig)).toEqual(['Kithkin', 'Avatar']);
    // It stays that way past the end of the turn.
    toStep(g, 'end');
    expect(pt(g, fig)).toEqual([7, 8]);
  });

  it('Figure of Fable as an Avatar: protection from each of your opponents', () => {
    const g = game({
      p1: { battlefield: ['figure-of-fable', ...n('forest', 13), ...n('plains', 13)] },
      p2: { hand: ['lightning-strike'], battlefield: ['savannah-lions', 'mountain', 'mountain'] },
    });
    const fig = g.id('p1', 'figure-of-fable');
    for (const i of [0, 1, 2]) {
      activate(g, fig, i);
      done(g);
    }
    const lions = g.id('p2', 'savannah-lions');
    expect(pt(g, fig)).toEqual([7, 8]);
    // Not blockable by their creatures.
    g.state.objects[fig]!.summoningSick = false;
    toAttackers(g);
    g.attack(fig);
    // With no legal blocker, the blockers aren't even asked for: it connects.
    toStep(g, 'main2');
    expect(g.life('p2')).toBe(13);
    expect(g.obj(lions).zone).toBe('battlefield');
  });

  it('Figure of Fable before the last level can be blocked', () => {
    const g = game({
      p1: { battlefield: ['figure-of-fable', ...n('forest', 13), ...n('plains', 13)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const fig = g.id('p1', 'figure-of-fable');
    activate(g, fig, 0);
    done(g);
    activate(g, fig, 1);
    done(g);
    g.state.objects[fig]!.summoningSick = false;
    toAttackers(g);
    g.attack(fig);
    for (let i = 0; i < 5 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'addBlock' &&
            a.blocker === g.id('p2', 'savannah-lions') &&
            a.attacker === fig,
        ),
    ).toBe(true);
  });

  it('Figure of Fable as an Avatar: can’t be targeted by their spells and takes no damage from their sources', () => {
    const make = (levels: number[]) => {
      const g = game({
        p1: { battlefield: ['figure-of-fable', ...n('forest', 13), ...n('plains', 13)] },
        p2: { hand: ['lightning-strike'], battlefield: ['mountain', 'mountain', 'savannah-lions'] },
      });
      const fig = g.id('p1', 'figure-of-fable');
      for (const i of levels) {
        activate(g, fig, i);
        done(g);
      }
      g.state.turn.activePlayer = 'p2';
      g.state.decision = { kind: 'priority', player: 'p2' };
      return { g, fig };
    };
    const strikesAt = (g: GameDriver, fig: string) =>
      g.legal('p2').filter((a) => a.type === 'castSpell' && a.targets.some(isObj(fig)));
    // Control: as a Scout it can be targeted.
    const scout = make([0]);
    expect(strikesAt(scout.g, scout.fig).length).toBeGreaterThan(0);
    const avatar = make([0, 1, 2]);
    expect(strikesAt(avatar.g, avatar.fig)).toHaveLength(0);
  });

  it('Figure of Fable as an Avatar: damage from their creatures is prevented', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['figure-of-fable', ...n('forest', 13), ...n('plains', 13)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const fig = g.id('p1', 'figure-of-fable');
    // Level it up on p1's priority (the engine lets the non-active player act with priority).
    g.state.decision = { kind: 'priority', player: 'p1' };
    for (const i of [0, 1, 2]) {
      g.state.decision = { kind: 'priority', player: 'p1' };
      activate(g, fig, i);
      done(g);
    }
    g.state.decision = { kind: 'priority', player: 'p2' };
    const lions = g.id('p2', 'savannah-lions');
    g.state.objects[lions]!.summoningSick = false;
    toAttackers(g);
    g.attack(lions);
    for (let i = 0; i < 5 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    g.block([fig, lions]);
    toStep(g, 'main2');
    expect(g.obj(fig).damage).toBe(0);
    expect(g.obj(lions).zone).toBe('graveyard');
  });

  it('Thoughtweft Lieutenant: when it enters, a creature you control gets +1/+1 and trample', () => {
    const g = game({
      p1: {
        hand: ['thoughtweft-lieutenant'],
        battlefield: ['savannah-lions', 'forest', 'plains'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'thoughtweft-lieutenant');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      ),
    );
    done(g);
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('trample');
  });

  it('Thoughtweft Lieutenant: another Kithkin entering triggers it, a non-Kithkin does not', () => {
    const g = game({
      p1: {
        hand: ['eclipsed-kithkin', 'noggle-robber'],
        battlefield: [
          'thoughtweft-lieutenant',
          'forest',
          'forest',
          'plains',
          'plains',
          'mountain',
          'mountain',
          'mountain',
        ],
      },
    });
    const lt = g.id('p1', 'thoughtweft-lieutenant');
    cast(g, 'noggle-robber');
    done(g);
    expect(keywords(g, lt)).not.toContain('trample');
    cast(g, 'eclipsed-kithkin');
    settle(g);
    done(g);
    expect(pt(g, lt)[0]! + pt(g, g.id('p1', 'eclipsed-kithkin'))[0]!).toBe(5);
  });

  it('Wary Farmer: surveils at your end step only if another creature entered this turn', () => {
    const quiet = game({ p1: { battlefield: ['wary-farmer'] } });
    toStep(quiet, 'end');
    done(quiet);
    expect(quiet.state.turn.scriedOrSurveilled ?? []).not.toContain('p1');

    const g = game({
      p1: { hand: ['mischievous-sneakling'], battlefield: ['wary-farmer', 'island', 'island'] },
    });
    done(cast(g, 'mischievous-sneakling'));
    toStep(g, 'end');
    done(g);
    expect(g.state.turn.scriedOrSurveilled ?? []).toContain('p1');

    // A creature that entered and died still counts; the Farmer entering itself does not.
    const self = game({
      p1: { hand: ['wary-farmer'], battlefield: ['forest', 'forest', 'plains'] },
    });
    done(cast(self, 'wary-farmer'));
    toStep(self, 'end');
    done(self);
    expect(self.state.turn.scriedOrSurveilled ?? []).not.toContain('p1');
  });

  it("Brigid's Command: copy a Kithkin and +3/+3 (choose two)", () => {
    const g = game({
      p1: {
        hand: ['brigids-command'],
        battlefield: ['forest', 'forest', 'plains', 'ecl-kithkin-token'],
      },
    });
    const kithkin = g.id('p1', 'ecl-kithkin-token');
    // Modes: 0 copy, 1 token, 2 +3/+3, 3 fight: (copy, +3/+3) is pair number 1.
    g.do(castPair(g, 1, (t) => t.length === 2 && t.every(isObj(kithkin))));
    done(g);
    expect(bf(g, 'ecl-kithkin-token')).toHaveLength(2);
    expect(pt(g, kithkin)).toEqual([4, 4]);
  });

  it("Brigid's Command: target player creates a Kithkin, and your creature fights theirs", () => {
    const g = game({
      p1: {
        hand: ['brigids-command'],
        battlefield: ['forest', 'forest', 'plains', 'serra-angel'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const angel = g.id('p1', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    // (token, fight) is pair number 4; targets: player, your creature, their creature.
    g.do(castPair(g, 4, (t) => t.length === 3 && t.some(isPlayer('p2')) && t.some(isObj(lions))));
    done(g);
    expect(bf(g, 'ecl-kithkin-token', 'p2')).toHaveLength(1);
    expect(g.obj(lions).zone).toBe('graveyard');
    expect(g.obj(angel).damage).toBe(2);
  });
});

describe('random games', () => {
  it('decks of these cards play to the end without errors', () => {
    const engine = createEngine(cardDb);
    const spells = NAMES.flatMap((name) => [slug(name), slug(name)]);
    const lands = [
      ...n('plains', 4),
      ...n('island', 4),
      ...n('swamp', 4),
      ...n('mountain', 4),
      ...n('forest', 4),
    ];
    const deck = [...spells, ...lands].slice(0, 60);
    let finished = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      if (r.winner || r.turns > 0) finished++;
    }
    expect(finished).toBe(15);
  });
});
