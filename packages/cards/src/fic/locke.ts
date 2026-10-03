import type { Behavior } from '../build.ts';
import { custom, mana, onEnter, staticAbility, t0, t1, when, yourEquipment } from './helpers.ts';

/**
 * Brawl Locke, Treasure Hunter (12g), the Arena Store Brawl deck (B/R):
 * noncreature spells, Wizards and Treasure. Its cards that aren't Final
 * Fantasy booster cards or shared lands.
 */

export const LOCKE: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Locke, Treasure Hunter': {
    abilities: [
      staticAbility({ kind: 'cantBeBlockedBy', filter: { greaterPowerThanSource: true } }),
      when({ on: 'attacks' }, [], custom('mug')),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Yuffie, Materia Hunter': {
    // Ninjutsu as sneak: cast for {1}{R} during your declare blockers step (not put in uncast, a simplification).
    sneak: mana('{1}{R}'),
    abilities: [
      onEnter(
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact'], notTypes: ['Creature'] },
            optional: true,
          },
          yourEquipment({ optional: true }),
        ],
        { kind: 'gainControl', what: t0, whileSource: true },
        { kind: 'attach', to: 'self', what: t1 },
      ),
    ],
  },
};
