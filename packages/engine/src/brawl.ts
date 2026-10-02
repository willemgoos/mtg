import { type Ctx, def, defOf, moveObject, obj, other } from './context.ts';
import type { CardDefinition, Color, ManaType, ObjectId, PlayerId } from './types.ts';

/**
 * Brawl, Arena's 1v1 Commander: each player's commander starts in the command
 * zone, can be cast from there for {2} more each time, and may go back there
 * whenever it would be put somewhere else.
 */

/** Is this object its owner's commander? */
export function isCommander(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  return !!o && ctx.s.players[o.owner].commander === id;
}

/** Commander tax: {2} for each earlier cast from the command zone. */
export function commanderTax(ctx: Ctx, player: PlayerId): number {
  return 2 * (ctx.s.players[player].commanderCasts ?? 0);
}

/** A card's colour identity: its colours plus the mana symbols in its rules text (rule 903.4). */
export function colorIdentity(d: CardDefinition): Color[] {
  return d.colorIdentity ?? d.colors;
}

/** The colours of `player`'s commander's identity (none without a commander). */
export function commanderColors(ctx: Ctx, player: PlayerId): Color[] {
  const id = ctx.s.players[player].commander;
  return id === undefined ? [] : colorIdentity(def(ctx, id));
}

/** The creature types of `player`'s commander (Path of Ancestry). */
export function commanderTypes(ctx: Ctx, player: PlayerId): string[] {
  const id = ctx.s.players[player].commander;
  return id === undefined ? [] : defOf(ctx, obj(ctx, id).defId).subtypes;
}

/**
 * Exotic Orchard, Fellwar Stone: the colours the lands `player`'s opponent
 * controls could make (looking only at their fixed mana abilities).
 */
export function opponentLandColors(ctx: Ctx, player: PlayerId): ManaType[] {
  const out = new Set<ManaType>();
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== other(player)) continue;
    const d = def(ctx, id);
    if (!d.types.includes('Land')) continue;
    for (const a of d.abilities) {
      if (a.kind !== 'mana' || a.colorFrom === 'opponentLands') continue;
      if (a.colorFrom === 'commander') {
        for (const c of commanderColors(ctx, other(player))) out.add(c);
      } else if (a.produces !== 'C') out.add(a.produces);
    }
  }
  return [...out];
}

const RETURNS_FROM = new Set(['graveyard', 'exile', 'hand', 'library']);

/**
 * A commander that has been put into a graveyard, exile, a hand or a library
 * and whose owner hasn't been asked about it there yet (active player first).
 */
export function commanderToOffer(ctx: Ctx): { player: PlayerId; card: ObjectId } | null {
  const ap = ctx.s.turn.activePlayer;
  for (const player of [ap, other(ap)]) {
    const card = ctx.s.players[player].commander;
    if (card === undefined) continue;
    const o = ctx.s.objects[card];
    if (o && RETURNS_FROM.has(o.zone) && o.commandOffered !== o.zcc) return { player, card };
  }
  return null;
}

/** The owner's answer: move it to the command zone, or leave it where it is. */
export function answerCommandZone(ctx: Ctx, card: ObjectId, accept: boolean): void {
  const o = obj(ctx, card);
  if (accept) moveObject(ctx, card, 'command');
  // Moving bumps zcc; remember the answer for the zone it ends up in.
  o.commandOffered = o.zcc;
}

/** Plaza of Heroes: the colours of legendary permanents `player` controls. */
export function legendaryColors(ctx: Ctx, player: PlayerId): ManaType[] {
  const out = new Set<ManaType>();
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    const d = def(ctx, id);
    if (d.supertypes.includes('Legendary')) for (const c of d.colors) out.add(c);
  }
  return [...out];
}
