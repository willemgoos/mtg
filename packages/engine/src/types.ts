// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];

/** A game object (card, token or ability on the stack). Stable across zone changes. */
export type ObjectId = string;
/** Key into the card database, e.g. "shock". */
export type CardDefId = string;

// ---------------------------------------------------------------------------
// Mana
// ---------------------------------------------------------------------------

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ManaType = Color | 'C';

export interface ManaCost {
  generic: number;
  colored: Partial<Record<ManaType, number>>;
  /** Hybrid pips, each payable with either type ({B/G}). */
  hybrid?: [ManaType, ManaType][];
  /** How many {X} the cost has (X is chosen as the spell is cast). */
  x?: number;
}

// ---------------------------------------------------------------------------
// Card definitions (static data; referenced from state by CardDefId)
// ---------------------------------------------------------------------------

export type CardType =
  'Creature' | 'Instant' | 'Sorcery' | 'Land' | 'Enchantment' | 'Artifact' | 'Planeswalker';
export type Supertype = 'Basic' | 'Legendary';

export type Keyword =
  | 'flying'
  | 'reach'
  | 'trample'
  | 'haste'
  | 'firstStrike'
  | 'doubleStrike'
  | 'vigilance'
  | 'deathtouch'
  | 'lifelink'
  | 'menace'
  | 'hexproof'
  | 'defender'
  | 'flash'
  | 'indestructible'
  /** Can't be the target of instants an opponent controls (Elenda). */
  | 'hexproofFromInstants'
  /** Can't be the target of white spells or abilities an opponent controls (Knight of Malice). */
  | 'hexproofFromWhite'
  /** Ward: targeting it costs an opponent `CardDefinition.wardCost` (default {2}). */
  | 'ward'
  /** Ward {1}, granted by another permanent (Long River Lurker, Innkeeper's Talent). */
  | 'wardOne'
  /** Can't be the target of spells or abilities (Whispersilk Cloak). */
  | 'shroud'
  /** Changeling: every creature type. */
  | 'changeling';

/** What an instant or sorcery (or one of its modes) does when it resolves. */
export interface SpellDef {
  targets: TargetSpec[];
  effects: EffectDef[];
  /** Shown when choosing a mode. */
  label?: string;
  /** Escalate: tap this many untapped creatures you control as an extra cost (the engine picks them). */
  escalate?: number;
}

export interface CardDefinition {
  /** Mockingbird: may enter as a copy of a creature with mana value up to the mana spent on it. */
  entersAsCopy?: {
    addSubtype?: string;
    addKeyword?: Keyword;
    /** Only of a creature you control, any mana value (Spark Double, Chameleon). */
    yours?: boolean;
    /** An additional +1/+1 counter on it (Spark Double). */
    counter?: boolean;
    /** It isn't legendary (Spark Double; Chameleon keeps its own name). */
    notLegendary?: boolean;
  };
  id: CardDefId;
  name: string;
  /** Used by the UI to hotlink the card image. */
  scryfallId?: string;
  manaCost: ManaCost;
  colors: Color[];
  types: CardType[];
  supertypes: Supertype[];
  subtypes: string[];
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  /** "This creature enters with N +1/+1 counters on it." */
  entersWithCounters?: number;
  // Marvel Super Heroes
  /** Enters with these named counters (Captain America, Super-Soldier: a shield counter). */
  entersWithNamedCounters?: Record<string, number>;
  /** Improvise: your artifacts can be tapped to pay its generic cost. */
  improvise?: boolean;
  /** "If this is in your opening hand, you may begin the game with it on the battlefield" (Quicksilver). */
  beginsOnBattlefield?: boolean;
  /** Sneak: cast during your declare blockers step for this, returning an unblocked attacker to hand. */
  sneak?: ManaCost;
  /** A planeswalker's starting loyalty. */
  loyalty?: number;
  /** Only put the counters on if this holds (raid: "if you attacked this turn"). */
  entersWithCountersIf?: ConditionDef;
  /** "As an additional cost, sacrifice a creature or pay this" (Eaten Alive). */
  sacrificeOrPay?: ManaCost;
  /** May be cast from the graveyard by also removing this many +1/+1 counters from your creatures. */
  castFromGraveyardRemovingCounters?: number;
  /** "As an additional cost to cast this spell, sacrifice a creature" (Arbiter of Woe). */
  sacrificeCreatureToCast?: boolean;
  /** What ward costs an opponent (default {2}). Ovika: {3} and 3 life. */
  wardCost?: { mana: ManaCost; life?: number; discard?: boolean; sacrificeFood?: boolean };
  /** "This spell can't be countered." */
  uncounterable?: boolean;
  /** "Cast this spell only if ..." (Confront the Assault). */
  castOnlyIf?: ConditionDef;
  /** Power set by a count (toughness is printed), e.g. Enigma Drake. */
  powerEquals?: Amount;
  /** "This land enters tapped." */
  entersTapped?: boolean;
  /** What an instant or sorcery does when it resolves. */
  spell?: SpellDef;
  /** "Choose one —": replaces `spell`; the caster picks a mode. */
  modes?: SpellDef[];
  /**
   * Bloomburrow's Seasons: "choose up to five {P} worth of modes; you may
   * choose the same mode more than once". Each mode costs `paws`.
   */
  pawprints?: { paws: number; spell: SpellDef }[];
  /**
   * Kicker: pay this too. An instant or sorcery then does `spell` instead; a
   * permanent remembers it was kicked (see the `wasKicked` condition).
   */
  kicker?: {
    cost: ManaCost;
    spell?: SpellDef;
    /**
     * Kicker under another name: 'offspring' (a creature also makes a 1/1 token
     * copy) or 'gift' (a free promise of a gift to an opponent).
     */
    as?: 'offspring' | 'gift' | 'overload';
    /** A permanent's gift: given to an opponent as it resolves, if promised (Scrapshooter). */
    gift?: EffectDef;
    // Teamwork (Marvel Super Heroes)
    /** Teamwork N: the kicker is tapping your creatures with total power N or more (`cost` is {0}). */
    teamwork?: number;
  };
  /** Costs {amount} less if its first target matches (Dire Downdraft: an attacking or tapped creature). */
  costReductionIfTarget?: { filter: CardFilter; amount: number };
  /** What it does when cast with flashback, if different ("if this spell was cast from a graveyard"). */
  flashbackSpell?: SpellDef;
  // Doom Prevails (9e).
  /** An Aura that enchants a player: it stays without a host (Archnemesis). */
  enchantPlayer?: boolean;
  /** Mayhem: may be cast from your graveyard for this cost if you discarded it this turn. */
  mayhem?: ManaCost;
  /** Multikicker: pay this any number of times (offered up to three); see `kickedAtLeast`. */
  multikicker?: ManaCost;
  /** "As an additional cost to cast this spell, pay X life" (Toxic Deluge). */
  payXLife?: boolean;
  /** A Saga with this many chapters: lore counters as it enters and at your precombat main phase. */
  saga?: number;
  // The Fantastic Four (9d).
  /** Rebound: cast from your hand, it's exiled as it resolves; at your next upkeep you may cast it free. */
  rebound?: boolean;
  /** Convoke: your untapped creatures can each pay for {1} (Clever Concealment). */
  convoke?: boolean;
  /** Life paid in addition to the flashback cost (Deep Analysis). */
  flashbackLife?: number;
  /** As it resolves it's exiled (Genesis Ultimatum) or put on the bottom of its owner's library (Ultimate Nullification). */
  afterResolving?: 'exile' | 'libraryBottom';
  /** Only creatures matching this may be sacrificed for `sacrificeCreatureToCast` (Ultimate Nullification: legendary). */
  sacrificeToCastFilter?: CardFilter;
  /** It may be cast from your graveyard by discarding a card as well (Dragon Man). */
  castFromGraveyardWithDiscard?: boolean;
  /** It enters with X +1/+1 counters (Royal Talon Fighter Jet). */
  entersWithXCounters?: boolean;
  /** Costs {amount} less while the condition holds (Heroic Return, Avenge). */
  costReductionIf?: { condition: ConditionDef; amount: number };
  /** "You may sacrifice any number of nonland permanents. This spell costs {1} less for each" (Rottenmouth Viper). */
  sacrificeAnyForReduction?: boolean;
  /** "As an additional cost to cast this spell, discard a card" (Sazacap's Brew). */
  discardToCast?: boolean;
  /** It enters tapped while this holds (Eddymurk Crab: if it's not your turn). */
  entersTappedIf?: ConditionDef;
  /** "As an additional cost to cast this spell, forage or pay this" (Feed the Cycle). */
  forageOrPay?: ManaCost;
  /** Aura: what it enchants (chosen as a target when cast). */
  enchant?: TargetSpec;
  // Transform (Marvel Super Heroes)
  /** A double-faced card's back face (its own definition). */
  back?: CardDefId;
  /** Costs {1} less for each matching permanent you control (affinity). */
  costReduction?: Amount;
  /** Flashback: may be cast from the graveyard for this cost, then exiled. */
  flashback?: ManaCost;
  /** Power and toughness set by a count (e.g. Crusader of Odric). */
  ptEquals?: Amount;
  abilities: AbilityDef[];
  isToken?: boolean;
  // Brawl.
  /** Colours of the mana symbols in its cost and rules text (rule 903.4). Default: its colours. */
  colorIdentity?: Color[];
  /** The name printed on a Marvel reprint (Fellwar Stone is "S.H.I.E.L.D. Spy Satellite"). */
  flavorName?: string;
}

export type AbilityDef =
  | {
      kind: 'mana';
      cost: CostDef;
      produces: ManaType;
      /** "Spend this mana only to cast a spell of this subtype" (Giada: 'Angel'; 'chosenType': a creature spell of the type chosen for it). */
      onlyFor?: string;
      /** Makes two mana instead of one while this holds (Ilysian Caryatid). */
      doubleIf?: ConditionDef;
      /** Only if this is the color chosen for it (Uncharted Haven). */
      ifChosen?: boolean;
      // Brawl staples.
      /** Mana per tap, if more than one (Sol Ring). */
      amount?: number;
      /**
       * Only if the colour is in your commander's colour identity (Command
       * Tower), or a land an opponent controls could make it (Exotic Orchard).
       */
      colorFrom?: 'commander' | 'opponentLands' | 'legendaries';
      /** Deals 1 damage to you when spent as this colour (Talismans). */
      pain?: boolean;
      /** Path of Ancestry: scry 1 when spent on a creature spell sharing a type with your commander. */
      scryIfCommanderType?: boolean;
      // Marvel Super Heroes
      /** "Activate only if ..." (Dark Fortress: it entered this turn or you control a basic land). */
      condition?: ConditionDef;
    }
  | {
      kind: 'activated';
      cost: CostDef;
      targets: TargetSpec[];
      effects: EffectDef[];
      sorcerySpeed?: boolean;
      condition?: ConditionDef;
      /** "Activate only once." */
      once?: boolean;
      /** "Activate only once each turn." */
      oncePerTurn?: boolean;
      /** Shown in menus (Class level-ups: "Level 2"). */
      label?: string;
      /** Activated from the graveyard (Reassembling Skeleton). */
      fromGraveyard?: boolean;
      // Power-up (Marvel Super Heroes)
      /** Power-up: once only, and it costs the card's mana cost less if it entered this turn. */
      powerUp?: boolean;
      /** Activated from your hand (cycling). */
      fromHand?: boolean;
    }
  | {
      kind: 'triggered';
      trigger: TriggerDef;
      targets: TargetSpec[];
      effects: EffectDef[];
      /** Intervening "if" clause, checked when the trigger event happens. */
      condition?: ConditionDef;
      /** "You may ...": the controller may choose no targets to skip it. */
      optional?: boolean;
      /** "You may pay ...": paid when the targets are chosen (implies optional). */
      cost?: ManaCost;
      /** "Choose one —": the controller picks a mode as it goes on the stack. */
      modes?: SpellDef[];
      /** "This ability triggers only once each turn." */
      oncePerTurn?: boolean;
      /** "Choose one that hasn't been chosen" (Kimoyo Beads). */
      modesOnce?: boolean;
      /** "You may pay ... and N life": life paid with `cost` (Zoraline). */
      lifeCost?: number;
      /** Triggers while the card is in its owner's graveyard (Persistent Marshstalker). */
      fromGraveyard?: boolean;
      /** "Whenever one or more ...": triggers once for events that happen together. */
      batch?: boolean;
    }
  | { kind: 'static'; effect: StaticDef };

export interface CostDef {
  mana?: ManaCost;
  tapSelf?: boolean;
  sacrificeSelf?: boolean;
  /** "Sacrifice a creature" (chosen when activating). */
  sacrificeCreature?: boolean;
  /** Only creatures matching this may be sacrificed for `sacrificeCreature` (Goblin Trashmaster). */
  sacrificeFilter?: CardFilter;
  /** Remove this many named counters from the source (Drake Hatcher's incubation counters). */
  removeCounters?: { name: string; count: number };
  /** Exile this card from your graveyard (Bonebind Orator). */
  exileSelf?: boolean;
  /** Forage: exile three cards from your graveyard or sacrifice a Food (Camellia). */
  forage?: boolean;
  /** Pay this much life. */
  life?: number;
  /** Discard a card (chosen when activating). */
  discard?: boolean;
  /** Tap this many untapped tokens you control (Baylen, Tangle Tumbler). */
  tapTokens?: number;
  /** Sacrifice a permanent matching this (Fountainport: a token). */
  sacrificePermanent?: CardFilter;
  /** Untapped creatures you control may each pay for {1} (Heirloom Epic). */
  convoke?: boolean;
  /** A loyalty ability: add (or remove) this many loyalty counters. */
  loyalty?: number;
  // Cycling.
  /** Discard this card from your hand. */
  discardSelf?: boolean;
  // Wakanda Forever (9c).
  /** Sacrifice this many artifacts (the engine picks the least useful): Metalwork Colossus. */
  sacrificeArtifacts?: number;
  // Avengers Assemble (9b).
  /** Crew N: tap untapped creatures you control with total power N or more (the engine picks them). */
  crew?: number;
}

