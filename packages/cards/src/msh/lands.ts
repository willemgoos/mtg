import type { ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { onEnter } from './helpers.ts';

/** The set's gain-lands: enter tapped, gain 1 life, tap for either colour. */
const GAIN_LANDS: [string, ManaType, ManaType][] = [
  ['Avengers Hangar', 'W', 'U'],
  ['A.I.M. Labs', 'U', 'B'],
  ["Hell's Kitchen", 'B', 'R'],
  ['Los Diablos Missile Base', 'R', 'G'],
  ['Birnin Zana Plaza', 'G', 'W'],
  ['Fisk Tower', 'W', 'B'],
  ['Stark Industries', 'U', 'R'],
  ['Subterranean Cavern', 'B', 'G'],
  ['Asgardian Citadel', 'R', 'W'],
  ['Pym Technologies', 'G', 'U'],
];

export const MARVEL_LANDS: Record<string, Behavior> = Object.fromEntries(
  GAIN_LANDS.map(([name, a, b]) => [
    name,
    {
      entersTapped: true,
      abilities: [
        onEnter({ kind: 'gainLife', who: 'controller', amount: 1 }),
        { kind: 'mana', cost: { tapSelf: true }, produces: a },
        { kind: 'mana', cost: { tapSelf: true }, produces: b },
      ],
    },
  ]),
);
