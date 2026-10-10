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
  // Secrets of Strixhaven (14b): Magmablood Archaic
  /** Two-brid pips: each payable with one mana of this type or with two generic ({2/R}). */
  twoHybrid?: ManaType[];
  /** How many {X} the cost has (X is chosen as the spell is cast). */
  x?: number;
}

// ---------------------------------------------------------------------------
// Card definitions (static data; referenced from state by CardDefId)
// ---------------------------------------------------------------------------

export type CardType =
  | 'Creature'
  | 'Instant'
  | 'Sorcery'
  | 'Land'
  | 'Enchantment'
  | 'Artifact'
  | 'Planeswalker'
  // Lorwyn Eclipsed (18b): Kindred cards (Firdoch Core, Morcant's Eyes, Boggart Mischief, Nameless Inversion).
  | 'Kindred';
export type Supertype = 'Basic' | 'Legendary' | 'Snow'; // Strixhaven Brawl (15b, w/u/g): Snow

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
  // Strixhaven Brawl (15b, g): Mistcutter Hydra
  /** Protection from blue: can't be targeted, damaged or blocked by blue sources. */
  | 'protectionBlue'
  // Tarkir: Dragonstorm (19a): Ureni, the Song Unending ("protection from white and from black")
  | 'protectionWhite'
  | 'protectionBlack'
  // Tarkir: Dragonstorm (19a): Rot-Curse Rakshasa
  /** Decayed: can't block; when it attacks, sacrifice it at end of combat. A decayed counter gives it. */
  | 'decayed'
  | 'defender'
  | 'flash'
  | 'indestructible'
  /** Can't be the target of instants an opponent controls (Elenda). */
  | 'hexproofFromInstants'
  /** Can't be the target of white spells or abilities an opponent controls (Knight of Malice). */
  | 'hexproofFromWhite'
  // Tarkir: Dragonstorm (19b, misc): Dragonfire Blade
  /** Can't be the target of monocolored spells or abilities (sources with exactly one colour) an opponent controls. */
  | 'hexproofFromMonocolored'
  /** Ward: targeting it costs an opponent `CardDefinition.wardCost` (default {2}). */
  | 'ward'
  /** Ward {1}, granted by another permanent (Long River Lurker, Innkeeper's Talent). */
  | 'wardOne'
  // Lorwyn Eclipsed (18b, red): Hexing Squelcher
  /** "Ward—Pay 2 life", granted by another permanent. */
  | 'wardPayTwoLife'
  /** Can't be the target of spells or abilities (Whispersilk Cloak). */
  | 'shroud'
  /** Changeling: every creature type. */
  | 'changeling'
  // Lorwyn Eclipsed (18a): persist and wither
  /** Persist: when it dies, if it had no -1/-1 counters on it, it returns with a -1/-1 counter. */
  | 'persist'
  /** Wither: damage it deals to creatures is dealt as -1/-1 counters. */
  | 'wither';

/** What an instant or sorcery (or one of its modes) does when it resolves. */
export interface SpellDef {
  targets: TargetSpec[];
  effects: EffectDef[];
  /** Shown when choosing a mode. */
  label?: string;
  /** Escalate: tap this many untapped creatures you control as an extra cost (the engine picks them). */
  escalate?: number;
  /** Strixhaven Brawl (15a): Battle Screech: the creatures tapped for `escalate` must match this (white). */
  escalateFilter?: CardFilter;
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
    // Strixhaven Brawl (15b, pair): Altered Ego
    /** X additional +1/+1 counters on it. */
    xCounters?: boolean;
    /** Final Fantasy Commander (12c): any creature, whatever its mana value (Altered Ego). */
    anyManaValue?: boolean;
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
  wardCost?: {
    mana: ManaCost;
    life?: number;
    discard?: boolean;
    sacrificeFood?: boolean;
    // Strixhaven Brawl (15b, b): Vein Ripper, "Ward—Sacrifice a creature."
    sacrificeCreature?: boolean;
    // Final Fantasy (11c): ward paid in life
    /** "Ward—Pay life equal to its power" (Raubahn). */
    lifeEqualsPower?: boolean;
    // Reality Fracture (17a): Emrakul, the Exigent Doom
    /** "Ward—Sacrifice three permanents." */
    sacrificePermanents?: number;
  };
  /** "This spell can't be countered." */
  uncounterable?: boolean;
  // Secrets of Strixhaven (14b): Choreographed Sparks
  /** "This spell can't be copied." */
  cantBeCopied?: boolean;
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
    // Final Fantasy (11b): kicker paid with a permanent
    /** "Kicker—Sacrifice an artifact or creature" (Vayne's Treachery): `cost` is {0}. */
    sacrifice?: CardFilter;
    /** "Kicker—Return a land you control to its owner's hand" (Chocobo Kick): `cost` is {0}. */
    returnLand?: boolean;
    // Strixhaven (13b): Baleful Mastery
    /** An alternative cost: `cost` is paid rather than the mana cost (not on top of it). */
    replacesCost?: boolean;
    /** Strixhaven (13c): what the alternative cost does, for the cast menu (Verdant Mastery). */
    altLabel?: string;
    // Lorwyn Eclipsed (18c, theme decks): Starfield Shepherd
    /** The alternative cost can only be used from your hand (Warp: cast from exile later, it costs its mana cost). */
    handOnly?: boolean;
    /** Strixhaven Brawl (15b, u): life paid as part of the alternative cost (Tezzeret's Gambit: 2). */
    life?: number;
    // Mystical Archive (16): Daze, Force of Will
    /** With `returnLand`: only a land matching this may be returned (Daze: an Island). */
    returnLandFilter?: CardFilter;
    /** The alternative cost also exiles a card from your hand matching this (Force of Will: a blue card). */
    exileFromHand?: CardFilter;
    /** The kicked (all modes at once) version may only be cast while this holds (Akroma's Will: you control a commander). */
    onlyIf?: ConditionDef;
    // Marvel Super Heroes Jumpstart (Incredible)
    /**
     * "As an additional cost, you may behold a <filter>" (Hulk's Thunderclap): `cost` is {0}; kicked
     * only if you control a matching permanent or have another matching card in hand.
     */
    behold?: CardFilter;
    // Marvel Super Heroes Jumpstart (Pym Particles)
    /** "You may cast this spell as though it had flash if it's cast using teamwork" (Quantum Reduction). */
    flash?: boolean;
    // Lorwyn Eclipsed (18a): "As an additional cost to cast this spell, you may blight N"
    /** The optional additional cost is blighting a creature you control N times (`cost` is {0}); paid, the spell is `kicked`. */
    blight?: number;
    /**
     * "You may choose a creature type and behold N creatures of that type" (Celestial Reunion): `cost` is {0}; paid, the spell is
     * `kicked`, its caster picks the type and then the creatures one at a time, and the spell remembers the type
     * (`searchLibrary.battlefieldIfChosenType`).
     */
    beholdChosenType?: number;
  };
  // Mystical Archive (16): Angel's Grace, Krosan Grip, Berserk
  /** Split second: while it is on the stack, nobody can cast spells or activate (non-mana) abilities. */
  splitSecond?: boolean;
  /** Costs {amount} less if its first target matches (Dire Downdraft: an attacking or tapped creature). */
  costReductionIfTarget?: {
    filter: CardFilter;
    amount: number;
    // Secrets of Strixhaven (14b): Brush Off ("costs {1}{U} less")
    /** One pip of this colour is also taken off the cost. */
    alsoColored?: Color;
  };
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
  /** Lorwyn Eclipsed (18a): "Flashback—{1}{R}, Behold three Elementals": flashing it back also beholds `count` matching cards or permanents. */
  flashbackBehold?: { filter: CardFilter; count: number };
  // Reality Fracture (17a): Twinned Vision
  /** "Flashback—{cost}, Discard a card": flashing it back also discards a card. */
  flashbackDiscard?: boolean;
  /** As it resolves it's exiled (Genesis Ultimatum) or put on the bottom of its owner's library (Ultimate Nullification). */
  afterResolving?: 'exile' | 'libraryBottom';
  /** Only creatures matching this may be sacrificed for `sacrificeCreatureToCast` (Ultimate Nullification: legendary). */
  sacrificeToCastFilter?: CardFilter;
  /** It may be cast from your graveyard by discarding a card as well (Dragon Man). */
  castFromGraveyardWithDiscard?: boolean;
  /** Strixhaven Brawl (15a): Squee, the Immortal: "You may cast this card from your graveyard or from exile." */
  castFromGraveyardOrExile?: boolean;
  // Strixhaven Brawl (15b, g): Spinning Wheel Kick
  /** With `upToXTargets`: this many targets don't count against X (the first target is not one of the X). */
  upToXOffset?: number;
  /** It enters with X +1/+1 counters (Royal Talon Fighter Jet); a number: that many times X (Primo: twice X). */
  entersWithXCounters?: boolean | number;
  // Strixhaven Brawl (15b, pair)
  /** X can't be less than this (Ornate Imitations: "X can't be 0"). */
  minX?: number;
  // Marvel Super Heroes Jumpstart (Tenacious/Rampaging)
  /** It enters with this many +1/+1 counters (Voracious Brood: one per creature card in your graveyard). */
  entersWithCountersAmount?: Amount;
  /** Costs {amount} less while the condition holds (Heroic Return, Avenge). */
  costReductionIf?: {
    condition: ConditionDef;
    amount: number;
    // Strixhaven Brawl (15b, b): Blasphemous Edict ("pay {B} rather than {3}{B}{B}"): a pip of this colour comes off too.
    alsoColored?: Color;
  };
  /** "You may sacrifice any number of nonland permanents. This spell costs {1} less for each" (Rottenmouth Viper). */
  sacrificeAnyForReduction?: boolean;
  /** Strixhaven (13c): Plumb the Forbidden: "you may sacrifice one or more creatures; when you do, copy this spell for each". */
  sacrificeCreaturesToCopy?: boolean;
  /** "You may sacrifice any number of creatures. This spell costs {N} less for each" (Awaken the Blood Avatar). */
  sacrificeCreaturesForReduction?: number;
  /** "As an additional cost to cast this spell, discard a card" (Sazacap's Brew). */
  discardToCast?: boolean;
  /** "As an additional cost to cast this spell, discard a card or pay this" (Titania, Rugged Rumbler). */
  discardOrPay?: ManaCost;
  /** It enters tapped while this holds (Eddymurk Crab: if it's not your turn). */
  entersTappedIf?: ConditionDef;
  /** "As an additional cost to cast this spell, forage or pay this" (Feed the Cycle). */
  forageOrPay?: ManaCost;
  // Lorwyn Eclipsed (18a): blight, evoke, conspire, behold-and-exile
  /** "As an additional cost to cast this spell, blight N" (put N -1/-1 counters on a creature you control; chosen when casting). */
  blightToCast?: number;
  /** "As an additional cost to cast this spell, blight N or pay <pay>" (Bogslither's Embrace, Wild Unraveling). */
  blightOrPay?: { amount: number; pay: ManaCost };
  /** "As an additional cost to cast this spell, blight X. X can't be greater than the greatest toughness among creatures you control" (Soul Immolation); X is `{ x: true }`. */
  blightX?: boolean;
  /** Evoke: may be cast for this instead of its mana cost; if it was, it's sacrificed when it enters (see the `wasEvoked` condition). */
  evoke?: ManaCost;
  /** Conspire: as it's cast, you may tap two untapped creatures you control that share a colour with it; if you do, copy it. */
  conspire?: boolean;
  /**
   * "As an additional cost to cast this spell, behold a <filter> and exile it" (the Champions): a matching permanent you control
   * or a matching card in your hand is exiled. A later "return the exiled card to its owner's hand" is the `returnBeholdExiled` effect.
   */
  beholdExile?: CardFilter;
  // Reality Fracture (17c): Countersculpt
  /**
   * "As an additional cost to cast this spell, behold a <filter> or pay <pay>": a Jace you control or a Jace card in your hand
   * (revealed; nothing else happens to it) makes the cost free, else the cast pays `pay` too. The cast action says which (`beheld`).
   */
  beholdOrPay?: { filter: CardFilter; pay: ManaCost };
  // Lorwyn Eclipsed (18b, blue): Illusion Spinners
  /** "You may cast this spell as though it had flash if <condition>." */
  flashIf?: ConditionDef;
  // Tarkir: Dragonstorm (19a): the Sieges
  /**
   * "As this enchantment enters, choose Abzan or Mardu": the options, each with the abilities it adds (the card's own `abilities`
   * stay too). The cards package derives a hidden definition for each option (`variantOf`) and an enters trigger that makes
   * the chosen player's permanent that definition (the `becomeVariant` effect); it shows the front again wherever it goes.
   */
  enterChoices?: { label: string; abilities: AbilityDef[] }[];
  /** A derived definition: the card with this id, having made one of its `enterChoices`. Never in a deck or a hand. */
  variantOf?: CardDefId;
  // Tarkir: Dragonstorm (19a): Harmonize
  /**
   * Harmonize: with `flashback: <harmonize cost>`. Cast from the graveyard for that cost, then exiled. As it's cast you may tap an
   * untapped creature you control to reduce the generic part of the cost by its power (the cast action's `harmonizeTap`).
   */
  harmonize?: boolean;
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
  // Final Fantasy (11a): tiered
  /** Tiered ("choose one additional cost"): with `modes`, choosing mode i also costs `tiered[i]`. */
  tiered?: ManaCost[];
  // Final Fantasy (11a): adventure lands
  /** Its back face (`back`) is an Adventure: cast from hand, it then goes on an adventure in exile. */
  adventure?: boolean;
  /** It has no mana cost (a transforming card's back face), so it can't be cast. */
  noManaCost?: boolean;
  // Secrets of Strixhaven (14a): prepare, converge, paradigm
  /** Prepare creature: its `back` is the prepare spell, not castable from hand (a copy is, while it's prepared). */
  prepare?: boolean;
  /** "This creature enters prepared." */
  entersPrepared?: boolean;
  /** Converge: "enters with a +1/+1 counter on it for each color of mana spent to cast it." */
  entersWithCountersPerColorSpent?: boolean;
  /** Paradigm: resolved, it's exiled; at each of your first main phases you may cast a copy for free. */
  paradigm?: boolean;
  // Secrets of Strixhaven (14b): Slumbering Trudge
  /** Enters with this many stun counters minus X (not below 0), and tapped if X is below this. */
  stunCountersMinusX?: number;
  // Strixhaven (13c): Draconic Intervention
  /** "As an additional cost, exile a card matching this from your graveyard"; its mana value is X. */
  exileFromGraveyardToCast?: CardFilter;
  // Strixhaven (13c): Crackle with Power
  /** "Up to X targets": no more targets than the value chosen for X. */
  upToXTargets?: boolean;
  // Secrets of Strixhaven (14b)
  /** Pawprint-style modes: the most modes you may choose (default 5; Moment of Reckoning: four). */
  pawBudget?: number;
  /** Soaring Stoneglider: not paying the kicker means exiling this many cards from your graveyard instead. */
  unkickedExilesGraveyard?: number;
  /** Group Project: flashback also taps this many untapped creatures you control. */
  flashbackTapCreatures?: number;
  /** Strixhaven Brawl (15a): Battle Screech: the creatures tapped for flashback must match this. */
  flashbackTapFilter?: CardFilter;
  /** Strixhaven Brawl (15a): Escape (Sentinel's Eyes): flashback also exiles this many other cards from your graveyard, and the card isn't exiled. */
  escapeExiles?: number;
  /** Strixhaven Brawl (15a): Disturb: the back face (`back`, whose `flashback` is the disturb cost) may be cast from your graveyard. */
  disturb?: boolean;
  /** Strixhaven Brawl (15a): "If this would be put into a graveyard from anywhere, exile it instead" (Luminous Phantom). */
  exileInsteadOfGraveyard?: boolean;
  // Strixhaven Brawl (15b, b): additional costs with a choice
  /** "As an additional cost, sacrifice a creature or discard a card" (Bone Shards). */
  discardOrSacrifice?: boolean;
  /** "As an additional cost, discard a card or pay N life" (Bitter Triumph). */
  discardOrLife?: number;
  /** Cast from the graveyard (with `castFromGraveyardWithDiscard`) paying this much life too (Demonic Embrace). */
  graveyardCastLife?: number;
  // Strixhaven Brawl (15b, w): bestow
  /** Bestow: the cost of casting it as an Aura (its `back` is that Aura, derived from this card by the cards package). */
  bestow?: ManaCost;
  /** Bestow: what the Aura says in addition to the card's own abilities ("Enchanted creature gets +1/+1 and has lifelink"). */
  bestowAbilities?: AbilityDef[];
  /** Bestow: this is the Aura form of the creature card with this id; unattached, it becomes that creature again. */
  bestowFront?: CardDefId;
  // Strixhaven Brawl (15b, u): delve, spree, X-value targets
  /** Delve: each card exiled from your graveyard pays for {1} of the generic cost (the engine exiles only as many as needed). */
  delve?: boolean;
  /**
   * Spree: choose one or more of `pawprints` (one {P} each, no repeats); each mode adds its own cost here
   * (index-aligned with `pawprints`) to the card's mana cost.
   */
  spree?: ManaCost[];
  /** The first target's mana value must equal X (Stolen by the Fae). */
  targetManaValueX?: boolean;
  // Tarkir: Dragonstorm (19b, black): Hundred-Battle Veteran
  /** "You may cast this card from your graveyard. If you do, it enters with a finality counter on it." */
  castFromGraveyardFinality?: boolean;
}

export type AbilityDef =
  | {
      kind: 'mana';
      cost: CostDef;
      produces: ManaType;
      /**
       * "Spend this mana only to cast a spell of this subtype" (Giada: 'Angel'; 'chosenType': a creature spell of the type chosen for it;
       * Lorwyn Eclipsed (18b, special) 'chosenTypeOrAbility': a spell of the chosen type, or an ability of a source of the chosen type: Eclipsed Realms).
       */
      onlyFor?: string;
      // Lorwyn Eclipsed (18b, red): Flamebraider
      /** With `onlyFor`: the mana can also pay to activate abilities of sources of that subtype ("Elemental spells or abilities of Elemental sources"). */
      orAbilitiesOfSources?: boolean;
      /** Makes two mana instead of one while this holds (Ilysian Caryatid). */
      doubleIf?: ConditionDef;
      /** Only if this is the color chosen for it (Uncharted Haven). */
      ifChosen?: boolean;
      // Brawl staples.
      /** Mana per tap, if more than one (Sol Ring). */
      amount?: number;
      /** Mana per tap from a count (Elvish Archdruid: {G} for each Elf you control). */
      amountOf?: Amount;
      /**
       * Only if the colour is in your commander's colour identity (Command
       * Tower), or a land an opponent controls could make it (Exotic Orchard).
       */
      colorFrom?: 'commander' | 'opponentLands' | 'legendaries' | 'yourLands';
      // Strixhaven Brawl (15b, g): Incubation Druid, Astral Cornucopia
      /** Makes three mana instead of one while this holds. */
      tripleIf?: ConditionDef;
      /** Adds as much mana as this permanent has named counters of this kind. */
      perNamedCounters?: string;
      /** Deals 1 damage to you when spent as this colour (Talismans). */
      pain?: boolean;
      /** Path of Ancestry: scry 1 when spent on a creature spell sharing a type with your commander. */
      scryIfCommanderType?: boolean;
      // Marvel Super Heroes
      /** "Activate only if ..." (Dark Fortress: it entered this turn or you control a basic land). */
      condition?: ConditionDef;
      /** Strixhaven (13c): Accomplished Alchemist: adds as much mana as the life you gained this turn (at least one). */
      perLifeGained?: boolean;
      // Secrets of Strixhaven (14b): Topiary Lecturer
      /** Adds as much mana as this permanent's power. */
      perPower?: boolean;
      // Strixhaven (13c): Strixhaven Stadium
      /** Puts a named counter on this permanent each time it's tapped for this mana. */
      addCounter?: string;
      // Reality Fracture (17a): Heartwood Crafter
      /** "This mana can't be spent to cast spells from your hand." */
      notForSpellsFromHand?: boolean;
      // Reality Fracture (17a fixes): Loot, the Nexus; Doc Samson, Super Psychiatrist
      /**
       * "Add N mana of any one color" (N from `amountOf` or `perPower`): every mana of one tap is the same
       * colour, chosen as the mana is spent. `produces` is ignored.
       */
      anyOneColor?: boolean;
      // Lorwyn Eclipsed (18b, special): Brigid, Doun's Mind ("X {G} or X {W}")
      /** With `anyOneColor`: the colour is one of these only. */
      oneOf?: ManaType[];
      // Lorwyn Eclipsed (18b, green): Bloom Tender
      /** "For each color among permanents you control, add one mana of that color." */
      vivid?: boolean;
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
      // Tarkir: Dragonstorm (19a): the Devotees
      /**
       * A mana ability with a cost that is mana itself ("{1}: Add {U}, {R}, or {W}. Activate only once each turn."): it doesn't use the
       * stack, so it resolves as soon as its cost is paid; the mana goes to your pool. Its effects are `addMana`.
       */
      manaAbility?: boolean;
      // Marvel Super Heroes Jumpstart (Great Lakes Avengers)
      /** Also activated from exile, with `fromGraveyard` (Mister Immortal). */
      fromExile?: boolean;
      // Power-up (Marvel Super Heroes)
      /** Power-up: once only, and it costs the card's mana cost less if it entered this turn. */
      powerUp?: boolean;
      /** Activated from your hand (cycling). */
      fromHand?: boolean;
      // Final Fantasy (11b/11c): activated cost reduction
      /** "This ability costs {1} less to activate for each ..." (Qiqirn Merchant: Towns; Balamb Garden). */
      costReduction?: Amount;
      // Reality Fracture (17a): Warrior's Blades
      /** "This ability costs {1} less to activate for each +1/+1 counter on the creature it targets." */
      costReductionPerTargetCounter?: boolean;
      // Tarkir: Dragonstorm (19b, misc): Dragonfire Blade
      /** "This ability costs {1} less to activate for each color of the creature it targets." */
      costReductionPerTargetColor?: boolean;
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
  /** Tarkir: Dragonstorm (19a): "Pay X life" (Krumar Initiate), X the value chosen for the {X} in the mana cost; no more than your life. */
  lifeX?: boolean;
  /** Discard a card (chosen when activating). */
  discard?: boolean;
  // Reality Fracture (17a): Solitary Cell
  /** With `discard`: only a card matching this may be discarded ("Discard a legendary card"). */
  discardFilter?: CardFilter;
  /** Tap this many untapped tokens you control (Baylen, Tangle Tumbler). */
  tapTokens?: number;
  // Marvel Super Heroes Jumpstart (Masters of Evil)
  /** Tap an untapped creature you control matching this (the engine picks the weakest): Villainous Syndication. */
  tapCreature?: CardFilter;
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
  /** Strixhaven Brawl (15b, r): only artifacts matching this count for `sacrificeArtifacts` (Magda: Treasures). */
  sacrificeArtifactsFilter?: CardFilter;
  // Avengers Assemble (9b).
  /** Crew N: tap untapped creatures you control with total power N or more (the engine picks them). */
  crew?: number;
  // Strixhaven (13a): Stonerise Spirit, Tome Shredder
  /** Exile a card matching the filter from your graveyard (the engine picks the least useful one). */
  exileFromGraveyard?: CardFilter;
  // Strixhaven (13c)
  /** A loyalty ability with X: remove X loyalty counters (Kasmina, Enigma Sage). */
  loyaltyX?: boolean;
  // Reality Fracture (17c): Chandra, Chill of Compliance
  /** With `loyaltyX`: X may be 0 (the ability still does its work, e.g. taps the target). */
  loyaltyXZero?: boolean;
  /** Return this permanent to its owner's hand (Rootha, Mercurial Artist). */
  returnSelf?: boolean;
  /** Exile an instant or sorcery card from your hand with three refine counters (Uvilda, Dean of Perfection). */
  exileRefine?: boolean;
  // Secrets of Strixhaven (14b): Harmonized Trio
  /** Tap this many other untapped creatures you control (the engine picks the least useful). */
  tapOtherCreatures?: number;
  // Secrets of Strixhaven (14b): Page, Loose Leaf
  /** Discard another card with the same name as the source (with `discard`). */
  discardSameName?: boolean;
  // Strixhaven Brawl (15b, multi): Call the Crash
  /** Suspend N: exile this card from your hand with N time counters on it. */
  suspendSelf?: number;
  // Reality Fracture (17a): Tenured Tethermage
  /** Tap this many untapped artifacts you control (chosen when activating; the source may be one). */
  tapArtifacts?: number;
  // Lorwyn Eclipsed (18a): Blight N
  /** Blight N: put N -1/-1 counters on a creature you control (chosen when activating). */
  blight?: number;
  // Jump In slots (Polygraph Orb)
  /** Collect evidence N: exile cards from your graveyard with total mana value N or greater (chosen one at a time). */
  collectEvidence?: number;
  /** "Remove a counter from this creature" / "Remove two counters from this creature": counters of any kinds, chosen when activating. */
  removeAnyCounters?: number;
  // Lorwyn Eclipsed (18b, multi-b): High Perfect Morcant, Kirol
  /**
   * "Tap three untapped Elves you control" / "Tap two untapped creatures you control": the permanents are chosen when activating
   * (the action's `tapArtifacts` lists them, whatever their type; the source may be one of them).
   */
  tapUntapped?: { count: number; filter: CardFilter };
  // Lorwyn Eclipsed (18b, white): Kithkeeper
  /** "Tap three untapped creatures you control" (the source may be one of them; the player picks them on the board). */
  tapCreatures?: number;
  // Tarkir: Dragonstorm (19b, black): Sidisi, Regent of the Mire
  /**
   * With `sacrificeCreature`: "sacrifice a creature with mana value X ... target creature card with mana value X plus 1": the
   * first target's mana value is one more than the sacrificed creature's (the sacrifice and the target are offered as pairs).
   */
  sacrificeForTargetManaValue?: boolean;
  // Tarkir: Dragonstorm (19b, red): Reverberating Summons
  /** "Discard your hand" as a cost (a hand of no cards is fine). */
  discardHand?: boolean;
}

