import type { AbilityDef, CardDefinition, Color, EffectDef, ManaType } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, onEnter, t0, when } from '../blb/helpers.ts';
import { loyaltyAbility } from '../fra/helpers.ts';
import { equip, tapFor } from '../fin/helpers.ts';
import { unlessYouControlType } from '../msc/helpers.ts';
import { controlsDragon, DRAGON } from '../tdm-vocab.ts';
import { TDM_BIRD, TDM_ELEPHANT, TDM_SPIRIT, TDM_WARRIOR, TDM_ZOMBIE_DRUID } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): artifacts, Monuments, colourless planeswalker and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_COLORLESS_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });

/** "{T}: Add one mana of any color." as five mana abilities, optionally restricted to a kind of spell or a condition. */
const anyColor = (extra: Partial<Extract<AbilityDef, { kind: 'mana' }>> = {}): AbilityDef[] =>
  (COLORS as ManaType[]).map((produces) => ({
    kind: 'mana',
    cost: { tapSelf: true },
    produces,
    ...extra,
  }));

/** The tri-colour lands: "This land enters tapped. {T}: Add {A}, {B}, or {C}." */
const tapLand = (...colors: ManaType[]): Behavior => ({
  entersTapped: true,
  abilities: tapFor(...colors),
});

/** The "enters tapped unless you control a <type> or a <type>" lands with a mana ability and an activated ability. */
const villageLand = (
  makes: ManaType,
  unless: [ManaType, ManaType],
  activated: AbilityDef,
): Behavior => ({
  entersTappedIf: unlessYouControlType(...unless),
  abilities: [...tapFor(makes), activated],
});

/**
 * A Monument: "When this artifact enters, search your library for a basic <type>, <type>, or <type> card, reveal it, put it into your
 * hand, then shuffle. <cost>, {T}, Sacrifice this artifact: <effect>. Activate only as a sorcery."
 */
const monument = (types: [string, string, string], cost: string, effect: EffectDef): Behavior => ({
  abilities: [
    onEnter({
      kind: 'searchLibrary',
      filter: { types: ['Land'], supertypes: ['Basic'], subtypes: types },
      to: 'hand',
      reveal: true,
    }),
    {
      kind: 'activated',
      cost: { mana: mana(cost), tapSelf: true, sacrificeSelf: true },
      sorcerySpeed: true,
      targets: [],
      effects: [effect],
    },
  ],
});

const token = (id: string, count: number, extra: Partial<EffectDef> = {}): EffectDef =>
  ({ kind: 'createToken', token: id, count, ...extra }) as EffectDef;

/** A coloured permanent: "one or more colors". */
const COLORED = { colors: COLORS };
/** A colorless spell. */
const COLORLESS = { notColors: COLORS };