export type TriggerDef =
  | { on: 'etb' }
  | { on: 'otherCreatureEtb'; controller: 'you' | 'any'; filter?: CardFilter }
  | { on: 'dies' }
  | { on: 'otherCreatureDies'; controller: 'you' | 'opponent' | 'any'; nontoken?: boolean }
  /** Whenever this or another creature you control (matching the filter, as printed) dies. */
  | { on: 'creatureYouControlDies'; nontoken?: boolean; filter?: CardFilter }
  /** Whenever a creature you control deals combat damage (on your turn); "that creature", "that much". */
  | { on: 'creatureYouControlDealsCombatDamage'; toPlayer?: boolean; filter?: CardFilter }
  | { on: 'beginningOfCombat'; whose: 'yours' }
  | { on: 'youGainLife' }
  /** Whenever the creature this Aura is attached to dies. */
  | { on: 'attachedDies' }
  /** Whenever the creature this Equipment is attached to deals combat damage to a player. */
  | { on: 'equippedDealsCombatDamageToPlayer' }
  | {
      on: 'attacks';
      // Marvel Super Heroes: "attacks alone" (Luke Cage).
      alone?: boolean;
    }
  /** "Whenever you attack" (with one or more creatures matching the filter): once per combat. */
  | { on: 'youAttack'; filter?: CardFilter }
  | { on: 'combatDamageToPlayer' }
  | {
      on: 'castSpell';
      filter:
        | 'any'
        | 'creature'
        | 'noncreature'
        | 'instantOrSorcery'
        | 'targetsSelf'
        /** Alania: the first instant, first sorcery, or first other Otter spell you cast this turn. */
        | 'firstOfItsKind'
        /** The caster's first spell this turn (Mind's Dilation). */
        | 'first'
        /** The caster's first (Valeria) or fourth (The Fantasticar) noncreature spell this turn. */
        | 'firstNoncreature'
        | 'fourthNoncreature'
        /** Lady Loki: the caster's first instant, sorcery or Villain spell this turn. */
        | 'firstInstantSorceryOrVillain'
        /** Marvel Super Heroes: a spell that targets a creature you control (Ms. Marvel). */
        | 'targetsYourCreature'
        /** Marvel Super Heroes: an instant or sorcery that targets an artifact or land (Fin Fang Foom). */
        | 'instantOrSorceryTargetingArtifactOrLand';
      /** The spell must also match this (Gev: a Lizard spell). */
      spell?: CardFilter;
      /** Any player's spell, cast when it isn't their turn (Vision). */
      anyPlayerOffTurn?: boolean;
      /** Whose spells: yours (default), any player's (Medusa) or an opponent's (Mind's Dilation). */
      caster?: 'any' | 'opponent';
      /** Only spells cast from exile (Klaw). */
      fromExile?: boolean;
    }
  /** Whenever a player (an opponent: Monologue Tax) casts their second spell each turn (Hearthborn Battler). */
  | { on: 'anyPlayerSecondSpell'; opponentOnly?: boolean }
  /** At the beginning of your precombat or postcombat main phase. */
  | { on: 'beginningOfMain'; which: 1 | 2 }
  /** Whenever you (or, with 'opponents', an opponent: Black Widow) draw your second card each turn. */
  | { on: 'drawSecondCard'; whose?: 'opponents' | 'any' }
  // Marvel Super Heroes
  /** Whenever a creature you control is dealt damage ("that much": the event amount). */
  | { on: 'yourCreatureDealtDamage' }
  /** Equipment: whenever the equipped creature attacks (Captain America's Shield). */
  | { on: 'equippedAttacks'; alone?: boolean }
  /** Whenever a player or permanent becomes the target of an ability you control (Loki, God of Mischief). */
  | { on: 'youTargetWithAbility' }
  | { on: 'drawCard'; whose: 'yours' | 'opponents' }
  /** Whenever a source you control deals noncombat damage to an opponent ("that many"). */
  | { on: 'yourNoncombatDamageToOpponent' }
  /** Whenever this creature becomes blocked. */
  | { on: 'becomesBlocked' }
  /** Whenever a creature you control (matching the filter) attacks; "that creature" is the subject. */
  | {
      on: 'creatureYouControlAttacks';
      filter?: CardFilter;
      // Marvel Super Heroes: "attacks alone" (it is the only attacker).
      alone?: boolean;
    }
  | { on: 'landfall' }
  | { on: 'beginningOfUpkeep'; whose: 'yours' | 'each' | 'opponents' }
  | { on: 'beginningOfEndStep'; whose: 'yours' | 'each' }
  /** Whenever another permanent you control matching the filter enters (Honored Dreyleader). */
  | { on: 'otherPermanentEtb'; filter: CardFilter }
  /** Whenever this creature or another creature you control matching the filter enters (Harvestrite Host). */
  | { on: 'selfOrCreatureEtb'; filter: CardFilter }
  /** Expend N: whenever you spend your Nth total mana this turn. */
  | { on: 'expend'; amount: number }
  /** Valiant: this creature becomes the target of your spell or ability for the first time this turn. */
  | { on: 'valiant' }
  /** Whenever you gain or lose life (Wax-Wane Witness: "during your turn"). */
  | { on: 'youGainOrLoseLife'; duringYourTurn?: boolean }
  /**
   * A creature leaves the battlefield without dying (exiled, bounced, put into a
   * library): this one or another you control ('selfOrOther'), or only others.
   */
  | { on: 'leavesWithoutDying'; who: 'selfOrOther' | 'other' }
  /** Whenever a Food is put into a graveyard from the battlefield (Ygra). */
  | { on: 'foodToGraveyard' }
  /** Whenever you forage (Corpseberry Cultivator). */
  | { on: 'youForage' }
  /** Whenever you give a gift (Jolly Gerbils). */
  | { on: 'youGiveGift' }
  /**
   * Whenever you put +1/+1 counters on a creature you control (Stocking the
   * Pantry); "that creature", "that many". Captain Marvel: another one, matching the filter.
   */
  | {
      on: 'youPutCounters';
      other?: boolean;
      filter?: CardFilter;
      /** Only this creature (Exemplar of Light). */ self?: boolean;
    }
  /** At the beginning of your draw step. */
  | { on: 'beginningOfDraw' }
  /** Whenever a creature you control becomes the target of an opponent's spell or ability (Pawpatch Recruit). */
  | { on: 'yourCreatureTargetedByOpponent' }
  /** When this Class becomes level N. */
  | { on: 'becomesLevel'; level: number }
  // Teamwork (Marvel Super Heroes)
  /** Whenever this becomes tapped to pay a teamwork cost (Agent Maria Hill). */
  | { on: 'tappedForTeamwork' }
  /** Whenever one or more creatures you control (matching the filter) deal combat damage to a player (Kastral). */
  | { on: 'creaturesYouControlDealCombatDamageToPlayer'; filter?: CardFilter }
  /** When you sacrifice this permanent (Carrot Cake). */
  | { on: 'sacrificed' }
  /** Whenever you sacrifice a permanent matching the filter (Camellia: a Food). */
  | { on: 'youSacrifice'; filter: CardFilter }
  // Doom Prevails (9e).
  /** Whenever you discard a card ("that card" is the subject); Doctor Doom: one or more lands, once per batch. */
  | { on: 'youDiscard'; filter?: CardFilter }
  /** Whenever a creature you control connives ("that creature" is the subject). */
  | { on: 'creatureYouControlConnives' }
  /** A Saga's chapter abilities (triggered as lore counters are added). */
  | { on: 'chapter'; chapters: number[] }
  // The Fantastic Four (9d).
  /** Whenever this becomes the target of a spell or ability an opponent controls (Black Bolt). */
  | { on: 'targetedByOpponent' }
  // Wakanda Forever (9c).
  /** Whenever the creature this Equipment is attached to attacks. */
  | { on: 'equippedAttacks'; alone?: boolean }
  /** Whenever a creature an opponent controls (matching the filter) attacks you ("that creature"): Storm. */
  | { on: 'opponentCreatureAttacks'; filter?: CardFilter }
  /** Whenever an opponent attacks you with `min` or more creatures (Everett K. Ross). */
  | { on: 'opponentAttacks'; min: number }
  /** Whenever one or more creatures an opponent controls attack you and aren't blocked (Coveted Jewel). */
  | { on: 'opponentAttackersUnblocked' }
  /** "When you cast this spell": triggers from the stack (Ancestral Communion, Hatut Zeraze Strike Force). */
  | { on: 'castSelf' }
  // Avengers Assemble (9b).
  /** Whenever this creature is dealt damage ("that much"): Hercules. */
  | { on: 'dealtDamage' }
  /** Whenever a creature you control (matching the filter) becomes blocked; amount: its blockers (She-Hulk). */
  | { on: 'creatureYouControlBecomesBlocked'; filter?: CardFilter }
  /** Whenever a creature you control becomes tapped for the first time this turn, during your turn. */
  | { on: 'creatureYouControlFirstTappedOnYourTurn' };

export type ConditionDef =
  | { kind: 'controlsPermanents'; filter: CardFilter; min: number }
  | { kind: 'attackedThisTurn' }
  | { kind: 'controlsAnother'; subtype: string }
  /** You control a creature (or `count` creatures) matching the filter (`other` excludes the source). */
  | { kind: 'controlsCreature'; filter: CardFilter; count?: number }
  /** The source attacked for the first time this turn. */
  | { kind: 'firstAttackThisTurn' }
  /** This permanent was cast with kicker. */
  | { kind: 'wasKicked' }
  /** Morbid: a creature died this turn. */
  | { kind: 'creatureDiedThisTurn' }
  /** It didn't have this subtype when it died (Infernal Vessel). */
  | { kind: 'diedWithout'; subtype: string }
  /** It's not your turn. */
  | { kind: 'opponentsTurn' }
  | { kind: 'yourTurn' }
  | { kind: 'sourceAttacking' }
  | { kind: 'sourceCounters'; min: number }
  /** A creature is attacking you. */
  | { kind: 'beingAttacked' }
  /** An opponent controls a creature matching the filter. */
  | { kind: 'opponentControlsCreature'; filter: CardFilter }
  /** Threshold-style: at least `min` cards (of these types) in your graveyard. */
  | { kind: 'graveyardCount'; min: number; types?: CardType[] }
  /** It's your turn and this is the first time you gained life this turn. */
  | { kind: 'firstLifeGainThisTurn'; anyTurn?: boolean }
  /** A chosen target matches the filter (Hazardroot Herbalist: "if that creature is a token"). */
  | { kind: 'targetMatches'; target: number; filter: CardFilter }
  /** A count reaches `min` (Finneas: total power 10 or greater). */
  | { kind: 'amountAtLeast'; amount: Amount; min: number }
  /** This ability has resolved exactly `n` times this turn, counting this one (Harvestrite Host). */
  | { kind: 'resolvedThisTurn'; n: number }
  /**
   * Life changes this turn for you or an opponent: `gained` and/or `lost`
   * (both must hold), or `either`.
   */
  | {
      kind: 'lifeThisTurn';
      who: 'you' | 'opponent';
      gained?: boolean;
      lost?: boolean;
      either?: boolean;
    }
  /** You have at least `min` cards in hand. */
  | { kind: 'handSize'; min: number }
  /** Every condition holds. */
  | { kind: 'all'; of: ConditionDef[] }
  /** An opponent has a card matching the filter in hand (Bandit's Talent: a nonland card). */
  | { kind: 'opponentHandHas'; filter: CardFilter }
  /** An opponent has at most `max` cards in hand (Bandit's Talent). */
  | { kind: 'opponentHandAtMost'; max: number }
  /** An opponent has more lands, life, creatures or cards in hand than you (Beza). */
  | { kind: 'opponentHasMore'; what: 'lands' | 'life' | 'creatures' | 'cards' }
  /** Three or more cards left your graveyard this turn, or you sacrificed a Food this turn (Bonecache Overseer). */
  | { kind: 'graveyardLeftOrFoodSacrificed' }
  /** Cards exiled with this permanent have at least `min` card types among them (Keen-Eyed Curator). */
  | { kind: 'exiledCardTypes'; min: number }
  /** This Class is at least level `min` (or exactly `exactly`). */
  | { kind: 'classLevel'; min?: number; exactly?: number }
  /** The source's power is at least `min` (Kitsa). */
  | { kind: 'sourcePowerAtLeast'; min: number }
  /** A chosen target is controlled by you (Dreamdew Entrancer). */
  | { kind: 'targetControlledByYou'; target: number }
  /** At least one condition holds. */
  | { kind: 'any'; of: ConditionDef[] }
  /** The condition doesn't hold. */
  | { kind: 'not'; condition: ConditionDef }
  // Doom Prevails (9e).
  /** Cards exiled with the source are still in exile (Currency Converter). */
  | { kind: 'sourceHasExiled' }
  /** The source was kicked at least N times (multikicker: Batroc). */
  | { kind: 'kickedAtLeast'; n: number }
  // The Fantastic Four (9d).
  /** You've cast a noncreature spell this turn. */
  | { kind: 'castNoncreatureThisTurn' }
  // Wakanda Forever (9c).
  /** You are the monarch; or there is no monarch; or an opponent is (the creature attacks the monarch). */
  | { kind: 'monarch'; who: 'you' | 'none' | 'opponent' }
  /** This permanent is monstrous (Fleecemane Lion). */
  | { kind: 'monstrous' }
  /** It's your turn, in one of these steps (Scourglass: upkeep; Loyal Retainers: before attackers). */
  | { kind: 'yourStep'; steps: Step[] }
  /** You've cast a spell this turn (Conduit of Worlds, negated). */
  | { kind: 'youCastSpellThisTurn' }
  // Avengers Assemble (9b).
  /** An opponent has cast a spell this turn (Captain Mar-Vell). */
  | { kind: 'opponentCastSpellThisTurn' }
  /** The source is tapped (Quicksilver). */
  | { kind: 'sourceTapped' }
  /** An opponent attacked during their last turn (Avenge). */
  | { kind: 'opponentAttackedLastTurn' }
  /** The source dealt damage this turn to the creature that caused the trigger (Hawkeye). */
  | { kind: 'sourceDamagedSubject' }
  // Brawl staples.
  /** You have a card matching this in your hand (snarls reveal one). */
  | { kind: 'handHas'; filter: CardFilter }
  // Marvel Super Heroes
  /** The source entered the battlefield this turn. */
  | { kind: 'sourceEnteredThisTurn' }
  /** You control a basic land. */
  | { kind: 'controlsBasicLand' }
  /** The source has a counter of this kind (a shield counter). */
  | { kind: 'sourceHasCounter'; name: string }
  /** You attacked with a Hero this turn, or a Hero entered under your control (Avengers Assemble!). */
  | { kind: 'heroAttackedOrEnteredThisTurn' }
  /** Any player controls a permanent matching the filter (Knight of Malice: a white one). */
  | { kind: 'anyPlayerControls'; filter: CardFilter }
  | { kind: 'custom'; handler: string };

