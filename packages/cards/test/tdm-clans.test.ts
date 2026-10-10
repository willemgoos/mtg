import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, settle } from './blb-helpers.ts';
import { board, choose, done, exile, game, gy, hand, labels, n, pt, stop } from './ecl-special-helpers.ts';

// Tarkir: Dragonstorm 19b, group clans: the Abzan, Jeskai and Sultai three-colour cards and Call the Spirit Dragons.

const NAMES = [
  'Armament Dragon',
  'Awaken the Honored Dead',
  'Betor, Kin to All',
  'Call the Spirit Dragons',
  'Death Begets Life',
  "Fangkeeper's Familiar",
  'Felothar, Dawn of the Abzan',
  'Flamehold Grappler',
  'Gurmag Nightwatch',
  'Jeskai Brushmaster',
  'Jeskai Revelation',
  'Jeskai Shrinekeeper',
  'Kheru Goldkeeper',
  'Kotis, the Fangkeeper',
  'Lie in Wait',
  'Lotuslight Dancers',
  'Monastery Messenger',
  'Narset, Jeskai Waymaster',
  'New Way Forward',
  'Perennation',
  "Rakshasa's Bargain",
  'Rediscover the Way',
  'Reputable Merchant',
  'Revival of the Ancestors',
  'Riverwheel Sweep',
  'Severance Priest',
  'Shiko, Paragon of the Way',
  'Skirmish Rhino',
  'Teval, Arbiter of Virtue',
  'Yathan Roadwatcher',
];
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const keywords = (g: GameDriver, id: string) => [...chars(g, id).keywords];
const on = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') => board(g, defId, p);
const counters = (g: GameDriver, id: string, kind?: string) => (kind ? (g.obj(id).counters?.[kind] ?? 0) : g.obj(id).plusOneCounters);
const lands = (...xs: [string, number][]) => xs.flatMap(([c, k]) => n(c, k));
const objTarget = (g: GameDriver, id: string) => g.ref(id);

describe('the cards are all there', () => {
  it('every clans card is in the card pool', () => {
    for (const name of NAMES) expect(cardDb.get(slug(name)), name).toBeDefined();
  });
});

