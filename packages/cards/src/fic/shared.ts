import type { AbilityDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { COLORS, tapFor } from '../msc/helpers.ts';
import {
  activated,
  checkland,
  condition,
  draw,
  landcycling,
  may,
  onEnter,
  painland,
  pathway,
  scry,
  slowland,
  snarl,
  surveilland,
  tapland,
  verge,
} from './helpers.ts';

/**
 * Lands and mana the Final Fantasy Commander Brawl decks share (Arena's
 * versions swap in Pathways, slow lands and the like). FIN booster cards are in
 * fin-shared.ts.
 */

const BASIC: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** Shock land: "As this land enters, you may pay 2 life. If you don't, it enters tapped." */
const shockland = (a: ManaType, b: ManaType): Behavior => ({
  entersTapped: true,
  abilities: [
    tapFor(a),
    tapFor(b),
    // Paid as it enters: here a "may" as it enters that untaps it (a simplification).
    onEnter(
      [],
      may({ kind: 'loseLife', who: 'controller', amount: 2 }, { kind: 'untap', what: 'self' }),
    ),
  ],
});
/** Fetch land: "{T}, Pay 1 life, Sacrifice this land: Search for an A or B card, put it onto the battlefield." */
const fetchland = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [
    activated(
      null,
      { tapSelf: true, life: 1, sacrificeSelf: true },
      [],
      [
        {
          kind: 'searchLibrary',
          filter: { types: ['Land'], subtypes: [BASIC[a]!, BASIC[b]!] },
          to: 'battlefield',
        },
      ],
    ),
  ],
});
/** "As this land enters, choose a color. {T}: Add one mana of the chosen color." */
const chosenColorMana: AbilityDef[] = [
  onEnter([], { kind: 'chooseColor' }),
  ...COLORS.map((c) => tapFor(c, { ifChosen: true })),
];

export const FIC_SHARED: Record<string, Behavior> = {
  // ------------------------------------------------------------ colourless
  'Ash Barrens': { abilities: [tapFor('C'), landcycling('{1}')] },
  'Demolition Field': {
    abilities: [
      tapFor('C'),
      activated(
        '{2}',
        { tapSelf: true, sacrificeSelf: true },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Land'], notSupertypes: ['Basic'] },
          },
        ],
        [
          { kind: 'destroy', what: { target: 0 } },
          { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefield', forControllerOf: 0 },
          { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefield' },
        ],
      ),
    ],
  },
  "Bonders' Enclave": {
    abilities: [
      tapFor('C'),
      activated('{3}', { tapSelf: true }, [], [draw(1)], {
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
      }),
    ],
  },
  'Spire of Industry': {
    abilities: [
      tapFor('C'),
      ...COLORS.map((c) =>
        tapFor(c, {
          pain: true,
          condition: { kind: 'controlsPermanents', filter: { types: ['Artifact'] }, min: 1 },
        }),
      ),
    ],
  },
  'Nesting Grounds': {
    abilities: [
      tapFor('C'),
      activated(
        '{1}',
        { tapSelf: true },
        [
          { what: 'permanent', controller: 'you', filter: { hasCounters: true } },
          { what: 'permanent', controller: 'you' },
        ],
        [{ kind: 'custom', handler: 'moveCounter' }],
        { sorcerySpeed: true },
      ),
    ],
  },
  // ------------------------------------------------------------ choose a colour
  'Forsaken Crossroads': {
    entersTapped: true,
    // "If you weren't the starting player, you may untap it instead" of scrying: always scry (a simplification).
    abilities: [...chosenColorMana, onEnter([], scry(1))],
  },
  'Captivating Crossroads': {
    entersTappedIf: {
      kind: 'all',
      of: [condition('firstThreeTurns'), condition('startingPlayer')],
    },
    abilities: chosenColorMana,
  },
  // ------------------------------------------------------------ two colours
  'Battlefield Forge': painland('R', 'W'),
  'Sulfurous Springs': painland('B', 'R'),
  Brushland: painland('G', 'W'),
  'Underground River': painland('U', 'B'),
  'Geothermal Bog': tapland('B', 'R'),
  'Sacred Peaks': tapland('R', 'W'),
  'Sunlit Marsh': tapland('W', 'B'),
  'Contaminated Aquifer': tapland('U', 'B'),
  'Idyllic Beachfront': tapland('W', 'U'),
  'Radiant Grove': tapland('G', 'W'),
  'Tangled Islet': tapland('G', 'U'),
  'Wooded Ridgeline': tapland('R', 'G'),
  'Haunted Ridge': slowland('B', 'R'),
  'Deserted Beach': slowland('W', 'U'),
  'Overgrown Farmland': slowland('G', 'W'),
  'Rockfall Vale': slowland('R', 'G'),
  'Shipwreck Marsh': slowland('U', 'B'),
  'Isolated Chapel': checkland('W', 'B'),
  'Game Trail': snarl('R', 'G'),
  'Shadowy Backstreet': surveilland('W', 'B'),
  'Lush Portico': surveilland('G', 'W'),
  'Meticulous Archive': surveilland('W', 'U'),
  'Raucous Theater': surveilland('B', 'R'),
  'Undercity Sewers': surveilland('U', 'B'),
  'Blazemire Verge': verge('B', 'R'),
  'Gloomlake Verge': verge('U', 'B'),
  'Hushwood Verge': verge('G', 'W'),
  'Blood Crypt': shockland('B', 'R'),
  'Temple Garden': shockland('G', 'W'),
  'Watery Grave': shockland('U', 'B'),
  'Bloodstained Mire': fetchland('B', 'R'),
  'Polluted Delta': fetchland('U', 'B'),
  'Windswept Heath': fetchland('G', 'W'),
  'Nomad Outpost': tapland('R', 'W', 'B'),
  // ------------------------------------------------------------ pathways
  'Blightstep Pathway': pathway(['Blightstep Pathway', 'B'], ['Searstep Pathway', 'R']),
  'Brightclimb Pathway': pathway(['Brightclimb Pathway', 'W'], ['Grimclimb Pathway', 'B']),
  'Needleverge Pathway': pathway(['Needleverge Pathway', 'R'], ['Pillarverge Pathway', 'W']),
  'Barkchannel Pathway': pathway(['Barkchannel Pathway', 'G'], ['Tidechannel Pathway', 'U']),
  'Branchloft Pathway': pathway(['Branchloft Pathway', 'G'], ['Boulderloft Pathway', 'W']),
  'Clearwater Pathway': pathway(['Clearwater Pathway', 'U'], ['Murkwater Pathway', 'B']),
  'Cragcrown Pathway': pathway(['Cragcrown Pathway', 'R'], ['Timbercrown Pathway', 'G']),
  'Hengegate Pathway': pathway(['Hengegate Pathway', 'W'], ['Mistgate Pathway', 'U']),
  // ------------------------------------------------------------ rocks
  'Mind Stone': {
    abilities: [
      tapFor('C'),
      activated('{1}', { tapSelf: true, sacrificeSelf: true }, [], [draw(1)]),
    ],
  },
};

/** Pathway back faces: never on the battlefield (the face is chosen as it enters), but cards of their own. */
export const FIC_SHARED_BACK_FACES: Record<string, Behavior> = Object.fromEntries(
  [
    'Searstep Pathway',
    'Grimclimb Pathway',
    'Pillarverge Pathway',
    'Tidechannel Pathway',
    'Boulderloft Pathway',
    'Murkwater Pathway',
    'Timbercrown Pathway',
    'Mistgate Pathway',
  ].map((name) => [name, {}]),
);
