import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import { cast, game, n, pt } from './blb-helpers.ts';
import {
  activations,
  castAdventure,
  castCreatureFromExile,
  chars,
  gyOf,
  handOf,
  has,
  ids,
  naming,
  resolve,
  rolesOn,
  toCombat,
  toTurn,
} from './woe-red-helpers.ts';

// Wilds of Eldraine (23b): the red cards (continued): Adventures, Roles, Treasure and the Rats.

// ---------------------------------------------------------------------------
// Bellowing Bruiser // Beat a Path
// ---------------------------------------------------------------------------

describe('Bellowing Bruiser // Beat a Path', () => {
  it('Beat a Path: up to two target creatures can not block this turn, then the Bruiser can be cast from exile', () => {
    const g = game({
      p1: { hand: ['bellowing-bruiser'], battlefield: n('mountain', 8) },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'rumbling-baloth'] },
    });
    const card = g.id('p1', 'bellowing-bruiser', 'hand');
    const adventures = g
      .legal()
      .filter(
        (a): a is Extract<Action, { type: 'castSpell' }> =>
          a.type === 'castSpell' && a.card === card && a.back === true,
      );
    // Zero, one or two targets are all legal ("up to two").
    expect(new Set(adventures.map((a) => a.targets.length))).toEqual(new Set([0, 1, 2]));
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const baloth = g.id('p2', 'rumbling-baloth');
    castAdventure(g, 'bellowing-bruiser', [g.ref(angel), g.ref(lions)]);
    resolve(g);
    expect(chars(g, angel).cantBlock).toBe(true);
    expect(chars(g, lions).cantBlock).toBe(true);
    expect(chars(g, baloth).cantBlock).toBe(false);
    expect(g.zoneOf(card)).toBe('exile');
    castCreatureFromExile(g, 'bellowing-bruiser');
    resolve(g);
    const bruiser = ids(g, 'bellowing-bruiser')[0]!;
    expect(pt(g, bruiser)).toEqual([4, 4]);
    expect(has(g, bruiser, 'haste')).toBe(true);
  });

  it('can not block lasts only for the turn', () => {
    const g = game({
      p1: { hand: ['bellowing-bruiser'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    castAdventure(g, 'bellowing-bruiser', [g.ref(angel)]);
    resolve(g);
    expect(chars(g, angel).cantBlock).toBe(true);
    toTurn(g, 4);
    expect(chars(g, angel).cantBlock).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary Lands Ranger, Charming Scoundrel
// ---------------------------------------------------------------------------

describe('Boundary Lands Ranger', () => {
  it('with a creature of power 4 or greater, may discard a card to draw a card at the beginning of combat', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: ['boundary-lands-ranger', 'bellowing-bruiser'],
        library: ['forest', 'forest'],
      },
    });
    toCombat(g);
    resolve(g, { accept: true });
    expect(handOf(g)).toEqual(['forest']);
    expect(gyOf(g)).toEqual(['mountain']);
  });

  it('may decline', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: ['boundary-lands-ranger', 'bellowing-bruiser'],
        library: ['forest', 'forest'],
      },
    });
    toCombat(g);
    resolve(g, { accept: false });
    expect(handOf(g)).toEqual(['mountain']);
    expect(gyOf(g)).toEqual([]);
  });

  it('does nothing without a creature of power 4 or greater', () => {
    const g = game({
      p1: { hand: ['mountain'], battlefield: ['boundary-lands-ranger', 'savannah-lions'] },
    });
    toCombat(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(handOf(g)).toEqual(['mountain']);
  });

  it('counts the power a creature has now, not the printed one', () => {
    const g = game({
      p1: {
        hand: ['mountain'],
        battlefield: [
          'boundary-lands-ranger',
          'savannah-lions',
          'bespoke-battlegarb',
          'mountain',
          'mountain',
        ],
        library: ['forest'],
      },
    });
    // Savannah Lions 2/1 with the Equipment's +2/+0 has power 4.
    const equip = activations(g, ids(g, 'bespoke-battlegarb')[0]!)[0]!;
    g.do({ ...equip, targets: [g.ref(ids(g, 'savannah-lions')[0]!)] });
    resolve(g);
    toCombat(g);
    resolve(g, { accept: true });
    expect(handOf(g)).toEqual(['forest']);
  });
});

