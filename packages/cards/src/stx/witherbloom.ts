import type {
  AbilityDef,
  Amount,
  CardDefinition,
  EffectDef,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, drain, gain, mana, onEnter, t0 } from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';
import { LESSONS_WITHERBLOOM } from './lessons-witherbloom.ts';

/**
 * Strixhaven (13b): the Witherbloom Pestilence deck (B/G): Pests, life gain
 * and sacrifice (docs/strixhaven-13b-decks.md). Pest tokens are shared with the
 * Quandrix deck (`stx-pest-token`, defined in quandrix.ts).
 */

const PEST = 'stx-pest-token';
const pest = (count: Amount = 1): EffectDef => ({ kind: 'createToken', token: PEST, count });
const learn: EffectDef = { kind: 'learn' };

/** No tokens of its own. */
export const WITHERBLOOM_TOKENS: CardDefinition[] = [];

/** "Magecraft: whenever you cast or copy an instant or sorcery spell, ...". */
const magecraft = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets: [],
  effects,
});

const gainedLife = { kind: 'lifeThisTurn', who: 'you', gained: true } as const;
const modeOf = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});
const creatureOrWalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};

export const WITHERBLOOM: Record<string, Behavior> = {
  // ---------------------------------------------------------------- creatures
  Eyetwitch: {
    abilities: [{ kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [learn] }],
  },
  'Leech Fanatic': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['lifelink'],
        },
      },
    ],
  },
  'Witherbloom Apprentice': { abilities: [magecraft(...drain(1))] },
  'Blood Researcher': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Dina, Soul Steeper': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: { sacrificedPower: true }, toughness: 0 }],
        label: '{1}, Sacrifice another creature: +X/+0 (X is its power)',
      },
    ],
  },
  'Callous Bloodmage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          modeOf('Create a 1/1 Pest', [], pest()),
          modeOf('You draw a card and you lose 1 life', [], draw(1), {
            kind: 'loseLife',
            who: 'controller',
            amount: 1,
          }),
          modeOf("Exile target player's graveyard", [{ what: 'player' }], {
            kind: 'exileGraveyard',
            who: t0,
          }),
        ],
      },
    ],
  },
  'Honor Troll': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraLifeGain', amount: 1 } },
      { kind: 'static', effect: { kind: 'whileLife', minLife: 25, power: 2, toughness: 1 } },
    ],
  },
  'Moldering Karok': {},
  // Simplified: Master Symmetrist's trample trigger (power equal to toughness) is left out.
  'Master Symmetrist': {},
  'Specter of the Fens': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{5}{B}') },
        targets: [],
        effects: drain(2),
        label: '{5}{B}: Target opponent loses 2 life and you gain 2 life',
      },
    ],
  },
  'Sedgemoor Witch': { abilities: [magecraft(pest())] },
  'Mage Hunter': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true, caster: 'opponent' },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
      },
    ],
  },
  'Gnarled Professor': { abilities: [onEnter(learn)] },
  'Witherbloom Pledgemage': { abilities: [magecraft(gain(1))] },
  'Tenured Inkcaster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [creature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlAttacks', filter: { minPlusOneCounters: 1 } },
        targets: [],
        effects: drain(1),
      },
    ],
  },
  'Bayou Groff': { sacrificeOrPay: mana('{3}') },
  'Brackish Trudge': {
    entersTapped: true,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
        fromGraveyard: true,
        condition: gainedLife,
        label: '{1}{B}: Return this card from your graveyard to your hand',
      },
    ],
  },
  // ------------------------------------------------------------------- spells
  'Hunt for Specimens': { spell: { targets: [], effects: [pest(), learn] } },
  'Cram Session': { spell: { targets: [], effects: [gain(4), learn] } },
  'Mortality Spear': {
    costReductionIf: { condition: gainedLife, amount: 2 },
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  'Baleful Mastery': {
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'exile', what: t0 }] },
    kicker: {
      cost: mana('{1}{B}'),
      replacesCost: true,
      spell: {
        targets: [creatureOrWalker],
        effects: [
          { kind: 'draw', who: 'eachOpponent', amount: 1 },
          { kind: 'exile', what: t0 },
        ],
      },
    },
  },
  "Mage Hunters' Onslaught": {
    spell: {
      targets: [creatureOrWalker],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  'Tend the Pests': {
    sacrificeCreatureToCast: true,
    spell: { targets: [], effects: [pest({ sacrificedPower: true })] },
  },
  'Witherbloom Campus': {
    entersTapped: true,
    abilities: [
      ...tapFor('B', 'G'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
        label: '{4}, {T}: Scry 1',
      },
    ],
  },
  ...LESSONS_WITHERBLOOM,
};
