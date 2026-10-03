import {
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
import { castVariants, spellTags } from './spells.ts';
import {
  abilityManaCost,
  castCost,
  teamworkFor,
  crewFor,
  escalateCrew,
  artifactsToSacrifice,
  countersYouControl,
  hasStatic,
  wardCost,
  LOYALTY_KEY,
  tokensToTap,
  wardLife,
  wardPayable,
} from './stack.ts';
import { addCosts } from './spells.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';

const NO_COST = { generic: 0, colored: {} };
import { targetCombos } from './targets.ts';
import type { Action, ObjectId, PlayerId, TargetChoice, TargetSpec } from './types.ts';

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
  const landsFromGraveyard = hasStatic(ctx, player, 'playLandsFromGraveyard');
  for (const id of ps.graveyard) {
    const d = def(ctx, id);
    // Conduit of Worlds: "You may play lands from your graveyard."
    if (d.types.includes('Land')) {
      if (landsFromGraveyard) out.push(id);
      continue;
    }
    if (
      d.flashback ||
      d.castFromGraveyardRemovingCounters ||
      d.castFromGraveyardWithDiscard ||
      mayhemReady(ctx, id) ||
      graveyardVias(ctx, player, id).length
    )
      out.push(id);
  }
  // Cruelclaw's Heist: an opponent's exiled card you may cast.
  for (const id of ctx.s.players[other(player)].exile)
    if (obj(ctx, id).castableBy === player) out.push(id);
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
          // Final Fantasy Commander (12c): Ranger Class level 3.
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id)) &&
          !out.includes(topCard)
        )
          out.push(topCard);
    }
  // Strongbox Raider: exiled cards you may play for a while.
  for (const id of ps.exile) {
    const until = obj(ctx, id).playableUntilTurn;
    if (until !== undefined && until >= ctx.s.turn.number) out.push(id);
  }
  // Extract Power: either player's exiled cards you may play for free.
  for (const p of ['p1', 'p2'] as const)
    for (const id of ctx.s.players[p].exile)
      if (obj(ctx, id).playFreeBy === player && !out.includes(id)) out.push(id);
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
  if (!d.sacrificeAnyForReduction) return [undefined];
  const fodder = ctx.s.battlefield
    .filter((id) => obj(ctx, id).controller === player && !def(ctx, id).types.includes('Land'))
    .sort(
      (a, b) =>
        Number(obj(ctx, b).isToken) - Number(obj(ctx, a).isToken) ||
        manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
    );
  const out: (ObjectId[] | undefined)[] = [undefined];
  for (let k = 1; k <= Math.min(fodder.length, d.manaCost.generic); k++)
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
): ('festival' | 'osteomancer' | 'conduit')[] {
  const d = def(ctx, card);
  const out: ('festival' | 'osteomancer' | 'conduit')[] = [];
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
  return out;
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

function priorityActions(ctx: Ctx, player: PlayerId): Action[] {
  const s = ctx.s;
  const out: Action[] = [{ type: 'passPriority', player }];
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
  const restricted = s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) =>
          (a.kind === 'mana' && !!a.onlyFor) ||
          (a.kind === 'static' && a.effect.kind === 'grantMana' && !!a.effect.onlyForCreatures),
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
        (zone !== 'graveyard' || hasStatic(ctx, player, 'playLandsFromGraveyard'))
      )
        out.push({ type: 'playLand', player, card });
      return;
    }
    if (d.castOnlyIf && !checkCondition(ctx, d.castOnlyIf, player, obj(ctx, card))) return;
    const firstOfCard = out.length;
    const instantSpeed =
      d.types.includes('Instant') ||
      d.keywords.includes('flash') ||
      flashFilters.some((f) => cardMatches(ctx, card, f)) ||
      // Progenitor's Icon: spells of the chosen type have flash this turn.
      !!s.turn.flashTypes?.some((f) => f.player === player && d.subtypes.includes(f.type));
    // Restricted mana (Giada: only for Angels; Villages: only for creature spells).
    const base = restricted ? manaSources(ctx, player, undefined, spellTags(d)) : sources;
    // Convoke: untapped creatures can pay for {1} each.
    let pool = d.convoke ? [...base, ...creatureHelpers(ctx, player, base)] : base;
    if (hasImprovise(ctx, player, card))
      pool = [...pool, ...artifactHelpers(ctx, player, pool, card)];
    // {X}: every affordable value (up to 10).
    const xs = d.manaCost.x
      ? Array.from(
          { length: Math.min(10, Math.floor(pool.length / d.manaCost.x)) + 1 },
          (_, x) => x,
        )
      : // Toxic Deluge: X life, up to one less than you have.
        d.payXLife
        ? Array.from({ length: Math.min(13, ps.life - 1) + 1 }, (_, x) => x)
        : [undefined];
    // A card to discard as an additional cost (Sazacap's Brew).
    // Dragon Man: from the graveyard, discarding a card as well.
    const discardToCast =
      d.discardToCast || (zone === 'graveyard' && d.castFromGraveyardWithDiscard);
    const discards = discardToCast ? ps.hand.filter((id) => id !== card) : [undefined];
    if (d.discardToCast && discards.length === 0) return;
    if (!instantSpeed && !sorcery) return;
    // The usual ways, plus graveyard casts through other cards.
    // Extract Power: exiled cards played for free.
    const free = zone === 'exile' && obj(ctx, card).playFreeBy === player;
    const vias: ('festival' | 'osteomancer' | 'conduit' | 'free' | undefined)[] = free
      ? ['free']
      : [
          ...(zone !== 'graveyard' ||
          d.flashback ||
          d.castFromGraveyardRemovingCounters ||
          d.castFromGraveyardWithDiscard ||
          mayhemReady(ctx, card)
            ? [undefined]
            : []),
          ...(zone === 'graveyard' ? graveyardVias(ctx, player, card) : []),
        ];
    for (const via of vias)
      for (const v of castVariants(d, zone, via)) {
        if ((v.life ?? 0) > ps.life) continue;
        if (v.removeCounters && countersYouControl(ctx, player) < v.removeCounters) continue;
        // Escalate: enough untapped creatures to tap.
        if (v.spell?.escalate && escalateCrew(ctx, player, v.spell.escalate) === null) continue;
        // Rottenmouth Viper: sacrifice 0 to 5 nonland permanents (the least useful first).
        for (const sacrificeMany of sacrificePrefixes(ctx, player, card, d))
          for (const x of xs) {
            const choice = {
              sacrificeMany,
              via,
              mode: v.mode,
              paws: v.paws,
              kicked: v.kicked,
              kickCount: v.kickCount,
              sacrifice: v.sacrifice ? 'x' : undefined,
              forage: v.forage ? 'graveyard' : undefined,
              x,
            };
            // Teamwork: kicked only if there are creatures to tap.
            const teamwork = teamworkFor(ctx, player, card, { kicked: v.kicked });
            if (v.kicked && d.kicker?.teamwork !== undefined && !teamwork) continue;
            const base = castCost(ctx, player, card, choice);
            if (!canPayFrom(base, pool) && !d.costReductionIfTarget) continue;
            const extra = {
              ...(v.mode !== undefined ? { mode: v.mode } : {}),
              ...(v.kicked ? { kicked: true } : {}),
              ...(v.kickCount ? { kickCount: v.kickCount } : {}),
              ...(x !== undefined ? { x } : {}),
              ...(v.paws ? { paws: v.paws } : {}),
              ...(via ? { via } : {}),
              ...(sacrificeMany ? { sacrificeMany } : {}),
            };
            const specs = v.spell?.targets ?? (d.enchant ? [d.enchant] : []);
            const forages = v.forage ? forageChoices(ctx, player) : [undefined];
            // Ultimate Nullification: only a legendary creature.
            const sacrificeable = d.sacrificeToCastFilter
              ? creatures.filter((id) => matchesFilter(ctx, id, d.sacrificeToCastFilter))
              : creatures;
            for (const sacrifice of v.sacrifice ? sacrificeable : [undefined]) {
              for (const targets of combosFor(specs, card, sacrifice)) {
                const ward = wardCost(ctx, player, targets);
                // Dire Downdraft costs less with some targets.
                const cost = d.costReductionIfTarget
                  ? castCost(ctx, player, card, choice, targets)
                  : base;
                if (
                  (ward.generic || d.costReductionIfTarget) &&
                  !canPayFrom(addCosts(cost, ward), pool)
                )
                  continue;
                if (wardLife(ctx, player, targets) > s.players[player].life) continue;
                if (!wardPayable(ctx, player, targets, zone === 'hand' ? 1 : 0)) continue;
                for (const forage of forages)
                  for (const discard of discards) {
                    // Paying without what this cast sacrifices.
                    const spent = [
                      sacrifice,
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
  for (const card of silenced ? [] : castableCards(ctx, player)) {
    castsOf(card);
    // Modal double-faced cards: the back face can be cast from hand too.
    if (def(ctx, card).back && obj(ctx, card).zone === 'hand') {
      const from = out.length;
      withBackFace(ctx, card, () => castsOf(card));
      for (const a of out.slice(from)) if (a.type === 'castSpell') a.back = true;
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
  ];
  for (const source of abilitySources) {
    const zone = obj(ctx, source).zone;
    def(ctx, source).abilities.forEach((a, abilityIndex) => {
      if (a.kind !== 'activated') return;
      if ((a.fromGraveyard ? 'graveyard' : a.fromHand ? 'hand' : 'battlefield') !== zone) return;
      if (a.sorcerySpeed && !sorcery) return;
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
      const mana = abilityManaCost(ctx, source, a);
      if (!canPayFrom(mana, usable)) return;
      if (a.cost.tapTokens && tokensToTap(ctx, player, source).length < a.cost.tapTokens) return;
      if (a.cost.crew && !crewFor(ctx, player, source, a.cost.crew)) return;
      if (
        a.cost.sacrificeArtifacts &&
        !artifactsToSacrifice(ctx, player, a.cost.sacrificeArtifacts)
      )
        return;
      const discards = a.cost.discard ? ps.hand : [undefined];
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
          const ward = wardCost(ctx, player, targets);
          if (ward.generic && !canPayFrom(addCosts(mana ?? NO_COST, ward), usable)) continue;
          if (!wardPayable(ctx, player, targets)) continue;
          for (const forage of forages)
            for (const discard of discards) {
              const spent = [sacrifice, forage === 'graveyard' ? undefined : forage];
              if (mana && spent.some((id) => id && usable.some((p) => p.id === id))) {
                const rest = usable.filter((p) => !spent.includes(p.id));
                if (!canPayFrom(addCosts(mana, ward), rest)) continue;
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
    case 'priority':
      return priorityActions(ctx, player);
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
      return s.players[player].hand
        .filter((card) => !d.filter || cardMatches(ctx, card, d.filter))
        .map((card) => ({ type: 'discard', player, card }) as const);
    case 'pickCards':
      return d.options.map((card) => ({ type: 'chooseCard', player, card }) as const);
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
      for (const card of d.cards) {
        const cd = def(ctx, card);
        if (cd.types.includes('Land')) continue;
        const discards = d.discardInstead ? s.players[player].hand : [undefined];
        for (const v of castVariants(cd, obj(ctx, card).zone, 'free')) {
          // Additional sacrifice or forage costs aren't offered on free casts (a simplification).
          if (v.sacrifice || v.forage) continue;
          const specs = v.spell?.targets ?? (cd.enchant ? [cd.enchant] : []);
          for (const targets of targetCombos(ctx, specs, { controller: player, sourceId: card })) {
            // Final Fantasy Commander (12b): ward is still paid on a free cast (a Hero with ward {1}).
            const ward = wardCost(ctx, player, targets);
            if (ward.generic && !canPayFrom(ward, manaSources(ctx, player))) continue;
            if (wardLife(ctx, player, targets) > s.players[player].life) continue;
            if (!wardPayable(ctx, player, targets)) continue;
            for (const discard of discards)
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
      return d.options.map((card) => ({ type: 'chooseCard', player, card }) as const);
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