export interface CardFilter {
  anyOf?: CardFilter[];
  attackingOrBlocking?: boolean;
  maxPower?: number;
  minPower?: number;
  hasKeyword?: Keyword;
  lacksKeyword?: Keyword;
  tapped?: boolean;
  attacking?: boolean;
  subtype?: string;
  minToughness?: number;
  nontoken?: boolean;
  /** Only tokens. */
  token?: boolean;
  /** Has at least one of these card types. */
  types?: CardType[];
  nonland?: boolean;
  notTypes?: CardType[];
  colors?: Color[];
  subtypes?: string[];
  minPlusOneCounters?: number;
  minManaValue?: number;
  manaValue?: number;
  notSubtype?: string;
  /** Mana value at most this ('sourcePower': the source's power, e.g. as it died). */
  maxManaValue?: number | 'sourcePower';
  /** Put into its current zone this turn (Abyssal Harvester). */
  enteredThisTurn?: boolean;
  /** Same card as the source ("named Charmed Stray"). */
  sameNameAsSource?: boolean;
  /** Blocking, or attacking and blocked (Tactical Advantage). */
  inCombatBlock?: boolean;
  /** "another target creature": excludes the source. */
  other?: boolean;
  /** Mana value less than that of the creature that caused the trigger (Clement). */
  lesserManaValueThanSubject?: boolean;
  /** Mana value equal to the source's named counters plus `plus` (Wishing Well). */
  manaValueIsSourceCounters?: { name: string; plus: number };
  /** Not the creature that caused the trigger (Pawpatch Recruit). */
  notSubject?: boolean;
  /** Has an Equipment attached (Blacksmith's Talent). */
  equipped?: boolean;
  /** Was dealt damage this turn (Downwind Ambusher). */
  damaged?: boolean;
  /** Toughness greater than its power (Fecund Greenshell). */
  toughnessGreaterThanPower?: boolean;
  /** Has the creature type chosen for the source (Patchwork Banner). */
  chosenTypeOfSource?: boolean;
  /** Has counters on it (Innkeeper's Talent). */
  hasCounters?: boolean;
  // The Fantastic Four (9d).
  /** A card with this id ("a creature named Silver Surfer"). */
  named?: CardDefId;
  // Marvel Super Heroes
  /**
   * It was attacking as it left the battlefield ("an attacking creature you control dies");
   * false: it wasn't (Garna, Bloodfist of Keld's "otherwise").
   */
  leftAttacking?: boolean;
  /** Attached to the source (Winter Soldier: "for each Equipment attached to him"). */
  attachedToSource?: boolean;
  /** Not the permanent the source is attached to (Secret Invasion: "other than enchanted creature"). */
  notAttachedHost?: boolean;
  /** Its mana value is odd or even (Thanos). */
  manaValueParity?: 'odd' | 'even';
  // Brawl.
  /** Is its controller's commander ("your commander"). */
  commander?: boolean;
  /** Has one of these supertypes (battle lands count basic lands). */
  supertypes?: Supertype[];
  // Avengers Assemble (9b).
  /** Modified: has counters, an Equipment, or an Aura its controller controls (War Machine). */
  modified?: boolean;
  /** Greater power than the source (Ant-Man: "can't be blocked by creatures with greater power"). */
  greaterPowerThanSource?: boolean;
  /** Not of the creature type chosen for the source (Raise the Palisade). */
  notChosenTypeOfSource?: boolean;
  /** Shares a creature type with its controller's commander (Folk Hero). */
  sharesTypeWithCommander?: boolean;
}

export interface TargetSpec {
  /**
   * 'permanent': any permanent (narrow with filter.types / nonland);
   * 'graveyardCard': a card in a graveyard (controller 'you' = your graveyard).
   */
  what: 'any' | 'creature' | 'player' | 'permanent' | 'graveyardCard' | 'spell';
  controller?: 'you' | 'opponent';
  filter?: CardFilter;
  /** "Up to": this target and the ones after it may be left out. */
  optional?: boolean;
}

/**
 * Reference used by effects: a chosen target (by index), the source object,
 * its controller, or a group.
 */
export type Ref =
  | { target: number }
  | 'self'
  | 'controller'
  | 'eachOpponent'
  | 'eachPlayer'
  | 'attached'
  | { each: 'permanent'; controller?: 'you' | 'opponent'; filter?: CardFilter }
  /** The object that caused the trigger ("that creature"). */
  | 'subject'
  | { each: 'creature'; controller?: 'you' | 'opponent'; filter?: CardFilter }
  /** The controller of a chosen target (Blooming Blast: "that creature's controller"). */
  | { controllerOf: number }
  /** The permanent chosen by a 'chooseYourPermanent' effect. */
  | 'chosen';

export type Amount =
  | number
  | { powerOf: Ref }
  /** The number of +1/+1 counters on it (Mossborn Hydra doubles them). */
  | { countersOn: Ref }
  | {
      count: 'creaturesYouControl' | 'landsYouControl' | 'totalPowerOfCreaturesYouControl';
      subtype?: string;
      max?: number;
      named?: CardDefId;
      other?: boolean;
      attacking?: boolean;
      minPlusOneCounters?: number;
      basicOnly?: boolean;
    }
  | { multiply: number; amount: Amount }
  // Marvel Super Heroes: "where X is Captain America's toughness".
  | { toughnessOf: Ref }
  /** The mana value of the triggering spell (Thor, God of Thunder). */
  | { manaValueOfSubject: true }
  /** The mana value of a permanent (Feed the Swarm: "equal to that permanent's mana value"). */
  | { manaValueOf: Ref }
  /** Blue mana symbols in the triggering spell's mana cost (Namor). */
  | { bluePipsOfSubject: true }
  /** "Draw cards equal to the difference" up to this hand size (The Ten Rings). */
  | { handSizeUpTo: number }
  /** The greatest mana value among your permanents matching the filter (Armor Wars: artifacts). */
  | { greatestManaValueYouControl: CardFilter }
  // Marvel Super Heroes: "costs {2} less if ..." (Punishing Punch).
  | { if: ConditionDef; then: number; else?: number }
  /** Cards in your graveyard (of these types). */
  | { count: 'cardsInGraveyard'; types?: CardType[]; named?: CardDefId; plus?: number }
  /** The amount from the trigger event ("that much damage"). */
  | { event: 'amount' }
  /** Permanents you control matching the filter (Honored Dreyleader: Squirrels and Food). */
  | { count: 'permanentsYouControl'; filter: CardFilter; other?: boolean }
  /** The greatest mana value among cards in your graveyard (Wick's Patrol). */
  | { count: 'greatestManaValueInGraveyard' }
  /** Creatures your opponents controlled that were exiled this turn (Vren). */
  | { count: 'opponentCreaturesExiledThisTurn' }
  /** The power of the creature sacrificed to pay for this (Wick). */
  | { sacrificedPower: true }
  /** Creatures that died under your control this turn (Season of Loss). */
  | { count: 'creaturesYouLostThisTurn' }
  /** The greatest power among creatures you control (Season of Gathering). */
  | { count: 'greatestPowerYouControl' }
  /** Creature cards you own in exile and in your graveyard (Huskburster Swarm). */
  | { count: 'creatureCardsInExileAndGraveyard' }
  /** Creatures you control of the type chosen for the source (Three Tree City). */
  | { count: 'creaturesOfChosenType'; other?: boolean }
  /** Named counters on the source (as it last was, if it left): Hoarder's Overflow's stash counters. */
  | { namedCountersOnSource: string }
  /** The value chosen for X (times `times`, plus `plus`). */
  | { x: true; times?: number; plus?: number }
  // Doom Prevails (9e).
  /** Cards you've discarded this turn (Living Laser). */
  | { count: 'cardsDiscardedThisTurn' }
  /** Permanents an opponent controls matching the filter (Killmonger: artifacts). */
  | { count: 'permanentsOpponentsControl'; filter: CardFilter }
  /** Cards in your hand (Kang Dynasty). */
  | { count: 'cardsInHand' }
  // The Fantastic Four (9d).
  /** Colours among permanents you control and spells you've cast this turn (First Family). */
  | { count: 'colorsAmongPermanentsAndSpells' }
  /** The colours of the spell that caused the trigger (Crystal). */
  | { count: 'subjectColors' }
  /** Cards in an opponent's hand (Recurring Insight). */
  | { count: 'opponentHandSize' }
  /** Greatest mana value among noncreature permanents you control and noncreature cards in your graveyard (Dragon Man). */
  | { count: 'greatestNoncreatureManaValue' }
  // Wakanda Forever (9c).
  /** Creatures on the battlefield (Vanquish the Horde). */
  | { count: 'creaturesOnBattlefield' }
  /** Total mana value of permanents you control matching the filter (Metalwork Colossus). */
  | { count: 'totalManaValue'; filter: CardFilter }
  /** Times you've cast your commander from the command zone (Hatut Zeraze Strike Force). */
  | { count: 'commanderCasts' };

