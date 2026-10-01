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

export type CardType = 'Creature' | 'Instant' | 'Sorcery' | 'Land' | 'Enchantment' | 'Artifact';
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
  /** Ward: targeting it costs an opponent `CardDefinition.wardCost` (default {2}). */
  | 'ward'
  /** Ward {1}, granted by another permanent (Long River Lurker, Innkeeper's Talent). */
  | 'wardOne';

/** What an instant or sorcery (or one of its modes) does when it resolves. */
export interface SpellDef {
  targets: TargetSpec[];
  effects: EffectDef[];
  /** Shown when choosing a mode. */
  label?: string;
}

export interface CardDefinition {
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
    as?: 'offspring' | 'gift';
  };
  /** Costs {amount} less if its first target matches (Dire Downdraft: an attacking or tapped creature). */
  costReductionIfTarget?: { filter: CardFilter; amount: number };
  /** "As an additional cost to cast this spell, forage or pay this" (Feed the Cycle). */
  forageOrPay?: ManaCost;
  /** Aura: what it enchants (chosen as a target when cast). */
  enchant?: TargetSpec;
  /** Costs {1} less for each matching permanent you control (affinity). */
  costReduction?: Amount;
  /** Flashback: may be cast from the graveyard for this cost, then exiled. */
  flashback?: ManaCost;
  /** Power and toughness set by a count (e.g. Crusader of Odric). */
  ptEquals?: Amount;
  abilities: AbilityDef[];
  isToken?: boolean;
}

export type AbilityDef =
  | {
      kind: 'mana';
      cost: CostDef;
      produces: ManaType;
      /** "Spend this mana only to cast a spell of this subtype" (Giada: 'Angel'). */
      onlyFor?: string;
      /** Makes two mana instead of one while this holds (Ilysian Caryatid). */
      doubleIf?: ConditionDef;
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
      /** Activated from the graveyard (Reassembling Skeleton). */
      fromGraveyard?: boolean;
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
      /** "You may pay ... and N life": life paid with `cost` (Zoraline). */
      lifeCost?: number;
      /** Triggers while the card is in its owner's graveyard (Persistent Marshstalker). */
      fromGraveyard?: boolean;
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
}

export type TriggerDef =
  | { on: 'etb' }
  | { on: 'otherCreatureEtb'; controller: 'you' | 'any'; filter?: CardFilter }
  | { on: 'dies' }
  | { on: 'otherCreatureDies'; controller: 'you' | 'opponent' | 'any'; nontoken?: boolean }
  /** Whenever this or another creature you control dies. */
  | { on: 'creatureYouControlDies'; nontoken?: boolean }
  /** Whenever a creature you control deals combat damage (on your turn); "that creature", "that much". */
  | { on: 'creatureYouControlDealsCombatDamage' }
  | { on: 'beginningOfCombat'; whose: 'yours' }
  | { on: 'youGainLife' }
  /** Whenever the creature this Aura is attached to dies. */
  | { on: 'attachedDies' }
  /** Whenever the creature this Equipment is attached to deals combat damage to a player. */
  | { on: 'equippedDealsCombatDamageToPlayer' }
  | { on: 'attacks' }
  /** "Whenever you attack" (with one or more creatures matching the filter): once per combat. */
  | { on: 'youAttack'; filter?: CardFilter }
  | { on: 'combatDamageToPlayer' }
  | {
      on: 'castSpell';
      filter: 'any' | 'creature' | 'noncreature' | 'instantOrSorcery' | 'targetsSelf';
      /** The spell must also match this (Gev: a Lizard spell). */
      spell?: CardFilter;
    }
  /** Whenever a player casts their second spell each turn (Hearthborn Battler). */
  | { on: 'anyPlayerSecondSpell' }
  /** At the beginning of your precombat or postcombat main phase. */
  | { on: 'beginningOfMain'; which: 1 | 2 }
  /** Whenever you draw your second card each turn. */
  | { on: 'drawSecondCard' }
  | { on: 'drawCard'; whose: 'yours' | 'opponents' }
  /** Whenever a source you control deals noncombat damage to an opponent ("that many"). */
  | { on: 'yourNoncombatDamageToOpponent' }
  /** Whenever this creature becomes blocked. */
  | { on: 'becomesBlocked' }
  /** Whenever a creature you control (matching the filter) attacks; "that creature" is the subject. */
  | { on: 'creatureYouControlAttacks'; filter?: CardFilter }
  | { on: 'landfall' }
  | { on: 'beginningOfUpkeep'; whose: 'yours' | 'each' }
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
  /** When you sacrifice this permanent (Carrot Cake). */
  | { on: 'sacrificed' }
  /** Whenever you sacrifice a permanent matching the filter (Camellia: a Food). */
  | { on: 'youSacrifice'; filter: CardFilter };

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
  /** At least one condition holds. */
  | { kind: 'any'; of: ConditionDef[] }
  /** The condition doesn't hold. */
  | { kind: 'not'; condition: ConditionDef }
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
  | { controllerOf: number };

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
  | { sacrificedPower: true };

