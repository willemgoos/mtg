import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_BLUE_MAIN } from '../src/ltr/blue-main.ts';
import { cast, game, handSize, n, pt } from './blb-helpers.ts';
import { casts, done, names, obj, toStep } from './hob-white-helpers.ts';
import { type Game, ringOf, tokensOf } from './ltr-white-helpers.ts';

/** Resolves everything, keeping scried cards on top. */
function finish(g: Game): void {
  for (let i = 0; i < 10; i++) {
    done(g);
    const d = g.decision;
    if (d.kind !== 'scry') return;
    g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
  }
}

// Lord of the Rings 22: the blue main-set commons and uncommons outside the Jumpstart packets.

describe('the blue main-set group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_BLUE_MAIN)).toHaveLength(10);
    for (const name of Object.keys(LTR_BLUE_MAIN)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Birthday Escape', () => {
  it('draws a card and tempts you', () => {
    const g = game({
      p1: { hand: ['birthday-escape'], battlefield: ['island'], library: n('island', 3) },
    });
    cast(g, 'birthday-escape');
    done(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Deceive the Messenger', () => {
  it('gives -3/-0 and amasses Orcs 1', () => {
    const g = game({
      p1: { hand: ['deceive-the-messenger'], battlefield: ['island'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'deceive-the-messenger', [obj(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 4]);
    const army = tokensOf(g, 'ltr-orc-army-token');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
  });
});

describe('Dreadful as the Storm', () => {
  it('makes a creature a 5/5 and tempts you', () => {
    const g = game({
      p1: { hand: ['dreadful-as-the-storm'], battlefield: ['savannah-lions', ...n('island', 3)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'dreadful-as-the-storm', [obj(g, lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([5, 5]);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Gandalf, Friend of the Shire', () => {
  it('lets you cast sorceries at instant speed', () => {
    const g = game({
      p1: {
        hand: ['birthday-escape'],
        battlefield: ['gandalf-friend-of-the-shire', 'island'],
        library: n('island', 3),
      },
      p2: { library: n('island', 3) },
    });
    toStep(g, 'upkeep', 'p2');
    // p2 passes priority to p1.
    g.pass();
    expect(casts(g, 'birthday-escape').length).toBeGreaterThan(0);
  });
  it('draws when the Ring tempts you and another creature becomes the Ring-bearer', () => {
    const g = game({
      p1: {
        hand: ['birthday-escape'],
        battlefield: ['gandalf-friend-of-the-shire', 'savannah-lions', 'island'],
        library: n('island', 3),
      },
    });
    cast(g, 'birthday-escape');
    done(g, { card: 'savannah-lions' });
    // Birthday Escape's draw plus Gandalf's.
    expect(handSize(g, 'p1')).toBe(2);
  });
});

describe('Grey Havens Navigator', () => {
  it('scries 1 as it enters', () => {
    const g = game({
      p1: { hand: ['grey-havens-navigator'], battlefield: n('island', 3), library: n('island', 3) },
    });
    cast(g, 'grey-havens-navigator');
    finish(g);
    expect(g.state.battlefield.map((id) => g.obj(id).defId)).toContain('grey-havens-navigator');
  });
});

describe('Hithlain Knots', () => {
  it('taps a creature and draws', () => {
    const g = game({
      p1: { hand: ['hithlain-knots'], battlefield: n('island', 2), library: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'hithlain-knots', [obj(g, g.id('p2', 'serra-angel'))]);
    finish(g);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(true);
    expect(handSize(g, 'p1')).toBe(1);
  });
});

describe('Soothing of Sméagol', () => {
  it('bounces a nontoken creature and tempts you', () => {
    const g = game({
      p1: { hand: ['soothing-of-sm-agol'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'soothing-of-sm-agol', [obj(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(names(g, 'p2', 'hand')).toEqual(['serra-angel']);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Stern Scolding', () => {
  it('counters a creature spell with power or toughness 2 or less, not a bigger one', () => {
    const g = game({
      p1: { hand: ['savannah-lions', 'serra-angel'], battlefield: n('plains', 6) },
      p2: { hand: ['stern-scolding'], battlefield: ['island'] },
    });
    cast(g, 'serra-angel');
    g.pass();
    expect(casts(g, 'stern-scolding')).toHaveLength(0);
    done(g);
    cast(g, 'savannah-lions');
    g.pass();
    expect(casts(g, 'stern-scolding')).toHaveLength(1);
    cast(g, 'stern-scolding', [obj(g, g.id('p1', 'savannah-lions', 'stack'))]);
    done(g);
    expect(names(g, 'p1', 'graveyard')).toEqual(['savannah-lions']);
  });
});

describe('Surrounded by Orcs', () => {
  it("amasses Orcs 3, then mills the target player by the Army's power", () => {
    const g = game({
      p1: { hand: ['surrounded-by-orcs'], battlefield: n('island', 4) },
      p2: { library: n('island', 6) },
    });
    cast(g, 'surrounded-by-orcs', [{ player: 'p2' }]);
    done(g);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token')[0]!)).toEqual([3, 3]);
    expect(g.state.players.p2.graveyard).toHaveLength(3);
  });
});

describe('Treason of Isengard', () => {
  it('puts an instant from your graveyard on top and amasses Orcs 2', () => {
    const g = game({
      p1: {
        hand: ['treason-of-isengard'],
        graveyard: ['hithlain-knots'],
        battlefield: n('island', 3),
        library: n('island', 2),
      },
    });
    cast(g, 'treason-of-isengard', [obj(g, g.id('p1', 'hithlain-knots', 'graveyard'))]);
    done(g);
    const lib = g.state.players.p1.library;
    expect(g.obj(lib[0]!).defId).toBe('hithlain-knots');
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token')[0]!)).toEqual([2, 2]);
  });
});
