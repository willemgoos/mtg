import {
  abilitiesLocked,
  canTapForAbility,
  cardMatches,
  creaturesOnBattlefield,
  isCreature,
  matchesFilter,
} from './characteristics.ts';
import { manaValue } from './cost.ts';
import {
  affordableAttackers,
  blockViolations,
  canAttack,
  canBlock,
  defenderOf,
  mustAttack,
} from './combat.ts';
import { type Ctx, def, obj, other, withBackFace } from './context.ts';
import { forageChoices } from './forage.ts';
import { artifactHelpers, canPayFrom, creatureHelpers, hasImprovise, manaSources } from './mana.ts';
import { type CastVia, castVariants, spellTags } from './spells.ts';
import {
  abilityManaCost,
  castCost,
  teamworkFor,
  artifactsToTap,
  creaturesToTap,
  crewFor,
  escalateCrew,
  artifactsToSacrifice,
  graveyardCostCard,
  countersYouControl,
  hasStatic,
  hasTargetCostReduction,
  wardCost,
  LOYALTY_KEY,
  tokensToTap,
  wardLife,
  wardPayable,
} from './stack.ts';
import { addCosts } from './spells.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';
import { nameLocked } from './sos-14b-c-effects.ts';

const NO_COST = { generic: 0, colored: {} };
import { standForDistinctTypes, targetCandidates, targetCombos } from './targets.ts';
import { freeCastSource, playableWhileControlling } from './msh-analyzed.ts';
import { omnipresenceCastable } from './fra-green-effects.ts';
import type {
  Action,
  CardFilter,
  ObjectId,
  PlayerId,
  Step,
  TargetChoice,
  TargetSpec,
} from './types.ts';

const MAX_MULLIGANS = 7;

/** Every split of the scried cards into an ordered top and an ordered bottom. */
function scryAnswers(cards: readonly ObjectId[]): { top: ObjectId[]; bottom: ObjectId[] }[] {
  const out: { top: ObjectId[]; bottom: ObjectId[] }[] = [];
  const perms = (xs: ObjectId[]): ObjectId[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) => perms(xs.filter((_, j) => j !== i)).map((p) => [x, ...p]));
  for (let mask = 0; mask < 1 << cards.length; mask++) {
    const top = cards.filter((_, i) => !(mask & (1 << i)));
    const bottom = cards.filter((_, i) => mask & (1 << i));
    for (const t of perms(top)) for (const b of perms(bottom)) out.push({ top: t, bottom: b });
  }
  return out;
}

/**
 * Cards `player` might cast or play: their hand, flashback cards in their
 * graveyard, and the top of their library with Vizier of the Menagerie.
 */
export function castableCards(ctx: Ctx, player: PlayerId): ObjectId[] {
  const ps = ctx.s.players[player];
  // Brawl: your commander from the command zone.
  const out = [...ps.hand, ...ps.command];
  const landsFromGraveyard =
    hasStatic(ctx, player, 'playLandsFromGraveyard') ||
    // Final Fantasy (11c): playing from the graveyard (Hades).
    playsFromGraveyard(ctx, player);
  for (const id of ps.graveyard) {
    const d = def(ctx, id);
    // Conduit of Worlds: "You may play lands from your graveyard."
    // Secrets of Strixhaven (14b): Tablet of Discovery: the card milled with it, this turn.
    if (d.types.includes('Land')) {
      // Secrets of Strixhaven (14b): Ark of Hunger, a milled land you may play this turn.
      if (landsFromGraveyard || obj(ctx, id).playableUntilTurn === ctx.s.turn.number) out.push(id);
      continue;
    }
    if (
      d.flashback ||
      d.disturb ||
      d.castFromGraveyardRemovingCounters ||
      d.castFromGraveyardWithDiscard ||
      d.castFromGraveyardOrExile ||
      mayhemReady(ctx, id) ||
      graveyardVias(ctx, player, id).length
    )
      out.push(id);
  }
  // Reality Fracture (17a): Emrakul, the Exigent Doom, for as long as it remains exiled.
  for (const id of ps.exile)
    if (obj(ctx, id).castableWhileExiled && !out.includes(id)) out.push(id);
  // Strixhaven Brawl (15a): Squee, the Immortal, from your own exile.
  for (const id of ps.exile) if (def(ctx, id).castFromGraveyardOrExile) out.push(id);
  // Cruelclaw's Heist: an opponent's exiled card you may cast.
  for (const id of ctx.s.players[other(player)].exile)
    if (
      obj(ctx, id).castableBy === player &&
      // Strixhaven (13c): Nassari's cards are castable this turn only.
      (obj(ctx, id).castableUntilTurn ?? ctx.s.turn.number) >= ctx.s.turn.number &&
      // Reality Fracture (17a): Null Summoner, only while its threshold holds.
      (!obj(ctx, id).castableIf ||
        checkCondition(ctx, obj(ctx, id).castableIf, player, obj(ctx, id)))
    )
      out.push(id);
  // Glarb: lands and big spells from the top of your library.
  const topCard = ps.library[0];
  if (topCard && !out.includes(topCard))
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player) continue;
      for (const a of def(ctx, id).abilities)
        if (
          a.kind === 'static' &&
          a.effect.kind === 'playFromTop' &&
          cardMatches(ctx, topCard, a.effect.filter) &&
          // Final Fantasy (11c): The Lunar Whale, as long as it attacked this turn.
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id)) &&
          !out.includes(topCard)
        )
          out.push(topCard);
    }
  // Final Fantasy (11a): adventure lands. A card on an adventure: its owner may play the land.
  for (const id of ps.exile) if (obj(ctx, id).onAdventure && !out.includes(id)) out.push(id);
  // Secrets of Strixhaven (14a): prepare. The copy of the prepare spell of each creature you control that is prepared.
  for (const id of ctx.s.battlefield) {
    const host = obj(ctx, id);
    if (host.controller === player && host.prepared !== undefined && !out.includes(host.prepared))
      out.push(host.prepared);
  }
  // Marvel Super Heroes Jumpstart (Analyzed): Victor Mancha, for as long as you control him.
  for (const id of playableWhileControlling(ctx, player)) if (!out.includes(id)) out.push(id);
  // Strongbox Raider: exiled cards you may play for a while.
  for (const id of ps.exile) {
    const until = obj(ctx, id).playableUntilTurn;
    // Wiccan, Young Avenger: "until your next end step" ends as that end step begins.
    const over =
      until === ctx.s.turn.number &&
      obj(ctx, id).playableBeforeEndStep &&
      (ctx.s.turn.step === 'end' || ctx.s.turn.step === 'cleanup');
    if (until !== undefined && until >= ctx.s.turn.number && !over && !out.includes(id))
      out.push(id);
  }
  // Extract Power: either player's exiled cards you may play for free.
  for (const p of ['p1', 'p2'] as const)
    for (const id of ctx.s.players[p].exile)
      if (
        obj(ctx, id).playFreeBy === player &&
        !out.includes(id) &&
        // Mystical Archive (16): Mind's Desire, only this turn.
        (obj(ctx, id).playFreeUntilTurn === undefined ||
          obj(ctx, id).playFreeUntilTurn! >= ctx.s.turn.number) &&
        // Strixhaven Brawl (15b, u): plot, only on a later turn.
        (obj(ctx, id).plottedTurn === undefined || obj(ctx, id).plottedTurn! < ctx.s.turn.number)
      )
        out.push(id);
  const top = ps.library[0];
  if (
    top &&
    def(ctx, top).types.includes('Creature') &&
    hasStatic(ctx, player, 'creaturesFromTopOfLibrary')
  )
    out.push(top);
  // Conduit of Worlds: after casting its card, no more spells this turn.
  if (ctx.s.turn.spellLock?.includes(player))
    return out.filter((id) => def(ctx, id).types.includes('Land'));
  return out;
}

