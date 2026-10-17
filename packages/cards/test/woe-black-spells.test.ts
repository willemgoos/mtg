import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  board,
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
import { food, pickSpellTargets, play, rats, roles, targeting } from './woe-black-helpers.ts';

// Wilds of Eldraine 23b: the black instants and sorceries.

describe('Back for Seconds', () => {
  const setup = (graveyard: string[], extra: string[] = []) =>
    game({
      p1: {
        hand: ['back-for-seconds'],
        battlefield: [...n('swamp', 3), ...extra],
        graveyard,
      },
    });
  const cardId = (g: ReturnType<typeof game>, def: string) => g.id('p1', def, 'graveyard');

  it('returns up to two target creature cards from your graveyard to your hand', () => {
    const g = setup(['savannah-lions', 'serra-angel', 'llanowar-elves', 'swamp']);
    const lions = cardId(g, 'savannah-lions');
    const angel = cardId(g, 'serra-angel');
    g.do(casts(g, 'back-for-seconds').find((a) => !a.kicked)!);
    expect(g.decision.kind).toBe('spellTargets');
    pickSpellTargets(g, [lions, angel]);
    done(g);
    expect(hand(g).sort()).toEqual(['savannah-lions', 'serra-angel']);
    expect(gy(g).sort()).toEqual(['back-for-seconds', 'llanowar-elves', 'swamp']);
  });

  it('one target, or none, is fine too; a land card in the graveyard is not a target', () => {
    const g = setup(['savannah-lions', 'swamp']);
    g.do(casts(g, 'back-for-seconds').find((a) => !a.kicked)!);
    pickSpellTargets(g, [cardId(g, 'savannah-lions')]);
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    const h = setup(['savannah-lions']);
    h.do(casts(h, 'back-for-seconds').find((a) => !a.kicked)!);
    pickSpellTargets(h, []);
    done(h);
    expect(hand(h)).toEqual([]);
    expect(gy(h).sort()).toEqual(['back-for-seconds', 'savannah-lions']);
  });

  it('bargained: a card with mana value 4 or less may go onto the battlefield instead of the hand', () => {
    const g = setup(['savannah-lions', 'llanowar-elves'], ['food-token']);
    const f = g.id('p1', 'food-token');
    const lions = cardId(g, 'savannah-lions');
    const elves = cardId(g, 'llanowar-elves');
    g.do(casts(g, 'back-for-seconds').find((a) => a.kicked && a.sacrifice === f)!);
    expect(g.zoneOf(f)).not.toBe('battlefield');
    pickSpellTargets(g, [lions, elves]);
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual([
      'Put Savannah Lions onto the battlefield',
      'Put Llanowar Elves onto the battlefield',
      'Put them into your hand',
    ]);
    choose(g, /Llanowar Elves onto/);
    done(g);
    expect(board(g, 'llanowar-elves', 'p1')).toHaveLength(1);
    expect(g.obj(g.id('p1', 'llanowar-elves')).controller).toBe('p1');
    expect(hand(g)).toEqual(['savannah-lions']);
  });

  it('bargained: you can still put them all into your hand', () => {
    const g = setup(['savannah-lions', 'llanowar-elves'], ['food-token']);
    const f = g.id('p1', 'food-token');
    g.do(casts(g, 'back-for-seconds').find((a) => a.kicked && a.sacrifice === f)!);
    pickSpellTargets(g, [cardId(g, 'savannah-lions'), cardId(g, 'llanowar-elves')]);
    stop(g);
    choose(g, /Put them into your hand/);
    done(g);
    expect(hand(g).sort()).toEqual(['llanowar-elves', 'savannah-lions']);
    expect(board(g, 'savannah-lions')).toHaveLength(0);
  });

  it('bargained with no card of mana value 4 or less: they go to your hand with no question', () => {
    const g = setup(['serra-angel', 'shivan-dragon'], ['food-token']);
    const f = g.id('p1', 'food-token');
    g.do(casts(g, 'back-for-seconds').find((a) => a.kicked && a.sacrifice === f)!);
    pickSpellTargets(g, [cardId(g, 'serra-angel'), cardId(g, 'shivan-dragon')]);
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(hand(g).sort()).toEqual(['serra-angel', 'shivan-dragon']);
  });

  it('a card that left the graveyard is not returned', () => {
    const g = setup(['savannah-lions', 'llanowar-elves']);
    const lions = cardId(g, 'savannah-lions');
    g.do(casts(g, 'back-for-seconds').find((a) => !a.kicked)!);
    pickSpellTargets(g, [lions, cardId(g, 'llanowar-elves')]);
    // The Lions is exiled in response.
    g.state.players.p1.graveyard = g.state.players.p1.graveyard.filter((x) => x !== lions);
    g.state.players.p1.exile.push(lions);
    g.obj(lions).zone = 'exile';
    g.obj(lions).zcc++;
    done(g);
    expect(hand(g)).toEqual(['llanowar-elves']);
  });
});