export type TriggerDef =
  | { on: 'etb' }
  // Reality Fracture (17c): Gideon the Oathless ('opponent': a creature an opponent controls enters)
  | { on: 'otherCreatureEtb'; controller: 'you' | 'any' | 'opponent'; filter?: CardFilter }
  | { on: 'dies' }
  | { on: 'otherCreatureDies'; controller: 'you' | 'opponent' | 'any'; nontoken?: boolean }
  /** Whenever this or another creature you control (matching the filter, as printed) dies. */
  | { on: 'creatureYouControlDies'; nontoken?: boolean; filter?: CardFilter }
  /** Whenever a creature you control deals combat damage (on your turn); "that creature", "that much". */
  | {
      on: 'creatureYouControlDealsCombatDamage';
      toPlayer?: boolean;
      // Lorwyn Eclipsed (18b, blue): Flitterwing Nuisance
      /** To a player or a planeswalker (not to a creature). */
      toPlayerOrPlaneswalker?: boolean;
      filter?: CardFilter;
      /** Any player's creature, not just yours (The Clone Saga's emblem: "a creature with the chosen name"). */
      anyController?: boolean;
    }
  | { on: 'beginningOfCombat'; whose: 'yours' | 'each' }
  | { on: 'youGainLife' }
  /** Whenever the creature this Aura is attached to dies. */
  | { on: 'attachedDies' }
  /** Whenever the creature this Equipment is attached to deals combat damage to a player. */
  | { on: 'equippedDealsCombatDamageToPlayer' }
  | {
      on: 'attacks';
      // Marvel Super Heroes: "attacks alone" (Luke Cage).
      alone?: boolean;
      // Marvel Super Heroes Jumpstart (Battalion)
      /** Battalion: "whenever this and at least two other creatures attack". */
      battalion?: boolean;
    }
  /** "Whenever you attack" (with one or more creatures matching the filter): once per combat. */
  | {
      on: 'youAttack';
      filter?: CardFilter;
      /** "Attack a player" (Crimson Cowl): ones attacking a planeswalker don't count. */
      aPlayer?: boolean;
    }
  | {
      on: 'combatDamageToPlayer';
      // Lorwyn Eclipsed (18b, special): Sygg, Wanderwine Wisdom's granted ability
      /** "to a player or planeswalker". */
      orPlaneswalker?: boolean;
    }
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
        // Marvel Super Heroes Jumpstart (Precise)
        /** A spell that targets a creature, anyone's (Hawkeye, Bowslinger). */
        | 'targetsCreature'
        /** Marvel Super Heroes: an instant or sorcery that targets an artifact or land (Fin Fang Foom). */
        | 'instantOrSorceryTargetingArtifactOrLand'
        // Strixhaven (13c): Reflective Golem
        /** A spell whose only target is this permanent. */
        | 'targetsOnlySelf'
        // Secrets of Strixhaven (14a): repartee
        | 'instantOrSorceryTargetingCreature'
        /** The caster's third spell this turn (Emeritus of Conflict). */
        | 'third'
        // Strixhaven Brawl (15b, w): Psemilla
        /** The caster's first enchantment spell this turn. */
        | 'firstEnchantment'
        // Strixhaven Brawl (15b, r): Arcane Bombardment
        /** The caster's first instant or sorcery spell this turn. */
        | 'firstInstantOrSorcery'
        /** The caster's second noncreature spell this turn (Sapphire Collector). */
        | 'secondNoncreature'
        // Strixhaven Brawl (15b, pair): Zimone, Infinite Analyst
        /** The caster's first spell with {X} in its mana cost this turn. */
        | 'firstXSpell'
        // Reality Fracture (17a): Danitha, Spear of Agony
        /** A spell that targets an opponent or a creature an opponent controls. */
        | 'targetsOpponentOrTheirCreature'
        // Reality Fracture (17a): Danitha, Sword of Hope
        /** An Equipment spell, or a spell that targets a creature you control. */
        | 'equipmentOrTargetsYourCreature'
        // Lorwyn Eclipsed (18b, red): Spinerock Tyrant
        /** An instant or sorcery spell with a single target (exactly one chosen target). */
        | 'instantOrSorceryOneTarget'
        // Tarkir: Dragonstorm (19a): Flurry
        /** The caster's second spell this turn ("Flurry — Whenever you cast your second spell each turn"). */
        | 'second';
      /** The spell must also match this (Gev: a Lizard spell). */
      spell?: CardFilter;
      /** Any player's spell, cast when it isn't their turn (Vision). */
      anyPlayerOffTurn?: boolean;
      /** Whose spells: yours (default), any player's (Medusa) or an opponent's (Mind's Dilation). */
      caster?: 'any' | 'opponent';
      /** Only spells cast from exile (Klaw). */
      fromExile?: boolean;
      // Marvel Super Heroes Jumpstart (Analyzed)
      /** Only spells cast using teamwork (Virtual Assistant). */
      usingTeamwork?: boolean;
      // Secrets of Strixhaven (14b): Quandrix, the Proof
      /** Only spells cast from your hand. */
      fromHand?: boolean;
      // Reality Fracture (17a): Codie, Ravenous Codex
      /** Only prepared spells (the copy of a prepare spell, cast while its creature is prepared). */
      prepared?: boolean;
      /** Runaways: spells cast from anywhere other than hand. */
      notFromHand?: boolean;
      // Final Fantasy (11c): spells you don't own
      /** Only spells the caster doesn't own (Vaan, Street Thief). */
      notOwned?: boolean;
      // Final Fantasy (11b): mana spent
      /** "If at least N mana was spent to cast it" (Sahagin, Ultros). */
      minManaSpent?: number;
      // Strixhaven (13a): magecraft
      /** Magecraft: also when you copy a matching spell (a copy is not cast, so it has no mana spent). */
      orCopy?: boolean;
      // Strixhaven Brawl (15b, w): Pearl-Ear, Imperial Advisor
      /** The spell must target an object (on the battlefield, under the source's controller) matching this filter. */
      targetFilter?: CardFilter;
    }
  /** Whenever a player (an opponent: Monologue Tax) casts their second spell each turn (Hearthborn Battler). */
  | {
      on: 'anyPlayerSecondSpell';
      opponentOnly?: boolean;
      // Marvel Super Heroes Jumpstart (Scarlet)
      /** Only your own second spell each turn (Wanda's Vision). */
      yoursOnly?: boolean;
    }
  /** At the beginning of your precombat or postcombat main phase. */
  | { on: 'beginningOfMain'; which: 1 | 2 }
  /** Whenever you (or, with 'opponents', an opponent: Black Widow) draw your second card each turn. */
  | { on: 'drawSecondCard'; whose?: 'opponents' | 'any' }
  // Marvel Super Heroes
  /** Whenever a creature you control is dealt damage ("that much": the event amount). */
  | { on: 'yourCreatureDealtDamage' }
  /** Equipment: whenever the equipped creature attacks (Captain America's Shield). */
  | {
      on: 'equippedAttacks';
      alone?: boolean;
      // Reality Fracture (17a fixes): Medic's Kitesail, Hunter's Axe
      /**
       * "...and has 'Whenever this creature attacks, ...'": an ability the equipped creature has: its controller
       * controls it (not the Equipment's), and it's gone while the creature has lost its abilities.
       */
      creatureAbility?: boolean;
    }
  /** Whenever a player or permanent becomes the target of an ability you control (Loki, God of Mischief). */
  | { on: 'youTargetWithAbility' }
  | { on: 'drawCard'; whose: 'yours' | 'opponents' }
  /** Whenever a source you control deals noncombat damage to an opponent ("that many"). */
  | { on: 'yourNoncombatDamageToOpponent' }
  /** Whenever this creature becomes blocked. */
  | { on: 'becomesBlocked' }
  /**
   * Never triggers by itself: a "when you do" reflexive trigger, set off by a 'reflexiveTrigger'
   * effect (Quantum Entanglement, Villainous Syndication, Rhino's Rampage).
   */
  | { on: 'reflexive' }
  /** Whenever this deals damage, combat or not, to an opponent (Thieving Otter). */
  | { on: 'dealsDamageToOpponent' }
  /** Whenever another nonland permanent you control is returned to its owner's hand (Justice, Vance Astrovik). */
  | { on: 'yourPermanentReturnedToHand' }
  /** Whenever a creature you control (matching the filter) attacks; "that creature" is the subject. */
  | {
      on: 'creatureYouControlAttacks';
      filter?: CardFilter;
      // Marvel Super Heroes: "attacks alone" (it is the only attacker).
      alone?: boolean;
      // Reality Fracture (17a): Yuriko, Blade of the Mighty
      /** It attacks a player (not a planeswalker). */
      aPlayer?: boolean;
    }
  | { on: 'landfall' }
  | {
      on: 'beginningOfUpkeep';
      whose:
        | 'yours'
        | 'each'
        | 'opponents'
        // Marvel Super Heroes Jumpstart (Geniuses)
        /** The upkeep of the enchanted creature's controller (Super Intelligence). */
        | 'enchantedController';
    }
  | { on: 'beginningOfEndStep'; whose: 'yours' | 'each' }
  /** Whenever another permanent you control matching the filter enters (Honored Dreyleader). */
  | { on: 'otherPermanentEtb'; filter: CardFilter }
  /** Whenever this creature or another creature you control matching the filter enters (Harvestrite Host). */
  | { on: 'selfOrCreatureEtb'; filter: CardFilter; castFromNonHand?: boolean }
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
  // Strixhaven Brawl (15a): Luminous Phantom
  /** Another creature you control leaves the battlefield (dying or not). */
  | { on: 'otherCreatureLeaves' }
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
      /** Only this creature (Exemplar of Light, Pensive Professor). */ self?: boolean;
    }
  /** At the beginning of your draw step. */
  // Reality Fracture (17c): The Theorist, Jace Beleren
  /** `whose: 'opponents'`: at the beginning of each opponent's draw step. */
  | { on: 'beginningOfDraw'; whose?: 'opponents' | 'each' } // Lorwyn Eclipsed (18b, black): 'each' (Mornsong Aria)
  /** Whenever a creature you control becomes the target of an opponent's spell or ability (Pawpatch Recruit). */
  | { on: 'yourCreatureTargetedByOpponent' }
  // Tarkir: Dragonstorm (19b, green): Surrak, Elusive Hunter
  /** Whenever a creature you control or a creature spell you control becomes the target of a spell or ability an opponent controls ("that creature" is the subject). */
  | { on: 'creatureOrSpellTargetedByOpponent' }
  /** When this Class becomes level N. */
  | { on: 'becomesLevel'; level: number }
  // Teamwork (Marvel Super Heroes)
  /** Whenever this becomes tapped to pay a teamwork cost (Agent Maria Hill). */
  | { on: 'tappedForTeamwork' }
  // Marvel Super Heroes Jumpstart (Animal).
  /** Whenever this permanent becomes tapped (Wakandan Tusker). */
  | { on: 'becomesTapped' }
  // Marvel Super Heroes Jumpstart (Young Avengers)
  /** Whenever the creature this Equipment is attached to becomes tapped ("it" is the subject): Hawkeye's Bow. */
  | { on: 'equippedBecomesTapped' }
  // Marvel Super Heroes Jumpstart (Tenacious/Rampaging)
  /** Whenever this creature blocks (Atlas, Sizable Stooge; Daemogoth Titan). */
  | { on: 'blocks' }
  // Reality Fracture (17a): Tetsuko Umezawa, Pursuer
  /** Whenever a creature an opponent controls (matching the filter) blocks; "that creature" is the subject. */
  | { on: 'opponentCreatureBlocks'; filter?: CardFilter }
  // Reality Fracture (17a): Master of Barbs, Massacre Girl, Most Wanted
  /** Whenever one or more opponents are dealt noncombat damage by any source (use with `batch`; "that much" adds up). */
  | { on: 'opponentDealtNoncombatDamage' }
  // Marvel Super Heroes Jumpstart (Marvelous)
  /** Whenever you activate a power-up ability (Marvel Boy, Noh-Varr). */
  | { on: 'youActivatePowerUp' }
  /** Whenever another creature is exiled from the battlefield; "that much" is its power (Captain Marvel, Shooting Star). */
  | { on: 'otherCreatureExiled' }
  /**
   * Whenever one or more creature cards are put into your graveyard from anywhere ("that many"
   * is the event amount; once per batch of events): Voracious Brood.
   */
  | { on: 'creatureCardsToYourGraveyard' }
  /** Whenever one or more creatures you control (matching the filter) deal combat damage to a player (Kastral). */
  | { on: 'creaturesYouControlDealCombatDamageToPlayer'; filter?: CardFilter }
  /** When you sacrifice this permanent (Carrot Cake). */
  | { on: 'sacrificed' }
  /** Whenever you sacrifice a permanent matching the filter (Camellia: a Food). */
  | { on: 'youSacrifice'; filter: CardFilter }
  // Doom Prevails (9e).
  /** Whenever you discard a card ("that card" is the subject); Doctor Doom: one or more lands, once per batch. */
  | { on: 'youDiscard'; filter?: CardFilter }
  // Reality Fracture (17a): Tinybones, Pocket Nuisance
  /** Whenever a player (any player) discards one or more cards; use with `batch`. */
  | { on: 'playerDiscards' }
  // Reality Fracture (17a): Titanbones, Towering Heart
  /** "When you discard this card": triggers from the graveyard (with `fromGraveyard`). */
  | { on: 'selfDiscarded' }
  /** Whenever a creature you control connives ("that creature" is the subject). */
  | { on: 'creatureYouControlConnives' }
  /** A Saga's chapter abilities (triggered as lore counters are added). */
  | { on: 'chapter'; chapters: number[] }
  // The Fantastic Four (9d).
  /** Whenever this becomes the target of a spell or ability an opponent controls (Black Bolt). */
  | { on: 'targetedByOpponent' }
  // Wakanda Forever (9c).
  /** Whenever the creature this Equipment is attached to attacks. */
  | {
      on: 'equippedAttacks';
      alone?: boolean;
      // Reality Fracture (17a fixes): Medic's Kitesail, Hunter's Axe
      /**
       * "...and has 'Whenever this creature attacks, ...'": an ability the equipped creature has: its controller
       * controls it (not the Equipment's), and it's gone while the creature has lost its abilities.
       */
      creatureAbility?: boolean;
    }
  /** Whenever a creature an opponent controls (matching the filter) attacks you ("that creature"): Storm. */
  // Reality Fracture (17c): Jace, Reality Sculptor ('orPlaneswalkers': or a planeswalker you control; emblems only)
  | { on: 'opponentCreatureAttacks'; filter?: CardFilter; orPlaneswalkers?: boolean }
  // Reality Fracture (17c): Garruk, Curse Breaker
  /** Whenever one or more creatures attack one of your opponents (a player, not a planeswalker); "those creatures" (`subjects`). Emblems only. */
  | { on: 'creaturesAttackYourOpponent' }
  /** Whenever an opponent attacks you with `min` or more creatures (Everett K. Ross). */
  | { on: 'opponentAttacks'; min: number }
  /** Whenever one or more creatures an opponent controls attack you and aren't blocked (Coveted Jewel). */
  | { on: 'opponentAttackersUnblocked' }
  /** "When you cast this spell": triggers from the stack (Ancestral Communion, Hatut Zeraze Strike Force). */
  | {
      on: 'castSelf';
      /** Strixhaven (13c): Plumb the Forbidden: only if creatures were sacrificed to cast it ("that many"). */
      perSacrificed?: boolean;
      // Tarkir: Dragonstorm (19b, red): Stormscale Scion
      /** Storm: "that many" is the number of spells cast this turn (by any player) before this one. */
      storm?: boolean;
    }
  // Avengers Assemble (9b).
  /** Whenever this creature is dealt damage ("that much"): Hercules. */
  | { on: 'dealtDamage' }
  /** Whenever a creature you control (matching the filter) becomes blocked; amount: its blockers (She-Hulk). */
  | { on: 'creatureYouControlBecomesBlocked'; filter?: CardFilter }
  /** Whenever a creature you control becomes tapped for the first time this turn, during your turn. */
  | { on: 'creatureYouControlFirstTappedOnYourTurn' }
  // Final Fantasy (11c): rare triggers
  /** Whenever you scry or surveil (Matoya, Archon Elder). */
  | { on: 'youScryOrSurveil' }
  /** Whenever you draw your third card each turn (Astrologian's Planisphere). */
  | { on: 'drawThirdCard' }
  /** Whenever this deals damage, combat or not ("that much"): Cecil, Dark Knight. */
  | { on: 'dealsDamage' }
  /** Whenever a player sacrifices another creature (Zodiark, Umbral God). */
  | { on: 'playerSacrificesCreature' }
  /** When the creature chosen for this (`chosenObject`) leaves the battlefield (Zenos yae Galvus). */
  | { on: 'chosenLeaves' }
  // Final Fantasy (11c): life loss and graveyard triggers
  /** Whenever an opponent loses life ("that many"), during your turn if `duringYourTurn` (Kefka, Ruler of Ruin). */
  | { on: 'opponentLosesLife'; duringYourTurn?: boolean }
  /** Whenever one or more cards leave your graveyard (Fang, Fearless l'Cie). */
  | { on: 'cardsLeaveYourGraveyard' }
  // Tarkir: Dragonstorm (19b, misc): Hollowmurk Siege, Stalwart Successor
  /** Whenever one or more counters (of any kind) are put on a creature you control; "that creature" is the subject. */
  | { on: 'counterPutOnYourCreature' }
  // Final Fantasy (11b): creatures and artifacts dying
  /**
   * Whenever this or another permanent you control matching the filter is put
   * into a graveyard from the battlefield ("a creature or artifact you control
   * dies"); `other`: only other permanents (Judge Magister Gabranth).
   */
  | { on: 'permanentYouControlDies'; filter: CardFilter; other?: boolean }
  // Strixhaven (13c): Flamescroll Celebrant
  /** Whenever an opponent activates an ability that isn't a mana ability. */
  | { on: 'opponentActivatesAbility' }
  // Reality Fracture (17c): Ajani Unrelenting, Way of the Mind Sculptor, Way of the Paradox, Gideon the Oathless
  /** Whenever you activate a loyalty ability; `removedAtLeast`: only if you removed that many loyalty counters to activate it. */
  | { on: 'youActivateLoyaltyAbility'; removedAtLeast?: number }
  /** Whenever an opponent activates a loyalty ability. */
  | { on: 'opponentActivatesLoyaltyAbility' }
  /** Whenever you put one or more loyalty counters on a planeswalker (a loyalty ability's + cost counts); "that many". */
  | { on: 'youPutLoyaltyCounters' }
  // Strixhaven (13c): Mila, Crafty Companion
  /** Whenever an opponent attacks one or more planeswalkers you control. */
  | { on: 'opponentAttacksPlaneswalker' }
  /** Whenever a permanent you control becomes the target of a spell or ability an opponent controls. */
  | { on: 'permanentTargetedByOpponent' }
  // Strixhaven (13c): Stonebinder's Familiar
  /** Whenever one or more cards are put into exile during your turn (use with `oncePerTurn`). */
  | { on: 'cardsExiledYourTurn' }
  // Strixhaven (13c): Valentin, Dean of the Vein
  /** Whenever a nontoken creature an opponent controls is exiled instead of dying. */
  | { on: 'opponentCreatureExiledInstead' }
  // Strixhaven (13c): Strixhaven Stadium
  /** Whenever a creature (any controller's) deals combat damage to you. */
  | { on: 'combatDamageToYou' }
  // Strixhaven Brawl (15b, b): Wicked Role
  /** When this token is put into a graveyard from the battlefield (it looks back from where it went). */
  | { on: 'tokenToGraveyard' }
  // Strixhaven Brawl (15b, multi): Mayhem Devil
  /** Whenever a player (any player) sacrifices a permanent. */
  | { on: 'playerSacrifices' }
  // Strixhaven Brawl (15b, w)
  /** When this permanent is put into a graveyard from the battlefield (afterlife; works for a non-creature). */
  | { on: 'selfToGraveyard' }
  /** Rooms: when you unlock this door (a Room's other door, unlocked later; casting a half is that half's own `etb`). */
  | { on: 'doorUnlocked'; door: 'front' | 'back' }
  /** Eerie: whenever you fully unlock a Room. */
  | { on: 'fullyUnlock' }
  // Strixhaven Brawl (15b, r): Magda, Brazen Outlaw
  /** Whenever a creature you control (matching the filter) becomes tapped. */
  | { on: 'creatureYouControlBecomesTapped'; filter?: CardFilter }
  // Final Fantasy Commander (12): triggers of the FIC Brawl decks.
  /** Whenever one or more other creatures you control enter from a graveyard (Celes). Use with `batch`. */
  | { on: 'creaturesEnterFromGraveyard' }
  /** Whenever this permanent becomes untapped (Key to the City). */
  | { on: 'becomesUntapped' }
  // Lorwyn Eclipsed (18a)
  /** "Whenever this creature enters or transforms into <this face>" (the seven two-faced legends' front faces). */
  | { on: 'etbOrTransforms' }
  /** "Whenever this creature transforms into <this face>" (the back faces). */
  | { on: 'transforms' }
  /** "When this creature leaves the battlefield" (to any zone; the Champions). */
  | { on: 'leavesBattlefield' }
  // Lorwyn Eclipsed (18b, multi-b): Doran, Besieged by Time
  /** Whenever a creature you control blocks (the creature is the subject). */
  | { on: 'creatureYouControlBlocks' }
  // Lorwyn Eclipsed (18b, black)
  /** Moonshadow: whenever one or more permanent cards (not tokens) are put into your graveyard from anywhere (use with `batch`). */
  | { on: 'permanentCardsToYourGraveyard' }
  /**
   * Twilight Diviner: whenever one or more other creatures you control enter, if they entered or were cast from a graveyard
   * (use with `batch` and `oncePerTurn`; the creatures that did are the `subjects`).
   */
  | { on: 'creaturesEnterFromOrCastFromGraveyard' }
  // Lorwyn Eclipsed (18c, theme decks): Magmatic Galleon
  /** Whenever one or more creatures your opponents control are dealt excess noncombat damage (use with `batch`; the amount is the excess). */
  | { on: 'opponentCreaturesDealtExcessNoncombat' };

