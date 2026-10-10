import { characteristics, countOf } from './characteristics.ts';
import { MSH_EFFECTS } from './msh-effects.ts';
// Reality Fracture (17a): black
import { FRA_BLACK_EFFECTS } from './fra-black-effects.ts';
// Lorwyn Eclipsed (18b, black)
import { ECL_BLACK_EFFECTS, drawPrevented } from './ecl-black-effects.ts';
import { FIN_EFFECTS } from './fin-effects.ts';
import { FRA_COLORLESS_EFFECTS } from './fra-colorless-effects.ts';
import { LOREHOLD_EFFECTS } from './stx-lorehold-effects.ts';
import { SOS_14A_EFFECTS } from './sos-14a-effects.ts';
import { SOS_14B_A_EFFECTS } from './sos-14b-a-effects.ts';
import { SOS_14B_B_EFFECTS } from './sos-14b-b-effects.ts';
import { SOS_14B_C_EFFECTS } from './sos-14b-c-effects.ts';
import { BRAWL_15A_R_EFFECTS } from './brawl-15a-r-effects.ts';
import { BRAWL_15A_RW_EFFECTS } from './brawl-15a-rw-effects.ts';
import { BRAWL_15B_MULTI_EFFECTS } from './brawl-15b-multi-effects.ts';
import { SOS_14B_D_EFFECTS } from './sos-14b-d-effects.ts';
import { FRA_RED_EFFECTS } from './fra-red-effects.ts';
import { ECL_MULTI_A_EFFECTS } from './ecl-multi-a-effects.ts';
import { ECL_RED_EFFECTS } from './ecl-red-effects.ts';
import { BRAWL_15B_R_EFFECTS } from './brawl-15b-r-effects.ts';
import { BRAWL_15A_W_EFFECTS } from './brawl-15a-w-effects.ts';
import { BRAWL_15B_B_EFFECTS } from './brawl-15b-b-effects.ts';
import { ECL_18A_EFFECTS, willPersist } from './ecl-18a.ts';
import { cantBeSacrificed, TDM_19A_EFFECTS } from './tdm-19a.ts';
import { TDM_CLANS_B_EFFECTS } from './tdm-clans-b-effects.ts';
import { ECL_SPECIAL_EFFECTS } from './ecl-special-effects.ts';
import { ECL_GREEN_EFFECTS } from './ecl-green-effects.ts';
import { ECL_BLUE_EFFECTS } from './ecl-blue-effects.ts';
import { TDM_BLUE_EFFECTS } from './tdm-blue-effects.ts';
import { ECL_WHITE_EFFECTS } from './ecl-white-effects.ts';
import { BRAWL_15B_W_EFFECTS } from './brawl-15b-w-effects.ts';
import { BRAWL_15B_U_EFFECTS } from './brawl-15b-u-effects.ts';
import { BRAWL_15B_G_EFFECTS } from './brawl-15b-g-effects.ts';
import { BRAWL_15B_PAIR_EFFECTS } from './brawl-15b-pair-effects.ts';
import { ARCHIVE_16_EFFECTS } from './archive-16-effects.ts';
import { FRA_MULTI_B_EFFECTS } from './fra-multi-b-effects.ts';
import { ECL_MULTI_B_EFFECTS } from './ecl-multi-b-effects.ts';
import { STX_13C_A_EFFECTS } from './stx-13c-a-effects.ts';
import { STX_13C_B_EFFECTS } from './stx-13c-b-effects.ts';
import { STX_13C_C_EFFECTS } from './stx-13c-c-effects.ts';
import { STX_13C_D_EFFECTS } from './stx-13c-d-effects.ts';
import { FRA_WHITE_EFFECTS } from './fra-white-effects.ts';
import { FRA_PW_EFFECTS } from './fra-pw-effects.ts';
import { FRA_PW_C_EFFECTS } from './fra-pw-c-effects.ts';
import { FRA_PW_B_EFFECTS } from './fra-pw-b-effects.ts';
import { checkCondition } from './triggers.ts';
import { type EffectSource, gainLife } from './effects.ts';
import type {
  AbilityDef,
  Color,
  ManaType,
  CardDb,
  CardDefId,
  CardDefinition,
  EffectDef,
  GameEvent,
  GameObject,
  GameState,
  ObjectId,
  ObjectRef,
  PlayerId,
  ZoneName,
} from './types.ts';

export type CustomEffect = (
  ctx: Ctx,
  source: EffectSource,
  params: Record<string, unknown> | undefined,
) => void;

/**
 * Everything engine internals need. `s` is an Immer draft during applyAction
 * (mutate freely) and the plain state for read-only queries.
 */
export interface Ctx {
  s: GameState;
  db: CardDb;
  events: GameEvent[];
  /** Index into `events` up to which triggers have been collected. */
  triggerCursor: number;
  customEffects: Readonly<Record<string, CustomEffect>>;
  /** "Whenever one or more" triggers already queued in this batch of events. */
  batched: Set<string>;
  /** Reality Fracture (17c): effects an effect asks to run right after it (Empower Jace's choice); `runEffects` drains them. */
  deferred?: EffectDef[];
  /** Reality Fracture (17c): the player whose effect is running (who "puts" the counters it adds), set by `runEffect`. */
  puttingPlayer?: PlayerId;
  /** Caretakers: choices consumed while replaying a synchronous life gain. */
  lifeGainChoices?: { choices: number[]; cursor: number };
  /** Already-delivered event prefix reconstructed by a replacement replay. */
  replayedEvents?: number;
  /** Lorwyn Eclipsed (18a): creatures dying together that have persist, worked out before any of them moves (look-back). */
  persisting?: Set<ObjectId>;
}

export function makeCtx(
  s: GameState,
  db: CardDb,
  customEffects: Readonly<Record<string, CustomEffect>> = {},
): Ctx {
  return {
    s,
    db,
    events: [],
    triggerCursor: 0,
    customEffects: { ...BUILT_IN_EFFECTS, ...customEffects },
    batched: new Set(),
  };
}