export type EffectDef =
  | { kind: 'may'; effects: EffectDef[]; cost?: ManaCost }
  /** `exceptFrom`: not to the creature dealing it (Nova Flame: "each other creature"). */
  | {
      kind: 'damage';
      amount: Amount;
      to: Ref;
      from?: Ref;
      exceptFrom?: boolean;
      /** Create one of these tokens per point of excess damage dealt to a creature (Goblin Negotiation). */
      excessTokens?: CardDefId;
    }
  /** Until end of turn (or until your next turn). */
  | {
      kind: 'pump';
      to: Ref;
      /** Lasts until your next turn instead (For the Common Good). */
      untilYourNextTurn?: boolean;
      power: Amount;
      toughness: Amount;
      keywords?: Keyword[];
      cantBlock?: boolean;
      /** "If it would die this turn, exile it instead." */
      exileIfDies?: boolean;
      cantBeBlocked?: boolean;
      /** Gains "When this creature dies, return it to the battlefield tapped ..." */
      returnWhenDies?: ReturnWhenDies;
      /** Can't be blocked except by creatures with this keyword (Speed: haste). */
      cantBeBlockedExcept?: Keyword;
      /** "Whenever it deals combat damage to a player this turn, put a +1/+1 counter on it" (Love on the Battlefield). */
      counterOnCombatDamage?: boolean;
      /** "When this creature deals combat damage, sacrifice it" (Dropkick Bomber). */
      sacrificeOnCombatDamage?: boolean;
      /** Base power and toughness until end of turn (Reptil, I Am Iron Man). */
      basePT?: [number, number];
      /** It becomes an artifact creature until end of turn (I Am Iron Man). */
      becomesCreature?: boolean;
      /** Prevent all combat damage that would be dealt to it this turn (Fleeting Flight). */
      preventCombatDamage?: boolean;
    }
  /** Resolution-time "if": Morbid-style choices between two effects. */
  | { kind: 'if'; condition: ConditionDef; then: EffectDef[]; else?: EffectDef[] }
  /** The source card returns from its owner's graveyard. */
  | {
      kind: 'returnSource';
      to: 'hand' | 'battlefield';
      tapped?: boolean;
      /** "Tapped and attacking" (Persistent Marshstalker). */
      attacking?: boolean;
      counters?: number;
      addSubtype?: string;
      // Marvel Super Heroes: 'with a finality counter on him' (Winter Soldier).
      named?: string;
    }
  | { kind: 'exile'; what: Ref }
  /** Exile a card from a graveyard; extra effects if it was a creature card (Scavenging Ooze). */
  | {
      kind: 'exileGraveyardCard';
      what: Ref;
      ifCreature?: EffectDef[];
      /** Remember it as exiled with the source (Keen-Eyed Curator). */
      track?: boolean;
    }
  /** Each opponent loses `life` unless they sacrifice a nonland permanent or discard a card. */
  | { kind: 'punisher'; life: number }
  /** Exile the top N cards; choose one you may play until the end of your next turn (or of this turn). */
  | { kind: 'exileTopChooseOne'; count: number; until?: 'endOfTurn' }
  /**
   * Look at an opponent's hand and choose a card matching the filter; they
   * discard it (Thought-Stalker Warlock) or it's exiled.
   */
  | {
      kind: 'chooseFromOpponentHand';
      filter?: CardFilter;
      then: 'discard' | 'exile';
      /** You may cast the exiled card while it stays exiled, with any mana (Cruelclaw's Heist). */
      castable?: boolean;
    }
  /** A player chooses one of these (the owner of target `ownerOf`, or the controller). */
  | {
      kind: 'choose';
      ownerOf?: number;
      /** An opponent chooses (Bandit's Talent). */
      opponent?: boolean;
      options: { label: string; effects: EffectDef[] }[];
    }
  /**
   * You may cast a card without paying its mana cost, now (Daring Waverider,
   * Wishing Well). `exileAfter`: if it would go to the graveyard, exile it.
   */
  | {
      kind: 'castFree';
      what: Ref;
      exileAfter?: boolean;
      /**
       * Instead of a target: a card from your hand (West Coast Expansion) or
       * among the cards exiled with the source (Scarlet Witch), matching the filter.
       */
      from?: 'hand' | 'exiledWithSource' | 'lastExiledWithSource';
      filter?: CardFilter;
    }
  /** Portent of Calamity: reveal the top X and exile one card of each type; four or more lets you cast one free. */
  | { kind: 'portent' }
  /** The Infamous Cruelclaw: exile until a nonland card; you may cast it by discarding a card instead. */
  | { kind: 'exileUntilNonlandCastByDiscard' }
  /**
   * Dragonhawk: exile the top N (playable until your next end step); at your
   * next end step, deal `damage` to each opponent per card still exiled.
   */
  | { kind: 'dragonhawkExile'; count: Amount; damage: number }
  /** Deal `amount` to each opponent for each of these cards still in exile. */
  | { kind: 'damagePerExiled'; cards: ObjectRef[]; amount: number }
  /** Do these effects N times (Rottenmouth Viper: once per blight counter). */
  | { kind: 'repeat'; count: Amount; effects: EffectDef[] }
  /**
   * Sacrifice `count` permanents you control matching the filter (other than
   * the source), chosen one at a time; then `then` happens. Nothing if you can't.
   */
  | { kind: 'sacrificeSeveral'; count: number; filter: CardFilter; then: EffectDef[] }
  /** Copy a spell on the stack (`count` times): a target spell, or the spell that triggered this. */
  /** `retarget`: each copy gets another legal target if there is one (Ancestral Communion). */
  | { kind: 'copySpell'; what: Ref; count?: Amount; retarget?: boolean }
  /** Each player sacrifices a creature of their choice (Season of Loss). */
  | { kind: 'eachPlayerSacrifices' }
  /**
   * Until the end of your next turn, you have this triggered ability (Season of
   * the Bold); 'nextSpellThisTurn': once, this turn (Galvanic Iteration).
   */
  | {
      kind: 'emblem';
      ability: AbilityDef;
      until: 'endOfYourNextTurn' | 'permanent' | 'nextSpellThisTurn';
    }
  /** Marks the gift as given (for "whenever you give a gift"). */
  | { kind: 'giftGiven' }
  /** Create token copies of permanents (with set power and toughness). */
  | {
      kind: 'tokenCopy';
      of: Ref;
      count?: Amount;
      pt?: [number, number];
      /** Exile the copies at the beginning of the next end step (Stormsplitter). */
      exileAtEndStep?: boolean;
      /** Not of legendary permanents (Coiling Rebirth). */
      nonlegendary?: boolean;
      /** "Except the token isn't legendary" (Quantum Misalignment, Helm of the Host, Multiversal Incursion). */
      notLegendary?: boolean;
      /** "That token gains haste" (Helm of the Host). */
      haste?: boolean;
      /** The tokens enter tapped and attacking (Living Laser, Loki). */
      attacking?: boolean;
      /** A creature type it has in addition (Loki: Illusion). */
      addSubtype?: string;
    }
  /** Choose a color (or a creature type) for the source, as it enters. */
  | { kind: 'chooseColor' }
  | { kind: 'chooseCreatureType' }
  /** Mill N, then you may put a card matching the filter from among them into your hand (Cache Grab). */
  | { kind: 'millThenTake'; count: number; filter: CardFilter; squirrelFood?: boolean }
  /** Look at the top N; put `take` of them into your hand and the rest into your graveyard (Stargaze). */
  | { kind: 'lookTakeRestGraveyard'; count: Amount; take: Amount }
  /** Reveal the top card and put it into your hand; lose life equal to its mana value (Darkstar Augur). */
  | { kind: 'revealTopToHandLoseLife' }
  /**
   * Look at the top card; if it's a land you may put it onto the battlefield tapped, otherwise into your
   * hand (Fecund Greenshell). `permanent`: any permanent card, untapped (N'Yami-Class Mother Ship).
   */
  | { kind: 'topCardLandOrHand'; permanent?: boolean }
  /** Deal damage to each player equal to the nonbasic lands they control (Sunspine Lynx). */
  | { kind: 'damageEachPlayerByNonbasics' }
  /** You (and permanents you control) gain hexproof until end of turn (Dawn's Truce). */
  | { kind: 'playerHexproof' }
  /** Tap two untapped tokens: this Vehicle becomes an artifact creature until end of turn. */
  | { kind: 'becomeCreature'; what: Ref }
  /** Until end of turn you may cast creature spells from your graveyard by foraging (Osteomancer Adept). */
  | { kind: 'osteomancer' }
  /** Raise this Class's level by one. */
  | { kind: 'levelUp' }
  /**
   * Add mana to your pool: one per entry, each of one of its types. `count`
   * repeats the single entry (Muerra: {R} or {G} per Raccoon). Unspent mana
   * empties between steps, or at end of turn with `untilEndOfTurn`.
   */
  | {
      kind: 'addMana';
      mana: ManaType[][];
      count?: Amount;
      untilEndOfTurn?: boolean;
      /** Spend it only on spells with this tag (Helga: 'BigCreature'). */
      onlyFor?: string;
    }
  /** Exile permanents; return them at the beginning of the next end step (with counters). */
  | {
      kind: 'exileUntilEndStep';
      what: Ref;
      counters?: number;
      /** A named counter it returns with (Salvation Swan: flying). */
      named?: string;
    }
  /** Discard your whole hand. */
  | { kind: 'discardHand' }
  /**
   * Put a card matching the filter from your hand or graveyard onto the
   * battlefield (Kastral), optionally with a named counter.
   */
  | {
      kind: 'putFromHandOrGraveyard';
      filter: CardFilter;
      counter?: string;
      /** Only from the graveyard (Scavenger's Talent). */
      graveyardOnly?: boolean;
      /** Only from your hand (Avengers Quinjet). */
      handOnly?: boolean;
    }
  /** Exile permanents, then return them under their owners' control (with +1/+1 counters). */
  | {
      kind: 'blink';
      what: Ref;
      counters?: number;
      // Marvel Super Heroes: "return it tapped" (The Mighty Thor, Jane Foster).
      tapped?: boolean;
    }
  /**
   * Choose a permanent you control matching the filter (other than the
   * source): `then` happens to it (the 'chosen' ref). With none to choose,
   * `otherwise` happens.
   */
  | {
      kind: 'chooseYourPermanent';
      filter?: CardFilter;
      then: EffectDef[];
      otherwise?: EffectDef[];
    }
  /** Counter a spell unless its controller pays this. */
  | { kind: 'counterUnlessPays'; what: Ref; cost: ManaCost }
  /** Reveal cards from the top until one matches; it goes to hand or onto the battlefield tapped, the rest to the bottom. */
  | { kind: 'revealUntil'; filter: CardFilter; to: 'hand' | 'battlefieldTapped' }
  /**
   * Until end of turn, whenever the creature deals combat damage, its
   * controller may exile it and return it (Long River Lurker).
   */
  | { kind: 'blinkOnCombatDamage'; what: Ref }
  /** Put permanents on the top or bottom of their owners' libraries. */
  | { kind: 'putInLibrary'; what: Ref; position: 'top' | 'bottom' | 'second' }
  /** Gain control of permanents until end of turn (Reptilian Recruiter), or until your next turn (Stilt-Man). */
  | {
      kind: 'gainControl';
      what: Ref;
      untilYourNextTurn?: boolean;
      // Marvel Super Heroes: 'for as long as this Saga remains on the battlefield'.
      whileSource?: boolean;
    }
  /**
   * Until your next turn, permanents lose all abilities (and have base power
   * and toughness `basePT` if creatures): Azure Beastbinder.
   */
  | {
      kind: 'loseAbilities';
      what: Ref;
      basePT?: [number, number];
      // Marvel Super Heroes: "for as long as the source remains on the battlefield" (The Wondrous Wasp).
      whileSource?: boolean;
    }
  | { kind: 'untap'; what: Ref }
  /** An additional combat phase after this one. */
  | { kind: 'extraCombat' }
  /** Attach this Equipment (or `what`) to a creature. */
  | { kind: 'attach'; to: Ref; what?: Ref }
  /** Search your library for a basic land, put it into your hand, then shuffle. */
  | {
      /** Search your library (Bushwhack, Circuitous Route). Shuffles afterwards unless `shuffle` is false. */
      kind: 'searchLibrary';
      filter: 'basicLand' | 'basicLandOrGate' | CardFilter;
      to: 'hand' | 'battlefieldTapped' | 'battlefield' | 'graveyard' | 'libraryTop';
      /** Unrestricted tutors cannot fail to find a card in a nonempty library. */
      required?: boolean;
      shuffle?: boolean;
      /** Untap the land found if you then control this many lands (Fabled Passage). */
      untapIfLands?: number;
      /** The controller of this target searches instead (Path to Exile). */
      forControllerOf?: number;
    }
  /** Look at the top N; you may put a creature with mana value up to your land count onto the battlefield (Loot). */
  | { kind: 'lookForCreature'; count: number }
  | { kind: 'bounce'; what: Ref }
  | { kind: 'returnToHand'; what: Ref }
  | { kind: 'exileGraveyard'; who: Ref }
  | { kind: 'tap'; what: Ref }
  /** It can't become untapped for as long as you control the source (Spider-Woman, Secret Agent). */
  | { kind: 'doesntUntapWhileSource'; what: Ref }
  /** Change the target of a target spell with a single target to another legal one, best for you (Bolt Bend). */
  | { kind: 'changeTarget'; what: Ref }
  /** Time Stop, simplified: exile every other spell, drop every ability on the stack, and end combat. */
  | { kind: 'endTheTurn' }
  /** The controller discards N cards of their choice. */
  | {
      kind: 'discard';
      count: number;
      who?: 'controller' | 'eachOpponent';
      /** Only cards matching this. */
      filter?: CardFilter;
      /** Exiled instead (Ruthless Negotiation: "exiles a card from their hand"). */
      exile?: boolean;
    }
  /** Put the top N cards of your library into your graveyard. */
  | { kind: 'mill'; count: number; who?: Ref }
  // Connive (Marvel Super Heroes)
  /** It connives: its controller draws, then discards; a nonland discard puts a +1/+1 counter on it. */
  | { kind: 'connive'; what: Ref }
  // Transform (Marvel Super Heroes)
  /** Turn a double-faced permanent to its other face. */
  | { kind: 'transform'; what: Ref }
  /**
   * Exile the top N of your (or the opponent's) library; you may cast a spell
   * from among them (mana value at most `maxManaValue`) without paying its mana
   * cost. The rest go to the bottom, or stay exiled (Cosmic Cube, Doom Reigns Supreme).
   */
  | {
      kind: 'castFreeFromTop';
      count: number;
      from: 'yours' | 'opponents';
      maxManaValue?: Amount;
      rest: 'bottom' | 'exile';
    }
  /** Copy the topmost ability you control on the stack from an artifact source (Scientist Supreme). */
  | { kind: 'copyArtifactAbility' }
  /** For each keyword the target has and the source lacks, a keyword counter on the source (Super-Adaptoid). */
  | { kind: 'keywordCountersFrom'; what: Ref }
  /** Remove all +1/+1 counters from it (The Astonishing Ant-Man, after counting them). */
  | { kind: 'removePlusOneCounters'; from: Ref }
  /** Take an extra turn after this one (Kang the Conqueror). */
  | { kind: 'extraTurn'; noPowerUp?: boolean }
  /** Until end of turn, your creatures with toughness greater than power assign damage by toughness. */
  | { kind: 'assignToughness' }
  /** Counter a spell on the stack (unless it can't be countered). */
  | { kind: 'counter'; what: Ref; controllerTokens?: { token: CardDefId; count: number } }
  | { kind: 'bouncePlayerPermanents'; who: Ref; nonland?: boolean }
  /** Return a card of these types from your graveyard to your hand, of your choice (not targeted). */
  | { kind: 'returnFromGraveyard'; types: CardType[] }
  /** Put all creature cards from all graveyards onto the battlefield under your control. */
  | { kind: 'reanimateAll' }
  /** Exile the target graveyard card and create a token copy of it (Abyssal Harvester). */
  | { kind: 'tokenCopyOf'; what: Ref; addSubtype: string; exileOtherTokensWithSubtype: boolean }
  /** Put named counters on the source (Drake Hatcher), or on `to`. */
  | { kind: 'namedCounters'; name: string; amount: Amount; to?: Ref }
  /** Look at the top N, split them into two piles; an opponent picks one for your hand (Curator of Destinies). */
  | { kind: 'piles'; count: number }
  /**
   * Reveal cards from the top of your library until a creature card; it goes
   * to your hand, the rest to the bottom in a random order.
   */
  | { kind: 'revealUntilCreature' }
  /** The controller surveils N (like scry, but "bottom" means the graveyard). */
  | { kind: 'surveil'; amount: number }
  /** Exile a permanent until the source leaves the battlefield (Banishing Light). */
  | { kind: 'exileUntilSourceLeaves'; what: Ref }
  /** Return the subject (an exiled card) to the battlefield under its owner's control. */
  | { kind: 'returnSubject'; counters?: number; named?: string }
  /** Put a card from a graveyard onto the battlefield under your control (with a named counter: finality). */
  | {
      kind: 'returnToBattlefield';
      what: Ref;
      counter?: string;
      /** It enters tapped (Deadly Plot, Grim Reaper). */
      tapped?: boolean;
      /** It enters with +1/+1 counters if it matches the filter (Heroic Return: a Hero gets two). */
      countersIf?: { filter: CardFilter; count: number };
      // Marvel Super Heroes: "is a Hero in addition to its other types" (Thunderbolts Conspiracy).
      addSubtype?: string;
    }
  /** Destroy all creatures (matching the filter). `returnOne`: then return one of yours that died (Starfall Invocation). */
  | {
      kind: 'destroyAll';
      filter?: CardFilter;
      returnOne?: boolean;
      /** Permanents of any type, not just creatures (Season of Gathering). */
      permanents?: boolean;
      /** Gain this much life for each one destroyed (Avenge). */
      gainPerDestroyed?: number;
    }
  /** Look at the top N; you may take a card matching the filter into your hand; the rest go to the bottom at random. */
  | {
      kind: 'lookAndTake';
      count: number;
      filter: CardFilter;
      /** Onto the battlefield if it's your turn, otherwise into your hand (Whiskervale Forerunner). */
      battlefieldOnYourTurn?: boolean;
      /** A card not taken stays on top (Herald's Horn looks at one card). */
      restOnTop?: boolean;
      /** Marvel Super Heroes: the rest go to the graveyard (Earth's Mightiest Heroes). */
      restToGraveyard?: boolean;
    }
  /** Exile the top N; you may play them until the end of this turn or of your next turn. */
  | {
      kind: 'exileTopPlayable';
      count: Amount;
      until: 'endOfTurn' | 'endOfNextTurn';
      // Marvel Super Heroes (Daredevil): "If that card is a Hero card, ...".
      ifExiled?: { filter: CardFilter; then: EffectDef[] };
    }
  /** The source card goes from its owner's graveyard back to their hand (Angelic Destiny). */

  /** Each opponent sacrifices a creature of their choice; optionally you gain life equal to its toughness. */
  | {
      kind: 'opponentSacrifices';
      gainToughness?: boolean;
      greatestPower?: boolean;
      /** A permanent matching this instead of a creature. */
      filter?: CardFilter;
      /** Exiled instead of sacrificed (Early Winter). */
      exile?: boolean;
      /** You sacrifice instead of an opponent (Season of Loss: each player). */
      you?: boolean;
    }
  /**
   * Forage: exile three cards from your graveyard or sacrifice a Food. If you
   * do, `then` happens. `optional`: "you may forage".
   */
  | { kind: 'forage'; then: EffectDef[]; optional?: boolean }
  /** Offspring: a token copy of the source that's 1/1 (uses last known information). */
  | { kind: 'offspringCopy' }
  /** Counts a resolution of this ability this turn (see the `resolvedThisTurn` condition). */
  | { kind: 'noteResolution' }
  | { kind: 'counters'; to: Ref; amount: Amount }
  | { kind: 'fight'; a: Ref; b: Ref }
  | { kind: 'destroy'; what: Ref }
  | { kind: 'gainLife'; who: Ref; amount: Amount }
  | { kind: 'loseLife'; who: Ref; amount: Amount }
  | { kind: 'draw'; who: Ref; amount: Amount }
  | {
      kind: 'createToken';
      token: CardDefId;
      count: Amount;
      hasteThisTurn?: boolean;
      /** "Tapped and attacking" (Leonin Warleader). */
      attacking?: boolean;
      tapped?: boolean;
      /** Created under an opponent's control (a gift). */
      forOpponent?: boolean;
      /** Each enters with this many +1/+1 counters (Marvel Super Heroes: any amount, Alien Invasion). */
      counters?: Amount;
      /** Created under the controller of this target instead (Beast Within: "its controller"). */
      forControllerOf?: number;
    }
  /** Return all land cards from your graveyard to the battlefield tapped (World Shaper). */
  | { kind: 'returnLandsFromGraveyard' }
  | { kind: 'sacrifice'; what: Ref }
  /** The controller scries N (asks them to order the top cards). */
  | { kind: 'scry'; amount: number }
  | { kind: 'custom'; handler: string; params?: Record<string, unknown> }
  // Doom Prevails (9e).
  /** The owner shuffles it into their library, then reveals the top card: a permanent card enters (Chaos Warp). */
  | { kind: 'chaosWarp'; what: Ref }
  /** Exile the top card of each player's library; you may play them free while they stay exiled (Extract Power). */
  | { kind: 'exileTopsPlayableFree' }
  /** Exile the top card; you may play it until you exile another with this source (Superior Foes). */
  | { kind: 'exileTopPlayableUntilNext' }
  /** Exile a card with N time counters; it gains suspend (Kang Prime: the next nonland card from the top). */
  | { kind: 'suspend'; what: Ref | 'nextNonlandFromLibrary'; time: number }
  /** Unearth: the source returns from your graveyard with haste; it's exiled at the next end step or if it would die. */
  | { kind: 'unearth' }
  /** Currency Converter: a card exiled with it goes to its owner's graveyard; you get a Treasure or a 2/2 Rogue. */
  | { kind: 'converterReturn' }
  /** Lady Loki: exile the spell, exile until a nonland card, damage by the difference, cast that card free. */
  | { kind: 'ladyLoki' }
  /** Until end of turn, spells of the type chosen for the source have flash (Progenitor's Icon). */
  | { kind: 'flashForChosenType' }
  /**
   * Exile the card that caused the trigger from your graveyard (a discarded card):
   * playable this turn (Containment Construct), or tracked by the source (Currency Converter).
   */
  | { kind: 'exileDiscarded'; playable?: boolean | 'untilEndOfNextTurn'; track?: boolean }
  /** Each creature that convoked this spell connives (Lethal Scheme). */
  | { kind: 'conniveConvokers' }
  /** Internal: "that creature" for the effects after it. */
  | { kind: 'focus'; on: ObjectRef }
  /** Glorious Purpose: the cards exiled with the source that weren't cast go to your hand. */
  | { kind: 'exiledWithSourceToHand' }
  // The Fantastic Four (9d).
  /** You may cast this exiled card without paying its mana cost (rebound, Power Pack); also a card in hand (miracle). */
  | { kind: 'castFreeCard'; card: ObjectRef; exileAfter?: boolean }
  /**
   * Exile cards from the top until a nonland card with mana value at most `max`
   * (cascade: less than the source's). You may cast it free (discover: or put
   * it into your hand); the rest go to the bottom in a random order.
   */
  | { kind: 'revealUntilCastable'; max: Amount | 'belowSource'; orHand?: boolean }
  /**
   * Goad (or "attacks each combat if able"): until your next turn they attack
   * each combat if able. `draws`: whenever one deals combat damage to a player, you draw (Kang Dynasty).
   */
  | { kind: 'mustAttack'; what: Ref; cantBlock?: boolean; draws?: boolean }
  /** Explore: reveal the top card; a land goes to hand, otherwise a +1/+1 counter (the card stays on top). */
  | { kind: 'explore'; what: Ref }
  /** Copy the top triggered ability you control on the stack (Mister Fantastic). */
  | { kind: 'copyTopTrigger'; count: number }
  /** The source becomes a copy of the target until end of turn (Mirage Mirror). */
  | {
      kind: 'becomeCopy';
      of: Ref;
      // Marvel Super Heroes (Absorbing Man, Taskmaster, Secret Invasion).
      /** What becomes the copy (default: the source), e.g. the enchanted creature. */
      what?: Ref;
      /** How long: until its controller's next turn, or while the source stays on the battlefield. */
      until?: 'yourNextTurn' | 'whileSource';
      /** "Except he's a 4/4 Human Villain creature with vigilance" (Absorbing Man). */
      asCreature?: { power: number; toughness: number; subtypes: string[]; keywords: Keyword[] };
    }
  /** Tragic Arrogance: each player keeps one artifact, creature, enchantment and planeswalker (picked for them). */
  | { kind: 'keepOneOfEachType' }
  /** Promise of Loyalty: each player keeps one creature with a vow counter (picked for them). */
  | { kind: 'promiseOfLoyalty' }
  /** Exile a random card matching the filter from your graveyard; at your next upkeep you may cast it free (Power Pack). */
  | { kind: 'exileRandomToCastNextUpkeep'; filter: CardFilter }
  /** Each player gains control of all creatures they own (Alicia Masters). */
  | { kind: 'ownersRegainControl' }
  /** Negative Zone Portal's upkeep coin flip: on a loss, sacrifice it and return a random exiled card. */
  | { kind: 'negativeZoneFlip' }
  /** Look at the top N: put any number of permanent cards onto the battlefield, the rest into your hand (Genesis Ultimatum). */
  | { kind: 'lookPutPermanents'; count: number }
  /** Expressive Iteration: one of the top three to hand, one to the bottom, one exiled and playable this turn. */
  | { kind: 'expressiveIteration' }
  // Wakanda Forever (9c).
  /** `who` becomes the monarch (draws at their end step; combat damage to them takes it). */
  | { kind: 'becomeMonarch'; who: 'controller' | 'eachOpponent' }
  /** Exile it until an opponent of the source's controller becomes the monarch (Palace Jailer). */
  | { kind: 'exileUntilOpponentMonarch'; what: Ref }
  /** Monstrosity N: if the source isn't monstrous, N +1/+1 counters and it becomes monstrous. */
  | { kind: 'monstrosity'; amount: number }
  /** If it dies this turn, these happen (Fight for the Throne). */
  | { kind: 'whenDiesThisTurn'; what: Ref; effects: EffectDef[] }
  /**
   * Reveal the top N: you may put a permanent card onto the battlefield (with a
   * named counter), then one into your hand; the rest go to the graveyard (Wakanda Forever!).
   */
  | { kind: 'revealPutAndTake'; count: number; filter: CardFilter; counter?: string }
  /** Choose among these cards (still in the graveyard) one to put somewhere (follows revealPutAndTake). */
  | {
      kind: 'pickFromCards';
      cards: ObjectId[];
      filter: CardFilter;
      to: 'hand' | 'battlefield';
      counter?: string;
    }
  /** Its controller gains control of it for good, and untaps it (Coveted Jewel). */
  | { kind: 'giveControl'; what: Ref; to: 'eachOpponent' }
  /** Until end of turn you may cast a target permanent card from your graveyard, then no more spells (Conduit of Worlds). */
  | { kind: 'castFromGraveyardThisTurn'; what: Ref }
  // Avengers Assemble (9b).
  /**
   * Exile the top N cards of your library face down, remembered as exiled with
   * the source (Scarlet Witch); `who`: an opponent's library (Mind's Dilation).
   */
  | {
      kind: 'exileTopWithSource';
      count: number;
      who?: 'eachOpponent';
      /** You may play it while it stays exiled, with any mana (Klaw). */
      castable?: boolean;
    }
  /**
   * Until end of turn, all damage that would be dealt to you and creatures you
   * control is dealt to this creature instead (Heroic Sacrifice); `onDies`
   * happens if it dies this turn.
   */
  | { kind: 'redirectDamage'; to: Ref; onDies?: EffectDef[] }
  /** These permanents phase out until their controller's next untap step (Vision). */
  | { kind: 'phaseOut'; what: Ref }
  /** At the beginning of the next turn's upkeep, these happen (Arcane Denial). */
  | { kind: 'atNextUpkeep'; effects: EffectDef[] }
  /** Internal: a cascade or discover card not cast goes to the bottom (or into the hand). */
  | { kind: 'afterReveal'; card: ObjectRef; to: 'hand' | 'libraryBottom' }
  /** Internal: Expressive Iteration's other two cards. */
  | { kind: 'afterExpressive'; cards: ObjectId[] }
  /**
   * Gift of Immortality: return the creature this Aura was attached to; at the
   * beginning of the next end step the Aura returns attached to it (`returnAuraTo`).
   */
  | { kind: 'returnEnchantedThenAura' }
  | { kind: 'returnAuraTo'; aura: ObjectRef };

