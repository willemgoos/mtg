import { createEngine, type CardDefinition, type ManaCost } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { castGroups, handActions } from '../src/game/interaction.ts';

// Tarkir: Dragonstorm (19a): the Omen side is a way of casting a card of its own; harmonize's tapped creature is a way of paying.

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
const db = new Map(
  [
    card({
      id: 'mountain',
      types: ['Land'],
      supertypes: ['Basic'],
      abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'R' }],
    }),
    card({ id: 'bear', types: ['Creature'], power: 2, toughness: 2 }),
    card({ id: 'ogre', types: ['Creature'], power: 3, toughness: 3 }),
    card({
      id: 'dragon',
      types: ['Creature'],
      subtypes: ['Dragon'],
      power: 4,
      toughness: 4,
      manaCost: cost(2, { R: 1 }),
      adventure: true,
      back: 'omen',
    }),
    card({
      id: 'omen',
      types: ['Sorcery'],
      subtypes: ['Omen'],
      manaCost: cost(0, { R: 1 }),
      spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 1 }] },
    }),
    card({
      id: 'bolt',
      types: ['Sorcery'],
      manaCost: cost(0, { R: 1 }),
      flashback: cost(3, { R: 1 }),
      harmonize: true,
      spell: {
        targets: [{ what: 'player' }],
        effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
      },
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(db);

describe('casting a card with an Omen', () => {
  it('the creature and the Omen are separate ways to cast it', () => {
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          hand: ['dragon'],
          battlefield: ['mountain', 'mountain', 'mountain'],
          library: Array<string>(5).fill('mountain'),
        },
        p2: { library: Array<string>(5).fill('mountain') },
      }),
    );
    const card = g.id('p1', 'dragon', 'hand');
    const groups = castGroups(handActions(g.legal('p1'), card));
    expect(groups).toHaveLength(2);
    expect(groups.some((gr) => gr.every((a) => a.type === 'castSpell' && a.back))).toBe(true);
    expect(groups.some((gr) => gr.every((a) => a.type === 'castSpell' && !a.back))).toBe(true);
  });
});

describe('harmonize', () => {
  it('each creature you could tap is a way of casting, next to casting without tapping', () => {
    const g = new GameDriver(
      engine,
      buildScenario(db, {
        p1: {
          graveyard: ['bolt'],
          battlefield: ['mountain', 'mountain', 'mountain', 'mountain', 'bear', 'ogre'],
          library: Array<string>(5).fill('mountain'),
        },
        p2: { library: Array<string>(5).fill('mountain') },
      }),
    );
    const card = g.id('p1', 'bolt', 'graveyard');
    const groups = castGroups(
      g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === card),
    );
    // No tap, tap the bear, tap the ogre (each against the opponent only: one target choice here).
    expect(groups).toHaveLength(3);
    const taps = groups.map((gr) =>
      gr[0]!.type === 'castSpell' ? gr[0]!.harmonizeTap : undefined,
    );
    expect(taps).toContain(undefined);
    expect(taps).toContain(g.id('p1', 'bear'));
    expect(taps).toContain(g.id('p1', 'ogre'));
  });
});