/** Small one-off effects used by the engine's own effect kinds. */
const BUILT_IN_EFFECTS: Record<string, CustomEffect> = {
  ...MSH_EFFECTS,
  // Reality Fracture (17a): black.
  ...FRA_BLACK_EFFECTS,
  ...ECL_BLACK_EFFECTS, // Lorwyn Eclipsed (18b, black)
  // Reality Fracture (17a, colorless).
  ...FRA_COLORLESS_EFFECTS,
  // Final Fantasy (11a).
  ...FIN_EFFECTS,
  // Strixhaven (13a).
  ...LOREHOLD_EFFECTS,
  // Strixhaven (13c, group A).
  ...STX_13C_A_EFFECTS,
  // Strixhaven (13c), group B.
  ...STX_13C_B_EFFECTS,
  // Strixhaven (13c).
  ...STX_13C_C_EFFECTS,
  ...STX_13C_D_EFFECTS,
  // Reality Fracture (17a): white.
  ...FRA_WHITE_EFFECTS,
  ...FRA_PW_EFFECTS,
  ...FRA_PW_C_EFFECTS,
  ...FRA_PW_B_EFFECTS,
  // Secrets of Strixhaven (14a).
  ...SOS_14A_EFFECTS,
  // Secrets of Strixhaven (14b), group A.
  ...SOS_14B_A_EFFECTS,
  // Secrets of Strixhaven (14b), group B (blue).
  ...SOS_14B_B_EFFECTS,
  // Secrets of Strixhaven (14b), group C.
  ...SOS_14B_C_EFFECTS,
  // Strixhaven Brawl (15a, red).
  ...BRAWL_15A_R_EFFECTS,
  // Secrets of Strixhaven (14b, group D).
  ...SOS_14B_D_EFFECTS,
  // Reality Fracture (17a): red.
  ...FRA_RED_EFFECTS,
  ...ECL_RED_EFFECTS, // Lorwyn Eclipsed (18b, red)
  // Strixhaven Brawl (15a), white and colourless.
  ...BRAWL_15A_W_EFFECTS,
  // Strixhaven Brawl (15a): red-white.
  ...BRAWL_15A_RW_EFFECTS,
  // Strixhaven Brawl (15b, black).
  ...BRAWL_15B_B_EFFECTS,
  // Lorwyn Eclipsed (18a).
  ...ECL_18A_EFFECTS,
  ...TDM_19A_EFFECTS,
  ...TDM_CLANS_B_EFFECTS, // Tarkir: Dragonstorm (19b, clans-b)
  // Lorwyn Eclipsed (18b, special).
  ...ECL_SPECIAL_EFFECTS,
  // Lorwyn Eclipsed (18b): green.
  ...ECL_GREEN_EFFECTS,
  // Lorwyn Eclipsed (18b): multi-a.
  ...ECL_MULTI_A_EFFECTS,
  // Lorwyn Eclipsed (18b): blue.
  ...ECL_BLUE_EFFECTS,
  // Tarkir: Dragonstorm (19b): blue.
  ...TDM_BLUE_EFFECTS,
  // Lorwyn Eclipsed (18b): white.
  ...ECL_WHITE_EFFECTS,
  // Strixhaven Brawl (15b): multicolour, colourless and lands.
  ...BRAWL_15B_MULTI_EFFECTS,
  // Strixhaven Brawl (15b), white.
  ...BRAWL_15B_W_EFFECTS,
  // Strixhaven Brawl (15b), blue.
  ...BRAWL_15B_U_EFFECTS,
  // Strixhaven Brawl (15b, g): green.
  ...BRAWL_15B_G_EFFECTS,
  // Strixhaven Brawl (15b): red and blue-red.
  ...BRAWL_15B_R_EFFECTS,
  // Strixhaven Brawl (15b): two-colour cards.
  ...BRAWL_15B_PAIR_EFFECTS,
  // Mystical Archive (16).
  ...ARCHIVE_16_EFFECTS,
  // Reality Fracture (17a): multi-b.
  ...FRA_MULTI_B_EFFECTS,
  // Lorwyn Eclipsed (18b): multi-b.
  ...ECL_MULTI_B_EFFECTS,
  // Strixhaven (13a): Learn: put the chosen Lesson from outside the game into your hand.
  learnFetch(ctx, es, params) {
    const ps = ctx.s.players[es.controller];
    const defId = (params as { defId: string }).defId;
    const at = ps.sideboard?.indexOf(defId) ?? -1;
    if (at < 0) return;
    ps.sideboard!.splice(at, 1);
    const o = createObject(ctx, defId, es.controller, 'hand');
    ps.hand.push(o.id);
    emit(ctx, { type: 'objectMoved', id: o.id, defId, from: null, to: 'hand' });
  },
  // "As this enters, choose a color/creature type" (or, for a spell, as it resolves: Raise the Palisade).
  setChosen(ctx, es, params) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || (o.zone !== 'battlefield' && o.zone !== 'stack')) return;
    const p = params as { color?: ManaType; type?: string };
    if (p.color) o.chosenColor = p.color;
    if (p.type) o.chosenType = p.type;
  },
  // Metallic Mimic: "This creature is the chosen type in addition to its other types."
  addChosenSubtype(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'battlefield' || !o.chosenType) return;
    o.addedSubtypes = [...(o.addedSubtypes ?? []), o.chosenType];
  },
};

export function other(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export function obj(ctx: Ctx, id: ObjectId): GameObject {
  const o = ctx.s.objects[id];
  if (!o) throw new Error(`Unknown object ${id}`);
  return o;
}

export function defOf(ctx: Ctx, defId: string): CardDefinition {
  const d = ctx.db.get(defId);
  if (!d) throw new Error(`Unknown card definition ${defId}`);
  return d;
}

const ALL_COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

export function def(ctx: Ctx, id: ObjectId): CardDefinition {
  const d = defBase(ctx, id);
  // Lorwyn Eclipsed (18b, multi-b): Tam, Mindful First-Year, "becomes all colors until end of turn".
  const o = ctx.s.objects[id];
  if (o?.allColorsTurn === ctx.s.turn.number && o.zone === 'battlefield')
    return { ...d, colors: ALL_COLORS };
  return d;
}

function defBase(ctx: Ctx, id: ObjectId): CardDefinition {
  const o = obj(ctx, id);
  const printed = defOf(ctx, o.defId);
  // Iron Man: a nonlegendary copy is nonlegendary for every rule, not just the legend rule.
  const legal = o.nonlegendary
    ? { ...printed, supertypes: printed.supertypes.filter((t) => t !== 'Legendary') }
    : printed;
  // Lorwyn Eclipsed (18b, special): "becomes the chosen color" (Puca's Eye), "becomes that color until end of turn" (Foraging Wickermaw).
  const d0 =
    o.colorOverride && (o.colorOverride.untilTurn ?? Infinity) >= ctx.s.turn.number
      ? { ...legal, colors: o.colorOverride.colors }
      : legal;
  // Lorwyn Eclipsed (18b, blue): Noggle the Mind, "loses all colors".
  const d = o.colorless ? colorlessDef(d0) : d0;
  if (o.foodBy !== undefined) {
    const aura = ctx.s.objects[o.foodBy];
    if (aura && aura.zone === 'battlefield' && aura.attachedTo === id) return foodDef(d);
  }
  if (o.blank) return blankDef(d);
  // Lorwyn Eclipsed (18b, green): Shimmerwilds Growth, "enchanted land is the chosen color".
  if (ctx.s.landColorAuras && o.zone === 'battlefield' && d.types.includes('Land')) {
    for (const auraId of ctx.s.battlefield) {
      const aura = ctx.s.objects[auraId];
      if (
        aura?.attachedTo === id &&
        aura.chosenColor &&
        aura.chosenColor !== 'C' &&
        defOf(ctx, aura.defId).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'landIsChosenColor',
        )
      )
        return withExtraAbilities(ctx, o, { ...d, colors: [aura.chosenColor] });
    }
  }
  // Final Fantasy (11c): a land with a blight counter (Ultima, Origin of Oblivion).
  if (o.counters?.blight && o.zone === 'battlefield' && d.types.includes('Land'))
    return blightDef(d);
  // Marvel Super Heroes Jumpstart (Young Avengers): a copy that keeps some of its own abilities.
  if (o.copyKeptAbilities && o.originalDefId)
    return keptAbilitiesDef(d, defOf(ctx, o.originalDefId), o.copyKeptAbilities);
  // Ygra: other creatures are Food artifacts with the Food ability.
  if (
    ctx.s.creaturesAreFood &&
    o.zone === 'battlefield' &&
    d.types.includes('Creature') &&
    !makesFood(d)
  )
    return foodCreatureDef(d);
  // Strixhaven (13c): Kasmina, Enigma Sage shares her loyalty abilities.
  if (o.zone === 'battlefield' && d.types.includes('Planeswalker')) {
    // Reality Fracture (17c): "Planeswalkers you control have ...".
    const shared = [...sharedLoyaltyAbilities(ctx, id, d), ...grantedToPlaneswalker(ctx, id)];
    if (shared.length)
      return withExtraAbilities(ctx, o, { ...d, abilities: [...d.abilities, ...shared] });
  }
  // Strixhaven (13a): Lorehold Apprentice grants abilities until end of turn.
  return withExtraAbilities(ctx, o, d);
}