export type StaticDef =
  | {
      kind: 'anthem';
      affects: 'otherCreaturesYouControl' | 'creaturesYouControl' | 'creaturesOpponentsControl';
      filter?: CardFilter;
      condition?: ConditionDef;
      power: Amount;
      toughness: Amount;
      keywords?: Keyword[];
    }
  | { kind: 'noLifeGain' }
  | { kind: 'cantBlock' }
  /** This permanent doesn't untap during its controller's untap step. */
  | { kind: 'doesntUntap' }
  /** You may cast spells (matching the filter) as though they had flash (High Fae Trickster), while the condition holds. */
  | { kind: 'flashForAll'; filter?: CardFilter; condition?: ConditionDef }
  /**
   * Creatures you control matching the filter have "{T}: Add one of these"
   * (Clement: Frogs, {G} or {U}, only for creature spells).
   */
  | { kind: 'grantMana'; filter: CardFilter; produces: ManaType[]; onlyForCreatures?: boolean }
  /** You may play an additional land on each of your turns (Loot). */
  | { kind: 'extraLandDrop' }
  /** Prevent all combat damage dealt to and by this creature (Fog Bank). */
  | { kind: 'preventCombatDamage' }
  /** Other creatures of this subtype you control enter with a +1/+1 counter per one already there (Giada). */
  | { kind: 'entersWithCountersPerSubtype'; subtype: string }
  /** Equipment or Aura: the creature it is attached to gets this. */
  | {
      kind: 'attached';
      power: Amount;
      toughness: Amount;
      keywords?: Keyword[];
      /** Pacifism. */
      cantAttackOrBlock?: boolean;
      doesntUntap?: boolean;
      /** "Loses flying" (Starforged Sword). */
      loseKeywords?: Keyword[];
      /** "You control enchanted creature" (Kitnap). */
      control?: boolean;
      /** Marvel Super Heroes: "Double all damage equipped creature would deal" (Mjölnir). */
      doubleDamage?: boolean;
      /** Base power and toughness (Hulkbuster Armor: 9/9). */
      basePT?: [number, number];
      /** Can't be blocked (Whispersilk Cloak). */
      cantBeBlocked?: boolean;
      /** Damage to it is prevented and becomes +1/+1 counters (Panther Habit). */
      damageToCounters?: boolean;
    }
  /** All creatures able to block this creature do so (Prized Unicorn). */
  | { kind: 'lure' }
  /** If you would gain life, you gain that much plus N instead (Angel of Vitality). */
  | { kind: 'extraLifeGain'; amount: number }
  /** This creature gets this while its controller's life is at least `minLife`. */
  | { kind: 'whileLife'; minLife: number; power: number; toughness: number; keywords?: Keyword[] }
  /** This creature gets this while the condition holds (threshold, Ghitu Lavarunner). */
  | {
      kind: 'while';
      condition: ConditionDef;
      power: number;
      toughness: number;
      keywords?: Keyword[];
      cantBeBlocked?: boolean;
      /** Can't attack or block while the condition holds (Bast). */
      cantAttackOrBlock?: boolean;
    }
  /** Instant and sorcery spells you cast cost {N} less (Archmage of Runes). */
  | { kind: 'instantsAndSorceriesCostLess'; amount: number }
  | { kind: 'spellsCostLess'; filter: CardFilter; amount: Amount }
  | { kind: 'instantsAndSorceriesUncounterable' }
  /** You have no maximum hand size. */
  | { kind: 'noMaxHandSize' }
  /** Vizier: look at the top of your library any time; cast creatures from there with any mana. */
  | { kind: 'creaturesFromTopOfLibrary' }
  /** This creature gets +X/+Y (Persistent Marshstalker: +1/+0 for each other Rat you control). */
  | { kind: 'boost'; power: Amount; toughness: Amount }
  // Marvel Super Heroes
  /** Damage to it replaces damage already marked: it never accumulates (Wolverine, Fierce Fighter). */
  | { kind: 'damageDoesntAccumulate' }
  /** "You may activate abilities of creatures you control as though those creatures had haste" (Shang-Chi). */
  | { kind: 'abilitiesAsThoughHaste' }
  /** "Creatures with flying can't block creatures you control" (Storm, Windrider). */
  | { kind: 'flyersCantBlockYours' }
  /** "Prevent all damage that would be dealt to this creature" (Black Panther, Hope Enduring). */
  | { kind: 'preventDamageToSelf' }
  /** "If a creature you control would connive, instead you draw a card, then it connives" (Leader). */
  | { kind: 'conniveDrawsFirst' }
  /** "Noncreature spells you cast have improvise" (Ironheart). */
  | { kind: 'noncreatureSpellsHaveImprovise' }
  /** "Your opponents can't cast spells during your turn" (Jennifer Walters). */
  | { kind: 'opponentsCantCastDuringYourTurn' }
  /** "You have hexproof", while the condition holds (Captain America, Super-Soldier). */
  | { kind: 'youHaveHexproof'; condition?: ConditionDef }
  // Power-up (Marvel Super Heroes)
  /** Power-up abilities of other creatures you control cost {amount} less (Hulk, Gamma Goliath). */
  | { kind: 'powerUpCostsLess'; amount: number }
  /** This creature can't be blocked. */
  | { kind: 'cantBeBlocked' }
  /** This creature can't be blocked by creatures matching the filter. */
  | { kind: 'cantBeBlockedBy'; filter: CardFilter }
  /**
   * Other creatures you control enter with an additional +1/+1 counter while this
   * holds (Gev), or if they match the filter (Metallic Mimic: the chosen type).
   */
  | { kind: 'othersEnterWithCounter'; condition?: ConditionDef; filter?: CardFilter }
  /**
   * Damage from a source you control (matching the filter) is increased by
   * `amount` (Valley Flamecaller). `noncombat`/`toOpponents`: only that damage.
   */
  | {
      kind: 'damageBonus';
      /** 'sourcePower': this permanent's power (Hawkeye, Young Avenger). */
      amount: number | 'sourcePower';
      source?: CardFilter;
      noncombat?: boolean;
      toOpponents?: boolean;
      condition?: ConditionDef;
      /** Only from other sources than this permanent (Thor). */
      otherSources?: boolean;
    }
  /** If you would put counters on a permanent, put twice that many instead (Innkeeper's Talent). */
  | { kind: 'doubleCounters'; condition?: ConditionDef }
  /** If you would put counters on a permanent you control, put that many plus N instead (Doc Samson). */
  | { kind: 'extraCounters'; amount: number }
  /** Spells you cast matching the filter cost {N} less, while the condition holds. */
  | { kind: 'spellsCostLessIf'; filter: CardFilter; amount: number; condition?: ConditionDef }
  /** Look at the top card of your library any time; play cards matching the filter from there (Glarb). */
  | { kind: 'playFromTop'; filter: CardFilter }
  /** During your turn, cast instants and sorceries from your graveyard by paying 1 life more (Festival of Embers). */
  | { kind: 'castFromGraveyardForLife' }
  /** Cards and tokens that would go to your graveyard are exiled instead (Festival of Embers). */
  | { kind: 'graveyardToExile' }
  /** Other creatures are Food artifacts with the Food ability (Ygra). */
  | { kind: 'creaturesAreFood' }
  /** The first instant or sorcery you cast each turn costs {U} less per land with a flood counter (Eluge). */
  | { kind: 'floodDiscount' }
  /** Damage can't be prevented (Sunspine Lynx). */
  | { kind: 'damageCantBePrevented' }
  /** The enchanted permanent is a colorless Food artifact with no other abilities (Sugar Coat). */
  | { kind: 'enchantedIsFood' }
  /** Creatures your opponents control matching nothing in particular have base toughness N (Maha). */
  | { kind: 'opponentsBaseToughness'; toughness: number }
  /** Creatures your opponents control that would die are exiled instead (Vren). */
  | { kind: 'exileOpponentCreaturesInstead' }
  // Doom Prevails (9e).
  /** Creatures can't attack you unless their controller pays this for each (Propaganda). */
  | { kind: 'attackTax'; amount: number }
  /** Nonland cards in your hand have miracle {0}: the first card you draw each turn may be cast free (Molecule Man). */
  | { kind: 'miracleZero' }
  // The Fantastic Four (9d).
  /** This creature attacks each combat if able, while the condition holds (Galactus). */
  | { kind: 'attacksEachCombat'; condition?: ConditionDef }
  /** The legend rule doesn't apply to creatures you control (Council of Reeds). */
  | { kind: 'noLegendRule' }
  /** Triggered abilities of legendary creatures you control trigger an additional time (Annie Joins Up). */
  | { kind: 'legendaryTriggersTwice' }
  /** Lands you control have "{T}: Add one mana of any color" (Chromatic Lantern). */
  | { kind: 'landsTapForAnyColor' }
  // Wakanda Forever (9c).
  /** Prevent N of the damage sources your opponents control would deal to you (Heart-Shaped Herb). */
  | { kind: 'preventDamageToYou'; amount: number }
  /** Creature tokens you would create are this token instead (Divine Visitation: 4/4 Angels). */
  | { kind: 'creatureTokensBecome'; token: CardDefId }
  /** You may play lands from your graveyard (Conduit of Worlds). */
  | { kind: 'playLandsFromGraveyard' }
  /** Creatures matching the filter can't attack you while the condition holds (Queen Mother Ramonda). */
  | { kind: 'cantAttackYou'; filter: CardFilter; condition?: ConditionDef };