export type ConditionDef =
  // The Hobbit (20a): Storied
  /** "As long as you have an enduring story" / "if you have an enduring story": the permanent's controller has the designation. */
  | { kind: 'enduringStory' }
  // Strixhaven Brawl (15b, g): Orochi Merge-Keeper
  /** The source is modified (has counters, or an Equipment or Aura you control attached). */
  | { kind: 'sourceModified' }
  /** The source has no +1/+1 counters on it (Adapt). */
  | { kind: 'sourceNoCounters' }
  // Reality Fracture (17a): Null Summoner, Uldaros Theorix
  /** The source permanent was cast (not put onto the battlefield some other way). */
  | { kind: 'wasCast' }
  | { kind: 'controlsPermanents'; filter: CardFilter; min: number }
  | { kind: 'attackedThisTurn' }
  // Reality Fracture (17c): Kiora of Salt and Sand
  /** You've activated a loyalty ability this turn. */
  | { kind: 'activatedLoyaltyAbilityThisTurn' }
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
  // Lorwyn Eclipsed (18b, special): Trystan, Callous Cultivator
  /** Your graveyard has at least `min` (default 1) cards matching the filter ("an Elf card in your graveyard"). */
  | { kind: 'graveyardHas'; filter: CardFilter; min?: number }
  /** It's your turn and this is the first time you gained life this turn. */
  | { kind: 'firstLifeGainThisTurn'; anyTurn?: boolean }
  /** A chosen target matches the filter (Hazardroot Herbalist: "if that creature is a token"). */
  | { kind: 'targetMatches'; target: number; filter: CardFilter }
  /** A count reaches `min` (Finneas: total power 10 or greater). */
  | { kind: 'amountAtLeast'; amount: Amount; min: number }
  /** This ability has resolved exactly `n` times this turn, counting this one (Harvestrite Host). */
  | {
      kind: 'resolvedThisTurn';
      n: number;
      /** `n` times or more (Iron Fist, Living Weapon: it has triggered this turn). */
      orMore?: boolean;
    }
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
  // Strixhaven (13c): Rowan, Scholar of Sparks
  /** You've drawn at least `min` cards this turn. */
  | { kind: 'cardsDrawnThisTurn'; min: number }
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
  // Secrets of Strixhaven (14a): Lluwen, Exchange Student
  /** The source isn't prepared. */
  | { kind: 'notPrepared' }
  /** At least one condition holds. */
  | { kind: 'any'; of: ConditionDef[] }
  // Strixhaven Brawl (15b, pair): Lakeside Shack, Hidden Stockpile
  /** A player (either) has this much life or less. */
  | { kind: 'anyPlayerLifeAtMost'; max: number }
  /** Revolt: a permanent left the battlefield under your control this turn. */
  | { kind: 'revolt' }
  /** The condition doesn't hold. */
  | { kind: 'not'; condition: ConditionDef }
  // Secrets of Strixhaven (14b)
  /** The source has at least `min` of this named counter (Comforting Counsel: growth). */
  | { kind: 'sourceNamedCounters'; name: string; min: number }
  /** The source has (or, if it left the battlefield, had) +1/+1 counters on it (Ambitious Augmenter). */
  | { kind: 'sourceHadCounters' }
  /** A counter was put on the source this turn (Fractal Tender). */
  | { kind: 'sourceCounteredThisTurn' }
  // Doom Prevails (9e).
  /** Cards exiled with the source are still in exile (Currency Converter). */
  | { kind: 'sourceHasExiled' }
  /** The source was kicked at least N times (multikicker: Batroc). */
  | { kind: 'kickedAtLeast'; n: number }
  // Reality Fracture (17a): Ruric Thar, Magecrusher
  /** The source has dealt combat damage since it entered the battlefield. */
  | { kind: 'sourceDealtCombatDamage' }
  // The Fantastic Four (9d).
  /** You've cast a noncreature spell this turn. */
  | { kind: 'castNoncreatureThisTurn' }
  // Strixhaven (13a): Mage Duel
  /** You've cast an instant or sorcery spell this turn. */
  | { kind: 'castInstantOrSorceryThisTurn' }
  // Secrets of Strixhaven (14a): increment
  /** The mana spent on the triggering spell is greater than the source's power or toughness (the lesser of the two). */
  | { kind: 'manaSpentExceedsLowestStat' }
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
  // Reality Fracture (17a): Command the Stage, Master of Barbs, Grim Repriser, Whiplash Wordsmith
  /** An opponent was dealt noncombat damage this turn. */
  | { kind: 'opponentDealtNoncombatDamageThisTurn' }
  /** An opponent was dealt noncombat damage during the turn before this one. */
  | { kind: 'opponentDealtNoncombatDamageLastTurn' }
  // Reality Fracture (17a): Koth, the Geomancer
  /** The creature, land or spell that caused the trigger matches the filter ("if that land is a Mountain"). */
  | { kind: 'subjectMatches'; filter: CardFilter }
  // Marvel Super Heroes
  /** The source entered the battlefield this turn. */
  | { kind: 'sourceEnteredThisTurn' }
  // Lorwyn Eclipsed (18b, multi-a)
  /** You attacked with at least `count` creatures matching the filter this turn (Deepway Navigator). */
  | { kind: 'attackedWithAtLeast'; filter: CardFilter; count: number }
  /** A creature other than the source entered the battlefield under your control this turn (Wary Farmer). */
  | { kind: 'otherCreatureEnteredThisTurn' }
  /** You control a basic land. */
  | { kind: 'controlsBasicLand' }
  /** The source has a counter of this kind (a shield counter). */
  | { kind: 'sourceHasCounter'; name: string }
  /** You attacked with a Hero this turn, or a Hero entered under your control (Avengers Assemble!). */
  | { kind: 'heroAttackedOrEnteredThisTurn' }
  // Secrets of Strixhaven (14b)
  /** A card left your graveyard this turn (Primary Research, Wilt in the Heat). */
  | { kind: 'cardsLeftGraveyardThisTurn' }
  /** One or more cards were put into exile this turn (Ennis, Debate Moderator). */
  | { kind: 'cardsExiledThisTurn' }
  // Reality Fracture (17a): Surveillance Phantasm, Desperate Futurescribe, Proctor of Potential
  /** You've scried or surveilled this turn. */
  | { kind: 'scriedOrSurveilledThisTurn' }
  // Reality Fracture (17a): Sphinx of False Conclusions
  /** The source isn't a token (an intervening "if it isn't a token"). */
  | { kind: 'sourceNotToken' }
  // Mystical Archive (16): Berserk (cast only before the combat damage step), Veil of Summer
  | { kind: 'beforeCombatDamage' }
  /** An opponent has cast a spell of one of these colours this turn. */
  | { kind: 'opponentCastColoredSpell'; colors: Color[] }
  /** At least `min` creatures died this turn (Emeritus of Woe). */
  | { kind: 'creaturesDiedAtLeast'; min: number }
  /** The source is a creature right now (Great Hall of the Biblioplex once animated). */
  | { kind: 'sourceIsCreature' }
  // Strixhaven Brawl (15a): Sevinne's Reclamation
  /** This spell was cast from a graveyard (flashback), also read as it resolves (The Hobbit (20a)). */
  | { kind: 'castFromGraveyard' }
  // Reality Fracture (17a): Twinned Vision
  /** This spell wasn't cast from its owner's hand (flashback, from exile, a copy). */
  | { kind: 'notCastFromHand' }
  /** Any player controls a permanent matching the filter (Knight of Malice: a white one). */
  | { kind: 'anyPlayerControls'; filter: CardFilter }
  | { kind: 'custom'; handler: string }
  // Final Fantasy (11c): rare conditions
  /** Your life total is at most half your starting life total (Cecil, Dark Knight). */
  | { kind: 'lifeAtMostHalfStarting' }
  // Caretakers: Doctor Strange, Surgeon.
  | { kind: 'lifeAboveStarting'; amount: number }
  /** This is the first combat phase of the turn (Genji Glove, Balthier and Fran). */
  | { kind: 'firstCombatPhase' }
  /** This is the first end step of the turn (Y'shtola Rhul). */
  | { kind: 'firstEndStep' }
  /** The source attacked this turn (The Lunar Whale). */
  | { kind: 'sourceAttackedThisTurn' }
  // Final Fantasy (11c): turn conditions
  /** You haven't cast a spell matching the filter this turn (Serah Farron: the first legendary creature spell). */
  | { kind: 'noneCastThisTurn'; filter: CardFilter }
  /** It's your turn, and one of your first `max` turns of the game (Starting Town). */
  | { kind: 'yourEarlyTurn'; max: number }
  /** The creature that caused the trigger was crewed by the source this turn (Balthier and Fran). */
  | { kind: 'subjectCrewedBySource' }
  // Marvel Super Heroes Jumpstart (Heroes for Hire)
  /** Target `target` was chosen and is still legal ("up to" targets: Iron Fist, Hero for Hire). */
  | { kind: 'targetChosen'; target: number }
  // Lorwyn Eclipsed (18a)
  /** The source was cast for its evoke cost ("if it was evoked"). */
  | { kind: 'wasEvoked' }
  /** The source has (or, if it left, had) at least `min` (default 1) counters of this kind: "if it had a -1/-1 counter on it". */
  | { kind: 'sourceHadNamedCounter'; name: string; min?: number }
  /** "If you put a counter on a creature this turn": you put counters of any kind on a creature. */
  | { kind: 'putCounterOnCreatureThisTurn' }
  /** "If {W}{W} was spent to cast it": at least these amounts of each colour were spent on the source spell (the best split of the payer's mana). */
  | { kind: 'manaSpentColors'; colors: Partial<Record<Color, number>> }
  // Lorwyn Eclipsed (18b, green)
  /**
   * A creature entered the battlefield under your control this turn (even if it has left since). `other`: not the source itself
   * (Bristlebane Outrider, Thoughtweft Charge).
   */
  | { kind: 'creatureEnteredThisTurn'; other?: boolean }
  // Lorwyn Eclipsed (18c, theme decks): Fearless Swashbuckler
  /** You attacked with a creature matching the filter in this combat (even if it has left since). */
  | { kind: 'attackedThisCombat'; filter: CardFilter }
  // Tarkir: Dragonstorm (19a): "if you've cast two or more spells this turn", "your second spell each turn"
  /**
   * The spells `who` (default: you) has cast this turn (matching the filter, by type and subtype; the spell being cast now is
   * already counted, so "if you've cast another spell this turn" read as the spell is cast is `min: 2`; for a cost reduction
   * read before it is cast, `min: 1`) number at least `min` and at most `max`. Focus the Mind: `min: 1`; Highspire Bell-Ringer
   * ("the second spell you cast each turn") `min: 1, max: 1`; Effortless Master `min: 2`.
   */
  | { kind: 'spellsCastThisTurn'; min?: number; max?: number; filter?: CardFilter; who?: 'you' | 'opponent' }
  // Tarkir: Dragonstorm (19b, clans-b): Karakyk Guardian, Sonic Shrieker
  /** The source has dealt damage (any damage, to anyone) since it came to the battlefield ("hexproof as long as it hasn't dealt damage yet" is `not` of this). */
  | { kind: 'sourceDealtDamage' }
  /** Resolution-time "if": the player chosen as this target was dealt damage by the source during this resolution ("if a player is dealt damage this way"). */
  | { kind: 'targetPlayerDamagedBySource'; target: number }
  // Tarkir: Dragonstorm (19b, black): The Sibsig Ceremony
  /** The creature that caused the trigger (the one that entered) was cast, not put onto the battlefield some other way ("if you cast it"). */
  | { kind: 'subjectWasCast' };

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
  // Secrets of Strixhaven (14a): Moseo, 'lifeGainedThisTurn' is the life its controller gained this turn.
  // Secrets of Strixhaven (14b): Sundering Archaic, 'colorsSpent' is the number of colours spent to cast the source.
  maxManaValue?: number | 'sourcePower' | 'lifeGainedThisTurn' | 'colorsSpent' | 'x';
  // Secrets of Strixhaven (14b): Arnyn, Deathbloom Botanist
  /** Power or toughness at most this (printed, for a card that has left the battlefield). */
  maxPowerOrToughness?: number;
  // Lorwyn Eclipsed (18b, red): Meek Attack
  /** Power plus toughness at most this ("total power and toughness 5 or less"; printed, for a card not on the battlefield). */
  maxPowerPlusToughness?: number;
  // Secrets of Strixhaven (14b): Mage Tower Referee
  /** Two or more colours. */
  multicolored?: boolean;
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
  // Reality Fracture (17a): Hexhaven Dueling Arena
  /** Attacked this turn ("target creature that attacked this turn"). */
  attackedThisTurn?: boolean;
  /** Toughness greater than its power (Fecund Greenshell). */
  toughnessGreaterThanPower?: boolean;
  // Marvel Super Heroes Jumpstart (Marvelous)
  /** Power greater than its base power (Ms. Marvel, Elastic Ally). */
  powerAboveBase?: boolean;
  /** Has the creature type chosen for the source (Patchwork Banner). */
  chosenTypeOfSource?: boolean;
  /** Has counters on it (Innkeeper's Talent). */
  hasCounters?: boolean;
  // Strixhaven (13b): monocolored
  /** Exactly one colour (Vanishing Verse). */
  monocolored?: boolean;
  /** +1/+1 counters were put on it this turn (Kid Loki). */
  countersPutThisTurn?: boolean;
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
  // Strixhaven Brawl (15b, b): Lord Skitter's Blessing
  /** Has an Aura attached ("an enchanted creature"). */
  enchanted?: boolean;
  /** Not the permanent the source is attached to (Secret Invasion: "other than enchanted creature"). */
  notAttachedHost?: boolean;
  /** Its mana value is odd or even (Thanos). */
  manaValueParity?: 'odd' | 'even';
  // Strixhaven Brawl (15b, pair)
  /** Enchanted by an Aura that the source's controller controls (Killian, Eriette). */
  enchantedByYourAura?: boolean;
  /** Its base (printed) power is 0 (Primo, the Unbounded). */
  basePowerZero?: boolean;
  // Marvel Super Heroes Jumpstart (HYDRA)
  /** "Creature that's attacking alone": the only attacking creature (Viper, Cruel Conspirator). */
  attackingAlone?: boolean;
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
  // Lorwyn Eclipsed (18c, theme decks): Subterranean Schooner
  /** One of the creatures that crewed the source this turn ("target creature that crewed it this turn"). */
  crewedSource?: boolean;
  // Strixhaven (13c): Silverquill Silencer, Plargg
  /** Has the card name chosen for the source. */
  chosenNameOfSource?: boolean;
  /** Not legendary. */
  nonlegendary?: boolean;
  // Secrets of Strixhaven (14b): Matterbending Mage
  /** Its mana cost has {X} in it. */
  hasX?: boolean;
  // Secrets of Strixhaven (14b): Rocket Volley
  /** Not a basic land. */
  nonbasic?: boolean;
  /** Shares a creature type with its controller's commander (Folk Hero). */
  sharesTypeWithCommander?: boolean;
  // Secrets of Strixhaven (14b): Nita, Forum Conciliator
  /** Its controller doesn't own it. */
  notOwnedByController?: boolean;
  // The Hobbit (20b white): The Eagles Are Coming!
  /** Its owner is the controller of the source ("target creature you own"; the source is the spell). */
  ownedBySourceController?: boolean;
  // Strixhaven Brawl (15b, w)
  /** Attached to a creature on the battlefield (Sage's Reverie: "each Aura you control that's attached to a creature"). */
  attachedToCreature?: boolean;
  /** The permanent the source is attached to (a Role or bestowed Aura triggering on "enchanted creature attacks"). */
  hostOfSource?: boolean;
  /** Power less than the source's (mentor); for an Aura source, less than the power of the creature it enchants. */
  lesserPowerThanSource?: boolean;
  // Strixhaven Brawl (15b, u): Wash Away
  /** A spell on the stack that wasn't cast from its owner's hand. */
  notCastFromHand?: boolean;
  // Mystical Archive (16): Doom Blade
  /** Has none of these colours (a "nonblack" creature). */
  notColors?: Color[];
  // Final Fantasy (11c): rare filters
  /** Has none of these subtypes ("isn't a Kraken, Leviathan, ...": Summon: Leviathan). */
  notSubtypes?: string[];
  // Final Fantasy (11c): nonlegendary
  /** Has none of these supertypes (Ragnarok: a nonlegendary permanent card). */
  notSupertypes?: Supertype[];
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
  // Tarkir: Dragonstorm (19a): Rot-Curse Rakshasa
  /**
   * An activated ability's last target spec: "X target creatures", X the value paid for {X} in its cost (at least 1). The
   * targets are picked one at a time once the ability is on the stack (the `abilityTargets` decision), each a different one.
   * Effects reach them as `{ targetsFrom: n }`.
   */
  xTargets?: boolean;
  // Lorwyn Eclipsed (18b, multi-a): the Commands
  /** In a combined "choose two" spell: which chosen mode this target belongs to. Targets of different modes may be the same object. */
  ofMode?: number;
  // Marvel Super Heroes Jumpstart (Blink)
  /**
   * "Any number of target ...": the last spec of a triggered ability only. Its
   * targets (none or more, all different) are picked one at a time (the
   * decision's `picked`), not enumerated as subsets. See `{ targetsFrom }`.
   */
  anyNumber?: boolean;
  // Reality Fracture (17a): Seasoned Cryomancer
  /** With `anyNumber`: no more targets than the amount the trigger carries ("up to that many target creatures"). */
  maxFromAmount?: boolean;
  // Lorwyn Eclipsed (18b, special): Rooftop Percher
  /** With `anyNumber`: no more than this many targets ("up to two target cards from graveyards"), picked one at a time. */
  maxTargets?: number;
  // Final Fantasy (11c): targeting abilities
  /**
   * With 'spell': activated and triggered abilities on the stack are targets
   * too (Louisoix's Sacrifice); `abilitiesOnly` leaves spells out (Gogo).
   */
  abilities?: boolean;
  abilitiesOnly?: boolean;
  // Marvel Super Heroes Jumpstart (Analyzed)
  /** With `abilitiesOnly`: only abilities from a creature source (Echo, Perceptive Prodigy). */
  creatureSource?: boolean;
  // Reality Fracture (17a): Uldaros Theorix
  /**
   * With `anyNumber`: "one target card of each card type": the targets picked must be able to stand for
   * different card types (each card taking one of its own types, no type twice).
   */
  onePerType?: boolean;
  // Reality Fracture (17c): Fatehold Charm
  /** With 'spell': a creature on the battlefield is a legal target too ("target spell or creature"). */
  orCreature?: boolean;
  // Tarkir: Dragonstorm (19b, clans): Jeskai Revelation
  /** With 'spell': any permanent on the battlefield is a legal target too ("target spell or permanent"). */
  orPermanent?: boolean;
  // Lorwyn Eclipsed (18b, multi-b): Kirol, Attentive First-Year
  /** With `abilitiesOnly`: triggered abilities only ("target triggered ability"). */
  triggeredOnly?: boolean;
  /**
   * In a "choose two" spell: the index of the first target of the mode this target belongs to. The targets before it belong to
   * another mode and may be the same object or player (rule 115.3); only the ones from this index on must differ.
   */
  modeStart?: number;
  // Lorwyn Eclipsed (18b, green): Prismabasher
  /** With `anyNumber`: no more targets than this amount as the targets are chosen ("up to X target creatures", X = vivid). */
  maxAmount?: Amount;
  // Lorwyn Eclipsed (18b, black): Unbury
  /**
   * "Two target creature cards that share a creature type": this target must share a creature type with the target
   * chosen just before it (each pair is listed once, the second target always the later card).
   */
  sharesCreatureTypeWithPrevious?: boolean;
  // Tarkir: Dragonstorm (19b, white, black): Arashin Sunshield, Feral Deathgorger
  /** With `anyNumber` and 'graveyardCard': all the targets are cards in the same graveyard ("up to two target cards from a single graveyard"). */
  singleGraveyard?: boolean;
  // Tarkir: Dragonstorm (19b, green): Rite of Renewal
  /**
   * With `anyNumber` on a spell: a card in the graveyard of the player chosen as target `n` ("up to four target cards from their
   * graveyard"). A spell's `maxTargets` is kept to as the targets are picked one at a time.
   */
  inGraveyardOfTarget?: number;
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
  | {
      each: 'permanent';
      controller?: 'you' | 'opponent';
      filter?: CardFilter;
      // Reality Fracture (17a): Face Yourself
      /** Only those the player chosen as target `controllerTarget` controls. */
      controllerTarget?: number;
      exceptChosen?: boolean;
    }
  /** The object that caused the trigger ("that creature"). */
  | 'subject'
  | {
      each: 'creature';
      controller?: 'you' | 'opponent';
      filter?: CardFilter;
      // Reality Fracture (17a): Twisted Fates
      /** Only creatures controlled by the player chosen as this target ("each creature target player controls"). */
      targetPlayer?: number;
      // Reality Fracture (17a): Face Yourself ("each creature target player controls")
      controllerTarget?: number;
      // Reality Fracture (17a): Command the Stage ("each other Wizard token": not the token just created)
      exceptChosen?: boolean;
    }
  /** The controller of a chosen target (Blooming Blast: "that creature's controller"). */
  | { controllerOf: number }
  // Reality Fracture (17a): Clash of Elements
  /** The owner of a chosen target ("its owner"), even once it has left the battlefield. */
  | { ownerOf: number }
  // Marvel Super Heroes Jumpstart (Geniuses)
  /** The controller of the permanent the source is attached to (Super Intelligence: "that player"). */
  | 'attachedController'
  /** The permanent chosen by a 'chooseYourPermanent' effect. */
  | 'chosen'
  // Marvel Super Heroes Jumpstart (Blink)
  /** Every target from this index on (an `anyNumber` spec's targets). */
  | { targetsFrom: number }
  /** Vulture, Feathered Fiend: "each of those creatures" (every one that set off a batched trigger). */
  | 'subjects';

export type Amount =
  | number
  | { powerOf: Ref }
  // Tarkir: Dragonstorm (19b, clans): Lie in Wait
  /** The power of the card a target slot named, in whatever zone it is now (its printed power off the battlefield): "that card's power". */
  | { powerOfCard: Ref }
  /** The number of +1/+1 counters on it (Mossborn Hydra doubles them). */
  | { countersOn: Ref }
  // Tarkir: Dragonstorm (19a): Warden of the Grove
  /** The number of counters of every kind on it ("the number of counters on this creature"). */
  | { allCountersOn: Ref }
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
  // Reality Fracture (17a): Dark Matter Manipulator, Recursive Recruitment
  /** The amount divided by `floorDiv`, rounded down ("for every seven cards in your graveyard"). */
  | { floorDiv: number; amount: Amount }
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
  // Strixhaven (13b): Flunk
  /** `size` minus the cards in the hand of the controller of the Ref'd object (at least 0). */
  | { handGapOfControllerOf: Ref; size: number }
  /** The greatest mana value among your permanents matching the filter (Armor Wars: artifacts). */
  | { greatestManaValueYouControl: CardFilter }
  // Marvel Super Heroes: "costs {2} less if ..." (Punishing Punch).
  | { if: ConditionDef; then: number; else?: number }
  /** Cards in your graveyard (of these types). */
  | {
      count: 'cardsInGraveyard';
      types?: CardType[];
      named?: CardDefId;
      plus?: number;
      // Final Fantasy (11b): "each Artificer card in your graveyard" (Cid); "noncreature, nonland" (Esper Ramuh).
      subtype?: string;
      notTypes?: CardType[];
    }
  /** The amount from the trigger event ("that much damage"). */
  | { event: 'amount' }
  // Reality Fracture (17a fixes): Rise of the Deathbringer
  /** The number of cards the latest draw effect of this resolution actually drew. */
  | { drawnThisWay: true }
  // Reality Fracture (17c): Overwrite the Multiverse
  /** The number of permanents the latest `exile` effect of this resolution actually exiled. */
  | { exiledThisWay: true }
  // Lorwyn Eclipsed (18b, blue): Wanderwine Farewell, Glen Elendra's Answer
  /** How many things the latest `bounce` returned to hand, or `eclCounterAllOpponents` countered, in this resolution. */
  | { affectedThisWay: true }
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
  // Lorwyn Eclipsed (18b, white): Kinbinding
  /** The creatures that entered the battlefield under your control this turn (even ones that have left). */
  | { count: 'creaturesEnteredThisTurn' }
  /** Strixhaven Brawl (15b, multi): +1/+1 counters you put on creatures you control this turn (Iridescent Hornbeetle). */
  | { count: 'countersPutThisTurn' }
  /** The greatest power among creatures you control (Season of Gathering). */
  | {
      count: 'greatestPowerYouControl';
      // Lorwyn Eclipsed (18b, green): Pummeler for Hire ("the greatest power among Giants you control")
      subtype?: string;
    }
  // Reality Fracture (17a): Ghalta the Immovable
  /** The greatest toughness among creatures you control. */
  | { count: 'greatestToughnessYouControl' }
  // Tarkir: Dragonstorm (19a): Narset, Jeskai Waymaster
  /** The spells you've cast this turn (matching the filter, by type and subtype). */
  | { count: 'spellsCastThisTurn'; filter?: CardFilter }
  /** Creature cards you own in exile and in your graveyard (Huskburster Swarm). */
  | { count: 'creatureCardsInExileAndGraveyard' }
  // Strixhaven (13c): Show of Confidence
  /** Instant and sorcery spells you've cast this turn, not counting the spell that triggered this. */
  | { count: 'otherInstantsSorceriesCastThisTurn' }
  // Strixhaven (13a): Serpentine Curve
  /** Instant and sorcery cards you own in exile and in your graveyard. */
  | { count: 'instantsSorceriesInExileAndGraveyard' }
  /** Creatures you control of the type chosen for the source (Three Tree City). */
  | { count: 'creaturesOfChosenType'; other?: boolean }
  /** Named counters on the source (as it last was, if it left): Hoarder's Overflow's stash counters. */
  | { namedCountersOnSource: string }
  // Secrets of Strixhaven (14b): Prismari, the Inspiration (storm)
  /** Spells cast this turn (by anyone) before the triggering spell. */
  | { count: 'spellsCastBeforeSubject' }
  /** The value chosen for X (times `times`, plus `plus`). */
  | { x: true; times?: number; plus?: number }
  // Doom Prevails (9e).
  // Reality Fracture (17a): Cruel Calculations
  /** Cards put into the graveyard of the player the Ref names (a chosen target) from their library this turn. */
  | { milledThisTurn: Ref }
  /** Cards you've discarded this turn (Living Laser). */
  | { count: 'cardsDiscardedThisTurn' }
  /** Permanents an opponent controls matching the filter (Killmonger: artifacts). */
  | { count: 'permanentsOpponentsControl'; filter: CardFilter }
  /** Cards in your hand (Kang Dynasty). */
  | { count: 'cardsInHand' }
  // Marvel Super Heroes Jumpstart (Lethal)
  /** Creature cards in the opponent's graveyard (Origin of Black Widow). */
  | { count: 'opponentCreatureCardsInGraveyard' }
  // The Fantastic Four (9d).
  /** Colours among permanents you control and spells you've cast this turn (First Family). */
  | { count: 'colorsAmongPermanentsAndSpells' }
  // Lorwyn Eclipsed (18a): Vivid
  /** Vivid: the number of colours among permanents you control. */
  | { count: 'vivid' }
  /** The colours of the spell that caused the trigger (Crystal). */
  | { count: 'subjectColors' }
  /** Cards in an opponent's hand (Recurring Insight). */
  | { count: 'opponentHandSize' }
  // Marvel Super Heroes Jumpstart (Masters of Evil)
  /** Half the opponent's life total, rounded up (Radioactive Man). */
  | { count: 'opponentLifeHalf' }
  /** Greatest mana value among noncreature permanents you control and noncreature cards in your graveyard (Dragon Man). */
  | { count: 'greatestNoncreatureManaValue' }
  // Reality Fracture (17a): Karn, Gilded Guardian
  /** Colours among other artifacts you control (the source excluded). */
  | { count: 'colorsAmongOtherArtifactsYouControl' }
  // Reality Fracture (17a): Tam, the Possibility
  /** Different planeswalker types among planeswalkers you control. */
  | { count: 'planeswalkerTypesYouControl' }
  // Reality Fracture (17c): Jace, Reality Sculptor; Compel Brutality
  /** The loyalty counters among planeswalkers you control matching the filter ("among Jaces you control": `{ subtype: 'Jace' }`). */
  | { count: 'loyaltyAmongPlaneswalkers'; filter?: CardFilter }
  /** The loyalty counters on a planeswalker ("equal to its loyalty"). */
  | { loyaltyOf: Ref }
  // Wakanda Forever (9c).
  /** Creatures on the battlefield (Vanquish the Horde). */
  | { count: 'creaturesOnBattlefield' }
  // Tarkir: Dragonstorm (19b, white): Static Snare ("costs {1} less to cast for each attacking creature")
  /** The attacking creatures, whoever controls them. */
  | { count: 'attackingCreatures' }
  /** Total mana value of permanents you control matching the filter (Metalwork Colossus). */
  | { count: 'totalManaValue'; filter: CardFilter }
  /** Times you've cast your commander from the command zone (Hatut Zeraze Strike Force). */
  | { count: 'commanderCasts' }
  // Final Fantasy (11a)
  /** The amounts added up (Slash of Light: creatures plus Equipment you control). */
  | { sum: Amount[] }
  // Final Fantasy (11c): rare amounts
  /** Your life total (Aettir and Priwen). */
  | { count: 'lifeTotal' }
  // Final Fantasy (11c): devotion and life gained
  /** Devotion: the mana symbols of this colour in the mana costs of permanents you control (Clive). */
  | { count: 'devotion'; color: Color }
  /** The life you gained this turn (Hope Estheim). */
  | { count: 'lifeGainedThisTurn' }
  // Final Fantasy (11b): mana spent
  /** The mana spent to cast the triggering spell (Shantotto). */
  | { manaSpentOnSubject: true }
  // Secrets of Strixhaven (14b): Molten Note
  /** The mana spent to cast the source spell. */
  | { manaSpentOnSource: true }
  // Secrets of Strixhaven (14a): converge
  /** The number of colors of mana spent to cast the source spell, or the triggering spell. */
  | { colorsSpent: 'source' | 'subject' }
  // Strixhaven (13c)
  /** Cards in your library (Body of Research). */
  | { count: 'cardsInLibrary' }
  /** Different powers among creatures you control (Golden Ratio). */
  | { count: 'differentPowersYouControl' }
  // Reality Fracture (17a): Fblthp, Knows the Way
  /** Domain: the basic land types among lands you control. */
  | { count: 'basicLandTypesYouControl' }
  // Reality Fracture (17a): Tarmogoyf
  /** The card types among cards in all graveyards. */
  | { count: 'cardTypesInGraveyards' }
  /** Different mana values among nonland cards you own in exile with study counters (Kianne). */
  | { count: 'differentStudyManaValues' }
  /** Half the mana value of the Ref'd card, rounded up (Torrent Sculptor). */
  | { halfManaValueUpOf: Ref }
  // Secrets of Strixhaven (14b)
  /** Total toughness of the creatures you control (Orysa, Tide Choreographer). */
  | { count: 'totalToughnessOfCreaturesYouControl' }
  /** Cards you've drawn this turn (Fractal Anomaly). */
  | { count: 'cardsDrawnThisTurn' }
  /** The value of X of the spell that caused the trigger (Geometer's Arthropod). */
  | { xOfSubject: true }
  /** Lands with different names you control (Emil, Vastlands Roamer). */
  | { count: 'differentlyNamedLands' }
  // Strixhaven Brawl (15b, r)
  /** Instant and sorcery cards in your graveyard plus cards with flashback you own in exile (Seize the Storm). */
  | { count: 'instantsSorceriesInGraveyardPlusFlashbackInExile' }
  /** The greatest mana value among instant and sorcery spells you've cast this turn (Rootha). */
  | { count: 'greatestInstantSorceryCastThisTurn' }
  // Tarkir: Dragonstorm (19b, black): Hundred-Battle Veteran
  /** The different kinds of counters among the creatures you control ("three or more different kinds of counters among creatures you control"). */
  | { count: 'counterKindsAmongYourCreatures' };