/**
 * Rottenmouth Viper: which permanents to sacrifice for each count (the
 * engine picks the least useful: tokens, then the cheapest; a simplification).
 */
function sacrificePrefixes(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  d: ReturnType<typeof def>,
): (ObjectId[] | undefined)[] {
  // Strixhaven (13c): Plumb the Forbidden: sacrifice up to three creatures (tokens, then the cheapest first).
  if (d.sacrificeCreaturesToCopy) {
    const fodder = ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === player && isCreature(ctx, id))
      .sort(
        (a, b) =>
          Number(obj(ctx, b).isToken) - Number(obj(ctx, a).isToken) ||
          manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
      );
    const out: (ObjectId[] | undefined)[] = [undefined];
    for (let k = 1; k <= Math.min(fodder.length, 3); k++) out.push(fodder.slice(0, k));
    return out;
  }
  if (!d.sacrificeAnyForReduction && !d.sacrificeCreaturesForReduction) return [undefined];
  // Strixhaven (13c): Awaken the Blood Avatar sacrifices creatures only, {2} less for each.
  const creaturesOnly = !!d.sacrificeCreaturesForReduction;
  const per = d.sacrificeCreaturesForReduction ?? 1;
  const fodder = ctx.s.battlefield
    .filter(
      (id) =>
        obj(ctx, id).controller === player &&
        !def(ctx, id).types.includes('Land') &&
        (!creaturesOnly || def(ctx, id).types.includes('Creature')),
    )
    .sort(
      (a, b) =>
        Number(obj(ctx, b).isToken) - Number(obj(ctx, a).isToken) ||
        manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
    );
  const out: (ObjectId[] | undefined)[] = [undefined];
  for (let k = 1; k <= Math.min(fodder.length, Math.ceil(d.manaCost.generic / per)); k++)
    out.push(fodder.slice(0, k));
  return out.filter((x) => !x || !x.includes(card));
}

/** Mayhem: a card with mayhem discarded this turn, still in the graveyard. */
function mayhemReady(ctx: Ctx, card: ObjectId): boolean {
  return !!def(ctx, card).mayhem && obj(ctx, card).discardedTurn === ctx.s.turn.number;
}

/** Other ways to cast a graveyard card: Festival of Embers, Osteomancer Adept. */
export function graveyardVias(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
): Exclude<CastVia, 'free'>[] {
  const d = def(ctx, card);
  const out: Exclude<CastVia, 'free'>[] = [];
  const instantOrSorcery = d.types.includes('Instant') || d.types.includes('Sorcery');
  if (
    instantOrSorcery &&
    ctx.s.turn.activePlayer === player &&
    hasStatic(ctx, player, 'castFromGraveyardForLife')
  )
    out.push('festival');
  if (d.types.includes('Creature') && ctx.s.turn.osteomancer?.includes(player))
    out.push('osteomancer');
  // Conduit of Worlds: the card it chose, this turn.
  if (obj(ctx, card).playableUntilTurn === ctx.s.turn.number) out.push('conduit');
  // Final Fantasy (11c): playing from the graveyard (Noctis: artifacts for 3 life more; Hades: during your turn).
  if (d.types.includes('Artifact') && hasStatic(ctx, player, 'castArtifactsFromGraveyard'))
    out.push('noctis');
  if (playsFromGraveyard(ctx, player)) out.push('hades');
  return out;
}

/** Final Fantasy (11c): playing from the graveyard. Hades: "you may play cards from your graveyard". */
export function playsFromGraveyard(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.effect.kind === 'playFromGraveyard' &&
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id)),
      ),
  );
}

/** Land plays allowed per turn: one, plus one for each "additional land" effect (Loot). */
function landDrops(ctx: Ctx, player: PlayerId): number {
  // Final Fantasy Commander (12b): "you may play an additional land this turn".
  let n = 1 + (ctx.s.turn.extraLands?.[player] ?? 0);
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'extraLandDrop') n++;
  }
  return n;
}

// Marvel Super Heroes Jumpstart (Incredible)
/** Behold: a matching permanent you control, or another matching card in your hand. */
function canBehold(ctx: Ctx, player: PlayerId, card: ObjectId, filter: CardFilter): boolean {
  return (
    ctx.s.battlefield.some(
      (id) => obj(ctx, id).controller === player && matchesFilter(ctx, id, filter),
    ) || ctx.s.players[player].hand.some((id) => id !== card && cardMatches(ctx, id, filter))
  );
}

/** Every way to choose the face-up pile (order within a pile doesn't matter). */
function pileSplits(cards: readonly ObjectId[]): ObjectId[][] {
  const out: ObjectId[][] = [];
  for (let mask = 0; mask < 1 << cards.length; mask++)
    out.push(cards.filter((_, i) => mask & (1 << i)));
  return out;
}

function isMainPhase(ctx: Ctx): boolean {
  const st = ctx.s.turn.step;
  return st === 'main1' || st === 'main2';
}

/** Sorcery timing: own main phase with an empty stack (rule 307.1). */
export function sorceryTiming(ctx: Ctx, player: PlayerId): boolean {
  return isMainPhase(ctx) && ctx.s.turn.activePlayer === player && ctx.s.stack.length === 0;
}

// Reality Fracture (17a): Yuriko, Blade of the Mighty
const COMBAT_STEPS: readonly Step[] = [
  'beginCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endCombat',
];
/** During combat, players can't cast spells or activate abilities that aren't mana abilities. */
function combatLocked(ctx: Ctx): boolean {
  return (
    COMBAT_STEPS.includes(ctx.s.turn.step) &&
    ctx.s.battlefield.some((id) =>
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'noCastOrActivateInCombat',
      ),
    )
  );
}