export type CardDb = ReadonlyMap<CardDefId, CardDefinition>;

// ---------------------------------------------------------------------------
// Game state (plain serializable data)
// ---------------------------------------------------------------------------

export type ZoneName =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'stack'
  // Brawl: where a commander starts and returns to.
  | 'command';

export interface GameObject {
  id: ObjectId;
  defId: CardDefId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneName;
  /** Zone-change counter: bumped on every zone change (rule 400.7). */
  zcc: number;
  /** When it entered its current zone; orders the battlefield and effects. */
  timestamp: number;
  tapped: boolean;
  /** Came under its controller's control since their most recent turn began. */
  summoningSick: boolean;
  damage: number;
  damagedByDeathtouch: boolean;
  plusOneCounters: number;
  isToken: boolean;
  // Transform (Marvel Super Heroes)
  /** It was attacking as it last left the battlefield (Ares, God of War). */
  leftAttacking?: boolean;
  /** Showing its back face (transformed, or cast as the back face): the front's id, restored when it leaves. */
  front?: CardDefId;
  /** Equipment: the creature it is attached to. */
  attachedTo?: ObjectId;
  /** Indices of "activate only once" abilities already used. */
  usedAbilities?: number[];
  /** Cards this permanent exiled "until it leaves the battlefield". */
  exiledUntilLeaves?: ObjectId[];
  /** It was cast with kicker. */
  kicked?: boolean;
  /** Its power as it last left the battlefield (last known information). */
  lastPower?: number;
  /** What it was attached to as it last left the battlefield (for "when enchanted creature dies"). */
  lastAttachedTo?: ObjectRef;
  /** Subtypes gained on top of the printed ones (Infernal Vessel's Demon). */
  addedSubtypes?: string[];
  /** Subtypes it had gained as it last left the battlefield. */
  lastAddedSubtypes?: string[];
  /** A card in exile its owner may play until the end of that turn (Strongbox Raider). */
  playableUntilTurn?: number;
  /** The turn it entered its current zone. */
  zoneTurn?: number;
  /** Named counters (e.g. incubation). */
  counters?: Record<string, number>;
  /** A copy's printed power and toughness (offspring tokens are 1/1). */
  copyPT?: { power: number; toughness: number };
  /** The turn it last became the target of its controller's spell or ability (valiant). */
  targetedByControllerTurn?: number;
  /** Resolutions of its triggered ability this turn (Harvestrite Host). */
  resolutions?: { turn: number; count: number };
  /** +1/+1 counters it had as it last left the battlefield (Essence Channeler). */
  lastCounters?: number;
  /** "Triggers only once each turn": the turn each such ability (by index) last triggered. */
  onceTurns?: Record<number, number>;
  /** It has lost all abilities (an effect until its controller's next turn). */
  blank?: boolean;
  /** A Class's level (1 if unset). */
  level?: number;
  /** Named counters it had as it last left the battlefield. */
  lastNamedCounters?: Record<string, number>;
  /** The color or creature type chosen for it as it entered. */
  chosenColor?: ManaType;
  chosenType?: string;
  /** Cards exiled with it (Keen-Eyed Curator). */
  exiledWith?: ObjectId[];
  /** Sugar Coat: the Aura that makes it a Food. */
  foodBy?: ObjectId;
  /** Someone other than its owner may cast it from exile, with any mana (Cruelclaw's Heist). */
  castableBy?: PlayerId;
  anyMana?: boolean;
  /** The X paid for it as a spell (Hugs). */
  xPaid?: number;
  /** Mockingbird: it entered as a copy; this is what it really is. */
  originalDefId?: CardDefId;
  /** Keywords it has for as long as it's on the battlefield (Mockingbird's flying). */
  grantedKeywords?: Keyword[];
  /** Kitnap: the Aura it's controlled by, and who controlled it before. */
  controlledBy?: { aura: ObjectId; previous: PlayerId };
  // Brawl.
  /** A commander: the zone change (zcc) at which its owner was last asked to move it to the command zone. */
  commandOffered?: number;
  // Doom Prevails (9e).
  /** The turn it was discarded (mayhem). */
  discardedTurn?: number;
  /** The creatures that convoked it, as a spell (Lethal Scheme). */
  convokedBy?: ObjectId[];
  /** In exile with suspend (time counters in `counters.time`). */
  suspended?: boolean;
  /** Times it was kicked (multikicker). */
  kickCount?: number;
  /** It gains haste as it enters (cast through suspend). */
  hasteOnEntry?: boolean;
  /** Extract Power: it may be played for free while exiled, by this player. */
  playFreeBy?: PlayerId;
  // The Fantastic Four (9d).
  /** Promise of Loyalty: it can't attack this player. */
  vowedTo?: PlayerId;
  /** The defId it is until end of turn, copying another (Mirage Mirror). */
  copyingUntilTurn?: number;
  // Marvel Super Heroes: longer copies.
  /** A copy that ends as this player's next turn begins (Absorbing Man, Taskmaster). */
  copyUntilTurnOf?: PlayerId;
  /** A copy that ends when this permanent leaves the battlefield (Secret Invasion). */
  copyWhileSource?: ObjectId;
  /** While copying, it's still a creature with copyPT (Absorbing Man), and these subtypes were added. */
  copyAsCreature?: boolean;
  copyAddedSubtypes?: string[];
  // Wakanda Forever (9c).
  /** It's monstrous (Fleecemane Lion). */
  monstrous?: boolean;
  /** A token copy that isn't legendary (Helm of the Host). */
  nonlegendary?: boolean;
  /** Exiled until an opponent of this player becomes the monarch (Palace Jailer). */
  jailedBy?: PlayerId;
  /** Kimoyo Beads: the modes of its triggered ability already chosen. */
  usedModes?: number[];
  // Avengers Assemble (9b).
  /** The turn it first became tapped (Captain America, Living Legend). */
  firstTappedTurn?: number;
  /** Sources that dealt damage to it this turn (Hawkeye); kept as it leaves. */
  damagedBy?: ObjectId[];
}

/** A reference that goes stale when the object changes zones. */
export interface ObjectRef {
  id: ObjectId;
  zcc: number;
}