/** `d` plus the abilities the object was given for a while (until end of turn, perpetually, until it's cast). */
function withExtraAbilities(ctx: Ctx, o: GameObject, d: CardDefinition): CardDefinition {
  // Tarkir: Dragonstorm (19b, blue): abilities an attached Aura gives ("Enchanted creature has ...").
  if (o.auraGrants?.length && o.zone === 'battlefield') {
    const given = o.auraGrants.flatMap((auraId) => {
      const aura = ctx.s.objects[auraId];
      if (!aura || aura.zone !== 'battlefield' || aura.attachedTo !== o.id) return [];
      return (ctx.db.get(aura.defId)?.abilities ?? []).flatMap((a) =>
        a.kind === 'static' && a.effect.kind === 'attached' ? (a.effect.grantAbilities ?? []) : [],
      );
    });
    if (given.length) d = { ...d, abilities: [...d.abilities, ...given] };
  }
  if (o.tempAbilities?.length || o.perpetualAbilities?.length || o.abilitiesUntilCast?.length)
    return {
      ...d,
      abilities: [
        ...d.abilities,
        ...(o.tempAbilities ?? []),
        ...(o.perpetualAbilities ?? []),
        // Reality Fracture (17a): Emrakul, the Exigent Doom: a land's mana ability until the card is cast.
        ...(o.abilitiesUntilCast ?? []).map((x) => x.ability),
      ],
    };
  return d;
}

/**
 * Reality Fracture (17c): the abilities its controller's "Planeswalkers you control have ..." permanents give a planeswalker.
 * Read from the sources' own definitions (a planeswalker's printed ones), so granting never recurses.
 */
function grantedToPlaneswalker(ctx: Ctx, id: ObjectId): AbilityDef[] {
  const o = ctx.s.objects[id]!;
  const out: AbilityDef[] = [];
  for (const srcId of ctx.s.battlefield) {
    const src = ctx.s.objects[srcId];
    if (!src || src.controller !== o.controller) continue;
    const sd = ctx.db.get(src.defId);
    if (!sd) continue;
    // A planeswalker's own abilities come from the printed card; anything else may be blanked or copied.
    const abilities = sd.types.includes('Planeswalker') ? sd.abilities : def(ctx, srcId).abilities;
    for (const a of abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'planeswalkersHave') continue;
      out.push(a.effect.ability);
    }
  }
  return out;
}

/** Strixhaven (13c): the loyalty abilities of each Kasmina its controller has, for another planeswalker. */
function sharedLoyaltyAbilities(ctx: Ctx, id: ObjectId, d: CardDefinition): AbilityDef[] {
  const shares = (x: CardDefinition) =>
    x.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'sharesLoyaltyAbilities');
  if (shares(d)) return [];
  const o = ctx.s.objects[id]!;
  const out: AbilityDef[] = [];
  for (const srcId of ctx.s.battlefield) {
    const src = ctx.s.objects[srcId];
    if (!src || srcId === id || src.controller !== o.controller) continue;
    const sd = ctx.db.get(src.defId);
    if (!sd || !shares(sd)) continue;
    for (const a of sd.abilities)
      if (a.kind === 'activated' && a.cost.loyalty !== undefined) out.push(a);
  }
  return out;
}

// Marvel Super Heroes Jumpstart (Young Avengers)

const keptAbilitiesDefs = new WeakMap<CardDefinition, WeakMap<CardDefinition, CardDefinition>>();

/**
 * A copy that keeps its own name and some of its own abilities (Hulkling, Young Avenger: "except
 * his name is Hulkling, ... and he has this ability"). The kept abilities come after the copied
 * ones, so the copied abilities keep their indices; triggers map the kept ones back (queue).
 */
function keptAbilitiesDef(d: CardDefinition, own: CardDefinition, kept: number[]): CardDefinition {
  let byOwn = keptAbilitiesDefs.get(d);
  if (!byOwn) keptAbilitiesDefs.set(d, (byOwn = new WeakMap()));
  let f = byOwn.get(own);
  if (!f) {
    f = {
      ...d,
      name: own.name,
      abilities: [...d.abilities, ...kept.flatMap((i) => own.abilities[i] ?? [])],
    };
    byOwn.set(own, f);
  }
  return f;
}

/** Recomputes whether a Ygra is on the battlefield (after setting up a position directly). */
export function refreshCreaturesAreFood(ctx: Ctx): void {
  ctx.s.creaturesAreFood = ctx.s.battlefield.some((b) =>
    makesFood(defOf(ctx, ctx.s.objects[b]!.defId)),
  );
}

const makesFood = (d: CardDefinition) =>
  d.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'creaturesAreFood');

const foodCreatureDefs = new WeakMap<CardDefinition, CardDefinition>();

/** A creature that's also a Food artifact (Ygra). */
function foodCreatureDef(d: CardDefinition): CardDefinition {
  let f = foodCreatureDefs.get(d);
  if (!f) {
    f = {
      ...d,
      types: d.types.includes('Artifact') ? d.types : [...d.types, 'Artifact'],
      subtypes: [...d.subtypes, 'Food'],
      abilities: [...d.abilities, ...foodDef(d).abilities],
    };
    foodCreatureDefs.set(d, f);
  }
  return f;
}

const foodDefs = new WeakMap<CardDefinition, CardDefinition>();

/** What Sugar Coat makes a permanent: a colorless Food artifact with only the Food ability. */
function foodDef(d: CardDefinition): CardDefinition {
  let f = foodDefs.get(d);
  if (!f) {
    const { power: _p, toughness: _t, ...rest } = d;
    f = {
      ...rest,
      colors: [],
      types: ['Artifact'],
      supertypes: [],
      subtypes: ['Food'],
      keywords: [],
      abilities: [
        {
          kind: 'activated',
          cost: { mana: { generic: 2, colored: {} }, tapSelf: true, sacrificeSelf: true },
          targets: [],
          effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
        },
      ],
    };
    foodDefs.set(d, f);
  }
  return f;
}

