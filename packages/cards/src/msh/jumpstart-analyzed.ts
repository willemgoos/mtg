import type { Behavior } from '../build.ts';
import { mana } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Analyzed packet (docs/marvel-jumpstart.md): the cards it was
// missing. TVA Bureaucrat, Timeline Inquiry and Quantum Reduction come from other packets;
// Victor Mancha, Runaway is shared with Runaways and Ultron. Keywords (defender, vigilance,
// flying) come from Scryfall.

export const MSH_JUMPSTART_ANALYZED: Record<string, Behavior> = {
  // "Whenever you cast a spell using teamwork, create a 1/1 colorless Robot Hero artifact
  // creature token with flying."
  'Virtual Assistant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', usingTeamwork: true },
        targets: [],
        effects: [{ kind: 'createToken', token: 'robot-hero-flying-token', count: 1 }],
      },
    ],
  },
  // "{1}, {T}: Copy target activated or triggered ability you control from a creature source.
  // You may choose new targets for the copy."
  'Echo, Perceptive Prodigy': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [{ what: 'spell', controller: 'you', abilitiesOnly: true, creatureSource: true }],
        effects: [
          { kind: 'custom', handler: 'copyTargetStackAbility' },
          { kind: 'chooseNewTargets' },
        ],
        label: '{1}, {T}: Copy an ability',
      },
    ],
  },
  // "Whenever you cast a noncreature spell, put a +1/+1 counter on Machine Man and he gains
  // flying until end of turn."
  'Machine Man, Model X-51': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 1 },
          { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['flying'] },
        ],
      },
    ],
  },
  // "When Victor Mancha enters, exile target card from your graveyard. You may play it for as
  // long as you control Victor Mancha."
  'Victor Mancha, Runaway': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'graveyardCard', controller: 'you' }],
        effects: [{ kind: 'custom', handler: 'exilePlayableWhileControlling' }],
      },
    ],
  },
  // "Once during each of your turns, you may cast a noncreature or Robot spell from your hand
  // without paying its mana cost."
  'Vision, Spectral Synthezoid': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'freeCastOncePerYourTurn',
          filter: { anyOf: [{ notTypes: ['Creature'] }, { subtype: 'Robot' }] },
        },
      },
    ],
  },
};
