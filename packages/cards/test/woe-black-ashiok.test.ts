import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  activate,
  casts,
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
import { exileFromGraveyard, NIGHTMARE, play, tokens } from './woe-black-helpers.ts';

// Wilds of Eldraine 23b: Ashiok, Wicked Manipulator, and paying life.

const ASHIOK = 'ashiok-wicked-manipulator';
const lib = (...ids: string[]) => ids;

describe('Ashiok, Wicked Manipulator: the loyalty abilities', () => {
  it('is a 5-loyalty planeswalker with the replacement effect and three loyalty abilities', () => {
    const d = cardDb.get(ASHIOK)!;
    expect(d.types).toEqual(['Planeswalker']);
    expect(d.loyalty).toBe(5);
    expect(
      d.abilities
        .filter((a) => a.kind === 'activated')
        .map((a) => (a as { cost: { loyalty?: number } }).cost.loyalty),
    ).toEqual([1, -2, -7]);
  });

  it('+1: look at the top two, exile one and put the other into your hand', () => {
    const g = game({
      p1: {
        battlefield: [{ card: ASHIOK, loyalty: 5 }],
        library: lib('serra-angel', 'savannah-lions', 'forest', 'forest'),
      },
    });
    const a = g.id('p1', ASHIOK);
    activate(g, a, 1);
    stop(g);
    // One option per card exiled; the other goes to hand.
    expect(labels(g)).toEqual([
      'Exile Serra Angel, put Savannah Lions into your hand',
      'Exile Savannah Lions, put Serra Angel into your hand',
    ]);
    choose(g, /Exile Serra Angel/);
    done(g);
    expect(exile(g)).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(g.state.players.p1.library).toHaveLength(2);
    expect(g.obj(a).counters?.loyalty).toBe(6);
  });

  it('+1 with a one-card library exiles it; with none, nothing happens', () => {
    const g = game({
      p1: { battlefield: [{ card: ASHIOK, loyalty: 5 }], library: lib('serra-angel') },
    });
    activate(g, g.id('p1', ASHIOK), 1);
    stop(g);
    expect(labels(g)).toEqual(['Exile Serra Angel']);
    choose(g, /Exile/);
    done(g);
    expect(exile(g)).toEqual(['serra-angel']);
    expect(hand(g)).toEqual([]);
    const h = game({ p1: { battlefield: [{ card: ASHIOK, loyalty: 5 }], library: [] } });
    activate(h, h.id('p1', ASHIOK), 1);
    done(h);
    expect(exile(h)).toEqual([]);
    expect(h.obj(h.id('p1', ASHIOK)).counters?.loyalty).toBe(6);
  });

  it('−2: two 1/1 black Nightmares that grow at the beginning of combat only if a card was put into exile this turn', () => {
    const g = game({
      p1: { battlefield: [{ card: ASHIOK, loyalty: 5 }] },
    });
    activate(g, g.id('p1', ASHIOK), 2);
    done(g);
    const nightmares = tokens(g, NIGHTMARE);
    expect(nightmares).toHaveLength(2);
    expect(g.obj(g.id('p1', ASHIOK)).counters?.loyalty).toBe(3);
    for (const id of nightmares) {
      expect(pt(g, id)).toEqual([1, 1]);
      expect(cardDb.get(NIGHTMARE)!.subtypes).toEqual(['Nightmare']);
    }
    // No card was exiled: no counters.
    passTo(g, 'beginCombat');
    done(g);
    for (const id of nightmares) expect(g.obj(id).plusOneCounters).toBe(0);
    // Next turn (the opponent's, then ours) a card is put into exile first: both grow.
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    g.state.turn.exiledCards = 1;
    passTo(g, 'beginCombat');
    done(g);
    for (const id of nightmares) expect(pt(g, id)).toEqual([2, 2]);
  });

  it('−7: target player exiles the top X cards, X the total mana value of cards you own in exile', () => {
    const g = game({
      p1: {
        battlefield: [{ card: ASHIOK, loyalty: 7 }],
        graveyard: ['serra-angel', 'llanowar-elves', 'savannah-lions'],
      },
      p2: { graveyard: ['shivan-dragon'], library: n('forest', 12) },
    });
    // 5 + 1 are in exile (the Lions stays in the graveyard); the opponent's own exiled card is theirs.
    exileFromGraveyard(g, 'p1', 'serra-angel');
    exileFromGraveyard(g, 'p1', 'llanowar-elves');
    exileFromGraveyard(g, 'p2', 'shivan-dragon');
    activate(g, g.id('p1', ASHIOK), 3, [{ player: 'p2' }]);
    done(g);
    expect(g.state.players.p2.library).toHaveLength(12 - 6);
    expect(exile(g, 'p2')).toHaveLength(1 + 6);
    expect(g.state.players.p1.library).toHaveLength(10);
    expect(g.obj(g.id('p1', ASHIOK, 'graveyard')).zone).toBe('graveyard');
  });

  it('−7 can target yourself (X is the total mana value), and exiles what is there with a shorter library', () => {
    const g = game({
      p1: {
        battlefield: [{ card: ASHIOK, loyalty: 7 }],
        graveyard: ['shivan-dragon'],
        library: n('forest', 3),
      },
    });
    exileFromGraveyard(g, 'p1', 'shivan-dragon');
    activate(g, g.id('p1', ASHIOK), 3, [{ player: 'p1' }]);
    done(g);
    expect(g.state.players.p1.library).toHaveLength(0);
    expect(exile(g)).toHaveLength(4);
  });
});

