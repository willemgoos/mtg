import type {
  AbilityDef,
  Amount,
  CardFilter,
  ConditionDef,
  EffectDef,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import { amass } from './hob-vocab.ts';
import { LTR_ORC_ARMY } from './ltr/tokens.ts';

// The Lord of the Rings (21a): small builders for the new engine vocabulary. See "Phase 21a" in docs/lord-of-the-rings-plan.md.

// ---------------------------------------------------------------------------
// The Ring tempts you
// ---------------------------------------------------------------------------

/**
 * "The Ring tempts you" (rule 701.54): you get the Ring emblem if you don't have it, the Ring gains its next ability (to four), you
 * choose a creature you control as your Ring-bearer ("Choose your Ring-bearer", a prompt when you control several; it replaces any
 * earlier Ring-bearer), and "whenever the Ring tempts you" abilities trigger. Use it as an effect of any ability or spell, and put
 * the effects that come after the temptation after it: `[draw 1, ringTempts]`, `[ringTempts, { mill ... }]`.
 */
export const ringTempts: EffectDef = { kind: 'ringTempts' };

interface RingTriggerOpts {
  /** The intervening "if" (checked as it triggers). */
  condition?: ConditionDef;
  /** The ability has targets (chosen as it goes on the stack). */
  targets?: TargetSpec[];
  /** "You may" (the controller may choose no targets to skip it). */
  optional?: boolean;
  /** It triggers while the card is in your graveyard (Ringwraiths: "When the Ring tempts you, return this card from your graveyard to your hand"). */
  fromGraveyard?: boolean;
}

const ringTrigger = (
  on: 'ringTempts' | 'ringBearerChosen',
  effects: EffectDef[],
  o: RingTriggerOpts,
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on },
  targets: o.targets ?? [],
  effects,
  ...(o.condition ? { condition: o.condition } : {}),
  ...(o.optional ? { optional: true } : {}),
  ...(o.fromGraveyard ? { fromGraveyard: true } : {}),
});

/**
 * "Whenever the Ring tempts you, <effects>" (Faramir, Sauron the Dark Lord, Sméagol, Aragorn, Nazgûl, Galadriel; Ringwraiths with
 * `fromGraveyard`). It triggers when the temptation is done: the creature you chose as Ring-bearer (if any) is the trigger's subject
 * (`'subject'` in the effects, and `chosenOtherThanThis` below checks it).
 */
export const whenRingTempts = (effects: EffectDef[], opts: RingTriggerOpts = {}): AbilityDef =>
  ringTrigger('ringTempts', effects, opts);

/**
 * "Whenever you choose a creature as your Ring-bearer, <effects>" (Call of the Ring): every time you choose one, the same creature
 * again included; not when you control no creature. The creature is the trigger's subject.
 */
export const whenRingBearerChosen = (effects: EffectDef[], opts: RingTriggerOpts = {}): AbilityDef =>
  ringTrigger('ringBearerChosen', effects, opts);

/**
 * "If you chose a creature other than <this> as your Ring-bearer" (Faramir, Field Commander; Aragorn, Company Leader; Galadriel of
 * Lothlórien): the `condition` of a `whenRingTempts` ability.
 */
export const chosenOtherThanThis: ConditionDef = { kind: 'ringBearerChosenOther' };

/** "As long as <this> is your Ring-bearer" / "unless <this> is your Ring-bearer" (`not` it; Sauron, the Necromancer). */
export const isRingBearer: ConditionDef = { kind: 'isRingBearer' };

/** "If you control a Ring-bearer" (`{ kind: 'not', condition: hasRingBearer }` is "if you don't control a Ring-bearer": Dúnedain Rangers). */
export const hasRingBearer: ConditionDef = { kind: 'hasRingBearer' };
export const noRingBearer: ConditionDef = { kind: 'not', condition: hasRingBearer };

/** "If the Ring has tempted you N or more times this game" (Frodo, Sauron's Bane: `ringTemptedTimes(4)`). */
export const ringTemptedTimes = (min: number): ConditionDef => ({ kind: 'ringTemptedAtLeast', min });

/** "Your Ring-bearer" as a Ref: a target for pumps and counters, the permanent an Amount reads. */
export const ringBearer: Ref = 'ringBearer';