describe('Candy Grapple', () => {
  it('-3/-3, or -5/-5 if bargained (a Food is sacrificed)', () => {
    const g = game({
      p1: { hand: ['candy-grapple'], battlefield: [...n('swamp', 2), 'food-token'] },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    const f = g.id('p1', 'food-token');
    play(g, 'candy-grapple', (a) => !a.kicked && targeting(dragon)(a));
    expect(pt(g, dragon)).toEqual([2, 2]);
    expect(food(g)).toHaveLength(1);
    const h = game({
      p1: { hand: ['candy-grapple'], battlefield: [...n('swamp', 2), 'food-token'] },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon2 = h.id('p2', 'shivan-dragon');
    play(
      h,
      'candy-grapple',
      (a) => !!a.kicked && targeting(dragon2)(a) && a.sacrifice === h.id('p1', 'food-token'),
    );
    expect(gy(h, 'p2')).toEqual(['shivan-dragon']);
    expect(food(h)).toHaveLength(0);
    void f;
  });

  it('wears off at end of turn', () => {
    const g = game({
      p1: { hand: ['candy-grapple'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    play(g, 'candy-grapple', targeting(dragon));
    expect(pt(g, dragon)).toEqual([2, 2]);
    passTo(g, 'main1', 'p2');
    expect(pt(g, dragon)).toEqual([5, 5]);
  });
});

describe("Rowan's Grim Search", () => {
  const lib = (...ids: string[]) => [...ids, 'forest', 'forest'];
  const named = ['savannah-lions', 'llanowar-elves', 'serra-angel', 'shivan-dragon'];

  it('unbargained: draw two cards and lose 2 life, nothing else', () => {
    const g = game({
      p1: { hand: ['rowans-grim-search'], battlefield: n('swamp', 3), library: lib(...named) },
    });
    play(g, 'rowans-grim-search');
    expect(hand(g)).toEqual(['savannah-lions', 'llanowar-elves']);
    expect(g.life('p1')).toBe(18);
    expect(gy(g)).toEqual(['rowans-grim-search']);
  });

  it('bargained: put up to two of the top four back in any order, the rest into the graveyard; then draw two', () => {
    const g = game({
      p1: {
        hand: ['rowans-grim-search'],
        battlefield: [...n('swamp', 3), 'food-token'],
        library: lib(...named),
      },
    });
    const f = g.id('p1', 'food-token');
    g.do(casts(g, 'rowans-grim-search').find((a) => a.kicked && a.sacrifice === f)!);
    stop(g);
    // The top card first.
    expect(labels(g)).toEqual([
      'On top: Savannah Lions',
      'On top: Llanowar Elves',
      'On top: Serra Angel',
      'On top: Shivan Dragon',
      'Put none back (all go to your graveyard)',
    ]);
    choose(g, /On top: Serra Angel/);
    expect(labels(g)).toEqual([
      'Next: Savannah Lions',
      'Next: Llanowar Elves',
      'Next: Shivan Dragon',
      'Done (the rest go to your graveyard)',
    ]);
    choose(g, /Next: Savannah Lions/);
    done(g);
    // The Angel is on top, then the Lions: drawn by the two cards.
    expect(hand(g)).toEqual(['serra-angel', 'savannah-lions']);
    expect(
      gy(g)
        .filter((d) => d !== 'food-token')
        .sort(),
    ).toEqual(['llanowar-elves', 'rowans-grim-search', 'shivan-dragon']);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('bargained: you may put back one card, or none', () => {
    const one = game({
      p1: {
        hand: ['rowans-grim-search'],
        battlefield: [...n('swamp', 3), 'food-token'],
        library: lib(...named),
      },
    });
    one.do(casts(one, 'rowans-grim-search').find((a) => a.kicked)!);
    stop(one);
    choose(one, /On top: Shivan Dragon/);
    choose(one, /Done/);
    done(one);
    // The Dragon is drawn first, then the next card of the library below the four looked at.
    expect(hand(one)).toEqual(['shivan-dragon', 'forest']);
    expect(
      gy(one)
        .filter((d) => d !== 'food-token')
        .sort(),
    ).toEqual(['llanowar-elves', 'rowans-grim-search', 'savannah-lions', 'serra-angel']);
    const none = game({
      p1: {
        hand: ['rowans-grim-search'],
        battlefield: [...n('swamp', 3), 'food-token'],
        library: lib(...named),
      },
    });
    none.do(casts(none, 'rowans-grim-search').find((a) => a.kicked)!);
    stop(none);
    choose(none, /Put none back/);
    done(none);
    expect(hand(none)).toEqual(['forest', 'forest']);
    expect(gy(none).filter((d) => d !== 'food-token')).toHaveLength(5);
  });

  it('bargained with fewer than four cards in the library', () => {
    const g = game({
      p1: {
        hand: ['rowans-grim-search'],
        battlefield: [...n('swamp', 3), 'food-token'],
        library: ['savannah-lions', 'llanowar-elves'],
      },
    });
    g.do(casts(g, 'rowans-grim-search').find((a) => a.kicked)!);
    stop(g);
    choose(g, /On top: Llanowar Elves/);
    choose(g, /Next: Savannah Lions/);
    done(g);
    expect(hand(g)).toEqual(['llanowar-elves', 'savannah-lions']);
  });
});

describe('Faerie Fencing', () => {
  const fencing = (g: ReturnType<typeof game>, x: number, target: string) =>
    casts(g, 'faerie-fencing').find((a) => a.x === x && targeting(target)(a))!;

  it('target creature gets -X/-X', () => {
    const g = game({
      p1: { hand: ['faerie-fencing'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    // {X}{B} with four lands: X up to 3.
    expect(
      casts(g, 'faerie-fencing')
        .map((a) => a.x ?? 0)
        .sort(),
    ).toEqual(expect.arrayContaining([0, 1, 2, 3]));
    g.do(fencing(g, 3, dragon));
    done(g);
    expect(pt(g, dragon)).toEqual([2, 2]);
  });

  it('an additional -3/-3 if you controlled a Faerie as you cast it, even if you no longer do', () => {
    const g = game({
      p1: { hand: ['faerie-fencing'], battlefield: [...n('swamp', 3), 'barrow-naughty'] },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    g.do(fencing(g, 2, dragon));
    // The Faerie dies in response.
    const faerie = g.id('p1', 'barrow-naughty');
    g.state.battlefield = g.state.battlefield.filter((x) => x !== faerie);
    g.state.players.p1.graveyard.push(faerie);
    g.obj(faerie).zone = 'graveyard';
    done(g);
    // -2/-2 and the additional -3/-3 kill the 5/5 Dragon.
    expect(gy(g, 'p2')).toEqual(['shivan-dragon']);
  });

  it("a Faerie cast after it is no use; the opponent's Faerie does not count", () => {
    const g = game({
      p1: { hand: ['faerie-fencing'], battlefield: [...n('swamp', 3)] },
      p2: { battlefield: ['shivan-dragon', 'barrow-naughty'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    g.do(fencing(g, 1, dragon));
    done(g);
    expect(pt(g, dragon)).toEqual([4, 4]);
  });

  it('a Faerie that is not a creature on the battlefield (Faerie card in the graveyard) does not count', () => {
    const g = game({
      p1: {
        hand: ['faerie-fencing'],
        battlefield: [...n('swamp', 3)],
        graveyard: ['barrow-naughty'],
      },
      p2: { battlefield: ['shivan-dragon'] },
    });
    const dragon = g.id('p2', 'shivan-dragon');
    g.do(fencing(g, 1, dragon));
    done(g);
    expect(pt(g, dragon)).toEqual([4, 4]);
  });
});

describe('Feed the Cauldron', () => {
  it('destroys a creature with mana value 3 or less; on your turn you get a Food', () => {
    const g = game({
      p1: { hand: ['feed-the-cauldron'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    // The Angel (mana value 5) is not a target.
    const angel = g.id('p2', 'serra-angel');
    expect(casts(g, 'feed-the-cauldron').some(targeting(angel))).toBe(false);
    play(g, 'feed-the-cauldron', targeting(g.id('p2', 'savannah-lions')));
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(food(g)).toHaveLength(1);
  });

  it("on the opponent's turn it makes no Food", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['feed-the-cauldron'], battlefield: n('swamp', 3) },
      p2: { battlefield: ['savannah-lions'] },
    });
    g.pass();
    play(g, 'feed-the-cauldron', targeting(g.id('p2', 'savannah-lions')));
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    expect(food(g)).toHaveLength(0);
  });
});

describe("Eriette's Whisper", () => {
  it('target opponent discards two cards; a Wicked Role goes on up to one creature you control', () => {
    const g = game({
      p1: { hand: ['eriettes-whisper'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
      p2: { hand: ['forest', 'serra-angel', 'shivan-dragon'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'eriettes-whisper', (a) => targeting(lions)(a));
    expect(hand(g, 'p2')).toHaveLength(1);
    expect(gy(g, 'p2')).toHaveLength(2);
    expect(roles(g, lions)).toHaveLength(1);
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('without a creature target no Role is made', () => {
    const g = game({
      p1: { hand: ['eriettes-whisper'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
      p2: { hand: ['forest', 'serra-angel'] },
    });
    play(g, 'eriettes-whisper', (a) => a.targets.length === 1);
    expect(hand(g, 'p2')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'woe-wicked-role')).toHaveLength(
      0,
    );
  });

  it('an opponent with one card discards it; with an empty hand nothing happens', () => {
    const g = game({
      p1: { hand: ['eriettes-whisper'], battlefield: [...n('swamp', 4), 'savannah-lions'] },
      p2: { hand: ['forest'] },
    });
    play(g, 'eriettes-whisper', (a) => a.targets.length === 2);
    expect(hand(g, 'p2')).toHaveLength(0);
    expect(gy(g, 'p2')).toEqual(['forest']);
  });
});

describe('Not Dead After All', () => {
  it("the creature returns tapped under its owner's control with a Wicked Role when it dies this turn", () => {
    const g = game({
      p1: {
        hand: ['not-dead-after-all', 'candy-grapple'],
        battlefield: [...n('swamp', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'not-dead-after-all', targeting(lions));
    play(g, 'candy-grapple', targeting(lions));
    done(g);
    const back = board(g, 'savannah-lions', 'p1');
    expect(back).toHaveLength(1);
    expect(g.obj(back[0]!).tapped).toBe(true);
    expect(roles(g, back[0]!)).toHaveLength(1);
    expect(pt(g, back[0]!)).toEqual([3, 2]);
    expect(gy(g)).toEqual(['not-dead-after-all', 'candy-grapple']);
  });

  it("returns under its owner's control even when the opponent controls it", () => {
    const g = game({
      p1: {
        hand: ['not-dead-after-all', 'candy-grapple'],
        battlefield: [...n('swamp', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'not-dead-after-all', targeting(lions));
    g.obj(lions).controller = 'p2';
    play(g, 'candy-grapple', targeting(lions));
    done(g);
    const back = board(g, 'savannah-lions');
    expect(back).toHaveLength(1);
    expect(g.obj(back[0]!).controller).toBe('p1');
    expect(g.obj(back[0]!).tapped).toBe(true);
  });

  it('only until end of turn', () => {
    const g = game({
      p1: {
        hand: ['not-dead-after-all', 'candy-grapple'],
        battlefield: [...n('swamp', 4), 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'not-dead-after-all', targeting(lions));
    passTo(g, 'main1', 'p2');
    passTo(g, 'main1', 'p1');
    play(g, 'candy-grapple', targeting(lions));
    expect(board(g, 'savannah-lions')).toHaveLength(0);
    expect(gy(g)).toContain('savannah-lions');
  });

  it('a token that dies does not come back and gets no Role', () => {
    const g = game({
      p1: {
        hand: ['not-dead-after-all', 'candy-grapple'],
        battlefield: [...n('swamp', 4), 'woe-rat-token'],
      },
    });
    const rat = g.id('p1', 'woe-rat-token');
    g.obj(rat).isToken = true;
    play(g, 'not-dead-after-all', targeting(rat));
    play(g, 'candy-grapple', targeting(rat));
    done(g);
    expect(rats(g)).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'woe-wicked-role')).toHaveLength(
      0,
    );
  });
});

describe('Rat Out, Sugar Rush, Taken by Nightmares', () => {
  it('Rat Out: up to one target creature gets -1/-1, and you create a Rat that can not block', () => {
    const g = game({
      p1: { hand: ['rat-out', 'rat-out'], battlefield: n('swamp', 2) },
      p2: { battlefield: ['llanowar-elves', 'serra-angel'] },
    });
    const elves = g.id('p2', 'llanowar-elves');
    play(g, 'rat-out', targeting(elves));
    expect(gy(g, 'p2')).toEqual(['llanowar-elves']);
    expect(rats(g)).toHaveLength(1);
    expect(pt(g, rats(g)[0]!)).toEqual([1, 1]);
    // Without a target.
    play(g, 'rat-out', (a) => a.targets.length === 0);
    expect(rats(g)).toHaveLength(2);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
    expect(cardDb.get('woe-rat-token')!.abilities).toEqual([
      { kind: 'static', effect: { kind: 'cantBlock' } },
    ]);
  });

  it('Sugar Rush: +3/+0 and draw a card', () => {
    const g = game({
      p1: { hand: ['sugar-rush'], battlefield: [...n('swamp', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    play(g, 'sugar-rush', targeting(lions));
    expect(pt(g, lions)).toEqual([5, 1]);
    expect(hand(g)).toEqual(['forest']);
  });

  it('Taken by Nightmares: exiles a creature; scry 2 only if you control an enchantment', () => {
    const g = game({
      p1: { hand: ['taken-by-nightmares'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    play(g, 'taken-by-nightmares', targeting(angel));
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(g.events.some((e) => e.type === 'scried')).toBe(false);
    const h = game({
      p1: { hand: ['taken-by-nightmares'], battlefield: [...n('swamp', 4), 'hopeless-nightmare'] },
      p2: { battlefield: ['serra-angel'] },
    });
    h.do(casts(h, 'taken-by-nightmares').find(targeting(h.id('p2', 'serra-angel')))!);
    stop(h);
    expect(h.decision.kind).toBe('scry');
    done(h);
    expect(exile(h, 'p2')).toEqual(['serra-angel']);
  });

  it('Taken by Nightmares at instant speed; a Wicked Role counts as an enchantment you control', () => {
    const g = game({
      p1: {
        hand: ['conceited-witch', 'taken-by-nightmares'],
        battlefield: [...n('swamp', 5), 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    play(g, 'conceited-witch', (a) => !!a.back && targeting(g.id('p1', 'savannah-lions'))(a));
    expect(roles(g, g.id('p1', 'savannah-lions'))).toHaveLength(1);
    g.do(casts(g, 'taken-by-nightmares').find(targeting(g.id('p2', 'serra-angel')))!);
    stop(g);
    expect(g.decision.kind).toBe('scry');
    done(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    // An instant: castable on the opponent's turn too.
    const h = game({
      active: 'p2',
      p1: { hand: ['taken-by-nightmares'], battlefield: n('swamp', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    h.pass();
    expect(casts(h, 'taken-by-nightmares').length).toBeGreaterThan(0);
  });
});
