import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  activate,
  board,
  casts,
  done,
  exile,
  game,
  gy,
  hand,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';
import {
  chooseMode,
  food,
  hasKw,
  pickTarget,
  play,
  plus,
  rats,
  removeFromBattlefield,
  roles,
  targeting,
  targetingPlayer,
} from './woe-black-helpers.ts';

// Wilds of Eldraine 23b: the black creatures and their Adventures.

/** Casts the creature half of a card that is on an adventure in exile. */
function castFromExile(g: ReturnType<typeof game>, defId: string): void {
  const id = g.id('p1', defId, 'exile');
  const a = g.legal().find((x) => x.type === 'castSpell' && x.card === id);
  expect(a, `${defId} is not castable from exile`).toBeDefined();
  g.do(a!);
  done(g);
}

describe('Barrow Naughty', () => {
  it('2/... flying; lifelink only while you control another Faerie; {2}{B}: +1/+0', () => {
    const g = game({ p1: { battlefield: [...n('swamp', 3), 'barrow-naughty'] } });
    const f = g.id('p1', 'barrow-naughty');
    expect(pt(g, f)).toEqual([1, 3]);
    expect(hasKw(g, f, 'flying')).toBe(true);
    expect(hasKw(g, f, 'lifelink')).toBe(false);
    activate(g, f, 1);
    done(g);
    expect(pt(g, f)).toEqual([2, 3]);
    const h = game({ p1: { battlefield: ['barrow-naughty', 'barrow-naughty'] } });
    const [a, b] = h.state.battlefield;
    expect(hasKw(h, a!, 'lifelink')).toBe(true);
    expect(hasKw(h, b!, 'lifelink')).toBe(true);
    removeFromBattlefield(h, b!);
    expect(hasKw(h, a!, 'lifelink')).toBe(false);
    // An opponent's Faerie does not count.
    const i = game({
      p1: { battlefield: ['barrow-naughty'] },
      p2: { battlefield: ['barrow-naughty'] },
    });
    expect(hasKw(i, i.id('p1', 'barrow-naughty'), 'lifelink')).toBe(false);
  });
});

