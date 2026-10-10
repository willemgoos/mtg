import type { CardDefinition, EffectDef, SpellDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { HOB_HUMAN_SOLDIER } from '../hob/tokens.ts';
import { LTR_SPIRIT } from './tokens.ts';
import { atYourEndStep, draw, food, mana, pump, t0, when } from '../blb/helpers.ts';
import {
  amassOrcs,
  chosenOtherThanThis,
  historic,
  legendaryCreature,
  ringTempts,
  whenRingTempts,
  whenYouScry,
} from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): multicolour rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_MULTICOLOUR_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const humanSoldier: EffectDef = { kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 1 };

export const LTR_MULTICOLOUR_RARE: Record<string, Behavior> = {
  // "Whenever a player casts their second spell each turn, you lose 1 life and create a Treasure token."
  'Lotho, Corrupt Shirriff': {
    abilities: [
      when(
        { on: 'anyPlayerSecondSpell' },
        [],
        { kind: 'loseLife', who: 'controller', amount: 1 },
        treasure,
      ),
    ],
  },

  // "Whenever another nontoken creature you control enters, create a Food token." "Sacrifice three Foods: Return target historic
  // card from your graveyard to your hand."
  'Samwise Gamgee': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you', filter: { nontoken: true } }, [], food),
      {
        kind: 'activated',
        cost: { sacrificeArtifacts: 3, sacrificeArtifactsFilter: { subtype: 'Food' } },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: historic }],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
    ],
  },

  // "Whenever you cast a white spell, create a 1/1 white Human Soldier creature token." "Whenever you cast a blue spell, scry 2."
  // "Whenever you cast a red spell, Aragorn deals 3 damage to target opponent." "Whenever you cast a green spell, target creature
  // gets +4/+4 until end of turn."
  'Aragorn, the Uniter': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', spell: { colors: ['W'] } }, [], humanSoldier),
      when({ on: 'castSpell', filter: 'any', spell: { colors: ['U'] } }, [], {
        kind: 'scry',
        amount: 2,
      }),
      when(
        { on: 'castSpell', filter: 'any', spell: { colors: ['R'] } },
        [{ what: 'player', controller: 'opponent' }],
        { kind: 'damage', amount: 3, to: t0 },
      ),
      when(
        { on: 'castSpell', filter: 'any', spell: { colors: ['G'] } },
        [{ what: 'creature' }],
        pump(t0, 4, 4),
      ),
    ],
  },

  // "Whenever you scry, put a +1/+1 counter on each of up to X target creatures, where X is the number of cards looked at while
  // scrying this way." "Whenever a creature you control with a +1/+1 counter on it becomes the target of a spell or ability an
  // opponent controls, you may draw a card."
  'Elrond, Master of Healing': {
    abilities: [
      whenYouScry([{ kind: 'counters', to: { targetsFrom: 0 }, amount: 1 }], {
        targets: [{ what: 'creature', anyNumber: true, optional: true, maxFromAmount: true }],
      }),
      {
        kind: 'triggered',
        trigger: { on: 'yourCreatureTargetedByOpponent' },
        condition: { kind: 'subjectMatches', filter: { minPlusOneCounters: 1 } },
        targets: [],
        effects: [{ kind: 'may', effects: [draw(1)] }],
      },
    ],
  },

  // Haste. "Merry has first strike as long as it's equipped." "Whenever you attack with Merry and another legendary creature, draw
  // a card."
  'Merry, Esquire of Rohan': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'custom', handler: 'ltrSourceEquipped' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'attackedThisCombat', filter: { ...legendaryCreature, other: true } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },

  // Haste. "When Éowyn enters, exile target creature an opponent controls with greater power. Legendary creatures you control gain
  // protection from each of that creature's colors until end of turn."
  'Éowyn, Fearless Knight': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent', filter: { greaterPowerThanSource: true } }],
        custom('ltrProtectFromTargetColors'),
        { kind: 'exile', what: t0 },
      ),
    ],
  },

  // "Arwen enters with an indestructible counter on her." "{1}, Remove an indestructible counter from Arwen: Another target creature
  // gains indestructible until end of turn. Put a +1/+1 counter and a lifelink counter on that creature and a +1/+1 counter and a
  // lifelink counter on Arwen."
  'Arwen, Mortal Queen': {
    entersWithNamedCounters: { indestructible: 1 },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), removeCounters: { name: 'indestructible', count: 1 } },
        targets: [{ what: 'creature', filter: { other: true } }],
        effects: [
          pump(t0, 0, 0, ['indestructible']),
          { kind: 'counters', to: t0, amount: 1 },
          { kind: 'namedCounters', name: 'lifelink', amount: 1, to: t0 },
          { kind: 'counters', to: 'self', amount: 1 },
          { kind: 'namedCounters', name: 'lifelink', amount: 1 },
        ],
      },
    ],
  },

  // "Whenever the Ring tempts you, if you chose a creature other than Galadriel as your Ring-bearer, scry 3." "Whenever you scry, you
  // may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped."
  'Galadriel of Lothlórien': {
    abilities: [
      whenRingTempts([{ kind: 'scry', amount: 3 }], { condition: chosenOtherThanThis }),
      whenYouScry([{ kind: 'may', effects: [custom('ltrRevealLandToBattlefield')] }]),
    ],
  },

  // "Whenever you attack, scry 2, then you may reveal the top card of your library. If a creature card is revealed this way, put it
  // onto the battlefield tapped and attacking. Until your next turn, it gains trample if you control a Dwarf and hexproof if you
  // control an Elf." (If the opponent controls planeswalkers, you choose what it attacks.)
  'Doors of Durin': {
    abilities: [
      when(
        { on: 'youAttack' },
        [],
        { kind: 'scry', amount: 2 },
        {
          kind: 'may',
          effects: [custom('ltrDoorsReveal'), { kind: 'chooseCustom', handler: 'ltrDoorsAttack' }],
        },
      ),
    ],
  },

  // "Whenever Shagrat attacks, attach up to one target Equipment to it. Then amass Orcs X, where X is the number of Equipment
  // attached to Shagrat." (Whoever controls the Equipment.)
  'Shagrat, Loot Bearer': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'permanent', filter: { subtype: 'Equipment' }, optional: true }],
        { kind: 'attach', what: t0, to: 'self' },
        amassOrcs({
          sum: [
            {
              count: 'permanentsYouControl',
              filter: { subtype: 'Equipment', attachedToSource: true },
            },
            {
              count: 'permanentsOpponentsControl',
              filter: { subtype: 'Equipment', attachedToSource: true },
            },
          ],
        }),
      ),
    ],
  },

  // "At the beginning of your end step, if a creature died under your control this turn, the Ring tempts you." "Whenever the Ring
  // tempts you, target opponent reveals cards from the top of their library until they reveal a land card. Put that card onto the
  // battlefield tapped under your control and the rest into their graveyard."
  'Sméagol, Helpful Guide': {
    abilities: [
      atYourEndStep(
        { kind: 'amountAtLeast', amount: { count: 'creaturesYouLostThisTurn' }, min: 1 },
        [],
        ringTempts,
      ),
      whenRingTempts([custom('ltrSmeagolSteal')], {
        targets: [{ what: 'player', controller: 'opponent' }],
      }),
    ],
  },

  // "At the beginning of your end step, choose an opponent. At the beginning of that player's next end step, you draw a card if they
  // didn't attack you that turn. Otherwise, create three 1/1 white Human Soldier creature tokens."
  'Faramir, Prince of Ithilien': {
    abilities: [
      atYourEndStep(
        undefined,
        [],
        custom('ltrAtOpponentNextEndStep', {
          effects: [
            {
              kind: 'if',
              condition: { kind: 'custom', handler: 'ltrNotAttackedYou' },
              then: [draw(1)],
              else: [{ kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 3 }],
            },
          ],
        }),
      ),
    ],
  },

  // "Gimli has indestructible as long as two or more creatures died under your control this turn." "Whenever another creature you
  // control dies, put a +1/+1 counter on Gimli. When this ability resolves for the third time this turn, Gimli fights up to one
  // target creature you don't control." (the reflexive trigger is ability 2)
  'Gimli, Mournful Avenger': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'creaturesYouLostThisTurn' },
            min: 2,
          },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      },
      when(
        { on: 'otherCreatureDies', controller: 'you' },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'noteResolution' },
        {
          kind: 'if',
          condition: { kind: 'resolvedThisTurn', n: 3 },
          then: [{ kind: 'reflexiveTrigger', ability: 2 }],
        },
      ),
      when({ on: 'reflexive' }, [{ what: 'creature', controller: 'opponent', optional: true }], {
        kind: 'fight',
        a: 'self',
        b: t0,
      }),
    ],
  },

  // "This spell costs {1} less to cast for each permanent sacrificed this turn." Haste. "The Balrog can't be blocked except by
  // legendary creatures." "When The Balrog dies, destroy target artifact or creature an opponent controls."
  "The Balrog, Durin's Bane": {
    costReduction: { count: 'permanentsSacrificedThisTurn' },
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { nonlegendary: true } } },
      when(
        { on: 'dies' },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
          },
        ],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },

  // "Whenever you cast an instant or sorcery spell, choose one that hasn't been chosen —" • You may tap or untap target permanent. •
  // Gandalf deals 3 damage to each opponent. • Copy target instant or sorcery spell you control. You may choose new targets for
  // the copy. • Put Gandalf on top of its owner's library.
  'Gandalf the Grey': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [],
        modesOnce: true,
        modes: [
          {
            label: 'You may tap or untap target permanent',
            targets: [{ what: 'permanent' }],
            effects: [
              {
                kind: 'choose',
                title: 'Tap or untap',
                options: [
                  { label: 'Tap it', effects: [{ kind: 'tap', what: t0 }] },
                  { label: 'Untap it', effects: [{ kind: 'untap', what: t0 }] },
                  { label: 'Do neither', effects: [] },
                ],
              },
            ],
          },
          {
            label: 'Gandalf deals 3 damage to each opponent',
            targets: [],
            effects: [{ kind: 'damage', amount: 3, to: 'eachOpponent' }],
          },
          {
            label:
              'Copy target instant or sorcery spell you control. You may choose new targets for the copy',
            targets: [
              { what: 'spell', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } },
            ],
            effects: [{ kind: 'copySpell', what: t0, newTargets: true }],
          },
          {
            label: 'Put Gandalf on top of its owner’s library',
            targets: [],
            effects: [{ kind: 'putInLibrary', what: 'self', position: 'top' }],
          },
        ],
      },
    ],
  },

  // Vigilance, ward {1}. "{T}: Another target creature you control gains protection from the card type of your choice until end of
  // turn." (No card of this game is a Battle, so protection from them does nothing.)
  'Pippin, Guard of the Citadel': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [
          {
            kind: 'choose',
            title: 'Protection from which card type?',
            options: (
              [
                'Artifact',
                'Battle',
                'Creature',
                'Enchantment',
                'Instant',
                'Kindred',
                'Land',
                'Planeswalker',
                'Sorcery',
              ] as const
            ).map((type) => ({
              label: type,
              effects: [custom('ltrProtectFromType', { type })],
            })),
          },
        ],
      },
    ],
  },

  // "Whenever the Ring tempts you, if you chose a creature other than Aragorn as your Ring-bearer, put your choice of a counter from
  // among first strike, vigilance, deathtouch, and lifelink on Aragorn." "Whenever you put one or more counters on Aragorn, put one
  // of each of those kinds of counters on up to one other target creature."
  'Aragorn, Company Leader': {
    abilities: [
      whenRingTempts(
        [
          {
            kind: 'choose',
            title: 'Aragorn: choose a counter',
            options: [
              ['firstStrike', 'First strike'],
              ['vigilance', 'Vigilance'],
              ['deathtouch', 'Deathtouch'],
              ['lifelink', 'Lifelink'],
            ].map(([name, label]) => ({
              label: `${label} counter`,
              effects: [{ kind: 'namedCounters', name: name!, amount: 1 } as EffectDef],
            })),
          },
        ],
        { condition: chosenOtherThanThis },
      ),
      {
        kind: 'triggered',
        trigger: { on: 'countersPutOnSelf' },
        targets: [{ what: 'creature', filter: { other: true }, optional: true }],
        effects: [custom('ltrCountersLikeThose')],
      },
    ],
  },

  // Deathtouch, ward {2}. "Other Spiders you control have deathtouch and ward {2}." "Whenever another creature dealt damage this turn
  // by a Spider you controlled dies, create a token that's a copy of that creature, except it's a Food artifact with '{2}, {T},
  // Sacrifice this token: You gain 3 life,' and it loses all other card types."
  'Shelob, Child of Ungoliant': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Spider' },
          power: 0,
          toughness: 0,
          keywords: ['deathtouch', 'ward'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'creatureDamagedBySpiderDies' },
        targets: [],
        effects: [custom('ltrShelobFood')],
      },
    ],
  },

  // Flying. "Whenever King of the Oathbreakers or another Spirit you control becomes the target of a spell, it phases out."
  // "Whenever King of the Oathbreakers or another Spirit you control phases in, create a tapped 1/1 white Spirit creature token
  // with flying."
  'King of the Oathbreakers': {
    abilities: [
      when({ on: 'spiritYouControlTargetedBySpell' }, [], { kind: 'phaseOut', what: 'subject' }),
      when({ on: 'spiritYouControlPhasesIn' }, [], {
        kind: 'createToken',
        token: LTR_SPIRIT,
        count: 1,
        tapped: true,
      }),
    ],
  },

  // "As long as there are four or more lore counters among Sagas you control, Tom Bombadil has hexproof and indestructible."
  // "Whenever the final chapter ability of a Saga you control resolves, reveal cards from the top of your library until you reveal a
  // Saga card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. This ability
  // triggers only once each turn."
  'Tom Bombadil': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'custom', handler: 'ltrFourLoreCounters' },
          power: 0,
          toughness: 0,
          keywords: ['hexproof', 'indestructible'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'finalChapterResolves' },
        targets: [],
        oncePerTurn: true,
        effects: [{ kind: 'revealUntil', filter: { subtype: 'Saga' }, to: 'battlefield' }],
      },
    ],
  },

  // "Choose an opponent. They look at the top four cards of your library and separate them into a face-down pile and a face-up pile.
  // Put one pile into your hand and the other into your graveyard. The Ring tempts you."
  "Sauron's Ransom": {
    spell: {
      targets: [],
      effects: [{ kind: 'piles', count: 4, opponentSplits: true }, ringTempts],
    },
  },

  // Ward—Sacrifice a legendary artifact or legendary creature. "Whenever an opponent casts a spell, amass Orcs 1." "Whenever an Army
  // you control deals combat damage to a player, the Ring tempts you." "Whenever the Ring tempts you, you may discard your hand. If
  // you do, draw four cards."
  'Sauron, the Dark Lord': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', caster: 'opponent' }, [], amassOrcs(1)),
      when(
        { on: 'creatureYouControlDealsCombatDamage', toPlayer: true, filter: { subtype: 'Army' } },
        [],
        ringTempts,
      ),
      whenRingTempts([{ kind: 'may', effects: [{ kind: 'discardHand' }, draw(4)] }]),
    ],
  },

  // Ward—Discard an enchantment, instant, or sorcery card. "Whenever you cast your second spell each turn, each opponent mills two
  // cards. When one or more cards are milled this way, exile target enchantment, instant, or sorcery card with equal or lesser mana
  // value than that spell from an opponent's graveyard. Copy the exiled card. You may cast the copy without paying its mana cost."
  // (the reflexive trigger is ability 1)
  'Saruman of Many Colors': {
    abilities: [
      when({ on: 'castSpell', filter: 'second' }, [], custom('ltrSarumanMill', { ability: 1 })),
      when(
        { on: 'reflexive' },
        [
          {
            what: 'graveyardCard',
            controller: 'opponent',
            filter: {
              types: ['Enchantment', 'Instant', 'Sorcery'],
              atMostManaValueOfSubject: true,
            },
          },
        ],
        { kind: 'exileCopyCastFree', from: 0, budget: 99 },
      ),
    ],
  },

  // "Activated abilities of lands your opponents control can't be activated unless they're mana abilities." "Sharkey has all activated
  // abilities of lands your opponents control except mana abilities." "Mana of any type can be spent to activate Sharkey's abilities."
  'Sharkey, Tyrant of the Shire': {
    abilities: [{ kind: 'static', effect: { kind: 'ltrOpponentLandAbilities' } }],
  },

  // "Choose one. If you control a Wizard as you cast this spell, you may choose two instead." • Target player draws two cards. •
  // Destroy target artifact. • Flame of Anor deals 5 damage to target creature.
  'Flame of Anor': {
    modes: flameModes(),
  },
};