const colorlessDefs = new WeakMap<CardDefinition, CardDefinition>();

/** Lorwyn Eclipsed (18b, blue): a definition with no colors (Noggle the Mind). */
function colorlessDef(d: CardDefinition): CardDefinition {
  if (d.colors.length === 0) return d;
  let c = colorlessDefs.get(d);
  if (!c) {
    c = { ...d, colors: [] };
    colorlessDefs.set(d, c);
  }
  return c;
}

const blankDefs = new WeakMap<CardDefinition, CardDefinition>();

/** A definition with no abilities: what a permanent that "loses all abilities" has. */
function blankDef(d: CardDefinition): CardDefinition {
  let b = blankDefs.get(d);
  if (!b) {
    b = { ...d, abilities: [], keywords: [] };
    blankDefs.set(d, b);
  }
  return b;
}

const blightDefs = new WeakMap<CardDefinition, CardDefinition>();

/**
 * Final Fantasy (11c): "it loses all land types and abilities and has
 * '{T}: Add {C}.'" (a land's subtypes are all land types).
 */
function blightDef(d: CardDefinition): CardDefinition {
  let b = blightDefs.get(d);
  if (!b) {
    b = {
      ...d,
      subtypes: [],
      keywords: [],
      abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'C' }],
    };
    blightDefs.set(d, b);
  }
  return b;
}

/** Final Fantasy (11c): The Darkness Crystal that exiles this dying creature instead, if any. */
function darknessCrystalFor(ctx: Ctx, o: GameObject): GameObject | undefined {
  if (o.isToken || !defOf(ctx, o.defId).types.includes('Creature')) return undefined;
  for (const id of ctx.s.battlefield) {
    const src = ctx.s.objects[id]!;
    if (src.controller === o.controller) continue;
    if (
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'exileOpponentNontokenCreatures',
      )
    )
      return src;
  }
  return undefined;
}

export function refOf(o: GameObject): ObjectRef {
  return { id: o.id, zcc: o.zcc };
}

/** The object behind a ref, if it hasn't changed zones since the ref was taken. */
export function deref(ctx: Ctx, ref: ObjectRef): GameObject | undefined {
  const o = ctx.s.objects[ref.id];
  return o && o.zcc === ref.zcc ? o : undefined;
}

/** Reality Fracture (17c): a planeswalker token (or a token copy of one) enters with its starting loyalty. */
export function enterWithLoyalty(ctx: Ctx, id: ObjectId): void {
  const loyalty = defOf(ctx, obj(ctx, id).defId).loyalty;
  if (loyalty !== undefined && obj(ctx, id).counters?.loyalty === undefined)
    (obj(ctx, id).counters ??= {}).loyalty = loyalty;
}

export function onBattlefield(ctx: Ctx, ref: ObjectRef): GameObject | undefined {
  const o = deref(ctx, ref);
  return o && o.zone === 'battlefield' ? o : undefined;
}

export function emit(ctx: Ctx, ev: GameEvent): void {
  ctx.events.push(ev);
}

export function newId(ctx: Ctx): ObjectId {
  return `o${ctx.s.nextObjectId++}`;
}

export function newTimestamp(ctx: Ctx): number {
  return ctx.s.nextTimestamp++;
}

export function createObject(
  ctx: Ctx,
  defId: string,
  owner: PlayerId,
  zone: ZoneName,
  isToken = false,
): GameObject {
  const o: GameObject = {
    id: newId(ctx),
    defId,
    owner,
    controller: owner,
    zone,
    zcc: 0,
    timestamp: newTimestamp(ctx),
    tapped: false,
    summoningSick: true,
    damage: 0,
    damagedByDeathtouch: false,
    plusOneCounters: 0,
    isToken,
  };
  ctx.s.objects[o.id] = o;
  return o;
}

function zoneList(ctx: Ctx, o: GameObject, zone: ZoneName): ObjectId[] | null {
  switch (zone) {
    case 'battlefield':
      return ctx.s.battlefield;
    case 'stack':
      return null; // the stack holds StackItems, managed by stack.ts
    default:
      return ctx.s.players[o.owner][zone];
  }
}

export interface MoveOptions {
  /** Runaways: provenance of the resolving spell, never retained through blinking. */
  castFromNonHandBy?: PlayerId;
  /** Library position; default top. */
  // 'second': second from the top (Trickster's Stratagem, Marvel Super Heroes).
  position?: 'top' | 'bottom' | 'second';
  controller?: PlayerId;
  // Final Fantasy (11a): saga creatures
  /** Onto the battlefield showing its back face ("return it transformed"). */
  transformed?: boolean;
  // Final Fantasy (11c): meld
  /** Onto the battlefield as this melded card, made of it and `meldedWith` (Ragnarok). */
  meldInto?: CardDefId;
  meldedWith?: ObjectId;
}

/**
 * Secrets of Strixhaven (14a): prepare. A creature with a prepare spell becomes prepared: its controller
 * gets a copy of that spell in exile, castable while it stays prepared. Returns false if it can't.
 */
export function prepareObject(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield' || o.prepared !== undefined) return false;
  const d = defOf(ctx, o.defId);
  if (!d.prepare || !d.back) return false;
  const copy = createObject(ctx, d.back, o.controller, 'exile');
  copy.spellCopyCard = true;
  copy.preparedBy = id;
  ctx.s.players[o.controller].exile.push(copy.id);
  o.prepared = copy.id;
  emit(ctx, { type: 'prepared', id, player: o.controller });
  return true;
}

/** The permanent stops being prepared; its copy ceases to exist (unless it is being cast). */
export function unprepareObject(ctx: Ctx, id: ObjectId): void {
  const o = ctx.s.objects[id];
  if (!o || o.prepared === undefined) return;
  const copy = ctx.s.objects[o.prepared];
  delete o.prepared;
  if (copy && copy.zone === 'exile') {
    const list = ctx.s.players[copy.owner].exile;
    const i = list.indexOf(copy.id);
    if (i >= 0) list.splice(i, 1);
    delete ctx.s.objects[copy.id];
  }
  emit(ctx, { type: 'unprepared', id, player: o.controller });
}

/** Reality Fracture (17a): a copy of a card that was made in exile and not cast ceases to exist. */
export function ceaseSpellCopy(ctx: Ctx, id: ObjectId): void {
  const copy = ctx.s.objects[id];
  if (!copy || copy.zone !== 'exile' || !copy.spellCopyCard) return;
  const list = ctx.s.players[copy.owner].exile;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  delete ctx.s.objects[id];
}

/**
 * Moves an object between zones. The object keeps its id but becomes a new
 * object for rules purposes: zcc is bumped and per-zone status is reset.
 */