export type EffectDef =
  | { kind: 'may'; effects: EffectDef[]; cost?: ManaCost }
  | { kind: 'damage'; amount: Amount; to: Ref; from?: Ref }
  /** Until end of turn. */
  | {
      kind: 'pump';
      to: Ref;
      power: Amount;
      toughness: Amount;
      keywords?: Keyword[];
      cantBlock?: boolean;
      /** "If it would die this turn, exile it instead." */
      exileIfDies?: boolean;
      cantBeBlocked?: boolean;
      /** Gains "When this creature dies, return it to the battlefield tapped ..." */
      returnWhenDies?: ReturnWhenDies;
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
    }
  | { kind: 'exile'; what: Ref }
  /** Exile a card from a graveyard; extra effects if it was a creature card (Scavenging Ooze). */
  | { kind: 'exileGraveyardCard'; what: Ref; ifCreature?: EffectDef[] }
  /** Each opponent loses `life` unless they sacrifice a nonland permanent or discard a card. */
  | { kind: 'punisher'; life: number }
  /** Exile the top N cards; choose one you may play until the end of your next turn (or of this turn). */
  | { kind: 'exileTopChooseOne'; count: number; until?: 'endOfTurn' }
  /**
   * Look at an opponent's hand and choose a card matching the filter; they
   * discard it (Thought-Stalker Warlock) or it's exiled.
   */
  | { kind: 'chooseFromOpponentHand'; filter?: CardFilter; then: 'discard' | 'exile' }
  /** A player chooses one of these (the owner of target `ownerOf`, or the controller). */
  | {
      kind: 'choose';
      ownerOf?: number;
      options: { label: string; effects: EffectDef[] }[];
    }
  /** Put permanents on the top or bottom of their owners' libraries. */
  | { kind: 'putInLibrary'; what: Ref; position: 'top' | 'bottom' }
  /** Gain control of permanents until end of turn (Reptilian Recruiter). */
  | { kind: 'gainControl'; what: Ref }
  /**
   * Until your next turn, permanents lose all abilities (and have base power
   * and toughness `basePT` if creatures): Azure Beastbinder.
   */
  | { kind: 'loseAbilities'; what: Ref; basePT?: [number, number] }
  | { kind: 'untap'; what: Ref }
  /** An additional combat phase after this one. */
  | { kind: 'extraCombat' }
  /** Attach this Equipment to a creature. */
  | { kind: 'attach'; to: Ref }
  /** Search your library for a basic land, put it into your hand, then shuffle. */
  | {
      /** Search your library (Bushwhack, Circuitous Route). Shuffles afterwards unless `shuffle` is false. */
      kind: 'searchLibrary';
      filter: 'basicLand' | 'basicLandOrGate' | CardFilter;
      to: 'hand' | 'battlefieldTapped' | 'battlefield' | 'graveyard';
      /** Unrestricted tutors cannot fail to find a card in a nonempty library. */
      required?: boolean;
      shuffle?: boolean;
    }
  /** Look at the top N; you may put a creature with mana value up to your land count onto the battlefield (Loot). */
  | { kind: 'lookForCreature'; count: number }
  | { kind: 'bounce'; what: Ref }
  | { kind: 'returnToHand'; what: Ref }
  | { kind: 'exileGraveyard'; who: Ref }
  | { kind: 'tap'; what: Ref }
  /** The controller discards N cards of their choice. */
  | { kind: 'discard'; count: number; who?: 'controller' | 'eachOpponent' }
  /** Put the top N cards of your library into your graveyard. */
  | { kind: 'mill'; count: number }
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
  /** Put a card from a graveyard onto the battlefield under your control (with a named counter: finality). */
  | { kind: 'returnToBattlefield'; what: Ref; counter?: string }
  /** Destroy all creatures (matching the filter). `returnOne`: then return one of yours that died (Starfall Invocation). */
  | { kind: 'destroyAll'; filter?: CardFilter; returnOne?: boolean }
  /** Look at the top N; you may take a card matching the filter into your hand; the rest go to the bottom at random. */
  | { kind: 'lookAndTake'; count: number; filter: CardFilter }
  /** Exile the top N; you may play them until the end of this turn or of your next turn. */
  | { kind: 'exileTopPlayable'; count: Amount; until: 'endOfTurn' | 'endOfNextTurn' }
  /** The source card goes from its owner's graveyard back to their hand (Angelic Destiny). */

  /** Each opponent sacrifices a creature of their choice; optionally you gain life equal to its toughness. */
  | { kind: 'opponentSacrifices'; gainToughness?: boolean; greatestPower?: boolean }
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
    }
  /** Return all land cards from your graveyard to the battlefield tapped (World Shaper). */
  | { kind: 'returnLandsFromGraveyard' }
  | { kind: 'sacrifice'; what: Ref }
  /** The controller scries N (asks them to order the top cards). */
  | { kind: 'scry'; amount: number }
  | { kind: 'custom'; handler: string; params?: Record<string, unknown> };

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
  /** You may cast spells as though they had flash (High Fae Trickster). */
  | { kind: 'flashForAll' }
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
    }
  /** Instant and sorcery spells you cast cost {N} less (Archmage of Runes). */
  | { kind: 'instantsAndSorceriesCostLess'; amount: number }
  | { kind: 'spellsCostLess'; filter: CardFilter; amount: number }
  | { kind: 'instantsAndSorceriesUncounterable' }
  /** You have no maximum hand size. */
  | { kind: 'noMaxHandSize' }
  /** Vizier: look at the top of your library any time; cast creatures from there with any mana. */
  | { kind: 'creaturesFromTopOfLibrary' }
  /** This creature gets +X/+Y (Persistent Marshstalker: +1/+0 for each other Rat you control). */
  | { kind: 'boost'; power: Amount; toughness: Amount }
  /** This creature can't be blocked. */
  | { kind: 'cantBeBlocked' }
  /** This creature can't be blocked by creatures matching the filter. */
  | { kind: 'cantBeBlockedBy'; filter: CardFilter }
  /** Other creatures you control enter with an additional +1/+1 counter while this holds (Gev). */
  | { kind: 'othersEnterWithCounter'; condition: ConditionDef }
  /**
   * Damage from a source you control (matching the filter) is increased by
   * `amount` (Valley Flamecaller). `noncombat`/`toOpponents`: only that damage.
   */
  | {
      kind: 'damageBonus';
      amount: number;
      source?: CardFilter;
      noncombat?: boolean;
      toOpponents?: boolean;
      condition?: ConditionDef;
    }
  /** Creatures your opponents control that would die are exiled instead (Vren). */
  | { kind: 'exileOpponentCreaturesInstead' };