describe('Ashiok, Wicked Manipulator: paying life', () => {
  // Desolation Prowler: "Pay 2 life: This creature gets +2/+2 until end of turn. Activate only once each turn."
  const prowler = (g: ReturnType<typeof game>) => g.id('p1', 'desolation-prowler');

  it('without Ashiok the life is paid', () => {
    const g = game({ p1: { battlefield: ['desolation-prowler'] } });
    activate(g, prowler(g), 0);
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(10);
    expect(pt(g, prowler(g))).toEqual([4, 4]);
  });

  it('with Ashiok the top cards are exiled instead of paying life (not optional)', () => {
    const g = game({
      p1: { battlefield: ['desolation-prowler', { card: ASHIOK, loyalty: 5 }] },
    });
    const top = g.state.players.p1.library.slice(0, 2);
    activate(g, prowler(g), 0);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(8);
    expect(g.state.players.p1.exile).toEqual(top);
    expect(pt(g, prowler(g))).toEqual([4, 4]);
  });

  it('with fewer cards in the library than the payment, the life is paid as normal', () => {
    const g = game({
      p1: {
        battlefield: ['desolation-prowler', { card: ASHIOK, loyalty: 5 }],
        library: ['forest'],
      },
    });
    activate(g, prowler(g), 0);
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('with exactly as many cards as the payment, they are exiled', () => {
    const g = game({
      p1: {
        battlefield: ['desolation-prowler', { card: ASHIOK, loyalty: 5 }],
        library: ['forest', 'forest'],
      },
    });
    activate(g, prowler(g), 0);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(0);
  });

  it("does not let you pay more life than you have, and an opponent's Ashiok doesn't help you", () => {
    const g = game({
      p1: { life: 1, battlefield: ['desolation-prowler'] },
      p2: { battlefield: [{ card: ASHIOK, loyalty: 5 }] },
    });
    expect(abilityActions(g, prowler(g), 0)).toHaveLength(0);
    const h = game({
      p1: { life: 1, battlefield: ['desolation-prowler', { card: ASHIOK, loyalty: 5 }] },
    });
    expect(abilityActions(h, prowler(h), 0)).toHaveLength(0);
    const i = game({
      p1: { life: 20, battlefield: ['desolation-prowler'] },
      p2: { battlefield: [{ card: ASHIOK, loyalty: 5 }] },
    });
    activate(i, prowler(i), 0);
    done(i);
    expect(i.life('p1')).toBe(18);
  });

  it("losing life is not paying life: Ashiok does not replace it (Hopeless Nightmare's 2 life, a Food drain)", () => {
    const g = game({
      p1: {
        hand: ['hopeless-nightmare'],
        battlefield: [...n('swamp', 1), { card: ASHIOK, loyalty: 5 }],
      },
      p2: { hand: ['forest'] },
    });
    play(g, 'hopeless-nightmare');
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(10);
  });

  it('exiling for life counts as exiling a card this turn (the Nightmares grow)', () => {
    const g = game({
      p1: { battlefield: ['desolation-prowler', { card: ASHIOK, loyalty: 5 }] },
    });
    activate(g, g.id('p1', ASHIOK), 2);
    done(g);
    const nightmares = tokens(g, NIGHTMARE);
    activate(g, prowler(g), 0);
    done(g);
    passTo(g, 'beginCombat');
    done(g);
    for (const id of nightmares) expect(pt(g, id)).toEqual([2, 2]);
  });
});

describe('Ashiok, Wicked Manipulator: every kind of life payment', () => {
  const ashiok = { card: ASHIOK, loyalty: 5 };

  it('Toxic Deluge: "pay X life" as an additional cost exiles X cards instead', () => {
    const g = game({
      p1: { hand: ['toxic-deluge'], battlefield: [...n('swamp', 3), ashiok] },
      p2: { battlefield: ['serra-angel'] },
    });
    const a = casts(g, 'toxic-deluge').find((c) => c.x === 5)!;
    expect(a).toBeDefined();
    g.do(a);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(5);
    expect(exile(g)).toHaveLength(5);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('Toxic Deluge without Ashiok pays the life, and with too small a library pays the life', () => {
    const g = game({ p1: { hand: ['toxic-deluge'], battlefield: n('swamp', 3) } });
    g.do(casts(g, 'toxic-deluge').find((c) => c.x === 2)!);
    done(g);
    expect(g.life('p1')).toBe(18);
    const h = game({
      p1: { hand: ['toxic-deluge'], battlefield: [...n('swamp', 3), ashiok], library: ['forest'] },
    });
    h.do(casts(h, 'toxic-deluge').find((c) => c.x === 2)!);
    done(h);
    expect(h.life('p1')).toBe(18);
    expect(h.state.players.p1.library).toHaveLength(1);
  });

  it('a triggered ability you may pay life for (Voracious Tome-Skimmer)', () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: ['sugar-rush'],
        battlefield: [...n('swamp', 2), 'voracious-tome-skimmer', ashiok],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    g.pass();
    g.do(casts(g, 'sugar-rush').find((c) => c.targets.length === 1)!);
    done(g);
    expect(g.life('p1')).toBe(20);
    // Sugar Rush's draw and the Skimmer's.
    expect(hand(g)).toHaveLength(2);
    expect(g.state.players.p1.library).toHaveLength(10 - 2 - 1);
  });

  it('ward—pay life: the cards are exiled instead', () => {
    const g = game({
      p1: { hand: ['sugar-rush'], battlefield: [...n('swamp', 2), 'savannah-lions', ashiok] },
      p2: { battlefield: ['purging-stormbrood'] },
    });
    const stormbrood = g.id('p2', 'purging-stormbrood');
    g.do(
      casts(g, 'sugar-rush').find((c) =>
        c.targets.some((t) => 'object' in t && t.object.id === stormbrood),
      )!,
    );
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(10 - 2 - 1);
  });

  it('a shock land: paying 2 life to have it enter untapped exiles the top two cards instead', () => {
    const g = game({
      p1: { hand: ['hallowed-fountain'], battlefield: [ashiok] },
    });
    const land = g.id('p1', 'hallowed-fountain', 'hand');
    g.do(g.legal().find((a) => a.type === 'playLand' && a.card === land)!);
    stop(g);
    choose(g, /Pay 2 life/);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(8);
    expect(g.obj(land).tapped).toBe(false);
    // Without Ashiok the life is paid.
    const h = game({ p1: { hand: ['hallowed-fountain'] } });
    const land2 = h.id('p1', 'hallowed-fountain', 'hand');
    h.do(h.legal().find((a) => a.type === 'playLand' && a.card === land2)!);
    stop(h);
    choose(h, /Pay 2 life/);
    done(h);
    expect(h.life('p1')).toBe(18);
    expect(h.state.players.p1.library).toHaveLength(10);
  });

  it('a mana ability with life in its cost (Mount Doom): paying for a spell exiles the top card', () => {
    const g = game({
      p1: { hand: ['rat-out'], battlefield: ['mount-doom', ashiok] },
    });
    g.do(casts(g, 'rat-out').find((c) => c.targets.length === 0)!);
    done(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(9);
    expect(exile(g)).toHaveLength(1);
    const h = game({ p1: { hand: ['rat-out'], battlefield: ['mount-doom'] } });
    h.do(casts(h, 'rat-out').find((c) => c.targets.length === 0)!);
    done(h);
    expect(h.life('p1')).toBe(19);
  });
});