function priorityActions(ctx: Ctx, player: PlayerId): Action[] {
  const s = ctx.s;
  const out: Action[] = [{ type: 'passPriority', player }];
  if (combatLocked(ctx)) return out;
  const ps = s.players[player];
  const sorcery = sorceryTiming(ctx, player);
  const sources = manaSources(ctx, player);

  // "You may cast (noncreature) spells as though they had flash."
  const flashFilters = s.battlefield.flatMap((id) =>
    obj(ctx, id).controller === player
      ? def(ctx, id).abilities.flatMap((a) =>
          a.kind === 'static' &&
          a.effect.kind === 'flashForAll' &&
          // Captain Mar-Vell, Quicksilver: only while their condition holds.
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id))
            ? [a.effect.filter ?? {}]
            : [],
        )
      : [],
  );
  // Secrets of Strixhaven (14b): restricted mana floating in the pool (Abstract Paintmage).
  const restricted =
    !!ps.pool?.some((m) => m.onlyFor) ||
    s.battlefield.some(
      (id) =>
        obj(ctx, id).controller === player &&
        def(ctx, id).abilities.some(
          (a) =>
            // Reality Fracture (17a): Heartwood Crafter's mana can't cast spells from your hand.
            (a.kind === 'mana' && (!!a.onlyFor || !!a.notForSpellsFromHand)) ||
            (a.kind === 'static' &&
              a.effect.kind === 'grantMana' &&
              (!!a.effect.onlyForCreatures || !!a.effect.onlyFor)),
        ),
    );
  const creatures = s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && isCreature(ctx, id),
  );
  /** Target combos, dropping any that target the creature being sacrificed. */
  const combosFor = (specs: TargetSpec[], sourceId: ObjectId, sacrifice?: ObjectId) =>
    targetCombos(ctx, specs, { controller: player, sourceId }).filter(
      (ts) => !sacrifice || !ts.some((t) => 'object' in t && t.object.id === sacrifice),
    );

  const castsOf = (card: ObjectId): void => {
    const d = def(ctx, card);
    const zone = obj(ctx, card).zone;
    if (d.types.includes('Land')) {
      if (
        sorcery &&
        ps.landsPlayedThisTurn < landDrops(ctx, player) &&
        (zone !== 'graveyard' ||
          hasStatic(ctx, player, 'playLandsFromGraveyard') ||
          obj(ctx, card).playableUntilTurn === s.turn.number ||
          playsFromGraveyard(ctx, player))
      )
        out.push({ type: 'playLand', player, card });
      return;
    }
    if (d.castOnlyIf && !checkCondition(ctx, d.castOnlyIf, player, obj(ctx, card))) return;
    const firstOfCard = out.length;
    // Strixhaven Brawl (15b, u/pair): a plotted card is cast as a sorcery.
    const plottedCard = zone === 'exile' && obj(ctx, card).plottedTurn !== undefined;
    const instantSpeed =
      !plottedCard &&
      (d.types.includes('Instant') ||
        d.keywords.includes('flash') ||
        flashFilters.some((f) => cardMatches(ctx, card, f)) ||
        // Progenitor's Icon: spells of the chosen type have flash this turn.
        !!s.turn.flashTypes?.some((f) => f.player === player && d.subtypes.includes(f.type)) ||
        // Strixhaven Brawl (15b, u): Quicken, the next sorcery spell you cast this turn.
        (d.types.includes('Sorcery') && !!s.turn.sorceryFlash?.includes(player)));
    // Restricted mana (Giada: only for Angels; Villages: only for creature spells).
    const base = restricted ? manaSources(ctx, player, undefined, spellTags(d, zone)) : sources;
    // Convoke: untapped creatures can pay for {1} each.
    let pool = d.convoke ? [...base, ...creatureHelpers(ctx, player, base)] : base;
    if (hasImprovise(ctx, player, card))
      pool = [...pool, ...artifactHelpers(ctx, player, pool, card)];
    // {X}: every affordable value (up to 10).
    // Secrets of Strixhaven (14b): Molten Note's flashback cost has no {X}.
    const xsAll =
      d.manaCost.x && !(zone === 'graveyard' && d.flashback)
        ? Array.from(
            { length: Math.min(10, Math.floor(pool.length / d.manaCost.x)) + 1 },
            (_, x) => x,
          )
        : // Toxic Deluge: X life, up to one less than you have.
          d.payXLife
          ? Array.from({ length: Math.min(13, ps.life - 1) + 1 }, (_, x) => x)
          : [undefined];
    // Strixhaven Brawl (15b, pair): Ornate Imitations, "X can't be 0".
    const xs = d.minX ? xsAll.filter((x) => x === undefined || x >= d.minX!) : xsAll;
    // A card to discard as an additional cost (Sazacap's Brew).
    // Dragon Man: from the graveyard, discarding a card as well.
    const discardToCast =
      d.discardToCast || (zone === 'graveyard' && d.castFromGraveyardWithDiscard);
    // Strixhaven (13c): Draconic Intervention exiles an instant or sorcery card from your graveyard.
    const exileToCast = d.exileFromGraveyardToCast;
    const discards = exileToCast
      ? ps.graveyard.filter((id) => cardMatches(ctx, id, exileToCast))
      : discardToCast
        ? ps.hand.filter((id) => id !== card)
        : [undefined];
    if ((d.discardToCast || exileToCast) && discards.length === 0) return;
    // Marvel Super Heroes Jumpstart (Pym Particles): flash only when kicked (Quantum Reduction).
    const flashIfKicked = !instantSpeed && !sorcery && !!d.kicker?.flash;
    if (!instantSpeed && !sorcery && !flashIfKicked) return;
    // The usual ways, plus graveyard casts through other cards.
    // Extract Power: exiled cards played for free.
    const free = zone === 'exile' && (obj(ctx, card).playFreeBy === player || plottedCard);
    // Secrets of Strixhaven (14b): Zaffai and the Tempests: an instant or sorcery from your hand, free, once a turn.
    const zaffai =
      zone === 'hand' &&
      (d.types.includes('Instant') || d.types.includes('Sorcery')) &&
      !s.turn.zaffaiUsed?.includes(player) &&
      hasStatic(ctx, player, 'freeSpellOncePerTurn');
    const vias: (CastVia | undefined)[] = free
      ? ['free']
      : [
          ...(zone !== 'graveyard' ||
          d.flashback ||
          d.castFromGraveyardRemovingCounters ||
          d.castFromGraveyardWithDiscard ||
          d.castFromGraveyardOrExile ||
          mayhemReady(ctx, card)
            ? [undefined]
            : []),
          ...(zone === 'graveyard' ? graveyardVias(ctx, player, card) : []),
          ...(zaffai ? (['zaffai'] as const) : []),
          // Marvel Super Heroes Jumpstart (Analyzed): Vision, Spectral Synthezoid.
          ...(freeCastSource(ctx, player, card) ? (['freeOnceEachTurn'] as const) : []),
          // Reality Fracture (17a): Omnipresence.
          ...(omnipresenceCastable(ctx, player, card) ? (['omnipresence'] as const) : []),
        ];
    for (const via of vias)
      for (const v of castVariants(d, zone, via)) {
        if (flashIfKicked && !v.kicked) continue;
        if ((v.life ?? 0) > ps.life) continue;
        // Secrets of Strixhaven (14b): Soaring Stoneglider exiles cards unless the kicker is paid.
        if (
          d.unkickedExilesGraveyard &&
          !v.kicked &&
          ps.graveyard.length < d.unkickedExilesGraveyard
        )
          continue;
        if (v.removeCounters && countersYouControl(ctx, player) < v.removeCounters) continue;
        // Escalate: enough untapped creatures to tap.
        if (
          v.spell?.escalate &&
          escalateCrew(ctx, player, v.spell.escalate, v.spell.escalateFilter) === null
        )
          continue;
        // Strixhaven Brawl (15a): Escape also exiles other cards from your graveyard.
        if (d.escapeExiles && zone === 'graveyard' && ps.graveyard.length - 1 < d.escapeExiles)
          continue;
        // Rottenmouth Viper: sacrifice 0 to 5 nonland permanents (the least useful first).
        for (const sacrificeMany of sacrificePrefixes(ctx, player, card, d))
          for (const x of xs) {
            // Marvel Super Heroes Jumpstart (Analyzed): without paying its mana cost, X is 0.
            if ((via === 'freeOnceEachTurn' || via === 'omnipresence') && x) continue;
            const choice = {
              sacrificeMany,
              via,
              mode: v.mode,
              paws: v.paws,
              kicked: v.kicked,
              kickCount: v.kickCount,
              sacrifice: v.sacrifice ? 'x' : undefined,
              discard: v.discard ? 'x' : undefined,
              forage: v.forage ? 'graveyard' : undefined,
              x,
              delve: undefined as number | undefined,
            };
            // Teamwork: kicked only if there are creatures to tap.
            const teamwork = teamworkFor(ctx, player, card, { kicked: v.kicked });
            if (v.kicked && d.kicker?.teamwork !== undefined && !teamwork) continue;
            // Mystical Archive (16): Akroma's Will, Jeska's Will: both modes only with a commander.
            if (
              v.kicked &&
              d.kicker?.onlyIf &&
              !checkCondition(ctx, d.kicker.onlyIf, player, obj(ctx, card))
            )
              continue;
            // Strixhaven Brawl (15b, u): delve, exiling only as many cards as the cost needs.
            if (d.delve) {
              const most = Math.min(
                ps.graveyard.filter((id) => id !== card).length,
                v.cost.generic,
              );
              let k = 0;
              while (
                k < most &&
                !canPayFrom(castCost(ctx, player, card, { ...choice, delve: k }), pool)
              )
                k++;
              if (k > 0) choice.delve = k;
            }
            // Marvel Super Heroes Jumpstart (Incredible): behold needs something to behold.
            if (v.kicked && d.kicker?.behold && !canBehold(ctx, player, card, d.kicker.behold))
              continue;
            const base = castCost(ctx, player, card, choice);
            // Strixhaven (13b): Killian also lowers the cost by what the spell targets.
            const targetDiscount = !!d.costReductionIfTarget || hasTargetCostReduction(ctx, player);
            if (!canPayFrom(base, pool) && !targetDiscount) continue;
            const extra = {
              ...(v.mode !== undefined ? { mode: v.mode } : {}),
              ...(v.kicked ? { kicked: true } : {}),
              ...(v.kickCount ? { kickCount: v.kickCount } : {}),
              ...(x !== undefined ? { x } : {}),
              ...(v.paws ? { paws: v.paws } : {}),
              ...(choice.delve ? { delve: choice.delve } : {}),
              ...(via ? { via } : {}),
              ...(sacrificeMany ? { sacrificeMany } : {}),
            };
            const specs = v.spell?.targets ?? (d.enchant ? [d.enchant] : []);
            const forages = v.forage ? forageChoices(ctx, player) : [undefined];
            // Ultimate Nullification: only a legendary creature.
            // Final Fantasy (11b): a kicker paid with an artifact or creature, or with a land.
            const kickPermanent = v.kicked
              ? d.kicker?.returnLand
                ? (d.kicker.returnLandFilter ?? { types: ['Land' as const] })
                : d.kicker?.sacrifice
              : undefined;
            const sacrificeable = kickPermanent
              ? s.battlefield.filter(
                  (id) =>
                    obj(ctx, id).controller === player && matchesFilter(ctx, id, kickPermanent),
                )
              : d.sacrificeToCastFilter
                ? // Strixhaven Brawl (15b, b): a filter naming types (Deadly Dispute: artifact or creature) may pick other permanents.
                  (d.sacrificeToCastFilter.anyOf ||
                  d.sacrificeToCastFilter.types ||
                  d.sacrificeToCastFilter.nonland
                    ? s.battlefield.filter((id) => obj(ctx, id).controller === player)
                    : creatures
                  ).filter((id) => matchesFilter(ctx, id, d.sacrificeToCastFilter))
                : creatures;
            for (const sacrifice of v.sacrifice ? sacrificeable : [undefined]) {
              for (const targets of combosFor(specs, card, sacrifice)) {
                // Strixhaven (13c): Crackle with Power: up to X targets.
                if (d.upToXTargets && targets.length > (x ?? 0) + (d.upToXOffset ?? 0)) continue; // Strixhaven Brawl (15b, g): Spinning Wheel Kick
                // Strixhaven Brawl (15b, u): Stolen by the Fae, the target's mana value is X.
                if (d.targetManaValueX) {
                  const first = targets[0];
                  if (
                    !first ||
                    !('object' in first) ||
                    manaValue(def(ctx, first.object.id).manaCost) !== (x ?? 0)
                  )
                    continue;
                }
                const ward = wardCost(ctx, player, targets);
                // Dire Downdraft costs less with some targets.
                const cost = targetDiscount ? castCost(ctx, player, card, choice, targets) : base;
                if ((ward.generic || targetDiscount) && !canPayFrom(addCosts(cost, ward), pool))
                  continue;
                if (wardLife(ctx, player, targets) > s.players[player].life) continue;
                if (!wardPayable(ctx, player, targets, zone === 'hand' ? 1 : 0)) continue;
                // Strixhaven Brawl (15b, b): Bone Shards and Bitter Triumph: this way of casting discards a card.
                const vDiscards = v.discard
                  ? ps.hand.filter(
                      (id) =>
                        id !== card &&
                        // Mystical Archive (16): Force of Will exiles a blue card.
                        (!v.kicked ||
                          !d.kicker?.exileFromHand ||
                          cardMatches(ctx, id, d.kicker.exileFromHand)),
                    )
                  : discards;
                for (const forage of forages)
                  for (const discard of vDiscards) {
                    // Paying without what this cast sacrifices.
                    const spent = [
                      // Final Fantasy (11b): a land returned for kicker may tap for mana first.
                      v.kicked && d.kicker?.returnLand ? undefined : sacrifice,
                      ...(sacrificeMany ?? []),
                      forage === 'graveyard' ? undefined : forage,
                      ...(teamwork ?? []),
                    ];
                    if (spent.some((id) => id && pool.some((p) => p.id === id))) {
                      const rest = pool.filter((p) => !spent.includes(p.id));
                      if (!canPayFrom(addCosts(cost, ward), rest)) continue;
                    }
                    out.push({
                      type: 'castSpell',
                      player,
                      card,
                      targets,
                      ...extra,
                      ...(sacrifice ? { sacrifice } : {}),
                      ...(forage ? { forage } : {}),
                      ...(discard ? { discard } : {}),
                    });
                  }
              }
            }
          }
      }
    // Mockingbird: also one action per creature it could copy (mana spent: X + its {U}).
    // Spark Double, Chameleon: one per creature you control, any mana value.
    if (d.entersAsCopy)
      for (const a of out.splice(firstOfCard))
        if (a.type === 'castSpell')
          out.push(
            a,
            ...creaturesOnBattlefield(ctx, d.entersAsCopy.yours ? player : undefined)
              .filter(
                (c) =>
                  d.entersAsCopy!.yours ||
                  // Final Fantasy Commander (12c): Altered Ego copies any creature.
                  d.entersAsCopy!.anyManaValue ||
                  manaValue(def(ctx, c.id).manaCost) <= (a.x ?? 0) + manaValue(d.manaCost),
              )
              .map((c) => ({ ...a, copyOf: c.id })),
          );
  };
  // Marvel Super Heroes (Jennifer Walters): "Your opponents can't cast spells during your turn."
  const silenced =
    s.turn.activePlayer !== player &&
    hasStatic(ctx, s.turn.activePlayer, 'opponentsCantCastDuringYourTurn');
  // Strixhaven (13c): Academic Probation, "can't cast spells with the chosen name".
  const banned = ps.castBans ?? [];
  // Strixhaven (13c): Codie, Vociferous Codex.
  const noPermanents = hasStatic(ctx, player, 'cantCastPermanentSpells');
  const blocked = (card: ObjectId) =>
    noPermanents && !def(ctx, card).types.some((t) => t === 'Instant' || t === 'Sorcery');
  const castable = silenced ? [] : castableCards(ctx, player);
  for (const card of banned.length
    ? castable.filter((c) => !banned.some((b) => b.defId === obj(ctx, c).defId))
    : castable) {
    if (!blocked(card)) castsOf(card);
    // Modal double-faced cards: the back face can be cast from hand too.
    // Secrets of Strixhaven (14a): a prepare creature's back is a spell that can't be cast from hand.
    if (
      def(ctx, card).back &&
      !def(ctx, card).prepare &&
      (obj(ctx, card).zone === 'hand' ||
        // Strixhaven Brawl (15a): Disturb, from the graveyard.
        (obj(ctx, card).zone === 'graveyard' && def(ctx, card).disturb))
    ) {
      const from = out.length;
      withBackFace(ctx, card, () => {
        if (!blocked(card)) castsOf(card);
      });
      for (const a of out.slice(from))
        if (a.type === 'castSpell' || a.type === 'playLand') a.back = true;
    }
  }
  // Sneak (Marvel Super Heroes): during your declare blockers step, return an unblocked attacker.
  const unblocked =
    s.turn.activePlayer === player && s.turn.step === 'declareBlockers' && s.combat
      ? s.combat.attackers.filter((a) => !a.blocked && a.blockers.length === 0).map((a) => a.id)
      : [];
  if (unblocked.length)
    for (const card of ps.hand) {
      const d = def(ctx, card);
      if (!d.sneak) continue;
      const cost = addCosts(d.sneak, NO_COST);
      for (const attacker of unblocked) {
        const rest = sources.filter((p) => p.id !== attacker);
        if (!canPayFrom(cost, rest)) continue;
        for (const targets of combosFor(d.spell?.targets ?? [], card))
          out.push({ type: 'castSpell', player, card, targets, sneak: attacker });
      }
    }

  const abilitySources = [
    ...s.battlefield.filter((id) => obj(ctx, id).controller === player),
    ...ps.graveyard,
    ...ps.hand,
    ...ps.exile,
  ];
  for (const source of abilitySources) {
    const zone = obj(ctx, source).zone;
    def(ctx, source).abilities.forEach((a, abilityIndex) => {
      if (a.kind !== 'activated') return;
      // Marvel Super Heroes Jumpstart (Great Lakes Avengers): Mister Immortal, also from exile.
      const fromExile = a.fromExile && zone === 'exile';
      if (
        !fromExile &&
        (a.fromGraveyard ? 'graveyard' : a.fromHand ? 'hand' : 'battlefield') !== zone
      )
        return;
      if (a.sorcerySpeed && !sorcery) return;
      // Strixhaven (13c): Academic Probation (no activated abilities), Revel in Silence (no loyalty abilities).
      if (
        s.effects.some(
          (e) =>
            e.noActivate && e.affected.id === source && e.affected.zcc === obj(ctx, source).zcc,
        )
      )
        return;
      if (a.cost.loyalty !== undefined && s.turn.noLoyalty?.includes(player)) return;
      // Secrets of Strixhaven (14b): Petrified Hamlet.
      if (nameLocked(ctx, source)) return;
      // Marvel Super Heroes Jumpstart (Wakanda): Secure Detention.
      if (zone === 'battlefield' && abilitiesLocked(ctx, source)) return;
      if ((a.once || a.powerUp) && obj(ctx, source).usedAbilities?.includes(abilityIndex)) return;
      if (a.powerUp && s.turn.noPowerUp) return;
      if (a.oncePerTurn && obj(ctx, source).onceTurns?.[-1 - abilityIndex] === s.turn.number)
        return;
      if (a.cost.tapSelf && !canTapForAbility(ctx, source)) return;
      if (a.condition && !checkCondition(ctx, a.condition, player, obj(ctx, source))) return;
      if ((a.cost.life ?? 0) > ps.life) return;
      // Loyalty abilities: sorcery speed, once per turn, enough loyalty to pay.
      if (a.cost.loyalty !== undefined) {
        const o = obj(ctx, source);
        if (!sorcery || o.onceTurns?.[LOYALTY_KEY] === s.turn.number) return;
        if ((o.counters?.loyalty ?? 0) + a.cost.loyalty < 0) return;
      }
      const tagged = isCreature(ctx, source)
        ? manaSources(ctx, player, undefined, ['CreatureAbility'])
        : sources;
      const own = a.cost.tapSelf ? tagged.filter((x) => x.id !== source) : tagged;
      // Heirloom Epic: creatures can pay for generic mana.
      const usable = a.cost.convoke
        ? [...own, ...creatureHelpers(ctx, player, own, a.cost.tapSelf ? source : undefined)]
        : own;
      // Final Fantasy (11d): an equip discount may depend on the target (Cloud, Planet's Champion).
      const mana = abilityManaCost(ctx, source, a, 'best');
      if (!canPayFrom(mana, usable)) return;
      if (a.cost.tapTokens && tokensToTap(ctx, player, source).length < a.cost.tapTokens) return;
      // Secrets of Strixhaven (14b): Harmonized Trio.
      if (
        a.cost.tapOtherCreatures &&
        creaturesToTap(ctx, player, undefined, source, true).length < a.cost.tapOtherCreatures
      )
        return;
      // Marvel Super Heroes Jumpstart (Masters of Evil)
      if (
        a.cost.tapCreature &&
        creaturesToTap(ctx, player, a.cost.tapCreature, source).length === 0
      )
        return;
      // Reality Fracture (17a): Tenured Tethermage.
      if (a.cost.tapArtifacts && artifactsToTap(ctx, player).length < a.cost.tapArtifacts) return;
      if (a.cost.crew && !crewFor(ctx, player, source, a.cost.crew)) return;
      if (
        a.cost.sacrificeArtifacts &&
        !artifactsToSacrifice(
          ctx,
          player,
          a.cost.sacrificeArtifacts,
          a.cost.sacrificeArtifactsFilter,
        )
      )
        return;
      if (
        a.cost.exileFromGraveyard &&
        !graveyardCostCard(ctx, player, a.cost.exileFromGraveyard, source)
      )
        return;
      // Strixhaven (13c): Uvilda exiles an instant or sorcery from hand.
      const discardFilter = a.cost.discardFilter ?? {};
      const discards = a.cost.exileRefine
        ? ps.hand.filter((id) => matchesFilter(ctx, id, { types: ['Instant', 'Sorcery'] }))
        : a.cost.discard
          ? // Secrets of Strixhaven (14b): Page, Loose Leaf discards another card with its name.
            a.cost.discardSameName
            ? ps.hand.filter((id) => id !== source && obj(ctx, id).defId === obj(ctx, source).defId)
            : // Reality Fracture (17a): Solitary Cell, "Discard a legendary card".
              a.cost.discardFilter
              ? ps.hand.filter((id) => cardMatches(ctx, id, discardFilter))
              : ps.hand
          : [undefined];
      if (discards.length === 0) return;
      const rc = a.cost.removeCounters;
      if (rc && (obj(ctx, source).counters?.[rc.name] ?? 0) < rc.count) return;
      const forages = a.cost.forage ? forageChoices(ctx, player) : [undefined];
      if (forages.length === 0) return;
      const sacrificeable = a.cost.sacrificePermanent
        ? s.battlefield.filter(
            (id) =>
              obj(ctx, id).controller === player &&
              matchesFilter(ctx, id, a.cost.sacrificePermanent, source),
          )
        : a.cost.sacrificeFilter
          ? creatures.filter((id) => matchesFilter(ctx, id, a.cost.sacrificeFilter, source))
          : creatures;
      const sacrifices =
        a.cost.sacrificeCreature || a.cost.sacrificePermanent ? sacrificeable : [undefined];
      const firstOfAbility = out.length;
      for (const sacrifice of sacrifices) {
        for (const targets of combosFor(a.targets, source, sacrifice)) {
          const m = abilityManaCost(ctx, source, a, targets);
          if (m !== mana && !canPayFrom(m, usable)) continue;
          const ward = wardCost(ctx, player, targets);
          if (ward.generic && !canPayFrom(addCosts(m ?? NO_COST, ward), usable)) continue;
          if (!wardPayable(ctx, player, targets)) continue;
          for (const forage of forages)
            for (const discard of discards) {
              const spent = [sacrifice, forage === 'graveyard' ? undefined : forage];
              if (m && spent.some((id) => id && usable.some((p) => p.id === id))) {
                const rest = usable.filter((p) => !spent.includes(p.id));
                if (!canPayFrom(addCosts(m, ward), rest)) continue;
              }
              out.push({
                type: 'activateAbility',
                player,
                source,
                abilityIndex,
                targets,
                ...(sacrifice ? { sacrifice } : {}),
                ...(forage ? { forage } : {}),
                ...(discard ? { discard } : {}),
              });
            }
        }
      }
      // Strixhaven (13c): -X loyalty abilities (Kasmina): each X from 1 to the loyalty.
      if (a.cost.loyaltyX) {
        const bases = out.splice(firstOfAbility);
        const have = obj(ctx, source).counters?.loyalty ?? 0;
        for (const base of bases)
          for (let x = 1; x <= have; x++) out.push({ ...base, x } as Action);
      }
      // Villainous Syndication: one action per creature that could be tapped for the cost.
      if (a.cost.tapCreature) {
        const bases = out.splice(firstOfAbility);
        const can = creaturesToTap(ctx, player, a.cost.tapCreature, source);
        for (const base of bases)
          for (const tapCreature of can) out.push({ ...base, tapCreature } as Action);
      }
      // Reality Fracture (17a): Tenured Tethermage: one action for each way of choosing the artifacts to tap
      // (artifacts that look alike are one way).
      if (a.cost.tapArtifacts) {
        const bases = out.splice(firstOfAbility);
        const can = artifactsToTap(ctx, player);
        const key = (id: ObjectId) => `${obj(ctx, id).defId}|${obj(ctx, id).isToken ? 1 : 0}`;
        const ways: ObjectId[][] = [];
        const seen = new Set<string>();
        // Every order is offered, since the board picks them one at a time in any order.
        const pick = (chosen: ObjectId[]): void => {
          if (chosen.length === a.cost.tapArtifacts) {
            const k = chosen.map(key).join(',');
            if (!seen.has(k)) {
              seen.add(k);
              ways.push(chosen);
            }
            return;
          }
          for (const id of can) if (!chosen.includes(id)) pick([...chosen, id]);
        };
        pick([]);
        for (const base of bases)
          for (const tapArtifacts of ways) out.push({ ...base, tapArtifacts } as Action);
      }
      // Marvel Super Heroes: {X} in an ability's cost (Bruce Banner): every affordable X up to 10.
      if (mana?.x)
        for (const base of out.slice(firstOfAbility))
          for (let x = 1; x <= 10; x++) {
            if (!canPayFrom({ ...mana, generic: mana.generic + x * mana.x }, usable)) break;
            out.push({ ...base, x } as Action);
          }
    });
  }
  return out;
}

