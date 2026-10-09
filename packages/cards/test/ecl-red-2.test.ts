import { describe, expect, it } from 'vitest';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { ECL_GOBLIN } from '../src/ecl/tokens.ts';
import {
  activate,
  activations,
  casts,
  done,
  exile,
  gy,
  hand,
  keywords,
  tokens,
} from './ecl-red-helpers.ts';

// Lorwyn Eclipsed 18b: the red cards (continued).

describe('Champion of the Path', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['champion-of-the-path', 'flamekin-gildweaver'],
        battlefield: [...n('mountain', 8), 'lavaleaper'],
      },
      p2: {},
    });

  it('exiles an Elemental as an additional cost, hits for the power of another Elemental that enters, and gives the card back', () => {
    const g = setup();
    // The Lavaleaper (a permanent) or the Gildweaver (in hand): one way each.
    const options = casts(g, 'champion-of-the-path');
    expect(options.length).toBe(2);
    g.do(options.find((a) => a.beholdCard === g.id('p1', 'lavaleaper'))!);
    settle(g);
    const champ = g.id('p1', 'champion-of-the-path');
    expect(g.zoneOf(champ)).toBe('battlefield');
    expect(exile(g)).toEqual(['lavaleaper']);
    // Another Elemental enters: damage equal to its power (4) to each opponent. The Lavaleaper is gone, so no
    // extra mana: four mountains pay for the Gildweaver's {3}{R}.
    cast(g, 'flamekin-gildweaver');
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('returns the exiled card to its owner’s hand when it leaves the battlefield', () => {
    const o = game({
      p1: { hand: ['champion-of-the-path'], battlefield: [...n('mountain', 4), 'lavaleaper'] },
      p2: { hand: ['tweeze'], battlefield: n('mountain', 3) },
    });
    o.do(casts(o, 'champion-of-the-path')[0]!);
    settle(o);
    expect(exile(o)).toEqual(['lavaleaper']);
    o.pass();
    expect(o.actor).toBe('p2');
    o.do({
      type: 'castSpell',
      player: 'p2',
      card: o.id('p2', 'tweeze', 'hand'),
      targets: [o.ref(o.id('p1', 'champion-of-the-path'))],
    });
    settle(o);
    expect(gy(o)).toEqual(['champion-of-the-path']);
    expect(hand(o)).toEqual(['lavaleaper']);
    expect(exile(o)).toEqual([]);
  });

  it('a changeling is an Elemental too', () => {
    const g = game({
      p1: {
        hand: ['sizzling-changeling'],
        battlefield: [...n('mountain', 3), 'champion-of-the-path'],
      },
    });
    cast(g, 'sizzling-changeling');
    settle(g);
    expect(g.life('p2')).toBe(17);
  });
});

