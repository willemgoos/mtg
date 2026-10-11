import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_BLACK_MAIN } from '../src/ltr/black-main.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { done, names, obj, toStep } from './hob-white-helpers.ts';
import { canUse, type Game, ringOf, tokensOf, use } from './ltr-white-helpers.ts';

// Lord of the Rings 22: the black main-set commons and uncommons outside the Jumpstart packets.

/** Resolves everything, keeping scried cards on top. */
function finish(g: Game): void {
  for (let i = 0; i < 10; i++) {
    done(g);
    const d = g.decision;
    if (d.kind !== 'scry') return;
    g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
  }
}

describe('the black main-set group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_BLACK_MAIN)).toHaveLength(7);
    for (const name of Object.keys(LTR_BLACK_MAIN)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('The Black Breath', () => {
  it("shrinks the opponent's creatures and tempts you", () => {
    const g = game({
      p1: { hand: ['the-black-breath'], battlefield: ['savannah-lions', ...n('swamp', 3)] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    cast(g, 'the-black-breath');
    done(g);
    expect(g.zoneOf(g.id('p2', 'savannah-lions', 'graveyard'))).toBe('graveyard');
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Haunt of the Dead Marshes', () => {
  it('returns from the graveyard tapped only while you control a legendary creature', () => {
    const without = game({
      p1: { graveyard: ['haunt-of-the-dead-marshes'], battlefield: n('swamp', 3) },
    });
    expect(canUse(without, without.id('p1', 'haunt-of-the-dead-marshes', 'graveyard'), 1)).toBe(
      false,
    );
    const g = game({
      p1: {
        graveyard: ['haunt-of-the-dead-marshes'],
        battlefield: ['gimli-counter-of-kills', ...n('swamp', 3)],
        library: n('swamp', 3),
      },
    });
    use(g, g.id('p1', 'haunt-of-the-dead-marshes', 'graveyard'), 1);
    finish(g);
    const haunt = g.id('p1', 'haunt-of-the-dead-marshes');
    expect(g.zoneOf(haunt)).toBe('battlefield');
    expect(g.obj(haunt).tapped).toBe(true);
  });
});

describe('Morgul-Knife Wound', () => {
  const setup = () => {
    const g = game({
      p1: { hand: ['morgul-knife-wound'], battlefield: n('swamp', 2), library: n('swamp', 5) },
      p2: { battlefield: ['serra-angel'], library: n('island', 5) },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'morgul-knife-wound', [obj(g, angel)]);
    done(g);
    return { g, angel };
  };
  it('gives -3/-0', () => {
    const { g, angel } = setup();
    expect(pt(g, angel)).toEqual([1, 4]);
  });
  it("makes the creature's controller pay 2 life at their upkeep, or exile it", () => {
    const { g, angel } = setup();
    for (let i = 0; i < 40 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    expect(g.decision.kind === 'chooseOption' && g.decision.player).toBe('p2');
    g.do({ type: 'chooseOption', player: 'p2', index: 0 });
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(angel)).toBe('battlefield');
  });
  it('exiles it if they decline', () => {
    const { g, angel } = setup();
    for (let i = 0; i < 40 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    g.do({ type: 'chooseOption', player: 'p2', index: 1 });
    expect(g.zoneOf(angel)).toBe('exile');
  });
});

describe('Oath of the Grey Host', () => {
  it('I: you and the opponent each get a Food; II: drain 3 and a Treasure; III: three Spirits', () => {
    const g = game({
      p1: { hand: ['oath-of-the-grey-host'], battlefield: n('swamp', 4), library: n('swamp', 5) },
      p2: { library: n('island', 5) },
    });
    cast(g, 'oath-of-the-grey-host');
    done(g);
    expect(tokensOf(g, 'food-token', 'p1')).toHaveLength(1);
    expect(tokensOf(g, 'food-token', 'p2')).toHaveLength(1);
    toStep(g, 'main1', 'p2');
    toStep(g, 'main1', 'p1');
    done(g);
    expect(g.life('p2')).toBe(17);
    expect(tokensOf(g, 'treasure-token', 'p1')).toHaveLength(1);
    toStep(g, 'main1', 'p2');
    toStep(g, 'main1', 'p1');
    done(g);
    const spirits = tokensOf(g, 'ltr-spirit-token', 'p1');
    expect(spirits).toHaveLength(3);
    expect(spirits.every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe('Snarling Warg', () => {
  it('gets +1/+0 while you control a Goblin or Orc', () => {
    const g = game({ p1: { battlefield: ['snarling-warg'] } });
    expect(pt(g, g.id('p1', 'snarling-warg'))).toEqual([3, 4]);
    const h = game({ p1: { battlefield: ['snarling-warg', 'ltr-orc-army-token'] } });
    expect(pt(h, h.id('p1', 'snarling-warg'))).toEqual([4, 4]);
  });
});

describe('The Torment of Gollum', () => {
  it('takes a nonland card from their hand and amasses Orcs 2', () => {
    const g = game({
      p1: { hand: ['the-torment-of-gollum'], battlefield: n('swamp', 4) },
      p2: { hand: ['island', 'serra-angel'] },
    });
    cast(g, 'the-torment-of-gollum', [{ player: 'p2' }]);
    done(g);
    expect(names(g, 'p2', 'graveyard')).toEqual(['serra-angel']);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token')[0]!)).toEqual([2, 2]);
  });
});

describe('Troll of Khazad-dûm', () => {
  it("can't be blocked by two creatures", () => {
    const g = game({
      p1: { battlefield: ['troll-of-khazad-d-m'] },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const troll = g.id('p1', 'troll-of-khazad-d-m');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.do({ type: 'addAttacker', player: 'p1', attacker: troll, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({
      type: 'addBlock',
      player: 'p2',
      blocker: g.id('p2', 'savannah-lions'),
      attacker: troll,
    });
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'serra-angel'), attacker: troll });
    expect(g.legal().some((a) => a.type === 'confirmBlockers')).toBe(false);
  });
});
