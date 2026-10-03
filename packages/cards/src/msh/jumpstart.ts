import type { AbilityDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { onEnter } from './helpers.ts';
import { MSH_JUMPSTART_HYDRA } from './jumpstart-hydra.ts';

// Marvel Super Heroes Jumpstart packets (docs/marvel-jumpstart.md): the cards
// they share. Packet-specific cards live in their own msh/jumpstart-*.ts files.

/**
 * Thriving land: enters tapped; as it enters, choose another colour; taps for
 * its own colour or the chosen one. (The colour may be chosen as its own.)
 */
const thriving = (color: ManaType): Behavior => ({
  entersTapped: true,
  abilities: [
    onEnter({ kind: 'chooseColor' }),
    { kind: 'mana', cost: { tapSelf: true }, produces: color },
    ...(['W', 'U', 'B', 'R', 'G'] as const)
      .filter((c) => c !== color)
      .map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
  ],
});

export const MSH_JUMPSTART: Record<string, Behavior> = {
  'Thriving Heath': thriving('W'),
  'Thriving Isle': thriving('U'),
  'Thriving Moor': thriving('B'),
  'Thriving Bluff': thriving('R'),
  'Thriving Grove': thriving('G'),
  ...MSH_JUMPSTART_HYDRA,
};