export function moveObject(ctx: Ctx, id: ObjectId, to: ZoneName, opts: MoveOptions = {}): void {
  const o = obj(ctx, id);
  const from = o.zone;
  // "If it would die this turn, exile it instead."
  if (
    from === 'battlefield' &&
    to === 'graveyard' &&
    (o.counters?.finality ||
      ctx.s.effects.some((e) => e.exileIfDies && e.affected.id === id && e.affected.zcc === o.zcc))
  )
    to = 'exile';
  let exiledInstead = false;
  if (from === 'battlefield' && to === 'graveyard' && exiledInsteadOfDying(ctx, o)) {
    to = 'exile';
    exiledInstead = true; // Strixhaven (13c): Valentin
  }
  // Final Fantasy (11c): The Darkness Crystal exiles it instead (and its controller gains life).
  const crystal =
    from === 'battlefield' && to === 'graveyard' ? darknessCrystalFor(ctx, o) : undefined;
  if (crystal) to = 'exile';
  // Strixhaven Brawl (15a): Luminous Phantom (as its back face), "if it would be put into a graveyard from anywhere, exile it instead".
  if (to === 'graveyard' && defOf(ctx, o.defId).exileInsteadOfGraveyard) to = 'exile';
  // Strixhaven (13c): Radiant Scrollwielder, "if a spell cast this way would be put into your graveyard, exile it instead".
  if (o.exileInstead) {
    if (from === 'stack') {
      if (to === 'graveyard') to = 'exile';
      delete o.exileInstead;
    } else if (to !== 'stack') delete o.exileInstead;
  }
  // Festival of Embers: "If a card or token would be put into your graveyard from anywhere, exile it instead."
  if (to === 'graveyard' && graveyardExiles(ctx, o.owner)) to = 'exile';
  if (from === 'battlefield' && to === 'exile' && def(ctx, id).types.includes('Creature'))
    (ctx.s.turn.creaturesExiled ??= { p1: 0, p2: 0 })[o.controller]++;
  // Equipment and Auras attached to it are dealt with by state-based actions.
  const returning = from === 'battlefield' ? o.exiledUntilLeaves : undefined;
  // Strixhaven (13c): Hofri Ghostforge's token: "When this token leaves the battlefield, return the exiled card to its owner's graveyard."
  if (from === 'battlefield' && o.hofriExiled) {
    const ref = o.hofriExiled;
    delete o.hofriExiled;
    const x = ctx.s.objects[ref.id];
    if (x && x.zone === 'exile' && x.zcc === ref.zcc) moveObject(ctx, x.id, 'graveyard');
  }
  // Lorwyn Eclipsed (18a): the counters of every kind it has as it leaves (Shadow Urchin).
  const countersLeaving =
    from === 'battlefield'
      ? o.plusOneCounters + Object.values(o.counters ?? {}).reduce((a, b) => a + b, 0)
      : 0;
  // Lorwyn Eclipsed (18a): persist looks back at the battlefield as the creature dies.
  const persists =
    from === 'battlefield' && to === 'graveyard' && (ctx.persisting?.has(id) || willPersist(ctx, id));
  // Strixhaven Brawl (15b, pair): revolt.
  if (from === 'battlefield') (ctx.s.turn.permanentsLeft ??= { p1: 0, p2: 0 })[o.controller]++;
  if (from === 'battlefield') {
    const c = characteristics(ctx, id);
    o.lastPower = c.power;
    o.lastSubtypes = [...c.subtypes];
    o.lastCounters = o.plusOneCounters;
    if (to === 'graveyard' && c.types.includes('Creature')) {
      ctx.s.turn.creaturesDied++;
      (ctx.s.turn.creaturesLost ??= { p1: 0, p2: 0 })[o.controller]++;
    }
    if (o.addedSubtypes) o.lastAddedSubtypes = o.addedSubtypes;
    else delete o.lastAddedSubtypes;
    delete o.addedSubtypes;
    delete o.creatureTypes;
    delete o.creatureTypesTimestamp;
    // Strixhaven Brawl (15a): Enduring Courage: "if it was a creature".
    if (o.notCreature) o.lastNotCreature = true;
    else delete o.lastNotCreature;
    delete o.notCreature;
    const host = o.attachedTo !== undefined ? ctx.s.objects[o.attachedTo] : undefined;
    if (host)
      o.lastAttachedTo = {
        id: host.id,
        zcc: host.zone === 'battlefield' ? host.zcc : host.zcc - 1,
      };
    else delete o.lastAttachedTo;
  }
  // Secrets of Strixhaven (14a): a prepared permanent that leaves takes its copy with it; converge's colours go too.
  if (from === 'battlefield') unprepareObject(ctx, id);
  if (to !== 'stack' && !(from === 'stack' && to === 'battlefield')) {
    delete o.manaColors;
    // Lorwyn Eclipsed (18a): the colours spent, evoke and the card exiled by "behold … and exile it" stay while it's on the stack and battlefield.
    delete o.manaPaid;
    delete o.evoked;
    if (o.beholdExiled) {
      if (from === 'battlefield') o.lastBeholdExiled = o.beholdExiled;
      delete o.beholdExiled;
    }
  }
  delete o.attachedTo;
  delete o.usedAbilities;
  delete o.dealtCombatDamage; // Reality Fracture (17a): Ruric Thar
  delete o.dealtDamage; // Tarkir: Dragonstorm (19b, clans-b): Karakyk Guardian
  delete o.exiledUntilLeaves;
  delete o.kicked;
  delete o.wasCast; // Reality Fracture (17a)
  delete o.cantBeCountered; // Reality Fracture (17c): Theorist's Proxy
  delete o.dreamExile; // Lorwyn Eclipsed (18b, red): Goliath Daydreamer
  if (from === 'battlefield') {
    if (o.counters) o.lastNamedCounters = o.counters;
    else delete o.lastNamedCounters;
  }
  delete o.counters;
  delete o.level;
  delete o.chosenColor;
  if (from === 'battlefield' && o.chosenType) o.lastChosenType = o.chosenType; // Lorwyn Eclipsed (18b, special)
  else delete o.lastChosenType;
  delete o.chosenType;
  delete o.colorOverride; // Lorwyn Eclipsed (18b, special)
  delete o.exiledWith;
  delete o.foodBy;
  delete o.auraGrants; // Tarkir: Dragonstorm (19b, blue)
  delete o.controlledBy;
  delete o.xPaid;
  delete o.abilitiesUntilCast; // Reality Fracture (17a): Emrakul, the Exigent Doom
  delete o.grantedKeywords;
  // Mockingbird turns back into itself.
  if (o.originalDefId) {
    o.defId = o.originalDefId;
    delete o.originalDefId;
    delete o.copyPT;
    delete o.copyUntilTurnOf;
    delete o.copyWhileSource;
    delete o.copyAsCreature;
    delete o.copyAddedSubtypes;
    // Marvel Super Heroes Jumpstart (Tricksters).
    delete o.copyKeepsName;
    // Marvel Super Heroes Jumpstart (Young Avengers).
    delete o.copyKeptAbilities;
  }
  // Marvel Super Heroes (Secret Invasion): a copy lasting while this stays ends as it leaves.
  if (from === 'battlefield')
    for (const other of ctx.s.battlefield) {
      const c = ctx.s.objects[other]!;
      if (c.copyWhileSource === id && c.originalDefId) {
        c.defId = c.originalDefId;
        delete c.originalDefId;
        delete c.copyPT;
        delete c.copyWhileSource;
      }
    }
  // A stolen card's permission ends when it leaves exile.
  if (from === 'exile') {
    delete o.castableBy;
    delete o.castableIf; // Reality Fracture (17a)
    delete o.castableWhileControlling; // Lorwyn Eclipsed (18b, black)
    delete o.castableUntilTurn;
    delete o.anyMana;
    // Marvel Super Heroes Jumpstart (Analyzed): Victor Mancha's permission ends too.
    delete o.playableWhileControlling;
  }
  // Secrets of Strixhaven (14b): Ennis, "if one or more cards were put into exile this turn".
  if (to === 'exile' && from !== 'exile' && !o.isToken)
    ctx.s.turn.exiledCards = (ctx.s.turn.exiledCards ?? 0) + 1;
  // Bonecache Overseer: cards leaving a graveyard.
  if (from === 'graveyard') (ctx.s.turn.leftGraveyard ??= { p1: 0, p2: 0 })[o.owner]++;
  // Reality Fracture (17a): Cruel Calculations, cards put into a graveyard from a library this turn.
  if (from === 'library' && to === 'graveyard') (ctx.s.turn.milled ??= { p1: 0, p2: 0 })[o.owner]++;
  // From hand to graveyard is a discard (mayhem, "whenever you discard").
  const discarded = from === 'hand' && to === 'graveyard';
  delete o.targetedByControllerTurn;
  delete o.firstTappedTurn;
  delete o.monstrous;
  delete o.usedModes;
  delete o.discardedTurn;
  if (from === 'stack') delete o.convokedBy;
  delete o.kickCount;
  if (from === 'exile') {
    // Reality Fracture (17a): Emrakul, the Exigent Doom.
    delete o.castableWhileExiled;
    delete o.exileCastTax; // Lorwyn Eclipsed (18c)
    delete o.exilePlayTapped;
    delete o.suspended;
    delete o.playFreeBy;
    delete o.plottedTurn; // Strixhaven Brawl (15b): plot
  }
  // Cast through suspend: haste as it enters.
  if (to === 'battlefield' && o.hasteOnEntry) {
    delete o.hasteOnEntry;
    o.grantedKeywords = ['haste'];
  }
  if (from === 'exile') delete o.jailedBy;
  // Damage sources are remembered as it dies (Hawkeye), forgotten as it enters.
  if (to === 'battlefield') delete o.damagedBy;
  // Hellcat: it had no abilities as it left, so none of its own trigger.
  const leftBlank = from === 'battlefield' && !!o.blank;
  delete o.blank;
  delete o.allColorsTurn; // Lorwyn Eclipsed (18b, multi-b)
  delete o.exiledWithThisTurn;
  delete o.colorless; // Lorwyn Eclipsed (18b, blue)
  delete o.resolutions;
  const src = zoneList(ctx, o, from);
  if (src) {
    const i = src.indexOf(id);
    if (i >= 0) src.splice(i, 1);
  }
  // Marvel Super Heroes: effects lasting "for as long as" it stays end as it leaves.
  if (from === 'battlefield' && ctx.s.effects.some((e) => e.whileSourceId === id)) {
    for (const e of ctx.s.effects) {
      const a = e.whileSourceId === id ? ctx.s.objects[e.affected.id] : undefined;
      if (a && e.previousController && a.zcc === e.affected.zcc)
        a.controller = e.previousController;
    }
    const ended = ctx.s.effects.filter((e) => e.whileSourceId === id);
    ctx.s.effects = ctx.s.effects.filter((e) => e.whileSourceId !== id);
    // Quantum Reduction: the creature gets its abilities back (unless something else still blanks it).
    for (const e of ended) {
      const a = ctx.s.objects[e.affected.id];
      if (e.loseAbilities && a && a.zcc === e.affected.zcc)
        a.blank = ctx.s.effects.some(
          (x) => x.loseAbilities && x.affected.id === a.id && x.affected.zcc === a.zcc,
        );
      // Lorwyn Eclipsed (18b, blue): Noggle the Mind
      if (e.colorless && a && a.zcc === e.affected.zcc)
        a.colorless = ctx.s.effects.some(
          (x) => x.colorless && x.affected.id === a.id && x.affected.zcc === a.zcc,
        );
    }
  }
  // Marvel Super Heroes (Ares): whether it was attacking as it left.
  if (from === 'battlefield' && ctx.s.combat?.attackers.some((a) => a.id === id))
    o.leftAttacking = true;
  else delete o.leftAttacking;
  if (from === 'battlefield') removeFromCombat(ctx, id);
  // A double-faced card shows its front again anywhere but the stack and the battlefield.
  const leftAs = from === 'battlefield' && o.front ? o.defId : undefined;
  if (o.front && to !== 'stack' && !(from === 'stack' && to === 'battlefield')) {
    o.defId = o.front;
    delete o.front;
  }

  // Final Fantasy (11b): creatures and artifacts dying ("you control" looks back).
  const leftController = from === 'battlefield' ? o.controller : undefined;
  o.zone = to;
  o.zcc++;
  o.zoneTurn = ctx.s.turn.number;
  o.timestamp = newTimestamp(ctx);
  o.tapped = false;
  o.damage = 0;
  o.damagedByDeathtouch = false;
  o.plusOneCounters = 0;
  o.summoningSick = true;
  o.controller = to === 'battlefield' || to === 'stack' ? (opts.controller ?? o.owner) : o.owner;
  // Final Fantasy (11a): saga creatures and adventure lands.
  if (to === 'battlefield' && opts.transformed) {
    const back = defOf(ctx, o.defId).back;
    if (back) {
      o.front = o.defId;
      o.defId = back;
    }
  }
  if (from === 'exile') delete o.onAdventure;
  // Final Fantasy (11c): meld. The melded card shows the result; its other half waits in exile.
  const meldPartner = from === 'battlefield' ? o.meldedWith : undefined;
  delete o.meldedWith;
  delete o.equipDiscount;
  // Wiccan, Young Avenger: set again by whatever exiles it next.
  delete o.playableBeforeEndStep;
  if (to === 'battlefield' && opts.meldInto) {
    o.front = o.defId;
    o.defId = opts.meldInto;
    if (opts.meldedWith) o.meldedWith = opts.meldedWith;
  }
  delete o.loreRemovedTurn;
  if (o.bonusCounters && to !== 'stack') {
    if (to === 'battlefield') o.plusOneCounters += o.bonusCounters;
    delete o.bonusCounters;
  }
  // Reality Fracture (17a): a planeswalker put onto the battlefield, cast or not, enters with its loyalty counters
  // (Entrust the Spark, Liliana the Repentant, Return to the Light Realms).
  const startingLoyalty = defOf(ctx, o.defId).loyalty;
  if (
    to === 'battlefield' &&
    startingLoyalty !== undefined &&
    !ctx.s.objects[id]!.counters?.loyalty
  )
    (ctx.s.objects[id]!.counters ??= {}).loyalty = startingLoyalty;
  if (to === 'battlefield' && defOf(ctx, o.defId).entersTapped) o.tapped = true;
  const tappedIf = to === 'battlefield' ? defOf(ctx, o.defId).entersTappedIf : undefined;
  // Eddymurk Crab: "enters tapped if it's not your turn"; check lands and the like.
  if (tappedIf && checkCondition(ctx, tappedIf, o.controller, o)) o.tapped = true;
  // Final Fantasy (11b): The Wandering Minstrel: "Lands you control enter untapped."
  if (
    o.tapped &&
    to === 'battlefield' &&
    defOf(ctx, o.defId).types.includes('Land') &&
    ctx.s.battlefield.some(
      (b) =>
        b !== o.id &&
        ctx.s.objects[b]!.controller === o.controller &&
        def(ctx, b).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'landsEnterUntapped',
        ),
    )
  )
    o.tapped = false;
  // Final Fantasy Commander (12d): Authority of the Consuls.
  if (
    to === 'battlefield' &&
    defOf(ctx, o.defId).types.includes('Creature') &&
    ctx.s.battlefield.some(
      (b) =>
        b !== id &&
        ctx.s.objects[b]!.controller !== o.controller &&
        def(ctx, b).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'opponentCreaturesEnterTapped',
        ),
    )
  )
    o.tapped = true;

  // Tokens cease to exist once they leave the battlefield (rule 111.7).
  // A copy of a card cast from exile (prepare, paradigm) ceases to exist once it leaves the stack (14a).
  const ceases = (o.isToken && to !== 'battlefield') || (o.spellCopyCard && to !== 'stack');
  const dst = ceases ? null : zoneList(ctx, o, to);
  if (dst) {
    if (to === 'library' && opts.position === 'second') dst.splice(1, 0, id);
    else if (to === 'library' && opts.position !== 'bottom') dst.unshift(id);
    else dst.push(id);
  }
  // Secrets of Strixhaven (14a): "This creature enters prepared."
  if (to === 'battlefield' && defOf(ctx, o.defId).entersPrepared) prepareObject(ctx, id);
  // Marvel Super Heroes Jumpstart (Tenacious/Rampaging): Voracious Brood, however it enters.
  const countersAmount =
    to === 'battlefield' ? defOf(ctx, o.defId).entersWithCountersAmount : undefined;
  if (countersAmount) addCounters(ctx, id, countOf(ctx, o.controller, countersAmount, false, id));
  // Reality Fracture (17a): Graft Surgeon, Generous Revival: a permanent put onto the battlefield without being cast
  // still enters with its own counters (a spell resolving does this in stack.ts).
  if (to === 'battlefield' && from !== 'stack') {
    const ed = defOf(ctx, o.defId);
    if (ed.entersWithCounters && checkCondition(ctx, ed.entersWithCountersIf, o.controller, o))
      addCounters(ctx, id, ed.entersWithCounters);
    for (const [k, v] of Object.entries(ed.entersWithNamedCounters ?? {}))
      (o.counters ??= {})[k] = (o.counters[k] ?? 0) + v;
  }
  // Ygra entering or leaving changes what the other creatures are.
  if ((from === 'battlefield' || to === 'battlefield') && makesFood(defOf(ctx, o.defId)))
    refreshCreaturesAreFood(ctx);
  emit(ctx, {
    type: 'objectMoved',
    id,
    defId: o.defId,
    from,
    to,
    ...(opts.castFromNonHandBy ? { castFromNonHandBy: opts.castFromNonHandBy } : {}),
    ...(leftAs ? { leftAs } : {}),
    ...(leftBlank ? { leftBlank } : {}),
    // Final Fantasy (11c): "that creature's power" (Vincent Valentine).
    ...(from === 'battlefield' && o.lastPower !== undefined ? { lastPower: o.lastPower } : {}),
    ...(leftController ? { controller: leftController } : {}),
    ...(exiledInstead ? { exiledInstead: true } : {}),
    ...(persists ? { persist: true } : {}),
    ...(from === 'battlefield' ? { lastCounterTotal: countersLeaving } : {}),
  });
  if (discarded && o.zone === 'graveyard') {
    o.discardedTurn = ctx.s.turn.number;
    (ctx.s.turn.discards ??= { p1: 0, p2: 0 })[o.owner]++;
    emit(ctx, { type: 'discarded', id, player: o.owner });
  }

  if (crystal && o.zone === 'exile') {
    crystal.exiledWith = [...(crystal.exiledWith ?? []), id];
    for (const a of def(ctx, crystal.id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'exileOpponentNontokenCreatures')
        gainLife(ctx, crystal.controller, a.effect.life);
  }
  if (ceases) delete ctx.s.objects[id];
  // Final Fantasy (11c): meld. The other half goes where the melded permanent went.
  const partner = meldPartner ? ctx.s.objects[meldPartner] : undefined;
  if (partner && partner.zone === 'exile' && o.zone !== 'exile')
    moveObject(ctx, partner.id, o.zone, {
      ...(opts.position ? { position: opts.position } : {}),
    });
  // "Until this leaves the battlefield": the exiled cards come back.
  for (const back of returning ?? [])
    if (ctx.s.objects[back]?.zone === 'exile') moveObject(ctx, back, 'battlefield');
}