describe('Callous Sell-Sword // Burn Together', () => {
  it('enters with a +1/+1 counter for each creature that died under your control this turn', () => {
    const g = game({
      p1: {
        hand: ['callous-sell-sword', 'candy-grapple', 'candy-grapple'],
        battlefield: [...n('swamp', 6), 'savannah-lions', 'llanowar-elves'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    play(g, 'candy-grapple', targeting(g.id('p1', 'savannah-lions')));
    play(g, 'candy-grapple', targeting(g.id('p1', 'llanowar-elves')));
    play(g, 'callous-sell-sword', (a) => !a.back);
    const sword = g.id('p1', 'callous-sell-sword');
    expect(plus(g, sword)).toBe(2);
    expect(pt(g, sword)).toEqual([4, 4]);
  });

  it('creatures of the opponent that died, or that died on another turn, do not count', () => {
    const g = game({
      p1: {
        hand: ['callous-sell-sword', 'candy-grapple'],
        battlefield: [...n('swamp', 5)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    play(g, 'candy-grapple', targeting(g.id('p2', 'savannah-lions')));
    play(g, 'callous-sell-sword', (a) => !a.back);
    expect(plus(g, g.id('p1', 'callous-sell-sword'))).toBe(0);
    expect(pt(g, g.id('p1', 'callous-sell-sword'))).toEqual([2, 2]);
  });

  it('Burn Together: your creature deals damage equal to its power to any other target, then you sacrifice it', () => {
    const g = game({
      p1: { hand: ['callous-sell-sword'], battlefield: ['mountain', 'serra-angel'] },
      p2: { battlefield: ['shivan-dragon', 'savannah-lions'] },
    });
    const angel = g.id('p1', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const all = casts(g, 'callous-sell-sword').filter((a) => a.back);
    // Not the same object twice; any other target: creatures of either side and players.
    expect(all.some((a) => a.targets.length === 2 && a.targets[0] === a.targets[1])).toBe(false);
    expect(
      all.some(
        (a) => targeting(angel)(a) && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      ),
    ).toBe(true);
    expect(all.some((a) => a.targets.some((t) => 'player' in t && t.player === 'p1'))).toBe(true);
    play(g, 'callous-sell-sword', (a) => !!a.back && targeting(angel)(a) && targeting(lions)(a));
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(gy(g)).toEqual(['serra-angel']);
    expect(exile(g)).toEqual(['callous-sell-sword']);
    // Later, the creature.
    const h = game({
      p1: {
        hand: ['callous-sell-sword'],
        battlefield: [...n('swamp', 4), 'mountain', 'serra-angel'],
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    play(h, 'callous-sell-sword', (a) => !!a.back && targetingPlayer('p2')(a));
    expect(h.life('p2')).toBe(16);
    castFromExile(h, 'callous-sell-sword');
    expect(board(h, 'callous-sell-sword', 'p1')).toHaveLength(1);
  });

  it('Burn Together: if the first target is gone nothing is dealt or sacrificed; if the other is gone, it is still sacrificed', () => {
    const mk = () =>
      game({
        p1: { hand: ['callous-sell-sword'], battlefield: ['mountain', 'serra-angel'] },
        p2: { battlefield: ['shivan-dragon', 'savannah-lions'] },
      });
    const g = mk();
    const angel = g.id('p1', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    g.do(
      casts(g, 'callous-sell-sword').find(
        (a) => !!a.back && targeting(angel)(a) && targeting(lions)(a),
      )!,
    );
    removeFromBattlefield(g, lions);
    done(g);
    expect(board(g, 'serra-angel', 'p1')).toHaveLength(0);
    expect(gy(g)).toContain('serra-angel');
    const h = mk();
    const angel2 = h.id('p1', 'serra-angel');
    const dragon = h.id('p2', 'shivan-dragon');
    h.do(
      casts(h, 'callous-sell-sword').find(
        (a) => !!a.back && targeting(angel2)(a) && targeting(dragon)(a),
      )!,
    );
    removeFromBattlefield(h, angel2);
    done(h);
    expect(h.obj(dragon).damage).toBe(0);
    expect(h.life('p2')).toBe(20);
  });
});

describe('Conceited Witch // Price of Beauty', () => {
  it('menace 2/3; Price of Beauty puts a Wicked Role on a creature you control, then the Witch can be cast', () => {
    const d = cardDb.get('conceited-witch')!;
    expect(d.keywords).toContain('menace');
    expect([d.power, d.toughness]).toEqual([2, 3]);
    const g = game({
      p1: { hand: ['conceited-witch'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'conceited-witch', (a) => !!a.back && targeting(lions)(a));
    expect(roles(g, lions)).toHaveLength(1);
    expect(pt(g, lions)).toEqual([3, 2]);
    // Only creatures you control are targets.
    expect(exile(g)).toEqual(['conceited-witch']);
    castFromExile(g, 'conceited-witch');
    expect(board(g, 'conceited-witch', 'p1')).toHaveLength(1);
  });

  it("can't target the opponent's creature", () => {
    const g = game({
      p1: { hand: ['conceited-witch'], battlefield: [...n('swamp', 4)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(casts(g, 'conceited-witch').filter((a) => a.back)).toHaveLength(0);
  });
});

describe('Dream Spoilers', () => {
  it("flying; casting a spell on an opponent's turn gives up to one opponent creature -1/-1", () => {
    expect(cardDb.get('dream-spoilers')!.keywords).toContain('flying');
    const g = game({
      active: 'p2',
      p1: {
        hand: ['sugar-rush'],
        battlefield: [...n('swamp', 2), 'dream-spoilers', 'savannah-lions'],
      },
      p2: { battlefield: ['llanowar-elves', 'serra-angel'] },
    });
    g.pass();
    g.do(casts(g, 'sugar-rush').find(targeting(g.id('p1', 'savannah-lions')))!);
    done(g, { target: pickTarget(g.id('p2', 'serra-angel')) });
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([3, 3]);
    expect(pt(g, g.id('p2', 'llanowar-elves'))).toEqual([1, 1]);
  });

  it("does nothing on your own turn, or for the opponent's spells", () => {
    const g = game({
      p1: {
        hand: ['sugar-rush'],
        battlefield: [...n('swamp', 2), 'dream-spoilers', 'savannah-lions'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    play(g, 'sugar-rush', targeting(g.id('p1', 'savannah-lions')));
    expect(pt(g, g.id('p2', 'llanowar-elves'))).toEqual([1, 1]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    const h = game({
      active: 'p2',
      p1: { battlefield: ['dream-spoilers'] },
      p2: { hand: ['sugar-rush'], battlefield: [...n('swamp', 2), 'llanowar-elves'] },
    });
    play(h, 'sugar-rush', targeting(h.id('p2', 'llanowar-elves')), 'p2');
    expect(h.state.pendingTriggers).toHaveLength(0);
    expect(pt(h, h.id('p2', 'llanowar-elves'))).toEqual([4, 1]);
  });

  it('a creature of 1 toughness dies; with no opponent creature nothing happens', () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: ['sugar-rush'],
        battlefield: [...n('swamp', 2), 'dream-spoilers', 'savannah-lions'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.pass();
    g.do(casts(g, 'sugar-rush').find(targeting(g.id('p1', 'savannah-lions')))!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    const h = game({
      active: 'p2',
      p1: {
        hand: ['sugar-rush'],
        battlefield: [...n('swamp', 2), 'dream-spoilers', 'savannah-lions'],
      },
    });
    h.pass();
    play(h, 'sugar-rush', targeting(h.id('p1', 'savannah-lions')));
    expect(h.decision.kind).toBe('priority');
  });
});

describe('Experimental Confectioner and Sweettooth Witch', () => {
  it('Confectioner: enters with a Food; whenever you sacrifice a Food, a Rat', () => {
    const g = game({
      p1: { hand: ['experimental-confectioner'], battlefield: n('swamp', 5) },
    });
    play(g, 'experimental-confectioner');
    expect(food(g)).toHaveLength(1);
    expect(rats(g)).toHaveLength(0);
    // The Food's own ability: {2}, {T}, Sacrifice: gain 3 life.
    activate(g, food(g)[0]!, 0);
    done(g);
    expect(g.life('p1')).toBe(23);
    expect(rats(g)).toHaveLength(1);
    expect(pt(g, g.id('p1', 'experimental-confectioner'))).toEqual([2, 3]);
  });

  it('Confectioner: any Food sacrifice counts (Sweettooth Witch), other sacrifices do not', () => {
    const g = game({
      p1: {
        battlefield: [
          ...n('swamp', 4),
          'experimental-confectioner',
          'sweettooth-witch',
          'food-token',
        ],
      },
    });
    activate(g, g.id('p1', 'sweettooth-witch'), 1, [{ player: 'p2' }], {
      sacrifice: g.id('p1', 'food-token'),
    });
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(rats(g)).toHaveLength(1);
    expect(food(g)).toHaveLength(0);
    // A creature sacrificed is not a Food.
    const h = game({
      p1: {
        battlefield: [...n('swamp', 3), 'experimental-confectioner', 'hopeless-nightmare'],
      },
    });
    activate(h, h.id('p1', 'hopeless-nightmare'), 2);
    done(h);
    expect(rats(h)).toHaveLength(0);
  });

  it('Sweettooth Witch: 3/2, enters with a Food; {2}, sacrifice a Food: target player loses 2 life', () => {
    const g = game({ p1: { hand: ['sweettooth-witch'], battlefield: n('swamp', 5) } });
    play(g, 'sweettooth-witch');
    expect(pt(g, g.id('p1', 'sweettooth-witch'))).toEqual([3, 2]);
    expect(food(g)).toHaveLength(1);
    const a = abilityActions(g, g.id('p1', 'sweettooth-witch'), 1);
    expect(a.length).toBeGreaterThan(0);
    // Target player: either.
    activate(g, g.id('p1', 'sweettooth-witch'), 1, [{ player: 'p1' }], { sacrifice: food(g)[0] });
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(food(g)).toHaveLength(0);
    expect(abilityActions(g, g.id('p1', 'sweettooth-witch'), 1)).toHaveLength(0);
  });
});

describe('Faerie Dreamthief', () => {
  it('flying 1/1; surveils 1 when it enters; {2}{B}, exile it from your graveyard: draw a card and lose 1 life', () => {
    const g = game({
      p1: {
        hand: ['faerie-dreamthief'],
        battlefield: n('swamp', 1),
        library: ['serra-angel', 'forest', 'forest'],
      },
    });
    g.do(casts(g, 'faerie-dreamthief')[0]!);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    g.do(g.legal().find((a) => a.type === 'scry')!);
    done(g);
    expect(hasKw(g, g.id('p1', 'faerie-dreamthief'), 'flying')).toBe(true);
    const h = game({
      p1: {
        graveyard: ['faerie-dreamthief'],
        battlefield: n('swamp', 3),
        library: ['serra-angel', 'forest'],
      },
    });
    const card = h.id('p1', 'faerie-dreamthief', 'graveyard');
    activate(h, card, 1);
    done(h);
    expect(exile(h)).toEqual(['faerie-dreamthief']);
    expect(hand(h)).toEqual(['serra-angel']);
    expect(h.life('p1')).toBe(19);
  });

  it('can only be used from the graveyard', () => {
    const g = game({
      p1: { battlefield: [...n('swamp', 3), 'faerie-dreamthief'] },
    });
    expect(abilityActions(g, g.id('p1', 'faerie-dreamthief'), 1)).toHaveLength(0);
  });
});

describe('Gumdrop Poisoner // Tempt with Treats', () => {
  it('lifelink 3/2; when it enters, up to one target creature gets -X/-X, X the life you gained this turn', () => {
    const g = game({
      p1: { hand: ['gumdrop-poisoner'], battlefield: [...n('swamp', 5), 'food-token'] },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(cardDb.get('gumdrop-poisoner')!.keywords).toContain('lifelink');
    // Sacrifice the Food: gain 3.
    activate(g, g.id('p1', 'food-token'), 0);
    done(g);
    expect(g.life('p1')).toBe(23);
    play(g, 'gumdrop-poisoner', (a) => !a.back);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 1]);
  });

  it('with no life gained this turn it does nothing; the target is optional', () => {
    const g = game({
      p1: { hand: ['gumdrop-poisoner'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    play(g, 'gumdrop-poisoner', (a) => !a.back);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
    const h = game({
      p1: { hand: ['gumdrop-poisoner'], battlefield: n('swamp', 3) },
    });
    play(h, 'gumdrop-poisoner', (a) => !a.back);
    expect(board(h, 'gumdrop-poisoner')).toHaveLength(1);
  });

  it('the life gained, not the net: life lost earlier does not reduce X', () => {
    const g = game({
      p1: { hand: ['gumdrop-poisoner'], battlefield: [...n('swamp', 5), 'food-token'] },
      p2: { battlefield: ['serra-angel'] },
    });
    activate(g, g.id('p1', 'food-token'), 0);
    done(g);
    g.state.players.p1.life = 10;
    play(g, 'gumdrop-poisoner', (a) => !a.back);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 1]);
  });

  it('Tempt with Treats: create a Food token, then the Poisoner can be cast from exile', () => {
    const g = game({ p1: { hand: ['gumdrop-poisoner'], battlefield: n('swamp', 4) } });
    play(g, 'gumdrop-poisoner', (a) => !!a.back);
    expect(food(g)).toHaveLength(1);
    expect(exile(g)).toEqual(['gumdrop-poisoner']);
    castFromExile(g, 'gumdrop-poisoner');
    expect(board(g, 'gumdrop-poisoner')).toHaveLength(1);
  });
});

describe('High Fae Negotiator', () => {
  it('flying 3/5; bargained: each opponent loses 3 life and you gain 3 life', () => {
    const d = cardDb.get('high-fae-negotiator')!;
    expect(d.keywords).toContain('flying');
    expect([d.power, d.toughness]).toEqual([3, 5]);
    const g = game({
      p1: { hand: ['high-fae-negotiator'], battlefield: [...n('swamp', 5), 'food-token'] },
    });
    const f = g.id('p1', 'food-token');
    play(g, 'high-fae-negotiator', (a) => !!a.kicked && a.sacrifice === f);
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(17);
    expect(food(g)).toHaveLength(0);
  });

  it('not bargained: nothing happens', () => {
    const g = game({
      p1: { hand: ['high-fae-negotiator'], battlefield: [...n('swamp', 5), 'food-token'] },
    });
    play(g, 'high-fae-negotiator', (a) => !a.kicked);
    expect(g.life('p1')).toBe(20);
    expect(g.life('p2')).toBe(20);
    expect(food(g)).toHaveLength(1);
  });
});

describe('Hopeless Nightmare', () => {
  it('enters: each opponent discards a card and loses 2 life, even with an empty hand', () => {
    const g = game({
      p1: { hand: ['hopeless-nightmare'], battlefield: n('swamp', 1) },
      p2: { hand: ['forest', 'serra-angel'] },
    });
    play(g, 'hopeless-nightmare');
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(g.life('p2')).toBe(18);
    const h = game({ p1: { hand: ['hopeless-nightmare'], battlefield: n('swamp', 1) } });
    play(h, 'hopeless-nightmare');
    expect(h.life('p2')).toBe(18);
  });

  it('{2}{B}: sacrifice it; when it goes to the graveyard, scry 2', () => {
    const g = game({ p1: { battlefield: [...n('swamp', 3), 'hopeless-nightmare'] } });
    activate(g, g.id('p1', 'hopeless-nightmare'), 2);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    done(g);
    expect(gy(g)).toEqual(['hopeless-nightmare']);
    expect(g.events.filter((e) => e.type === 'scried')).toHaveLength(1);
  });
});

describe("Lord Skitter's Butcher", () => {
  const ready = () =>
    game({
      p1: { hand: ['lord-skitters-butcher'], battlefield: [...n('swamp', 3), 'savannah-lions'] },
    });

  it('2/3; mode 1: create a Rat', () => {
    const g = ready();
    g.do(casts(g, 'lord-skitters-butcher')[0]!);
    stop(g);
    chooseMode(g, 0);
    done(g);
    expect(rats(g)).toHaveLength(1);
    expect(pt(g, g.id('p1', 'lord-skitters-butcher'))).toEqual([2, 3]);
  });

  it('mode 2: you may sacrifice another creature; if you do, scry 2, then draw a card', () => {
    const g = ready();
    g.do(casts(g, 'lord-skitters-butcher')[0]!);
    stop(g);
    chooseMode(g, 1);
    done(g, { accept: true });
    expect(gy(g)).toContain('savannah-lions');
    expect(hand(g)).toEqual(['forest']);
    expect(board(g, 'lord-skitters-butcher')).toHaveLength(1);
  });

  it('mode 2: declining sacrifices nothing and draws nothing', () => {
    const g = ready();
    g.do(casts(g, 'lord-skitters-butcher')[0]!);
    stop(g);
    chooseMode(g, 1);
    done(g, { accept: false });
    expect(board(g, 'savannah-lions')).toHaveLength(1);
    expect(hand(g)).toEqual([]);
  });

  it('mode 2 with no other creature: nothing to sacrifice, the Butcher stays', () => {
    const g = game({
      p1: { hand: ['lord-skitters-butcher'], battlefield: n('swamp', 3) },
    });
    g.do(casts(g, 'lord-skitters-butcher')[0]!);
    stop(g);
    chooseMode(g, 1);
    done(g);
    expect(board(g, 'lord-skitters-butcher')).toHaveLength(1);
    expect(hand(g)).toEqual([]);
  });

  it('mode 3: creatures you control gain menace until end of turn', () => {
    const g = ready();
    g.do(casts(g, 'lord-skitters-butcher')[0]!);
    stop(g);
    chooseMode(g, 2);
    done(g);
    expect(hasKw(g, g.id('p1', 'savannah-lions'), 'menace')).toBe(true);
    expect(hasKw(g, g.id('p1', 'lord-skitters-butcher'), 'menace')).toBe(true);
    passTo(g, 'main1', 'p2');
    expect(hasKw(g, g.id('p1', 'savannah-lions'), 'menace')).toBe(false);
  });
});

describe('Lord Skitter, Sewer King', () => {
  it("3/3; at the beginning of combat on your turn, create a Rat; whenever another Rat enters, exile up to one card from an opponent's graveyard", () => {
    const g = game({
      p1: { battlefield: ['lord-skitter-sewer-king'] },
      p2: { graveyard: ['serra-angel', 'savannah-lions'] },
    });
    expect(pt(g, g.id('p1', 'lord-skitter-sewer-king'))).toEqual([3, 3]);
    passTo(g, 'beginCombat');
    done(g, {
      target: (a) =>
        a.targets.some(
          (t) => 'object' in t && t.object.id === g.id('p2', 'serra-angel', 'graveyard'),
        ),
    });
    expect(rats(g)).toHaveLength(1);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
  });

  it('the Rat that enters can be another Rat; Lord Skitter himself does not trigger it; only your own Rats; no card is fine', () => {
    const g = game({
      p1: {
        hand: ['voracious-vermin'],
        battlefield: [...n('swamp', 3), 'lord-skitter-sewer-king'],
      },
      p2: { graveyard: ['serra-angel'] },
      // The opponent's graveyard card is exiled by a Rat token made by Voracious Vermin (a Rat) and the token itself.
    });
    play(g, 'voracious-vermin');
    // Two Rats entered (Voracious Vermin, then its token): the first exiled the Angel, the second had no card left to target.
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(rats(g)).toHaveLength(1);
    const h = game({
      p1: { hand: ['lord-skitter-sewer-king'], battlefield: [...n('swamp', 3)] },
      p2: { graveyard: ['serra-angel'], battlefield: ['voracious-vermin'] },
    });
    play(h, 'lord-skitter-sewer-king');
    expect(exile(h, 'p2')).toEqual([]);
  });

  it("the opponent's Rat entering does nothing, and cards in your own graveyard are not exiled", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['lord-skitter-sewer-king'], graveyard: ['savannah-lions'] },
      p2: { hand: ['voracious-vermin'], battlefield: n('swamp', 3), graveyard: ['serra-angel'] },
    });
    play(g, 'voracious-vermin', () => true, 'p2');
    expect(exile(g, 'p2')).toEqual([]);
    expect(exile(g)).toEqual([]);
  });
});

describe('Mintstrosity and Scream Puff', () => {
  it('Mintstrosity: 3/1; when it dies, create a Food', () => {
    const g = game({ p1: { battlefield: ['mintstrosity'] } });
    expect(pt(g, g.id('p1', 'mintstrosity'))).toEqual([3, 1]);
    g.obj(g.id('p1', 'mintstrosity')).damage = 1;
    g.pass();
    done(g);
    expect(gy(g)).toEqual(['mintstrosity']);
    expect(food(g)).toHaveLength(1);
  });

  it('Scream Puff: deathtouch 4/5; combat damage to a player creates a Food', () => {
    const g = game({ p1: { battlefield: ['scream-puff'] } });
    const puff = g.id('p1', 'scream-puff');
    expect(hasKw(g, puff, 'deathtouch')).toBe(true);
    expect(pt(g, puff)).toEqual([4, 5]);
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(puff);
    passTo(g, 'endCombat');
    done(g);
    expect(g.life('p2')).toBe(16);
    expect(food(g)).toHaveLength(1);
  });

  it('Scream Puff: blocked, no Food', () => {
    const g = game({
      p1: { battlefield: ['scream-puff'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const puff = g.id('p1', 'scream-puff');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(puff);
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    g.block([g.id('p2', 'savannah-lions'), puff]);
    passTo(g, 'endCombat');
    done(g);
    expect(food(g)).toHaveLength(0);
  });
});

describe('Old Flitterfang', () => {
  it('flying 3/4; at the beginning of each end step, if a creature died this turn, create a Food', () => {
    const g = game({
      p1: { hand: ['candy-grapple'], battlefield: [...n('swamp', 2), 'old-flitterfang'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(hasKw(g, g.id('p1', 'old-flitterfang'), 'flying')).toBe(true);
    expect(pt(g, g.id('p1', 'old-flitterfang'))).toEqual([3, 4]);
    // A quiet turn: no Food at the end step.
    passTo(g, 'end');
    done(g);
    expect(food(g)).toHaveLength(0);
  });

  it('a creature (any) dying makes a Food at the end step, once', () => {
    const g = game({
      p1: { hand: ['candy-grapple'], battlefield: [...n('swamp', 2), 'old-flitterfang'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    play(g, 'candy-grapple', targeting(g.id('p2', 'savannah-lions')));
    passTo(g, 'end');
    done(g);
    expect(food(g)).toHaveLength(1);
  });

  it("also at the opponent's end step", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['candy-grapple'], battlefield: [...n('swamp', 2), 'old-flitterfang'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.pass();
    play(g, 'candy-grapple', targeting(g.id('p2', 'savannah-lions')));
    passTo(g, 'end', 'p2');
    done(g);
    expect(food(g)).toHaveLength(1);
    expect(food(g, 'p2')).toHaveLength(0);
  });

  it('{2}{B}, sacrifice another creature or artifact: +2/+2 until end of turn', () => {
    const g = game({
      p1: { battlefield: [...n('swamp', 6), 'old-flitterfang', 'savannah-lions', 'food-token'] },
    });
    const f = g.id('p1', 'old-flitterfang');
    const acts = abilityActions(g, f, 1) as { sacrifice?: string }[];
    // Another creature, or an artifact (the Food): not itself, not a land.
    expect(acts.map((a) => a.sacrifice).sort()).toEqual(
      [g.id('p1', 'savannah-lions'), g.id('p1', 'food-token')].sort(),
    );
    g.do(acts.find((a) => a.sacrifice === g.id('p1', 'food-token')) as never);
    done(g);
    expect(pt(g, f)).toEqual([5, 6]);
    expect(food(g)).toHaveLength(0);
    expect(board(g, 'savannah-lions')).toHaveLength(1);
  });
});

describe('Spellscorn Coven // Take It Back', () => {
  it('flying 2/3; when it enters each opponent discards a card', () => {
    const g = game({
      p1: { hand: ['spellscorn-coven'], battlefield: n('swamp', 4) },
      p2: { hand: ['forest', 'serra-angel'] },
    });
    play(g, 'spellscorn-coven', (a) => !a.back);
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(hasKw(g, g.id('p1', 'spellscorn-coven'), 'flying')).toBe(true);
  });

  it("Take It Back: return target spell to its owner's hand, then cast the Coven from exile", () => {
    const g = game({
      p1: {
        hand: ['spellscorn-coven', 'barrow-naughty'],
        battlefield: [...n('island', 3), ...n('swamp', 2)],
      },
    });
    g.do(casts(g, 'barrow-naughty')[0]!);
    const spell = g.state.stack[0]!.id;
    g.do(
      casts(g, 'spellscorn-coven').find(
        (a) => !!a.back && a.targets.some((t) => 'object' in t && t.object.id === spell),
      )!,
    );
    done(g);
    expect(hand(g)).toEqual(['barrow-naughty']);
    expect(exile(g)).toEqual(['spellscorn-coven']);
    expect(board(g, 'barrow-naughty')).toHaveLength(0);
  });

  it("Take It Back: the opponent's spell too, even one that can't be countered", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['spellscorn-coven'], battlefield: n('island', 3) },
      p2: { hand: ['sugar-rush'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    g.do(casts(g, 'sugar-rush', 'p2')[0]!);
    const spell = g.state.stack[0]!.id;
    g.pass();
    g.do(
      casts(g, 'spellscorn-coven').find(
        (a) => !!a.back && a.targets.some((t) => 'object' in t && t.object.id === spell),
      )!,
    );
    done(g);
    expect(hand(g, 'p2')).toEqual(['sugar-rush']);
  });
});

describe('Stingblade Assassin', () => {
  it('flash flying 3/1; when it enters destroy target creature an opponent controls that was dealt damage this turn', () => {
    const d = cardDb.get('stingblade-assassin')!;
    expect(d.keywords).toEqual(expect.arrayContaining(['flash', 'flying']));
    const g = game({
      p1: { hand: ['stingblade-assassin'], battlefield: n('swamp', 4) },
      p2: { battlefield: [{ card: 'serra-angel', damage: 1 }, 'shivan-dragon'] },
    });
    play(g, 'stingblade-assassin');
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(board(g, 'shivan-dragon', 'p2')).toHaveLength(1);
  });

  it('an undamaged creature, or your own damaged creature, is not a target', () => {
    const g = game({
      p1: {
        hand: ['stingblade-assassin'],
        battlefield: [...n('swamp', 4), { card: 'savannah-lions', damage: 0 }],
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    play(g, 'stingblade-assassin');
    expect(board(g, 'shivan-dragon', 'p2')).toHaveLength(1);
    expect(board(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(board(g, 'stingblade-assassin', 'p1')).toHaveLength(1);
  });
});

describe("The Witch's Vanity", () => {
  it("I: destroy an opponent's creature with mana value 2 or less; II: a Food; III: a Wicked Role on your creature; then it is sacrificed", () => {
    const g = game({
      p1: { hand: ['the-witchs-vanity'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const mine = g.id('p1', 'savannah-lions');
    // Chapter I: only the Lions is a legal target (mana value 1).
    play(g, 'the-witchs-vanity');
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(board(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'the-witchs-vanity')).counters?.lore).toBe(1);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    expect(food(g)).toHaveLength(1);
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    done(g);
    expect(roles(g, mine)).toHaveLength(1);
    expect(pt(g, mine)).toEqual([3, 2]);
    expect(gy(g)).toContain('the-witchs-vanity');
  });

  it('chapter I with no legal target does nothing', () => {
    const g = game({
      p1: { hand: ['the-witchs-vanity'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    play(g, 'the-witchs-vanity');
    expect(board(g, 'serra-angel', 'p2')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'the-witchs-vanity')).counters?.lore).toBe(1);
  });
});

describe('Twisted Sewer-Witch', () => {
  it('creates a Rat, then a Wicked Role on each Rat you control', () => {
    const g = game({
      p1: {
        hand: ['twisted-sewer-witch'],
        battlefield: [...n('swamp', 5), 'woe-rat-token', 'savannah-lions'],
      },
      p2: { battlefield: ['woe-rat-token'] },
    });
    const old = g.id('p1', 'woe-rat-token');
    const theirs = g.id('p2', 'woe-rat-token');
    g.obj(old).isToken = true;
    g.obj(theirs).isToken = true;
    play(g, 'twisted-sewer-witch');
    const mine = rats(g);
    expect(mine).toHaveLength(2);
    for (const id of mine) {
      expect(roles(g, id)).toHaveLength(1);
      expect(pt(g, id)).toEqual([2, 2]);
    }
    expect(roles(g, g.id('p1', 'savannah-lions'))).toHaveLength(0);
    expect(roles(g, g.id('p1', 'twisted-sewer-witch'))).toHaveLength(0);
    expect(roles(g, theirs)).toHaveLength(0);
    expect(pt(g, g.id('p1', 'twisted-sewer-witch'))).toEqual([3, 4]);
  });

  it('a Rat card (not a token) counts; the Witch itself is not a Rat', () => {
    const g = game({
      p1: { hand: ['twisted-sewer-witch'], battlefield: [...n('swamp', 5), 'voracious-vermin'] },
    });
    play(g, 'twisted-sewer-witch');
    expect(roles(g, g.id('p1', 'voracious-vermin'))).toHaveLength(1);
    expect(rats(g)).toHaveLength(1);
    expect(roles(g, rats(g)[0]!)).toHaveLength(1);
  });
});

describe('Virtue of Persistence // Locthwain Scorn', () => {
  it('Locthwain Scorn: -3/-3 and gain 2 life; then the Virtue can be cast from exile', () => {
    const g = game({
      p1: { hand: ['virtue-of-persistence'], battlefield: n('swamp', 9) },
      p2: { battlefield: ['serra-angel'] },
    });
    play(g, 'virtue-of-persistence', (a) => !!a.back && targeting(g.id('p2', 'serra-angel'))(a));
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 1]);
    expect(g.life('p1')).toBe(22);
    expect(exile(g)).toEqual(['virtue-of-persistence']);
    castFromExile(g, 'virtue-of-persistence');
    expect(board(g, 'virtue-of-persistence')).toHaveLength(1);
  });

  it('at the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control', () => {
    const g = game({
      p1: { battlefield: ['virtue-of-persistence'], graveyard: ['llanowar-elves'] },
      p2: { graveyard: ['serra-angel', 'swamp'] },
    });
    passTo(g, 'upkeep', 'p2');
    // Any graveyard, creatures only (the Swamp is not a target): the Angel is chosen from there.
    passTo(g, 'upkeep', 'p1', { target: pickTarget(g.id('p2', 'serra-angel', 'graveyard')) });
    done(g);
    expect(board(g, 'serra-angel', 'p1')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'serra-angel')).controller).toBe('p1');
    expect(gy(g, 'p2')).toEqual(['swamp']);
  });

  it("does nothing on the opponent's upkeep", () => {
    const g = game({
      p1: { battlefield: ['virtue-of-persistence'] },
      p2: { graveyard: ['serra-angel'] },
    });
    passTo(g, 'upkeep', 'p2');
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Voracious Vermin', () => {
  it('2/1; enters with a Rat; grows when another creature you control dies', () => {
    const g = game({
      p1: {
        hand: ['voracious-vermin', 'candy-grapple', 'candy-grapple', 'candy-grapple'],
        battlefield: [...n('swamp', 9), 'savannah-lions'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    play(g, 'voracious-vermin');
    const v = g.id('p1', 'voracious-vermin');
    expect(rats(g)).toHaveLength(1);
    expect(plus(g, v)).toBe(0);
    // An opponent's creature dying does not count.
    play(g, 'candy-grapple', targeting(g.id('p2', 'llanowar-elves')));
    expect(plus(g, v)).toBe(0);
    play(g, 'candy-grapple', targeting(g.id('p1', 'savannah-lions')));
    expect(plus(g, v)).toBe(1);
    expect(pt(g, v)).toEqual([3, 2]);
    // The Rat token dying counts too.
    play(g, 'candy-grapple', targeting(rats(g)[0]!));
    expect(plus(g, v)).toBe(2);
  });
});
