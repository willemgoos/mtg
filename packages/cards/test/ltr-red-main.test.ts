import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_RED_MAIN } from '../src/ltr/red-main.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { casts, done, keywords, obj, toStep } from './hob-white-helpers.ts';
import { attack, ringOf, settleOn, tokensOf, toBlockers } from './ltr-white-helpers.ts';

// Lord of the Rings 22: the red main-set commons and uncommons outside the Jumpstart packets.

describe('the red main-set group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_RED_MAIN)).toHaveLength(8);
    for (const name of Object.keys(LTR_RED_MAIN)) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Breaking of the Fellowship', () => {
  it('makes one of their creatures hit another of theirs, and tempts you', () => {
    const g = game({
      p1: { hand: ['breaking-of-the-fellowship'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'breaking-of-the-fellowship', [obj(g, angel), obj(g, lions)]);
    done(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(ringOf(g)?.tempted).toBe(1);
  });
});

describe('Cast into the Fire', () => {
  it('deals 1 damage to each of two creatures', () => {
    const g = game({
      p1: { hand: ['cast-into-the-fire'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['savannah-lions', 'savannah-lions'] },
    });
    const [a, b] = g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions');
    cast(g, 'cast-into-the-fire', [obj(g, a!), obj(g, b!)], { mode: 0 });
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(2);
  });
  it('exiles an artifact', () => {
    const g = game({
      p1: { hand: ['cast-into-the-fire'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['d-nedain-blade'] },
    });
    cast(g, 'cast-into-the-fire', [obj(g, g.id('p2', 'd-nedain-blade'))], { mode: 1 });
    done(g);
    expect(g.state.players.p2.exile).toHaveLength(1);
  });
});

describe('Fiery Inscription', () => {
  it('tempts you as it enters and deals 2 to each opponent whenever you cast an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['fiery-inscription', 'rangers-firebrand'], battlefield: n('mountain', 4) },
    });
    cast(g, 'fiery-inscription');
    done(g);
    expect(ringOf(g)?.tempted).toBe(1);
    cast(g, 'rangers-firebrand', [{ player: 'p2' }]);
    done(g);
    // 2 from the Inscription, 2 from the Firebrand.
    expect(g.life('p2')).toBe(16);
  });
});

describe('Fire of Orthanc', () => {
  it("destroys a land, and creatures without flying can't block this turn", () => {
    const g = game({
      p1: { hand: ['fire-of-orthanc'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
      p2: { battlefield: ['island', 'savannah-lions', 'serra-angel'] },
    });
    cast(g, 'fire-of-orthanc', [obj(g, g.id('p2', 'island'))]);
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    const lions = g.id('p1', 'savannah-lions');
    attack(g, [lions]);
    toBlockers(g);
    const blockers = g
      .legal()
      .filter((a) => a.type === 'addBlock')
      .map((a) => a.type === 'addBlock' && g.obj(a.blocker).defId);
    expect(blockers).toEqual(['serra-angel']);
  });
});

describe('Improvised Club', () => {
  it('needs an artifact or creature to sacrifice, then deals 4', () => {
    const none = game({ p1: { hand: ['improvised-club'], battlefield: n('mountain', 2) } });
    expect(casts(none, 'improvised-club')).toHaveLength(0);
    const g = game({
      p1: { hand: ['improvised-club'], battlefield: ['d-nedain-blade', ...n('mountain', 2)] },
    });
    cast(g, 'improvised-club', [{ player: 'p2' }], { sacrifice: g.id('p1', 'd-nedain-blade') });
    done(g);
    expect(g.life('p2')).toBe(16);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toContain('d-nedain-blade');
  });
});

describe('Oliphaunt', () => {
  it('gives another creature you control +2/+0 and trample as it attacks', () => {
    const g = game({ p1: { battlefield: ['oliphaunt', 'savannah-lions'] } });
    const lions = g.id('p1', 'savannah-lions');
    attack(g, [g.id('p1', 'oliphaunt')]);
    settleOn(g, lions);
    expect(pt(g, lions)).toEqual([4, 1]);
    expect(keywords(g, lions)).toContain('trample');
  });
});

describe('Warbeast of Gorgoroth', () => {
  it('amasses Orcs 2 when it dies, or another creature of yours with power 4 or greater does, not a smaller one', () => {
    const g = game({
      p1: {
        hand: ['rangers-firebrand'],
        battlefield: ['warbeast-of-gorgoroth', 'savannah-lions', ...n('mountain', 1)],
      },
      p2: {
        hand: ['improvised-club', 'improvised-club'],
        battlefield: ['serra-angel', ...n('mountain', 4)],
      },
    });
    // A 2/1 dying: nothing.
    cast(g, 'rangers-firebrand', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(tokensOf(g, 'ltr-orc-army-token')).toHaveLength(0);
    toStep(g, 'main1', 'p2');
    // Warbeast dying: amass.
    cast(g, 'improvised-club', [obj(g, g.id('p1', 'warbeast-of-gorgoroth'))], {
      sacrifice: g.id('p2', 'serra-angel'),
    });
    done(g);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token', 'p1')[0]!)).toEqual([2, 2]);
  });
  it('amasses when another creature of yours with power 4 or greater dies', () => {
    const g = game({
      p1: { battlefield: ['warbeast-of-gorgoroth', 'oliphaunt'], library: n('mountain', 3) },
      p2: {
        hand: ['improvised-club'],
        battlefield: ['serra-angel', ...n('mountain', 2)],
        library: n('mountain', 3),
      },
    });
    toStep(g, 'main1', 'p2');
    cast(g, 'improvised-club', [obj(g, g.id('p1', 'oliphaunt'))], {
      sacrifice: g.id('p2', 'serra-angel'),
    });
    done(g);
    expect(pt(g, tokensOf(g, 'ltr-orc-army-token', 'p1')[0]!)).toEqual([2, 2]);
  });
});
