import { characteristics } from './characteristics.ts';
import { checkCondition } from './triggers.ts';
import type { EffectSource } from './effects.ts';
import type {
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
  // "As this enters, choose a color/creature type."
  setChosen(ctx, es, params) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'battlefield') return;
    const p = params as { color?: ManaType; type?: string };
    if (p.color) o.chosenColor = p.color;
    if (p.type) o.chosenType = p.type;
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
  return d;
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
  position?: 'top' | 'bottom';
  controller?: PlayerId;
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
  if (from === 'battlefield' && to === 'graveyard' && exiledInsteadOfDying(ctx, o)) to = 'exile';
  // Festival of Embers: "If a card or token would be put into your graveyard from anywhere, exile it instead."
  if (to === 'graveyard' && graveyardExiles(ctx, o.owner)) to = 'exile';
  if (from === 'battlefield' && to === 'exile' && def(ctx, id).types.includes('Creature'))
    (ctx.s.turn.creaturesExiled ??= { p1: 0, p2: 0 })[o.controller]++;
  // Equipment and Auras attached to it are dealt with by state-based actions.
  const returning = from === 'battlefield' ? o.exiledUntilLeaves : undefined;
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
    const host = o.attachedTo !== undefined ? ctx.s.objects[o.attachedTo] : undefined;
    if (host)
      o.lastAttachedTo = {
        id: host.id,
        zcc: host.zone === 'battlefield' ? host.zcc : host.zcc - 1,
      };
    else delete o.lastAttachedTo;
  }
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
  }
  // A stolen card's permission ends when it leaves exile.
  if (from === 'exile') {
    delete o.castableBy;
    delete o.anyMana;
  }
  // Bonecache Overseer: cards leaving a graveyard.
  if (from === 'graveyard') (ctx.s.turn.leftGraveyard ??= { p1: 0, p2: 0 })[o.owner]++;
  delete o.targetedByControllerTurn;
  delete o.blank;
  delete o.resolutions;
  const src = zoneList(ctx, o, from);
  if (src) {
    const i = src.indexOf(id);
    if (i >= 0) src.splice(i, 1);
  }
  if (from === 'battlefield') removeFromCombat(ctx, id);

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
  if (to === 'battlefield' && defOf(ctx, o.defId).entersTapped) o.tapped = true;
  const tappedIf = to === 'battlefield' ? defOf(ctx, o.defId).entersTappedIf : undefined;
  // Eddymurk Crab: "enters tapped if it's not your turn"; check lands and the like.
  if (tappedIf && checkCondition(ctx, tappedIf, o.controller, o)) o.tapped = true;

  // Tokens cease to exist once they leave the battlefield (rule 111.7).
  const ceases = o.isToken && to !== 'battlefield';
  const dst = ceases ? null : zoneList(ctx, o, to);
  if (dst) {
    if (to === 'library' && opts.position !== 'bottom') dst.unshift(id);
    else dst.push(id);
  }
  // Ygra entering or leaving changes what the other creatures are.
  if ((from === 'battlefield' || to === 'battlefield') && makesFood(defOf(ctx, o.defId)))
    refreshCreaturesAreFood(ctx);
  emit(ctx, { type: 'objectMoved', id, defId: o.defId, from, to });

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
        (a) => a.kind === 'static' && a.effect.kind === 'exileOpponentCreaturesInstead',
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

function removeFromCombat(ctx: Ctx, id: ObjectId): void {
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
  emit(ctx, { type: 'tapped', id });
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
