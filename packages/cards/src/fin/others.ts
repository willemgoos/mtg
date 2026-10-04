import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew } from '../msh/helpers.ts';
import { equip, mana, mode, spell, t0, t1, tiered, yourCreature } from './helpers.ts';

/**
 * Final Fantasy (FIN) 11c (leftovers): the last booster cards, the commons and
 * uncommons no deck or earlier phase needed. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const equipment: TargetSpec = { what: 'permanent', filter: { subtype: 'Equipment' } };

/** "Equipped creature gets +P/+T." */
const equippedGets = (power: number, toughness: number): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'attached', power, toughness },
});

/** Vincent's Limit Break: "gains 'When this creature dies, return it to the battlefield tapped' and has base P/T". */
const limitBreak = (label: string, power: number, toughness: number) =>
  mode(label, [yourCreature], {
    kind: 'pump',
    to: t0,
    power: 0,
    toughness: 0,
    basePT: [power, toughness],
    returnWhenDies: { counters: 0, treasure: false },
  });

export const OTHERS: Record<string, Behavior> = {
  'Cargo Ship': {
    abilities: [
      // Simplification: the mana pays for artifact spells only, not artifact abilities.
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C', onlyFor: 'Artifact' },
      crew(1),
    ],
  },
  'Stolen Uniform': spell(
    [yourCreature, equipment],
    { kind: 'gainControl', what: t1, unattachOnRevert: true },
    { kind: 'attach', to: t0, what: t1 },
  ),
  "Vincent's Limit Break": tiered(
    ['{0}', limitBreak('Galian Beast', 3, 2)],
    ['{1}', limitBreak('Death Gigas', 5, 2)],
    ['{3}', limitBreak('Hellmasker', 7, 2)],
  ),
  'Coral Sword': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [
          { kind: 'attach', to: t0 },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['firstStrike'] },
        ],
      },
      equippedGets(1, 0),
      equip('{1}'),
    ],
  },
  'Haste Magic': spell(
    [{ what: 'creature' }],
    { kind: 'pump', to: t0, power: 3, toughness: 1, keywords: ['haste'] },
    // "Until your next end step": this turn's on your turn, your next turn's otherwise.
    {
      kind: 'if',
      condition: { kind: 'yourTurn' },
      then: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' }],
      else: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }],
    },
  ),
  Sandworm: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'permanent', filter: { types: ['Land'] } }],
        effects: [{ kind: 'destroy', what: t0 }, custom('landControllerSearchesBasic')],
      },
    ],
  },
  'Self-Destruct': spell(
    [yourCreature, { what: 'any' }],
    { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
    { kind: 'damage', amount: { powerOf: t0 }, to: t0, from: t0 },
  ),
  'Unexpected Request': spell(
    [{ what: 'creature' }],
    { kind: 'gainControl', what: t0, unattachOnRevert: true },
    { kind: 'untap', what: t0 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['haste'] },
    // Simplification: the Equipment comes off as control reverts (cleanup), not at the end step.
    {
      kind: 'may',
      effects: [
        {
          kind: 'chooseYourPermanent',
          filter: { subtype: 'Equipment' },
          then: [{ kind: 'attach', to: t0, what: 'chosen' }],
        },
      ],
    },
  ),
  "Galuf's Final Act": spell(
    [{ what: 'creature' }],
    { kind: 'pump', to: t0, power: 1, toughness: 0 },
    // Simplification: "up to one target creature" is a creature you control, chosen as it dies.
    {
      kind: 'whenDiesThisTurn',
      what: t0,
      effects: [
        {
          kind: 'chooseYourPermanent',
          filter: { types: ['Creature'] },
          then: [{ kind: 'counters', to: 'chosen', amount: { powerOf: 'subject' } }],
        },
      ],
    },
  ),
  "Adventurer's Airship": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          { kind: 'draw', who: 'controller', amount: 1 },
          { kind: 'discard', count: 1 },
        ],
      },
      crew(2),
    ],
  },
  Elixir: {
    entersTapped: true,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true },
        targets: [],
        effects: [custom('elixir')],
        label: 'Elixir',
      },
    ],
  },
  'Iron Giant': {},
  'Relentless X-ATM092': {
    abilities: [
      { kind: 'static', effect: { kind: 'minBlockers', count: 3 } },
      {
        kind: 'activated',
        cost: { mana: mana('{8}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true, named: 'finality' }],
        label: 'Return',
      },
    ],
  },
};