export const TDM_COLORLESS: Record<string, Behavior> = {
  // "When this artifact enters, search your library for a basic Plains, Swamp, or Forest card, reveal it, put it into your hand, then
  // shuffle. {1}{W}{B}{G}, {T}, Sacrifice this artifact: Create an X/X white Spirit creature token, where X is the greatest
  // toughness among creatures you control. Activate only as a sorcery."
  'Abzan Monument': monument(
    ['Plains', 'Swamp', 'Forest'],
    '{1}{W}{B}{G}',
    token(TDM_SPIRIT, 1, { pt: { count: 'greatestToughnessYouControl' } }),
  ),
  // "Flying, vigilance. Whenever this creature attacks, surveil 1."
  'Boulderborn Dragon': {
    abilities: [when({ on: 'attacks' }, [], { kind: 'surveil', amount: 1 })],
  },
  // "This land enters tapped unless you control a Plains or an Island. {T}: Add {R}. {3}{R}, {T}: Exile the top card of your
  // library. Until the end of your next turn, you may play that card."
  'Cori Mountain Monastery': villageLand('R', ['W', 'U'], {
    kind: 'activated',
    cost: { mana: mana('{3}{R}'), tapSelf: true },
    targets: [],
    effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }],
  }),
  // "This land enters tapped unless you control a Swamp or a Mountain. {T}: Add {W}. {2}{W}, {T}: Whenever you attack this turn,
  // create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next end step."
  'Dalkovan Encampment': villageLand('W', ['B', 'R'], {
    kind: 'activated',
    cost: { mana: mana('{2}{W}'), tapSelf: true },
    targets: [],
    effects: [
      {
        kind: 'emblem',
        until: 'endOfTurn',
        ability: {
          kind: 'triggered',
          trigger: { on: 'youAttack' },
          targets: [],
          effects: [
            token(TDM_WARRIOR, 2, { tapped: true, attacking: true, sacrificeAt: 'nextEndStep' }),
          ],
        },
        label:
          'Whenever you attack, create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next end step.',
      },
    ],
  }),
  // "Equipped creature gets +2/+2 and has hexproof from monocolored. Equip {4}. This ability costs {1} less to activate for each color
  // of the creature it targets."
  'Dragonfire Blade': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 2, keywords: ['hexproofFromMonocolored'] },
      },
      { ...equip('{4}'), costReductionPerTargetColor: true } as AbilityDef,
    ],
  },
  // "Each Dragon you control enters with an additional +1/+1 counter on it. {T}: Add one mana of any color."
  'Dragonstorm Globe': {
    abilities: [
      { kind: 'static', effect: { kind: 'entersWithExtraCounter', filter: DRAGON } },
      ...anyColor(),
    ],
  },
  // "When this creature enters, you may search your library for a basic land card, reveal it, then shuffle and put that card on top.
  // If you control a Dragon, put that card onto the battlefield tapped instead."
  'Embermouth Sentinel': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'if',
            condition: controlsDragon,
            then: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', reveal: true }],
            else: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'libraryTop', reveal: true }],
          },
        ],
      }),
    ],
  },
  // "Reach. {2}, {T}: Put target card from a graveyard on the bottom of its owner's library."
  'Jade-Cast Sentinel': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
      },
    ],
  },
  // "When this artifact enters, search your library for a basic Island, Mountain, or Plains card, reveal it, put it into your hand,
  // then shuffle. {1}{U}{R}{W}, {T}, Sacrifice this artifact: Create two 1/1 white Bird creature tokens with flying. Activate only as a
  // sorcery."
  'Jeskai Monument': monument(['Island', 'Mountain', 'Plains'], '{1}{U}{R}{W}', token(TDM_BIRD, 2)),
  // "This land enters tapped unless you control an Island or a Swamp. {T}: Add {G}. {3}{G}, {T}: Surveil 2."
  'Kishla Village': villageLand('G', ['U', 'B'], {
    kind: 'activated',
    cost: { mana: mana('{3}{G}'), tapSelf: true },
    targets: [],
    effects: [{ kind: 'surveil', amount: 2 }],
  }),
  // "{T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a Dragon spell or an Omen spell. {4}, {T}, Sacrifice
  // this land: Search your library for a Dragon card, reveal it, put it into your hand, then shuffle."
  'Maelstrom of the Spirit Dragon': {
    abilities: [
      ...tapFor('C'),
      ...anyColor({ onlyFor: 'Dragon' }),
      ...anyColor({ onlyFor: 'Omen' }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: DRAGON, to: 'hand', reveal: true }],
      },
    ],
  },
  // "When this artifact enters, search your library for a basic Mountain, Plains, or Swamp card, reveal it, put it into your hand,
  // then shuffle. {2}{R}{W}{B}, {T}, Sacrifice this artifact: Create three 1/1 red Warrior creature tokens. They gain menace and
  // haste until end of turn. Activate only as a sorcery."
  'Mardu Monument': monument(
    ['Mountain', 'Plains', 'Swamp'],
    '{2}{R}{W}{B}',
    token(TDM_WARRIOR, 3, { keywordsThisTurn: ['menace', 'haste'] }),
  ),
  // "This land enters tapped unless you control a Mountain or a Forest. {T}: Add {U}. {U}, {T}: The next spell you cast this turn
  // can't be countered."
  'Mistrise Village': villageLand('U', ['R', 'G'], {
    kind: 'activated',
    cost: { mana: mana('{U}'), tapSelf: true },
    targets: [],
    effects: [custom('nextSpellUncounterable')],
  }),
  // "{T}: Add one mana of any color. Activate only if you control a Dragon."
  'Mox Jasper': { abilities: anyColor({ condition: controlsDragon }) },
  // "This land enters tapped. {T}: Add {B}, {G}, or {U}."
  'Opulent Palace': tapLand('B', 'G', 'U'),
  // "This land enters tapped. {T}: Add {W}, {B}, or {G}."
  'Sandsteppe Citadel': tapLand('W', 'B', 'G'),
  // "When this artifact enters, search your library for a basic Swamp, Forest, or Island card, reveal it, put it into your hand,
  // then shuffle. {2}{B}{G}{U}, {T}, Sacrifice this artifact: Create two 2/2 black Zombie Druid creature tokens. Activate only as a
  // sorcery."
  'Sultai Monument': monument(
    ['Swamp', 'Forest', 'Island'],
    '{2}{B}{G}{U}',
    token(TDM_ZOMBIE_DRUID, 2),
  ),
  // "When this artifact enters, search your library for a basic Forest, Island, or Mountain card, reveal it, put it into your hand,
  // then shuffle. {3}{G}{U}{R}, {T}, Sacrifice this artifact: Create a 5/5 green Elephant creature token. Activate only as a sorcery."
  'Temur Monument': monument(['Forest', 'Island', 'Mountain'], '{3}{G}{U}{R}', token(TDM_ELEPHANT, 1)),
  // "When you cast this spell, exile up to one target permanent that's one or more colors. Whenever you cast a colorless spell, exile
  // up to one target permanent that's one or more colors. +2: You gain 3 life and draw a card. 0: Add {C}{C}{C}. −11: Search your
  // library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards
  // without paying their mana costs."
  'Ugin, Eye of the Storms': {
    abilities: [
      when({ on: 'castSelf' }, [{ what: 'permanent', optional: true, filter: COLORED }], {
        kind: 'exile',
        what: t0,
      }),
      when(
        { on: 'castSpell', filter: 'any', spell: COLORLESS },
        [{ what: 'permanent', optional: true, filter: COLORED }],
        { kind: 'exile', what: t0 },
      ),
      loyaltyAbility(2, '+2: You gain 3 life and draw a card', [gain(3), draw(1)]),
      loyaltyAbility(0, '0: Add {C}{C}{C}', [{ kind: 'addMana', mana: [['C'], ['C'], ['C']] }]),
      loyaltyAbility(
        -11,
        '−11: Search your library for any number of colorless nonland cards, exile them, then shuffle. Until end of turn, you may cast those cards without paying their mana costs',
        [
          {
            kind: 'searchLibrary',
            filter: { ...COLORLESS, nonland: true },
            to: 'hand',
            upTo: 999,
            exileFreeThisTurn: true,
          },
        ],
      ),
    ],
  },
  // "When this creature enters, target player mills two cards. You gain 2 life."
  'Watcher of the Wayside': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'player' }], { kind: 'mill', count: 2, who: t0 }, gain(2)),
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_COLORLESS_TOKENS: CardDefinition[] = [];
