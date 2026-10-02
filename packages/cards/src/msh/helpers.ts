import {
  type AbilityDef,
  type CardDefinition,
  combineSpells,
  type EffectDef,
  type SpellDef,
  type TargetSpec,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';

/** Shared shapes for the Marvel Super Heroes (MSH) card files. */

export { mana };
export {
  creature,
  draw,
  drain,
  onEnter,
  prowess,
  t0,
  t1,
  theirCreature,
  yourCreature,
  yours,
} from '../blb/helpers.ts';

/** An instant or sorcery. */
export const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});

/** Power-up — {cost}: effects. Once only; cheaper by the card's mana cost the turn it entered. */
export const powerUp = (cost: string, ...effects: EffectDef[]): AbilityDef => ({
  kind: 'activated',
  powerUp: true,
  cost: { mana: mana(cost) },
  targets: [],
  effects,
});

/** Power-up with targets ("fights up to one target creature"). */
export const powerUpTargeting = (
  cost: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  powerUp: true,
  cost: { mana: mana(cost) },
  targets,
  effects,
});

/** Teamwork N: the spell, and what it does instead when cast using teamwork. */
export const teamwork = (n: number, plain: SpellDef, improved: SpellDef): Behavior => ({
  spell: plain,
  kicker: { cost: mana(''), teamwork: n, spell: improved },
});

/** Teamwork N on "Choose one. If this spell was cast using teamwork, choose both instead." */
export const teamworkModes = (n: number, ...modes: SpellDef[]): Behavior => ({
  modes,
  kicker: { cost: mana(''), teamwork: n, spell: combineSpells(modes) },
});

/** "{cost}: Transform this. Activate only as a sorcery." */
export const transformAbility = (cost: string): AbilityDef => ({
  kind: 'activated',
  sorcerySpeed: true,
  cost: { mana: mana(cost) },
  targets: [],
  effects: [{ kind: 'transform', what: 'self' }],
  label: 'Transform',
});

/** "This creature connives." */
export const connive: EffectDef = { kind: 'connive', what: 'self' };

/** A 2/1 black Villain creature token with menace. */
export const villain = (count = 1, tapped = false): EffectDef => ({
  kind: 'createToken',
  token: 'villain-token',
  count,
  ...(tapped ? { tapped: true } : {}),
});

/** "Whenever you draw your second card each turn, ..." */
export const secondDraw = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'drawSecondCard' },
  targets,
  effects,
});

const token = (
  id: string,
  name: string,
  color: 'W' | 'U' | 'B' | 'R' | 'G',
  subtypes: string[],
  power: number,
  toughness: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

export const MARVEL_TOKENS: CardDefinition[] = [
  token('villain-token', 'Villain', 'B', ['Villain'], 2, 1, ['menace']),
  token('hero-token', 'Hero', 'W', ['Hero'], 3, 2, ['vigilance']),
  {
    ...token('tiger-god-token', 'The Tiger God', 'G', ['Cat', 'God'], 4, 4),
    supertypes: ['Legendary'],
  },
  {
    id: 'clue-token',
    name: 'Clue',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Clue'],
    keywords: [],
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
    isToken: true,
  },
];

/** Investigate: create a Clue ("{2}, Sacrifice this artifact: Draw a card"). */
export const investigate: EffectDef = { kind: 'createToken', token: 'clue-token', count: 1 };