describe('Charming Scoundrel', () => {
  const mode = (m: number) => (legal: Action[]) =>
    legal.find((a) => a.type === 'chooseTargets' && a.mode === m);

  it('is a 1/1 with haste', () => {
    const g = game({ p1: { hand: ['charming-scoundrel'], battlefield: n('mountain', 2) } });
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: mode(1) });
    const s = ids(g, 'charming-scoundrel')[0]!;
    expect(pt(g, s)).toEqual([1, 1]);
    expect(has(g, s, 'haste')).toBe(true);
  });

  it('first mode: discard a card, then draw a card', () => {
    const g = game({
      p1: {
        hand: ['charming-scoundrel', 'mountain'],
        battlefield: n('mountain', 2),
        library: ['forest', 'island'],
      },
    });
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: mode(0) });
    expect(gyOf(g)).toEqual(['mountain']);
    expect(handOf(g)).toEqual(['forest']);
  });

  it('first mode with an empty hand still draws', () => {
    const g = game({
      p1: { hand: ['charming-scoundrel'], battlefield: n('mountain', 2), library: ['forest'] },
    });
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: mode(0) });
    expect(gyOf(g)).toEqual([]);
    expect(handOf(g)).toEqual(['forest']);
  });

  it('second mode: create a Treasure token', () => {
    const g = game({ p1: { hand: ['charming-scoundrel'], battlefield: n('mountain', 2) } });
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: mode(1) });
    expect(ids(g, 'treasure-token')).toHaveLength(1);
  });

  it('third mode: a Wicked Role token attached to target creature you control', () => {
    const g = game({
      p1: { hand: ['charming-scoundrel'], battlefield: ['serra-angel', ...n('mountain', 2)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'charming-scoundrel');
    resolve(g, { pick: naming(angel, 2) });
    expect(rolesOn(g, angel)).toEqual(['woe-wicked-role']);
    expect(pt(g, angel)).toEqual([5, 5]);
  });

  it('the Wicked Role can not go on an opponent’s creature', () => {
    const g = game({
      p1: { hand: ['charming-scoundrel'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const theirs = g.id('p2', 'serra-angel');
    cast(g, 'charming-scoundrel');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(g.legal().filter((a) => naming(theirs)([a]))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cut In, Edgewall Pack, Embereth Veteran
// ---------------------------------------------------------------------------

describe('Cut In', () => {
  it('deals 4 damage to target creature and puts a Young Hero Role on up to one target creature you control', () => {
    const g = game({
      p1: { hand: ['cut-in'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'cut-in', [g.ref(angel), g.ref(lions)]);
    resolve(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(rolesOn(g, lions)).toEqual(['woe-young-hero-role']);
  });

  it('the second target is optional', () => {
    const g = game({
      p1: { hand: ['cut-in'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'cut-in', [g.ref(angel)]);
    resolve(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(ids(g, 'woe-young-hero-role')).toHaveLength(0);
  });

  it('the same creature may be both targets, since they are different targets', () => {
    const g = game({
      p1: { hand: ['cut-in'], battlefield: ['realm-scorcher-hellkite', ...n('mountain', 4)] },
    });
    const hellkite = g.id('p1', 'realm-scorcher-hellkite');
    const both = g
      .legal()
      .filter(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.length === 2 &&
          a.targets.every((t) => 'object' in t && t.object.id === hellkite),
      );
    expect(both.length).toBeGreaterThan(0);
    cast(g, 'cut-in', [g.ref(hellkite), g.ref(hellkite)]);
    resolve(g);
    expect(g.zoneOf(hellkite)).toBe('battlefield');
    expect(g.obj(hellkite).damage).toBe(4);
    expect(rolesOn(g, hellkite)).toEqual(['woe-young-hero-role']);
  });

  it('a creature that died to the damage gets no Role', () => {
    const g = game({
      p1: { hand: ['cut-in'], battlefield: ['savannah-lions', ...n('mountain', 4)] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'cut-in', [g.ref(lions), g.ref(lions)]);
    resolve(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(ids(g, 'woe-young-hero-role')).toHaveLength(0);
  });
});

describe('Edgewall Pack', () => {
  it('is a 3/3 with menace that makes a Rat token that can not block', () => {
    const g = game({ p1: { hand: ['edgewall-pack'], battlefield: n('mountain', 4) } });
    cast(g, 'edgewall-pack');
    resolve(g);
    const pack = ids(g, 'edgewall-pack')[0]!;
    expect(pt(g, pack)).toEqual([3, 3]);
    expect(has(g, pack, 'menace')).toBe(true);
    expect(ids(g, 'woe-rat-token')).toHaveLength(1);
    const rat = ids(g, 'woe-rat-token')[0]!;
    expect(pt(g, rat)).toEqual([1, 1]);
    expect(chars(g, rat).cantBlock).toBe(true);
    expect(chars(g, rat).subtypes).toEqual(['Rat']);
  });
});

describe('Embereth Veteran', () => {
  it('{1}, Sacrifice: a Young Hero Role on another target creature', () => {
    const g = game({
      p1: { battlefield: ['embereth-veteran', 'savannah-lions', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const vet = ids(g, 'embereth-veteran')[0]!;
    const lions = ids(g, 'savannah-lions')[0]!;
    const angel = g.id('p2', 'serra-angel');
    const acts = activations(g, vet);
    // Never itself.
    expect(acts.some((a) => a.targets.some((t) => 'object' in t && t.object.id === vet))).toBe(
      false,
    );
    expect(acts.some((a) => a.targets.some((t) => 'object' in t && t.object.id === lions))).toBe(
      true,
    );
    expect(acts.some((a) => a.targets.some((t) => 'object' in t && t.object.id === angel))).toBe(
      true,
    );
    g.do(acts.find((a) => a.targets.some((t) => 'object' in t && t.object.id === lions))!);
    resolve(g);
    expect(g.zoneOf(vet)).toBe('graveyard');
    expect(rolesOn(g, lions)).toEqual(['woe-young-hero-role']);
    expect(pt(g, lions)).toEqual([2, 1]);
  });

  it('can put the Role on an opponent’s creature (it is yours, on their creature)', () => {
    const g = game({
      p1: { battlefield: ['embereth-veteran', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.do(
      activations(g, ids(g, 'embereth-veteran')[0]!).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === angel),
      )!,
    );
    resolve(g);
    const role = ids(g, 'woe-young-hero-role', 'p1');
    expect(role).toHaveLength(1);
    expect(g.obj(role[0]!).attachedTo).toBe(angel);
  });
});
