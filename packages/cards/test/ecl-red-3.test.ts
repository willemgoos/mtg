import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { ECL_GOBLIN } from '../src/ecl/tokens.ts';
import {
  activate,
  activations,
  casts,
  castsAt,
  done,
  exile,
  gy,
  hand,
  keywords,
  minus,
  passTo,
  toEndStep,
  tokens,
} from './ecl-red-helpers.ts';

// Lorwyn Eclipsed 18b: the red cards (continued).

/** Passes priority until the active player must declare attackers. */
function toAttackers(g: GameDriver): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
}

describe('Goliath Daydreamer', () => {
  it('exiles an instant you cast from your hand with a dream counter, and casts it free when it attacks', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain', 'goliath-daydreamer'] },
    });
    const dreamer = g.id('p1', 'goliath-daydreamer');
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(18);
    // Not in the graveyard: in exile with a dream counter.
    expect(gy(g)).toEqual([]);
    expect(exile(g)).toEqual(['shock']);
    const shock = g.state.players.p1.exile[0]!;
    expect(g.obj(shock).counters?.dream).toBe(1);
    // Attack: cast it without paying its mana cost.
    toAttackers(g);
    g.attack(dreamer);
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    g.do({ type: 'castSpell', player: 'p1', card: shock, targets: [{ player: 'p2' }], free: true });
    settle(g);
    expect(g.life('p2')).toBe(16);
    // A card cast from exile isn't exiled with a dream counter again: it goes to the graveyard.
    expect(gy(g)).toEqual(['shock']);
    expect(exile(g)).toEqual([]);
  });

  it('only watches instants and sorceries cast from your hand, and ignores creature spells', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'goliath-daydreamer'] },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(exile(g)).toEqual([]);
  });

  it('casting an exiled Cinder Strike for free may still blight it for 4 damage', () => {
    const g = game({
      p1: {
        hand: ['cinder-strike'],
        battlefield: ['mountain', 'goliath-daydreamer', 'serra-angel'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const dreamer = g.id('p1', 'goliath-daydreamer');
    const theirs = g.id('p2', 'serra-angel');
    g.do(castsAt(g, 'cinder-strike', theirs).find((a) => !a.blight)!);
    settle(g);
    expect(exile(g)).toEqual(['cinder-strike']);
    toAttackers(g);
    g.attack(dreamer);
    settle(g);
    expect(g.decision.kind).toBe('castFree');
    const free = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.blight === g.id('p1', 'serra-angel') &&
          a.targets.some((t) => 'object' in t && t.object.id === theirs),
      )!;
    expect(free).toBeDefined();
    g.do(free);
    settle(g);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });

  it('a countered spell goes to the graveyard, not exile', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain', 'goliath-daydreamer'] },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    // The Daydreamer's trigger resolves first; then the opponent counters the spell.
    g.passBoth();
    g.pass();
    const spell = g.state.stack.find((i) => i.kind === 'spell')!.id;
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'cancel', 'hand'),
      targets: [g.ref(spell)],
    });
    settle(g);
    expect(gy(g)).toEqual(['shock']);
    expect(exile(g)).toEqual([]);
  });
});

describe('Gristle Glutton', () => {
  it('blights, then discards a card and draws a card', () => {
    const g = game({
      p1: {
        hand: ['plains', 'island'],
        battlefield: ['gristle-glutton', 'serra-angel'],
        library: ['swamp', 'forest'],
      },
    });
    const act = activations(g, g.id('p1', 'gristle-glutton'), 0).find(
      (a) => a.blight === g.id('p1', 'serra-angel'),
    )!;
    g.do(act);
    settle(g);
    done(g);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(hand(g)).toHaveLength(2);
    expect(hand(g)).toContain('swamp');
  });

  it('draws nothing when there is no card to discard', () => {
    const g = game({
      p1: { battlefield: ['gristle-glutton', 'serra-angel'], library: ['swamp', 'forest'] },
    });
    const act = activations(g, g.id('p1', 'gristle-glutton'), 0)[0]!;
    g.do(act);
    settle(g);
    expect(hand(g)).toEqual([]);
  });
});

