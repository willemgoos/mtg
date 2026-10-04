import type { AbilityDef, Color } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { onEnter } from './helpers.ts';
import { MSH_JUMPSTART_ANALYZED } from './jumpstart-analyzed.ts';
import { MSH_JUMPSTART_ANIMAL } from './jumpstart-animal.ts';
import { MSH_JUMPSTART_ATLANTIS } from './jumpstart-atlantis.ts';
import { MSH_JUMPSTART_BATTALION } from './jumpstart-battalion.ts';
import { MSH_JUMPSTART_BLINK } from './jumpstart-blink.ts';
import { MSH_JUMPSTART_EQUIPPED } from './jumpstart-equipped.ts';
import { MSH_JUMPSTART_GENIUSES } from './jumpstart-geniuses.ts';
import { MSH_JUMPSTART_GREAT_LAKES } from './jumpstart-great-lakes.ts';
import { MSH_JUMPSTART_HIRE } from './jumpstart-hire.ts';
import { MSH_JUMPSTART_CONNIVING } from './jumpstart-conniving.ts';
import { MSH_JUMPSTART_HYDRA } from './jumpstart-hydra.ts';
import { MSH_JUMPSTART_INCREDIBLE } from './jumpstart-incredible.ts';
import { MSH_JUMPSTART_IRON_MAN } from './jumpstart-iron-man.ts';
import { MSH_JUMPSTART_KANG } from './jumpstart-kang.ts';
import { MSH_JUMPSTART_LETHAL } from './jumpstart-lethal.ts';
import { MSH_JUMPSTART_MARVELOUS } from './jumpstart-marvelous.ts';
import { MSH_JUMPSTART_MASTERS } from './jumpstart-masters.ts';
import { MSH_JUMPSTART_PRECISE } from './jumpstart-precise.ts';
import { MSH_JUMPSTART_PYM } from './jumpstart-pym.ts';
import { MSH_JUMPSTART_RAMPAGING } from './jumpstart-rampaging.ts';
import { MSH_JUMPSTART_RUNAWAYS } from './jumpstart-runaways.ts';
import { MSH_JUMPSTART_SCARLET } from './jumpstart-scarlet.ts';
import { MSH_JUMPSTART_SHIELD } from './jumpstart-shield.ts';
import { MSH_JUMPSTART_SQUADRON } from './jumpstart-squadron.ts';
import { MSH_JUMPSTART_SOARING } from './jumpstart-soaring.ts';
import { MSH_JUMPSTART_THOR } from './jumpstart-thor.ts';
import { MSH_JUMPSTART_TOWERING } from './jumpstart-towering.ts';
import { MSH_JUMPSTART_TRAINED } from './jumpstart-trained.ts';
import { MSH_JUMPSTART_TRICKSTERS } from './jumpstart-tricksters.ts';
import { MSH_JUMPSTART_WAKANDA } from './jumpstart-wakanda.ts';
import { MSH_JUMPSTART_WILD } from './jumpstart-wild.ts';
import { MSH_JUMPSTART_YOUNG_AVENGERS } from './jumpstart-young-avengers.ts';

// Marvel Super Heroes Jumpstart packets (docs/marvel-jumpstart.md): the cards
// they share. Packet-specific cards live in their own msh/jumpstart-*.ts files.

/**
 * Thriving land: enters tapped; as it enters, choose another colour; taps for
 * its own colour or the chosen one.
 */
const thriving = (color: Color): Behavior => ({
  entersTapped: true,
  abilities: [
    onEnter({ kind: 'chooseColor', except: color }),
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
  ...MSH_JUMPSTART_ANALYZED,
  ...MSH_JUMPSTART_ANIMAL,
  ...MSH_JUMPSTART_ATLANTIS,
  ...MSH_JUMPSTART_BATTALION,
  ...MSH_JUMPSTART_BLINK,
  ...MSH_JUMPSTART_EQUIPPED,
  ...MSH_JUMPSTART_GENIUSES,
  ...MSH_JUMPSTART_GREAT_LAKES,
  ...MSH_JUMPSTART_HIRE,
  ...MSH_JUMPSTART_CONNIVING,
  ...MSH_JUMPSTART_HYDRA,
  ...MSH_JUMPSTART_INCREDIBLE,
  ...MSH_JUMPSTART_IRON_MAN,
  ...MSH_JUMPSTART_KANG,
  ...MSH_JUMPSTART_LETHAL,
  ...MSH_JUMPSTART_MARVELOUS,
  ...MSH_JUMPSTART_MASTERS,
  ...MSH_JUMPSTART_PRECISE,
  ...MSH_JUMPSTART_PYM,
  ...MSH_JUMPSTART_RAMPAGING,
  ...MSH_JUMPSTART_RUNAWAYS,
  ...MSH_JUMPSTART_SCARLET,
  ...MSH_JUMPSTART_SHIELD,
  ...MSH_JUMPSTART_SQUADRON,
  ...MSH_JUMPSTART_SOARING,
  ...MSH_JUMPSTART_THOR,
  ...MSH_JUMPSTART_TOWERING,
  ...MSH_JUMPSTART_TRAINED,
  ...MSH_JUMPSTART_TRICKSTERS,
  ...MSH_JUMPSTART_WAKANDA,
  ...MSH_JUMPSTART_WILD,
  ...MSH_JUMPSTART_YOUNG_AVENGERS,
};
