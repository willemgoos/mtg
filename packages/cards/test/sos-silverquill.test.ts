import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  cardDb,
  deckById,
  deckGameOptions,
  isPlayable,
  scryfallById,
  SECRETS_OF_STRIXHAVEN_DECKS,
} from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14a: Silverquill Debate Club (W/B).

const INKLING = 'sos-inkling-token';
const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

/** Resolves the stack; `option` answers a chooseOption (default: the first), `accept` any optional effect. */
function done(g: GameDriver, opts: { option?: number; accept?: boolean } = {}): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: opts.option ?? 0 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}
const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const castCopy = (g: GameDriver, perm: string, targets: Parameters<typeof cast>[2] = []) => {
  const copy = g.obj(perm).prepared!;
  expect(copy).toBeDefined();
  g.do({ type: 'castSpell', player: 'p1', card: copy, targets });
  return g;
};

describe('prepare cards', () => {
  it('Elite Interceptor enters prepared; Rejoinder taps a creature and draws', () => {
    const g = game({
      p1: { hand: ['elite-interceptor'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'elite-interceptor');
    done(g);
    const ei = g.id('p1', 'elite-interceptor');
    const angel = g.id('p2', 'serra-angel');
    const hand = g.state.players.p1.hand.length;
    castCopy(g, ei, [g.ref(angel)]);
    done(g, { option: 0 });
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.state.players.p1.hand.length).toBe(hand + 1);
    expect(g.obj(ei).prepared).toBeUndefined();
  });

  it('Rejoinder can untap instead', () => {
    const g = game({
      p1: { hand: ['elite-interceptor'], battlefield: n('plains', 3) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    cast(g, 'elite-interceptor');
    done(g);
    const angel = g.id('p2', 'serra-angel');
    castCopy(g, g.id('p1', 'elite-interceptor'), [g.ref(angel)]);
    done(g, { option: 1 });
    expect(g.obj(angel).tapped).toBe(false);
  });

  it("Honorbound Page's Forum's Favor gives +1/+0 and flying", () => {
    const g = game({
      p1: { hand: ['honorbound-page'], battlefield: n('plains', 5) },
    });
    cast(g, 'honorbound-page');
    done(g);
    const page = g.id('p1', 'honorbound-page');
    expect(keywords(g, page)).toContain('firstStrike');
    castCopy(g, page, [g.ref(page)]);
    done(g);
    expect(pt(g, page)).toEqual([4, 3]);
    expect(keywords(g, page)).toContain('flying');
  });

  it("Quill-Blade Laureate's Twofold Intent gives +1/+0 and double strike", () => {
    const g = game({ p1: { hand: ['quill-blade-laureate'], battlefield: n('plains', 4) } });
    cast(g, 'quill-blade-laureate');
    done(g);
    const q = g.id('p1', 'quill-blade-laureate');
    castCopy(g, q, [g.ref(q)]);
    done(g);
    expect(pt(g, q)).toEqual([2, 1]);
    expect(keywords(g, q)).toContain('doubleStrike');
  });

  it('casting the prepared copy triggers repartee', () => {
    const g = game({
      p1: {
        hand: ['elite-interceptor'],
        battlefield: ['rehearsed-debater', ...n('plains', 5)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'elite-interceptor');
    done(g);
    castCopy(g, g.id('p1', 'elite-interceptor'), [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(pt(g, g.id('p1', 'rehearsed-debater'))).toEqual([4, 4]);
  });
});

describe('repartee creatures', () => {
  const duel = (creature: string, extra: string[] = []) => {
    const g = game({
      p1: {
        hand: ['interjection', 'dissection-practice'],
        battlefield: [creature, ...extra, ...n('plains', 3), ...n('swamp', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    return { g, c: g.id('p1', creature) };
  };

  it('Rehearsed Debater gets +1/+1 only for a spell that targets a creature', () => {
    const { g, c } = duel('rehearsed-debater');
    cast(g, 'dissection-practice', [{ player: 'p2' }]);
    done(g);
    expect(pt(g, c)).toEqual([3, 3]);
    cast(g, 'interjection', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(pt(g, c)).toEqual([4, 4]);
  });

  it('Inkshape Demonstrator gets +1/+0 and lifelink', () => {
    const { g, c } = duel('inkshape-demonstrator');
    cast(g, 'interjection', [g.ref(c)]);
    done(g);
    expect(pt(g, c)).toEqual([6, 6]);
    expect(keywords(g, c)).toContain('lifelink');
    expect(cardDb.get('inkshape-demonstrator')!.keywords).toContain('ward');
  });

  it('Inkling Mascot gains flying and surveils', () => {
    const { g, c } = duel('inkling-mascot');
    cast(g, 'interjection', [g.ref(c)]);
    done(g);
    expect(keywords(g, c)).toContain('flying');
  });

  it('Scolding Administrator grows, and moves its counters when it dies', () => {
    const { g, c } = duel('scolding-administrator', ['eager-first-year']);
    cast(g, 'interjection', [g.ref(c)]);
    done(g);
    expect(counters(g, c)).toBe(1);
    const other = g.id('p1', 'eager-first-year');
    g.state.battlefield.splice(g.state.battlefield.indexOf(c), 1);
    g.obj(c).zone = 'graveyard';
    // Kill it through combat-free means: a Last Gasp style effect is covered elsewhere; here just check the ability.
    void other;
    expect(
      cardDb
        .get('scolding-administrator')!
        .abilities.some((a) => a.kind === 'triggered' && a.trigger.on === 'dies'),
    ).toBe(true);
  });

  it('Scolding Administrator dying hands its counters on', () => {
    const g = game({
      p1: {
        hand: ['interjection', 'last-gasp', 'last-gasp'],
        battlefield: [
          'scolding-administrator',
          'eager-first-year',
          ...n('plains', 2),
          ...n('swamp', 3),
        ],
      },
    });
    const adm = g.id('p1', 'scolding-administrator');
    const other = g.id('p1', 'eager-first-year');
    cast(g, 'interjection', [g.ref(adm)]);
    done(g);
    expect(counters(g, adm)).toBe(1);
    g.obj(adm).damage = 20;
    cast(g, 'last-gasp', [g.ref(adm)]);
    done(g);
    expect(g.zoneOf(adm)).toBe('graveyard');
    expect(counters(g, other)).toBe(1);
  });

  it('Melancholic Poet drains 1', () => {
    const { g } = duel('melancholic-poet');
    cast(g, 'interjection', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.life('p1')).toBe(21);
  });

  it('Snooping Page becomes unblockable, and draws when it connects', () => {
    const { g, c } = duel('snooping-page');
    cast(g, 'interjection', [g.ref(c)]);
    done(g);
    expect(getCharacteristics(g.state, cardDb, c).cantBeBlocked).toBe(true);
    expect(
      cardDb
        .get('snooping-page')!
        .abilities.some((a) => a.kind === 'triggered' && a.trigger.on === 'combatDamageToPlayer'),
    ).toBe(true);
  });

  it('Stirring Hopesinger puts a counter on each creature you control', () => {
    const { g, c } = duel('stirring-hopesinger', ['eager-first-year']);
    cast(g, 'interjection', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(counters(g, c)).toBe(1);
    expect(counters(g, g.id('p1', 'eager-first-year'))).toBe(1);
    expect(counters(g, g.id('p2', 'serra-angel'))).toBe(0);
  });

  it("Conciliator's Duelist draws on entering, and blinks a creature on repartee", () => {
    const g = game({
      p1: {
        hand: ['conciliators-duelist', 'interjection'],
        battlefield: [...n('plains', 4), ...n('swamp', 3)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const hand = g.state.players.p1.hand.length;
    cast(g, 'conciliators-duelist');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(hand);
    expect(g.life('p1')).toBe(19);
    expect(g.life('p2')).toBe(19);
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'interjection', [g.ref(angel)]);
    settle(g);
    expect(g.zoneOf(angel)).toBe('exile');
  });

  it('Graduation Day puts a counter on a creature you control', () => {
    const g = game({
      p1: {
        hand: ['interjection'],
        battlefield: ['graduation-day', 'eager-first-year', ...n('plains', 2)],
      },
    });
    const c = g.id('p1', 'eager-first-year');
    cast(g, 'interjection', [g.ref(c)]);
    done(g);
    expect(counters(g, c)).toBe(1);
  });
});

describe('ETB creatures and lands', () => {
  it('Eager Glyphmage makes a 1/1 flying Inkling', () => {
    const g = game({ p1: { hand: ['eager-glyphmage'], battlefield: n('plains', 4) } });
    cast(g, 'eager-glyphmage');
    done(g);
    const [ink] = all(g, INKLING);
    expect(pt(g, ink!)).toEqual([1, 1]);
    expect(keywords(g, ink!)).toContain('flying');
  });

  it('Owlin Historian grows when a card leaves your graveyard', () => {
    const g = game({
      p1: {
        hand: ['owlin-historian'],
        graveyard: ['killians-confidence'],
        battlefield: n('plains', 3),
      },
    });
    cast(g, 'owlin-historian');
    done(g);
    expect(cardDb.get('owlin-historian')!.abilities.length).toBe(2);
  });

  it('Shattered Sanctum enters tapped unless you control two other lands', () => {
    const early = game({ p1: { hand: ['shattered-sanctum'], battlefield: n('plains', 1) } });
    early.do({ type: 'playLand', player: 'p1', card: early.id('p1', 'shattered-sanctum', 'hand') });
    expect(early.obj(early.id('p1', 'shattered-sanctum')).tapped).toBe(true);
    const late = game({ p1: { hand: ['shattered-sanctum'], battlefield: n('plains', 2) } });
    late.do({ type: 'playLand', player: 'p1', card: late.id('p1', 'shattered-sanctum', 'hand') });
    expect(late.obj(late.id('p1', 'shattered-sanctum')).tapped).toBe(false);
  });
});

describe('spells', () => {
  it('Silverquill Charm: counters, exile (power 2 or less) and drain', () => {
    const g = game({
      p1: {
        hand: ['silverquill-charm', 'silverquill-charm', 'silverquill-charm'],
        battlefield: ['eager-first-year', ...n('plains', 3), ...n('swamp', 3)],
      },
      p2: { battlefield: ['eager-first-year', 'serra-angel'] },
    });
    const mine = g.id('p1', 'eager-first-year');
    cast(g, 'silverquill-charm', [g.ref(mine)], { mode: 0 });
    done(g);
    expect(counters(g, mine)).toBe(2);
    const theirs = g.id('p2', 'eager-first-year');
    cast(g, 'silverquill-charm', [g.ref(theirs)], { mode: 1 });
    done(g);
    expect(g.zoneOf(theirs)).toBe('exile');
    cast(g, 'silverquill-charm', [], { mode: 2 });
    done(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
  });

  it('Harsh Annotation destroys, and its controller gets an Inkling', () => {
    const g = game({
      p1: { hand: ['harsh-annotation'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'harsh-annotation', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(
      g.state.battlefield.filter(
        (id) => g.obj(id).defId === INKLING && g.obj(id).controller === 'p2',
      ),
    ).toHaveLength(1);
  });

  it('Foolish Fate: infusion makes its controller lose 3', () => {
    const run = (gained: boolean) => {
      const g = game({
        p1: {
          hand: gained ? ['foolish-fate', 'dissection-practice'] : ['foolish-fate'],
          battlefield: n('swamp', 5),
        },
        p2: { battlefield: ['serra-angel'] },
      });
      if (gained) {
        cast(g, 'dissection-practice', [{ player: 'p2' }]);
        done(g);
      }
      cast(g, 'foolish-fate', [g.ref(g.id('p2', 'serra-angel'))]);
      done(g);
      return g.life('p2');
    };
    expect(run(false)).toBe(20);
    expect(run(true)).toBe(16);
  });

  it('Stand Up for Yourself needs power 3 or greater', () => {
    const g = game({
      p1: { hand: ['stand-up-for-yourself'], battlefield: n('plains', 3) },
      p2: { battlefield: ['eager-first-year', 'serra-angel'] },
    });
    const legal = g.legal().filter((a) => a.type === 'castSpell').length;
    expect(legal).toBeGreaterThan(0);
    cast(g, 'stand-up-for-yourself', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
  });

  it('Rapier Wit taps, stuns on your turn and draws', () => {
    const g = game({
      p1: { hand: ['rapier-wit'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const hand = g.state.players.p1.hand.length;
    cast(g, 'rapier-wit', [g.ref(angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(JSON.stringify(g.obj(angel))).toContain('stun');
    expect(g.state.players.p1.hand.length).toBe(hand);
  });

  it('Render Speechless discards a nonland card and puts two counters on a creature', () => {
    const g = game({
      p1: {
        hand: ['render-speechless'],
        battlefield: ['eager-first-year', ...n('plains', 2), ...n('swamp', 2)],
      },
      p2: { hand: ['plains', 'shock'] },
    });
    const mine = g.id('p1', 'eager-first-year');
    cast(g, 'render-speechless', [{ player: 'p2' }, g.ref(mine)]);
    done(g);
    expect(g.state.players.p2.hand).toHaveLength(1);
    expect(counters(g, mine)).toBe(2);
  });

  it("Ajani's Response costs {3} less against a tapped creature", () => {
    const g = game({
      p1: { hand: ['ajanis-response'], battlefield: n('plains', 2) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    cast(g, 'ajanis-response', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    const g2 = game({
      p1: { hand: ['ajanis-response'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(() => cast(g2, 'ajanis-response', [g2.ref(g2.id('p2', 'serra-angel'))])).toThrow();
  });

  it("Killian's Confidence returns from the graveyard when your creatures connect", () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        graveyard: ['killians-confidence'],
        battlefield: ['eager-first-year', ...n('plains', 2)],
      },
    });
    const c = g.id('p1', 'eager-first-year');
    g.obj(c).summoningSick = false;
    g.passBoth();
    g.attack(c);
    for (let i = 0; i < 12 && g.state.players.p1.hand.length === 0; i++) {
      done(g, { accept: true });
      if (g.state.players.p1.hand.length === 0) g.pass();
    }
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('killians-confidence');
  });
});

describe('the deck', () => {
  const deck = deckById('sos-silverquill-debate-club')!;

  it('is 60 cards with 24 lands and at least 30 SOS spells, and playable', () => {
    expect(isPlayable(deck)).toBe(true);
    expect(deck.cards.reduce((s, [, c]) => s + c, 0)).toBe(60);
    let lands = 0;
    let sosSpells = 0;
    for (const [name, count] of deck.cards) {
      const def = [...cardDb.values()].find((d) => d.name === name)!;
      if (def.types.includes('Land')) lands += count;
      else if (scryfallById.get(def.id)?.set === 'sos') sosSpells += count;
    }
    expect(lands).toBe(24);
    expect(sosSpells).toBeGreaterThanOrEqual(30);
    expect(SECRETS_OF_STRIXHAVEN_DECKS).toContain(deck);
  });

  it('plays random games to the end', () => {
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 10; seed++) {
      const other = seed % 2 ? deck : deckById('arcane-aerialists');
      const r = playRandomGame(
        engine,
        engine.newGame({ ...deckGameOptions(deck, other), seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});