export type TargetChoice = { player: PlayerId } | { object: ObjectRef };

export interface PlayerState {
  id: PlayerId;
  life: number;
  /** Index 0 is the top card. */
  library: ObjectId[];
  hand: ObjectId[];
  graveyard: ObjectId[];
  exile: ObjectId[];
  landsPlayedThisTurn: number;
  attackedThisTurn: boolean;
  drewFromEmptyLibrary: boolean;
  mulligans: number;
  keptHand: boolean;
  lost: boolean;
  /** Cards drawn for an opening hand, if not the usual seven (an expedition boon). */
  openingHand?: number;
  /** Floating mana: each entry is one mana of one of its types. */
  pool?: { produces: ManaType[]; untilEndOfTurn?: boolean; onlyFor?: string }[];
  /** They attacked during their most recent turn before the current one (Avenge). */
  attackedLastTurn?: boolean;
  // Brawl.
  /** The command zone. */
  command: ObjectId[];
  /** Their commander (the object keeps its id in every zone). */
  commander?: ObjectId;
  /** Times they have cast it from the command zone (commander tax: {2} each). */
  commanderCasts?: number;
}

export type StackItem =
  | {
      kind: 'spell';
      id: ObjectId;
      controller: PlayerId;
      targets: TargetChoice[];
      mode?: number;
      kicked?: boolean;
      /** Cast with flashback: exiled instead of going anywhere else. */
      flashback?: boolean;
      /** The value chosen for X. */
      x?: number;
      /** The pawprint modes chosen (repeats allowed), in printed order. */
      paws?: number[];
      /** A copy of a spell (not cast; it ceases to exist as it leaves the stack). */
      copy?: boolean;
      /** It enters with a finality counter (cast with Osteomancer Adept). */
      finality?: boolean;
      /** Mockingbird: the creature it enters as a copy of. */
      copyOf?: ObjectId;
      /** Cast from its owner's hand (rebound cares). */
      fromHand?: boolean;
      /** Times it was kicked (multikicker). */
      kickCount?: number;
      /** Cast from exile (Klaw). */
      fromExile?: boolean;
      /** Marvel Super Heroes: cast for its sneak cost; it enters tapped and attacking this player. */
      sneak?: PlayerId;
    }
  | {
      kind: 'ability';
      id: ObjectId;
      source: ObjectRef;
      /** Needed when the source has left the battlefield (e.g. dies triggers). */
      sourceDefId: CardDefId;
      abilityIndex: number;
      controller: PlayerId;
      targets: TargetChoice[];
      /** Source's power when it left the battlefield (e.g. sacrificed as a cost). */
      lkiPower?: number;
      subject?: ObjectRef;
      amount?: number;
      mode?: number;
      /** A granted trigger (Undying Malice): these effects instead of the card's ability. */
      inline?: EffectDef[];
      /** Marvel Super Heroes: the X paid for an activated ability. */
      x?: number;
      /** An emblem's ability. */
      emblem?: AbilityDef;
      /** The activated ability, as the source had it when activated. */
      activated?: Extract<AbilityDef, { kind: 'activated' }>;
    };

export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'beginCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'firstStrikeDamage'
  | 'combatDamage'
  | 'endCombat'
  | 'main2'
  | 'end'
  | 'cleanup';

export interface TurnState {
  // Marvel Super Heroes
  /** Power-up abilities can't be activated this turn (Kang the Conqueror's extra turn). */
  noPowerUp?: boolean;
  /** Creatures these players control assign combat damage by toughness if greater (The Kingpin of Crime). Replaced, never mutated. */
  toughnessDamage?: PlayerId[];
  /** 0 during the mulligan phase. */
  number: number;
  activePlayer: PlayerId;
  step: Step;
  /** Players who passed priority in succession since the last action. */
  passed: PlayerId[];
  /** Additional combat phases still to come this turn. */
  extraCombats: number;
  /** Creatures declared as attackers this turn, once per combat. */
  attackers: ObjectId[];
  /** How many times each player gained life this turn. */
  lifeGains: Record<PlayerId, number>;
  /** Creatures that died this turn (Morbid). */
  creaturesDied: number;
  /** Cards each player drew this turn. */
  cardsDrawn: Record<PlayerId, number>;
  /** Total mana each player spent this turn (expend). Missing in older saves. */
  manaSpent?: Record<PlayerId, number>;
  /** How many times each player lost life this turn. Missing in older saves. */
  lifeLost?: Record<PlayerId, number>;
  /** Spells each player cast this turn. */
  spellsCast?: Record<PlayerId, number>;
  /** Creatures each player controlled that were exiled from the battlefield this turn. */
  creaturesExiled?: Record<PlayerId, number>;
  /** Creatures that died under each player's control this turn. */
  creaturesLost?: Record<PlayerId, number>;
  /** Cards that left each player's graveyard this turn (Bonecache Overseer). */
  leftGraveyard?: Record<PlayerId, number>;
  /** Foods each player sacrificed this turn. */
  foodsSacrificed?: Record<PlayerId, number>;
  /** Card definitions of the spells each player cast this turn, in order (Alania). */
  castDefs?: Record<PlayerId, CardDefId[]>;
  /** Instants and sorceries each player cast this turn (Eluge). */
  instantsSorceriesCast?: Record<PlayerId, number>;
  /** Players who may cast creature spells from their graveyard by foraging this turn (Osteomancer Adept). */
  osteomancer?: PlayerId[];
  /** Players who can't cast more spells this turn (Conduit of Worlds). */
  spellLock?: PlayerId[];
  /** Cards each player discarded this turn (Living Laser, Typhoid Mary). */
  discards?: Record<PlayerId, number>;
  /** Creature types whose spells have flash this turn, per player (Progenitor's Icon). */
  flashTypes?: { player: PlayerId; type: string }[];
  /** Players with hexproof until end of turn (Dawn's Truce). */
  hexproofPlayers?: PlayerId[];
}

export interface Attacker {
  id: ObjectId;
  defender: PlayerId;
  /** Attacking this planeswalker (controlled by `defender`) instead of the player. */
  planeswalker?: ObjectId;
  /** Stays true even if all blockers are removed (rule 509.1h). */
  blocked: boolean;
  blockers: ObjectId[];
}

export interface CombatState {
  attackers: Attacker[];
  /** Creatures that dealt damage in the first-strike step. */
  dealtFirstStrikeDamage: ObjectId[];
}

export interface ContinuousEffect {
  timestamp: number;
  affected: ObjectRef;
  power: number;
  toughness: number;
  keywords: Keyword[];
  cantBlock?: boolean;
  exileIfDies?: boolean;
  cantBeBlocked?: boolean;
  returnWhenDies?: ReturnWhenDies;
  /** Loses all abilities. */
  loseAbilities?: boolean;
  /** Sacrificed when it deals combat damage (Dropkick Bomber). */
  sacrificeOnCombatDamage?: boolean;
  /** Doesn't untap during its controller's untap step (Spider-Woman, Secret Agent). */
  doesntUntap?: boolean;
  /** "Whenever it deals combat damage this turn, you may exile it, then return it." */
  blinkOnCombatDamage?: boolean;
  /** It's an artifact creature (a crewed Vehicle). */
  becomesCreature?: boolean;
  /** Combat damage that would be dealt to it is prevented (Fleeting Flight). */
  preventCombatDamage?: boolean;
  /** Base power and toughness. */
  basePT?: [number, number];
  /** Control change: who controlled it before (restored when this expires). */
  previousController?: PlayerId;
  /** 'untilYourNextTurn': until `player`'s next turn begins. */
  expires: 'endOfTurn' | 'untilYourNextTurn' | 'whileSource';
  /** Marvel Super Heroes: for 'whileSource', the permanent it lasts for. */
  whileSourceId?: ObjectId;
  player?: PlayerId;
  // Doom Prevails (9e).
  /** Kang Dynasty: whenever it deals combat damage to a player, this player draws. */
  drawsFor?: PlayerId;
  // The Fantastic Four (9d).
  /** Goad: it attacks each combat if able. */
  mustAttack?: boolean;
  // Avengers Assemble (9b).
  cantBeBlockedExcept?: Keyword;
  counterOnCombatDamage?: boolean;
  /** Damage to this player and their creatures goes to the affected creature instead (Heroic Sacrifice). */
  redirectFor?: PlayerId;
  /** What happens if the affected creature dies while this lasts. */
  onDies?: { effects: EffectDef[]; controller: PlayerId; sourceDefId: CardDefId };
}

/** What an effect needs to know about the spell or ability producing it. */
export interface EffectSource {
  controller: PlayerId;
  /** The card/permanent the effect comes from. */
  source: ObjectRef | null;
  sourceDefId: CardDefId;
  /** Chosen targets; null where the target became illegal. */
  targets: (TargetChoice | null)[];
  lkiPower?: number;
  /** What caused the trigger. */
  subject?: ObjectRef;
  amount?: number;
  /** The permanent picked by 'chooseYourPermanent'. */
  chosen?: ObjectRef;
  /** The value chosen for X. */
  x?: number;
}

/**
 * A spell or ability paused mid-resolution to ask a player something (e.g.
 * scry). The remaining effects run once they answer.
 */
export interface PausedResolution extends EffectSource {
  effects: EffectDef[];
  /**
   * The stack item being resolved; a spell goes to the graveyard when done
   * (exiled with rebound for `rebound`'s next upkeep, or to the library bottom).
   */
  item: {
    kind: 'spell' | 'ability';
    id: ObjectId;
    exile?: boolean;
    rebound?: PlayerId;
    libraryBottom?: boolean;
  };
}

export interface PendingTrigger {
  source: ObjectRef;
  sourceDefId: CardDefId;
  abilityIndex: number;
  controller: PlayerId;
  lkiPower?: number;
  /** What caused the trigger (e.g. the creature that entered). */
  subject?: ObjectRef;
  /** A number from the trigger event (e.g. combat damage dealt). */
  amount?: number;
  /** A granted trigger: these effects instead of the card's ability. */
  inline?: EffectDef[];
  /** An emblem's ability (Season of the Bold). */
  emblem?: AbilityDef;
}

export interface Emblem {
  controller: PlayerId;
  /** The card that made it (deals its damage, names it). */
  source: ObjectRef;
  sourceDefId: CardDefId;
  ability: AbilityDef;
  /** It ends at the cleanup step of this turn (undefined: never). */
  untilTurn?: number;
  /** It goes away once it has triggered (Galvanic Iteration). */
  once?: boolean;
}

export interface DelayedTrigger {
  controller: PlayerId;
  sourceDefId: CardDefId;
  /** The object it refers to ("it"): e.g. the exiled card to return. */
  subject: ObjectRef;
  effects: EffectDef[];
  /** Not before this turn's end step if created during it: the turn it may fire from. */
  fromTurn: number;
  /** Only at this player's end step ("your next end step"). */
  whose?: PlayerId;
  /** At the beginning of an upkeep instead of an end step (Arcane Denial). */
  at?: 'upkeep';
}

/** What Undying Malice / Fake Your Own Death grant. */
export interface ReturnWhenDies {
  counters: number;
  treasure: boolean;
}

