import { characteristics } from './characteristics.ts';
import { MSH_EFFECTS } from './msh-effects.ts';
import { FIN_EFFECTS } from './fin-effects.ts';
import { LOREHOLD_EFFECTS } from './stx-lorehold-effects.ts';
import { SOS_14A_EFFECTS } from './sos-14a-effects.ts';
import { SOS_14B_A_EFFECTS } from './sos-14b-a-effects.ts';
import { SOS_14B_B_EFFECTS } from './sos-14b-b-effects.ts';
import { SOS_14B_C_EFFECTS } from './sos-14b-c-effects.ts';
import { BRAWL_15A_R_EFFECTS } from './brawl-15a-r-effects.ts';
import { BRAWL_15A_RW_EFFECTS } from './brawl-15a-rw-effects.ts';
import { SOS_14B_D_EFFECTS } from './sos-14b-d-effects.ts';
import { BRAWL_15A_W_EFFECTS } from './brawl-15a-w-effects.ts';
import { BRAWL_15B_W_EFFECTS } from './brawl-15b-w-effects.ts';
import { STX_13C_A_EFFECTS } from './stx-13c-a-effects.ts';
import { STX_13C_B_EFFECTS } from './stx-13c-b-effects.ts';
import { STX_13C_C_EFFECTS } from './stx-13c-c-effects.ts';
import { STX_13C_D_EFFECTS } from './stx-13c-d-effects.ts';
import { checkCondition } from './triggers.ts';
import type { EffectSource } from './effects.ts';
import type {
  AbilityDef,
  ManaType,
  CardDb,
  CardDefinition,
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
  // Strixhaven Brawl (15a), white and colourless.
  ...BRAWL_15A_W_EFFECTS,
  // Strixhaven Brawl (15a): red-white.
  ...BRAWL_15A_RW_EFFECTS,
  // Strixhaven Brawl (15b), white.
  ...BRAWL_15B_W_EFFECTS,
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

export function def(ctx: Ctx, id: ObjectId): CardDefinition {
  const o = obj(ctx, id);
  const d = defOf(ctx, o.defId);
  if (o.foodBy !== undefined) {
    const aura = ctx.s.objects[o.foodBy];
    if (aura && aura.zone === 'battlefield' && aura.attachedTo === id) return foodDef(d);
  }
  if (o.blank) return blankDef(d);
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
    const shared = sharedLoyaltyAbilities(ctx, id, d);
    if (shared.length) return { ...d, abilities: [...d.abilities, ...shared] };
  }
  // Strixhaven (13a): Lorehold Apprentice grants abilities until end of turn.
  if (o.tempAbilities?.length || o.perpetualAbilities?.length)
    return {
      ...d,
      abilities: [...d.abilities, ...(o.tempAbilities ?? []), ...(o.perpetualAbilities ?? [])],
    };
  return d;
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

export function refOf(o: GameObject): ObjectRef {
  return { id: o.id, zcc: o.zcc };
}

/** The object behind a ref, if it hasn't changed zones since the ref was taken. */
export function deref(ctx: Ctx, ref: ObjectRef): GameObject | undefined {
  const o = ctx.s.objects[ref.id];
  return o && o.zcc === ref.zcc ? o : undefined;
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
  /** Library position; default top. */
  // 'second': second from the top (Trickster's Stratagem, Marvel Super Heroes).
  position?: 'top' | 'bottom' | 'second';
  controller?: PlayerId;
  // Final Fantasy (11a): saga creatures
  /** Onto the battlefield showing its back face ("return it transformed"). */
  transformed?: boolean;
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
  if (from === 'battlefield') {
    const c = characteristics(ctx, id);
    o.lastPower = c.power;
    o.lastCounters = o.plusOneCounters;
    if (to === 'graveyard' && c.types.includes('Creature')) {
      ctx.s.turn.creaturesDied++;
      (ctx.s.turn.creaturesLost ??= { p1: 0, p2: 0 })[o.controller]++;
    }
    if (o.addedSubtypes) o.lastAddedSubtypes = o.addedSubtypes;
    else delete o.lastAddedSubtypes;
    delete o.addedSubtypes;
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
  if (to !== 'stack' && !(from === 'stack' && to === 'battlefield')) delete o.manaColors;
  delete o.attachedTo;
  delete o.usedAbilities;
  delete o.exiledUntilLeaves;
  delete o.kicked;
  if (from === 'battlefield') {
    if (o.counters) o.lastNamedCounters = o.counters;
    else delete o.lastNamedCounters;
  }
  delete o.counters;
  delete o.level;
  delete o.chosenColor;
  delete o.chosenType;
  delete o.exiledWith;
  delete o.foodBy;
  delete o.controlledBy;
  delete o.xPaid;
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
    delete o.castableUntilTurn;
    delete o.anyMana;
  }
  // Secrets of Strixhaven (14b): Ennis, "if one or more cards were put into exile this turn".
  if (to === 'exile' && from !== 'exile' && !o.isToken)
    ctx.s.turn.exiledCards = (ctx.s.turn.exiledCards ?? 0) + 1;
  // Bonecache Overseer: cards leaving a graveyard.
  if (from === 'graveyard') (ctx.s.turn.leftGraveyard ??= { p1: 0, p2: 0 })[o.owner]++;
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
    delete o.suspended;
    delete o.playFreeBy;
  }
  // Cast through suspend: haste as it enters.
  if (to === 'battlefield' && o.hasteOnEntry) {
    delete o.hasteOnEntry;
    o.grantedKeywords = ['haste'];
  }
  if (from === 'exile') delete o.jailedBy;
  // Damage sources are remembered as it dies (Hawkeye), forgotten as it enters.
  if (to === 'battlefield') delete o.damagedBy;
  delete o.blank;
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
    ctx.s.effects = ctx.s.effects.filter((e) => e.whileSourceId !== id);
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
  delete o.loreRemovedTurn;
  if (o.bonusCounters && to !== 'stack') {
    if (to === 'battlefield') o.plusOneCounters += o.bonusCounters;
    delete o.bonusCounters;
  }
  if (to === 'battlefield' && defOf(ctx, o.defId).entersTapped) o.tapped = true;
  const tappedIf = to === 'battlefield' ? defOf(ctx, o.defId).entersTappedIf : undefined;
  // Eddymurk Crab: "enters tapped if it's not your turn"; check lands and the like.
  if (tappedIf && checkCondition(ctx, tappedIf, o.controller, o)) o.tapped = true;
  // Final Fantasy (11b): The Wandering Minstrel: "Lands you control enter untapped."
  if (
    o.tapped &&
    defOf(ctx, o.defId).types.includes('Land') &&
    ctx.s.battlefield.some(
      (id) =>
        id !== o.id &&
        ctx.s.objects[id]!.controller === o.controller &&
        defOf(ctx, ctx.s.objects[id]!.defId).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'landsEnterUntapped',
        ),
    )
  )
    o.tapped = false;

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
  // Ygra entering or leaving changes what the other creatures are.
  if ((from === 'battlefield' || to === 'battlefield') && makesFood(defOf(ctx, o.defId)))
    refreshCreaturesAreFood(ctx);
  emit(ctx, {
    type: 'objectMoved',
    id,
    defId: o.defId,
    from,
    to,
    ...(leftAs ? { leftAs } : {}),
    ...(leftController ? { controller: leftController } : {}),
    ...(exiledInstead ? { exiledInstead: true } : {}),
  });
  if (discarded && o.zone === 'graveyard') {
    o.discardedTurn = ctx.s.turn.number;
    (ctx.s.turn.discards ??= { p1: 0, p2: 0 })[o.owner]++;
    emit(ctx, { type: 'discarded', id, player: o.owner });
  }

  if (ceases) delete ctx.s.objects[id];
  // "Until this leaves the battlefield": the exiled cards come back.
  for (const back of returning ?? [])
    if (ctx.s.objects[back]?.zone === 'exile') moveObject(ctx, back, 'battlefield');
}

/**
 * Puts +1/+1 counters (or named counters) on a permanent. "Twice that many"
 * effects of its controller apply (Innkeeper's Talent).
 */
export function addCounters(ctx: Ctx, id: ObjectId, n: number, name?: string): void {
  if (n <= 0) return;
  const o = obj(ctx, id);
  // Secrets of Strixhaven (14b): Fractal Tender.
  o.countersTurn = ctx.s.turn.number;
  for (const src of ctx.s.battlefield) {
    const so = obj(ctx, src);
    if (so.controller !== o.controller) continue;
    for (const a of def(ctx, src).abilities)
      if (
        a.kind === 'static' &&
        a.effect.kind === 'doubleCounters' &&
        checkCondition(ctx, a.effect.condition, so.controller, so)
      )
        n *= 2;
  }
  if (name) {
    const c = (o.counters ??= {});
    c[name] = (c[name] ?? 0) + n;
    return;
  }
  o.plusOneCounters += n;
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

export function drawCard(ctx: Ctx, player: PlayerId): void {
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

export function untap(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (!o.tapped) return;
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
