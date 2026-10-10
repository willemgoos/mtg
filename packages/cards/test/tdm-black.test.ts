import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '../src/index.ts';
import { TDM_BLACK, TDM_BLACK_BACKS } from '../src/tdm/black.ts';
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

// Tarkir: Dragonstorm 19b: the black cards.

const groups: Record<string, string> = JSON.parse(
  readFileSync(new URL('../scripts/data/tdm-groups.json', import.meta.url), 'utf8'),
);
const BLACK_CARDS = Object.entries(groups)
  .filter(([, g]) => g === 'black')
  .map(([name]) => name);

type Cast = Extract<Action, { type: 'castSpell' }>;
const keywords = (g: GameDriver, id: string) => chars(g, id).keywords;
const counters = (g: GameDriver, id: string) => g.obj(id).counters ?? {};
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const TOKEN_IDS: Record<string, string> = {
  Warrior: 'tdm-warrior-token',
  Spirit: 'tdm-spirit-token',
  'Zombie Druid': 'tdm-zombie-druid-token',
};
const tokens = (g: GameDriver, name: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).isToken && g.obj(id).controller === p && g.obj(id).defId === TOKEN_IDS[name],
  );
/** Has all of these keywords. */
const hasKw = (g: GameDriver, id: string, ...ks: string[]) =>
  ks.every((k) => keywords(g, id).has(k as never));
const cheapest = (list: Cast[]) => list[0]!;
/** Casts the (first) way of casting this card from hand, with these targets, and lets it resolve. */
function play(
  g: GameDriver,
  defId: string,
  pick: (a: Cast) => boolean = () => true,
  p: 'p1' | 'p2' = 'p1',
): GameDriver {
  const a = casts(g, defId, p).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return done(g);
}
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
/** Picks the target for a trigger by object id. */
const pickTarget = (id: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);

describe('Tarkir: Dragonstorm black: registry', () => {
  it('has behaviour for all 34 cards, and each exists in the pool', () => {
    expect(BLACK_CARDS).toHaveLength(34);
    for (const name of BLACK_CARDS) {
      expect(TDM_BLACK[name], name).toBeDefined();
      expect(cardDb.has(slug(name)), name).toBe(true);
    }
    expect(Object.keys(TDM_BLACK)).toHaveLength(34);
    for (const name of Object.keys(TDM_BLACK_BACKS))
      expect(cardDb.has(slug(name)), name).toBe(true);
  });

  it('the Omen creatures keep the card colour, and their spells have their own', () => {
    expect(cardDb.get('scavenger-regent')!.colors).toEqual(['B']);
    expect(cardDb.get('exude-toxin')!.colors).toEqual(['B']);
    expect(cardDb.get('absorb-essence')!.colors).toEqual(['W']);
    expect(cardDb.get('purging-stormbrood')!.colors).toEqual(['B']);
  });

  it('ward comes from the text', () => {
    expect(cardDb.get('scavenger-regent')!.wardCost?.discard).toBe(true);
    expect(cardDb.get('purging-stormbrood')!.wardCost?.life).toBe(2);
  });
});

