import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { landcycling } from '../fic/helpers.ts';
import { mode } from '../fin/helpers.ts';

/**
 * Reality Fracture (17a): black. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_BLACK_BACKS. See docs/reality-fracture-plan.md.
 */

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const creatureOrWalker = { types: ['Creature' as const, 'Planeswalker' as const] };
const prepareSelf: EffectDef = { kind: 'prepare', what: 'self' };
const sevenCards = { kind: 'graveyardCount', min: 7 } as const;
const damageOpponents = (amount: number): EffectDef => ({
  kind: 'damage',
  amount,
  to: 'eachOpponent',
});

export const FRA_BLACK: Record<string, Behavior> = {
  // "When this creature enters or dies, you gain 2 life." Basic landcycling {2}.
  'Apex Witchstalker': {
    abilities: [onEnter(gain(2)), when({ on: 'dies' }, [], gain(2)), landcycling('{2}')],
  },
  // "At the beginning of each end step, if three or more creatures died this turn, this creature becomes prepared."
  'Bloodline Recollector': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'creaturesDiedAtLeast', min: 3 },
        targets: [],
        effects: [prepareSelf],
      },
    ],
  },
  'Break Under Pressure': {
    spell: {
      targets: [opponent],
      effects: [
        {
          kind: 'opponentSacrifices',
          filter: creatureOrWalker,
          greatestManaValue: true,
        },
        gain(2),
      ],
    },
  },
  'Cast Away Doubt': {
    spell: {
      targets: [],
      effects: [draw(2), { kind: 'damage', amount: 2, to: 'eachPlayer' }],
    },
  },
  // "Whenever you cast a spell that targets an opponent or a creature an opponent controls, put a +1/+1 counter on Danitha."
  'Danitha, Spear of Agony': {
    abilities: [
      when({ on: 'castSpell', filter: 'targetsOpponentOrTheirCreature' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  // "When this creature enters, mill three cards. This creature gets +2/+0 for every seven cards in your graveyard."
  'Dark Matter Manipulator': {
    abilities: [
      onEnter({ kind: 'mill', count: 3 }),
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { multiply: 2, amount: { floorDiv: 7, amount: { count: 'cardsInGraveyard' } } },
          toughness: 0,
        },
      },
    ],
  },
  // "At the beginning of combat on your turn, if two or more creatures died this turn, return this card from your graveyard to the battlefield."
  'Darklight Phoenix': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'creaturesDiedAtLeast', min: 2 },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield' }],
      },
    ],
  },
  'Extended Absence': {
    spell: {
      targets: [{ what: 'permanent', filter: creatureOrWalker }],
      effects: [{ kind: 'exile', what: t0 }, damageOpponents(1), gain(1)],
    },
  },
  // "{4}{B}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield tapped with a +1/+1 counter on her."
  'Gallia, Tragic Host': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{4}{B}'), exileFromGraveyard: { types: ['Creature'] } },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true, counters: 1 }],
        label:
          '{4}{B}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield tapped with a +1/+1 counter on her',
      },
    ],
  },
  // "When this Equipment enters, you may pay {2}. When you do, for each opponent, destroy up to one target
  // creature or planeswalker that player controls." (the reflexive trigger is ability 1)
  "Lich's Relic": {
    abilities: [
      onEnter({
        kind: 'may',
        cost: mana('{2}'),
        effects: [{ kind: 'reflexiveTrigger', ability: 1 }],
      }),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: creatureOrWalker,
            optional: true,
          },
        ],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 1 },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
        label: 'Equip {2}',
      },
    ],
  },
  // "Whenever another creature or planeswalker you control enters, mill two cards."
  // "Exhaust — {5}{B}: Return target creature or planeswalker card from your graveyard to the battlefield.
  // Put a +1/+1 counter on Liliana. Activate only as a sorcery."
  'Liliana the Repentant': {
    abilities: [
      when({ on: 'otherPermanentEtb', filter: creatureOrWalker }, [], { kind: 'mill', count: 2 }),
      {
        kind: 'activated',
        cost: { mana: mana('{5}{B}') },
        sorcerySpeed: true,
        once: true,
        targets: [{ what: 'graveyardCard', controller: 'you', filter: creatureOrWalker }],
        effects: [
          { kind: 'returnToBattlefield', what: t0 },
          { kind: 'counters', to: 'self', amount: 1 },
        ],
        label:
          'Exhaust — {5}{B}: Return target creature or planeswalker card from your graveyard to the battlefield',
      },
    ],
  },
  // "If Loot's power is negative, he assigns combat damage as though his power were positive."
  // "Threshold — Sacrifice another creature or planeswalker: Loot gets -2/-0 until end of turn.
  // Activate only if there are seven or more cards in your graveyard."
  'Loot, the Anomaly': {
    abilities: [
      { kind: 'static', effect: { kind: 'negativePowerAsPositive' } },
      {
        kind: 'activated',
        cost: { sacrificePermanent: { ...creatureOrWalker, other: true } },
        condition: sevenCards,
        targets: [],
        effects: [pump('self', -2, 0)],
        label:
          'Threshold — Sacrifice another creature or planeswalker: Loot gets -2/-0 until end of turn',
      },
    ],
  },
  // "When Mabel enters, remove up to three counters from another target creature or planeswalker."
  'Mabel, Bitter Recluse': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'permanent', filter: { ...creatureOrWalker, other: true } }], {
        kind: 'chooseCustom',
        handler: 'fraMabelCounters',
        params: { left: 3 },
      }),
    ],
  },
  // "Whenever another creature or planeswalker you control dies, Massacre Girl deals 1 damage to target opponent
  // and you gain 1 life. Whenever an opponent is dealt noncombat damage, put a +1/+1 counter on Massacre Girl."
  'Massacre Girl, Most Wanted': {
    abilities: [
      when(
        { on: 'permanentYouControlDies', filter: creatureOrWalker, other: true },
        [opponent],
        { kind: 'damage', amount: 1, to: t0 },
        gain(1),
      ),
      when({ on: 'opponentDealtNoncombatDamage' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Multiply by Zero': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, setBase: true }],
    },
  },
  // "Threshold — You can't cast this spell unless there are seven or more cards in your graveyard."
  // "{B}, Discard this card: Target creature gets -3/-1 until end of turn."
  'Proft, Sinister Mastermind': {
    castOnlyIf: sevenCards,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{B}'), discardSelf: true },
        fromHand: true,
        targets: [creature],
        effects: [pump(t0, -3, -1)],
        label: '{B}, Discard this card: Target creature gets -3/-1 until end of turn',
      },
    ],
  },
  'Rampart Hunter': {
    abilities: [when({ on: 'etb' }, [creature], pump(t0, 2, 2, ['deathtouch']))],
  },
  'Rank Rat': {
    abilities: [onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' })],
  },
  'Rise of the Deathbringer': {
    modes: [
      mode(
        'Draw cards equal to the greatest power among creatures you control. You lose life equal to the number of cards drawn this way',
        [],
        { kind: 'draw', who: 'controller', amount: { count: 'greatestPowerYouControl' } },
        { kind: 'loseLife', who: 'controller', amount: { count: 'greatestPowerYouControl' } },
      ),
      mode('All creatures get -3/-3 until end of turn', [], pump({ each: 'creature' }, -3, -3)),
    ],
  },
  // "Whenever this creature attacks, it deals 1 damage to each opponent and you gain 1 life."
  'Screeching Soulbreaker': {
    abilities: [when({ on: 'attacks' }, [], damageOpponents(1), gain(1))],
  },
  // "As an additional cost to cast this spell, sacrifice a creature or planeswalker or pay {3}."
  'Silence the Echo': {
    sacrificeOrPay: mana('{3}'),
    sacrificeToCastFilter: creatureOrWalker,
    spell: {
      targets: [{ what: 'permanent', filter: creatureOrWalker }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  'Terminal Criticism': {
    spell: {
      targets: [{ what: 'permanent', filter: { ...creatureOrWalker, colors: ['U', 'R'] } }],
      effects: [{ kind: 'destroy', what: t0 }, gain(1)],
    },
  },
  // "{3}{B}, Exile this card from your graveyard: Return another target creature card from your graveyard to your hand."
  'Theoretical Necromancer': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{B}'), exileSelf: true },
        fromGraveyard: true,
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], other: true },
          },
        ],
        effects: [{ kind: 'returnToHand', what: t0 }],
        label:
          '{3}{B}, Exile this card from your graveyard: Return another target creature card from your graveyard to your hand',
      },
    ],
  },
  // "When Tinybones enters, each opponent discards a card. Whenever a player discards one or more cards,
  // Tinybones deals 1 damage to each opponent."
  'Tinybones, Pocket Nuisance': {
    abilities: [
      onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' }),
      {
        kind: 'triggered',
        trigger: { on: 'playerDiscards' },
        batch: true,
        targets: [],
        effects: [damageOpponents(1)],
      },
    ],
  },
  // "This creature enters prepared." Threshold — "This creature gets +1/+1 as long as there are seven or more
  // cards in your graveyard."
  'Void Extrapolator': {
    entersPrepared: true,
    abilities: [
      { kind: 'static', effect: { kind: 'while', condition: sevenCards, power: 1, toughness: 1 } },
    ],
  },
  // "When Winter enters, you may sacrifice a creature or planeswalker. When you do, each opponent sacrifices a
  // creature of their choice. Winter gets +1/+0 for each creature and planeswalker card in your graveyard."
  'Winter, Tormented Loner': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'opponentSacrifices',
            you: true,
            filter: creatureOrWalker,
            then: [{ kind: 'opponentSacrifices' }],
          },
        ],
      }),
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'cardsInGraveyard', types: ['Creature', 'Planeswalker'] },
          toughness: 0,
        },
      },
    ],
  },
  // Vanilla.
  'Yargle, Glutton of Urborg': {},
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_BLACK_BACKS: Record<string, Behavior> = {
  // "Target player draws three cards and loses 3 life."
  'Ancestral Craving (Bloodline Recollector)': {
    spell: {
      targets: [{ what: 'player' }],
      effects: [
        { kind: 'draw', who: t0, amount: 3 },
        { kind: 'loseLife', who: t0, amount: 3 },
      ],
    },
  },
  'Omit Variables (Void Extrapolator)': {
    spell: { targets: [], effects: [{ kind: 'mill', count: 3 }] },
  },
};

/** Tokens only this group's cards make. */
export const FRA_BLACK_TOKENS: CardDefinition[] = [];