export type EffectDef =
  | { kind: 'may'; effects: EffectDef[]; cost?: ManaCost; oncePerTurn?: string }
  // Iron Man: resolution-time use, consumed only when the optional action is taken.
  | { kind: 'noteOptionalUse'; key: string }
  /** `exceptFrom`: not to the creature dealing it (Nova Flame: "each other creature"). */
  | {
      kind: 'damage';
      amount: Amount;
      to: Ref;
      from?: Ref;
      exceptFrom?: boolean;
      /** Create one of these tokens per point of excess damage dealt to a creature (Goblin Negotiation). */
      excessTokens?: CardDefId;
      // Reality Fracture (17c): Violent Echoes
      /** If excess damage was dealt to a creature or planeswalker this way, these effects follow; `{ event: 'amount' }` is the excess. */
      ifExcess?: EffectDef[];
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
      // Marvel Super Heroes Jumpstart (Great Lakes Avengers)
      /** Can't be blocked by creatures matching this filter this turn (Doorman). */
      cantBeBlockedBy?: CardFilter;
      /** Switch its power and toughness until end of turn (Flatman). */
      switchPT?: boolean;
      /** "Whenever it deals combat damage to a player this turn, put a +1/+1 counter on it" (Love on the Battlefield). */
      counterOnCombatDamage?: boolean;
      // Strixhaven (13b): Prismari Pledgemage
      /** "Can attack this turn as though it didn't have defender." */
      ignoreDefender?: boolean;
      // Strixhaven (13c): Square Up, Tanazir Quandrix
      /** `power` and `toughness` are the base power and toughness rather than a bonus. */
      setBase?: boolean;
      /** "When this creature deals combat damage, sacrifice it" (Dropkick Bomber). */
      sacrificeOnCombatDamage?: boolean;
      /** Base power and toughness until end of turn (Reptil, I Am Iron Man). */
      basePT?: [number, number];
      /** It becomes an artifact creature until end of turn (I Am Iron Man). */
      becomesCreature?: boolean;
      // Lorwyn Eclipsed (18b, green): the Mutavault token
      /** With `becomesCreature`: a creature only, not an artifact too ("It's still a land"). */
      creatureOnly?: boolean;
      /** Temporary creature subtype (Iron Suitcase). */
      creatureSubtype?: string;
      /** Prevent all combat damage that would be dealt to it this turn (Fleeting Flight). */
      preventCombatDamage?: boolean;
      // Final Fantasy (11c): leftovers
      /** It must be blocked this turn if able (Magitek Scythe). */
      mustBeBlocked?: boolean;
      // Lorwyn Eclipsed (18c, theme decks): Captain Howler, Sea Scourge
      /** "Whenever it deals combat damage to a player this turn, you draw a card." */
      drawOnCombatDamage?: boolean;
    }
  // Strixhaven (13b): Maelstrom Muse
  /** The next instant or sorcery spell you cast this turn costs {amount} less (X is read now). */
  | { kind: 'nextSpellCostsLess'; amount: Amount }
  /** Resolution-time "if": Morbid-style choices between two effects. */
  | { kind: 'if'; condition: ConditionDef; then: EffectDef[]; else?: EffectDef[] }
  /** The source card returns from its owner's graveyard. */
  | {
      kind: 'returnSource';
      // Strixhaven (13b): Bookwurm, "put this card from your graveyard into your library third from the top".
      to: 'hand' | 'battlefield' | 'libraryThird';
      tapped?: boolean;
      /** "Tapped and attacking" (Persistent Marshstalker). */
      attacking?: boolean;
      counters?: number;
      addSubtype?: string;
      // Marvel Super Heroes: 'with a finality counter on him' (Winter Soldier).
      named?: string;
      // Final Fantasy (11b): returned transformed (Garland, Knight of Cornelia).
      transformed?: boolean;
      /** "She loses all abilities and gains haste" (Hellcat, Undying Vigilante): for as long as she stays. */
      losesAbilitiesGains?: Keyword[];
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
  | {
      kind: 'punisher';
      life: number;
      /** Strixhaven (13c): Professor Onyx: only a discard avoids it ("may discard a card, if they don't lose 3 life"). */
      discardOnly?: boolean;
      // Jump In slots (Polygraph Orb)
      /** "Unless they discard a card or sacrifice a creature": only creatures may be sacrificed. */
      sacrificeCreature?: boolean;
    }
  /** Exile the top N cards; choose one you may play until the end of your next turn (or of this turn). */
  | { kind: 'exileTopChooseOne'; count: Amount; until?: 'endOfTurn' }
  /**
   * Look at an opponent's hand and choose a card matching the filter; they
   * discard it (Thought-Stalker Warlock) or it's exiled.
   */
  | {
      kind: 'chooseFromOpponentHand';
      filter?: CardFilter;
      then: 'discard' | 'exile';
      // Tarkir: Dragonstorm (19b, clans): Severance Priest
      /** Remember the exiled card's owner and mana value on the source (`linkedExile`) for "the exiled card's owner creates ...". */
      linkToSource?: boolean;
      /** "You may choose a card": choosing none is allowed too. */
      optional?: boolean;
      /** You may cast the exiled card while it stays exiled, with any mana (Cruelclaw's Heist). */
      castable?: boolean;
      // Reality Fracture (17a): Null Summoner
      /** With `castable`: only while this holds for you (threshold). */
      castableIf?: ConditionDef;
      /** They reveal this many cards (picked for them: the cheapest), and you choose among those (Klaw). */
      reveal?: Amount;
      // Lorwyn Eclipsed (18b, black): Taster of Wares
      /** Choose only among these cards (the ones the opponent revealed), if they're still in their hand. */
      among?: ObjectId[];
      /** With `castable`: only for as long as you control the source (the exiled card is castable with any mana type). */
      castableWhileControlling?: boolean;
      /** With `castable`: only a card matching this is castable (an instant or sorcery card). */
      castableFilter?: CardFilter;
      // Lorwyn Eclipsed (18c, theme decks): Lightstall Inquisitor
      /** The opponent chooses the card from their own hand, and may play it for as long as it stays exiled. */
      ownerChooses?: {
        /** Each spell cast this way costs this much more. */
        tax: number;
        /** Each land played this way enters tapped. */
        landsTapped: boolean;
      };
    }
  /** A player chooses one of these (the owner of target `ownerOf`, or the controller). */
  | {
      kind: 'choose';
      ownerOf?: number;
      /** An opponent chooses (Bandit's Talent). */
      opponent?: boolean;
      /** The heading of the prompt, after the card's name (The Hobbit (20a), amass: "Amass Goblins 2: choose an Army"). */
      title?: string;
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
      from?: 'hand' | 'exiledWithSource' | 'lastExiledWithSource' | 'exileWithCounter';
      // Lorwyn Eclipsed (18b, red): Goliath Daydreamer
      /** With `from: 'exileWithCounter'`: cards you own in exile with a counter of this name on them. */
      counter?: string;
      filter?: CardFilter;
      // Final Fantasy (11c): "with mana value less than or equal to that damage" (Buster Sword).
      maxManaValue?: Amount;
    }
  /** Portent of Calamity: reveal the top X and exile one card of each type; four or more lets you cast one free. */
  | { kind: 'portent' }
  /** The Infamous Cruelclaw: exile until a nonland card; you may cast it by discarding a card instead. */
  | { kind: 'exileUntilNonlandCastByDiscard'; withoutDiscard?: boolean }
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
  | {
      kind: 'sacrificeSeveral';
      count: number;
      filter: CardFilter;
      then: EffectDef[];
      // Strixhaven (13b): Daemogoth Titan: the source itself may be sacrificed.
      includeSource?: boolean;
    }
  /** Copy a spell on the stack (`count` times): a target spell, or the spell that triggered this. */
  /** `retarget`: each copy gets another legal target if there is one (Ancestral Communion). */
  | {
      kind: 'copySpell';
      what: Ref;
      count?: Amount;
      retarget?: boolean;
      /** The copy isn't legendary (Double Major). */
      nonlegendary?: boolean;
      // Secrets of Strixhaven (14b): Choreographed Sparks
      /** A creature spell's copy gains haste and is sacrificed at the beginning of the end step. */
      hasteSacrifice?: boolean;
      // Marvel Super Heroes Jumpstart (Tricksters)
      /** "You may choose new targets for the copy" (Loki Laufeyson): its controller chooses. */
      newTargets?: boolean;
      // Lorwyn Eclipsed (18a): Spinerock Tyrant
      /** "Those spells gain wither": the original and the copy. */
      withWither?: boolean;
    }
  /** Each player sacrifices a creature of their choice (Season of Loss). */
  | { kind: 'eachPlayerSacrifices' }
  /**
   * Until the end of your next turn, you have this triggered ability (Season of
   * the Bold); 'nextSpellThisTurn': once, this turn (Galvanic Iteration).
   */
  | {
      kind: 'emblem';
      ability: AbilityDef;
      // Final Fantasy (11c): 'endOfTurn' (Summon: Leviathan's attack draws).
      // Reality Fracture (17c): 'yourNextTurn' ("until your next turn": gone as it begins; Jace, Reality Sculptor)
      until: 'endOfYourNextTurn' | 'permanent' | 'nextSpellThisTurn' | 'endOfTurn' | 'yourNextTurn';
      // Reality Fracture (17c): Chandra, Torch of Defiance
      /** The emblem is its own colorless source (it isn't the card that made it, which may be red). */
      colorless?: boolean;
      /** Its rules text, shown on the board ("Creatures you control get +2/+2."). */
      label?: string;
      // Tarkir: Dragonstorm (19b, clans-b): All-Out Assault ("when you next attack this turn")
      /** It goes away once it has triggered (with `until: 'endOfTurn'`; 'youAttack' triggers). */
      once?: boolean;
      // Marvel Super Heroes Jumpstart (Tricksters)
      /** Its trigger's filter only matches cards with this object's name (The Clone Saga). */
      namedLike?: Ref;
      /** Its trigger's filter only matches cards with this name, chosen as it resolves (The Clone Saga). */
      named?: CardDefId;
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
      // Secrets of Strixhaven (14b): Echocasting Symposium
      /** The token is created under the control of this player target. */
      underTarget?: number;
      // Secrets of Strixhaven (14b): Applied Geometry
      /** It's a 0/0 Fractal creature in addition to its other types, with this many +1/+1 counters. */
      asFractal?: number;
      // Final Fantasy (11c): temporary token copies
      /** Sacrifice the copies at the beginning of the next end step, your next end step, or the next upkeep. */
      sacrificeAt?: 'nextEndStep' | 'yourNextEndStep' | 'nextUpkeep';
      /** "If it's a Saga, put up to N lore counters on it" (Esper Terra). */
      lore?: number;
      /** "Its equip abilities cost {N} less to activate" (Firion). */
      equipDiscount?: number;
      // Reality Fracture (17a): Face Yourself
      /** "Except it has this ability": it keeps it for as long as it's on the battlefield. */
      grantAbilities?: AbilityDef[];
    }
  /** Choose a color (or a creature type) for the source, as it enters. */
  | {
      kind: 'chooseColor';
      /** Thriving lands: "choose a color other than" this one. */
      except?: Color;
    }
  | {
      kind: 'chooseCreatureType';
      // Lorwyn Eclipsed (18b, special): Dawn-Blessed Pennant, Eclipsed Realms ("choose Elemental, Elf, ... or Treefolk")
      /** Only these types may be chosen. */
      from?: string[];
    }
  // Strixhaven (13a): Learn
  /** Learn: reveal a Lesson from your sideboard and put it into your hand, or discard a card to draw a card, or neither. */
  | { kind: 'learn' }
  // Strixhaven (13c)
  /** Ardent Dustspeaker: you may put a card matching the filter from your graveyard on the bottom of your library; if you do, `then`. */
  | { kind: 'graveyardCardToLibraryBottom'; filter: CardFilter; then: EffectDef[] }
  /** Illuminate History, Fervent Mastery: discard any number of cards, then draw that many. */
  | {
      kind: 'discardAnyThenDraw';
      who: 'controller' | 'eachOpponent';
      /** Secrets of Strixhaven (14b): Colossus of the Blood Age, "that many cards plus one". */
      plus?: number;
      // Strixhaven Brawl (15a): Tersa Lightshatter, "up to two"
      max?: number;
    }
  /** Explore the Vastlands: that player looks at the top five, may take a land and/or an instant or sorcery; the rest go to the bottom at random. */
  | { kind: 'lookTakeLandAndSpell'; who: 'controller' | 'eachOpponent' }
  /** Archway Commons, Wandering Archaic: that player pays this, or `otherwise` happens (for the controller). */
  | {
      kind: 'payOrElse';
      who: 'controller' | 'eachOpponent';
      cost: ManaCost;
      otherwise: EffectDef[];
    }
  // Strixhaven (13a): Lorehold Apprentice, Academic Dispute
  /** Until end of turn, these creatures have this ability (Lorehold Apprentice: "{T}: deals 1 damage to each opponent"). */
  | {
      kind: 'grantAbility';
      to: Ref;
      ability: AbilityDef;
      // Reality Fracture (17a): Lyra, Tolarian Archangel
      /** Each use adds its own copy of the ability (an activated ability's "until end of turn, whenever ..."). */
      stacking?: boolean;
    }
  // Reality Fracture (17a): Fblthp, Impossibly Lost
  /** You win the game (an opponent who can't lose this turn stops it). */
  | { kind: 'winGame' }
  // Reality Fracture (17a): Sphinx of False Conclusions
  /** Creates a token that's a copy of the source, which may have left the battlefield ("create a token that's a copy of it" from a dies trigger). */
  | { kind: 'tokenCopyOfSource' }
  // Reality Fracture (17c): Ajani Resolute, Teyo, Way of the Mentor / Necromancer
  /** Put loyalty counters on a planeswalker (each planeswalker the Ref names; nothing for other permanents). */
  | { kind: 'loyaltyCounters'; to: Ref; amount: Amount }
  // Reality Fracture (17c): Jace's Machinations
  /** Until end of turn, you may activate the loyalty abilities of planeswalkers you control (matching `filter`) any time you could cast an instant. */
  | { kind: 'loyaltyAtInstantSpeed'; filter?: CardFilter }
  // Reality Fracture (17c): Empower Jace
  /**
   * Empower Jace N: if you control no Jace planeswalker token, create one (with 0 loyalty), then put N loyalty counters on a Jace
   * planeswalker token you control (you choose when you control several; a nontoken Jace never counts). N 0 only creates it.
   */
  | { kind: 'empowerJace'; amount: Amount }
  // Reality Fracture (17a): Sphinx's Approach
  /** Exile this spell and `count` other cards with its name from your graveyard (the engine picks which). */
  | { kind: 'exileSelfAndSameNameFromGraveyard'; count: number }
  // Reality Fracture (17a): Variable Chaser
  /** The player chose to discard their hand and draw cards (`who` is the chooser: 'controller' or 'eachOpponent'). */
  | { kind: 'markHandSwap'; who: 'controller' | 'eachOpponent' }
  /** Every marked player discards their hand, then every marked player draws `count` cards. */
  | { kind: 'handSwap'; count: number }
  /** The creature blocks this turn if able (Academic Dispute). */
  | { kind: 'mustBlock'; what: Ref }
  /** Mill N, then you may put a card matching the filter from among them into your hand (Cache Grab). */
  | {
      kind: 'millThenTake';
      count: number;
      filter: CardFilter;
      squirrelFood?: boolean;
      // Secrets of Strixhaven (14b): Vastlands Scavenger (Bind to Life)
      /** The card goes onto the battlefield instead of into your hand. */
      to?: 'battlefield';
    }
  /** Look at the top N; put `take` of them into your hand and the rest into your graveyard (Stargaze). */
  | {
      kind: 'lookTakeRestGraveyard';
      count: Amount;
      take: Amount;
      /** Strixhaven (13c): Search for Blex: you may take any number up to `take`... */
      upTo?: boolean;
      /** ...losing this much life for each card put into your hand. */
      lifePerCard?: number;
    }
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
      /** Spend it only on spells with this tag (Helga: 'BigCreature'; Lorwyn Eclipsed: 'MV4Plus', a spell with mana value 4 or greater). */
      onlyFor?: string;
      /** Karolina Dean: cannot pay for spells cast from hand. */
      notForHandSpells?: boolean;
    }
  /** Exile permanents; return them at the beginning of the next end step (with counters). */
  | {
      kind: 'exileUntilEndStep';
      what: Ref;
      counters?: number;
      // Strixhaven (13c): Semester's End
      loyaltyToo?: boolean;
      /** A named counter it returns with (Salvation Swan: flying). */
      named?: string;
      // Marvel Super Heroes Jumpstart (Blink): Silver Surfer, Cosmic Voyager
      /** One delayed trigger returns them all at once ("return those cards"). */
      together?: boolean;
      /** With `together`: "if a land enters this way, it enters tapped". */
      landsTapped?: boolean;
      // Lorwyn Eclipsed (18b, white): Morningtide's Light
      /** With `together`: "return those cards to the battlefield tapped" (every card, not just lands). */
      allTapped?: boolean;
    }
  /** Discard your whole hand. */
  | { kind: 'discardHand' }
  // Marvel Super Heroes Jumpstart (Kang Dynasty)
  /** Each of these players shuffles their hand and graveyard into their library (Immortus). */
  | { kind: 'shuffleHandAndGraveyardIntoLibrary'; who: Ref }
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
      // Strixhaven (13a): Zimone, Quandrix Prodigy
      /** It enters tapped. */
      tapped?: boolean;
      // Strixhaven (13c): Journey to the Oracle
      /** Every matching card from your hand, without asking ("any number": the best choice). */
      all?: boolean;
      // Secrets of Strixhaven (14b): Mind into Matter
      /** Mana value X or less (the value chosen for X). */
      maxManaValueX?: boolean;
      // Final Fantasy (11c): onto the battlefield attacking
      /** A card matching this enters tapped and attacking (Summoner's Grimoire: an enchantment card). */
      attackingIf?: CardFilter;
      // Lorwyn Eclipsed (18b, white): Kinscaer Sentry
      /** Mana value at most this amount, read as the effect resolves ("where X is the number of attacking creatures you control"). */
      maxManaValueAmount?: Amount;
    }
  // Strixhaven (13c)
  /** The resolving spell returns to its owner's hand rather than the graveyard (Journey to the Oracle). */
  | { kind: 'returnSelfFromStack' }
  /** You may put a card you own in exile with a study counter on it into your hand (Imbraham). */
  | { kind: 'takeStudyCard' }
  /** Exile permanents, then return them under their owners' control (with +1/+1 counters). */
  | {
      kind: 'blink';
      what: Ref;
      counters?: number;
      // Marvel Super Heroes: "return it tapped" (The Mighty Thor, Jane Foster).
      tapped?: boolean;
      // Final Fantasy (11a): saga creatures
      /** "Return it to the battlefield transformed" (Dion, Crystal Fragments). */
      transformed?: boolean;
    }
  /**
   * Choose a permanent you control matching the filter (other than the
   * source): `then` happens to it (the 'chosen' ref). With none to choose,
   * `otherwise` happens.
   */
  | {
      kind: 'chooseYourPermanent';
      filter?: CardFilter;
      /** A permanent an opponent controls instead (Vial Smasher: one of their planeswalkers). */
      opponents?: boolean;
      then: EffectDef[];
      otherwise?: EffectDef[];
    }
  /** Counter a spell unless its controller pays this. */
  | {
      kind: 'counterUnlessPays';
      what: Ref;
      cost: ManaCost;
      // Strixhaven (13a): Reject, "exile it instead of putting it into its owner's graveyard".
      exile?: boolean;
      /** Strixhaven Brawl (15b, u): Syncopate, `cost` plus {X} (the value chosen for X). */
      xCost?: boolean;
      /** Final Fantasy Commander (12c): generic cost counted as it resolves (Syncopate's X). */
      costAmount?: Amount;
    }
  // Strixhaven (13a): Divide by Zero
  /**
   * Return a target spell on the stack to its owner's hand. Reality Fracture (17c): `orCreature`, the target may be a
   * creature on the battlefield instead (Fatehold Charm).
   */
  | {
      kind: 'returnSpellToHand';
      what: Ref;
      orCreature?: boolean;
      // Tarkir: Dragonstorm (19b, clans): Jeskai Revelation, "target spell or permanent"
      orPermanent?: boolean;
    }
  /** Reveal cards from the top until one matches; it goes to hand or onto the battlefield tapped, the rest to the bottom. */
  | {
      kind: 'revealUntil';
      filter: CardFilter;
      // Reality Fracture (17a): Identity Echo ('battlefield': untapped)
      to: 'hand' | 'battlefieldTapped' | 'battlefield';
    }
  /**
   * Until end of turn, whenever the creature deals combat damage, its
   * controller may exile it and return it (Long River Lurker).
   */
  | { kind: 'blinkOnCombatDamage'; what: Ref }
  /** Put permanents on the top or bottom of their owners' libraries. */
  | {
      kind: 'putInLibrary';
      what: Ref;
      position: 'top' | 'bottom' | 'second';
      // Final Fantasy (11b): "shuffles it into their library" (Ice Magic).
      shuffle?: boolean;
    }
  /** Gain control of permanents until end of turn (Reptilian Recruiter), or until your next turn (Stilt-Man). */
  | {
      kind: 'gainControl';
      what: Ref;
      untilYourNextTurn?: boolean;
      // Strixhaven (13c): Tempted by the Oriq, "gain control of" with no duration.
      permanent?: boolean;
      // Marvel Super Heroes: 'for as long as this Saga remains on the battlefield'.
      whileSource?: boolean;
      // Final Fantasy (11c): leftovers
      /** As control reverts, Equipment and the creature it's on part if their controllers differ (Stolen Uniform). */
      unattachOnRevert?: boolean;
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
      // Reality Fracture (17a): Flourishing Grapple
      /** Until end of turn rather than until your next turn. */
      untilEndOfTurn?: boolean;
      // Lorwyn Eclipsed (18b, multi-b): Abigale, Eloquent First-Year
      /** With no duration: for as long as it's on the battlefield. */
      permanent?: boolean;
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
      to: 'hand' | 'battlefieldTapped' | 'battlefield' | 'graveyard' | 'libraryTop' | 'castFree';
      /** Unrestricted tutors cannot fail to find a card in a nonempty library. */
      required?: boolean;
      shuffle?: boolean;
      /** Untap the land found if you then control this many lands (Fabled Passage). */
      untapIfLands?: number;
      /** The controller of this target searches instead (Path to Exile). */
      forControllerOf?: number;
      // Strixhaven (13c)
      /** The card enters under an opponent's control (Verdant Mastery). */
      forOpponent?: boolean;
      /** The land found becomes a 0/0 Fractal creature with a +1/+1 counter per land you had enter this turn (Emergent Sequence). */
      fractalLand?: boolean;
      /** If the card found has one of these types, put a +1/+1 counter on the source (Oriq Loremage). */
      sourceCounterIfTypes?: CardType[];
      // Reality Fracture (17a): Fblthp, Knows the Way; Hexhaven Invigorator
      /** "Up to N cards": found one at a time, stopping whenever the searcher likes. */
      upTo?: Amount;
      /** With `upTo`: "with different names". */
      differentNames?: boolean;
      // Reality Fracture (17a fixes): Loyal Tutor
      /** "Reveal it": the card found is shown to the opponent (a 'cardsRevealed' event). */
      reveal?: boolean;
      // Lorwyn Eclipsed (18a): Celestial Reunion
      /** If the spell's additional cost chose a creature type and the card found has it, it enters the battlefield instead of going to hand. */
      battlefieldIfChosenType?: boolean;
      // Lorwyn Eclipsed (18b, black): Mornsong Aria
      /** The player whose turn it is searches (their own library, the card goes to their hand), not the controller. */
      activePlayerSearches?: boolean;
      // Tarkir: Dragonstorm (19b, misc): Ugin, Eye of the Storms
      /** The cards found are exiled, and you may cast them without paying their mana costs until end of turn. */
      exileFreeThisTurn?: boolean;
      // Tarkir: Dragonstorm (19b, red): Magmatic Hellkite
      /** The card found enters the battlefield with one counter of this kind ("with a stun counter on it"). */
      counter?: string;
      // Tarkir: Dragonstorm (19b, green): Claim Territory
      /** With `upTo`: the first card found goes to `to`, the ones after it here ("put one onto the battlefield tapped and the other into your hand"). */
      thenTo?: 'hand';
      // The Hobbit (20b white): Roads Go Ever, Ever On
      /** The cards found are exiled and remembered by the source ("exile them"; a later effect finds them with the source). */
      exileWithSource?: boolean;
    }
  /** Look at the top N; you may put a creature with mana value up to your land count onto the battlefield (Loot). */
  | { kind: 'lookForCreature'; count: number }
  | {
      kind: 'bounce';
      what: Ref;
      /** "If you do" (Bob, Reluctant HYDRA Agent): only if something was returned. */
      then?: EffectDef[];
    }
  | { kind: 'returnToHand'; what: Ref }
  | { kind: 'exileGraveyard'; who: Ref }
  | { kind: 'tap'; what: Ref }
  // Secrets of Strixhaven (14a): prepare
  /** The permanent becomes prepared: its controller gets a copy of its prepare spell in exile (no-op if it already is). */
  | { kind: 'prepare'; what: Ref }
  /** The permanent stops being prepared (its exiled copy ceases to exist). */
  | { kind: 'unprepare'; what: Ref }
  /** It can't become untapped for as long as you control the source (Spider-Woman, Secret Agent). */
  | { kind: 'doesntUntapWhileSource'; what: Ref }
  /** Change the target of a target spell with a single target to another legal one, best for you (Bolt Bend). */
  | { kind: 'changeTarget'; what: Ref }
  /** Time Stop: exile every spell and ability on the stack, then skip to the cleanup step. */
  | { kind: 'endTheTurn' }
  /**
   * "When you do, ...": this card's ability number `ability` (a { on: 'reflexive' } trigger)
   * triggers now; its targets are chosen as it goes on the stack (Quantum Entanglement,
   * Villainous Syndication, Rhino's Rampage).
   */
  | { kind: 'reflexiveTrigger'; ability: number }
  /** Internal (Bolt Bend): the spell or ability on the stack with this id gets these targets. */
  | { kind: 'setStackTargets'; id: ObjectId; targets: TargetChoice[] }
  /** Internal (Loki Laufeyson): its controller may choose new targets for the copy just made ('chosen'). */
  | { kind: 'chooseNewTargets' }
  /**
   * Iron Fist, Hero for Hire; Rhino, Terrible Trampler: "N damage divided as you choose among up
   * to M targets" / "distribute N +1/+1 counters among up to M target creatures". The targets
   * and the split are chosen as it resolves, one target (and how much it gets) at a time, so the
   * bots never list every combination; `each` then applies to every target chosen (as target 0).
   */
  | {
      kind: 'divide';
      // Tarkir: Dragonstorm (19b, clans-b): Ureni ("X damage divided as you choose among any number of target creatures and/or planeswalkers")
      /** The total to divide: a number, or an Amount worked out as it resolves. */
      amount: Amount;
      maxTargets: number;
      spec: TargetSpec;
      give: 'damage' | 'counters';
      each?: EffectDef[];
      // Tarkir: Dragonstorm (19b, red, clans): Twin Bolt, Armament Dragon, Revival of the Ancestors
      /** "One or two targets" rather than "up to": choosing no target at all isn't offered. */
      atLeastOne?: boolean;
      /** Internal: the targets chosen so far and what each gets. */
      chosen?: { to: TargetChoice; n: number }[];
      /** Internal: the choosing is over; deal the damage or put the counters. */
      done?: boolean;
    }
  /** The controller discards N cards of their choice. */
  | {
      kind: 'discard';
      count: number;
      who?: 'controller' | 'eachOpponent';
      // Secrets of Strixhaven (14b): "target player discards X cards"
      /** The (target) player who discards, instead of `who`. */
      of?: Ref;
      /** The number of cards, instead of `count`. */
      amount?: Amount;
      /** Only cards matching this. */
      filter?: CardFilter;
      /** Exiled instead (Ruthless Negotiation: "exiles a card from their hand"). */
      exile?: boolean;
      // Strixhaven (13c): Flamethrower Sonata
      /** Discarding an instant or sorcery deals damage equal to its mana value to this target. */
      damageTo?: number;
      // Strixhaven Brawl (15a): Seasoned Pyromancer
      /** Draw this many cards once the discarding is done (even if nothing was discarded). */
      drawAfter?: number;
      /** Then create one token of this id for each nonland card discarded. */
      tokenPerNonland?: string;
      // Reality Fracture (17a): Seasoned Cryomancer
      /** Once the discarding is done, if any nonland card was discarded, the reflexive ability at this index triggers ("that many"). */
      reflexiveOnNonland?: number;
      // Reality Fracture (17a): Tether Technician, Improvised Act
      /** "If you do": these effects follow once a card was discarded (not if the hand was empty). */
      then?: EffectDef[];
      // Reality Fracture (17c): Garruk, Veiled Butcher
      /** Once the discarding is done, the controller draws a card unless this player discarded at least this many nonland cards. */
      drawUnlessNonland?: number;
      // The Hobbit (20a): Recruit
      /** These effects follow once the discarding is done, only if a nonland card was discarded ("If you discarded a nonland card, ..."). */
      thenIfNonland?: EffectDef[];
    }
  /** Put the top N cards of your library into your graveyard. */
  | {
      kind: 'mill';
      count: Amount;
      who?: Ref;
      // Jump In slots (Dread Summons)
      /** "For each creature card put into a graveyard this way, you create a tapped <token>." */
      creatureTokens?: { token: CardDefId; tapped?: boolean };
    }
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
      count: number | Amount; // Tarkir: Dragonstorm (19b, clans): Kotis, "the top X cards" (X the damage dealt)
      from: 'yours' | 'opponents';
      maxManaValue?: Amount;
      rest: 'bottom' | 'exile';
      // Strixhaven (13c): Velomachus Lorehold (an instant or sorcery)
      filter?: CardFilter;
      // Tarkir: Dragonstorm (19b, clans): Kotis, the Fangkeeper
      /** "Any number of spells": after each one cast, the others may be cast too. */
      more?: boolean;
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
  | {
      kind: 'returnFromGraveyard';
      types: CardType[];
      /** Strixhaven (13c): not the permanent chosen earlier in this resolution (Deadly Brew: "another"). */
      exceptChosen?: boolean;
    }
  /** Put all creature cards from all graveyards onto the battlefield under your control. */
  | {
      kind: 'reanimateAll';
      // Jump In slots (Raise the Past)
      /** Only from your graveyard ("return all creature cards ... from your graveyard"). */
      yours?: boolean;
      /** Only creature cards matching this (mana value 2 or less). */
      filter?: CardFilter;
    }
  /** Exile the target graveyard card and create a token copy of it (Abyssal Harvester). */
  | {
      kind: 'tokenCopyOf';
      what: Ref;
      addSubtype: string;
      exileOtherTokensWithSubtype: boolean;
      // Final Fantasy (11c): "except it's a 5/5 black Demon" (Ardyn, the Usurper).
      pt?: [number, number];
    }
  // Reality Fracture (17a): Tam, the Possibility
  /**
   * Proliferate (`times` times, default once): choose any number of permanents with counters, one at a
   * time, and each gets another counter of each kind it has. The rest of the fields are internal.
   */
  | {
      kind: 'proliferate';
      times?: Amount;
      /** Internal: passes still to do, and the permanents already chosen in this pass. */
      remaining?: number;
      done?: ObjectId[];
      /** Internal: the permanent just chosen ('chosen') gets its counters now. */
      afterChoice?: boolean;
    }
  // Caretakers: Donald Blake replaces only creature types, permanently.
  | { kind: 'setCreatureTypes'; what: Ref; subtypes: string[] }
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
  | {
      kind: 'surveil';
      amount: number;
      // Reality Fracture (17a): Enlightened Confidant
      /** A card put into your graveyard this way with mana value at most this goes into your hand. */
      // Reality Fracture (17c): Chandra, Chill of Compliance ('filter': a card matching it goes to your hand, whatever its mana value)
      graveyardToHand?: { maxManaValue?: Amount; filter?: CardFilter };
    }
  /** Exile a permanent until the source leaves the battlefield (Banishing Light). */
  | { kind: 'exileUntilSourceLeaves'; what: Ref }
  /** Return the subject (an exiled card) to the battlefield under its owner's control. */
  // Strixhaven (13c): Semester's End (a planeswalker gets a loyalty counter instead)
  | { kind: 'returnSubject'; counters?: number; named?: string; loyaltyToo?: boolean }
  // Marvel Super Heroes Jumpstart (Blink)
  /** Return these exiled cards to the battlefield together under their owners' control (lands tapped). */
  | { kind: 'returnExiledCards'; cards: ObjectRef[]; landsTapped?: boolean; allTapped?: boolean }
  /** Put a card from a graveyard onto the battlefield under your control (with a named counter: finality). */
  | {
      kind: 'returnToBattlefield';
      what: Ref;
      counter?: string;
      // Tarkir: Dragonstorm (19b, clans): Perennation
      /** Several counters, one of each kind, as it enters ("with a hexproof counter and an indestructible counter on it"). */
      counters?: string[];
      /** It enters tapped (Deadly Plot, Grim Reaper). */
      tapped?: boolean;
      /** "Tapped and attacking" (Grim Reaper, Lethal Legionnaire). */
      attacking?: boolean;
      // Reality Fracture (17a): Ferocity of the Hunt
      /** Under its owner's control rather than yours. */
      underOwner?: boolean;
      /** It enters with +1/+1 counters if it matches the filter (Heroic Return: a Hero gets two). */
      countersIf?: { filter: CardFilter; count: number };
      // Marvel Super Heroes: "is a Hero in addition to its other types" (Thunderbolts Conspiracy).
      addSubtype?: string;
      // Jump In slots (Valkyrie's Call)
      /** It enters with this many +1/+1 counters. */
      plusOneCounters?: number;
      /** "It has flying": keywords it has for as long as it stays. */
      keywords?: Keyword[];
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
      /** Strixhaven (13c): Culling Ritual: add one mana of one of these colours for each permanent destroyed. */
      manaPerDestroyed?: ManaType[];
      // Tarkir: Dragonstorm (19b, clans): Death Begets Life
      /** Draw a card for each permanent destroyed this way. */
      drawPerDestroyed?: boolean;
    }
  /** Look at the top N; you may take a card matching the filter into your hand; the rest go to the bottom at random. */
  | {
      kind: 'lookAndTake';
      count: number | Amount;
      filter: CardFilter;
      /** Onto the battlefield if it's your turn, otherwise into your hand (Whiskervale Forerunner). */
      battlefieldOnYourTurn?: boolean;
      /** A card not taken stays on top (Herald's Horn looks at one card). */
      restOnTop?: boolean;
      /** Marvel Super Heroes: the rest go to the graveyard (Earth's Mightiest Heroes). */
      restToGraveyard?: boolean;
      // Strixhaven (13c): The Biblioplex
      /** The card looked at may instead be put into your graveyard. */
      canBin?: boolean;
      // Tarkir: Dragonstorm (19b, green): Traveling Botanist
      /** The card taken is revealed. */
      reveal?: boolean;
      // Final Fantasy (11b): look for a land
      /** The card taken goes onto the battlefield tapped instead (Ignis Scientia: a land). */
      // Foundations: 'libraryTop', it goes back on top (Gutless Plunderer, with `restToGraveyard`).
      to?: 'battlefield' | 'battlefieldTapped' | 'libraryTop';
      // Secrets of Strixhaven (14a): Follow the Lumarets. After the first pick, choose another card matching this from the rest.
      followUp?: CardFilter;
      // Secrets of Strixhaven (14b): Zimone's Experiment
      /** Lands taken go onto the battlefield tapped, other cards into your hand; one more pick follows the first. */
      landsTapped?: boolean;
      // Tarkir: Dragonstorm (19b, white): United Battlefront
      /** "Put up to N ... from among them": one at a time, stopping whenever the player likes; the rest go to the bottom in a random order. */
      upTo?: number;
    }
  /** Exile the top N; you may play them until the end of this turn or of your next turn. */
  | {
      kind: 'exileTopPlayable';
      count: Amount;
      // Marvel Super Heroes Jumpstart (Scarlet): 'yourNextEndStep' (Wiccan, Young Avenger).
      until: 'endOfTurn' | 'endOfNextTurn' | 'yourNextEndStep';
      // Marvel Super Heroes (Daredevil): "If that card is a Hero card, ...".
      ifExiled?: { filter: CardFilter; then: EffectDef[] };
    }
  /** The source card goes from its owner's graveyard back to their hand (Angelic Destiny). */

  /** Each opponent sacrifices a creature of their choice; optionally you gain life equal to its toughness. */
  | {
      kind: 'opponentSacrifices';
      gainToughness?: boolean;
      greatestPower?: boolean;
      /** Secrets of Strixhaven (14b): End of the Hunt: only among those with the greatest mana value. */
      greatestManaValue?: boolean;
      /** A permanent matching this instead of a creature. */
      filter?: CardFilter;
      /** Exiled instead of sacrificed (Early Winter). */
      exile?: boolean;
      /** You sacrifice instead of an opponent (Season of Loss: each player). */
      you?: boolean;
      /** Strixhaven (13c): Deadly Brew: what happens once something was sacrificed ("that permanent" is the chosen one). */
      then?: EffectDef[];
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
  | {
      kind: 'fight';
      a: Ref;
      b: Ref;
      // Marvel Super Heroes Jumpstart (Tenacious/Rampaging)
      /** Then these, if `a` dealt excess damage to `b` (Rhino's Rampage). */
      ifExcess?: EffectDef[];
    }
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
      // Tarkir: Dragonstorm (19a)
      /** "They gain menace and haste until end of turn" (Mardu Monument): these keywords until end of turn (`hasteThisTurn` is haste only). */
      keywordsThisTurn?: Keyword[];
      /** The token's base power and toughness are both this (an "X/X" token whose definition is 0/0: Spirits, Monument tokens). */
      pt?: Amount;
      /** "Sacrifice it at the beginning of the next end step" (mobilize, War Effort). */
      sacrificeAt?: 'nextEndStep';
    }
  /** Return all land cards from your graveyard to the battlefield tapped (World Shaper). */
  | { kind: 'returnLandsFromGraveyard' }
  | {
      kind: 'sacrifice';
      what: Ref;
      /** "When you do" (Villainous Syndication): only if something was sacrificed. */
      then?: EffectDef[];
    }
  // Tarkir: Dragonstorm (19a): Endure
  /**
   * "It endures N": put N +1/+1 counters on it, or create an N/N white Spirit token (the controller chooses; if it isn't on
   * the battlefield, the token). `what` is the creature (default: this one; Warden of the Grove: 'subject'). `token` defaults
   * to `TDM_SPIRIT` ('tdm-spirit-token', a 0/0 white Spirit creature).
   */
  | { kind: 'endure'; amount: Amount; what?: Ref; token?: CardDefId }
  // The Hobbit (20a): Amass, Recruit
  /**
   * "Amass <type> N" (rule 701.47): if the player controls no Army creature, they first create a 0/0 black <type> Army creature
   * token (`token`, a 0/0 black <type> Army definition); then they choose an Army creature they control (asked when there are several), put N +1/+1 counters on it,
   * and it becomes <type> in addition to its other types (for good). The chosen Army is "the amassed Army" (`'chosen'` in the
   * effects that follow: Goblin Plate Mail attaches itself to it). N may be 0: the Army is still made and chosen. `subtype` is
   * singular ('Goblin' for "amass Goblins"). `who` is the player who amasses (default the controller; Azog: `{ controllerOf: 0 }`,
   * no player if the target is missing). `tokenMade` is internal (the token was created already).
   */
  | { kind: 'amass'; subtype: string; amount: Amount; token: CardDefId; who?: Ref; tokenMade?: boolean }
  /** Internal: the second half of amass, the chosen Army gets its counters and its type. */
  | { kind: 'amassPut'; army: ObjectId; subtype: string; amount: number; player: PlayerId }
  /**
   * "Recruit" (you recruit): draw a card, then discard a card; if you discarded a nonland card, create a 1/1 white Human Soldier
   * creature token (`token`, default 'hob-human-soldier-token'). The discard is your choice. Nothing is discarded from an empty
   * hand, and no token is made then.
   */
  | { kind: 'recruit'; token?: CardDefId }
  /** The controller scries N (asks them to order the top cards). */
  | {
      kind: 'scry';
      amount: number;
      /** Strixhaven (13b): the opponent scries (Ingenious Mastery). */ forOpponent?: boolean;
    }
  | { kind: 'custom'; handler: string; params?: Record<string, unknown> }
  // Tarkir: Dragonstorm (19b, clans-b): All-Out Assault
  /**
   * "There is an additional combat phase after this phase followed by an additional main phase": cast in a main phase, the
   * extra combat and the extra (postcombat) main phase come right after it, then the turn goes on as it would have. Does
   * nothing outside a main phase. See `TurnState.extraPhases`.
   */
  | { kind: 'extraCombatThenMain' }
  // Doom Prevails (9e).
  /** The owner shuffles it into their library, then reveals the top card: a permanent card enters (Chaos Warp). */
  | { kind: 'chaosWarp'; what: Ref }
  /** Exile the top card of each player's library; you may play them free while they stay exiled (Extract Power). */
  | { kind: 'exileTopsPlayableFree' }
  /** Exile the top card; you may play it until you exile another with this source (Superior Foes). */
  | { kind: 'exileTopPlayableUntilNext' }
  // Reality Fracture (17c): Chandra, Torch of Defiance
  /**
   * Exile the top card of your library. You may cast it now (paying its costs: a land can't be cast); if you don't (a
   * land, or you decline or can't pay), `otherwise` happens.
   */
  | { kind: 'exileTopMayCast'; otherwise: EffectDef[] }
  /**
   * Exile a card with N time counters; it gains suspend (Kang Prime: the next nonland card from the top). Tarkir: Dragonstorm (19a):
   * 'subject' is the spell that caused the trigger, taken off the stack (not countered) into exile (Taigam, Master Opportunist).
   */
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
  | {
      kind: 'castFreeCard';
      card: ObjectRef;
      exileAfter?: boolean;
      // Strixhaven (13c): Uvilda
      /** It costs this many generic mana less instead of being free. */
      costLess?: number;
      // Secrets of Strixhaven (14b): Lorehold, the Historian (miracle {2})
      /** It costs this instead of being free. */
      pay?: ManaCost;
    }
  /**
   * Exile cards from the top until a nonland card with mana value at most `max`
   * (cascade: less than the source's). You may cast it free (discover: or put
   * it into your hand); the rest go to the bottom in a random order.
   */
  | {
      kind: 'revealUntilCastable';
      max: Amount | 'belowSource' | 'belowSubject';
      orHand?: boolean;
      /** Only a card matching this stops the search (Codie: an instant or sorcery). */
      filter?: CardFilter;
      // Marvel Super Heroes Jumpstart (Scarlet)
      /** The exiled cards (and the hit, if not cast) stay in exile (Wanda's Vision). */
      stayExiled?: boolean;
      // Tarkir: Dragonstorm (19b, red): Breaching Dragonstorm
      /**
       * Stop at the first nonland card whatever its mana value: it may be cast free if its mana value is at most `max`, otherwise
       * (or if it isn't cast) it goes to your hand (`orHand`); the lands exiled before it stay in exile.
       */
      firstNonland?: boolean;
    }
  // Strixhaven (13c)
  /** Jadzi: reveal the top card; a land goes onto the battlefield, a nonland card may be cast by paying `pay`. */
  | { kind: 'revealTopCastOrPlay'; pay: ManaCost }
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
      // Lorwyn Eclipsed (18b, blue): Mirrorform
      /** No end: it stays a copy for as long as it is on the battlefield. */
      permanent?: boolean;
      /** "Except he's a 4/4 Human Villain creature with vigilance" (Absorbing Man). */
      asCreature?: { power: number; toughness: number; subtypes: string[]; keywords: Keyword[] };
      // Strixhaven (13c): Echoing Equation
      /** The copies aren't legendary (also Loki, Lord of Misrule: "except it isn't legendary"). */
      nonlegendary?: boolean;
      // Marvel Super Heroes Jumpstart (Tricksters)
      /** Every object in `what` other than the copied one becomes a copy (Loki, Lord of Misrule). */
      each?: boolean;
      /** "Except his name is Impossible Man": it keeps its own name (for the legend rule). */
      keepName?: boolean;
      // Marvel Super Heroes Jumpstart (Young Avengers)
      /** "And he has this ability": the source's own abilities (by index) it keeps (Hulkling, Young Avenger). */
      keepAbilities?: number[];
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
  | {
      kind: 'whenDiesThisTurn';
      what: Ref;
      effects: EffectDef[];
      // Tarkir: Dragonstorm (19b, black): Desperate Measures
      /** Only if it dies under your control ("when it dies under your control this turn"). */
      underYourControl?: boolean;
    }
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
  | { kind: 'returnAuraTo'; aura: ObjectRef }
  // Final Fantasy (11a): job select
  /** Job select: create this 1/1 Hero token, then attach the source Equipment to it. */
  | { kind: 'jobSelect'; token: CardDefId }
  // Final Fantasy (11a): saga creatures
  /** Remove a lore counter from these Sagas (no chapter ability triggers). */
  | { kind: 'removeLore'; what: Ref }
  /** Put a lore counter on these Sagas (the new chapter triggers). */
  | { kind: 'addLore'; what: Ref }
  /**
   * "You may remove a lore counter from each of any number of Sagas you control"
   * (Garnet): asks for one Saga at a time, or none to stop; `then` happens for each.
   */
  | { kind: 'removeLoreFromAny'; then: EffectDef[] }
  // Strixhaven (13c): a choice whose options a handler builds (Silverquill Silencer's card name, Deadly Vanity).
  /**
   * A player chooses one option made by `CHOOSERS[handler]` (stx-13c-a-effects.ts); the chosen option's
   * effects (usually `custom` handlers with params) then happen. Nothing happens if the handler returns null.
   */
  | { kind: 'chooseCustom'; handler: string; params?: Record<string, unknown> }
  // Secrets of Strixhaven (14b): Improvisation Capstone
  /** Exile cards from the top of your library until their total mana value is `total` or more; cast any number of them free. */
  | { kind: 'exileUntilTotalCastFree'; total: number }
  // Reality Fracture (17a): Uldaros Theorix
  /**
   * Exile the cards targeted from target number `from` on, which are in your graveyard, and copy them; you may cast any number of the copies without
   * paying their mana costs, with total mana value `budget` or less. A permanent spell cast this way
   * becomes a token.
   */
  | { kind: 'exileCopyCastFree'; from: number; budget: number }
  // Final Fantasy (11c): rare effects
  /** Each player sacrifices half the creatures matching the filter they control, rounded down (Zodiark). */
  | { kind: 'eachPlayerSacrificesHalf'; filter: CardFilter }
  /**
   * Choose a card exiled with the source matching the filter; it enters under
   * your control, tapped and with +1/+1 counters if asked (The Darkness Crystal).
   */
  | { kind: 'putExiledWithSource'; filter: CardFilter; tapped?: boolean; counters?: number }
  // Final Fantasy (11c): hideaway
  /**
   * Hideaway N: look at the top N cards, exile one face down (remembered as
   * exiled with the source), the rest on the bottom in a random order.
   */
  | { kind: 'hideaway'; count: number }
  // Lorwyn Eclipsed (18a)
  /**
   * Blight N as an effect: `who` (default you) puts N -1/-1 counters on a creature they control, of their choice (one choice, no
   * prompt if they control just one creature). `optional`: "you may blight N". `then` happens if they blighted (the creature is
   * the `'chosen'` Ref: "the blighted creature"); `otherwise` if they didn't ("if you don't") or couldn't.
   */
  | {
      kind: 'blight';
      amount: Amount;
      who?: 'controller' | 'eachOpponent' | { target: number };
      optional?: boolean;
      then?: EffectDef[];
      otherwise?: EffectDef[];
    }
  /** "Gains all creature types": for good (Oko's +2) or until end of turn (Glamer Gifter). */
  | { kind: 'allCreatureTypes'; what: Ref; duration: 'permanent' | 'endOfTurn' }
  // Lorwyn Eclipsed (18b, white): Morningtide's Light
  /** "Until your next turn, prevent all damage that would be dealt to you." */
  | { kind: 'preventDamageToYouUntilYourNextTurn' }
  /** "Loses all creature types until end of turn" (Nameless Inversion). */
  | { kind: 'loseCreatureTypes'; what: Ref }
  /** "Return the exiled card to its owner's hand": the card the source beheld and exiled as it was cast (the Champions' leave trigger). */
  | { kind: 'returnBeholdExiled' }
  /** Persist's return (engine use; the trigger is queued by the engine). */
  | { kind: 'persistReturn' }
  /**
   * "Remove a -1/-1 counter from this creature" (`name`), or "remove a counter" of any kind (the player chooses the kind if
   * the creature has several). `count` defaults to 1.
   */
  | { kind: 'removeCounters'; from: Ref; name?: string; count?: Amount }
  /** "Remove any number of counters from target creature": the player takes them off one at a time, kind by kind, until they stop. */
  | { kind: 'removeAnyNumberOfCounters'; from: Ref };