describe('Collective Inferno', () => {
  it('doubles damage from sources you control of the chosen type, and only those', () => {
    const g = game({
      p1: {
        hand: ['collective-inferno'],
        battlefield: [...n('mountain', 7), 'sting-slinger', 'serra-angel'],
      },
    });
    cast(g, 'collective-inferno');
    // Choose the Goblin type.
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    done(g, { option: /^Goblin$/ });
    expect(g.state.stack).toHaveLength(0);
    const slinger = g.id('p1', 'sting-slinger');
    // Sting-Slinger: {1}{R}, {T}, Blight 1: 2 damage to each opponent, doubled to 4.
    const act = activations(g, slinger, 0).find((a) => a.blight === g.id('p1', 'serra-angel'))!;
    g.do(act);
    settle(g);
    expect(g.life('p2')).toBe(16);
  });

  it('does not double damage from other types', () => {
    const g = game({
      p1: {
        hand: ['collective-inferno', 'shock'],
        battlefield: [...n('mountain', 6), 'serra-angel'],
      },
    });
    cast(g, 'collective-inferno');
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    done(g, { option: /^Goblin$/ });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('can be cast with convoke', () => {
    const g = game({
      p1: {
        hand: ['collective-inferno'],
        battlefield: [...n('mountain', 2), 'serra-angel', 'savannah-lions', 'sting-slinger'],
      },
    });
    expect(casts(g, 'collective-inferno').length).toBeGreaterThan(0);
  });
});

describe('Elder Auntie', () => {
  it('creates a 1/1 black and red Goblin token when it enters', () => {
    const g = game({ p1: { hand: ['elder-auntie'], battlefield: n('mountain', 3) } });
    cast(g, 'elder-auntie');
    settle(g);
    expect(tokens(g, ECL_GOBLIN)).toHaveLength(1);
    expect(pt(g, tokens(g, ECL_GOBLIN)[0]!)).toEqual([1, 1]);
  });
});

describe('End-Blaze Epiphany', () => {
  it('when the creature dies this turn, exiles cards equal to its power and lets you play one of them', () => {
    const g = game({
      p1: {
        hand: ['end-blaze-epiphany'],
        battlefield: n('mountain', 4),
        library: ['island', 'plains', 'swamp', 'forest', 'forest'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'end-blaze-epiphany', [g.ref(g.id('p2', 'savannah-lions'))], { x: 2 });
    settle(g);
    expect(gy(g, 'p2')).toEqual(['savannah-lions']);
    // Two cards exiled; choose one (the first), which can be played until the end of your next turn.
    expect(g.decision.kind).toBe('pickExiled');
    expect(exile(g)).toEqual(['island', 'plains']);
    const pick = g.legal().find((a) => a.type === 'chooseCard' && a.card)!;
    g.do(pick);
    const chosen = (pick as { card: string }).card;
    expect(g.obj(chosen).playableUntilTurn).toBe(g.state.turn.number + 2);
  });

  it('uses the power the creature had when it died', () => {
    const g = game({
      p1: {
        hand: ['end-blaze-epiphany', 'reckless-ransacking'],
        battlefield: n('mountain', 10),
        library: ['island', 'plains', 'swamp', 'forest', 'forest', 'forest'],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'reckless-ransacking', [g.ref(lions)]);
    settle(g);
    cast(g, 'end-blaze-epiphany', [g.ref(lions)], { x: 5 });
    settle(g);
    // A 5/3 when it died: five cards are exiled.
    expect(exile(g)).toHaveLength(5);
  });

  it('does nothing extra if the creature survives', () => {
    const g = game({
      p1: { hand: ['end-blaze-epiphany'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'end-blaze-epiphany', [g.ref(g.id('p2', 'serra-angel'))], { x: 2 });
    settle(g);
    expect(exile(g)).toEqual([]);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Enraged Flamecaster', () => {
  it('deals 2 damage to each opponent whenever you cast a spell with mana value 4 or greater', () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'savannah-lions'],
        battlefield: [...n('plains', 6), 'enraged-flamecaster'],
      },
    });
    cast(g, 'savannah-lions');
    settle(g);
    expect(g.life('p2')).toBe(20);
    cast(g, 'serra-angel');
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});

describe('Explosive Prodigy', () => {
  it('deals X damage to a creature an opponent controls, X being the colors among permanents you control', () => {
    const g = game({
      p1: { hand: ['explosive-prodigy'], battlefield: [...n('mountain', 2), 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'explosive-prodigy');
    settle(g);
    // Red (the Prodigy) and white (Serra Angel): 2 damage.
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });
});

describe('Feed the Flames', () => {
  it('deals 5 damage; the creature is exiled instead of dying', () => {
    const g = game({
      p1: { hand: ['feed-the-flames'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'feed-the-flames', [g.ref(g.id('p2', 'serra-angel'))]);
    settle(g);
    expect(gy(g, 'p2')).toEqual([]);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Flame-Chain Mauler', () => {
  it('gets +1/+0 and menace until end of turn', () => {
    const g = game({ p1: { battlefield: [...n('mountain', 2), 'flame-chain-mauler'] } });
    const m = g.id('p1', 'flame-chain-mauler');
    activate(g, m, 0);
    settle(g);
    expect(pt(g, m)).toEqual([3, 2]);
    expect(keywords(g, m)).toContain('menace');
  });
});

describe('Flamebraider', () => {
  it('taps for two mana of any colors, for Elemental spells', () => {
    const g = game({
      p1: { hand: ['sizzling-changeling'], battlefield: ['mountain', 'flamebraider'] },
    });
    // {2}{R}: the Mountain and two mana from the Flamebraider.
    expect(casts(g, 'sizzling-changeling').length).toBeGreaterThan(0);
  });

  it('can’t pay for a spell that isn’t an Elemental', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['flamebraider'] },
    });
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
  });

  it('pays for abilities of Elemental sources, but not of other sources', () => {
    const g = game({
      p1: { battlefield: ['flamebraider', 'flame-chain-mauler', 'gristle-glutton'] },
    });
    expect(activations(g, g.id('p1', 'flame-chain-mauler'), 0).length).toBeGreaterThan(0);
    const other = game({ p1: { battlefield: ['flamebraider', 'brambleback-brute'] } });
    other.obj(other.id('p1', 'brambleback-brute')).counters = { '-1/-1': 2 };
    expect(activations(other, other.id('p1', 'brambleback-brute'), 0)).toHaveLength(0);
  });

  it('a changeling spell is an Elemental spell', () => {
    const g = game({
      p1: { hand: ['sizzling-changeling'], battlefield: ['mountain', 'flamebraider'] },
    });
    done(cast(g, 'sizzling-changeling'));
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'sizzling-changeling')).toBe(true);
  });
});

describe('Flamekin Gildweaver', () => {
  it('creates a Treasure when it enters', () => {
    const g = game({ p1: { hand: ['flamekin-gildweaver'], battlefield: n('mountain', 4) } });
    cast(g, 'flamekin-gildweaver');
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });
});

describe('Giantfall', () => {
  it('has your creature deal damage equal to its power to a creature an opponent controls', () => {
    const g = game({
      p1: { hand: ['giantfall'], battlefield: [...n('mountain', 2), 'serra-angel'] },
      p2: { battlefield: ['hungry-ghoul'] },
    });
    const ghoul = g.id('p2', 'hungry-ghoul');
    const act = casts(g, 'giantfall').find(
      (a) =>
        a.mode === 0 &&
        a.targets.length === 2 &&
        'object' in a.targets[1]! &&
        a.targets[1].object.id === ghoul,
    )!;
    g.do(act);
    settle(g);
    expect(gy(g, 'p2')).toEqual(['hungry-ghoul']);
  });

  it('or destroys an artifact', () => {
    const g = game({
      p1: { hand: ['giantfall'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['treasure-token'] },
    });
    const act = casts(g, 'giantfall').find((a) => a.mode === 1)!;
    g.do(act);
    settle(g);
    expect(tokens(g, 'treasure-token', 'p2')).toHaveLength(0);
  });
});

describe('Goatnap', () => {
  it('steals a creature until end of turn, untapped and hasty', () => {
    const g = game({
      p1: { hand: ['goatnap'], battlefield: n('mountain', 3) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'goatnap', [g.ref(angel)]);
    settle(g);
    expect(g.obj(angel).controller).toBe('p1');
    expect(g.obj(angel).tapped).toBe(false);
    expect(keywords(g, angel)).toContain('haste');
    expect(pt(g, angel)).toEqual([4, 4]);
  });

  it('gives a Goat +3/+0 (a changeling is one)', () => {
    const g = game({
      p1: { hand: ['goatnap'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['sizzling-changeling'] },
    });
    const c = g.id('p2', 'sizzling-changeling');
    cast(g, 'goatnap', [g.ref(c)]);
    settle(g);
    expect(pt(g, c)).toEqual([6, 2]);
  });
});