/**
 * Puts +1/+1 counters (or named counters) on a permanent. "Twice that many"
 * effects of its controller apply (Innkeeper's Talent).
 */
export function addCounters(ctx: Ctx, id: ObjectId, n: number, name?: string, by?: PlayerId): void {
  if (n <= 0) return;
  const o = obj(ctx, id);
  // Lorwyn Eclipsed (18b, blue): Blossombind, "can't have counters put on it".
  if (o.zone === 'battlefield' && auraRestricts(ctx, id, 'noCounters')) return;
  // Secrets of Strixhaven (14b): Fractal Tender.
  o.anyCountersTurn = ctx.s.turn.number;
  // Hardened Scales, Kami of Whispered Hopes ("that many plus one +1/+1 counters"), Doc Samson (any
  // counters): before any doubling (the better order).
  for (const src of ctx.s.battlefield) {
    if (obj(ctx, src).controller !== o.controller) continue;
    for (const a of def(ctx, src).abilities)
      if (
        a.kind === 'static' &&
        a.effect.kind === 'extraCounters' &&
        (name ? a.effect.anyCounters : true) &&
        (!a.effect.creaturesOnly || defOf(ctx, o.defId).types.includes('Creature'))
      )
        n += a.effect.amount;
  }
  for (const src of ctx.s.battlefield) {
    const so = obj(ctx, src);
    if (so.controller !== o.controller) continue;
    for (const a of def(ctx, src).abilities)
      if (
        a.kind === 'static' &&
        a.effect.kind === 'doubleCounters' &&
        checkCondition(ctx, a.effect.condition, so.controller, so) &&
        // Final Fantasy (11c): The Earth Crystal doubles only +1/+1 counters on creatures.
        !(a.effect.plusOneOnCreatures && (name || !defOf(ctx, o.defId).types.includes('Creature')))
      )
        n *= 2;
  }
  // Lorwyn Eclipsed (18a): Lasting Tarfire, "if you put a counter on a creature this turn".
  if (def(ctx, id).types.includes('Creature')) {
    const putBy = by ?? ctx.puttingPlayer ?? o.controller;
    const list = (ctx.s.turn.creatureCountersBy ??= []);
    if (!list.includes(putBy)) list.push(putBy);
  }
  if (name) {
    const c = (o.counters ??= {});
    c[name] = (c[name] ?? 0) + n;
    // Reality Fracture (17c): "whenever you put one or more loyalty counters on a planeswalker".
    // `by` is who puts them (Inspired Tethermage counts only counters you put, on any planeswalker).
    if (name === 'loyalty')
      emit(ctx, {
        type: 'loyaltyCountersAdded',
        id,
        count: n,
        player: o.controller,
        by: by ?? ctx.puttingPlayer ?? o.controller,
      });
    return;
  }
  o.plusOneCounters += n;
  // Strixhaven Brawl (15b, multi): Iridescent Hornbeetle counts the counters put on creatures this turn.
  if (def(ctx, id).types.includes('Creature'))
    (ctx.s.turn.countersPut ??= { p1: 0, p2: 0 })[o.controller] += n;
  // Final Fantasy Commander (12c): "the first time +1/+1 counters have been put on it this turn".
  if (o.countersTurn === ctx.s.turn.number) o.countersTimes = (o.countersTimes ?? 0) + 1;
  else {
    o.countersTurn = ctx.s.turn.number;
    o.countersTimes = 1;
  }
  emit(ctx, { type: 'countersAdded', id, count: n, player: o.controller });
}