export type StaticDef =
  // Strixhaven Brawl (15b, g): Hardened Scales, Kami of Whispered Hopes
  /** If +1/+1 counters would be put on a creature (or any permanent) you control, that many plus `amount` are put instead. */
  | {
      kind: 'extraCounters';
      amount: number;
      creaturesOnly?: boolean;
      /** Counters of any kind, not just +1/+1 counters (Doc Samson). */
      anyCounters?: boolean;
    }
  // Strixhaven Brawl (15b, g): Utopia Sprawl
  /** The enchanted land adds one extra mana of the colour chosen for this Aura when tapped for mana. */
  | { kind: 'landBonusMana' }
  // Strixhaven Brawl (15b, g): Academy Manufactor
  /** If you would create a Clue, Food or Treasure token, instead create one of each. */
  | { kind: 'clueFoodTreasure' }
  // Strixhaven Brawl (15a): Anointed Procession
  /** If an effect would create one or more tokens under your control, it creates twice that many instead. */
  | { kind: 'doubleTokens' }
  // Strixhaven Brawl (15a): Deification (simplified: every planeswalker type)
  /** Planeswalkers you control have hexproof; while you control a creature, damage can't remove their last loyalty counter. */
  | { kind: 'planeswalkerProtection' }
  // Secrets of Strixhaven (14b): Wildgrowth Archaic
  /** Creatures you cast enter with an additional +1/+1 counter for each colour of mana spent to cast them. */
  | { kind: 'entersWithColorsSpentCounters' }
  | {
      kind: 'anthem';
      affects: 'otherCreaturesYouControl' | 'creaturesYouControl' | 'creaturesOpponentsControl';
      filter?: CardFilter;
      // Lorwyn Eclipsed (18c, theme decks): Fearless Swashbuckler ("Vehicles you control have haste")
      /** Affects permanents matching the filter even when they aren't creatures (Vehicles). */
      anyPermanent?: boolean;
      condition?: ConditionDef;
      power: Amount;
      toughness: Amount;
      keywords?: Keyword[];
    }
  | { kind: 'noLifeGain' }
  // Tarkir: Dragonstorm (19a): Zurgo, Thunder's Decree
  /**
   * Permanents you control matching the filter can't be sacrificed (as an effect or a cost), during your end step if
   * `duringYourEndStep` ("During your end step, Warrior tokens you control have 'This token can't be sacrificed.'").
   */
  | { kind: 'cantBeSacrificed'; filter: CardFilter; duringYourEndStep?: boolean }
  // Reality Fracture (17a): Thalia, the Survivor
  /** Spells matching the filter that your opponents cast cost {amount} more. */
  | { kind: 'opponentSpellsCostMore'; filter: CardFilter; amount: number }
  // Reality Fracture (17a): Ghalta the Immovable
  /** Creatures you control can attack as though they didn't have defender. */
  | { kind: 'creaturesIgnoreDefender' }
  /** Each creature you control with toughness greater than its power assigns combat damage equal to its toughness. */
  | { kind: 'toughnessAssignsCombatDamage' }
  // Reality Fracture (17a): Yuriko, Blade of the Mighty
  /** During combat, players can't cast spells or activate abilities that aren't mana abilities. */
  | { kind: 'noCastOrActivateInCombat' }
  // Strixhaven (13c): Radiant Scrollwielder
  /** Instant and sorcery spells you control have lifelink. */
  | { kind: 'instantsSorceriesLifelink' }
  | { kind: 'cantBlock' }
  /** This permanent doesn't untap during its controller's untap step (The Hobbit (20a), Bombur: `unless` the condition holds). */
  | { kind: 'doesntUntap'; unless?: ConditionDef }
  /** You may cast spells (matching the filter) as though they had flash (High Fae Trickster), while the condition holds. */
  | { kind: 'flashForAll'; filter?: CardFilter; condition?: ConditionDef }
  /**
   * Creatures you control matching the filter have "{T}: Add one of these"
   * (Clement: Frogs, {G} or {U}, only for creature spells).
   */
  | {
      kind: 'grantMana';
      filter: CardFilter;
      produces: ManaType[];
      onlyForCreatures?: boolean;
      /**
       * The mana ability is the source's own, tapping the creature only its cost (Relic of
       * Legends), so Secure Detention on the creature doesn't stop it.
       */
      sourcesAbility?: boolean;
      // Secrets of Strixhaven (14b): Resonating Lute
      /** Lands (not creatures) tap for `amount` mana of any of these, only for spells with this tag. */
      onlyFor?: string;
      amount?: number;
      // Final Fantasy (11c): mana from every permanent
      /** Other permanents you control of any type, not just creatures (A Realm Reborn). */
      otherPermanents?: boolean;
    }
  /**
   * Lorwyn Eclipsed (18b, special): Mirrormind Crown. "As long as this Equipment is attached to a creature, the first time you would
   * create one or more tokens each turn, you may instead create that many tokens that are copies of equipped creature."
   */
  | { kind: 'firstTokensCopyEquipped' }
  /** You may play an additional land on each of your turns (Loot). */
  | { kind: 'extraLandDrop' }
  /** Prevent all combat damage dealt to and by this creature (Fog Bank). */
  | { kind: 'preventCombatDamage' }
  // Reality Fracture (17a): Loot, the Anomaly
  /** "If this creature's power is negative, it assigns combat damage as though its power were positive." */
  | { kind: 'negativePowerAsPositive' }
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
      // Marvel Super Heroes Jumpstart (Wakanda)
      /** "Its activated abilities can't be activated" (Secure Detention), mana abilities included. */
      cantActivate?: boolean;
      /** "Loses all abilities" (Quantum Reduction): from the moment the Aura attaches, while it stays. */
      loseAbilities?: boolean;
      // Reality Fracture (17a): Puppet Crafting
      /** "Is a creature in addition to its other types" (not an artifact too): from the moment the Aura attaches, while it stays. */
      becomesCreature?: boolean;
      // Final Fantasy (11a): job select
      /** "Is a Knight in addition to its other types." */
      addSubtypes?: string[];
      /** Keywords it has only during its controller's turn (Dragoon's Lance: flying). */
      yourTurnKeywords?: Keyword[];
      // Final Fantasy Commander (12b).
      /** Base power and toughness equal to its controller's life total (Aettir and Priwen). */
      basePTLife?: boolean;
      /** These keywords only while the equipped creature is legendary (Hero's Heirloom). */
      legendaryKeywords?: Keyword[];
      // Final Fantasy (11c): rare Equipment
      /** Base power and toughness X/X from an amount (Aettir and Priwen: your life total). */
      basePTAmount?: Amount;
      /** Keywords it has while attacking (The Masamune: first strike). */
      attackingKeywords?: Keyword[];
      /** While attacking, it must be blocked if able (The Masamune). */
      mustBeBlockedAttacking?: boolean;
      /** A creature dying makes its triggered abilities (and your emblems') trigger twice (The Masamune). */
      deathTriggersTwice?: boolean;
      // Lorwyn Eclipsed (18a): Stalactite Dagger
      /** "Equipped creature ... is all creature types." */
      allCreatureTypes?: boolean;
      // Lorwyn Eclipsed (18b, blue): Noggle the Mind, Blossombind
      /** With `loseAbilities` and `basePT`: "is a colorless <subtype> ..." (loses all colors and all other creature types). */
      colorlessSubtype?: string;
      /** "Enchanted creature can't become untapped" (by any effect, not only the untap step). */
      cantBecomeUntapped?: boolean;
      /** "Enchanted creature can't have counters put on it." */
      noCounters?: boolean;
      // Tarkir: Dragonstorm (19b, blue): Ringing Strike Mastery
      /** "Enchanted creature has '{5}: Untap this creature.'": the activated abilities the enchanted permanent has while this stays attached. */
      grantAbilities?: AbilityDef[];
      // Lorwyn Eclipsed (18b, white): Bark of Doran
      /** "As long as equipped creature's toughness is greater than its power, it assigns combat damage equal to its toughness." */
      toughnessAssignsDamage?: boolean;
    }
  // Reality Fracture (17a): Karn, Argent Defender
  /** "Artifacts and creatures entering the battlefield don't cause abilities to trigger." */
  | { kind: 'etbDoesntTrigger' }
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
      // Tarkir: Dragonstorm (19b, blue): Snowmelt Stag
      /** Base power and toughness while the condition holds ("During your turn, this creature has base power and toughness 5/2"). */
      basePT?: [number, number];
    }
  /** Instant and sorcery spells you cast cost {N} less (Archmage of Runes). */
  | { kind: 'instantsAndSorceriesCostLess'; amount: number }
  | {
      kind: 'spellsCostLess';
      filter: CardFilter;
      amount: Amount;
      // Tarkir: Dragonstorm (19b, clans-b): Temur Battlecrier ("During your turn, spells you cast cost {1} less ...")
      /** Only while this holds (checked for the permanent's controller). */
      condition?: ConditionDef;
      /** Strixhaven Brawl (15b, pair): Zimone, Infinite Analyst: only the first spell with {X} you cast each turn. */
      firstXOnly?: boolean;
    }
  // Strixhaven (13b): Killian, Ink Duelist
  /** Spells you cast that target a permanent matching the filter cost {N} less. */
  | { kind: 'spellsCostLessTargeting'; filter: CardFilter; amount: number }
  // Reality Fracture (17a): Samut, Tyrant of Naktamun
  /** Instant and sorcery spells you control have split second. */
  | { kind: 'instantsSorceriesSplitSecond' }
  // Reality Fracture (17a): Tetsuko Umezawa, Fugitive
  /** Creatures you control matching the filter can't be blocked. */
  | { kind: 'grantsCantBeBlocked'; filter: CardFilter }
  // Reality Fracture (17a): Surveillance Phantasm
  /** It can attack as though it didn't have defender while the condition holds. */
  | { kind: 'canAttackDespiteDefender'; condition: ConditionDef }
  | { kind: 'instantsAndSorceriesUncounterable' }
  /** You have no maximum hand size. */
  | { kind: 'noMaxHandSize' }
  // Marvel Super Heroes Jumpstart (Geniuses)
  /**
   * The first time you would draw a card each turn, except the first card you draw during each of
   * your draw steps, you draw `count` cards instead (Reed Richards, Smartest Man).
   */
  | { kind: 'firstExtraDrawBecomes'; count: number }
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
  // Marvel Super Heroes Jumpstart (Squadron)
  /** "If a source would deal damage to you or a <filter> you control, prevent all but 1 of that damage" (Hyperion). */
  | { kind: 'preventAllButOne'; filter: CardFilter }
  /** "If a creature you control would connive, instead you draw a card, then it connives" (Leader). */
  | { kind: 'conniveDrawsFirst' }
  /** "Noncreature spells you cast have improvise" (Ironheart). */
  | { kind: 'noncreatureSpellsHaveImprovise' }
  // Tarkir: Dragonstorm (19b, clans): Teval, Arbiter of Virtue
  /** "Spells you cast have delve." */
  | { kind: 'spellsHaveDelve' }
  // Lorwyn Eclipsed (18b, multi-b)
  /** Each other creature you control has hexproof from each of its colors (Tam, Mindful First-Year). */
  | { kind: 'hexproofFromOwnColors' }
  /** If a triggered ability of another Elemental you control triggers, it triggers an additional time (Twinflame Travelers). */
  | { kind: 'elementalTriggersTwice' }
  // The Hobbit (20a): Storied
  /**
   * Storied (like Ascend): "If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the
   * rest of the game." A static ability that works while the permanent is on the battlefield; it isn't a trigger and doesn't use
   * the stack. Three different permanents count (a legendary artifact counts once). The designation is on the player
   * (`PlayerState.enduringStory`) and can't be removed.
   */
  | { kind: 'storied' }
  /**
   * "If a triggered ability of a <subtype> you control triggers, that ability triggers an additional time" (Bifur, Melodic Rider:
   * `condition: { kind: 'enduringStory' }`). Includes the source itself; each source adds one more time.
   */
  | { kind: 'subtypeTriggersTwice'; subtype: string; condition?: ConditionDef }
  /**
   * "Once each turn, you may cast a spell with mana value less than or equal to <amount> from among cards exiled with this
   * permanent this turn without paying its mana cost" (Maralen, Fae Ascendant). The cards are marked `exiledWithThisTurn`.
   */
  | { kind: 'castFreeFromThisTurnsExile'; maxManaValue: Amount }
  // Lorwyn Eclipsed (18b, black): Mornsong Aria
  /** "Players can't draw cards." */
  | { kind: 'playersCantDraw' }
  // Lorwyn Eclipsed (18a): Raiding Schemes
  /** "Each noncreature spell you cast has conspire." */
  | { kind: 'noncreatureSpellsHaveConspire' }
  /** "Creature spells you cast have convoke." (Eirdu, Carrier of Dawn) */
  | { kind: 'creatureSpellsHaveConvoke' }
  /**
   * "You may cast <filter> spells from among cards you own exiled with this creature by removing N counters from among creatures
   * you control in addition to paying their other costs" (Dawnhand Dissident; the cards are remembered by `exileGraveyardCard.track`).
   * The counters are chosen one at a time as it is cast.
   */
  | { kind: 'castExiledWithSelf'; filter: CardFilter; removeCounters: number; yourTurnOnly?: boolean }
  /** "Your opponents can't cast spells during your turn" (Jennifer Walters). */
  | { kind: 'opponentsCantCastDuringYourTurn' }
  /** "You have hexproof", while the condition holds (Captain America, Super-Soldier). */
  | { kind: 'youHaveHexproof'; condition?: ConditionDef }
  // Power-up (Marvel Super Heroes)
  /** Power-up abilities of other creatures you control cost {amount} less (Hulk, Gamma Goliath). */
  | { kind: 'powerUpCostsLess'; amount: number }
  // Marvel Super Heroes Jumpstart (Trained)
  /** "You may pay {0} rather than pay the power-up cost of the first power-up ability you activate during each of your turns" (Advancing the Spirit). */
  | { kind: 'firstPowerUpFree' }
  // The Hobbit (20b white): Kíli the Resourceful
  /** "You may pay {0} rather than pay the equip cost of the first equip ability you activate each turn." */
  | { kind: 'firstEquipFree'; condition?: ConditionDef }
  /** This creature can't be blocked. */
  | { kind: 'cantBeBlocked' }
  /** "Other creatures you control have prowess" (Bria, Riptide Rogue). */
  | { kind: 'othersHaveProwess' }
  /** This creature can't be blocked by creatures matching the filter. */
  | { kind: 'cantBeBlockedBy'; filter: CardFilter }
  // Lorwyn Eclipsed (18b, green)
  /** "This creature must be blocked if able" (Vinebred Brawler); enforced like The Masamune's. */
  | { kind: 'mustBeBlockedIfAble' }
  /** "This creature can't be blocked by more than N creatures" (Safewright Cavalry: one). */
  | { kind: 'maxBlockers'; count: number }
  /** An Aura: "Enchanted land is the chosen color" (Shimmerwilds Growth); the land has only the Aura's `chosenColor` while attached. */
  | { kind: 'landIsChosenColor' }
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
  | {
      kind: 'doubleCounters';
      condition?: ConditionDef;
      // Final Fantasy (11c): only +1/+1 counters on creatures (The Earth Crystal).
      plusOneOnCreatures?: boolean;
    }
  /** Spells you cast matching the filter cost {N} less, while the condition holds. */
  | { kind: 'spellsCostLessIf'; filter: CardFilter; amount: number; condition?: ConditionDef }
  /** Look at the top card of your library any time; play cards matching the filter from there (Glarb). */
  | {
      kind: 'playFromTop';
      filter: CardFilter;
      // Final Fantasy (11c): "as long as The Lunar Whale attacked this turn".
      condition?: ConditionDef;
    }
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
  // Jump In slots (Imprisoned in the Moon)
  /** "Enchanted permanent is a colorless land with '{T}: Add {C}' and loses all other card types and abilities." */
  | { kind: 'enchantedIsColorlessLand' }
  /** Creatures your opponents control matching nothing in particular have base toughness N (Maha). */
  | { kind: 'opponentsBaseToughness'; toughness: number }
  /** Creatures your opponents control that would die are exiled instead (Vren). */
  | {
      kind: 'exileOpponentCreaturesInstead';
      /** Strixhaven (13c): Valentin: only nontoken creatures. */
      nontoken?: boolean;
    }
  // Doom Prevails (9e).
  /** Creatures can't attack you unless their controller pays this for each (Propaganda). */
  // The Hobbit (20a): Dáin, Lord of the Iron Hills (`condition`: only while it holds)
  | { kind: 'attackTax'; amount: number; condition?: ConditionDef }
  /** Nonland cards in your hand have miracle {0}: the first card you draw each turn may be cast free (Molecule Man). */
  | { kind: 'miracleZero' }
  // Secrets of Strixhaven (14b): Lorehold, the Historian
  /** Instant and sorcery cards in your hand have miracle with this cost. */
  | { kind: 'miracleCost'; cost: ManaCost }
  // The Fantastic Four (9d).
  /** This creature attacks each combat if able, while the condition holds (Galactus). */
  | { kind: 'attacksEachCombat'; condition?: ConditionDef }
  /** The legend rule doesn't apply to creatures you control (Council of Reeds). */
  | { kind: 'noLegendRule' }
  /** Triggered abilities of legendary creatures you control trigger an additional time (Annie Joins Up). */
  | { kind: 'legendaryTriggersTwice' }
  /** Lands you control have "{T}: Add one mana of any color" (Chromatic Lantern). */
  | {
      kind: 'landsTapForAnyColor';
      condition?: ConditionDef; /* Strixhaven Brawl (15b, multi): The World Tree */
    }
  // Strixhaven Brawl (15b, multi): Gorma, the Gullet
  /** Nontoken creatures you control enter with an additional +1/+1 counter for each creature that died under your control this turn. */
  | { kind: 'nontokenEnterWithDiedCounters' }
  // Wakanda Forever (9c).
  /** Prevent N of the damage sources your opponents control would deal to you (Heart-Shaped Herb). */
  | { kind: 'preventDamageToYou'; amount: number }
  /** Creature tokens you would create are this token instead (Divine Visitation: 4/4 Angels). */
  | { kind: 'creatureTokensBecome'; token: CardDefId }
  // Reality Fracture (17a): Draconic Visitor
  /** Artifact tokens you would create are this token instead, that many of them. */
  | { kind: 'artifactTokensBecome'; token: CardDefId }
  /** You may play lands from your graveyard (Conduit of Worlds). */
  | { kind: 'playLandsFromGraveyard' }
  // Secrets of Strixhaven (14b): Zaffai and the Tempests
  /** Once during each of your turns, you may cast an instant or sorcery spell from your hand without paying its mana cost. */
  | { kind: 'freeSpellOncePerTurn' }
  // Marvel Super Heroes Jumpstart (Analyzed)
  /**
   * Once during each of your turns, you may cast a spell matching the filter from your hand
   * without paying its mana cost (Vision, Spectral Synthezoid). Once for each such permanent.
   */
  | { kind: 'freeCastOncePerYourTurn'; filter: CardFilter }
  // Tarkir: Dragonstorm (19b, red): Dracogenesis
  /** "You may cast spells matching the filter without paying their mana costs." (A cast action 'freeMatching' beside the usual ones.) */
  | { kind: 'castFreeMatching'; filter: CardFilter }
  /** Creatures matching the filter can't attack you while the condition holds (Queen Mother Ramonda). */
  | { kind: 'cantAttackYou'; filter: CardFilter; condition?: ConditionDef }
  // Final Fantasy (11c): rare statics
  /** If you would gain life, you gain twice that much instead (The Wind Crystal). */
  | { kind: 'doubleLifeGain' }
  /** If an opponent would mill cards, they mill that many plus `amount` instead (The Water Crystal). */
  | { kind: 'opponentsMillMore'; amount: number }
  /**
   * If a nontoken creature an opponent controls would die, it's exiled with
   * this instead and you gain `life` (The Darkness Crystal).
   */
  | { kind: 'exileOpponentNontokenCreatures'; life: number }
  /** While this is equipped, its triggered abilities and its Equipment's trigger twice (Cloud). */
  | { kind: 'equippedTriggersTwice' }
  /** Whenever you tap a land for {C}, add an additional {C} (Ultima, Origin of Oblivion). */
  | { kind: 'extraColorlessFromLands' }
  // Final Fantasy (11c): damage doubling
  /** Damage from sources you control matching the filter is doubled (Trance Kuja: Wizards). */
  | { kind: 'doubleDamage'; source: CardFilter }
  // Final Fantasy (11c): damage absorbing
  /** All damage to you and other permanents you control is dealt to this creature instead (Ancient Adamantoise). */
  | { kind: 'absorbDamage' }
  /** Damage isn't removed from this creature during cleanup steps. */
  | { kind: 'damageStays' }
  // Final Fantasy (11c): entering permanents
  /** A permanent matching the filter entering under your control triggers your abilities twice (Traveling Chocobo). */
  | { kind: 'etbTriggersTwice'; filter: CardFilter }
  // Final Fantasy (11c): playing from the graveyard
  /** You may play cards from your graveyard while the condition holds (Hades: during your turn). */
  | { kind: 'playFromGraveyard'; condition?: ConditionDef }
  /** You may cast artifact spells from your graveyard for `life` more; they enter with a finality counter (Noctis). */
  | { kind: 'castArtifactsFromGraveyard'; life: number }
  // Final Fantasy (11b): lands and Towns
  /** "Lands you control enter untapped" (The Wandering Minstrel). */
  | { kind: 'landsEnterUntapped' }
  // Final Fantasy (11b): permanents in the graveyard
  /** "Prevent all combat damage that would be dealt to this creature" (Diamond Weapon). */
  | { kind: 'preventCombatDamageToSelf' }
  // Strixhaven (13c)
  /** You can't cast permanent spells (Codie, Vociferous Codex). */
  | { kind: 'cantCastPermanentSpells' }
  // Reality Fracture (17a): Marwyn, the Preserver
  /** Lands you control have hexproof. */
  | { kind: 'landsHexproof' }
  // Reality Fracture (17a): Omnipresence
  /** You may cast spells with mana value at most the number of creatures you control from your hand without paying their mana costs. */
  | { kind: 'freeCastByCreatureCount' }
  /** Each other planeswalker you control has this permanent's loyalty abilities (Kasmina, Enigma Sage). */
  | { kind: 'sharesLoyaltyAbilities' }
  // Reality Fracture (17c): the Way of the ... enchantments, Sanctum Lurker, Kiora of Salt and Sand, Tomik
  /**
   * Planeswalkers you control (tokens too) have this ability: an activated one (a loyalty
   * ability such as `{ cost: { loyalty: -2 } }`, which uses the planeswalker as its source) or a static one ("No more than one
   * creature can attack this planeswalker each combat"). Triggered abilities can't be granted.
   */
  | { kind: 'planeswalkersHave'; ability: AbilityDef }
  // Reality Fracture (17c): Sanctum Lurker
  /** Planeswalkers you control aren't put into their owners' graveyards for having 0 loyalty. */
  | { kind: 'planeswalkersStayAtZero' }
  // Reality Fracture (17c): Tomik, Orzhov Lawmage (granted to planeswalkers with `planeswalkersHave`)
  /** No more than one creature can attack this planeswalker each combat. */
  | { kind: 'oneAttackerOnly' }
  // Strixhaven Brawl (15b, b): Nowhere to Run
  /** Creatures your opponents control can be targeted as though they didn't have hexproof; their ward doesn't trigger. */
  | { kind: 'ignoreHexproofWard' }
  // Strixhaven Brawl (15b, r): Goldspan Dragon
  /** Treasures you control tap for two mana of one colour instead of one. */
  | { kind: 'treasuresTapForTwo' }
  // Final Fantasy Commander (12b): Equipment.
  /** Equip abilities you activate cost {amount} less (Fighter Class, Arms Scavenger). */
  | {
      kind: 'equipCostsLess';
      amount: number;
      condition?: ConditionDef;
      // Final Fantasy (11d): the Starter Kit
      /** Only equip abilities that target this creature (Cloud, Planet's Champion). */
      targetSelf?: boolean;
    }
  /** Nonartifact spells you cast have improvise (Inspiring Statuary). */
  | { kind: 'nonartifactSpellsHaveImprovise' }
  // Final Fantasy Commander (12d).
  /** Creatures your opponents control enter tapped (Authority of the Consuls). */
  | { kind: 'opponentCreaturesEnterTapped' }
  // Final Fantasy Commander (12e).
  /** Tokens you create come with a 1/1 green Frog (Quina; once per effect, not for the Frogs). */
  | { kind: 'plusFrogToken' }
  // Marvel Super Heroes Jumpstart (Animal).
  /** Tokens you create come with an additional Food token (Tippy-Toe, Terrific Partner; once per effect). */
  | { kind: 'plusFoodToken' }
  // Final Fantasy Commander (12f).
  /** It can attack as though it didn't have defender while it has a counter (Demon Wall). */
  | { kind: 'attacksWithCounterDespiteDefender' }
  /** Spells you cast from your graveyard cost {amount} less (Emet-Selch of the Third Seat). */
  | { kind: 'graveyardSpellsCostLess'; amount: number }
  // Final Fantasy (11c): leftovers
  /** It can't be blocked except by `count` or more creatures (Relentless X-ATM092: three). */
  | { kind: 'minBlockers'; count: number }
  // Lorwyn Eclipsed (18b, red): Lavaleaper, Hexing Squelcher
  /** Whenever a player taps a basic land for mana, that player adds one more mana of any type that land produced (every player's lands). */
  | { kind: 'basicLandsAddExtraMana' }
  /** "Spells you control can't be countered." */
  | { kind: 'spellsYouControlUncounterable' }
  // Tarkir: Dragonstorm (19b, white): Clarion Conqueror
  /** Activated abilities of permanents matching the filter (mana and loyalty abilities too) can't be activated, whoever controls them. */
  | { kind: 'noActivatedAbilities'; filter: CardFilter }
  // Tarkir: Dragonstorm (19b, misc): Dragonstorm Globe, Windcrag Siege
  /** Each permanent matching the filter that enters under your control enters with an additional +1/+1 counter (Dragonstorm Globe: Dragons). */
  | { kind: 'entersWithExtraCounter'; filter: CardFilter }
  /** If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time (Windcrag Siege, Mardu). */
  | { kind: 'attackTriggersTwice' };

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
  /** Caretakers: creature types replacing the printed ones. */
  creatureTypes?: string[];
  creatureTypesTimestamp?: number;
  lastSubtypes?: string[];
  /** Subtypes it had gained as it last left the battlefield. */
  lastAddedSubtypes?: string[];
  // Strixhaven Brawl (15b, b): Terrors of the Track's duplicate has lost double team.
  noDoubleTeam?: boolean;
  // Strixhaven Brawl (15a): Enduring Courage
  /** It's not a creature (it came back as an enchantment). */
  notCreature?: boolean;
  /** It wasn't a creature as it last left the battlefield. */
  lastNotCreature?: boolean;
  /** A card in exile its owner may play until the end of that turn (Strongbox Raider). */
  playableUntilTurn?: number;
  // Reality Fracture (17a): Twinned Vision
  /** The spell this object was cast as came from its owner's hand (copies have no flag: they weren't cast). */
  castFromHand?: boolean;
  /** Wiccan, Young Avenger: "until your next end step": not once that turn's end step has begun. */
  playableBeforeEndStep?: boolean;
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
  // Secrets of Strixhaven (14b): Fractal Tender
  /** The turn a counter (of any kind) was last put on it. */
  anyCountersTurn?: number;
  /** "Triggers only once each turn": the turn each such ability (by index) last triggered. */
  onceTurns?: Record<number, number>;
  // Strixhaven (13a): abilities granted until end of turn (Lorehold Apprentice)
  tempAbilities?: AbilityDef[];
  /** Strixhaven Brawl (15a): abilities it gained perpetually (Fallaji Antiquarian's unearth). */
  perpetualAbilities?: AbilityDef[];
  // Reality Fracture (17a): Emrakul, the Exigent Doom
  /** Abilities it has until the exiled card `card` is cast. */
  abilitiesUntilCast?: { card: ObjectId; ability: AbilityDef }[];
  /** In exile: its owner may cast it for as long as it remains there. */
  castableWhileExiled?: boolean;
  // Lorwyn Eclipsed (18c, theme decks): Lightstall Inquisitor
  /** In exile: each spell cast from there costs this much more. */
  exileCastTax?: number;
  /** In exile: a land played from there enters tapped. */
  exilePlayTapped?: boolean;
  /** It has lost all abilities (an effect until its controller's next turn). */
  blank?: boolean;
  /** A Class's level (1 if unset). */
  level?: number;
  /** Named counters it had as it last left the battlefield. */
  lastNamedCounters?: Record<string, number>;
  /** The color or creature type chosen for it as it entered. */
  chosenColor?: ManaType;
  // Strixhaven (13c): Silverquill Silencer
  /** The card name chosen for it as it entered. */
  chosenName?: CardDefId;
  // Strixhaven (13c): Hofri Ghostforge
  /** A token copy: the exiled card that returns to its owner's graveyard when this leaves the battlefield. */
  hofriExiled?: ObjectRef;
  // Strixhaven (13c): Radiant Scrollwielder
  /** Cast from exile this turn: if it would be put into a graveyard from the stack, it's exiled instead. */
  exileInstead?: boolean;
  chosenType?: string;
  // Lorwyn Eclipsed (18b, special): Puca's Eye, Foraging Wickermaw
  /** It's these colours (a colour-changing effect); `untilTurn`: only through the end of that turn. */
  colorOverride?: { colors: Color[]; untilTurn?: number };
  /** The creature type that was chosen for it when it left the battlefield ("the chosen type" of a sacrificed source). */
  lastChosenType?: string;
  /** Cards exiled with it (Keen-Eyed Curator). */
  exiledWith?: ObjectId[];
  /** Strixhaven Brawl (15a): Skyclave Apparition: the owner and mana value of the card it exiled. */
  linkedExile?: { owner: PlayerId; mv: number };
  /** Sugar Coat: the Aura that makes it a Food. */
  foodBy?: ObjectId;
  /** Jump In slots: the Imprisoned in the Moon making this a colorless land. */
  moonBy?: ObjectId;
  // Tarkir: Dragonstorm (19b, blue): Ringing Strike Mastery
  /** The Auras attached to it that give it abilities (`attached.grantAbilities`). */
  auraGrants?: ObjectId[];
  /** Someone other than its owner may cast it from exile, with any mana (Cruelclaw's Heist). */
  castableBy?: PlayerId;
  anyMana?: boolean;
  // Reality Fracture (17a): Null Summoner
  /** `castableBy` only while this holds for that player (threshold). */
  castableIf?: ConditionDef;
  /** Strixhaven (13c): `castableBy` only through the end of this turn (Nassari). */
  castableUntilTurn?: number;
  // Marvel Super Heroes Jumpstart (Analyzed)
  /** In exile: `player` may play it for as long as they control `source` (Victor Mancha, Runaway). */
  playableWhileControlling?: { source: ObjectRef; player: PlayerId };
  // Lorwyn Eclipsed (18b, black)
  /** With `castableBy`: only while that player controls this permanent (Taster of Wares). */
  castableWhileControlling?: ObjectRef;
  /** The spell this object was cast as came from a graveyard (Twilight Diviner). */
  castFromGraveyardZone?: boolean;
  // Reality Fracture (17a fixes): Hexhaven Dueling Arena
  /** The zone change (zcc) it was at when it last attacked: a creature that has changed zones since is a new object. */
  attackedZcc?: number;
  /** Its 'freeCastOncePerYourTurn' was used this turn (as this object: `zcc`). */
  freeCastUsed?: { turn: number; zcc: number };
  // Lorwyn Eclipsed (18b, multi-b)
  /** Tam, Mindful First-Year: it is all colors during this turn (turn number). Cleared when it changes zones. */
  allColorsTurn?: number;
  /** Maralen, Fae Ascendant: exiled with this permanent during this turn (turn number); castable by its controller under its static. */
  exiledWithThisTurn?: { by: ObjectId; zcc: number; turn: number };
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
  // Reality Fracture (17c): Theorist's Proxy
  /** This spell can't be countered (it was the next spell its controller cast after Theorist's Proxy's ability). */
  cantBeCountered?: boolean;
  // Lorwyn Eclipsed (18b, red): Goliath Daydreamer
  /** This spell is exiled with a dream counter on it, instead of going to the graveyard, as it resolves. */
  dreamExile?: boolean;
  /** Extract Power: it may be played for free while exiled, by this player. */
  playFreeBy?: PlayerId;
  /** Mystical Archive (16): Mind's Desire: `playFreeBy` only lasts through this turn number. */
  playFreeUntilTurn?: number;
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
  // Marvel Super Heroes Jumpstart (Tricksters)
  /** While copying, it keeps its own name (Impossible Man). */
  copyKeepsName?: boolean;
  // Marvel Super Heroes Jumpstart (Young Avengers)
  /** While copying, it also has these abilities of its own card, by index (Hulkling, Young Avenger). */
  copyKeptAbilities?: number[];
  // Wakanda Forever (9c).
  /** It's monstrous (Fleecemane Lion). */
  monstrous?: boolean;
  /** A token copy that isn't legendary (Helm of the Host). */
  nonlegendary?: boolean;
  /** Strixhaven (13c): not legendary only while it's a copy (Echoing Equation). */
  copyNonlegendary?: boolean;
  /** Exiled until an opponent of this player becomes the monarch (Palace Jailer). */
  jailedBy?: PlayerId;
  /** Kimoyo Beads: the modes of its triggered ability already chosen. */
  usedModes?: number[];
  // Avengers Assemble (9b).
  /** The turn it first became tapped (Captain America, Living Legend). */
  firstTappedTurn?: number;
  /** Sources that dealt damage to it this turn (Hawkeye); kept as it leaves. */
  damagedBy?: ObjectId[];
  // Reality Fracture (17a): Ruric Thar, Magecrusher
  /** It has dealt combat damage since it entered the battlefield. */
  dealtCombatDamage?: boolean;
  // Tarkir: Dragonstorm (19b, clans-b): Karakyk Guardian
  /** It has dealt damage (any damage) since it entered the battlefield. */
  dealtDamage?: boolean;
  // Final Fantasy (11a): adventure lands
  /** In exile "on an adventure": its owner may play it (the land) from there. */
  onAdventure?: boolean;
  // Final Fantasy (11a): saga creatures
  /** The turn a lore counter was last removed from it (Garnet: one counter per Saga). */
  loreRemovedTurn?: number;
  /** It enters with this many more +1/+1 counters (Summon: Fenrir's next creature spell). */
  bonusCounters?: number;
  // Final Fantasy (11c): rare triggers
  /** The creature chosen for it as it entered (Zenos yae Galvus). */
  chosenObject?: ObjectRef;
  // Final Fantasy (11c): meld
  /** A melded permanent: the other card it's made of (in exile meanwhile); it follows this one as it leaves. */
  meldedWith?: ObjectId;
  // Final Fantasy (11c): temporary token copies
  /** Its equip abilities cost this much less (Firion's copies). */
  equipDiscount?: number;
  // Final Fantasy (11c): turn conditions
  /** A Vehicle: the creatures that crewed it this turn (Balthier and Fran). */
  crewedBy?: { turn: number; ids: ObjectId[] };
  // Final Fantasy (11b): mana spent
  /** The mana spent to cast it, the last time it was cast (Shantotto, Sahagin). */
  manaSpent?: number;
  // Secrets of Strixhaven (14a): prepare, converge, paradigm
  /** Prepare: it's prepared; this is its copy of the prepare spell, waiting in exile. */
  prepared?: ObjectId;
  /** A prepare spell's copy in exile: the permanent that made it (it can be cast while that is prepared). */
  preparedBy?: ObjectId;
  // Secrets of Strixhaven (14b)
  /** Cast from exile with permission, it's exiled instead of going to the graveyard (Nita, Forum Conciliator). */
  exileAfterCast?: boolean;
  // Secrets of Strixhaven (14b): Flashback
  /** In a graveyard: it has flashback (its mana cost) until the end of this turn number. */
  flashbackGrantedTurn?: number;
  // Tarkir: Dragonstorm (19a): Songcrafter Mage
  /** In a graveyard: it has harmonize (its mana cost) until the end of this turn number. */
  harmonizeGrantedTurn?: number;
  /** Playing it from the graveyard this turn doesn't stop other spells (Ark of Hunger). */
  noSpellLock?: boolean;
  /** A copy of a card cast from exile (prepare, paradigm): it ceases to exist once it leaves the stack. */
  spellCopyCard?: boolean;
  /** Converge: the colours of mana spent to cast it (kept while it's on the battlefield). */
  manaColors?: Color[];
  // Strixhaven Brawl (15b, u): plot, Housemeld
  /** Plot: the turn it was exiled plotted (it can be cast for free on a later turn). */
  plottedTurn?: number;
  /** Housemeld: it perpetually has exactly these card types. */
  perpetualTypes?: CardType[];
  // Final Fantasy Commander (12).
  /** It blocks this attacker this combat if able (Fighter Class). */
  mustBlock?: ObjectRef;
  // Final Fantasy Commander (12c).
  /** The turn it became saddled (Mounts). */
  saddledTurn?: number;
  /** +1/+1 counters were put on it this many times during turn `countersTurn` (Botanical Brawler). */
  countersTurn?: number;
  countersTimes?: number;
  // Tarkir: Dragonstorm (19b, misc): Stalwart Successor
  /** Counters of any kind were put on it this many times during turn `turn`. */
  anyCountersTimes?: { turn: number; times: number };
  // Final Fantasy Commander (12f).
  /** Exiled from a graveyard to be cast this turn: it counts as cast from a graveyard (Emet-Selch). */
  fromGraveyardCast?: boolean;
  // Reality Fracture (17a): Null Summoner, Uldaros Theorix
  /** It entered the battlefield as a spell that was cast. */
  wasCast?: boolean;
  /** A copy of a card cast from exile: if it's a permanent spell it becomes a token as it resolves (Uldaros Theorix). */
  copyBecomesToken?: boolean;
  // Lorwyn Eclipsed (18a)
  /** It was cast for its evoke cost (kept while it's on the battlefield). */
  evoked?: boolean;
  /** Mana spent to cast it, by colour (the payer's best split for the colours "spent" conditions ask about); kept like `manaColors`. */
  manaPaid?: Partial<Record<Color, number>>;
  /** The card exiled as its cost by "behold … and exile it", while it's on the stack or the battlefield. */
  beholdExiled?: ObjectRef;
  /** The card it exiled that way as it last left the battlefield (the leave trigger returns it). */
  lastBeholdExiled?: ObjectRef;
  /** It has all creature types for good, from this timestamp (Oko, Lorwyn Liege's +2). */
  allCreatureTypes?: number;
  // Lorwyn Eclipsed (18b, blue): Noggle the Mind
  /** It has lost all its colors. */
  colorless?: boolean;
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
  /** Actual starting life, including format and game setup overrides. */
  startingLife?: number;
  /** Index 0 is the top card. */
  library: ObjectId[];
  hand: ObjectId[];
  graveyard: ObjectId[];
  exile: ObjectId[];
  // Strixhaven (13a): Learn
  /** Cards outside the game (card ids, not objects): the Lessons Learn can fetch. Hidden from the opponent. */
  sideboard?: CardDefId[];
  // Secrets of Strixhaven (14a): paradigm
  /** Paradigm spells (card ids) this player has resolved: a free copy at each of their first main phases. */
  paradigms?: CardDefId[];
  // Secrets of Strixhaven (14b): Mana Sculpt, Wisdom of Ages
  /** {C} to add at the beginning of this player's next main phase. */
  pendingMainMana?: number;
  /** "You have no maximum hand size for the rest of the game." */
  noMaxHandSize?: boolean;
  // Secrets of Strixhaven (14b): Ral Zarek, Guest Lecturer
  /** Turns this player skips (their next turns). */
  skipTurns?: number;
  // Strixhaven (13b): Maelstrom Muse
  /** The next instant or sorcery spell cast on `turn` costs `amount` less. */
  nextSpellDiscount?: { turn: number; amount: number };
  // Strixhaven Brawl (15a): Patchplate Resolute
  /** One-time boons: the next creature spells you cast (one each) enter with an additional +1/+1 counter. */
  creatureBoons?: number;
  // Lorwyn Eclipsed (18b, white): Morningtide's Light
  /** "Prevent all damage that would be dealt to you" until this player's next turn begins. */
  damagePrevented?: boolean;
  // The Hobbit (20a): Storied
  /** The player has an enduring story (for the rest of the game; see the 'storied' static). */
  enduringStory?: boolean;
  landsPlayedThisTurn: number;
  attackedThisTurn: boolean;
  drewFromEmptyLibrary: boolean;
  mulligans: number;
  keptHand: boolean;
  lost: boolean;
  /** Cards drawn for an opening hand, if not the usual seven (an expedition boon). */
  openingHand?: number;
  /** Floating mana: each entry is one mana of one of its types. */
  pool?: {
    produces: ManaType[];
    untilEndOfTurn?: boolean;
    onlyFor?: string;
    notForHandSpells?: boolean;
    /** Mystical Archive (16): Channel: spending this mana costs 1 life. */
    lifeCost?: boolean;
  }[];
  // Mystical Archive (16): Teferi's Protection, Approach of the Second Sun
  /** Their life total can't change and they have protection from everything, until their next untap step. */
  lifeFrozen?: boolean;
  /** How many spells named Approach of the Second Sun they have cast this game. */
  approachCasts?: number;
  /** They attacked during their most recent turn before the current one (Avenge). */
  attackedLastTurn?: boolean;
  // Brawl.
  /** The command zone. */
  command: ObjectId[];
  /** Their commander (the object keeps its id in every zone). */
  commander?: ObjectId;
  /** Times they have cast it from the command zone (commander tax: {2} each). */
  commanderCasts?: number;
  // Strixhaven (13c): Academic Probation
  /** Cards they can't cast by name until the start of `until`'s next turn. */
  castBans?: { defId: CardDefId; until: PlayerId }[];
}