describe('Hexing Squelcher', () => {
  it('gives other creatures you control Ward—Pay 2 life, and has it itself', () => {
    const g = game({
      p1: { battlefield: ['hexing-squelcher', 'serra-angel'] },
      p2: { hand: ['shock', 'shock'], battlefield: n('mountain', 2) },
      active: 'p2',
    });
    expect(keywords(g, g.id('p1', 'serra-angel'))).toContain('wardPayTwoLife');
    expect(keywords(g, g.id('p1', 'hexing-squelcher'))).toContain('ward');
    expect(keywords(g, g.id('p2', 'mountain'))).not.toContain('wardPayTwoLife');
    // Shocking the angel costs the opponent 2 life.
    const shocks = castsAt(g, 'shock', g.id('p1', 'serra-angel'));
    expect(shocks.length).toBeGreaterThan(0);
    g.do(shocks[0]!);
    expect(g.life('p2')).toBe(18);
    settle(g);
    expect(g.obj(g.id('p1', 'serra-angel')).damage).toBe(2);
    // So does shocking the Squelcher itself.
    g.do(castsAt(g, 'shock', g.id('p1', 'hexing-squelcher'))[0]!);
    expect(g.life('p2')).toBe(16);
  });

  it('can’t be countered, and spells you control can’t be countered', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['hexing-squelcher', 'mountain'] },
      p2: { hand: ['cancel'], battlefield: n('island', 3) },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'cancel', 'hand'),
      targets: [g.ref(g.state.stack.find((i) => i.kind === 'spell')!.id)],
    });
    settle(g);
    // The Cancel resolved but didn't counter the Shock.
    expect(g.life('p2')).toBe(18);
    expect(gy(g, 'p2')).toEqual(['cancel']);
  });

  it('is itself uncounterable', () => {
    expect(cardDefUncounterable()).toBe(true);
  });
});

import { cardDb } from '../src/index.ts';
function cardDefUncounterable(): boolean {
  return !!cardDb.get('hexing-squelcher')?.uncounterable;
}

describe('Impolite Entrance', () => {
  it('gives trample and haste until end of turn and draws a card', () => {
    const g = game({
      p1: {
        hand: ['impolite-entrance'],
        battlefield: ['mountain', 'serra-angel'],
        library: ['swamp'],
      },
    });
    cast(g, 'impolite-entrance', [g.ref(g.id('p1', 'serra-angel'))]);
    settle(g);
    expect(keywords(g, g.id('p1', 'serra-angel'))).toEqual(
      expect.arrayContaining(['trample', 'haste']),
    );
    expect(hand(g)).toEqual(['swamp']);
  });
});

describe('Kindle the Inner Flame', () => {
  it('makes a hasty token copy of your creature that is sacrificed at the end step', () => {
    const g = game({
      p1: { hand: ['kindle-the-inner-flame'], battlefield: [...n('mountain', 4), 'serra-angel'] },
    });
    cast(g, 'kindle-the-inner-flame', [g.ref(g.id('p1', 'serra-angel'))]);
    settle(g);
    const copies = tokens(g, 'serra-angel');
    expect(copies).toHaveLength(1);
    expect(keywords(g, copies[0]!)).toContain('haste');
    toEndStep(g);
    settle(g);
    expect(tokens(g, 'serra-angel')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(1);
  });

  it('can be flashed back by beholding three Elementals', () => {
    const g = game({
      p1: {
        graveyard: ['kindle-the-inner-flame'],
        battlefield: [
          ...n('mountain', 2),
          'lavaleaper',
          'flamekin-gildweaver',
          'sizzling-changeling',
        ],
      },
    });
    const kindle = g.id('p1', 'kindle-the-inner-flame', 'graveyard');
    const flash = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === kindle && a.targets.length > 0)!;
    expect(flash).toBeDefined();
    g.do(flash);
    settle(g);
    expect(exile(g)).toEqual(['kindle-the-inner-flame']);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });

  it('can’t be flashed back with only two Elementals', () => {
    const g = game({
      p1: {
        graveyard: ['kindle-the-inner-flame'],
        battlefield: [...n('mountain', 2), 'lavaleaper', 'flamekin-gildweaver'],
      },
    });
    expect(
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' && a.card === g.id('p1', 'kindle-the-inner-flame', 'graveyard'),
        ),
    ).toBe(false);
  });
});

