import { cardDb } from '@mtg/cards';
import { createEngine, type CardDefinition, type ManaCost } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { castGroups, handActions } from '../src/game/interaction.ts';
import { cardNotes, ruleNotes } from '../src/game/notes.ts';
import { BARGAIN_PROMPT, bargainCastLabel } from '../src/game/woe.ts';

// Wilds of Eldraine (23a): bargain in the cast menu (Arena: "Bargain" or "Don't bargain", then the permanent to sacrifice), and the
// tooltips for Roles, bargain, celebration, Adventures and stun counters.

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});
function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: cost(0),
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}
const kicker: CardDefinition['kicker'] = {
  cost: cost(0),
  as: 'bargain',
  sacrifice: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }] },
};
const db = new Map(
  [
    card({
      id: 'swamp',
      types: ['Land'],
      supertypes: ['Basic'],
      abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'B' }],
    }),
    card({ id: 'ogre', types: ['Creature'], power: 3, toughness: 3 }),
    card({ id: 'trinket', types: ['Artifact'] }),
    card({ id: 'charm', types: ['Enchantment'] }),
    card({
      id: 'grapple',
      types: ['Instant'],
      manaCost: cost(1, { B: 1 }),
      kicker,
      spell: {
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: { target: 0 }, power: -3, toughness: -3 }],
      },
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(db);

describe('bargain in the cast menu', () => {
  it('two entries: the bargained cast (every permanent it could sacrifice) and the normal one', () => {
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          hand: ['grapple'],
          battlefield: ['swamp', 'swamp', 'trinket', 'charm'],
          library: ['swamp'],
        },
        p2: { battlefield: ['ogre'], library: ['swamp'] },
      }),
    );
    const groups = castGroups(handActions(g.legal('p1'), g.id('p1', 'grapple', 'hand')));
    expect(groups).toHaveLength(2);
    const bargained = groups.find((gr) => gr.every((a) => a.type === 'castSpell' && a.kicked))!;
    const sacs = new Set(bargained.map((a) => (a.type === 'castSpell' ? a.sacrifice : undefined)));
    expect(sacs).toEqual(new Set([g.id('p1', 'trinket'), g.id('p1', 'charm')]));
  });

  it('labels and prompt', () => {
    expect(bargainCastLabel(kicker!, true)).toBe(
      'Bargain: sacrifice an artifact, enchantment, or token',
    );
    expect(bargainCastLabel({ ...kicker!, costReduction: 2 }, true)).toBe(
      'Bargain: sacrifice an artifact, enchantment, or token (costs {2} less)',
    );
    expect(bargainCastLabel(kicker!, false)).toBe("Don't bargain");
    expect(BARGAIN_PROMPT).toBe('an artifact, enchantment, or token to sacrifice (bargain)');
  });
});

describe('tooltips', () => {
  it('"Role token" on a card that makes one (Monstrous Rage)', () => {
    const rage = [...cardDb.values()].find((d) => d.name === 'Monstrous Rage');
    expect(rage).toBeDefined();
    const note = ruleNotes(rage!.id).find((n) => n.title === 'Role token');
    expect(note?.text).toMatch(/second Role/);
  });

  it('a creature with a Role on it, and stun counters', () => {
    const roleId = [...cardDb.values()].find((d) => d.name === 'Monster Role' && d.isToken)!.id;
    const bear = [...cardDb.values()].find(
      (d) => d.types.includes('Creature') && !d.isToken && !d.abilities.length,
    )!.id;
    const view = buildScenario(cardDb, {
      p1: { battlefield: [bear, roleId], library: [bear] },
      p2: { library: [bear] },
    });
    const [c, r] = view.battlefield;
    view.objects[r!]!.attachedTo = c;
    view.objects[c!]!.counters = { stun: 2 };
    const notes = cardNotes(view, bear, c);
    expect(notes.find((n) => n.title === 'Stun counters')?.text).toMatch(/^2 stun counters/);
    expect(notes.find((n) => n.title === 'Monster Role')?.text).toMatch(/another Role/);
  });
});
