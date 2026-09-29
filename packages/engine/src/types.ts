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
  | 'defender';

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
  /** What an instant or sorcery does when it resolves. */
  spell?: { targets: TargetSpec[]; effects: EffectDef[] };
  abilities: AbilityDef[];
  isToken?: boolean;
}

export type AbilityDef =
  | { kind: 'mana'; cost: CostDef; produces: ManaType }
  | {
      kind: 'activated';
      cost: CostDef;
      targets: TargetSpec[];
      effects: EffectDef[];
      sorcerySpeed?: boolean;
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
    }
  | { kind: 'static'; effect: StaticDef };

export interface CostDef {
  mana?: ManaCost;
  tapSelf?: boolean;
  sacrificeSelf?: boolean;
}

export type TriggerDef =
  | { on: 'etb' }
  | { on: 'otherCreatureEtb'; controller: 'you' | 'any' }
  | { on: 'dies' }
  | { on: 'attacks' }
  /** "Whenever you attack": once per combat in which you declare attackers. */
  | { on: 'youAttack' }
  | { on: 'combatDamageToPlayer' }
  | { on: 'castSpell'; filter: 'any' | 'noncreature' | 'instantOrSorcery' | 'targetsSelf' }
  | { on: 'landfall' }
  | { on: 'beginningOfUpkeep'; whose: 'yours' | 'each' }
  | { on: 'beginningOfEndStep'; whose: 'yours' | 'each' };

export type ConditionDef =
  | { kind: 'attackedThisTurn' }
  | { kind: 'controlsAnother'; subtype: string }
  | { kind: 'custom'; handler: string };

export interface CardFilter {
  maxPower?: number;
  minPower?: number;
  hasKeyword?: Keyword;
  lacksKeyword?: Keyword;
  tapped?: boolean;
  attacking?: boolean;
  subtype?: string;
  /** "another target creature": excludes the source. */
  other?: boolean;
}

export interface TargetSpec {
  what: 'any' | 'creature' | 'player';
  controller?: 'you' | 'opponent';
  filter?: CardFilter;
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
  | { each: 'creature'; controller?: 'you' | 'opponent'; filter?: CardFilter };

export type Amount =
  number | { powerOf: Ref } | { count: 'creaturesYouControl' | 'landsYouControl' };

export type EffectDef =
  | { kind: 'damage'; amount: Amount; to: Ref; from?: Ref }
  | {
      kind: 'pump';
      to: Ref;
      power: number;
      toughness: number;
      keywords?: Keyword[];
    }
  | { kind: 'counters'; to: Ref; amount: Amount }
  | { kind: 'fight'; a: Ref; b: Ref }
  | { kind: 'destroy'; what: Ref }
  | { kind: 'gainLife'; who: Ref; amount: Amount }
  | { kind: 'loseLife'; who: Ref; amount: Amount }
  | { kind: 'draw'; who: Ref; amount: Amount }
  | { kind: 'createToken'; token: CardDefId; count: Amount }
  | { kind: 'sacrifice'; what: Ref }
  | { kind: 'custom'; handler: string; params?: Record<string, unknown> };

export type StaticDef =
  | {
      kind: 'anthem';
      affects: 'otherCreaturesYouControl' | 'creaturesYouControl';
      filter?: CardFilter;
      power: number;
      toughness: number;
      keywords?: Keyword[];
    }
  | { kind: 'noLifeGain' }
  | { kind: 'cantBlock' };

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
}

export type StackItem =
  | {
      kind: 'spell';
      id: ObjectId;
      controller: PlayerId;
      targets: TargetChoice[];
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
  expires: 'endOfTurn';
}

export interface PendingTrigger {
  source: ObjectRef;
  sourceDefId: CardDefId;
  abilityIndex: number;
  controller: PlayerId;
  lkiPower?: number;
}

export type Decision =
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
  | { type: 'keepHand'; player: PlayerId }
  | { type: 'mulligan'; player: PlayerId }
  /** London mulligan: put one card on the bottom (repeated until done). */
  | { type: 'bottomCard'; player: PlayerId; card: ObjectId }
  | { type: 'passPriority'; player: PlayerId }
  | { type: 'playLand'; player: PlayerId; card: ObjectId }
  | {
      type: 'castSpell';
      player: PlayerId;
      card: ObjectId;
      targets: TargetChoice[];
      /** Mana sources to tap. Omitted: the engine picks. */
      payWith?: ObjectId[];
    }
  | {
      type: 'activateAbility';
      player: PlayerId;
      source: ObjectId;
      abilityIndex: number;
      targets: TargetChoice[];
      payWith?: ObjectId[];
    }
  | { type: 'addAttacker'; player: PlayerId; attacker: ObjectId; defender: PlayerId }
  | { type: 'removeAttacker'; player: PlayerId; attacker: ObjectId }
  | { type: 'confirmAttackers'; player: PlayerId }
  | { type: 'addBlock'; player: PlayerId; blocker: ObjectId; attacker: ObjectId }
  | { type: 'removeBlock'; player: PlayerId; blocker: ObjectId }
  | { type: 'confirmBlockers'; player: PlayerId }
  | { type: 'chooseTargets'; player: PlayerId; targets: TargetChoice[] }
  /** Discard to hand size, one card at a time. */
  | { type: 'discard'; player: PlayerId; card: ObjectId }
  | { type: 'concede'; player: PlayerId };

export type GameEvent =
  | { type: 'objectMoved'; id: ObjectId; defId: CardDefId; from: ZoneName | null; to: ZoneName }
  | { type: 'damageDealt'; source: ObjectId; to: TargetChoice; amount: number; combat: boolean }
  | { type: 'lifeChanged'; player: PlayerId; delta: number; life: number }
  | { type: 'tapped'; id: ObjectId }
  | { type: 'untapped'; id: ObjectId }
  | { type: 'spellCast'; id: ObjectId; player: PlayerId }
  | { type: 'abilityActivated'; id: ObjectId; source: ObjectId; player: PlayerId }
  | { type: 'triggerStacked'; id: ObjectId; source: ObjectId; player: PlayerId }
  | { type: 'resolved'; id: ObjectId }
  | { type: 'fizzled'; id: ObjectId }
  | { type: 'attackersDeclared'; attackers: ObjectId[] }
  | { type: 'blockersDeclared'; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: 'stepChanged'; turn: number; step: Step; activePlayer: PlayerId }
  | { type: 'cardDrawn'; player: PlayerId; id: ObjectId }
  | { type: 'shuffled'; player: PlayerId }
  | { type: 'mulligan'; player: PlayerId; count: number }
  | { type: 'gameOver'; winner: PlayerId | 'draw' };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