describe('Kulrath Zealot', () => {
  it('exiles the top card of your library when it enters; you may play it', () => {
    const g = game({
      p1: { hand: ['kulrath-zealot'], battlefield: n('mountain', 6), library: ['island', 'swamp'] },
    });
    cast(g, 'kulrath-zealot');
    settle(g);
    expect(exile(g)).toEqual(['island']);
    const card = g.state.players.p1.exile[0]!;
    expect(g.obj(card).playableUntilTurn).toBe(g.state.turn.number + 2);
  });

  it('has basic landcycling {1}{R}', () => {
    const g = game({
      p1: {
        hand: ['kulrath-zealot'],
        battlefield: n('mountain', 2),
        library: ['island', 'mountain', 'swamp'],
      },
    });
    activate(g, g.id('p1', 'kulrath-zealot', 'hand'), 1);
    settle(g);
    done(g);
    expect(hand(g)).toEqual(['island']);
    expect(gy(g)).toEqual(['kulrath-zealot']);
  });
});

describe('Lasting Tarfire', () => {
  it('deals 2 damage to each opponent at the end step if you put a counter on a creature this turn', () => {
    const g = game({
      p1: {
        hand: ['plains'],
        battlefield: ['lasting-tarfire', 'gristle-glutton', 'serra-angel'],
      },
    });
    g.do(
      activations(g, g.id('p1', 'gristle-glutton'), 0).find(
        (a) => a.blight === g.id('p1', 'serra-angel'),
      )!,
    );
    settle(g);
    done(g);
    toEndStep(g);
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('does nothing if you put no counter on a creature', () => {
    const g = game({ p1: { battlefield: ['lasting-tarfire', 'serra-angel'] } });
    toEndStep(g);
    settle(g);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Lavaleaper', () => {
  it('gives all creatures haste', () => {
    const g = game({
      p1: { battlefield: ['lavaleaper', 'serra-angel'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(keywords(g, g.id('p1', 'serra-angel'))).toContain('haste');
    expect(keywords(g, g.id('p2', 'savannah-lions'))).toContain('haste');
  });

  it('doubles the mana of basic lands, for every player', () => {
    const g = game({
      p1: { hand: ['flamekin-gildweaver'], battlefield: [...n('mountain', 2), 'lavaleaper'] },
    });
    // {3}{R} from two Mountains.
    expect(casts(g, 'flamekin-gildweaver').length).toBeGreaterThan(0);
    const without = game({
      p1: { hand: ['flamekin-gildweaver'], battlefield: n('mountain', 2) },
    });
    expect(casts(without, 'flamekin-gildweaver')).toHaveLength(0);
    // The opponent's Plains double as well: {3}{W}{W} from three Plains.
    const theirs = game({
      p1: { battlefield: ['lavaleaper'] },
      p2: { hand: ['serra-angel'], battlefield: n('plains', 3) },
      active: 'p2',
    });
    expect(casts(theirs, 'serra-angel').length).toBeGreaterThan(0);
    const alone = game({
      p2: { hand: ['serra-angel'], battlefield: n('plains', 3) },
      active: 'p2',
    });
    expect(casts(alone, 'serra-angel')).toHaveLength(0);
  });

  it('doesn’t double nonbasic lands', () => {
    const g = game({
      p1: {
        hand: ['flamekin-gildweaver'],
        battlefield: ['lavaleaper', 'mountain', 'rogues-passage'],
      },
    });
    expect(casts(g, 'flamekin-gildweaver')).toHaveLength(0);
  });
});

describe('Meek Attack', () => {
  it('puts a creature card with total power and toughness 5 or less onto the battlefield with haste, then sacrifices it', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'serra-angel'],
        battlefield: [...n('mountain', 2), 'meek-attack'],
      },
    });
    activate(g, g.id('p1', 'meek-attack'), 0);
    settle(g);
    // Only the Lions qualify (2 + 1); the Angel is 4/4.
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    settle(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(keywords(g, lions)).toContain('haste');
    toEndStep(g);
    settle(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
  });

  it('may decline', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: [...n('mountain', 2), 'meek-attack'] },
    });
    activate(g, g.id('p1', 'meek-attack'), 0);
    settle(g);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    settle(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    toEndStep(g);
    settle(g);
    expect(gy(g)).toEqual([]);
  });
});

describe('Reckless Ransacking', () => {
  it('gives +3/+2 and creates a Treasure', () => {
    const g = game({
      p1: {
        hand: ['reckless-ransacking'],
        battlefield: ['mountain', 'mountain', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'reckless-ransacking', [g.ref(lions)]);
    settle(g);
    expect(pt(g, lions)).toEqual([5, 3]);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });
});

describe('Scuzzback Scrounger', () => {
  it('at your first main phase, blights 1 to create a Treasure', () => {
    const g = game({ p1: { battlefield: ['scuzzback-scrounger', 'serra-angel'] } });
    passTo(g, 'main1', 'p1');
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'serra-angel') });
    settle(g);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(1);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });

  it('may decline', () => {
    const g = game({ p1: { battlefield: ['scuzzback-scrounger', 'serra-angel'] } });
    passTo(g, 'main1', 'p1');
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(0);
  });
});

describe('Sizzling Changeling', () => {
  it('when it dies, exiles the top card; you may play it until the end of your next turn', () => {
    const g = game({
      p1: { battlefield: ['sizzling-changeling'], library: ['swamp', 'forest'] },
      p2: { hand: ['tweeze'], battlefield: n('mountain', 3) },
    });
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'tweeze', 'hand'),
      targets: [g.ref(g.id('p1', 'sizzling-changeling'))],
    });
    settle(g);
    expect(gy(g)).toEqual(['sizzling-changeling']);
    expect(exile(g)).toEqual(['swamp']);
    expect(g.obj(g.state.players.p1.exile[0]!).playableUntilTurn).toBeGreaterThan(
      g.state.turn.number,
    );
  });
});