/** Festival of Embers: `player` controls a permanent that exiles cards headed for their graveyard. */
function graveyardExiles(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      ctx.s.objects[id]!.controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'graveyardToExile',
      ),
  );
}

/** Vren: an opponent controls a permanent with "exile their creatures instead". */
function exiledInsteadOfDying(ctx: Ctx, o: GameObject): boolean {
  if (!defOf(ctx, o.defId).types.includes('Creature')) return false;
  return ctx.s.battlefield.some((id) => {
    const src = ctx.s.objects[id]!;
    return (
      src.controller !== o.controller &&
      def(ctx, id).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.effect.kind === 'exileOpponentCreaturesInstead' &&
          // Strixhaven (13c): Valentin: only nontoken creatures.
          !(a.effect.nontoken && o.isToken),
      )
    );
  });
}

/** Sacrifices a permanent: its controller puts it into its owner's graveyard. */
export function sacrifice(ctx: Ctx, id: ObjectId): void {
  // Tarkir: Dragonstorm (19a): Zurgo, Thunder's Decree.
  if (cantBeSacrificed(ctx, id)) return;
  const o = obj(ctx, id);
  if (def(ctx, id).subtypes.includes('Food'))
    (ctx.s.turn.foodsSacrificed ??= { p1: 0, p2: 0 })[o.controller]++;
  emit(ctx, { type: 'sacrificed', id, defId: o.defId, player: o.controller });
  moveObject(ctx, id, 'graveyard');
}