describe('Qarsi Revenant and the other Renew cards', () => {
  it('flying, deathtouch and lifelink; renew puts all three counters on a creature', () => {
    const g = game({
      p1: { graveyard: ['qarsi-revenant'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const ks = cardDb.get('qarsi-revenant')!.keywords;
    expect(ks).toEqual(expect.arrayContaining(['flying', 'deathtouch', 'lifelink']));
    activate(g, g.id('p1', 'qarsi-revenant', 'graveyard'), 0, [g.ref(lions)]);
    done(g);
    expect(exile(g)).toEqual(['qarsi-revenant']);
    expect(counters(g, lions)).toMatchObject({ flying: 1, deathtouch: 1, lifelink: 1 });
    expect(hasKw(g, lions, 'flying', 'deathtouch', 'lifelink')).toBe(true);
  });

  it("Alchemist's Assistant: lifelink; renew puts a lifelink counter", () => {
    const g = game({
      p1: {
        graveyard: ["alchemist's-assistant".replace("'", '')],
        battlefield: [...n('swamp', 2), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'alchemists-assistant', 'graveyard'), 0, [g.ref(lions)]);
    done(g);
    expect(counters(g, lions)).toMatchObject({ lifelink: 1 });
    expect(hasKw(g, lions, 'lifelink')).toBe(true);
  });

  it('renew is only a sorcery-speed ability', () => {
    const g = game({
      p1: { graveyard: ['adorned-crocodile'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
      step: 'beginCombat',
    });
    expect(abilityActions(g, g.id('p1', 'adorned-crocodile', 'graveyard'), 1)).toHaveLength(0);
  });

  it('Adorned Crocodile: renew puts a +1/+1 counter; when it dies it leaves a 2/2 Zombie Druid', () => {
    const g = game({
      p1: { graveyard: ['adorned-crocodile'], battlefield: [...n('swamp', 1), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    activate(g, g.id('p1', 'adorned-crocodile', 'graveyard'), 1, [g.ref(lions)]);
    done(g);
    expect(plus(g, lions)).toBe(1);

    const h = game({ p1: { battlefield: ['adorned-crocodile'] } });
    h.obj(h.id('p1', 'adorned-crocodile')).damage = 3;
    h.pass();
    done(h);
    const druid = tokens(h, 'Zombie Druid');
    expect(druid).toHaveLength(1);
    expect(pt(h, druid[0]!)).toEqual([2, 2]);
  });

  it('Rot-Curse Rakshasa: decayed trample 5/5; renew X puts decayed counters on X target creatures', () => {
    const d = cardDb.get('rot-curse-rakshasa')!;
    expect(d.keywords).toEqual(expect.arrayContaining(['decayed', 'trample']));
    const g = game({
      p1: {
        graveyard: ['rot-curse-rakshasa'],
        battlefield: [...n('swamp', 3), 'savannah-lions', 'llanowar-elves'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const acts = abilityActions(g, g.id('p1', 'rot-curse-rakshasa', 'graveyard'), 0);
    // Three Swamps and a Forest (the Elves): X up to 2; two creatures to target.
    expect(acts.map((a) => (a as { x?: number }).x)).toEqual([1, 2]);
    g.do(acts[0]!);
    expect(g.decision.kind).toBe('abilityTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === lions),
        )!,
    );
    done(g);
    expect(counters(g, lions).decayed).toBe(1);
    expect(hasKw(g, lions, 'decayed')).toBe(true);
  });
});

describe('Scavenger Regent and Exude Toxin', () => {
  it('Exude Toxin gives each non-Dragon creature -X/-X, then the card is shuffled into the library', () => {
    const g = game({
      p1: {
        hand: ['scavenger-regent'],
        battlefield: [...n('swamp', 4), 'shivan-dragon', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const card = g.id('p1', 'scavenger-regent', 'hand');
    const a = casts(g, 'scavenger-regent').find((c) => c.back && c.x === 2);
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(g.state.players.p1.library).toContain(card);
    expect(g.state.battlefield).not.toContain(g.id('p1', 'savannah-lions', 'graveyard'));
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'shivan-dragon'))).toEqual([5, 5]);
  });

  it('the creature has flying and ward—discard a card', () => {
    const g = game({ p1: { hand: ['scavenger-regent'], battlefield: n('swamp', 4) } });
    play(g, 'scavenger-regent', (a) => !a.back);
    expect(hasKw(g, g.id('p1', 'scavenger-regent'), 'flying')).toBe(true);
  });
});

describe('Delta Bloodflies', () => {
  it('drains 1 on attack only if you control a creature with a counter', () => {
    for (const [counter, life] of [
      [false, 20],
      [true, 19],
    ] as const) {
      const g = game({ p1: { battlefield: ['delta-bloodflies', 'savannah-lions'] } });
      if (counter) g.obj(g.id('p1', 'savannah-lions')).plusOneCounters = 1;
      for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
      g.attack(g.id('p1', 'delta-bloodflies'));
      done(g);
      expect(g.life('p2'), counter ? 'with a counter' : 'no counter').toBe(life);
    }
  });
});

describe('Endure', () => {
  it('Sandskitter Outrider: menace; endures 2 as a +1/+1 counters choice', () => {
    const g = game({ p1: { hand: ['sandskitter-outrider'], battlefield: n('swamp', 4) } });
    expect(cardDb.get('sandskitter-outrider')!.keywords).toContain('menace');
    g.do(cheapest(casts(g, 'sandskitter-outrider')));
    stop(g);
    expect(labels(g).join('|')).toMatch(/2 \+1\/\+1 counters/);
    choose(g, /counters/);
    done(g);
    expect(plus(g, g.id('p1', 'sandskitter-outrider'))).toBe(2);
    expect(tokens(g, 'Spirit')).toHaveLength(0);
  });

  it('Sandskitter Outrider: or a 2/2 white Spirit token', () => {
    const g = game({ p1: { hand: ['sandskitter-outrider'], battlefield: n('swamp', 4) } });
    g.do(cheapest(casts(g, 'sandskitter-outrider')));
    stop(g);
    choose(g, /Spirit/);
    done(g);
    const spirits = tokens(g, 'Spirit');
    expect(spirits).toHaveLength(1);
    expect(pt(g, spirits[0]!)).toEqual([2, 2]);
    expect(plus(g, g.id('p1', 'sandskitter-outrider'))).toBe(0);
  });

  it('Kin-Tree Nurturer: lifelink; endures 1', () => {
    const g = game({ p1: { hand: ['kin-tree-nurturer'], battlefield: n('swamp', 3) } });
    expect(cardDb.get('kin-tree-nurturer')!.keywords).toContain('lifelink');
    g.do(cheapest(casts(g, 'kin-tree-nurturer')));
    stop(g);
    choose(g, /Spirit/);
    done(g);
    expect(pt(g, tokens(g, 'Spirit')[0]!)).toEqual([1, 1]);
  });

  it('Sinkhole Surveyor: attacking costs 1 life and endures 1', () => {
    const g = game({ p1: { battlefield: ['sinkhole-surveyor'] } });
    const s = g.id('p1', 'sinkhole-surveyor');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(s);
    stop(g);
    expect(g.life('p1')).toBe(19);
    choose(g, /counter/);
    done(g);
    expect(plus(g, s)).toBe(1);
  });

  it('Krumar Initiate: {X}{B}, {T}, pay X life: endures X, as a sorcery', () => {
    const g = game({ p1: { battlefield: [...n('swamp', 4), 'krumar-initiate'] } });
    const k = g.id('p1', 'krumar-initiate');
    const acts = abilityActions(g, k, 0) as (Action & { x?: number })[];
    expect(acts.map((a) => a.x)).toEqual(expect.arrayContaining([0, 1, 2, 3].filter((x) => x > 0)));
    g.do(acts.find((a) => a.x === 3)!);
    stop(g);
    choose(g, /Spirit/);
    done(g);
    expect(g.life('p1')).toBe(17);
    expect(pt(g, tokens(g, 'Spirit')[0]!)).toEqual([3, 3]);
    expect(g.obj(k).tapped).toBe(true);
  });
});

describe('Purging Stormbrood and Absorb Essence', () => {
  it('removes all counters from up to one target creature when it enters', () => {
    const g = game({
      p1: { hand: ['purging-stormbrood'], battlefield: [...n('swamp', 5)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.obj(angel).plusOneCounters = 2;
    g.obj(angel).counters = { flying: 1, '-1/-1': 1 };
    g.do(cheapest(casts(g, 'purging-stormbrood').filter((a) => !a.back)));
    done(g, { target: pickTarget(angel) });
    expect(plus(g, angel)).toBe(0);
    expect(Object.values(counters(g, angel)).filter((c) => c > 0)).toHaveLength(0);
  });

  it('Absorb Essence: +2/+2, lifelink and hexproof until end of turn; shuffled into the library', () => {
    const g = game({
      p1: { hand: ['purging-stormbrood'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const card = g.id('p1', 'purging-stormbrood', 'hand');
    g.do(casts(g, 'purging-stormbrood').find((a) => a.back && targeting(lions)(a))!);
    done(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(hasKw(g, lions, 'lifelink', 'hexproof')).toBe(true);
    expect(g.state.players.p1.library).toContain(card);
  });
});

describe('Sacrifice outlets', () => {
  it('Unburied Earthcarver: {2}, sacrifice another creature: a +1/+1 counter on it', () => {
    const g = game({
      p1: { battlefield: [...n('swamp', 2), 'unburied-earthcarver', 'savannah-lions'] },
    });
    const e = g.id('p1', 'unburied-earthcarver');
    const acts = abilityActions(g, e, 0) as (Action & { sacrifice?: string })[];
    // Only the other creature may be sacrificed.
    expect(acts.map((a) => a.sacrifice)).toEqual([g.id('p1', 'savannah-lions')]);
    g.do(acts[0]!);
    done(g);
    expect(plus(g, e)).toBe(1);
    expect(gy(g)).toEqual(['savannah-lions']);
  });

  it('Unrooted Ancestor: flash; {1}, sacrifice another creature: indestructible until end of turn, then it taps', () => {
    const g = game({
      p1: { battlefield: ['swamp', 'unrooted-ancestor', 'savannah-lions'] },
    });
    const u = g.id('p1', 'unrooted-ancestor');
    expect(cardDb.get('unrooted-ancestor')!.keywords).toContain('flash');
    const acts = abilityActions(g, u, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(hasKw(g, u, 'indestructible')).toBe(true);
    expect(g.obj(u).tapped).toBe(true);
  });

  it('Sidisi: sacrifice a creature with mana value X to return a creature card with mana value X + 1', () => {
    const g = game({
      p1: {
        battlefield: ['sidisi-regent-of-the-mire', 'savannah-lions', 'llanowar-elves'],
        graveyard: ['delta-bloodflies', 'serra-angel', 'savannah-lions'],
      },
    });
    const sid = g.id('p1', 'sidisi-regent-of-the-mire');
    const bloodflies = g.id('p1', 'delta-bloodflies', 'graveyard');
    const acts = abilityActions(g, sid, 0) as (Action & {
      sacrifice?: string;
      targets: unknown[];
    })[];
    // Only 1-drops go with the 2-drop (the 1-drop in the graveyard has no mana value 2 to go with and the angel has 5).
    expect(acts.length).toBe(2);
    for (const a of acts) {
      expect(a.sacrifice).not.toBe(sid);
      expect((a.targets[0] as { object: { id: string } }).object.id).toBe(bloodflies);
    }
    g.do(acts[0]!);
    done(g);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'delta-bloodflies')).toBe(true);
    expect(g.obj(sid).tapped).toBe(true);
    expect(board(g, 'savannah-lions', 'p1').length + board(g, 'llanowar-elves', 'p1').length).toBe(
      1,
    );
  });

  it('Sidisi: no ability when nothing in the graveyard matches', () => {
    const g = game({
      p1: {
        battlefield: ['sidisi-regent-of-the-mire', 'savannah-lions'],
        graveyard: ['serra-angel'],
      },
    });
    expect(abilityActions(g, g.id('p1', 'sidisi-regent-of-the-mire'), 0)).toHaveLength(0);
  });
});

describe('Caustic Exhale', () => {
  it('costs {B} with a Dragon to behold, {1}{B} without; -3/-3', () => {
    const g = game({
      p1: { hand: ['caustic-exhale', 'scavenger-regent'], battlefield: ['swamp'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    const acts = casts(g, 'caustic-exhale').filter(targeting(lions));
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);

    const h = game({
      p1: { hand: ['caustic-exhale'], battlefield: ['swamp'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(casts(h, 'caustic-exhale')).toHaveLength(0);
    const k = game({
      p1: { hand: ['caustic-exhale'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(casts(k, 'caustic-exhale').length).toBeGreaterThan(0);
  });
});

describe('Feral Deathgorger and Dusk Sight', () => {
  it('exiles up to two target cards from a single graveyard', () => {
    const g = game({
      p1: {
        hand: ['feral-deathgorger'],
        battlefield: n('swamp', 6),
        graveyard: ['llanowar-elves'],
      },
      p2: { graveyard: ['savannah-lions', 'serra-angel', 'shivan-dragon'] },
    });
    g.do(cheapest(casts(g, 'feral-deathgorger').filter((a) => !a.back)));
    stop(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const first = g.id('p2', 'serra-angel', 'graveyard');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'chooseTargets' && a.targets.length === 1 && pickTarget(first)(a))!,
    );
    // After one card from their graveyard, none of mine is offered.
    const next = g.legal().filter((a) => a.type === 'chooseTargets') as Extract<
      Action,
      { type: 'chooseTargets' }
    >[];
    const mine = g.id('p1', 'llanowar-elves', 'graveyard');
    expect(next.some((a) => pickTarget(mine)(a))).toBe(false);
    expect(next.some((a) => a.targets.length === 2)).toBe(true);
    // Done choosing: exactly the list so far.
    g.do(
      next.find(
        (a) => a.targets.length === 2 && pickTarget(g.id('p2', 'shivan-dragon', 'graveyard'))(a),
      )!,
    );
    done(g);
    expect(exile(g, 'p2').sort()).toEqual(['serra-angel', 'shivan-dragon']);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(gy(g, 'p1')).toEqual(['llanowar-elves']);
  });

  it('Dusk Sight: a +1/+1 counter on up to one creature and a card; shuffled into the library', () => {
    const g = game({
      p1: { hand: ['feral-deathgorger'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const card = g.id('p1', 'feral-deathgorger', 'hand');
    g.do(casts(g, 'feral-deathgorger').find((a) => a.back && targeting(lions)(a))!);
    done(g);
    expect(plus(g, lions)).toBe(1);
    expect(hand(g)).toHaveLength(1);
    expect(g.state.players.p1.library).toContain(card);
  });
});

describe('The Sibsig Ceremony', () => {
  it('creature spells cost {2} less; a creature you cast is destroyed and leaves a 2/2 Zombie Druid', () => {
    const g = game({
      p1: {
        hand: ['sandskitter-outrider'],
        battlefield: [...n('swamp', 2), 'the-sibsig-ceremony'],
      },
    });
    // {3}{B} less {2}: two Swamps pay.
    g.do(cheapest(casts(g, 'sandskitter-outrider')));
    done(g, { option: /Spirit/ });
    expect(gy(g)).toEqual(['sandskitter-outrider']);
    const druids = tokens(g, 'Zombie Druid');
    expect(druids).toHaveLength(1);
    expect(pt(g, druids[0]!)).toEqual([2, 2]);
    // The token wasn't cast: it stays, and the Spirit endure token (not cast either) too.
    expect(board(g, 'the-sibsig-ceremony')).toHaveLength(1);
  });

  it("a creature that wasn't cast (a token) isn't destroyed", () => {
    const g = game({
      p1: { hand: ['salt-road-skirmish'], battlefield: [...n('swamp', 4), 'the-sibsig-ceremony'] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'salt-road-skirmish')[0]!);
    done(g);
    expect(tokens(g, 'Warrior')).toHaveLength(2);
  });
});

describe('Nightblade Brigade, Venerated Stormsinger, Avenger of the Fallen: mobilize', () => {
  it('Nightblade Brigade: surveil 1 when it enters; mobilize 1 when it attacks', () => {
    const g = game({ p1: { hand: ['nightblade-brigade'], battlefield: n('swamp', 3) } });
    g.do(cheapest(casts(g, 'nightblade-brigade')));
    done(g);
    const b = g.id('p1', 'nightblade-brigade');
    g.obj(b).summoningSick = false;
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(b);
    done(g);
    const w = tokens(g, 'Warrior');
    expect(w).toHaveLength(1);
    expect(g.obj(w[0]!).tapped).toBe(true);
  });

  it('Avenger of the Fallen: mobilize X, X the creature cards in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['avenger-of-the-fallen'],
        graveyard: ['llanowar-elves', 'serra-angel', 'swamp'],
      },
    });
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(g.id('p1', 'avenger-of-the-fallen'));
    done(g);
    expect(tokens(g, 'Warrior')).toHaveLength(2);
  });

  it('Venerated Stormsinger: each opponent loses 1 and you gain 1 when it or another creature you control dies', () => {
    const g = game({
      p1: { battlefield: ['venerated-stormsinger', 'savannah-lions'] },
    });
    g.obj(g.id('p1', 'savannah-lions')).damage = 1;
    g.pass();
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
    g.obj(g.id('p1', 'venerated-stormsinger')).damage = 3;
    g.pass();
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Abzan Devotee', () => {
  it('{1}: add {W}, {B} or {G}, once each turn; {2}{B}: return it from the graveyard to hand', () => {
    const g = game({ p1: { battlefield: ['swamp', 'abzan-devotee'] } });
    const d = g.id('p1', 'abzan-devotee');
    const acts = abilityActions(g, d, 0);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    expect(g.state.players.p1.pool?.length ?? 0).toBeGreaterThan(0);
    expect(abilityActions(g, d, 0)).toHaveLength(0);

    const h = game({ p1: { battlefield: n('swamp', 3), graveyard: ['abzan-devotee'] } });
    activate(h, h.id('p1', 'abzan-devotee', 'graveyard'), 1);
    done(h);
    expect(hand(h)).toEqual(['abzan-devotee']);
  });
});

describe('Spells', () => {
  it('Cruel Truths: surveil 2, draw two cards, lose 2 life', () => {
    const g = game({ p1: { hand: ['cruel-truths'], battlefield: n('swamp', 4) } });
    g.do(cheapest(casts(g, 'cruel-truths')));
    done(g);
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p1')).toBe(18);
  });

  it("Dragon's Prey: costs {2} more if it targets a Dragon", () => {
    const g = game({
      p1: { hand: ["dragon's-prey".replace("'", '')], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions', 'shivan-dragon'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    const dragon = g.id('p2', 'shivan-dragon');
    expect(casts(g, 'dragons-prey').some(targeting(dragon))).toBe(false);
    const a = casts(g, 'dragons-prey').find(targeting(lions))!;
    expect(a).toBeDefined();
    const h = game({
      p1: { hand: ['dragons-prey'], battlefield: n('swamp', 5) },
      p2: { battlefield: ['savannah-lions', 'shivan-dragon'] },
    });
    const dh = h.id('p2', 'shivan-dragon');
    h.do(casts(h, 'dragons-prey').find(targeting(dh))!);
    done(h);
    expect(gy(h, 'p2')).toEqual(['shivan-dragon']);
  });

  it("Wail of War: -1/-1 to the opponent's creatures, or up to two creature cards back to hand", () => {
    const g = game({
      p1: { hand: ['wail-of-war'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const wails = casts(g, 'wail-of-war');
    const minus = wails.find((a) => a.mode === 0 && targetingPlayer('p2')(a))!;
    g.do(minus);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);

    const h = game({
      p1: {
        hand: ['wail-of-war'],
        battlefield: n('swamp', 3),
        graveyard: ['llanowar-elves', 'serra-angel'],
      },
    });
    const both = casts(h, 'wail-of-war').filter((a) => a.mode === 1 && a.targets.length === 2);
    expect(both.length).toBeGreaterThan(0);
    h.do(both[0]!);
    done(h);
    expect(hand(h).sort()).toEqual(['llanowar-elves', 'serra-angel']);
  });

  it('Salt Road Skirmish: destroys a creature, makes two hasty Warriors that are sacrificed at the end step', () => {
    const g = game({
      p1: { hand: ['salt-road-skirmish'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    g.do(casts(g, 'salt-road-skirmish')[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    const w = tokens(g, 'Warrior');
    expect(w).toHaveLength(2);
    expect(hasKw(g, w[0]!, 'haste')).toBe(true);
    passTo(g, 'end');
    done(g);
    expect(tokens(g, 'Warrior')).toHaveLength(0);
  });

  it('Strategic Betrayal: the opponent exiles a creature of their choice and their graveyard', () => {
    const g = game({
      p1: { hand: ['strategic-betrayal'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'], graveyard: ['llanowar-elves'] },
    });
    g.do(casts(g, 'strategic-betrayal')[0]!);
    stop(g);
    // The opponent picks the creature (the lions).
    const picks = g.legal().filter((a) => a.type === 'chooseCard' && a.card) as Extract<
      Action,
      { type: 'chooseCard' }
    >[];
    expect(g.actor).toBe('p2');
    g.do(picks.find((a) => g.obj(a.card!).defId === 'savannah-lions')!);
    done(g);
    expect(exile(g, 'p2').sort()).toEqual(['llanowar-elves', 'savannah-lions']);
    expect(board(g, 'serra-angel')).toHaveLength(1);
    expect(gy(g, 'p2')).toHaveLength(0);
  });

  it('Aggressive Negotiations: exiles a nonland card from their hand, then a counter on your creature', () => {
    const g = game({
      p1: { hand: ['aggressive-negotiations'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
      p2: { hand: ['serra-angel', 'forest'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const a = casts(g, 'aggressive-negotiations').find(
      (c) => targeting(lions)(c) && targetingPlayer('p2')(c),
    );
    expect(a).toBeDefined();
    g.do(a!);
    done(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g, 'p2')).toEqual(['forest']);
    expect(plus(g, lions)).toBe(1);
  });

  it("Alesha's Legacy: deathtouch and indestructible until end of turn", () => {
    const g = game({
      p1: {
        hand: ["alesha's-legacy".replace("'", '')],
        battlefield: [...n('swamp', 2), 'savannah-lions'],
      },
    });
    g.do(casts(g, 'aleshas-legacy')[0]!);
    done(g);
    expect(hasKw(g, g.id('p1', 'savannah-lions'), 'deathtouch', 'indestructible')).toBe(true);
  });

  it('Worthy Cost: sacrifice a creature to exile target creature or planeswalker', () => {
    const g = game({
      p1: { hand: ['worthy-cost'], battlefield: ['swamp', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', { card: 'vivien-reid', loyalty: 5 }] },
    });
    const acts = casts(g, 'worthy-cost') as (Cast & { sacrifice?: string })[];
    const angel = g.id('p2', 'serra-angel');
    const gideon = g.id('p2', 'vivien-reid');
    expect(acts.some(targeting(angel))).toBe(true);
    expect(acts.some(targeting(gideon))).toBe(true);
    const a = acts.find(targeting(gideon))!;
    expect(a.sacrifice).toBe(g.id('p1', 'savannah-lions'));
    g.do(a);
    done(g);
    expect(exile(g, 'p2')).toEqual(['vivien-reid']);
    expect(gy(g)).toEqual(expect.arrayContaining(['savannah-lions', 'worthy-cost']));
    // Needs a creature to sacrifice.
    const h = game({
      p1: { hand: ['worthy-cost'], battlefield: ['swamp'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(casts(h, 'worthy-cost')).toHaveLength(0);
  });

  it('Desperate Measures: +1/-1; draws two cards if it dies under your control, not otherwise', () => {
    const g = game({
      p1: { hand: ['desperate-measures'], battlefield: ['swamp', 'llanowar-elves'] },
    });
    const elves = g.id('p1', 'llanowar-elves');
    g.do(casts(g, 'desperate-measures').find(targeting(elves))!);
    done(g);
    expect(hand(g)).toHaveLength(2);

    const h = game({
      p1: { hand: ['desperate-measures'], battlefield: ['swamp'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    h.do(casts(h, 'desperate-measures').find(targeting(h.id('p2', 'llanowar-elves')))!);
    done(h);
    expect(gy(h, 'p2')).toEqual(['llanowar-elves']);
    expect(hand(h)).toHaveLength(0);
  });
});

describe('Enchantment and combat cards', () => {
  it('Corroding Dragonstorm: drain 2 and surveil 2 on entering; returns to hand when a Dragon enters', () => {
    const g = game({
      p1: { hand: ['corroding-dragonstorm', 'shivan-dragon'], battlefield: n('swamp', 2) },
    });
    g.do(cheapest(casts(g, 'corroding-dragonstorm')));
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    expect(board(g, 'corroding-dragonstorm')).toHaveLength(1);
    // A Dragon enters: back to hand.
    const h = game({
      p1: {
        hand: ['shivan-dragon'],
        battlefield: ['corroding-dragonstorm', ...n('mountain', 6)],
      },
    });
    h.do(cheapest(casts(h, 'shivan-dragon')));
    done(h);
    expect(hand(h)).toEqual(['corroding-dragonstorm']);
  });

  it('Yathan Tombguard: draw a card and lose 1 life when a creature with a counter deals combat damage to a player', () => {
    const g = game({ p1: { battlefield: ['yathan-tombguard', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(lions).plusOneCounters = 1;
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(lions, g.id('p1', 'yathan-tombguard'));
    passTo(g, 'end');
    done(g);
    // Only the lions has a counter: one trigger.
    expect(hand(g)).toHaveLength(1);
    expect(g.life('p1')).toBe(19);
  });

  it('Gurmag Rakshasa: menace; -2/-2 to a creature of theirs and +2/+2 to one of yours', () => {
    const g = game({
      p1: { hand: ['gurmag-rakshasa'], battlefield: [...n('swamp', 6), 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    expect(cardDb.get('gurmag-rakshasa')!.keywords).toContain('menace');
    g.do(cheapest(casts(g, 'gurmag-rakshasa')));
    // Two targets: the angel and the lions.
    stop(g);
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            pickTarget(angel)({ ...a, targets: a.targets.slice(0, 1) }) &&
            a.targets.some((t) => 'object' in t && t.object.id === lions),
        )!,
    );
    done(g);
    expect(pt(g, angel)).toEqual([2, 2]);
    expect(pt(g, lions)).toEqual([4, 3]);
  });
});

describe('Hundred-Battle Veteran', () => {
  it('gets +2/+4 with three or more different kinds of counters among your creatures', () => {
    const g = game({
      p1: { battlefield: ['hundred-battle-veteran', 'savannah-lions', 'llanowar-elves'] },
    });
    const v = g.id('p1', 'hundred-battle-veteran');
    expect(pt(g, v)).toEqual([4, 2]);
    g.obj(g.id('p1', 'savannah-lions')).plusOneCounters = 1;
    g.obj(g.id('p1', 'savannah-lions')).counters = { flying: 1 };
    expect(pt(g, v)).toEqual([4, 2]);
    g.obj(g.id('p1', 'llanowar-elves')).counters = { lifelink: 1 };
    expect(pt(g, v)).toEqual([6, 6]);
    // Two creatures with the same kind of counter is one kind.
    g.obj(g.id('p1', 'llanowar-elves')).counters = { flying: 1 };
    expect(pt(g, v)).toEqual([4, 2]);
  });

  it('may be cast from the graveyard, entering with a finality counter (it is exiled if it would die)', () => {
    const g = game({
      p1: { graveyard: ['hundred-battle-veteran'], battlefield: n('swamp', 4) },
    });
    const card = g.id('p1', 'hundred-battle-veteran', 'graveyard');
    const cast = g.legal().find((x): x is Cast => x.type === 'castSpell' && x.card === card);
    expect(cast).toBeDefined();
    g.do(cast!);
    done(g);
    const v = g.id('p1', 'hundred-battle-veteran');
    expect(counters(g, v).finality).toBe(1);
    g.obj(v).damage = 5;
    g.pass();
    done(g);
    expect(exile(g)).toEqual(['hundred-battle-veteran']);
    expect(gy(g)).toHaveLength(0);
  });

  it('cast from the hand it has no finality counter', () => {
    const g = game({ p1: { hand: ['hundred-battle-veteran'], battlefield: n('swamp', 4) } });
    g.do(cheapest(casts(g, 'hundred-battle-veteran')));
    done(g);
    expect(counters(g, g.id('p1', 'hundred-battle-veteran')).finality).toBeUndefined();
  });
});

describe('Tarkir: Dragonstorm black: random games', () => {
  it('plays short random games with every black card in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const cards = BLACK_CARDS.map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('swamp', 24)].slice(0, 70);
    for (let seed = 1; seed <= 8; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});