/** The three modes, then every pair of them (castable only while you control a Wizard). */
function flameModes(): SpellDef[] {
  const single: SpellDef[] = [
    {
      label: 'Target player draws two cards',
      targets: [{ what: 'player' }],
      effects: [{ kind: 'draw', who: t0, amount: 2 }],
    },
    {
      label: 'Destroy target artifact',
      targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
    {
      label: 'Flame of Anor deals 5 damage to target creature',
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'damage', amount: 5, to: t0 }],
    },
  ];
  const wizard = { kind: 'controlsPermanents', filter: { subtype: 'Wizard' }, min: 1 } as const;
  // Each mode's targets are its own instances of "target": the same object may be chosen for both (`ofMode`).
  const pairs: SpellDef[] = [];
  for (let i = 0; i < single.length; i++)
    for (let j = i + 1; j < single.length; j++) {
      const a = single[i]!;
      const b = single[j]!;
      const shift = a.targets.length;
      const targets: TargetSpec[] = [
        ...a.targets.map((t) => ({ ...t, ofMode: 0 })),
        ...b.targets.map((t) => ({ ...t, ofMode: 1 })),
      ];
      const effects: EffectDef[] = [
        ...a.effects,
        ...b.effects.map(
          (e) =>
            JSON.parse(
              JSON.stringify(e).replace(
                /"target":(\d+)/g,
                (_, n: string) => `"target":${Number(n) + shift}`,
              ),
            ) as EffectDef,
        ),
      ];
      pairs.push({ label: `${a.label} + ${b.label}`, targets, effects, onlyIf: wizard });
    }
  return [...single, ...pairs];
}

/** Back faces: keyed by their own names. */
export const LTR_MULTICOLOUR_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_MULTICOLOUR_RARE_TOKENS: CardDefinition[] = [];