export type CardDb = ReadonlyMap<CardDefId, CardDefinition>;

// ---------------------------------------------------------------------------
// Game state (plain serializable data)
// ---------------------------------------------------------------------------

export type ZoneName = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack';

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
}

export interface Attacker {
  id: ObjectId;
  defender: PlayerId;
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
  /** Base power and toughness. */
  basePT?: [number, number];
  /** Control change: who controlled it before (restored when this expires). */
  previousController?: PlayerId;
  /** 'untilYourNextTurn': until `player`'s next turn begins. */
  expires: 'endOfTurn' | 'untilYourNextTurn';
  player?: PlayerId;
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
}

/**
 * A spell or ability paused mid-resolution to ask a player something (e.g.
 * scry). The remaining effects run once they answer.
 */
export interface PausedResolution extends EffectSource {
  effects: EffectDef[];
  /** The stack item being resolved; a spell goes to the graveyard when done. */
  item: { kind: 'spell' | 'ability'; id: ObjectId; exile?: boolean };
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
  | { kind: 'bottomCards'; player: PlayerId; count: number }
  | { kind: 'priority'; player: PlayerId }
  | { kind: 'declareAttackers'; player: PlayerId; declared: { id: ObjectId; defender: PlayerId }[] }
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
      to?: 'hand' | 'battlefieldTapped' | 'battlefield' | 'graveyard';
      required?: boolean;
      /** Only these top cards were looked at: the rest go to the bottom in a random order (no shuffle). */
      looked?: ObjectId[];
      /** Shuffle afterwards (default true unless `looked`). */
      shuffle?: boolean;
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
  | { kind: 'gameOver' };

export interface GameState {
  schemaVersion: 1;
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
      payWith?: ObjectId[];
    }
  | { type: 'addAttacker'; player: PlayerId; attacker: ObjectId; defender: PlayerId }
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
  | { type: 'tapped'; id: ObjectId }
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
  /** A permanent was sacrificed (just before it left the battlefield). */
  | { type: 'sacrificed'; id: ObjectId; defId: CardDefId; player: PlayerId }
  /** `player` spent mana: their total this turn went from `before` to `after`. */
  | { type: 'manaSpent'; player: PlayerId; before: number; after: number }
  /** `player`'s spell or ability targeted these objects. */
  | { type: 'targeted'; player: PlayerId; ids: ObjectId[] }
  | { type: 'gameOver'; winner: PlayerId | 'draw' };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
