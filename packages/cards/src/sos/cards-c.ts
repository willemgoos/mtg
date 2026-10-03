import type { AbilityDef, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  atYourEndStep,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  when,
  yourCreature,
  yourCreatureCard,
} from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';
import { repartee } from './helpers.ts';
import { SOS_INKLING } from './silverquill.ts';

/**
 * Secrets of Strixhaven (14b, group C): the remaining black, Witherbloom (B/G)
 * and colourless cards (artifacts, lands). Printed characteristics come from
 * Scryfall; this file has the rules text. A prepare card's spell is keyed
 * "Spell (Creature)" in SOS_C_BACKS.
 */

const you = { what: 'player' } as const;
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const creatureCard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'] },
};
const colors = { colorsSpent: 'source' } as const;
const gainedLife = { kind: 'lifeThisTurn', who: 'you', gained: true } as const;
const prepareSelf: EffectDef = { kind: 'prepare', what: 'self' };
const loyalty = (
  cost: number,
  label: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  cost: { loyalty: cost },
  targets,
  effects,
  label,
});
const instantOrSorcery = ['Instant', 'Sorcery'] as const;
const loseLife = (who: Ref, amount: number): EffectDef => ({
  kind: 'loseLife',
  who,
  amount,
});

export const SOS_C_BACKS: Record<string, Behavior> = {
  'Have a Bite (Adventurous Eater)': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'counters', to: t0, amount: 1 }, gain(1)],
    },
  },
  'Raise Dead (Cheerful Osteomancer)': {
    spell: { targets: [yourCreatureCard()], effects: [{ kind: 'returnToHand', what: t0 }] },
  },
  'Demonic Tutor (Emeritus of Woe)': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: {}, to: 'hand', required: true }],
    },
  },
  'Reanimate (Grave Researcher)': {
    spell: {
      targets: [{ what: 'graveyardCard', filter: { types: ['Creature'] } }],
      effects: [{ kind: 'custom', handler: 'reanimateLoseLife' }],
    },
  },
  'Venomous Words (Scathing Shadelock)': {
    spell: { targets: [yourCreature], effects: [pump(t0, 2, 0, ['deathtouch'])] },
  },
  'Sign in Blood (Scheming Silvertongue)': {
    spell: {
      targets: [you],
      effects: [{ kind: 'draw', who: t0, amount: 2 }, loseLife(t0, 2)],
    },
  },
};

const crew2: AbilityDef = {
  kind: 'activated',
  cost: { crew: 2 },
  targets: [],
  effects: [{ kind: 'becomeCreature', what: 'self' }],
  label: 'Crew 2',
};

/** "{T}: Add one mana of any colour, only to cast an instant or sorcery spell; pay 1 life" (a damage-like pain here). */
const greatHallMana: AbilityDef[] = (['W', 'U', 'B', 'R', 'G'] as const).flatMap((produces) =>
  instantOrSorcery.map((onlyFor): AbilityDef => ({
    kind: 'mana',
    cost: { tapSelf: true },
    produces,
    onlyFor,
    pain: true,
  })),
);