export type Decision =
  | {
      kind: 'optionalEffect';
      player: PlayerId;
      effects: EffectDef[];
      cost?: ManaCost;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | { kind: 'mulligan'; player: PlayerId }
  /** Brawl: move your commander from its zone to the command zone? (answered with chooseEffect) */
  | { kind: 'commandZone'; player: PlayerId; card: ObjectId; thenPriority: PlayerId }
  | { kind: 'bottomCards'; player: PlayerId; count: number }
  | { kind: 'priority'; player: PlayerId }
  | {
      kind: 'declareAttackers';
      player: PlayerId;
      declared: { id: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[];
    }
  | {
      kind: 'declareBlockers';
      player: PlayerId;
      declared: { blocker: ObjectId; attacker: ObjectId }[];
    }
  | {
      kind: 'chooseTriggerTargets';
      player: PlayerId;
      trigger: PendingTrigger;
      /** Who receives priority once the trigger is on the stack. */
      thenPriority: PlayerId;
    }
  | { kind: 'discardToHandSize'; player: PlayerId; count: number }
  /** Discard from an effect (Chart a Course); resolution continues afterwards. */
  | {
      kind: 'discard';
      player: PlayerId;
      count: number;
      /** Only cards matching this. */
      filter?: CardFilter;
      /** Exiled instead of discarded (Ruthless Negotiation). */
      exile?: boolean;
      /** Connive: the creature that gets a +1/+1 counter if a nonland card is discarded. */
      connive?: ObjectRef;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      kind: 'searchLibrary';
      player: PlayerId;
      /** Cards they may pick (the rest of the library stays hidden to the opponent). */
      options: ObjectId[];
      /** Choosing from the graveyard instead of searching the library (Inspiration from Beyond). */
      fromGraveyard?: boolean;
      /** Where the card goes. Default: hand. */
      to?: 'hand' | 'battlefieldTapped' | 'battlefield' | 'graveyard' | 'libraryTop';
      required?: boolean;
      /** Only these top cards were looked at: the rest go to the bottom in a random order (no shuffle). */
      looked?: ObjectId[];
      /** Shuffle afterwards (default true unless `looked`). */
      shuffle?: boolean;
      /** The chosen card enters with this named counter (Kastral: finality). */
      counter?: string;
      /** Untap the land found if you then control this many lands (Fabled Passage). */
      untapIfLands?: number;
      /** Cache Grab: a Food if you control a Squirrel or took a Squirrel card. */
      squirrelFood?: boolean;
      /** Whiskervale Forerunner: onto the battlefield on your turn, else into your hand. */
      battlefieldOnYourTurn?: boolean;
      /** The looked-at cards not taken stay on top (Herald's Horn). */
      restOnTop?: boolean;
      /** Marvel Super Heroes: the cards not taken go to the graveyard. */
      restToGraveyard?: boolean;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Put `count` of these into your hand (one at a time); the rest go to your graveyard (Stargaze). */
      kind: 'pickCards';
      player: PlayerId;
      options: ObjectId[];
      count: number;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Curator of Destinies: split these cards into a face-up and a face-down pile. */
      kind: 'splitPiles';
      player: PlayerId;
      cards: ObjectId[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** The opponent picks the pile that goes to the owner's hand; the other goes to the graveyard. */
      kind: 'choosePile';
      player: PlayerId;
      owner: PlayerId;
      faceUp: ObjectId[];
      faceDown: ObjectId[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Lose life unless you sacrifice a nonland permanent or discard (Perforating Artist). */
      kind: 'punisher';
      player: PlayerId;
      /** Nonland permanents to sacrifice and cards in hand to discard. */
      options: ObjectId[];
      life: number;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose one of the exiled cards to be playable (Strongbox Raider). */
      kind: 'pickExiled';
      player: PlayerId;
      options: ObjectId[];
      /** Playable only until the end of this turn (Fireglass Mentor). */
      thisTurn?: boolean;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose a creature to sacrifice (Tribute to Hunger). */
      kind: 'sacrifice';
      player: PlayerId;
      options: ObjectId[];
      /** Gains life equal to the sacrificed creature's toughness. */
      gainLifeFor?: PlayerId;
      /** Exiled instead of sacrificed (Early Winter). */
      exile?: boolean;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      kind: 'scry';
      player: PlayerId;
      /** Surveil: "bottom" cards go to the graveyard instead. */
      surveil?: boolean;
      /** The top cards of their library, top first. */
      cards: ObjectId[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Forage: sacrifice one of these Foods, exile three graveyard cards, or (if optional) don't. */
      kind: 'forage';
      player: PlayerId;
      foods: ObjectId[];
      graveyard: boolean;
      optional: boolean;
      /** Effects that happen if they forage. */
      then: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Forage by exiling cards from the graveyard, one at a time. */
      kind: 'forageExile';
      player: PlayerId;
      count: number;
      /** A resolution-time forage: these effects, then the rest of the resolution. */
      then?: EffectDef[];
      resume?: PausedResolution;
      /** Who gets priority afterwards (after a cost, the player who paid it). */
      thenPriority: PlayerId;
    }
  | {
      /** Choose a card from `from`'s hand (they reveal it). */
      kind: 'chooseFromHand';
      player: PlayerId;
      from: PlayerId;
      options: ObjectId[];
      then: 'discard' | 'exile';
      /** The chooser may cast the exiled card (Cruelclaw's Heist). */
      castable?: boolean;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose one of these. */
      kind: 'chooseOption';
      player: PlayerId;
      options: { label: string; effects: EffectDef[] }[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose a permanent you control (or, if `optional`, none). */
      kind: 'chooseObject';
      player: PlayerId;
      options: ObjectId[];
      then: EffectDef[];
      otherwise: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Pay `cost` or the spell is countered. */
      kind: 'payOrCounter';
      player: PlayerId;
      spell: ObjectId;
      cost: ManaCost;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Cast one of these cards for free now, or not (Daring Waverider, Portent of Calamity). */
      kind: 'castFree';
      player: PlayerId;
      cards: ObjectId[];
      exileAfter?: boolean;
      /** Cast by discarding a card rather than paying (The Infamous Cruelclaw). */
      discardInstead?: boolean;
      /** Cards that go to hand once this is answered (Portent's other exiled cards). */
      thenToHand?: ObjectId[];
      /** Marvel Super Heroes: cards not cast go to the bottom of their owner's library. */
      thenToBottom?: ObjectId[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Sacrifice `count` more of these, one at a time; then `then`. */
      kind: 'sacrificeSeveral';
      player: PlayerId;
      options: ObjectId[];
      count: number;
      then: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | { kind: 'gameOver' };

export interface GameState {
  schemaVersion: 1;
  // Marvel Super Heroes
  /** Extra turns to come, next first (Kang the Conqueror). Replaced, never mutated. */
  extraTurns?: { player: PlayerId; noPowerUp?: boolean }[];
  seed: number;
  rng: RngState;
  nextObjectId: number;
  nextTimestamp: number;
  players: Record<PlayerId, PlayerState>;
  objects: Record<ObjectId, GameObject>;
  battlefield: ObjectId[];
  /** Last element is the top of the stack. */
  stack: StackItem[];
  turn: TurnState;
  combat: CombatState | null;
  effects: ContinuousEffect[];
  pendingTriggers: PendingTrigger[];
  /** Ygra is on the battlefield: other creatures are Food artifacts. */
  creaturesAreFood?: boolean;
  /** Abilities players have from emblems or effects (Season of the Bold, Ral). */
  emblems?: Emblem[];
  /** "At the beginning of the next end step, ...": fire at the first end step after `afterTurn` / this step. */
  delayed?: DelayedTrigger[];
  /** Brawl: 25 life, a commander each, the first mulligan free. */
  format?: 'brawl';
  /** The monarch (Wakanda Forever). */
  monarch?: PlayerId;
  /** Phased-out permanents (treated as though they don't exist), and whose untap step brings them back. */
  phasedOut?: { id: ObjectId; player: PlayerId }[];
  /** Exactly one player is always being asked something (or the game is over). */
  decision: Decision;
  winner: PlayerId | 'draw' | null;
}

export interface RngState {
  s: [number, number, number, number];
}

// ---------------------------------------------------------------------------
// Actions and events
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'chooseEffect'; player: PlayerId; accept: boolean }
  | { type: 'keepHand'; player: PlayerId }
  | { type: 'mulligan'; player: PlayerId }
  /** London mulligan: put one card on the bottom (repeated until done). */
  | { type: 'bottomCard'; player: PlayerId; card: ObjectId }
  | { type: 'passPriority'; player: PlayerId }
  | { type: 'playLand'; player: PlayerId; card: ObjectId }
  | {
      type: 'castSpell';
      player: PlayerId;
      /** From hand, from the graveyard (flashback) or from the top of the library. */
      card: ObjectId;
      targets: TargetChoice[];
      /** Which mode of a "choose one" spell. */
      mode?: number;
      kicked?: boolean;
      /** The creature sacrificed as an additional cost (Eaten Alive). */
      sacrifice?: ObjectId;
      /** Forage as an additional cost: the Food to sacrifice, or 'graveyard' to exile three cards. */
      forage?: ObjectId | 'graveyard';
      /** The card discarded as an additional cost (Sazacap's Brew). */
      discard?: ObjectId;
      /** The value chosen for X. */
      x?: number;
      /** Pawprint modes (Seasons), in printed order, repeats allowed. */
      paws?: number[];
      /** Cast without paying its mana cost (a 'castFree' decision). */
      free?: boolean;
      /** Cast from the graveyard through Festival of Embers or Osteomancer Adept. */
      // Transform (Marvel Super Heroes)
      /** Cast a modal double-faced card's back face. */
      back?: boolean;
      // Sneak (Marvel Super Heroes)
      /** Cast for its sneak cost by returning this unblocked attacker to its owner's hand. */
      sneak?: ObjectId;
      via?: 'festival' | 'osteomancer' | 'conduit' | 'free';
      /** Mockingbird: the creature to enter as a copy of. */
      copyOf?: ObjectId;
      /** Rottenmouth Viper: permanents sacrificed to make it cheaper. */
      sacrificeMany?: ObjectId[];
      /** Times multikicker is paid (Batroc). */
      kickCount?: number;
      // Teamwork (Marvel Super Heroes)
      /** The creatures tapped to pay teamwork (a kicked teamwork spell). Omitted: the engine picks. */
      teamwork?: ObjectId[];
      /** Mana sources to tap. Omitted: the engine picks. */
      payWith?: ObjectId[];
    }
  | {
      type: 'activateAbility';
      player: PlayerId;
      source: ObjectId;
      abilityIndex: number;
      targets: TargetChoice[];
      /** The creature sacrificed as a cost (Vampiric Rites). */
      sacrifice?: ObjectId;
      /** Forage as a cost: the Food to sacrifice, or 'graveyard' to exile three cards. */
      forage?: ObjectId | 'graveyard';
      /** The card discarded as a cost (Flamecache Gecko). */
      discard?: ObjectId;
      payWith?: ObjectId[];
      // Marvel Super Heroes
      /** The value chosen for {X} in the ability's cost (Bruce Banner). */
      x?: number;
    }
  | {
      type: 'addAttacker';
      player: PlayerId;
      attacker: ObjectId;
      defender: PlayerId;
      /** Attack this planeswalker instead of the player (re-declares an attacker). */
      planeswalker?: ObjectId;
    }
  | { type: 'removeAttacker'; player: PlayerId; attacker: ObjectId }
  | { type: 'confirmAttackers'; player: PlayerId }
  | { type: 'addBlock'; player: PlayerId; blocker: ObjectId; attacker: ObjectId }
  | { type: 'removeBlock'; player: PlayerId; blocker: ObjectId }
  | { type: 'confirmBlockers'; player: PlayerId }
  | { type: 'chooseTargets'; player: PlayerId; targets: TargetChoice[]; mode?: number }
  /** Discard to hand size, one card at a time. */
  | { type: 'discard'; player: PlayerId; card: ObjectId }
  /** Answer a scry: `top` stays on top in that order, `bottom` goes to the bottom in that order. */
  | { type: 'scry'; player: PlayerId; top: ObjectId[]; bottom: ObjectId[] }
  /** Answer a library search: the card to take, or null to find nothing. */
  | { type: 'chooseCard'; player: PlayerId; card: ObjectId | null }
  /** Curator of Destinies: which cards go in the face-up pile (the rest are face down). */
  | { type: 'splitPiles'; player: PlayerId; faceUp: ObjectId[] }
  | { type: 'choosePile'; player: PlayerId; pile: 'faceUp' | 'faceDown' }
  /** Pick one of the options of a 'chooseOption' decision. */
  | { type: 'chooseOption'; player: PlayerId; index: number }
  /** Answer a forage: a Food to sacrifice, 'graveyard' to exile three cards, or null not to. */
  | { type: 'forage'; player: PlayerId; choice: ObjectId | 'graveyard' | null }
  | { type: 'concede'; player: PlayerId };

export type GameEvent =
  | { type: 'objectMoved'; id: ObjectId; defId: CardDefId; from: ZoneName | null; to: ZoneName }
  | { type: 'damageDealt'; source: ObjectId; to: TargetChoice; amount: number; combat: boolean }
  | { type: 'lifeChanged'; player: PlayerId; delta: number; life: number }
  | { type: 'tapped'; id: ObjectId; first?: boolean }
  /** A card went from its owner's hand to their graveyard (Doom Prevails). */
  | { type: 'discarded'; id: ObjectId; player: PlayerId }
  /** A creature connived (Doom Prevails). */
  | { type: 'connived'; id: ObjectId; player: PlayerId }
  /** Wakanda Forever: a new monarch. */
  | { type: 'monarchChanged'; player: PlayerId }
  /** Vision: a permanent phased out or back in. */
  | { type: 'phased'; id: ObjectId; in: boolean }
  | { type: 'untapped'; id: ObjectId }
  /** `nth`: how many spells that player has cast this turn, including this one. */
  | { type: 'spellCast'; id: ObjectId; player: PlayerId; nth?: number }
  | { type: 'abilityActivated'; id: ObjectId; source: ObjectId; player: PlayerId }
  | { type: 'triggerStacked'; id: ObjectId; source: ObjectId; player: PlayerId }
  | { type: 'resolved'; id: ObjectId }
  | { type: 'fizzled'; id: ObjectId }
  | { type: 'countered'; id: ObjectId }
  | { type: 'attackersDeclared'; attackers: ObjectId[] }
  | { type: 'blockersDeclared'; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: 'stepChanged'; turn: number; step: Step; activePlayer: PlayerId }
  /** `nth`: how many cards that player has drawn this turn, including this one. */
  | { type: 'cardDrawn'; player: PlayerId; id: ObjectId; nth: number }
  | { type: 'shuffled'; player: PlayerId }
  | { type: 'mulligan'; player: PlayerId; count: number }
  | { type: 'scried'; player: PlayerId; top: number; bottom: number }
  | { type: 'searched'; player: PlayerId; id: ObjectId }
  /** A card revealed from a library and put into its owner's hand. */
  | { type: 'revealed'; player: PlayerId; id: ObjectId }
  /** +1/+1 counters were put on a permanent. */
  | { type: 'countersAdded'; id: ObjectId; count: number; player: PlayerId }
  /** `player` foraged. */
  | { type: 'foraged'; player: PlayerId }
  /** `player` gave a gift. */
  | { type: 'giftGiven'; player: PlayerId }
  /** A Class gained a level. */
  | { type: 'levelChanged'; id: ObjectId; level: number }
  // Teamwork (Marvel Super Heroes)
  | { type: 'tappedForTeamwork'; id: ObjectId }
  // Transform (Marvel Super Heroes)
  | { type: 'transformed'; id: ObjectId; defId: CardDefId }
  /** A permanent was sacrificed (just before it left the battlefield). */
  | { type: 'sacrificed'; id: ObjectId; defId: CardDefId; player: PlayerId }
  /** `player` spent mana: their total this turn went from `before` to `after`. */
  | { type: 'manaSpent'; player: PlayerId; before: number; after: number }
  /** `player`'s spell or ability targeted these objects. */
  | {
      type: 'targeted';
      player: PlayerId;
      ids: ObjectId[];
      /** Marvel Super Heroes (Loki): by an ability rather than a spell, and whether players were targeted. */
      byAbility?: boolean;
      anyTarget?: boolean;
    }
  | { type: 'gameOver'; winner: PlayerId | 'draw' };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