describe('Soul Immolation', () => {
  it('blights X and deals X damage to each opponent and each creature they control', () => {
    const g = game({
      p1: { hand: ['soul-immolation'], battlefield: [...n('mountain', 5), 'serra-angel'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = g.id('p1', 'serra-angel');
    const two = casts(g, 'soul-immolation').find((a) => a.x === 2 && a.blight === angel)!;
    g.do(two);
    settle(g);
    expect(minus(g, angel)).toBe(2);
    expect(g.life('p2')).toBe(18);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    // Your own creatures are not hit by the damage.
    expect(g.obj(angel).damage).toBe(0);
  });

  it('X can’t be greater than the greatest toughness among your creatures', () => {
    const g = game({
      p1: { hand: ['soul-immolation'], battlefield: [...n('mountain', 8), 'serra-angel'] },
    });
    const xs = casts(g, 'soul-immolation').map((a) => a.x ?? 0);
    expect(Math.max(...xs)).toBe(4);
  });
});

describe('Soulbright Seeker', () => {
  it('is cast beholding an Elemental, or paying {2} more', () => {
    const g = game({
      p1: { hand: ['soulbright-seeker'], battlefield: ['mountain', 'lavaleaper'] },
    });
    const withBehold = casts(g, 'soulbright-seeker');
    expect(withBehold.length).toBeGreaterThan(0);
    const poor = game({ p1: { hand: ['soulbright-seeker'], battlefield: ['mountain'] } });
    expect(casts(poor, 'soulbright-seeker')).toHaveLength(0);
    const pays = game({
      p1: { hand: ['soulbright-seeker'], battlefield: n('mountain', 3) },
    });
    expect(casts(pays, 'soulbright-seeker').length).toBeGreaterThan(0);
  });

  it('gives trample, and the third resolution in a turn adds {R}{R}{R}{R}', () => {
    const g = game({
      p1: { battlefield: [...n('mountain', 3), 'soulbright-seeker'] },
    });
    const seeker = g.id('p1', 'soulbright-seeker');
    for (let i = 1; i <= 3; i++) {
      activate(g, seeker, 0, [g.ref(seeker)]);
      settle(g);
      expect(g.state.players.p1.pool?.length ?? 0).toBe(i === 3 ? 4 : 0);
    }
    expect(keywords(g, seeker)).toContain('trample');
  });
});

describe('Sourbread Auntie', () => {
  it('may blight 2 to create two 1/1 Goblin tokens', () => {
    const g = game({
      p1: { hand: ['sourbread-auntie'], battlefield: [...n('mountain', 4), 'serra-angel'] },
    });
    cast(g, 'sourbread-auntie');
    settle(g);
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'serra-angel') });
    settle(g);
    expect(minus(g, g.id('p1', 'serra-angel'))).toBe(2);
    expect(tokens(g, ECL_GOBLIN)).toHaveLength(2);
  });

  it('may decline', () => {
    const g = game({ p1: { hand: ['sourbread-auntie'], battlefield: n('mountain', 4) } });
    cast(g, 'sourbread-auntie');
    settle(g);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    settle(g);
    expect(tokens(g, ECL_GOBLIN)).toHaveLength(0);
  });
});

describe('Spinerock Tyrant', () => {
  it('copies an instant or sorcery with a single target; both deal damage as -1/-1 counters', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['mountain', 'spinerock-tyrant'] },
      p2: { battlefield: ['brambleback-brute'] },
    });
    const brute = g.id('p2', 'brambleback-brute');
    g.do(castsAt(g, 'shock', brute)[0]!);
    g.passBoth();
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    if (g.decision.kind === 'chooseOption') g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    for (let i = 0; i < 6 && g.state.stack.length > 0; i++) g.passBoth();
    expect(minus(g, brute)).toBe(4);
    expect(g.obj(brute).damage).toBe(0);
  });

  it('doesn’t trigger for a spell with two targets, or a creature spell', () => {
    const g = game({
      p1: { hand: ['boulder-dash'], battlefield: [...n('mountain', 2), 'spinerock-tyrant'] },
    });
    cast(g, 'boulder-dash', [{ player: 'p2' }, g.ref(g.id('p1', 'spinerock-tyrant'))]);
    g.passBoth();
    expect(g.decision.kind).not.toBe('optionalEffect');
  });
});