export const SOS_C: Record<string, Behavior> = {
  // ---------------------------------------------------------------- black
  'Adventurous Eater': { entersPrepared: true },
  // Converge: X is the number of colours of mana spent.
  'Arcane Omens': {
    spell: {
      targets: [you],
      effects: [{ kind: 'discard', count: 0, of: t0, amount: colors }],
    },
  },
  'Arnyn, Deathbloom Botanist': {
    abilities: [
      when(
        { on: 'creatureYouControlDies', filter: { maxPowerOrToughness: 1 } },
        [opponent],
        loseLife(t0, 2),
        gain(2),
      ),
    ],
  },
  'Burrog Banemaker': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [],
        effects: [pump('self', 1, 1)],
        label: '{1}{B}: +1/+1 until end of turn',
      },
    ],
  },
  'Cheerful Osteomancer': { entersPrepared: true },
  'Decorum Dissertation': {
    paradigm: true,
    spell: {
      targets: [you],
      effects: [{ kind: 'draw', who: t0, amount: 2 }, loseLife(t0, 2)],
    },
  },
  'Emeritus of Woe': {
    entersPrepared: true,
    abilities: [atYourEndStep({ kind: 'creaturesDiedAtLeast', min: 2 }, [], prepareSelf)],
  },
  'End of the Hunt': {
    spell: {
      targets: [opponent],
      effects: [
        {
          kind: 'opponentSacrifices',
          filter: { types: ['Creature', 'Planeswalker'] },
          greatestManaValue: true,
          exile: true,
        },
      ],
    },
  },
  'Eternal Student': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), exileSelf: true },
        targets: [],
        fromGraveyard: true,
        effects: [{ kind: 'createToken', token: SOS_INKLING, count: 2 }],
        label: '{1}{B}, Exile this card from your graveyard: Create two 1/1 Inklings with flying',
      },
    ],
  },
  'Forum Necroscribe': {
    abilities: [repartee([creatureCard], { kind: 'returnToBattlefield', what: t0 })],
  },
  'Grave Researcher': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [
          { kind: 'surveil', amount: 1 },
          {
            kind: 'if',
            condition: { kind: 'graveyardCount', min: 3, types: ['Creature'] },
            then: [prepareSelf],
          },
        ],
      },
    ],
  },
  'Lecturing Scornmage': {
    abilities: [repartee([], { kind: 'counters', to: 'self', amount: 1 })],
  },
  'Masterful Flourish': {
    spell: { targets: [yourCreature], effects: [pump(t0, 1, 0, ['indestructible'])] },
  },
  'Postmortem Professor': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBlock' } },
      when({ on: 'attacks' }, [], loseLife('eachOpponent', 1), gain(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), exileFromGraveyard: { types: [...instantOrSorcery] } },
        targets: [],
        fromGraveyard: true,
        effects: [{ kind: 'returnSource', to: 'battlefield' }],
        label:
          '{1}{B}, Exile an instant or sorcery card from your graveyard: Return this card from your graveyard to the battlefield',
      },
    ],
  },
  'Pox Plague': {
    spell: {
      targets: [],
      effects: [
        { kind: 'custom', handler: 'poxLife' },
        { kind: 'chooseCustom', handler: 'poxPlague' },
      ],
    },
  },
  'Pull from the Grave': {
    spell: {
      targets: [yourCreatureCard(true), yourCreatureCard(true)],
      effects: [{ kind: 'returnToHand', what: t0 }, { kind: 'returnToHand', what: t1 }, gain(2)],
    },
  },
  // Simplified: up to three target creatures.
  'Rabid Attack': {
    spell: {
      targets: [0, 1, 2].map((): TargetSpec => ({ ...yourCreature, optional: true })),
      effects: [0, 1, 2].flatMap((i): EffectDef[] => [
        pump({ target: i }, 1, 0),
        { kind: 'whenDiesThisTurn', what: { target: i }, effects: [draw(1)] },
      ]),
    },
  },
  'Ral Zarek, Guest Lecturer': {
    abilities: [
      loyalty(1, '+1: Surveil 2', [], { kind: 'surveil', amount: 2 }),
      loyalty(
        -1,
        '−1: Any number of target players each discard a card',
        [0, 1].map((): TargetSpec => ({ what: 'player', optional: true })),
        { kind: 'discard', count: 1, of: t0 },
        { kind: 'discard', count: 1, of: t1 },
      ),
      loyalty(
        -2,
        '−2: Return target creature card with mana value 3 or less from your graveyard to the battlefield',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
      loyalty(
        -7,
        '−7: Flip five coins. Target opponent skips their next X turns, where X is the number of heads',
        [opponent],
        { kind: 'custom', handler: 'ralUltimate' },
      ),
    ],
  },
  'Scathing Shadelock': {
    abilities: [when({ on: 'beginningOfMain', which: 1 }, [], prepareSelf)],
  },
  'Scheming Silvertongue': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 2 },
        condition: { kind: 'amountAtLeast', amount: { count: 'lifeGainedThisTurn' }, min: 2 },
        targets: [],
        effects: [prepareSelf],
      },
    ],
  },
  'Tragedy Feaster': {
    abilities: [
      // Infusion: sacrifice a permanent unless you gained life this turn.
      atYourEndStep({ kind: 'not', condition: gainedLife }, [], {
        kind: 'opponentSacrifices',
        you: true,
        filter: {},
      }),
    ],
  },
  'Withering Curse': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: gainedLife,
          then: [{ kind: 'destroyAll' }],
          else: [pump({ each: 'creature' }, -2, -2)],
        },
      ],
    },
  },
  // ------------------------------------------------------------ Witherbloom (B/G)
  'Cauldron of Essence': {
    abilities: [
      when({ on: 'creatureYouControlDies' }, [], loseLife('eachOpponent', 1), gain(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}{G}'), tapSelf: true, sacrificeCreature: true },
        sorcerySpeed: true,
        targets: [creatureCard],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
        label:
          '{1}{B}{G}, {T}, Sacrifice a creature: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery',
      },
    ],
  },
  // Simplified: you choose hand or graveyard before the search.
  "Dina's Guidance": {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'choose',
          options: [
            {
              label: 'Put it into your hand',
              effects: [{ kind: 'searchLibrary', filter: { types: ['Creature'] }, to: 'hand' }],
            },
            {
              label: 'Put it into your graveyard',
              effects: [
                { kind: 'searchLibrary', filter: { types: ['Creature'] }, to: 'graveyard' },
              ],
            },
          ],
        },
      ],
    },
  },
  'Mind Roots': {
    spell: { targets: [you], effects: [{ kind: 'chooseCustom', handler: 'mindRoots' }] },
  },
  'Professor Dellian Fel': {
    abilities: [
      loyalty(2, '+2: You gain 3 life', [], gain(3)),
      loyalty(0, '0: You draw a card and lose 1 life', [], draw(1), loseLife('controller', 1)),
      loyalty(-3, '−3: Destroy target creature', [creature], { kind: 'destroy', what: t0 }),
      loyalty(
        -6,
        '−6: You get an emblem with "Whenever you gain life, target opponent loses that much life."',
        [],
        {
          kind: 'emblem',
          until: 'permanent',
          ability: {
            kind: 'triggered',
            trigger: { on: 'youGainLife' },
            targets: [],
            effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: { event: 'amount' } }],
          },
        },
      ),
    ],
  },
  'Vicious Rivalry': {
    payXLife: true,
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'viciousRivalry' }] },
  },
  'Witherbloom, the Balancer': {
    costReduction: { count: 'creaturesYouControl' },
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { types: [...instantOrSorcery] },
          amount: { count: 'creaturesYouControl' },
        },
      },
    ],
  },
  // ------------------------------------------------------------ colourless
  'The Dawning Archaic': {
    costReduction: { count: 'cardsInGraveyard', types: [...instantOrSorcery] },
    abilities: [
      when(
        { on: 'attacks' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: [...instantOrSorcery] },
            optional: true,
          },
        ],
        { kind: 'castFree', what: t0, exileAfter: true },
      ),
    ],
  },
  'Rancorous Archaic': { entersWithCountersPerColorSpent: true },
  'Sundering Archaic': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { nonland: true, maxManaValue: 'colorsSpent' },
          },
        ],
        { kind: 'exile', what: t0 },
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
        label: "{2}: Put target card from a graveyard on the bottom of its owner's library",
      },
    ],
  },
  'Together as One': {
    spell: {
      targets: [you, { what: 'any' }],
      effects: [
        { kind: 'draw', who: t0, amount: colors },
        { kind: 'damage', amount: colors, to: t1 },
        { kind: 'gainLife', who: 'controller', amount: colors },
      ],
    },
  },
  'Transcendent Archaic': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'if',
            condition: { kind: 'amountAtLeast', amount: colors, min: 1 },
            then: [
              { kind: 'draw', who: 'controller', amount: colors },
              { kind: 'discard', count: 2 },
            ],
          },
        ],
      }),
    ],
  },
  'Biblioplex Tomekeeper': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Target creature becomes prepared',
            targets: [creature],
            effects: [{ kind: 'prepare', what: t0 }],
          },
          {
            label: 'Target creature becomes unprepared',
            targets: [creature],
            effects: [{ kind: 'unprepare', what: t0 }],
          },
          { label: 'Choose no mode', targets: [], effects: [] },
        ],
      },
    ],
  },
  'Diary of Dreams': {
    abilities: [
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'namedCounters',
        name: 'page',
        amount: 1,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true },
        costReduction: { namedCountersOnSource: 'page' },
        targets: [],
        effects: [draw(1)],
        label: '{5}, {T}: Draw a card. This ability costs {1} less for each page counter',
      },
    ],
  },
  'Mage Tower Referee': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', spell: { multicolored: true } }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  'Page, Loose Leaf': {
    abilities: [
      ...tapFor('C'),
      {
        kind: 'activated',
        cost: { discard: true, discardSameName: true },
        fromHand: true,
        targets: [],
        effects: [{ kind: 'revealUntil', filter: { types: [...instantOrSorcery] }, to: 'hand' }],
        label:
          'Grandeur: Discard another card named Page, Loose Leaf: Reveal cards until you reveal an instant or sorcery card; put it into your hand and the rest on the bottom in a random order',
      },
    ],
  },
  "Potioner's Trove": {
    abilities: [
      ...anyColor(),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'castInstantOrSorceryThisTurn' },
        targets: [],
        effects: [gain(2)],
        label:
          "{T}: You gain 2 life. Activate only if you've cast an instant or sorcery spell this turn",
      },
    ],
  },
  'Strixhaven Skycoach': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
      }),
      crew2,
    ],
  },
  // ------------------------------------------------------------ lands
  'Great Hall of the Biblioplex': {
    abilities: [
      ...tapFor('C'),
      // Simplified: the life is paid as damage-like pain when the mana is spent.
      ...greatHallMana,
      {
        kind: 'activated',
        cost: { mana: mana('{5}') },
        condition: { kind: 'not', condition: { kind: 'sourceIsCreature' } },
        targets: [],
        effects: [{ kind: 'custom', handler: 'animateGreatHall' }],
        label: "{5}: This land becomes a 2/4 Wizard creature. It's still a land",
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        condition: { kind: 'sourceIsCreature' },
        targets: [],
        effects: [pump('self', 1, 0)],
      },
    ],
  },
  'Petrified Hamlet': {
    abilities: [onEnter({ kind: 'chooseCustom', handler: 'landName' }), ...tapFor('C')],
  },
  'Skycoach Waypoint': {
    abilities: [
      ...tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'prepare', what: t0 }],
        label: '{3}, {T}: Target creature becomes prepared',
      },
    ],
  },
};
