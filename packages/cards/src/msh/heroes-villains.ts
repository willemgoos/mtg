import type { Behavior } from '../build.ts';
import {
  connive,
  creature,
  draw,
  drain,
  mana,
  onEnter,
  powerUp,
  powerUpTargeting,
  prowess,
  secondDraw,
  spell,
  t0,
  t1,
  teamwork,
  teamworkModes,
  theirCreature,
  transformAbility,
  villain,
  yourCreature,
  yours,
} from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) cards for the first two decks: Heroes Unite (R/W
 * teamwork and power-up) and Villainous Schemes (U/B connive). Printed
 * characteristics come from Scryfall; only rules text lives here.
 */

const anOpponent = { what: 'player', controller: 'opponent' } as const;
const villainCard = { subtype: 'Villain' };

export const HEROES_VILLAINS: Record<string, Behavior> = {
  // ------------------------------------------------------------ Heroes Unite (R/W)
  'Agent Maria Hill': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'tappedForTeamwork' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }, draw(1)],
      },
    ],
  },
  'Agent of Atlas': { abilities: [prowess] },
  'Kree Commandos': { abilities: [prowess] },
  'Crimson Operative': {
    abilities: [prowess, onEnter({ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' })],
  },
  'Web Up': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        effects: [{ kind: 'exileUntilSourceLeaves', what: t0 }],
      },
    ],
  },
  'Brave Brawler': {
    abilities: [powerUp('{4}{W}', { kind: 'counters', to: 'self', amount: 2 })],
  },
  'Hero in Training': {
    abilities: [
      onEnter(draw(1), {
        kind: 'if',
        condition: { kind: 'controlsAnother', subtype: 'Hero' },
        then: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
      }),
    ],
  },
  // "You may sacrifice an artifact or discard a card": only the discard is offered.
  "K'un-Lun Warrior": {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'discard', count: 1 }, draw(1)],
      }),
    ],
  },
  'Volcanic Villain': {
    abilities: [powerUp('{5}{R}', { kind: 'counters', to: 'self', amount: 2 })],
  },
  'Wakandan Drone Flock': { abilities: [onEnter({ kind: 'scry', amount: 2 })] },
  'Okoye, Dora Milaje Leader': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'soldier-token', count: 2 }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { token: true, attacking: true },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
    ],
  },
  'Human Torch, Johnny Storm': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawCard', whose: 'yours' },
        condition: { kind: 'controlsAnother', subtype: 'Hero' },
        targets: [anOpponent],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
      powerUp('{6}{R}', { kind: 'counters', to: 'self', amount: 3 }),
    ],
  },
  'War Machine, Legacy of Iron': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'pump', to: t0, power: { powerOf: 'self' }, toughness: 0 }],
      },
    ],
  },
  'Thor Odinson': { abilities: [prowess, prowess] },
  'Monica Rambeau': { abilities: [prowess, transformAbility('{2}{R}{W}{W}')] },
  'Helicarrier Strike': teamwork(
    2,
    {
      targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      effects: [{ kind: 'damage', amount: 2, to: t0 }],
    },
    {
      targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      effects: [{ kind: 'damage', amount: 4, to: t0 }],
    },
  ),
  'HULK SMASH!': teamworkModes(
    4,
    {
      targets: [{ what: 'permanent', filter: { types: ['Artifact'], notTypes: ['Creature'] } }],
      effects: [{ kind: 'destroy', what: t0 }],
      label: 'Destroy target noncreature artifact',
    },
    {
      targets: [yourCreature, theirCreature],
      effects: [{ kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 }],
      label: 'Your creature deals damage equal to its power',
    },
  ),
  'Repulsor Blast': teamwork(
    2,
    { targets: [creature], effects: [{ kind: 'damage', amount: 5, to: t0 }] },
    {
      targets: [creature],
      effects: [
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'damage', amount: 2, to: { controllerOf: 0 } },
      ],
    },
  ),
  'Team Tactics': teamwork(
    1,
    {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['doubleStrike'] }],
    },
    {
      targets: [creature],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['doubleStrike', 'trample'] },
      ],
    },
  ),
  'Take Up the Shield': spell(
    [creature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['lifelink', 'indestructible'] },
  ),
  "Murdock's Crusade": teamworkModes(
    4,
    {
      targets: [{ what: 'creature', filter: { minToughness: 4 } }],
      effects: [{ kind: 'exile', what: t0 }],
      label: 'Street Justice: exile a creature with toughness 4 or greater',
    },
    {
      targets: [{ what: 'permanent', filter: { types: ['Enchantment'], minManaValue: 4 } }],
      effects: [{ kind: 'exile', what: t0 }],
      label: 'Legal Justice: exile an enchantment with mana value 4 or greater',
    },
  ),
  'Super Villain Lockup': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'opponent', filter: { tapped: true } }],
        effects: [{ kind: 'exileUntilSourceLeaves', what: t0 }],
      },
    ],
  },
  'Hire a Crew': spell([], villain(), { kind: 'pump', to: yours, power: 1, toughness: 0 }),

  // ------------------------------------------------------- Villainous Schemes (U/B)
  'Red Room Recruit': { abilities: [onEnter(connive)] },
  'Aerial Doombot': {
    abilities: [powerUp('{5}{U}', { kind: 'counters', to: 'self', amount: 3 })],
  },
  'Bold Biochemist': {
    abilities: [powerUp('{5}{U}', { kind: 'counters', to: 'self', amount: 1 }, draw(2))],
  },
  'Agents of HYDRA': {
    abilities: [{ kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [villain()] }],
  },
  'HYDRA Troopers': {
    abilities: [
      onEnter({
        kind: 'if',
        condition: { kind: 'graveyardCount', min: 2, types: ['Creature'] },
        then: [villain(1, true)],
        else: [{ kind: 'mill', count: 2 }],
      }),
    ],
  },
  'Ninja of the Hand': {
    abilities: [
      powerUp(
        '{4}{B}',
        { kind: 'discard', count: 1, who: 'eachOpponent' },
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
  'Atlantean Cavalry': {
    abilities: [secondDraw([], { kind: 'counters', to: 'self', amount: 1 })],
  },
  'Madame Masque': { abilities: [onEnter(connive), secondDraw([], villain())] },
  'Kang, Temporal Tyrant': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: [connive] },
      secondDraw([], ...drain(1)),
    ],
  },
  // "Do this only once each turn": it triggers once each turn, even if declined.
  'Baron Strucker, HYDRA Overlord': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: villainCard, amount: 1 } },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: villainCard },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'may', effects: [{ kind: 'connive', what: 'subject' }] }],
      },
    ],
  },
  'Crossbones, Malicious Mercenary': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: villainCard },
        oncePerTurn: true,
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 1 },
          { kind: 'damage', amount: 2, to: 'eachOpponent' },
        ],
      },
    ],
  },
  'Yellowjacket, Heartless Marauder': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: villainCard },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0, keywords: ['lifelink'] }],
      },
    ],
  },
  'Giant-Sized Flying Ant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            targets: [{ what: 'permanent', filter: { nonland: true } }],
            effects: [{ kind: 'tap', what: t0 }],
            label: 'Tap target nonland permanent',
          },
          {
            targets: [{ what: 'permanent', filter: { nonland: true } }],
            effects: [{ kind: 'untap', what: t0 }],
            label: 'Untap target nonland permanent',
          },
        ],
      },
    ],
  },
  "Kingpin's Enforcers": {
    abilities: [
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}{B}'),
          sacrificePermanent: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
        },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Unliving Legionnaire': {
    abilities: [
      powerUpTargeting(
        '{5}{B}{B}',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'] },
            optional: true,
          },
        ],
        { kind: 'returnToHand', what: t0 },
        { kind: 'counters', to: 'self', amount: 2 },
      ),
    ],
  },
  'Ghost, Spectral Saboteur': {
    abilities: [{ kind: 'static', effect: { kind: 'cantBeBlocked' } }],
  },
  "Trickster's Stratagem": {
    spell: {
      targets: [theirCreature, { ...yourCreature, optional: true }],
      effects: [
        {
          kind: 'choose',
          ownerOf: 0,
          options: [
            {
              label: 'Second from the top',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'second' }],
            },
            {
              label: 'On the bottom',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
            },
          ],
        },
        { kind: 'connive', what: t1 },
      ],
    },
  },
  'Visions of Villainy': {
    ...spell([], draw(2), { kind: 'loseLife', who: 'controller', amount: 2 }),
    costReduction: { count: 'creaturesYouControl', subtype: 'Villain', max: 1 },
  },
  'Dark Deed': spell([creature], { kind: 'pump', to: t0, power: -4, toughness: -4 }),
  'Hour of Defeat': spell(
    [creature],
    { kind: 'destroy', what: t0 },
    { kind: 'surveil', amount: 1 },
  ),
  Depower: {
    ...spell([creature], { kind: 'pump', to: t0, power: -4, toughness: 0 }, draw(1)),
    costReductionIfTarget: { filter: { attacking: true }, amount: 2 },
  },
  "Widow's Bite": teamworkModes(
    3,
    {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['deathtouch'] }],
      label: 'Target creature gains deathtouch',
    },
    {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: -2, toughness: -2 }],
      label: 'Target creature gets -2/-2',
    },
  ),
  'Cruel Alliance': teamwork(
    2,
    {
      targets: [{ what: 'creature', filter: { maxManaValue: 3 } }],
      effects: [{ kind: 'exile', what: t0 }],
    },
    {
      targets: [creature],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'gainLife', who: 'controller', amount: 3 },
      ],
    },
  ),
  'Futurist Forge': {
    abilities: [
      onEnter(draw(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}'), sacrificeSelf: true },
        targets: [],
        effects: [draw(2)],
      },
    ],
  },
  'We Say Thee Nay!': teamwork(
    2,
    {
      targets: [{ what: 'spell' }],
      effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
    },
    {
      targets: [{ what: 'spell' }],
      effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{4}') }],
    },
  ),
};

/** Back faces of the double-faced cards above, keyed by the back face's name. */
export const HEROES_VILLAINS_BACKS: Record<string, Behavior> = {
  'Photon, Living Light': {
    abilities: [
      prowess,
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { other: true } },
            amount: 1,
          },
        ],
      },
    ],
  },
};