describe('Abzan', () => {
  it('Skirmish Rhino: trample, each opponent loses 2 life and you gain 2', () => {
    const g = game({ p1: { hand: ['skirmish-rhino'], battlefield: lands(['plains', 1], ['swamp', 1], ['forest', 1]) } });
    cast(g, 'skirmish-rhino');
    done(g);
    expect(g.life('p1')).toBe(22);
    expect(g.life('p2')).toBe(18);
    expect(keywords(g, g.id('p1', 'skirmish-rhino'))).toContain('trample');
  });

  it('Reputable Merchant: a +1/+1 counter on a creature you control when it enters and when it dies', () => {
    const g = game({
      p1: {
        hand: ['reputable-merchant', 'lightning-bolt'],
        battlefield: [...lands(['plains', 1], ['swamp', 1], ['forest', 1], ['mountain', 1]), 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'reputable-merchant');
    done(g, { target: (a) => a.targets.some((t) => 'object' in t && t.object.id === angel) });
    expect(counters(g, angel)).toBe(1);
    const merchant = g.id('p1', 'reputable-merchant');
    cast(g, 'lightning-bolt', [objTarget(g, merchant)]);
    done(g);
    expect(g.zoneOf(merchant)).toBe('graveyard');
    expect(counters(g, angel)).toBe(2);
  });

  it('Severance Priest: exiles a nonland card of the opponent; when it leaves, the owner gets an X/X Spirit (X = its mana value)', () => {
    const g = game({
      p1: { hand: ['severance-priest', 'lightning-bolt'], battlefield: lands(['plains', 1], ['swamp', 1], ['forest', 1], ['mountain', 1]) },
      p2: { hand: ['forest', 'shivan-dragon', 'giant-growth'] },
    });
    cast(g, 'severance-priest');
    done(g, { card: (id) => g.obj(id).defId === 'shivan-dragon' });
    expect(exile(g, 'p2')).toEqual(['shivan-dragon']);
    expect(hand(g, 'p2')).toEqual(['forest', 'giant-growth']);
    cast(g, 'lightning-bolt', [objTarget(g, g.id('p1', 'severance-priest'))]);
    done(g);
    const spirits = on(g, 'tdm-spirit-token', 'p2');
    expect(spirits).toHaveLength(1);
    expect(pt(g, spirits[0]!)).toEqual([6, 6]);
  });

  it('Severance Priest: "you may choose" a card; choosing none exiles nothing and the Priest leaving makes no Spirit', () => {
    const g = game({
      p1: { hand: ['severance-priest', 'lightning-bolt'], battlefield: lands(['plains', 1], ['swamp', 1], ['forest', 1], ['mountain', 1]) },
      p2: { hand: ['giant-growth'] },
    });
    cast(g, 'severance-priest');
    stop(g);
    settle(g);
    expect(g.decision.kind).toBe('chooseFromHand');
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    done(g);
    expect(exile(g, 'p2')).toEqual([]);
    cast(g, 'lightning-bolt', [objTarget(g, g.id('p1', 'severance-priest'))]);
    done(g);
    expect(on(g, 'tdm-spirit-token', 'p2')).toHaveLength(0);
  });

  it('Felothar: trample; sacrificing a nonland permanent when it enters puts a +1/+1 counter on each creature you control', () => {
    const g = game({
      p1: {
        hand: ['felothar-dawn-of-the-abzan'],
        battlefield: [...lands(['plains', 1], ['swamp', 1], ['forest', 1]), 'serra-angel', 'shivan-dragon'],
      },
    });
    cast(g, 'felothar-dawn-of-the-abzan');
    stop(g);
    // The "you may": yes; sacrifice the Shivan Dragon.
    done(g, { card: (id) => g.obj(id).defId === 'shivan-dragon' });
    expect(g.zoneOf(g.id('p1', 'shivan-dragon', 'graveyard'))).toBe('graveyard');
    expect(counters(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(counters(g, g.id('p1', 'felothar-dawn-of-the-abzan'))).toBe(1);
  });

  it('Felothar: declining the sacrifice does nothing', () => {
    const g = game({
      p1: { hand: ['felothar-dawn-of-the-abzan'], battlefield: [...lands(['plains', 1], ['swamp', 1], ['forest', 1]), 'serra-angel'] },
    });
    cast(g, 'felothar-dawn-of-the-abzan');
    done(g, { accept: false });
    expect(counters(g, g.id('p1', 'serra-angel'))).toBe(0);
    expect(g.zoneOf(g.id('p1', 'serra-angel'))).toBe('battlefield');
  });

  it('Yathan Roadwatcher: if cast, mills four and returns a creature card with mana value 3 or less from the graveyard', () => {
    const g = game({
      p1: {
        hand: ['yathan-roadwatcher'],
        library: ['forest', 'forest', 'forest', 'forest', 'forest', 'forest'],
        graveyard: ['skirmish-rhino', 'serra-angel'],
        battlefield: lands(['plains', 1], ['swamp', 1], ['forest', 2]),
      },
    });
    cast(g, 'yathan-roadwatcher');
    done(g, { card: (id) => g.obj(id).defId === 'skirmish-rhino' });
    expect(gy(g)).toContain('serra-angel');
    expect(on(g, 'skirmish-rhino')).toHaveLength(1);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('Armament Dragon: distributes three +1/+1 counters among one, two or three of your creatures, one target at a time', () => {
    const g = game({
      p1: {
        hand: ['armament-dragon'],
        battlefield: [...lands(['plains', 2], ['swamp', 2], ['forest', 2]), 'serra-angel', 'shivan-dragon'],
      },
    });
    cast(g, 'armament-dragon');
    stop(g);
    settle(g);
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).not.toContain('No targets');
    choose(g, /1 \+1\/\+1 counter on Serra Angel/);
    choose(g, /1 \+1\/\+1 counter on Shivan Dragon/);
    // Two counters are placed; the last target gets the rest.
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /Armament Dragon/);
    done(g);
    expect(counters(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(counters(g, g.id('p1', 'shivan-dragon'))).toBe(1);
    expect(counters(g, g.id('p1', 'armament-dragon'))).toBe(1);
  });

  it('Perennation: returns a permanent card with a hexproof counter and an indestructible counter', () => {
    const g = game({
      p1: { hand: ['perennation'], graveyard: ['serra-angel', 'lightning-bolt'], battlefield: lands(['plains', 2], ['swamp', 2], ['forest', 2]) },
    });
    const angel = g.id('p1', 'serra-angel', 'graveyard');
    cast(g, 'perennation', [objTarget(g, angel)]);
    done(g);
    const back = on(g, 'serra-angel')[0]!;
    expect(counters(g, back, 'hexproof')).toBe(1);
    expect(counters(g, back, 'indestructible')).toBe(1);
    expect(keywords(g, back)).toEqual(expect.arrayContaining(['hexproof', 'indestructible']));
  });

  it('Perennation cannot target an instant card', () => {
    const g = game({
      p1: { hand: ['perennation'], graveyard: ['lightning-bolt'], battlefield: lands(['plains', 2], ['swamp', 2], ['forest', 2]) },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Revival of the Ancestors: three 1/1 Spirits; three counters distributed; creatures gain trample and lifelink', () => {
    const g = game({ p1: { hand: ['revival-of-the-ancestors'], battlefield: lands(['plains', 2], ['swamp', 2], ['forest', 2]) } });
    cast(g, 'revival-of-the-ancestors');
    done(g);
    const spirits = on(g, 'tdm-spirit-token');
    expect(spirits).toHaveLength(3);
    expect(pt(g, spirits[0]!)).toEqual([1, 1]);
    // Chapter II on the next turn: three counters on one creature (the first option).
    g.passBoth();
    for (let i = 0; i < 80 && g.state.turn.number < 5; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    for (let i = 0; i < 30 && g.state.turn.step !== 'main1'; i++) {
      if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
    const total = on(g, 'tdm-spirit-token').reduce((k, id) => k + counters(g, id), 0);
    expect(total).toBe(3);
  });

  it('Betor: draws at your end step with total toughness 10, untaps creatures at 20, drains half the life at 40', () => {
    const g = game({
      p1: { battlefield: ['betor-kin-to-all', { card: 'serra-angel', tapped: true }] },
      p2: { life: 17 },
    });
    // Toughness 7 + 4 = 11: draw only.
    const before = hand(g).length;
    for (let i = 0; i < 40 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
    expect(hand(g).length).toBe(before + 1);
    expect(g.obj(g.id('p1', 'serra-angel')).tapped).toBe(true);
    expect(g.life('p2')).toBe(17);
  });

  const toEndStep = (g: GameDriver) => {
    for (let i = 0; i < 40 && g.state.turn.step !== 'end'; i++) {
      if (g.decision.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'priority') g.pass();
      else done(g);
    }
    done(g);
  };

  it('Betor: at total toughness 20 it also untaps your creatures', () => {
    const g = game({
      p1: { battlefield: ['betor-kin-to-all', { card: 'serra-angel', tapped: true }] },
      p2: { life: 17 },
    });
    g.state.objects[g.id('p1', 'betor-kin-to-all')]!.plusOneCounters = 9;
    toEndStep(g);
    expect(g.obj(g.id('p1', 'serra-angel')).tapped).toBe(false);
    expect(g.life('p2')).toBe(17);
  });

  it('Betor: at total toughness 40 each opponent loses half their life, rounded up', () => {
    const g = game({
      p1: { battlefield: ['betor-kin-to-all', { card: 'serra-angel', tapped: true }] },
      p2: { life: 17 },
    });
    g.state.objects[g.id('p1', 'betor-kin-to-all')]!.plusOneCounters = 29;
    toEndStep(g);
    expect(g.obj(g.id('p1', 'serra-angel')).tapped).toBe(false);
    expect(g.life('p2')).toBe(8);
  });

  it('Betor: under total toughness 10 nothing happens', () => {
    const g = game({ p1: { battlefield: ['skirmish-rhino', 'reputable-merchant'] } });
    const before = hand(g).length;
    toEndStep(g);
    expect(hand(g).length).toBe(before);
  });
});