describe('Squawkroaster', () => {
  it('has power equal to the number of colors among permanents you control', () => {
    const g = game({ p1: { battlefield: ['squawkroaster', 'serra-angel', 'mountain'] } });
    const sq = g.id('p1', 'squawkroaster');
    expect(pt(g, sq)).toEqual([2, 4]);
    expect(keywords(g, sq)).toContain('doubleStrike');
    const more = game({
      p1: { battlefield: ['squawkroaster', 'serra-angel', 'savannah-lions', 'hungry-ghoul'] },
    });
    expect(pt(more, more.id('p1', 'squawkroaster'))[0]).toBe(3);
  });
});

describe('Sting-Slinger', () => {
  it('blights 1 and deals 2 damage to each opponent', () => {
    const g = game({
      p1: { battlefield: [...n('mountain', 2), 'sting-slinger', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.do(activations(g, g.id('p1', 'sting-slinger'), 0).find((a) => a.blight === angel)!);
    settle(g);
    expect(g.life('p2')).toBe(18);
    expect(minus(g, angel)).toBe(1);
    expect(g.obj(g.id('p1', 'sting-slinger')).tapped).toBe(true);
  });
});

describe('Tweeze', () => {
  it('deals 3 damage to any target; you may discard a card to draw a card', () => {
    const g = game({
      p1: { hand: ['tweeze', 'plains'], battlefield: n('mountain', 3), library: ['swamp'] },
    });
    cast(g, 'tweeze', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(g.decision.kind).toBe('discard');
    g.do(g.legal().find((a) => a.type === 'discard')!);
    done(g);
    expect(hand(g)).toEqual(['swamp']);
    expect(gy(g)).toContain('plains');
  });

  it('can be declined', () => {
    const g = game({
      p1: { hand: ['tweeze', 'plains'], battlefield: n('mountain', 3), library: ['swamp'] },
    });
    cast(g, 'tweeze', [{ player: 'p2' }]);
    settle(g);
    const stop = g.legal().find((a) => a.type === 'chooseEffect');
    expect(stop).toBeDefined();
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(hand(g)).toEqual(['plains']);
  });
});

describe('Warren Torchmaster', () => {
  it('at the beginning of combat, may blight 1; when you do, a creature gains haste', () => {
    const g = game({
      p1: { battlefield: ['warren-torchmaster', 'serra-angel'] },
      step: 'main1',
    });
    const angel = g.id('p1', 'serra-angel');
    g.passUntilStep('beginCombat');
    expect(g.decision.kind).toBe('priority');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: angel });
    expect(minus(g, angel)).toBe(1);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === angel),
        )!,
    );
    settle(g);
    expect(keywords(g, angel)).toContain('haste');
  });
});
