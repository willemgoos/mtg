import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_WHITE_MAIN } from '../src/ltr/white-main.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { casts, done, keywords, obj, toStep } from './hob-white-helpers.ts';
import { attack, canUse, ringOf, tokensOf, toBlockers, use } from './ltr-white-helpers.ts';

// Lord of the Rings 22: the white main-set commons and uncommons outside the Jumpstart packets.

describe('the white main-set group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_WHITE_MAIN)).toHaveLength(8);
    for (const name of Object.keys(LTR_WHITE_MAIN)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Dúnedain Blade', () => {
  it('equips a Human for {1} and anything else for {3}', () => {
    const g = game({
      p1: { battlefield: ['d-nedain-blade', 'savannah-lions', 'protector-of-gondor', 'plains'] },
    });
    const blade = g.id('p1', 'd-nedain-blade');
    // One land: only the Human can be equipped.
    expect(canUse(g, blade, 2)).toBe(false);
    use(g, blade, 1, [g.id('p1', 'protector-of-gondor')]);
    done(g);
    expect(pt(g, g.id('p1', 'protector-of-gondor'))).toEqual([5, 4]);
  });
  it("can't use Equip Human on a non-Human", () => {
    const g = game({
      p1: { battlefield: ['d-nedain-blade', 'savannah-lions', ...n('plains', 3)] },
    });
    const blade = g.id('p1', 'd-nedain-blade');
    expect(() => use(g, blade, 1, [g.id('p1', 'savannah-lions')])).toThrow();
    use(g, blade, 2, [g.id('p1', 'savannah-lions')]);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([4, 2]);
  });
});

describe('Eagles of the North', () => {
  it('gives your creatures +1/+0 and first strike as it enters', () => {
    const g = game({
      p1: { hand: ['eagles-of-the-north'], battlefield: ['savannah-lions', ...n('plains', 6)] },
    });
    cast(g, 'eagles-of-the-north');
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 1]);
    expect(keywords(g, lions)).toContain('firstStrike');
  });
});

describe('Now for Wrath, Now for Ruin!', () => {
  it('puts a counter on each of your creatures, gives them vigilance and tempts you', () => {
    const g = game({
      p1: {
        hand: ['now-for-wrath-now-for-ruin'],
        battlefield: ['savannah-lions', ...n('plains', 4)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'now-for-wrath-now-for-ruin');
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(pt(g, lions)).toEqual([3, 2]);
    expect(keywords(g, lions)).toContain('vigilance');
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([4, 4]);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Protector of Gondor', () => {
  it('makes a Human Soldier', () => {
    const g = game({ p1: { hand: ['protector-of-gondor'], battlefield: n('plains', 4) } });
    cast(g, 'protector-of-gondor');
    done(g);
    expect(tokensOf(g, 'hob-human-soldier-token')).toHaveLength(1);
  });
});

describe('Stalwarts of Osgiliath', () => {
  it('tempts you as it enters', () => {
    const g = game({ p1: { hand: ['stalwarts-of-osgiliath'], battlefield: n('plains', 5) } });
    cast(g, 'stalwarts-of-osgiliath');
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Tale of Tinúviel', () => {
  it('I: indestructible while you control it; II: returns a creature card', () => {
    const g = game({
      p1: {
        hand: ['tale-of-tin-viel'],
        graveyard: ['serra-angel'],
        battlefield: ['savannah-lions', ...n('plains', 5)],
        library: n('plains', 5),
      },
      p2: { library: n('plains', 5) },
    });
    cast(g, 'tale-of-tin-viel');
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, lions)).toContain('indestructible');
    // Still indestructible next turn (the effect lasts as long as you control the Saga).
    toStep(g, 'main1', 'p2');
    expect(keywords(g, lions)).toContain('indestructible');
    toStep(g, 'main1', 'p1');
    done(g);
    expect(g.zoneOf(g.id('p1', 'serra-angel'))).toBe('battlefield');
  });
});

describe('Westfold Rider', () => {
  it('sacrifices itself to destroy an artifact, as a sorcery', () => {
    const g = game({
      p1: { battlefield: ['westfold-rider'] },
      p2: { battlefield: ['d-nedain-blade'] },
    });
    use(g, g.id('p1', 'westfold-rider'), 0, [g.id('p2', 'd-nedain-blade')]);
    done(g);
    expect(g.state.battlefield).toHaveLength(0);
  });
});

describe('You Cannot Pass!', () => {
  it('destroys a creature that blocked a legendary creature this turn, and only that', () => {
    const g = game({
      p1: {
        hand: ['you-cannot-pass'],
        battlefield: ['gimli-counter-of-kills', 'savannah-lions', 'plains'],
      },
      p2: { battlefield: ['aegis-turtle', 'savannah-lions'] },
    });
    expect(casts(g, 'you-cannot-pass')).toHaveLength(0);
    const gimli = g.id('p1', 'gimli-counter-of-kills');
    const lions = g.id('p1', 'savannah-lions');
    attack(g, [gimli, lions]);
    toBlockers(g);
    const maw = g.id('p2', 'aegis-turtle');
    g.do({ type: 'addBlock', player: 'p2', blocker: maw, attacker: gimli });
    g.do({
      type: 'addBlock',
      player: 'p2',
      blocker: g.id('p2', 'savannah-lions'),
      attacker: lions,
    });
    g.do({ type: 'confirmBlockers', player: 'p2' });
    toStep(g, 'main2', 'p1');
    const legal = casts(g, 'you-cannot-pass');
    // Gimli was blocked by a non-legendary creature, so only Aegis Turtle can be targeted.
    expect(legal).toHaveLength(1);
    cast(g, 'you-cannot-pass', [obj(g, maw)]);
    done(g);
    expect(g.zoneOf(maw)).toBe('graveyard');
  });
});
