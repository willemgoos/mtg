import { describe, expect, it } from 'vitest';
import {
  BEHAVIORS,
  cardDb,
  deckById,
  deckIds,
  isPlayable,
  LORD_OF_THE_RINGS_DECKS,
} from '../src/index.ts';
import { LTR_STARTER_KIT } from '../src/ltr/starter-kit.ts';
import { cast, game, handSize, n, pt } from './blb-helpers.ts';
import { done, keywords, names, obj, toStep } from './hob-white-helpers.ts';
import { attack, type Game, tokensOf, toBlockers, use } from './ltr-white-helpers.ts';

// Lord of the Rings Starter Kit (22): its cards the pool didn't have, and its two decks.

/** Answers the next option prompt for `player` with the option whose label matches. */
function choose(g: Game, label: RegExp): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'chooseOption'; i++) {
    if (g.decision.kind === 'chooseTriggerTargets') done(g);
    else g.pass();
  }
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`no prompt for ${label}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0)
    throw new Error(`no option ${label}: ${d.options.map((o) => o.label).join(' / ')}`);
  g.do({ type: 'chooseOption', player: d.player, index });
}

describe('the Starter Kit cards and decks are registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_STARTER_KIT)).toHaveLength(13);
    for (const name of Object.keys(LTR_STARTER_KIT)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
  it('has both 60-card decks, playable', () => {
    for (const id of ['ltr-fellowship-of-the-ring', 'ltr-might-of-mordor']) {
      const d = deckById(id);
      expect(deckIds(d), id).toHaveLength(60);
      expect(isPlayable(d), id).toBe(true);
      expect(LORD_OF_THE_RINGS_DECKS).toContain(d);
    }
  });
});

describe('Aragorn and Arwen, Wed', () => {
  it('puts a counter on each other creature and gains a life for each as it enters', () => {
    const g = game({
      p1: {
        hand: ['aragorn-and-arwen-wed'],
        battlefield: ['savannah-lions', 'knight-of-the-keep', ...n('forest', 3), ...n('plains', 3)],
      },
    });
    cast(g, 'aragorn-and-arwen-wed');
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'knight-of-the-keep'))).toEqual([4, 3]);
    expect(pt(g, g.id('p1', 'aragorn-and-arwen-wed'))).toEqual([3, 6]);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Frodo, Determined Hero', () => {
  it('attaches an Equipment with mana value 2 or 3 as he enters', () => {
    const g = game({
      p1: { hand: ['frodo-determined-hero'], battlefield: ['d-nedain-blade', 'plains', 'plains'] },
    });
    cast(g, 'frodo-determined-hero');
    done(g);
    expect(pt(g, g.id('p1', 'frodo-determined-hero'))).toEqual([4, 3]);
  });
  it('takes no damage during your turn, and does on the opponent’s', () => {
    const g = game({
      p1: {
        hand: ['rangers-firebrand'],
        battlefield: ['frodo-determined-hero', 'mountain'],
        library: n('mountain', 3),
      },
      p2: { hand: ['rangers-firebrand'], battlefield: ['mountain'], library: n('mountain', 3) },
    });
    const frodo = g.id('p1', 'frodo-determined-hero');
    cast(g, 'rangers-firebrand', [obj(g, frodo)]);
    done(g);
    expect(g.zoneOf(frodo)).toBe('battlefield');
    toStep(g, 'main1', 'p2');
    cast(g, 'rangers-firebrand', [obj(g, frodo)]);
    done(g);
    expect(g.zoneOf(frodo)).toBe('graveyard');
  });
});

describe('Gandalf, White Rider', () => {
  it('pumps your team and scries whenever you cast a spell', () => {
    const g = game({
      p1: {
        hand: ['rangers-firebrand'],
        battlefield: ['gandalf-white-rider', 'savannah-lions', 'mountain'],
        library: n('mountain', 3),
      },
    });
    cast(g, 'rangers-firebrand', [{ player: 'p2' }]);
    for (let i = 0; i < 10; i++) {
      done(g);
      const d = g.decision;
      if (d.kind !== 'scry') break;
      g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    }
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 1]);
  });
  it('may go fifth from the top of your library when it dies', () => {
    const g = game({
      p1: { battlefield: ['gandalf-white-rider'], library: n('plains', 6) },
      p2: { hand: ['rangers-firebrand', 'rangers-firebrand'], battlefield: n('mountain', 2) },
    });
    toStep(g, 'main1', 'p2');
    const gandalf = g.id('p1', 'gandalf-white-rider');
    cast(g, 'rangers-firebrand', [obj(g, gandalf)]);
    done(g);
    cast(g, 'rangers-firebrand', [obj(g, gandalf)]);
    done(g);
    const lib = g.state.players.p1.library;
    expect(g.obj(lib[4]!).defId).toBe('gandalf-white-rider');
  });
});

describe('Galadriel, Gift-Giver', () => {
  it('makes a Treasure (or a Food, or a counter) as she enters', () => {
    const g = game({ p1: { hand: ['galadriel-gift-giver'], battlefield: n('forest', 5) } });
    cast(g, 'galadriel-gift-giver');
    for (let i = 0; i < 10 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    const treasure = g.legal().find((a) => a.type === 'chooseTargets' && a.mode === 2);
    g.do(treasure!);
    done(g);
    expect(tokensOf(g, 'treasure-token')).toHaveLength(1);
  });
});

describe("Bilbo's Ring", () => {
  it('equips a Halfling for {1}; on your turn it has hexproof and can’t be blocked, and alone it draws', () => {
    const g = game({
      p1: { battlefield: ['bilbos-ring', 'frodo-baggins', 'plains'], library: n('plains', 3) },
      p2: { battlefield: ['aegis-turtle'] },
    });
    const frodo = g.id('p1', 'frodo-baggins');
    use(g, g.id('p1', 'bilbos-ring'), 2, [frodo]);
    done(g);
    expect(keywords(g, frodo)).toContain('hexproof');
    attack(g, [frodo]);
    done(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.life('p1')).toBe(19);
    toBlockers(g);
    expect(g.legal().some((a) => a.type === 'addBlock')).toBe(false);
  });
});

describe('Gollum, Scheming Guide', () => {
  const setup = () => {
    const g = game({
      p1: {
        battlefield: ['gollum-scheming-guide'],
        library: ['plains', 'savannah-lions', 'plains'],
      },
      p2: { battlefield: ['aegis-turtle'] },
    });
    const gollum = g.id('p1', 'gollum-scheming-guide');
    attack(g, [gollum]);
    // Keep the order: Plains on top. Choose "land".
    choose(g, /^Plains on top/);
    choose(g, /^Land$/);
    return { g, gollum };
  };
  it('a right guess removes him from combat', () => {
    const { g, gollum } = setup();
    choose(g, /^Yes/);
    done(g);
    expect(g.state.combat?.attackers.some((a) => a.id === gollum)).toBe(false);
    expect(handSize(g, 'p1')).toBe(0);
  });
  it('a wrong guess draws a card and he can’t be blocked', () => {
    const { g } = setup();
    choose(g, /^No/);
    done(g);
    expect(handSize(g, 'p1')).toBe(1);
    toBlockers(g);
    expect(g.legal().some((a) => a.type === 'addBlock')).toBe(false);
  });
});

describe('Witch-king, Bringer of Ruin', () => {
  it('makes the defending player sacrifice their creature with the least power', () => {
    const g = game({
      p1: { battlefield: ['witch-king-bringer-of-ruin'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    attack(g, [g.id('p1', 'witch-king-bringer-of-ruin')]);
    done(g);
    expect(names(g, 'p2', 'graveyard')).toEqual(['savannah-lions']);
  });
});

describe('The Balrog, Flame of Udûn', () => {
  it('goes to the bottom of its library when a legendary creature of the opponent’s dies', () => {
    const g = game({
      p1: {
        hand: ['rangers-firebrand'],
        battlefield: ['the-balrog-flame-of-ud-n', 'mountain'],
        library: n('mountain', 2),
      },
      p2: { battlefield: ['gollum-scheming-guide'] },
    });
    cast(g, 'rangers-firebrand', [obj(g, g.id('p2', 'gollum-scheming-guide'))]);
    done(g);
    const lib = g.state.players.p1.library;
    expect(g.obj(lib.at(-1)!).defId).toBe('the-balrog-flame-of-ud-n');
  });
});

describe('Sauron, the Lidless Eye', () => {
  it('steals a creature as he enters, and pumps the team while draining', () => {
    const g = game({
      p1: {
        hand: ['sauron-the-lidless-eye'],
        battlefield: [...n('swamp', 5), ...n('mountain', 5)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'sauron-the-lidless-eye');
    done(g);
    expect(g.obj(angel).controller).toBe('p1');
    expect(keywords(g, angel)).toContain('haste');
    use(g, g.id('p1', 'sauron-the-lidless-eye'), 1);
    done(g);
    expect(pt(g, angel)).toEqual([6, 4]);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Fires of Mount Doom', () => {
  it('deals 2 to a creature and destroys its Equipment as it enters', () => {
    const g = game({
      p1: { hand: ['fires-of-mount-doom'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['aegis-turtle', 'd-nedain-blade'] },
    });
    g.obj(g.id('p2', 'd-nedain-blade')).attachedTo = g.id('p2', 'aegis-turtle');
    cast(g, 'fires-of-mount-doom');
    done(g);
    expect(g.obj(g.id('p2', 'aegis-turtle')).damage).toBe(2);
    expect(names(g, 'p2', 'graveyard')).toEqual(['d-nedain-blade']);
  });
  it('exiles the top card to play this turn; playing it deals 2 to each player', () => {
    const g = game({
      p1: {
        battlefield: ['fires-of-mount-doom', ...n('mountain', 3)],
        library: ['mountain', 'mountain'],
      },
    });
    use(g, g.id('p1', 'fires-of-mount-doom'), 1);
    done(g);
    const exiled = g.state.players.p1.exile[0]!;
    g.do(g.legal().find((a) => a.type === 'playLand' && a.card === exiled)!);
    done(g);
    expect(g.life('p1')).toBe(18);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Graypelt Refuge', () => {
  it('enters tapped and gains 1 life', () => {
    const g = game({ p1: { hand: ['graypelt-refuge'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    done(g);
    expect(g.obj(g.id('p1', 'graypelt-refuge')).tapped).toBe(true);
    expect(g.life('p1')).toBe(21);
  });
});
