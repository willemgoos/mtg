import type {
  AbilityDef,
  Amount,
  CardFilter,
  ConditionDef,
  EffectDef,
  Keyword,
  Ref,
} from '@mtg/engine';
import { parseManaCost } from './build.ts';

// The Hobbit (20a): small builders for the new engine vocabulary. See "Phase 20a" in docs/the-hobbit-plan.md.

// ---------------------------------------------------------------------------
// Amass
// ---------------------------------------------------------------------------

/**
 * The 0/0 black Army tokens amass makes, by the type it adds. Goblin: `hob-goblin-army-token` (registered by the Hobbit set);
 * Zombie: `soc-15b-u-zombie-army` (Lazotep Plating). Another type needs its own token: pass it as `token`.
 */
export const AMASS_ARMY_TOKENS: Readonly<Record<string, string>> = {
  Goblin: 'hob-goblin-army-token',
  Zombie: 'soc-15b-u-zombie-army',
};

/**
 * "Amass <type>s N": put N +1/+1 counters on an Army you control (you choose when there are several), it's also a <type>; with no
 * Army, a 0/0 black <type> Army creature token first. `subtype` is singular. `who` is the player who amasses (Azog, Moria's Ruin:
 * "Its controller amasses Goblins X": `amass('Goblin', { powerOf: { target: 0 } }, { controllerOf: 0 })`). The effects after it can
 * name the Army as `'chosen'` (Goblin Plate Mail: `[amass('Goblin', 1), { kind: 'attach', to: 'chosen', what: 'self' }]`).
 */
export const amass = (
  subtype: string,
  amount: Amount,
  opts: { who?: Ref; token?: string } = {},
): EffectDef => {
  const token = opts.token ?? AMASS_ARMY_TOKENS[subtype];
  if (token === undefined) throw new Error(`amass ${subtype}: no Army token (pass \`token\`)`);
  return { kind: 'amass', subtype, amount, token, ...(opts.who ? { who: opts.who } : {}) };
};

/** "Amass Goblins N" (14 cards). */
export const amassGoblins = (amount: Amount, who?: Ref): EffectDef =>
  amass('Goblin', amount, who ? { who } : {});

// ---------------------------------------------------------------------------
// Recruit
// ---------------------------------------------------------------------------

/**
 * "Recruit" (draw a card, then discard a card; if you discarded a nonland card, create a 1/1 white Human Soldier creature token).
 * Use it as an effect of any ability or spell: `when({ on: 'etb' }, [recruit])`, a death trigger, a Saga chapter. "You recruit"
 * (The Queen of Dale) is the same effect.
 */
export const recruit: EffectDef = { kind: 'recruit' };

// ---------------------------------------------------------------------------
// Storied and the enduring story
// ---------------------------------------------------------------------------

/**
 * Storied: "If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the
 * game." A static ability (like Ascend) of the permanent: it works while it is on the battlefield.
 */
export const storied: AbilityDef = { kind: 'static', effect: { kind: 'storied' } };

/** "If you have an enduring story" / "as long as you have an enduring story": a condition about the controller. */
export const enduringStory: ConditionDef = { kind: 'enduringStory' };

/**
 * "As long as you have an enduring story, this creature gets +P/+T and has <keywords>" (Óin the Brave `+1/+0, haste`; Ori, Keeper of
 * Songs `+1/+0, vigilance`).
 */
export const storyPump = (
  power: number,
  toughness: number,
  keywords: Keyword[] = [],
): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'while',
    condition: enduringStory,
    power,
    toughness,
    ...(keywords.length ? { keywords } : {}),
  },
});

/**
 * "As long as you have an enduring story, creatures you control get +1/+1" (Fíli the Pathfinder): an anthem with the condition.
 * Other statics take it as their `condition` too (`anthem`, `flashForAll`, `cantAttackYou`, ...); `attackTax` has `condition`
 * (Dáin, Lord of the Iron Hills: `{ kind: 'attackTax', amount: 1, condition: enduringStory }`), `doesntUntap` has `unless`
 * (Bombur: `{ kind: 'doesntUntap', unless: enduringStory }`).
 */
export const storyAnthem = (power: number, toughness: number, filter?: CardFilter): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'anthem',
    affects: 'creaturesYouControl',
    ...(filter ? { filter } : {}),
    condition: enduringStory,
    power,
    toughness,
  },
});

/** "If you have an enduring story, <then>" inside an effect list (Balin, Loremaster: damage equal to the cards discarded). */
export const ifEnduringStory = (then: EffectDef[], otherwise?: EffectDef[]): EffectDef => ({
  kind: 'if',
  condition: enduringStory,
  then,
  ...(otherwise ? { else: otherwise } : {}),
});

/**
 * "As long as you have an enduring story, if a triggered ability of a <subtype> you control triggers, that ability triggers an
 * additional time" (Bifur, Melodic Rider: `storyTriggersTwice('Dwarf')`).
 */
export const storyTriggersTwice = (subtype: string): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'subtypeTriggersTwice', subtype, condition: enduringStory },
});

// ---------------------------------------------------------------------------
// The Hobbit lands
// ---------------------------------------------------------------------------

/**
 * "<cost>, {T}, Sacrifice this land: Put two +1/+1 counters on target <type> you control. Activate only as a sorcery." (the five
 * two-colour lands: Lake-town `sacrificeLandForCounters('{2}{W}{U}', ['Human'])`, Mirkwood `['Bear', 'Spider', 'Wolf']`, Iron Hills
 * `['Dwarf']`, Goblin-town `['Goblin', 'Orc']`, Elvenking's Halls `['Elf']`). The land itself "enters tapped" and taps for its two
 * colours: write those as usual (`entersTapped: true` on the card, two `mana` abilities).
 */
export const sacrificeLandForCounters = (cost: string, subtypes: string[]): AbilityDef => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost), tapSelf: true, sacrificeSelf: true },
  sorcerySpeed: true,
  targets: [
    {
      what: 'creature',
      controller: 'you',
      filter: subtypes.length === 1 ? { subtype: subtypes[0]! } : { subtypes },
    },
  ],
  effects: [{ kind: 'counters', to: { target: 0 }, amount: 2 }],
});

// ---------------------------------------------------------------------------
// Landcycling and the other typecycling
// ---------------------------------------------------------------------------

/**
 * "<Type>cycling {cost}" ({cost}, Discard this card: Search your library for a <type> card, reveal it, put it into your hand, then
 * shuffle). Activated from your hand. `type` is what the card is searched by: a card type or subtype or a filter. `name` is the
 * ability's name as printed ("Landcycling", "Mountaincycling", "Halflingcycling", "Basic landcycling").
 */
export const typecycling = (
  name: string,
  cost: string,
  search: 'basicLand' | CardFilter,
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: search, to: 'hand', reveal: true }],
  label: `${name} ${cost}`,
});

/** "Landcycling {cost}": search for a land card (any land). */
export const landcycling = (cost: string): AbilityDef =>
  typecycling('Landcycling', cost, { types: ['Land'] });

/** "Basic landcycling {cost}": search for a basic land card. */
export const basicLandcycling = (cost: string): AbilityDef =>
  typecycling('Basic landcycling', cost, 'basicLand');

/**
 * "<Subtype>cycling {cost}": search for a card with that subtype. Mountaincycling `subtypecycling('Mountain', '{2}')` (Last Light of
 * Durin's Day); Halflingcycling `subtypecycling('Halfling', '{4}')` (Hobbit Hole).
 */
export const subtypecycling = (subtype: string, cost: string): AbilityDef =>
  typecycling(`${subtype}cycling`, cost, { subtype });