export type StackItem =
  | {
      kind: 'spell';
      /** Original caster, retained if control of the spell changes. */
      castBy?: PlayerId;
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
      // Secrets of Strixhaven (14b): Choreographed Sparks
      /** A copy of a creature spell: it gains haste and is sacrificed at the next end step. */
      hasteSacrifice?: boolean;
      /** It enters with a finality counter (cast with Osteomancer Adept). */
      finality?: boolean;
      /** Mockingbird: the creature it enters as a copy of. */
      copyOf?: ObjectId;
      /** Cast from its owner's hand (rebound cares). */
      fromHand?: boolean;
      // Strixhaven (13b): Tend the Pests
      /** The power of the creature sacrificed as an additional cost to cast it. */
      lkiPower?: number;
      /** Times it was kicked (multikicker). */
      kickCount?: number;
      /** Cast from exile (Klaw). */
      fromExile?: boolean;
      /** Marvel Super Heroes: cast for its sneak cost; it enters tapped and attacking this player. */
      sneak?: PlayerId;
      // Lorwyn Eclipsed (18a)
      /** Cast for its evoke cost: it's sacrificed when it enters. */
      evoked?: boolean;
      /** Conspire was chosen as it was cast: its caster picks the two creatures to tap, one at a time. */
      conspire?: boolean;
      /** Cast from exile by removing this many counters from among creatures its caster controls (Dawnhand Dissident). */
      payCounters?: number;
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
      /** Vulture, Feathered Fiend: every creature that set off a batched trigger ("those creatures"). */
      subjects?: ObjectRef[];
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
  /** Iron Man: source identity and effect key, independent of later zone changes. */
  optionalUses?: string[];
  /** Iron Man: last known spell information for non-targeted trigger copies. */
  spellHistory?: Record<string, { defId: CardDefId; spell: Extract<StackItem, { kind: 'spell' }> }>;
  // Marvel Super Heroes
  /** Power-up abilities can't be activated this turn (Kang the Conqueror's extra turn). */
  noPowerUp?: boolean;
  // Marvel Super Heroes Jumpstart (Trained)
  /** The active player has activated a power-up ability this turn (Advancing the Spirit frees only the first). */
  powerUpActivated?: boolean;
  // The Hobbit (20b white): Kíli the Resourceful
  /** The turn number in which each player last activated an equip ability (the first each turn may be free). */
  equipActivated?: Partial<Record<PlayerId, number>>;
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
  // Tarkir: Dragonstorm (19b, clans-b): All-Out Assault
  /**
   * Extra combat + main phase pairs made by `extraCombatThenMain`, innermost last. 'pending': made, waiting for the current main
   * phase to end; 'combat': in the extra combat; 'main': in the extra main phase (step 'main2'). `resume` is the step the turn
   * returns to afterwards (the one that would have followed the main phase it was made in).
   */
  extraPhases?: { phase: 'pending' | 'combat' | 'main'; resume: Step }[];
  /** Mystical Archive (16): Angel's Grace: these players can't lose the game this turn and their life can't drop below 1. */
  cantLose?: PlayerId[];
  /** Mystical Archive (16): Veil of Summer: spells these players control can't be countered this turn. */
  uncounterable?: PlayerId[];
  // Reality Fracture (17c): Theorist's Proxy
  /** The next spell each of these players casts this turn can't be countered. */
  nextSpellUncounterable?: PlayerId[];
  /** Mystical Archive (16): Deflecting Palm: the next damage to these players this turn is prevented and dealt to its source's controller. */
  deflect?: PlayerId[];
  // Tarkir: Dragonstorm (19b, clans): New Way Forward
  /**
   * "The next time a source of your choice would deal damage to you this turn, prevent that damage. When damage is prevented this
   * way, New Way Forward deals that much damage to that source's controller and you draw that many cards."
   */
  sourceShields?: { player: PlayerId; source: ObjectId; by: ObjectId }[];
  /** Creatures declared as attackers this turn, once per combat. */
  attackers: ObjectId[];
  // Lorwyn Eclipsed (18c, theme decks): Fearless Swashbuckler
  /** The creatures declared as attackers in the latest combat (even ones that have left since). */
  combatAttackers?: ObjectId[];
  // Reality Fracture (17a): Hall of Echoes
  /** "The legend rule doesn't apply to permanents you control this turn." */
  noLegendRule?: PlayerId[];
  /** How many times each player gained life this turn. */
  lifeGains: Record<PlayerId, number>;
  /** Creatures that died this turn (Morbid). */
  creaturesDied: number;
  /** Cards each player drew this turn. */
  cardsDrawn: Record<PlayerId, number>;
  // Marvel Super Heroes Jumpstart (Geniuses)
  /** Players who would already have drawn a card this turn other than their draw step's first (Reed Richards). Replaced, never mutated. */
  extraDrawSeen?: PlayerId[];
  /** Total mana each player spent this turn (expend). Missing in older saves. */
  manaSpent?: Record<PlayerId, number>;
  /** How many times each player lost life this turn. Missing in older saves. */
  lifeLost?: Record<PlayerId, number>;
  /** Spells each player cast this turn. */
  spellsCast?: Record<PlayerId, number>;
  // Secrets of Strixhaven (14b): Zaffai and the Tempests
  /** Players who already cast a spell free from hand with Zaffai this turn. */
  zaffaiUsed?: PlayerId[];
  /** Creatures each player controlled that were exiled from the battlefield this turn. */
  creaturesExiled?: Record<PlayerId, number>;
  /** Creatures that died under each player's control this turn. */
  creaturesLost?: Record<PlayerId, number>;
  /** Strixhaven Brawl (15b, multi): +1/+1 counters each player put on creatures they control this turn (Iridescent Hornbeetle). */
  countersPut?: Record<PlayerId, number>;
  /** Lorwyn Eclipsed (18a): players who put a counter of any kind on a creature this turn (Lasting Tarfire). */
  creatureCountersBy?: PlayerId[];
  /** Secrets of Strixhaven (14b): cards (not tokens) put into exile this turn (Ennis, Debate Moderator). */
  exiledCards?: number;
  /** Cards that left each player's graveyard this turn (Bonecache Overseer). */
  leftGraveyard?: Record<PlayerId, number>;
  // Reality Fracture (17a): Cruel Calculations
  /** Cards put into each player's graveyard from their library this turn. */
  milled?: Record<PlayerId, number>;
  // Reality Fracture (17a): Surveillance Phantasm
  /** Players who scried or surveilled this turn. */
  scriedOrSurveilled?: PlayerId[];
  // Reality Fracture (17a): Variable Chaser
  /** Players who chose to discard their hand and draw seven (until the spell finishes). */
  handSwap?: PlayerId[];
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
  /** Time Stop resolved: the turn skips to its cleanup step. */
  endTheTurn?: boolean;
  /** Flying Drone: creatures with flying that entered this turn, and who controlled them then. */
  flyersEntered?: { id: ObjectId; player: PlayerId }[];
  // Lorwyn Eclipsed (18b, green, multi-a): Bristlebane Outrider, Thoughtweft Charge, Wary Farmer
  /** Creatures that entered the battlefield this turn, and who controlled them then. */
  creaturesEntered?: { id: ObjectId; player: PlayerId }[];
  // Final Fantasy (11a): saga creatures
  /** Players whose creatures are dealt no damage this turn (Summon: Alexander). */
  creaturesShielded?: PlayerId[];
  // Strixhaven (13c): Revel in Silence
  /** Players who can't activate planeswalkers' loyalty abilities this turn. */
  noLoyalty?: PlayerId[];
  // Reality Fracture (17c): Kiora of Salt and Sand
  /** Players who activated a loyalty ability this turn. */
  loyaltyActivated?: PlayerId[];
  // Reality Fracture (17c): Jace's Machinations
  /** Players who may activate loyalty abilities at instant speed this turn (of planeswalkers matching the filter). */
  instantLoyalty?: { player: PlayerId; filter?: CardFilter }[];
  // Strixhaven Brawl (15b, u): Quicken
  /** Players whose next sorcery spell this turn can be cast as though it had flash. */
  sorceryFlash?: PlayerId[];
  // Strixhaven Brawl (15b, pair): Hidden Stockpile (revolt)
  /** Permanents that left the battlefield under each player's control this turn. */
  permanentsLeft?: Record<PlayerId, number>;
  // Final Fantasy Commander (12b).
  /** Additional land plays this turn (Explore, Sword of Forge and Frontier). */
  extraLands?: Record<PlayerId, number>;
  /** Final Fantasy Commander (12d): life each player lost this turn, in total (Y'shtola). */
  lifeLostTotal?: Record<PlayerId, number>;
  // Final Fantasy (11c): extra phases and steps
  /** Combat phases begun this turn (Genji Glove, Balthier and Fran: "the first combat phase"). */
  combats?: number;
  /** End steps begun this turn, and additional end steps to come (Y'shtola Rhul). */
  endSteps?: number;
  extraEndSteps?: number;
  // Final Fantasy (11c): devotion and life gained
  /** Life each player gained this turn (Hope Estheim). */
  lifeGained?: Record<PlayerId, number>;
  // Reality Fracture (17a): Command the Stage, Master of Barbs
  /** Players dealt noncombat damage this turn, and during the turn before. */
  noncombatDamaged?: PlayerId[];
  lastNoncombatDamaged?: PlayerId[];
  // Reality Fracture (17a): Molten Tide
  /** Players whose Mountains add an additional {R} when tapped for mana this turn. */
  moltenTide?: PlayerId[];
  // Lorwyn Eclipsed (18b, special): Mirrormind Crown
  /** Players whose first token creation this turn has happened ("the first time you would create one or more tokens each turn"). */
  firstTokensDone?: PlayerId[];
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
  // The Hobbit (20b white): Stone by Sunlight
  /** It's an artifact in addition to its other types. */
  becomesArtifact?: boolean;
  // Reality Fracture (17a): Puppet Crafting
  /** With `becomesCreature`: a creature only, not an artifact too. */
  creatureOnly?: boolean;
  creatureSubtype?: string;
  /** Combat damage that would be dealt to it is prevented (Fleeting Flight). */
  preventCombatDamage?: boolean;
  /** Base power and toughness. */
  basePT?: [number, number];
  /** Control change: who controlled it before (restored when this expires). */
  previousController?: PlayerId;
  /** 'untilYourNextTurn': until `player`'s next turn begins. */
  expires: 'endOfTurn' | 'untilYourNextTurn' | 'whileSource' | 'permanent';
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
  // Marvel Super Heroes Jumpstart (Great Lakes Avengers)
  /** Can't be blocked by creatures matching this filter (Doorman). */
  cantBeBlockedBy?: CardFilter;
  /** Its power and toughness are switched (Flatman). */
  switchPT?: boolean;
  counterOnCombatDamage?: boolean;
  /** Damage to this player and their creatures goes to the affected creature instead (Heroic Sacrifice). */
  redirectFor?: PlayerId;
  // Strixhaven (13a): Academic Dispute
  /** It blocks this turn if able. */
  mustBlock?: boolean;
  // Strixhaven (13b): Prismari Pledgemage
  /** It can attack as though it didn't have defender. */
  ignoreDefender?: boolean;
  // Strixhaven (13c): Academic Probation
  /** It can't attack. */
  cantAttack?: boolean;
  /** Its activated abilities can't be activated. */
  noActivate?: boolean;
  /** What happens if the affected creature dies while this lasts. */
  onDies?: {
    effects: EffectDef[];
    controller: PlayerId;
    sourceDefId: CardDefId;
    /** Tarkir: Dragonstorm (19b, black): only if it died under `controller`'s control. */
    underControl?: boolean;
  };
  // Strixhaven Brawl (15b, w): Alseid of Life's Bounty
  /** Protection from this colour (targeting and damage; not blocking). */
  protectionFrom?: Color;
  // Lorwyn Eclipsed (18b, multi-a): Figure of Fable
  /** Protection from everything controlled by anyone but this player ("protection from each of your opponents"). */
  protectionFromOthersThan?: PlayerId;
  // Final Fantasy (11c): leftovers
  /** It must be blocked this turn if able (Magitek Scythe). */
  mustBeBlocked?: boolean;
  /** As control reverts, an Equipment on a creature its controller doesn't control falls off (Stolen Uniform). */
  unattachOnRevert?: boolean;
  // Lorwyn Eclipsed (18a)
  /** It has all creature types (Glamer Gifter). */
  allCreatureTypes?: boolean;
  /** It has no creature types (Nameless Inversion). */
  noCreatureTypes?: boolean;
  // Lorwyn Eclipsed (18b, blue): Noggle the Mind
  /** It is colorless. */
  colorless?: boolean;
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
  /** Vulture, Feathered Fiend: every creature that set off a batched trigger. */
  subjects?: ObjectRef[];
  amount?: number;
  /** The permanent picked by 'chooseYourPermanent'. */
  chosen?: ObjectRef;
  /** The value chosen for X. */
  x?: number;
  // Reality Fracture (17a fixes): Rise of the Deathbringer
  /** Cards its latest draw effect actually drew ("the number of cards drawn this way"). */
  drawnThisWay?: number;
  // Reality Fracture (17c): Overwrite the Multiverse
  /** Permanents its latest exile effect actually exiled ("the number of creatures exiled this way"). */
  exiledThisWay?: number;
  // Lorwyn Eclipsed (18b, blue)
  /** Permanents the latest `bounce` returned to hand / spells and abilities Glen Elendra's Answer countered. */
  affectedThisWay?: number;
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
    // Final Fantasy (11a): adventure lands
    /** Cast as an Adventure: exiled "on an adventure" as it resolves. */
    adventure?: boolean;
    // Tarkir: Dragonstorm (19a): Omen
    /** Cast as an Omen: shuffled into its owner's library as it resolves. */
    omen?: boolean;
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
  /** Vulture, Feathered Fiend: every creature that set off this batched trigger. */
  subjects?: ObjectRef[];
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
  // Reality Fracture (17c): Jace, Reality Sculptor, Garruk, Curse Breaker
  /** It goes away as this player's next turn begins ("until your next turn"). */
  untilTurnOf?: PlayerId;
  /** Its rules text, for the board. */
  label?: string;
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
  /** At the beginning of an upkeep instead of an end step (Arcane Denial); 'endCombat': at the beginning of the end of combat step (decayed). */
  at?: 'upkeep' | 'endCombat';
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
      // Marvel Super Heroes Jumpstart (Blink)
      /**
       * An ability with an `anyNumber` spec: the targets picked so far. Each
       * `chooseTargets` action is these plus one more (keep picking), or exactly
       * these (done).
       */
      picked?: TargetChoice[];
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
      /** Strixhaven (13c): see the effect. */
      damageTo?: number;
      /** Connive: the creature that gets a +1/+1 counter if a nonland card is discarded. */
      connive?: ObjectRef;
      // Strixhaven (13c): Illuminate History
      /** "Discard any number of cards, then draw that many": `count` counts the ones discarded; chooseEffect stops. */
      anyNumber?: { discarded: number; plus?: number; max?: number };
      // Strixhaven Brawl (15a): Seasoned Pyromancer
      drawAfter?: number;
      tokenPerNonland?: string;
      reflexiveOnNonland?: number; // Reality Fracture (17a): Seasoned Cryomancer
      nonlandDiscarded?: number;
      // Reality Fracture (17a): Tether Technician
      then?: EffectDef[];
      // Reality Fracture (17c): Garruk, Veiled Butcher
      drawUnlessNonland?: number;
      // The Hobbit (20a): Recruit
      thenIfNonland?: EffectDef[];
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
      to?:
        | 'hand'
        | 'battlefieldTapped'
        | 'battlefield'
        | 'graveyard'
        | 'libraryTop'
        | 'castFree'
        | 'libraryBottom'
        // Final Fantasy (11c): hideaway ('hideaway': exiled face down with the source).
        | 'hideaway';
      // Strixhaven (13c): Ardent Dustspeaker, The Biblioplex
      /** From the graveyard to the library bottom: these effects follow only if a card was chosen. */
      onPick?: EffectDef[];
      /** The looked-at top card may instead be put into the graveyard (chooseEffect accepts). */
      canBin?: boolean;
      /** Explore the Vastlands: after this answer, choose a card matching this from the rest of the cards looked at. */
      followUp?: CardFilter;
      // Secrets of Strixhaven (14b): Zimone's Experiment
      /** A land taken goes onto the battlefield tapped, anything else into the hand; one more pick follows the first. */
      landsTapped?: boolean;
      required?: boolean;
      /** Only these top cards were looked at: the rest go to the bottom in a random order (no shuffle). */
      looked?: ObjectId[];
      /** Shuffle afterwards (default true unless `looked`). */
      shuffle?: boolean;
      /** The chosen card enters with this named counter (Kastral: finality). */
      counter?: string;
      /** Untap the land found if you then control this many lands (Fabled Passage). */
      untapIfLands?: number;
      // Strixhaven (13c)
      /** The card enters under an opponent's control (Verdant Mastery). */
      forOpponent?: boolean;
      // Reality Fracture (17a): Fblthp, Knows the Way; Hexhaven Invigorator
      /** "Up to N cards": how many more may be taken (one at a time). */
      remaining?: number;
      // Tarkir: Dragonstorm (19b, misc): Ugin, Eye of the Storms
      /** The cards found are exiled; they may be cast free this turn. */
      exileFreeThisTurn?: boolean;
      // The Hobbit (20b white): Roads Go Ever, Ever On
      /** The cards found are exiled with the source. */
      exileWithSource?: boolean;
      /** Each card taken must have a different name from the ones already taken. */
      differentNames?: boolean;
      // Tarkir: Dragonstorm (19b, green): Claim Territory
      /** After the first card, the destination is this. */
      thenTo?: 'hand';
      // Reality Fracture (17a fixes): Loyal Tutor
      /** The card found is revealed. */
      reveal?: boolean;
      /** Lorwyn Eclipsed (18a): Celestial Reunion: a card of this creature type goes onto the battlefield instead of into the hand. */
      battlefieldIfType?: string;
      /** The land found becomes a Fractal creature (Emergent Sequence). */
      fractalLand?: boolean;
      /** If the card has one of these types, the source gets a +1/+1 counter (Oriq Loremage). */
      sourceCounterIfTypes?: CardType[];
      /** Cache Grab: a Food if you control a Squirrel or took a Squirrel card. */
      squirrelFood?: boolean;
      /** Whiskervale Forerunner: onto the battlefield on your turn, else into your hand. */
      battlefieldOnYourTurn?: boolean;
      /** The looked-at cards not taken stay on top (Herald's Horn). */
      restOnTop?: boolean;
      /** Marvel Super Heroes: the cards not taken go to the graveyard. */
      restToGraveyard?: boolean;
      // Final Fantasy (11c): The Darkness Crystal ("tapped ... with two additional +1/+1 counters").
      enterTapped?: boolean;
      enterCounters?: number;
      // Final Fantasy (11c): onto the battlefield attacking
      /** The chosen card enters tapped and attacking if it matches this. */
      attackingIf?: CardFilter;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Put `count` of these into your hand (one at a time); the rest go to your graveyard (Stargaze). */
      kind: 'pickCards';
      player: PlayerId;
      options: ObjectId[];
      count: number;
      /** Strixhaven (13c): they may stop early (answer null); each card taken costs `lifePerCard` life. */
      upTo?: boolean;
      lifePerCard?: number;
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
      /** Strixhaven (13c): Deadly Brew: effects to run once it's sacrificed. */
      then?: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      kind: 'scry';
      player: PlayerId;
      /** Surveil: "bottom" cards go to the graveyard instead. */
      surveil?: boolean;
      // Lorwyn Eclipsed (18c, theme decks): explore's "put the card back or put it into your graveyard" (a surveil that isn't one)
      explore?: boolean;
      // Reality Fracture (17a): Enlightened Confidant
      /** Surveil: a card put into the graveyard with mana value at most this returns to the hand. */
      toHandMaxMv?: number;
      // Reality Fracture (17c): Chandra, Chill of Compliance
      toHandFilter?: CardFilter;
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
      // Jump In slots (Polygraph Orb)
      /** Collect evidence: the mana value still to exile; cards are picked until it is reached. */
      evidence?: number;
      /** Runaways: the spell is cast only after all additional costs are paid. */
      castingSpell?: { card: ObjectId; targets: TargetChoice[]; sacrificed: number };
      player: PlayerId;
      count: number;
      // Reality Fracture (17a fixes): Gallia, Tragic Host
      /** An "exile a card from your graveyard" ability cost: only cards matching this, never `source`. */
      filter?: CardFilter;
      source?: ObjectId;
      // Reality Fracture (17a fixes): Uldaros Theorix
      /** The free cast this is paid for: once it's paid, that cast is finished (more spells, then its effect). */
      afterFree?: { decision: Extract<Decision, { kind: 'castFree' }>; cast: ObjectId };
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
      // Reality Fracture (17a): Null Summoner
      castableIf?: ConditionDef;
      // Lorwyn Eclipsed (18b, black): Taster of Wares
      castableWhileControlling?: boolean;
      castableFilter?: CardFilter;
      /** Only these cards of their hand are revealed (and can be chosen); the rest stay hidden. */
      among?: ObjectId[];
      // Lorwyn Eclipsed (18c, theme decks): Lightstall Inquisitor
      ownerChooses?: { tax: number; landsTapped: boolean };
      // Tarkir: Dragonstorm (19b, clans): Severance Priest
      linkToSource?: boolean;
      /** The chooser may also choose no card ("You may choose a nonland card"). */
      optional?: boolean;
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose one of these. */
      kind: 'chooseOption';
      player: PlayerId;
      /** Heading for the prompt, if not "<card>: choose one" (Learn). */
      title?: string;
      /** Caretakers: flat replay continuation for synchronous replacement choices. */
      lifeGainReplay?: import('./life-gain-replacements.ts').LifeGainReplay;
      options: { label: string; effects: EffectDef[] }[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Choose a permanent you control (or, if `optional`, none). */
      kind: 'chooseObject';
      player: PlayerId;
      options: ObjectId[];
      // Reality Fracture (17a): Tam, the Possibility (proliferate)
      /** Prompt heading, if not the usual one. */
      title?: string;
      // Final Fantasy (11a): saga creatures
      /** Choosing none is allowed (Garnet: "any number of Sagas"). */
      optional?: boolean;
      /** Lorwyn Eclipsed (18a): choosing the creature to blight: this many -1/-1 counters go on it. */
      blight?: number;
      then: EffectDef[];
      otherwise: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Pay `cost` or the spell is countered. */
      kind: 'payOrCounter';
      player: PlayerId;
      spell?: ObjectId;
      cost: ManaCost;
      /** Exiled instead of put into the graveyard when countered (Reject). */
      exile?: boolean;
      // Strixhaven (13c): Archway Commons, Wandering Archaic
      /** No spell: if the player doesn't (or can't) pay, these effects happen instead. */
      otherwise?: EffectDef[];
      resume: PausedResolution;
      thenPriority: PlayerId;
    }
  | {
      /** Cast one of these cards for free now, or not (Daring Waverider, Portent of Calamity). */
      kind: 'castFree';
      /** Runaways: normal additional costs and restrictions, with timing permission. */
      exact?: boolean;
      player: PlayerId;
      cards: ObjectId[];
      exileAfter?: boolean;
      /** Cast by discarding a card rather than paying (The Infamous Cruelclaw). */
      discardInstead?: boolean;
      /** Cards that go to hand once this is answered (Portent's other exiled cards). */
      thenToHand?: ObjectId[];
      /** Marvel Super Heroes: cards not cast go to the bottom of their owner's library. */
      thenToBottom?: ObjectId[];
      // Strixhaven (13c)
      /** The cast costs this instead of nothing (Jadzi: {1}). */
      pay?: ManaCost;
      /** The cast costs its mana cost less this much (Uvilda: {4}). */
      costLess?: number;
      // Secrets of Strixhaven (14b): Improvisation Capstone
      // Reality Fracture (17c): Chandra, Torch of Defiance
      /** The cast pays the card's costs as usual (X, kicker, alternative costs) instead of being free. */
      fullCost?: boolean;
      /** Effects that happen if none of the cards is cast, before the resolution goes on. */
      ifNotCast?: EffectDef[];
      /** Any number of these may be cast: after one is, the rest are offered again. */
      more?: boolean;
      // Reality Fracture (17a): Uldaros Theorix
      /** With `more`: the total mana value still left to cast; only cards that fit are offered. */
      budget?: number;
      /** Copies made for this: the ones not cast cease to exist once it's over. */
      copies?: ObjectId[];
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
  | {
      // Reality Fracture (17a fixes): Vein Ripper, Emrakul, the Exigent Doom
      /** Ward's sacrifices, one permanent at a time: `creatures` creatures first, then `permanents` permanents. */
      kind: 'wardSacrifice';
      player: PlayerId;
      creatures: number;
      permanents: number;
      /** A forage still to pay once the sacrifices are made. */
      forage?: ObjectId | 'graveyard';
      /** The free cast this is paid for: once it's paid, that cast is finished. */
      afterFree?: { decision: Extract<Decision, { kind: 'castFree' }>; cast: ObjectId };
      thenPriority: PlayerId;
    }
  | {
      // Lorwyn Eclipsed (18b, white): Morningtide's Light, "any number of target creatures" on a spell. The targets before the
      // `anyNumber` spec are chosen with the cast; these are picked one at a time once the spell is on the stack. Each
      // `chooseTargets` action is `picked` plus one more (keep picking), or exactly `picked` (done).
      kind: 'spellTargets';
      player: PlayerId;
      spell: ObjectId;
      picked: TargetChoice[];
      thenPriority: PlayerId;
    }
  | {
      // Tarkir: Dragonstorm (19a): Renew — {X}{B}{B}: "X target creatures". Picked one at a time once the ability is on the stack:
      // each `chooseTargets` action is `picked` plus one more; after `need` targets the ability has them all.
      kind: 'abilityTargets';
      player: PlayerId;
      /** The ability on the stack. */
      ability: ObjectId;
      picked: TargetChoice[];
      need: number;
      thenPriority: PlayerId;
    }
  | {
      // Lorwyn Eclipsed (18a): Conspire. Tap two untapped creatures that share a colour with the spell, one at a time; then the spell is copied.
      kind: 'conspire';
      player: PlayerId;
      /** The spell on the stack. */
      spell: ObjectId;
      options: ObjectId[];
      /** The first creature tapped. */
      chosen: ObjectId[];
      /** The targets the spell was cast with (ward's sacrifices come after). */
      targets: TargetChoice[];
      thenPriority: PlayerId;
    }
  | {
      // Lorwyn Eclipsed (18a): Dawnhand Dissident. Counters removed from among your creatures, one at a time (`options`: the creature
      // and the kind of counter, answered with chooseOption).
      kind: 'payCounters';
      player: PlayerId;
      spell: ObjectId;
      left: number;
      options: { creature: ObjectId; kind: string }[];
      targets: TargetChoice[];
      thenPriority: PlayerId;
    }
  | {
      // Lorwyn Eclipsed (18a): Celestial Reunion. The creature type (`types`, answered with chooseOption), then the creatures to
      // behold one at a time (`options`, answered with chooseCard). The ones in hand are revealed.
      kind: 'beholdType';
      player: PlayerId;
      /** The spell on the stack. */
      spell: ObjectId;
      /** How many creatures of the type are beheld. */
      count: number;
      /** Creature types that at least `count` creatures you could behold have. */
      types: string[];
      chosenType?: string;
      /** The creatures of the chosen type still to pick from. */
      options: ObjectId[];
      chosen: ObjectId[];
      targets: TargetChoice[];
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
  // Lorwyn Eclipsed (18b, green): a Shimmerwilds Growth has been on the battlefield (lands may be recoloured: `def` looks for the Aura).
  landColorAuras?: boolean;
  /** Lorwyn Eclipsed (18b): some object has had its colours changed (`allColorsTurn`, `colorOverride`, `colorless`); `def` checks them only then. */
  colorChanges?: boolean;
  /** Tarkir: Dragonstorm (19b, blue): an Aura has granted abilities (`auraGrants`); `def` checks them only then. */
  auraGrants?: boolean;
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
  // Final Fantasy (11c): damage doubling
  /** Lightning's Stagger: damage to `player` and their permanents is doubled until `by`'s next turn. */
  staggered?: { player: PlayerId; by: PlayerId }[];
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
  // Strixhaven Brawl (15a): Witch Enchanter, a spell // land card played as its land face.
  | { type: 'playLand'; player: PlayerId; card: ObjectId; back?: boolean }
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
      // Final Fantasy (11c): playing from the graveyard ('noctis', 'hades').
      via?:
        | 'festival'
        | 'osteomancer'
        | 'conduit'
        | 'free'
        | 'zaffai'
        // Marvel Super Heroes Jumpstart (Analyzed): Vision, Spectral Synthezoid.
        | 'freeOnceEachTurn'
        // Reality Fracture (17a): Omnipresence.
        | 'omnipresence'
        // Tarkir: Dragonstorm (19b, red): Dracogenesis.
        | 'freeMatching'
        // Reality Fracture (17c): Chandra, Torch of Defiance.
        | 'now'
        | 'freeExact'
        | 'noctis'
        | 'hades'
        // Lorwyn Eclipsed (18a): Dawnhand Dissident
        | 'exiledWithSelf';
      /** Mockingbird: the creature to enter as a copy of. */
      copyOf?: ObjectId;
      /** Rottenmouth Viper: permanents sacrificed to make it cheaper. */
      sacrificeMany?: ObjectId[];
      /** Times multikicker is paid (Batroc). */
      kickCount?: number;
      /** Reality Fracture (17c): beholding for `beholdOrPay` instead of paying (Countersculpt). */
      beheld?: boolean;
      /** Reality Fracture (17c): the permanent you control, or the card in your hand (revealed), you behold for this cast. */
      beholdCard?: ObjectId;
      /** Strixhaven Brawl (15b, u): cards exiled from the graveyard with delve. */
      delve?: number;
      // Teamwork (Marvel Super Heroes)
      /** The creatures tapped to pay teamwork (a kicked teamwork spell). Omitted: the engine picks. */
      teamwork?: ObjectId[];
      /** Mana sources to tap. Omitted: the engine picks. */
      payWith?: ObjectId[];
      // Lorwyn Eclipsed (18a)
      /** The creature you control that gets the -1/-1 counters of a blight cost. */
      blight?: ObjectId;
      /** Cast for its evoke cost. */
      evoked?: boolean;
      /** Conspire: you tap two creatures as it's cast (chosen one at a time once it's on the stack). */
      conspire?: boolean;
      /** The cards beheld for `flashbackBehold` (permanents you control, or cards in your hand, which are revealed). */
      beholdCards?: ObjectId[];
      // Tarkir: Dragonstorm (19a)
      /** Harmonize: the untapped creature you tap to reduce the cost by its power. */
      harmonizeTap?: ObjectId;
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
      /** Villainous Syndication: the creature tapped for "tap an untapped Villain". */
      tapCreature?: ObjectId;
      // Reality Fracture (17a): Tenured Tethermage
      /** The artifacts tapped for "tap two untapped artifacts you control". */
      tapArtifacts?: ObjectId[];
      payWith?: ObjectId[];
      // Marvel Super Heroes
      /** The value chosen for {X} in the ability's cost (Bruce Banner). */
      x?: number;
      // Lorwyn Eclipsed (18a)
      /** The creature you control that gets the -1/-1 counters of a blight cost. */
      blight?: ObjectId;
      /** The kinds of counters removed for `removeAnyCounters` ('-1/-1', '+1/+1', 'stun', ...), one entry for each. */
      removeKinds?: string[];
      // Lorwyn Eclipsed (18b, white): Kithkeeper
      /** The creatures tapped for `tapCreatures` ("tap three untapped creatures you control") or to crew (Lorwyn Eclipsed 18c). */
      tapCreatures?: ObjectId[];
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
  | {
      type: 'objectMoved';
      id: ObjectId;
      defId: CardDefId;
      from: ZoneName | null;
      /** Runaways: a resolving creature spell actually cast outside hand. */
      castFromNonHandBy?: PlayerId;
      to: ZoneName;
      // Final Fantasy (11b): creatures and artifacts dying
      /** Who controlled it as it left the battlefield (a token is gone by the time triggers look). */
      controller?: PlayerId;
      // Final Fantasy (11b): the back face it showed as it left (Chaos dying shows Garland after).
      leftAs?: CardDefId;
      /** Strixhaven (13c): a creature exiled instead of dying (Valentin). */
      exiledInstead?: boolean;
      /** It had lost all its abilities as it left the battlefield (Hellcat): none of its own trigger. */
      leftBlank?: boolean;
      // Final Fantasy (11c): its power as it left (a token's too): "that creature's power" (Vincent Valentine).
      lastPower?: number;
      // Lorwyn Eclipsed (18a)
      /** It died with persist and no -1/-1 counters on it: it returns with a -1/-1 counter. */
      persist?: boolean;
      /** The counters of every kind it had as it left the battlefield (a token's too). */
      lastCounterTotal?: number;
    }
  | {
      type: 'damageDealt';
      source: ObjectId;
      to: TargetChoice;
      amount: number;
      combat: boolean;
      // Lorwyn Eclipsed (18c, theme decks): damage dealt to a creature beyond lethal damage
      excess?: number;
    }
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
  // Strixhaven (13a): magecraft. A copy of a spell was put on the stack (it isn't cast); `player` controls the copy.
  | { type: 'spellCopied'; id: ObjectId; player: PlayerId }
  // Secrets of Strixhaven (14a): prepare. A permanent became prepared / stopped being prepared.
  | { type: 'prepared'; id: ObjectId; player: PlayerId }
  | { type: 'unprepared'; id: ObjectId; player: PlayerId }
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
  // The Hobbit (20a)
  /** `player` got an enduring story (a third artifact, legendary or Saga while they control a Storied permanent). */
  | { type: 'enduringStory'; player: PlayerId }
  /** `player` amassed: `id` is the Army that got the counters, which is now `subtype` too. */
  | { type: 'amassed'; player: PlayerId; id: ObjectId; subtype: string; amount: number }
  | { type: 'mulligan'; player: PlayerId; count: number }
  | { type: 'scried'; player: PlayerId; top: number; bottom: number }
  | { type: 'searched'; player: PlayerId; id: ObjectId }
  /** A card revealed from a library and put into its owner's hand. */
  | { type: 'revealed'; player: PlayerId; id: ObjectId }
  // Reality Fracture (17a fixes): Loyal Tutor
  /** `player` reveals cards (a tutor's "reveal it"); the defId is carried since the card may go to a hidden zone. */
  | { type: 'cardsRevealed'; player: PlayerId; cards: { id: ObjectId; defId: CardDefId }[] }
  /** +1/+1 counters were put on a permanent. */
  | { type: 'countersAdded'; id: ObjectId; count: number; player: PlayerId }
  // Tarkir: Dragonstorm (19b, misc): counters of any kind put on a creature
  /** Counters of any kind (+1/+1 or named) were put on a creature; `player` controls it. */
  | { type: 'anyCountersAdded'; id: ObjectId; count: number; player: PlayerId }
  // Reality Fracture (17c): loyalty counters put on a planeswalker
  /** `player` controls the planeswalker; `by` is the player who put the counters. */
  | { type: 'loyaltyCountersAdded'; id: ObjectId; count: number; player: PlayerId; by: PlayerId }
  /** `player` foraged. */
  | { type: 'foraged'; player: PlayerId }
  // Lorwyn Eclipsed (18a)
  /** `player` blighted `id`: put `amount` -1/-1 counters on it. */
  | { type: 'blighted'; player: PlayerId; id: ObjectId; amount: number }
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
  // Strixhaven Brawl (15b, w): Rooms. `door` is the door unlocked now; `fully`: both doors are unlocked now.
  | { type: 'doorUnlocked'; id: ObjectId; player: PlayerId; door: 'front' | 'back'; fully: boolean }
  | { type: 'gameOver'; winner: PlayerId | 'draw' };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
