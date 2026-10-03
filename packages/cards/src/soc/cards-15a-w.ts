import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { food, onEnter, t0, when, yours } from '../blb/helpers.ts';
import { tapFor } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15a): the white and colourless cards of Brawl Quintorius,
 * History Chaser. Printed characteristics come from Scryfall; only rules text
 * lives here. One-offs are `custom` handlers in
 * packages/engine/src/brawl-15a-w-effects.ts.
 */

export const SOC_BIRD = 'soc-bird-token';
export const SOC_ILLUSION = 'soc-illusion-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
});

/** The 1/1 white Bird with flying (Battle Screech) and the X/X blue Illusion (Skyclave Apparition). */
export const CARDS_15A_W_TOKENS: CardDefinition[] = [
  token(SOC_BIRD, 'Bird', ['W'], ['Bird'], 1, 1, ['flying']),
  token(SOC_ILLUSION, 'Illusion', ['U'], ['Illusion'], 0, 0),
];

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const sacrificeSelf = (
  targets: TargetSpec[],
  label: string,
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  cost: { sacrificeSelf: true },
  targets,
  effects,
  label,
});
const yourGraveyardCard = (
  filter: NonNullable<TargetSpec['filter']>,
  optional = false,
): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
  ...(optional ? { optional: true } : {}),
});
/** A permanent card (not an instant or sorcery) in your graveyard with mana value 3 or less. */
const cheapPermanentCard = (optional = false): TargetSpec =>
  yourGraveyardCard({ notTypes: ['Instant', 'Sorcery'], maxManaValue: 3 }, optional);
const cheapCreatureCard = (): TargetSpec =>
  yourGraveyardCard({ types: ['Creature'], maxManaValue: 3 });
const surveilLand = (n: number): EffectDef => ({ kind: 'surveil', amount: n });