export function removeFromCombat(ctx: Ctx, id: ObjectId): void {
  const c = ctx.s.combat;
  if (!c) return;
  c.attackers = c.attackers.filter((a) => a.id !== id);
  for (const a of c.attackers) a.blockers = a.blockers.filter((b) => b !== id);
}

export function drawCard(ctx: Ctx, player: PlayerId, drawStepDraw = false): void {
  // Lorwyn Eclipsed (18b, black): Mornsong Aria, "players can't draw cards".
  if (drawPrevented(ctx)) return;
  // Marvel Super Heroes Jumpstart (Geniuses): Reed Richards, "the first time you would draw a card
  // each turn except the first card you draw during each of your draw steps, you draw four instead".
  if (!drawStepDraw && ctx.s.turn.number > 0 && !ctx.s.turn.extraDrawSeen?.includes(player)) {
    ctx.s.turn.extraDrawSeen = [...(ctx.s.turn.extraDrawSeen ?? []), player];
    let count = 0;
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === player)
        for (const a of def(ctx, id).abilities)
          if (a.kind === 'static' && a.effect.kind === 'firstExtraDrawBecomes')
            count = Math.max(count, a.effect.count);
    if (count > 0) {
      for (let i = 0; i < count; i++) drawCard(ctx, player);
      return;
    }
  }
  const p = ctx.s.players[player];
  const top = p.library[0];
  if (top === undefined) {
    p.drewFromEmptyLibrary = true;
    return;
  }
  moveObject(ctx, top, 'hand');
  const nth = ++ctx.s.turn.cardsDrawn[player];
  emit(ctx, { type: 'cardDrawn', player, id: top, nth });
}

export function tap(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (o.tapped) return;
  o.tapped = true;
  // Captain America, Living Legend cares about the first time each turn.
  const first = o.firstTappedTurn !== ctx.s.turn.number;
  o.firstTappedTurn = ctx.s.turn.number;
  emit(ctx, { type: 'tapped', id, ...(first ? { first } : {}) });
}

/** Lorwyn Eclipsed (18b, blue): an Aura on it says it can't become untapped (Blossombind) or can't have counters put on it. */
export function auraRestricts(ctx: Ctx, id: ObjectId, what: 'cantBecomeUntapped' | 'noCounters'): boolean {
  for (const a of ctx.s.battlefield) {
    const ao = ctx.s.objects[a]!;
    if (ao.attachedTo !== id) continue;
    if (
      defOf(ctx, ao.defId).abilities.some(
        (ab) => ab.kind === 'static' && ab.effect.kind === 'attached' && ab.effect[what],
      )
    )
      return true;
  }
  return false;
}
const cantBecomeUntapped = (ctx: Ctx, id: ObjectId) => auraRestricts(ctx, id, 'cantBecomeUntapped');

export function untap(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (!o.tapped) return;
  // Lorwyn Eclipsed (18b, blue): Blossombind, "can't become untapped".
  if (cantBecomeUntapped(ctx, id)) return;
  // "If a permanent with a stun counter would become untapped, instead remove a stun counter."
  if (o.counters?.stun) {
    o.counters.stun--;
    return;
  }
  o.tapped = false;
  emit(ctx, { type: 'untapped', id });
}

// Transform (Marvel Super Heroes)

/** Turns a double-faced permanent to its other face. It stays the same object (rule 712). */
export function transform(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (o.front) {
    o.defId = o.front;
    delete o.front;
  } else {
    const back = defOf(ctx, o.defId).back;
    if (!back) return;
    o.front = o.defId;
    o.defId = back;
  }
  emit(ctx, { type: 'transformed', id, defId: o.defId });
}

/** Runs `fn` with the card showing its back face (to list the back face's casts). */
export function withBackFace<T>(ctx: Ctx, id: ObjectId, fn: () => T): T {
  const o = obj(ctx, id);
  const front = o.defId;
  o.defId = defOf(ctx, front).back!;
  try {
    return fn();
  } finally {
    o.defId = front;
  }
}