/** "Your Ring-bearer's power" (One Ring to Rule Them All: `{ kind: 'mill', who: 'eachPlayer', count: ringBearerPower }`). 0 without one. */
export const ringBearerPower: Amount = { powerOf: 'ringBearer' };

// ---------------------------------------------------------------------------
// Amass Orcs
// ---------------------------------------------------------------------------

/**
 * "Amass Orcs N": put N +1/+1 counters on an Army you control (you choose when there are several), it's also an Orc; with no Army, a
 * 0/0 black Orc Army creature token first (`ltr-orc-army-token`, registered by the set). N is a number or any Amount: Shagrat
 * `{ count: 'permanentsYouControl', filter: { subtype: 'Equipment', attachedToSource: true } }`, Assault on Osgiliath `{ x: ... }` (the
 * value paid for {X}), Fall of Cair Andros `{ event: 'amount' }` (the excess damage). The effects after it can name the Army as
 * `'chosen'` ("When you do, ... deals X damage, where X is the amassed Army's power": Foray of Orcs, Grishnákh).
 */
export const amassOrcs = (amount: Amount, who?: Ref): EffectDef =>
  amass('Orc', amount, { token: LTR_ORC_ARMY, ...(who ? { who } : {}) });

// ---------------------------------------------------------------------------
// Scry and tokens
// ---------------------------------------------------------------------------

/**
 * "Whenever you scry, <effects>" (Chance-Met Elves, Nimrodel Watcher, Celeborn, Elvish Mariner, Glorfindel, Council's Deliberation
 * from the graveyard with `fromGraveyard`, Galadriel, Elrond): only a scry, not a surveil (`youScryOrSurveil` is Matoya's). Add
 * `oncePerTurn` for "this ability triggers only once each turn".
 */
export const whenYouScry = (
  effects: EffectDef[],
  opts: {
    condition?: ConditionDef;
    targets?: TargetSpec[];
    optional?: boolean;
    oncePerTurn?: boolean;
    fromGraveyard?: boolean;
  } = {},
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'youScry' },
  targets: opts.targets ?? [],
  effects,
  ...(opts.condition ? { condition: opts.condition } : {}),
  ...(opts.optional ? { optional: true } : {}),
  ...(opts.oncePerTurn ? { oncePerTurn: true } : {}),
  ...(opts.fromGraveyard ? { fromGraveyard: true } : {}),
});

/** "The number of cards looked at while scrying this way" (inside a `whenYouScry` ability): Elrond, Celeborn, Elvish Mariner. */
export const cardsLookedAt: Amount = { event: 'amount' };

/**
 * "Whenever you create a token, <effects>" (Rosie Cotton, Mirkwood Bats): once for each token created, the token the trigger's subject.
 * `filter` narrows it ("a Treasure token": `{ subtype: 'Treasure' }`). For "create or sacrifice" (Mirkwood Bats) add a second ability
 * `{ on: 'youSacrifice', filter: { token: true } }`.
 */
export const whenYouCreateToken = (
  effects: EffectDef[],
  opts: { filter?: CardFilter; targets?: TargetSpec[] } = {},
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'youCreateToken', ...(opts.filter ? { filter: opts.filter } : {}) },
  targets: opts.targets ?? [],
  effects,
});

// ---------------------------------------------------------------------------
// Legendary and historic
// ---------------------------------------------------------------------------

/** A legendary creature ("legendary creature you control"). The Ring-bearer counts (it is legendary). */
export const legendaryCreature: CardFilter = { types: ['Creature'], supertypes: ['Legendary'] };

/** Historic: an artifact, a legendary permanent or card, or a Saga (Lost to Legend, Glóin, Samwise Gamgee). */
export const historic: CardFilter = {
  anyOf: [{ types: ['Artifact'] }, { supertypes: ['Legendary'] }, { subtype: 'Saga' }],
};

/**
 * "<This land> enters tapped unless you control a legendary creature" (The Shire, Mines of Moria, Minas Tirith, Barad-dûr, Rivendell):
 * spread it into the land's behaviour, beside its mana ability: `{ ...entersTappedUnlessLegendary, abilities: [...] }`.
 */
export const entersTappedUnlessLegendary: { entersTappedIf: ConditionDef } = {
  entersTappedIf: {
    kind: 'not',
    condition: { kind: 'controlsCreature', filter: { supertypes: ['Legendary'] } },
  },
};