export const CARDS_15A_W: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Witch Enchanter': {
    back: 'witch-blessed-meadow',
    abilities: [
      onEnterTarget(
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }] },
          },
        ],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },
  'Furious Forebear': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies' },
        fromGraveyard: true,
        cost: mana('{1}{W}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Keening Apparition': {
    abilities: [
      sacrificeSelf(
        [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        'Sacrifice: destroy target enchantment',
        { kind: 'destroy', what: t0 },
      ),
    ],
  },
  'Lunarch Veteran': {
    back: 'luminous-phantom',
    disturb: true,
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you' }, [], {
        kind: 'gainLife',
        who: 'controller',
        amount: 1,
      }),
    ],
  },
  'Moonshaker Cavalry': {
    abilities: [
      onEnter({
        kind: 'pump',
        to: yours,
        power: { count: 'creaturesYouControl' },
        toughness: { count: 'creaturesYouControl' },
        keywords: ['flying'],
      }),
    ],
  },
  'Patchplate Resolute': {
    abilities: [
      when({ on: 'etb' }, [], custom('patchplateBoon')),
      when({ on: 'dies' }, [], custom('patchplateBoon')),
      when({ on: 'leavesWithoutDying', who: 'selfOrOther' }, [], custom('patchplateBoon')),
      {
        // Unearth {1}{W}.
        kind: 'activated',
        cost: { mana: mana('{1}{W}') },
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'unearth' }],
        label: 'Unearth {1}{W}',
      },
    ],
  },
  'Selfless Spirit': {
    abilities: [
      sacrificeSelf([], 'Sacrifice: creatures you control gain indestructible', {
        kind: 'pump',
        to: yours,
        power: 0,
        toughness: 0,
        keywords: ['indestructible'],
      }),
    ],
  },
  'Skyclave Apparition': {
    abilities: [
      onEnterTarget(
        [
          {
            what: 'permanent',
            controller: 'opponent',
            optional: true,
            filter: { nonland: true, nontoken: true, maxManaValue: 4 },
          },
        ],
        custom('skyclaveExile'),
      ),
      when({ on: 'dies' }, [], custom('skyclaveToken')),
      when({ on: 'leavesWithoutDying', who: 'selfOrOther' }, [], custom('skyclaveToken')),
    ],
  },
  'Sun Titan': {
    abilities: [
      onEnterTarget([cheapPermanentCard(true)], { kind: 'returnToBattlefield', what: t0 }),
      when({ on: 'attacks' }, [cheapPermanentCard(true)], {
        kind: 'returnToBattlefield',
        what: t0,
      }),
    ],
  },
  // ------------------------------------------------------------ auras, enchantments
  "Sentinel's Eyes": {
    enchant: { what: 'creature' },
    flashback: mana('{W}'),
    escapeExiles: 2,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['vigilance'] },
      },
    ],
  },
  'Anointed Procession': { abilities: [{ kind: 'static', effect: { kind: 'doubleTokens' } }] },
  // Simplified: it protects every planeswalker you control, not one chosen type.
  Deification: { abilities: [{ kind: 'static', effect: { kind: 'planeswalkerProtection' } }] },
  // ------------------------------------------------------------ sorceries
  'Battle Screech': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: SOC_BIRD, count: 2 }] },
    flashback: { generic: 0, colored: {} },
    flashbackTapCreatures: 3,
    flashbackTapFilter: { colors: ['W'] },
  },
  'Call a Surprise Witness': {
    spell: {
      targets: [cheapCreatureCard()],
      effects: [{ kind: 'returnToBattlefield', what: t0, counter: 'flying', addSubtype: 'Spirit' }],
    },
  },
  'Helping Hand': {
    spell: {
      targets: [cheapCreatureCard()],
      effects: [{ kind: 'returnToBattlefield', what: t0, tapped: true }],
    },
  },
  'Late to Dinner': {
    spell: {
      targets: [yourGraveyardCard({ types: ['Creature'] })],
      effects: [{ kind: 'returnToBattlefield', what: t0 }, food],
    },
  },
  "Sevinne's Reclamation": {
    spell: {
      targets: [cheapPermanentCard()],
      effects: [{ kind: 'returnToBattlefield', what: t0 }],
    },
    flashback: mana('{4}{W}'),
    abilities: [
      // Cast from a graveyard: copy it (a trigger rather than on resolution; the copy may take a new target).
      {
        ...when({ on: 'castSelf' }, [], { kind: 'copySpell', what: 'subject', retarget: true }),
        condition: { kind: 'castFromGraveyard' },
      } as AbilityDef,
    ],
  },
  // ------------------------------------------------------------ artifacts
  'Mind Stone': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        label: '{1}, {T}, Sacrifice: draw a card',
      },
    ],
  },
  'Crucible of Worlds': {
    abilities: [{ kind: 'static', effect: { kind: 'playLandsFromGraveyard' } }],
  },
  'Ghost Vacuum': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'graveyardCard' }],
        effects: [custom('ghostVacuumExile')],
        label: '{T}: exile target card from a graveyard',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{6}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [custom('ghostVacuumRelease')],
        label: '{6}, {T}, Sacrifice: return the exiled creatures as 1/1 flying Spirits',
      },
    ],
  },
  // ------------------------------------------------------------ lands
  'Gate to the Citadel': {
    entersTapped: true,
    abilities: [
      tapFor('W'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{W}'), tapSelf: true },
        once: true,
        targets: [],
        effects: [custom('seekNonland')],
        label: '{3}{W}, {T}: seek a nonland card (once)',
      },
    ],
  },
  "Tocasia's Dig Site": {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        targets: [],
        effects: [surveilLand(1)],
        label: '{3}, {T}: surveil 1',
      },
    ],
  },
};

/** "When this enters, ..." with targets. */
function onEnterTarget(targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef {
  return when({ on: 'etb' }, targets, ...effects);
}

/** Back faces: Witch-Blessed Meadow (a shock land) and Luminous Phantom. */
export const CARDS_15A_W_BACK_FACES: Record<string, Behavior> = {
  // It enters tapped; paying 3 life as it enters untaps it (same result as "you may pay 3 life").
  'Witch-Blessed Meadow': {
    entersTapped: true,
    abilities: [
      tapFor('W'),
      when({ on: 'etb' }, [], {
        kind: 'may',
        effects: [
          { kind: 'loseLife', who: 'controller', amount: 3 },
          { kind: 'untap', what: 'self' },
        ],
      }),
    ],
  },
  'Luminous Phantom': {
    // Disturb {1}{W}: the cost is its `flashback` here, the front face says it can be cast from the graveyard.
    flashback: mana('{1}{W}'),
    exileInsteadOfGraveyard: true,
    abilities: [
      when({ on: 'otherCreatureLeaves' }, [], { kind: 'gainLife', who: 'controller', amount: 1 }),
    ],
  },
};