/**
 * Every action `player` may take right now. Empty if it isn't their decision.
 * Covers everything applyAction accepts except explicit `payWith` choices and
 * conceding.
 */
/** Split second: printed, or granted to its controller's instant and sorcery spells (Samut, Tyrant of Naktamun). */
function hasSplitSecond(ctx: Ctx, spell: ObjectId, controller: PlayerId): boolean {
  const d = def(ctx, spell);
  if (d.splitSecond) return true;
  if (!d.types.includes('Instant') && !d.types.includes('Sorcery')) return false;
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === controller &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'instantsSorceriesSplitSecond',
      ),
  );
}

export function getLegalActions(ctx: Ctx, player: PlayerId): Action[] {
  const s = ctx.s;
  const d = s.decision;
  if (d.kind === 'gameOver' || d.player !== player) return [];

  switch (d.kind) {
    case 'mulligan': {
      const out: Action[] = [{ type: 'keepHand', player }];
      if (s.players[player].mulligans < MAX_MULLIGANS) out.push({ type: 'mulligan', player });
      return out;
    }
    case 'bottomCards':
      return s.players[player].hand.map((card) => ({ type: 'bottomCard', player, card }) as const);
    case 'commandZone':
      return [
        { type: 'chooseEffect', player, accept: true },
        { type: 'chooseEffect', player, accept: false },
      ];
    case 'discardToHandSize':
      return s.players[player].hand.map((card) => ({ type: 'discard', player, card }) as const);
    case 'priority': {
      // Mystical Archive (16): split second. Nothing but passing while one is on the stack.
      if (s.stack.some((x) => x.kind === 'spell' && hasSplitSecond(ctx, x.id, x.controller)))
        return [{ type: 'passPriority', player }];
      return priorityActions(ctx, player);
    }
    case 'declareAttackers': {
      const out: Action[] = [{ type: 'confirmAttackers', player }];
      const defender = defenderOf(ctx);
      // Planeswalkers the defending player controls can be attacked too.
      const walkers = s.battlefield.filter(
        (id) => obj(ctx, id).controller === defender && def(ctx, id).types.includes('Planeswalker'),
      );
      for (const id of s.battlefield) {
        const at = d.declared.find((x) => x.id === id);
        // Goaded creatures (and Galactus) attack each combat if able: they can't be taken back.
        if (at && !mustAttack(ctx, id)) out.push({ type: 'removeAttacker', player, attacker: id });
        // Propaganda: only as many attackers as they can pay for.
        else if (
          isCreature(ctx, id) &&
          canAttack(ctx, id) &&
          d.declared.length < affordableAttackers(ctx, player)
        )
          out.push({ type: 'addAttacker', player, attacker: id, defender });
        if (at || (isCreature(ctx, id) && canAttack(ctx, id)))
          for (const pw of walkers)
            if (at?.planeswalker !== pw)
              out.push({ type: 'addAttacker', player, attacker: id, defender, planeswalker: pw });
      }
      return out;
    }
    case 'declareBlockers': {
      const out: Action[] = [];
      if (blockViolations(ctx, d.declared).length === 0)
        out.push({ type: 'confirmBlockers', player });
      const declared = new Set(d.declared.map((x) => x.blocker));
      for (const id of s.battlefield) {
        if (obj(ctx, id).controller !== player) continue;
        if (declared.has(id)) {
          out.push({ type: 'removeBlock', player, blocker: id });
          continue;
        }
        for (const a of s.combat?.attackers ?? []) {
          if (canBlock(ctx, id, a.id))
            out.push({ type: 'addBlock', player, blocker: id, attacker: a.id });
        }
      }
      return out;
    }
    case 'optionalEffect':
      return [
        { type: 'chooseEffect', player, accept: false },
        ...(canPayFrom(d.cost, manaSources(ctx, player))
          ? [{ type: 'chooseEffect' as const, player, accept: true }]
          : []),
      ];
    case 'scry':
      return scryAnswers(d.cards).map(({ top, bottom }) => ({ type: 'scry', player, top, bottom }));
    case 'discard':
      return [
        ...s.players[player].hand
          .filter((card) => !d.filter || cardMatches(ctx, card, d.filter))
          .map((card) => ({ type: 'discard', player, card }) as const),
        // Strixhaven (13c): "any number": you may stop.
        ...(d.anyNumber ? [{ type: 'chooseEffect', player, accept: false } as const] : []),
      ];
    case 'pickCards':
      return [
        ...d.options.map((card) => ({ type: 'chooseCard', player, card }) as const),
        // Strixhaven (13c): "any number": stop here.
        ...(d.upTo ? [{ type: 'chooseCard', player, card: null } as const] : []),
      ];
    case 'splitPiles':
      return pileSplits(d.cards).map((faceUp) => ({ type: 'splitPiles', player, faceUp }));
    case 'choosePile':
      return [
        { type: 'choosePile', player, pile: 'faceUp' },
        { type: 'choosePile', player, pile: 'faceDown' },
      ];
    case 'sacrifice':
    case 'pickExiled':
      return d.options.map((card) => ({ type: 'chooseCard', player, card }) as const);
    case 'forage':
      return [
        ...d.foods.map((choice) => ({ type: 'forage', player, choice }) as const),
        ...(d.graveyard ? [{ type: 'forage', player, choice: 'graveyard' } as const] : []),
        ...(d.optional ? [{ type: 'forage', player, choice: null } as const] : []),
      ];
    case 'chooseFromHand':
      return d.options.length
        ? d.options.map((card) => ({ type: 'chooseCard', player, card }) as const)
        : [{ type: 'chooseCard', player, card: null }];
    case 'chooseOption':
      return d.options.map((_, index) => ({ type: 'chooseOption', player, index }) as const);
    case 'sacrificeSeveral':
      return d.options.map((card) => ({ type: 'chooseCard', player, card }) as const);
    case 'castFree': {
      const out: Action[] = [{ type: 'chooseEffect', player, accept: false }];
      if (combatLocked(ctx)) return out; // Reality Fracture (17a): Yuriko
      const pool = manaSources(ctx, player);
      for (const card of d.cards) {
        const cd = def(ctx, card);
        if (cd.types.includes('Land')) continue;
        const zone = obj(ctx, card).zone;
        const discards = d.discardInstead ? s.players[player].hand : [undefined];
        // Strixhaven (13c): a cast that costs {1} (Jadzi) or is {4} cheaper (Uvilda).
        const price =
          d.pay ??
          (d.costLess
            ? { ...cd.manaCost, generic: Math.max(0, cd.manaCost.generic - d.costLess) }
            : undefined);
        if (price && !canPayFrom(price, manaSources(ctx, player))) continue;
        for (const v of castVariants(cd, obj(ctx, card).zone, 'free')) {
          // Additional sacrifice or forage costs aren't offered on free casts (a simplification).
          if (v.sacrifice || v.forage) continue;
          // Demand Answers, Bone Shards: the discard variant discards a card, the other one doesn't.
          const vDiscards =
            v.discard === undefined ? discards : v.discard ? s.players[player].hand : [undefined];
          const specs = v.spell?.targets ?? (cd.enchant ? [cd.enchant] : []);
          for (const targets of targetCombos(ctx, specs, { controller: player, sourceId: card })) {
            // Free casts still pay ward.
            if (!canPayFrom(wardCost(ctx, player, targets), pool)) continue;
            // Reality Fracture (17a): Thalia, the Survivor: a free cast still pays what costs more.
            if (
              !price &&
              s.battlefield.some((id) =>
                def(ctx, id).abilities.some(
                  (a) => a.kind === 'static' && a.effect.kind === 'opponentSpellsCostMore',
                ),
              ) &&
              !canPayFrom(
                castCost(
                  ctx,
                  player,
                  card,
                  { via: 'free', ...(v.kicked ? { kicked: true } : {}) },
                  targets,
                ),
                pool,
              )
            )
              continue;
            if (wardLife(ctx, player, targets) > s.players[player].life) continue;
            if (!wardPayable(ctx, player, targets, zone === 'hand' ? 1 : 0)) continue;
            for (const discard of vDiscards)
              out.push({
                type: 'castSpell',
                player,
                card,
                targets,
                free: true,
                ...(v.mode !== undefined ? { mode: v.mode } : {}),
                ...(v.kicked ? { kicked: true } : {}),
                ...(v.paws ? { paws: v.paws } : {}),
                ...(discard ? { discard } : {}),
              });
          }
        }
      }
      return out;
    }
    case 'chooseObject':
      return [
        ...d.options.map((card) => ({ type: 'chooseCard', player, card }) as const),
        // Final Fantasy (11a): saga creatures (Garnet may stop choosing).
        ...(d.optional ? [{ type: 'chooseCard', player, card: null } as const] : []),
      ];
    case 'payOrCounter':
      return [
        { type: 'chooseEffect', player, accept: false },
        ...(canPayFrom(d.cost, manaSources(ctx, player))
          ? [{ type: 'chooseEffect' as const, player, accept: true }]
          : []),
      ];
    case 'forageExile':
      return s.players[player].graveyard.map(
        (card) => ({ type: 'chooseCard', player, card }) as const,
      );
    case 'punisher':
      return [
        ...d.options.map((card) => ({ type: 'chooseCard', player, card }) as const),
        { type: 'chooseCard', player, card: null },
      ];
    case 'searchLibrary': {
      // One option per distinct card name is enough (they are interchangeable).
      const seen = new Set<string>();
      const out: Action[] = [];
      for (const card of d.options) {
        const defId = obj(ctx, card).defId;
        if (seen.has(defId)) continue;
        seen.add(defId);
        out.push({ type: 'chooseCard', player, card });
      }
      if (!d.required || !d.options.length) out.push({ type: 'chooseCard', player, card: null });
      // Strixhaven (13c): The Biblioplex: put the card looked at into the graveyard.
      if (d.canBin) out.push({ type: 'chooseEffect', player, accept: true });
      return out;
    }
    case 'chooseTriggerTargets': {
      const t = d.trigger;
      const a = triggeredAbility(ctx, t);
      const src = {
        controller: player,
        sourceId: t.source.id,
        ...(t.subject ? { subjectId: t.subject.id } : {}),
      };
      const pool = manaSources(ctx, player);
      const out: Action[] = [];
      // "You may pay" and ward: only offered if they can pay.
      const payable = (targets: TargetChoice[]) =>
        canPayFrom(addCosts(a.cost ?? NO_COST, wardCost(ctx, player, targets)), pool) &&
        wardPayable(ctx, player, targets) &&
        (a.lifeCost ?? 0) <= s.players[player].life;
      // Marvel Super Heroes Jumpstart (Blink): "any number of targets", one at a time. Done (the
      // targets so far) comes first, then each further target.
      if (d.picked) {
        const picked = d.picked;
        const spec = a.targets[picked.length] ?? a.targets[a.targets.length - 1]!;
        const canStop = picked.length >= a.targets.length - 1 || spec.optional;
        if (canStop && (picked.length === 0 || payable(picked)))
          out.push({ type: 'chooseTargets', player, targets: picked });
        const key = (t: TargetChoice) => ('object' in t ? t.object.id : t.player);
        const taken = new Set(picked.map(key));
        // Reality Fracture (17a): Seasoned Cryomancer, "up to that many target creatures".
        const full = !!spec.maxFromAmount && picked.length >= (d.trigger.amount ?? 0);
        for (const t of full ? [] : targetCandidates(ctx, spec, src))
          if (
            !taken.has(key(t)) &&
            payable([...picked, t]) &&
            // Reality Fracture (17a): Uldaros Theorix, one card of each card type.
            (!spec.onePerType ||
              standForDistinctTypes(
                ctx,
                [...picked, t].flatMap((x) => ('object' in x ? [x.object.id] : [])),
              ))
          )
            out.push({ type: 'chooseTargets', player, targets: [...picked, t] });
        if (out.length === 0) out.push({ type: 'chooseTargets', player, targets: [] });
        return out;
      }
      if (a.modes) {
        // Kimoyo Beads: "choose one that hasn't been chosen".
        const used = a.modesOnce ? (s.objects[d.trigger.source.id]?.usedModes ?? []) : [];
        a.modes.forEach((m, mode) => {
          if (used.includes(mode)) return;
          for (const targets of targetCombos(ctx, m.targets, src))
            if (payable(targets)) out.push({ type: 'chooseTargets', player, targets, mode });
        });
        if (out.length === 0) out.push({ type: 'chooseTargets', player, targets: [] });
        return out;
      }
      for (const targets of targetCombos(ctx, a.targets, src))
        if (payable(targets)) out.push({ type: 'chooseTargets', player, targets });
      // Optional, or every choice is unaffordable because of ward: nothing happens
      // (ward would counter it).
      if (a.optional || a.cost || out.length === 0)
        out.push({ type: 'chooseTargets', player, targets: [] });
      return out;
    }
  }
}
