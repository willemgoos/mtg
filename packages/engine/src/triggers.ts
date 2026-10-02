import {
  cardMatches,
  characteristics,
  countOf,
  creaturesOnBattlefield,
  matchesFilter,
} from './characteristics.ts';
import { type Ctx, def, defOf, obj, other } from './context.ts';
import { manaValue } from './cost.ts';
import type {
  AbilityDef,
  EffectDef,
  CardDefinition,
  ConditionDef,
  GameEvent,
  GameObject,
  ObjectId,
  CardFilter,
  PlayerId,
  StackItem,
  TargetChoice,
  TriggerDef,
} from './types.ts';

type Triggered = Extract<AbilityDef, { kind: 'triggered' }>;

export function checkCondition(
  ctx: Ctx,
  c: ConditionDef | undefined,
  controller: PlayerId,
  self: GameObject | undefined,
  /** Chosen targets, for conditions about them (resolution-time "if"). */
  targets?: readonly (TargetChoice | null)[],
  /** What caused the trigger, for intervening "if"s about it (Hawkeye). */
  subject?: GameObject,
): boolean {
  if (!c) return true;
  // Wakanda Forever (9c).
  if (c.kind === 'monarch') {
    const m = ctx.s.monarch;
    return c.who === 'none' ? !m : c.who === 'you' ? m === controller : !!m && m !== controller;
  }
  if (c.kind === 'monstrous') return !!self?.monstrous;
  if (c.kind === 'youCastSpellThisTurn') return (ctx.s.turn.spellsCast?.[controller] ?? 0) > 0;
  if (c.kind === 'yourStep')
    return ctx.s.turn.activePlayer === controller && c.steps.includes(ctx.s.turn.step);
  // Avengers Assemble (9b).
  if (c.kind === 'opponentCastSpellThisTurn')
    return (ctx.s.turn.spellsCast?.[other(controller)] ?? 0) > 0;
  if (c.kind === 'sourceTapped') return !!self?.tapped;
  if (c.kind === 'opponentAttackedLastTurn')
    return ctx.s.players[other(controller)].attackedLastTurn === true;
  if (c.kind === 'sourceDamagedSubject') return !!self && !!subject?.damagedBy?.includes(self.id);
  if (c.kind === 'targetMatches') {
    const t = targets?.[c.target];
    if (!t || !('object' in t)) return false;
    const o = ctx.s.objects[t.object.id];
    return !!o && o.zcc === t.object.zcc && matchesFilter(ctx, o.id, c.filter);
  }
  if (c.kind === 'amountAtLeast')
    return countOf(ctx, controller, c.amount, false, self?.id) >= c.min;
  if (c.kind === 'opponentHandHas')
    return ctx.s.players[other(controller)].hand.some((id) => cardMatches(ctx, id, c.filter));
  if (c.kind === 'opponentHandAtMost') return ctx.s.players[other(controller)].hand.length <= c.max;
  // Snarls: "you may reveal a Plains or Island card from your hand".
  if (c.kind === 'handHas')
    return ctx.s.players[controller].hand.some((id) => cardMatches(ctx, id, c.filter));
  if (c.kind === 'opponentHasMore') {
    const opp = other(controller);
    const count = (p: PlayerId) => {
      if (c.what === 'life') return ctx.s.players[p].life;
      if (c.what === 'cards') return ctx.s.players[p].hand.length;
      return ctx.s.battlefield.filter(
        (id) =>
          obj(ctx, id).controller === p &&
          def(ctx, id).types.includes(c.what === 'lands' ? 'Land' : 'Creature'),
      ).length;
    };
    return count(opp) > count(controller);
  }
  if (c.kind === 'graveyardLeftOrFoodSacrificed')
    return (
      (ctx.s.turn.leftGraveyard?.[controller] ?? 0) >= 3 ||
      (ctx.s.turn.foodsSacrificed?.[controller] ?? 0) > 0
    );
  if (c.kind === 'exiledCardTypes') {
    const types = new Set<string>();
    for (const id of self?.exiledWith ?? []) {
      const o = ctx.s.objects[id];
      if (o?.zone === 'exile') for (const t of def(ctx, id).types) types.add(t);
    }
    return types.size >= c.min;
  }
  if (c.kind === 'classLevel') {
    const level = self?.level ?? 1;
    return (
      (c.min === undefined || level >= c.min) && (c.exactly === undefined || level === c.exactly)
    );
  }
  if (c.kind === 'sourcePowerAtLeast')
    return !!self && characteristics(ctx, self.id).power >= c.min;
  if (c.kind === 'targetControlledByYou') {
    const t = targets?.[c.target];
    const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    return !!o && o.zone === 'battlefield' && o.controller === controller;
  }
  if (c.kind === 'lifeThisTurn') {
    const p = c.who === 'you' ? controller : other(controller);
    const gained = ctx.s.turn.lifeGains[p] > 0;
    const lost = (ctx.s.turn.lifeLost?.[p] ?? 0) > 0;
    if (c.either) return gained || lost;
    return (!c.gained || gained) && (!c.lost || lost);
  }
  if (c.kind === 'handSize') return ctx.s.players[controller].hand.length >= c.min;
  if (c.kind === 'all') return c.of.every((x) => checkCondition(ctx, x, controller, self, targets));
  if (c.kind === 'any') return c.of.some((x) => checkCondition(ctx, x, controller, self, targets));
  if (c.kind === 'not') return !checkCondition(ctx, c.condition, controller, self, targets);
  if (c.kind === 'resolvedThisTurn')
    return self?.resolutions?.turn === ctx.s.turn.number && self.resolutions.count === c.n;
  if (c.kind === 'controlsPermanents')
    return (
      ctx.s.battlefield.filter(
        (id) =>
          obj(ctx, id).controller === controller && matchesFilter(ctx, id, c.filter, self?.id),
      ).length >= c.min
    );
  if (c.kind === 'creatureDiedThisTurn') return ctx.s.turn.creaturesDied > 0;
  if (c.kind === 'opponentsTurn') return ctx.s.turn.activePlayer !== controller;
  if (c.kind === 'yourTurn') return ctx.s.turn.activePlayer === controller;
  // Marvel Super Heroes.
  if (c.kind === 'sourceEnteredThisTurn') return !!self && self.zoneTurn === ctx.s.turn.number;
  if (c.kind === 'controlsBasicLand')
    return ctx.s.battlefield.some(
      (id) =>
        ctx.s.objects[id]!.controller === controller &&
        def(ctx, id).supertypes.includes('Basic') &&
        def(ctx, id).types.includes('Land'),
    );
  if (c.kind === 'sourceCounters') return !!self && self.plusOneCounters >= c.min;
  if (c.kind === 'sourceAttacking')
    return !!self && !!ctx.s.combat?.attackers.some((a) => a.id === self.id);
  if (c.kind === 'beingAttacked')
    return !!ctx.s.combat?.attackers.some((a) => a.defender === controller);
  if (c.kind === 'opponentControlsCreature')
    return creaturesOnBattlefield(ctx, other(controller)).some((o) =>
      matchesFilter(ctx, o.id, c.filter),
    );
  if (c.kind === 'graveyardCount')
    return (
      countOf(ctx, controller, {
        count: 'cardsInGraveyard',
        ...(c.types ? { types: c.types } : {}),
      }) >= c.min
    );
  if (!self) return false;
  switch (c.kind) {
    case 'attackedThisTurn':
      return ctx.s.players[controller].attackedThisTurn;
    case 'controlsAnother':
      return creaturesOnBattlefield(ctx, controller).some(
        (o) => o.id !== self.id && def(ctx, o.id).subtypes.includes(c.subtype),
      );
    case 'controlsCreature':
      return (
        creaturesOnBattlefield(ctx, controller).filter((o) =>
          matchesFilter(ctx, o.id, c.filter, self.id),
        ).length >= (c.count ?? 1)
      );
    case 'wasKicked':
      return !!self.kicked;
    case 'diedWithout':
      return (
        !def(ctx, self.id).subtypes.includes(c.subtype) &&
        !self.lastAddedSubtypes?.includes(c.subtype)
      );
    case 'firstLifeGainThisTurn':
      return (
        (c.anyTurn || ctx.s.turn.activePlayer === controller) &&
        ctx.s.turn.lifeGains[controller] === 1
      );
    case 'firstAttackThisTurn':
      return ctx.s.turn.attackers.filter((id) => id === self.id).length === 1;
    case 'custom':
      throw new Error(`Custom condition "${c.handler}" not registered`);
  }
}

function queue(
  ctx: Ctx,
  o: GameObject,
  index: number,
  controller: PlayerId,
  subject?: GameObject,
  amount?: number,
): void {
  // "This ability triggers only once each turn."
  const a = defOf(ctx, o.defId).abilities[index];
  // "Whenever one or more ...": once for events collected together.
  if (a?.kind === 'triggered' && a.batch) {
    const key = `${o.id}:${o.zcc}:${index}`;
    if (ctx.batched.has(key)) return;
    ctx.batched.add(key);
  }
  if (a?.kind === 'triggered' && a.oncePerTurn) {
    if (o.onceTurns?.[index] === ctx.s.turn.number) return;
    o.onceTurns = { ...o.onceTurns, [index]: ctx.s.turn.number };
  }
  ctx.s.pendingTriggers.push({
    source: { id: o.id, zcc: o.zcc },
    sourceDefId: o.defId,
    abilityIndex: index,
    controller,
    ...(subject ? { subject: { id: subject.id, zcc: subject.zcc } } : {}),
    ...(amount !== undefined ? { amount } : {}),
  });
}

/** Calls `fn` for each triggered ability on each permanent on the battlefield. */
function forEachBattlefieldTrigger(
  ctx: Ctx,
  fn: (o: GameObject, a: Triggered, index: number) => boolean,
  subject?: GameObject,
  amount?: number,
): void {
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    def(ctx, id).abilities.forEach((a, i) => {
      if (a.kind !== 'triggered') return;
      if (fn(o, a, i) && checkCondition(ctx, a.condition, o.controller, o, undefined, subject))
        queue(ctx, o, i, o.controller, subject, amount);
    });
  }
}

function spellMatches(
  ctx: Ctx,
  t: Extract<TriggerDef, { on: 'castSpell' }>,
  spell: CardDefinition,
  item: StackItem | undefined,
  self: GameObject,
): boolean {
  switch (t.filter) {
    case 'any':
      return true;
    case 'creature':
      return spell.types.includes('Creature');
    case 'noncreature':
      return !spell.types.includes('Creature');
    case 'instantOrSorcery':
      return spell.types.includes('Instant') || spell.types.includes('Sorcery');
    case 'targetsSelf':
      return !!item?.targets.some(
        (x) => 'object' in x && x.object.id === self.id && x.object.zcc === self.zcc,
      );
    case 'firstOfItsKind': {
      // Alania: the first instant, the first sorcery, or the first Otter spell other than itself.
      const cast = (ctx.s.turn.castDefs?.[self.controller] ?? []).map((id) => defOf(ctx, id));
      const count = (test: (d: CardDefinition) => boolean) => cast.filter(test).length;
      const otter = (d: CardDefinition) => d.subtypes.includes('Otter') && d.id !== self.defId;
      return (
        (spell.types.includes('Instant') && count((d) => d.types.includes('Instant')) === 1) ||
        (spell.types.includes('Sorcery') && count((d) => d.types.includes('Sorcery')) === 1) ||
        (otter(spell) && count(otter) === 1)
      );
    }
  }
}

function detect(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'objectMoved': {
      const moved = s.objects[ev.id];
      const movedDef = defOf(ctx, ev.defId);
      if (ev.to === 'battlefield' && moved && moved.zone === 'battlefield') {
        const isCreature = movedDef.types.includes('Creature');
        const isLand = movedDef.types.includes('Land');
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => {
            const t = a.trigger;
            if (t.on === 'etb') return o.id === moved.id;
            if (t.on === 'otherCreatureEtb')
              return (
                isCreature &&
                o.id !== moved.id &&
                (t.controller === 'any' || o.controller === moved.controller) &&
                matchesFilter(ctx, moved.id, t.filter, o.id)
              );
            if (t.on === 'landfall') return isLand && o.controller === moved.controller;
            if (t.on === 'otherPermanentEtb')
              return (
                o.id !== moved.id &&
                o.controller === moved.controller &&
                matchesFilter(ctx, moved.id, t.filter)
              );
            if (t.on === 'selfOrCreatureEtb')
              return (
                o.id === moved.id ||
                (isCreature &&
                  o.controller === moved.controller &&
                  matchesFilter(ctx, moved.id, t.filter))
              );
            return false;
          },
          moved,
        );
      }
      if (
        ev.from === 'battlefield' &&
        ev.to !== 'graveyard' &&
        movedDef.types.includes('Creature')
      ) {
        const was = moved?.controller ?? moved?.owner;
        // "This creature ... leaves": it looks back from where it went.
        if (moved)
          movedDef.abilities.forEach((a, i) => {
            if (
              a.kind === 'triggered' &&
              a.trigger.on === 'leavesWithoutDying' &&
              a.trigger.who === 'selfOrOther'
            )
              queue(ctx, moved, i, moved.owner);
          });
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'leavesWithoutDying' && o.id !== ev.id && o.controller === was,
        );
      }
      // Ygra: "Whenever a Food is put into a graveyard from the battlefield".
      if (ev.from === 'battlefield' && ev.to === 'graveyard') {
        const ygra = (d: CardDefinition) =>
          d.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'creaturesAreFood');
        const wasFood =
          movedDef.subtypes.includes('Food') ||
          (movedDef.types.includes('Creature') &&
            !ygra(movedDef) &&
            s.battlefield.some((b) => ygra(defOf(ctx, s.objects[b]!.defId))));
        if (wasFood) forEachBattlefieldTrigger(ctx, (_o, a) => a.trigger.on === 'foodToGraveyard');
      }
      if (
        ev.from === 'battlefield' &&
        ev.to === 'graveyard' &&
        movedDef.types.includes('Creature')
      ) {
        // "Dies" triggers look back in time: the ability triggers from the graveyard card.
        const card = moved ?? null;
        movedDef.abilities.forEach((a, i) => {
          if (a.kind !== 'triggered') return;
          const t = a.trigger;
          if (t.on !== 'dies' && t.on !== 'creatureYouControlDies') return;
          if (t.on === 'creatureYouControlDies' && t.nontoken && (!card || card.isToken)) return;
          if (t.on === 'creatureYouControlDies' && t.filter && !defMatches(movedDef, t.filter))
            return;
          const controller = card?.owner ?? 'p1';
          if (card && checkCondition(ctx, a.condition, controller, card))
            queue(ctx, card, i, controller, card);
        });
        // Heroic Sacrifice: "When that creature dies this turn, ...".
        if (moved)
          for (const e of s.effects) {
            if (!e.onDies || e.affected.id !== ev.id || e.affected.zcc !== moved.zcc - 1) continue;
            s.pendingTriggers.push({
              source: { id: moved.id, zcc: moved.zcc },
              sourceDefId: e.onDies.sourceDefId,
              abilityIndex: -1,
              controller: e.onDies.controller,
              subject: { id: moved.id, zcc: moved.zcc },
              inline: e.onDies.effects,
            });
          }
        // Granted "when this dies, return it" (Undying Malice, Fake Your Own Death).
        if (moved) {
          for (const e of s.effects) {
            if (!e.returnWhenDies || e.affected.id !== ev.id || e.affected.zcc !== moved.zcc - 1)
              continue;
            const r = e.returnWhenDies;
            s.pendingTriggers.push({
              source: { id: moved.id, zcc: moved.zcc },
              sourceDefId: moved.defId,
              abilityIndex: -1,
              controller: moved.owner,
              inline: [
                { kind: 'returnSource', to: 'battlefield', tapped: true, counters: r.counters },
                ...(r.treasure
                  ? [{ kind: 'createToken', token: 'treasure-token', count: 1 } as const]
                  : []),
              ],
            });
          }
        }
        // Tokens cease to exist, so a missing object was a token.
        const wasToken = !moved || moved.isToken;
        const diedUnder = moved?.owner;
        // Auras that already went to the graveyard alongside it look back in time.
        if (moved) {
          for (const pid of Object.keys(s.players) as PlayerId[]) {
            for (const gid of s.players[pid].graveyard) {
              const g = s.objects[gid]!;
              const was = g.lastAttachedTo;
              // It must have left after the creature (not an Aura destroyed earlier).
              if (!was || was.id !== ev.id || was.zcc !== moved.zcc - 1) continue;
              if (g.timestamp < moved.timestamp) continue;
              def(ctx, gid).abilities.forEach((a, i) => {
                if (a.kind === 'triggered' && a.trigger.on === 'attachedDies')
                  queue(ctx, g, i, g.owner);
              });
            }
          }
        }
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => {
            const t = a.trigger;
            if (t.on === 'attachedDies') return o.attachedTo === ev.id;
            if (t.on !== 'otherCreatureDies' && t.on !== 'creatureYouControlDies') return false;
            if (o.id === ev.id) return false;
            if (t.nontoken && wasToken) return false;
            if (t.on === 'creatureYouControlDies' && t.filter && !defMatches(movedDef, t.filter))
              return false;
            if (diedUnder === undefined) return true;
            if (t.on === 'otherCreatureDies' && t.controller === 'any') return true;
            if (t.on === 'otherCreatureDies' && t.controller === 'opponent')
              return o.controller !== diedUnder;
            return o.controller === diedUnder;
          },
          moved,
        );
      }
      return;
    }
    case 'cardDrawn': {
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          (a.trigger.on === 'drawSecondCard' &&
            ev.nth === 2 &&
            (a.trigger.whose === 'opponents'
              ? o.controller !== ev.player
              : o.controller === ev.player)) ||
          (a.trigger.on === 'drawCard' &&
            (a.trigger.whose === 'yours'
              ? o.controller === ev.player
              : o.controller !== ev.player)),
      );
      return;
    }
    case 'lifeChanged': {
      const yours = s.turn.activePlayer === ev.player;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          o.controller === ev.player &&
          ((a.trigger.on === 'youGainLife' && ev.delta > 0) ||
            (a.trigger.on === 'youGainOrLoseLife' && (!a.trigger.duringYourTurn || yours))),
      );
      return;
    }
    case 'spellCast': {
      const spellObj = obj(ctx, ev.id);
      const spell = defOf(ctx, spellObj.defId);
      const item = s.stack.find((x) => x.id === ev.id);
      // "X is the mana value of that spell" (Ovika).
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'castSpell' &&
          (a.trigger.anyPlayerOffTurn
            ? s.turn.activePlayer !== ev.player
            : o.controller === ev.player) &&
          spellMatches(ctx, a.trigger, spell, item, o) &&
          (!a.trigger.spell || cardMatches(ctx, ev.id, a.trigger.spell, o.id)),
        spellObj,
        manaValueOf(spell),
      );
      if (ev.nth === 2)
        forEachBattlefieldTrigger(ctx, (_o, a) => a.trigger.on === 'anyPlayerSecondSpell');
      // Emblems: "whenever you cast a spell" (Season of the Bold, Ral).
      for (const e of s.emblems ?? []) {
        const a = e.ability;
        if (a.kind !== 'triggered' || a.trigger.on !== 'castSpell' || e.controller !== ev.player)
          continue;
        if (!spellMatches(ctx, a.trigger, spell, item, spellObj)) continue;
        s.pendingTriggers.push({
          source: e.source,
          sourceDefId: e.sourceDefId,
          abilityIndex: -1,
          controller: e.controller,
          emblem: a,
          subject: { id: spellObj.id, zcc: spellObj.zcc },
          // Storm: the spells cast before it this turn.
          amount: (ev.nth ?? 1) - 1,
        });
      }
      return;
    }
    case 'attackersDeclared': {
      const ap = s.turn.activePlayer;
      const attackedWith = (f: CardFilter | undefined, source?: ObjectId) =>
        ev.attackers.some((id) => !!s.objects[id] && matchesFilter(ctx, id, f, source));
      forEachBattlefieldTrigger(ctx, (o, a) => {
        if (a.trigger.on === 'attacks')
          return ev.attackers.includes(o.id) && (!a.trigger.alone || ev.attackers.length === 1);
        if (a.trigger.on === 'youAttack')
          return o.controller === ap && attackedWith(a.trigger.filter, o.id);
        return false;
      });
      // Wakanda Forever (9c): Equipment on an attacker; the defending player's "attacks you" triggers.
      forEachBattlefieldTrigger(ctx, (o, a) => {
        const t = a.trigger;
        if (t.on === 'equippedAttacks')
          return o.attachedTo !== undefined && ev.attackers.includes(o.attachedTo);
        if (t.on === 'opponentAttacks') return o.controller !== ap && ev.attackers.length >= t.min;
        return false;
      });
      for (const id of ev.attackers) {
        const attacker = s.objects[id];
        if (!attacker) continue;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'opponentCreatureAttacks' &&
            o.controller !== attacker.controller &&
            matchesFilter(ctx, id, a.trigger.filter, o.id),
          attacker,
        );
      }
      // From the graveyard (Persistent Marshstalker).
      for (const id of s.players[ap].graveyard) {
        const card = s.objects[id]!;
        def(ctx, id).abilities.forEach((a, i) => {
          if (a.kind !== 'triggered' || !a.fromGraveyard) return;
          if (a.trigger.on === 'youAttack' && attackedWith(a.trigger.filter))
            if (checkCondition(ctx, a.condition, ap, card)) queue(ctx, card, i, ap);
        });
      }
      // "Whenever a creature you control attacks": once per attacker.
      for (const id of ev.attackers) {
        const attacker = s.objects[id];
        if (!attacker) continue;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'creatureYouControlAttacks' &&
            o.controller === attacker.controller &&
            (!a.trigger.alone || ev.attackers.length === 1) &&
            matchesFilter(ctx, id, a.trigger.filter, o.id),
          attacker,
        );
      }
      return;
    }
    case 'blockersDeclared': {
      const blocked = new Set(ev.blocks.map((b) => b.attacker));
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'becomesBlocked' && blocked.has(o.id),
      );
      // Coveted Jewel: attackers that weren't blocked.
      const unblocked = (s.combat?.attackers ?? []).filter((a) => !blocked.has(a.id));
      if (unblocked.length)
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'opponentAttackersUnblocked' &&
            o.controller !== s.turn.activePlayer &&
            unblocked.some((u) => u.defender === o.controller),
        );
      // She-Hulk: "whenever a Hero you control becomes blocked" (amount: its blockers).
      for (const id of blocked) {
        const attacker = s.objects[id];
        if (!attacker) continue;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'creatureYouControlBecomesBlocked' &&
            o.controller === attacker.controller &&
            matchesFilter(ctx, id, a.trigger.filter, o.id),
          attacker,
          ev.blocks.filter((b) => b.attacker === id).length,
        );
      }
      return;
    }
    case 'tapped': {
      // Captain America, Living Legend: the first time a creature you control becomes tapped during your turn.
      const tapped = s.objects[ev.id];
      if (!ev.first || !tapped || tapped.controller !== s.turn.activePlayer) return;
      if (!def(ctx, ev.id).types.includes('Creature')) return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'creatureYouControlFirstTappedOnYourTurn' &&
          o.controller === tapped.controller,
        tapped,
      );
      return;
    }
    case 'damageDealt': {
      // Hercules: "whenever this creature is dealt damage".
      if ('object' in ev.to) {
        const hurt = s.objects[ev.to.object.id];
        if (hurt?.zone === 'battlefield')
          def(ctx, hurt.id).abilities.forEach((a, i) => {
            if (a.kind === 'triggered' && a.trigger.on === 'dealtDamage')
              queue(ctx, hurt, i, hurt.controller, undefined, ev.amount);
          });
      }
      if (!ev.combat) {
        // Niv-Mizzet: noncombat damage to an opponent from a source you control.
        const src = s.objects[ev.source];
        const by = src?.controller;
        if (!by || !('player' in ev.to) || ev.to.player === by) return;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'yourNoncombatDamageToOpponent' && o.controller === by,
          undefined,
          ev.amount,
        );
        return;
      }
      const src = s.objects[ev.source];
      if (!src || src.zone !== 'battlefield') return;
      if (
        s.effects.some(
          (e) => e.blinkOnCombatDamage && e.affected.id === src.id && e.affected.zcc === src.zcc,
        )
      )
        s.pendingTriggers.push({
          source: { id: src.id, zcc: src.zcc },
          sourceDefId: src.defId,
          abilityIndex: -1,
          controller: src.controller,
          inline: [{ kind: 'may', effects: [{ kind: 'blink', what: 'self' }] }],
        });
      if (src.controller === s.turn.activePlayer)
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'creatureYouControlDealsCombatDamage' &&
            o.controller === src.controller &&
            (!a.trigger.toPlayer || 'player' in ev.to) &&
            matchesFilter(ctx, src.id, a.trigger.filter, o.id),
          src,
          ev.amount,
        );
      if (!('player' in ev.to)) return;
      // Love on the Battlefield: "put a +1/+1 counter on it".
      if (
        s.effects.some(
          (e) => e.counterOnCombatDamage && e.affected.id === src.id && e.affected.zcc === src.zcc,
        )
      )
        s.pendingTriggers.push({
          source: { id: src.id, zcc: src.zcc },
          sourceDefId: src.defId,
          abilityIndex: -1,
          controller: src.controller,
          inline: [{ kind: 'counters', to: 'self', amount: 1 }],
        });
      // "Whenever one or more Birds you control deal combat damage to a player" (batched).
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'creaturesYouControlDealCombatDamageToPlayer' &&
          o.controller === src.controller &&
          matchesFilter(ctx, src.id, a.trigger.filter),
      );
      def(ctx, src.id).abilities.forEach((a, i) => {
        if (a.kind === 'triggered' && a.trigger.on === 'combatDamageToPlayer')
          queue(ctx, src, i, src.controller, undefined, ev.amount);
      });
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'equippedDealsCombatDamageToPlayer' && o.attachedTo === src.id,
      );
      return;
    }
    case 'sacrificed': {
      // "When you sacrifice this": looks back from wherever the card went.
      const card = s.objects[ev.id];
      const d = defOf(ctx, ev.defId);
      if (card)
        d.abilities.forEach((a, i) => {
          if (a.kind === 'triggered' && a.trigger.on === 'sacrificed')
            queue(ctx, card, i, ev.player);
        });
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'youSacrifice' &&
          o.controller === ev.player &&
          defMatches(d, a.trigger.filter),
      );
      return;
    }
    case 'foraged':
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'youForage' && o.controller === ev.player,
      );
      return;
    case 'giftGiven':
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'youGiveGift' && o.controller === ev.player,
      );
      return;
    case 'countersAdded': {
      const target = s.objects[ev.id];
      if (!target || target.zone !== 'battlefield' || !def(ctx, ev.id).types.includes('Creature'))
        return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'youPutCounters' &&
          o.controller === target.controller &&
          !(a.trigger.other && o.id === target.id) &&
          matchesFilter(ctx, target.id, a.trigger.filter, o.id),
        target,
        ev.count,
      );
      return;
    }
    case 'levelChanged': {
      const o = s.objects[ev.id];
      if (!o) return;
      def(ctx, o.id).abilities.forEach((a, i) => {
        if (
          a.kind === 'triggered' &&
          a.trigger.on === 'becomesLevel' &&
          a.trigger.level === ev.level
        )
          queue(ctx, o, i, o.controller);
      });
      return;
    }
    case 'tappedForTeamwork': {
      const o = s.objects[ev.id];
      if (!o) return;
      def(ctx, o.id).abilities.forEach((a, i) => {
        if (a.kind === 'triggered' && a.trigger.on === 'tappedForTeamwork')
          queue(ctx, o, i, o.controller);
      });
      return;
    }
    case 'manaSpent': {
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'expend' &&
          o.controller === ev.player &&
          ev.before < a.trigger.amount &&
          ev.after >= a.trigger.amount,
      );
      return;
    }
    case 'targeted': {
      for (const id of ev.ids) {
        const o = s.objects[id];
        if (!o || o.zone !== 'battlefield' || o.controller === ev.player) continue;
        if (!def(ctx, id).types.includes('Creature')) continue;
        forEachBattlefieldTrigger(
          ctx,
          (src, a) =>
            a.trigger.on === 'yourCreatureTargetedByOpponent' && src.controller === o.controller,
          o,
        );
      }
      // Valiant: the first time each turn its controller's spell or ability targets it.
      for (const id of ev.ids) {
        const o = s.objects[id];
        if (!o || o.zone !== 'battlefield' || o.controller !== ev.player) continue;
        if (o.targetedByControllerTurn === s.turn.number) continue;
        o.targetedByControllerTurn = s.turn.number;
        def(ctx, id).abilities.forEach((a, i) => {
          if (a.kind === 'triggered' && a.trigger.on === 'valiant') queue(ctx, o, i, o.controller);
        });
      }
      return;
    }
    case 'stepChanged': {
      if (ev.step === 'beginCombat') {
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'beginningOfCombat' && o.controller === ev.activePlayer,
        );
        return;
      }
      if (ev.step === 'draw') {
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'beginningOfDraw' && o.controller === ev.activePlayer,
        );
        return;
      }
      if (ev.step === 'main1' || ev.step === 'main2') {
        const which = ev.step === 'main1' ? 1 : 2;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'beginningOfMain' &&
            a.trigger.which === which &&
            o.controller === ev.activePlayer,
        );
        return;
      }
      if ((ev.step === 'end' || ev.step === 'upkeep') && s.delayed?.length) {
        // "At the beginning of the next end step" (or upkeep): the ones due now.
        const isDue = (d: { fromTurn: number; whose?: PlayerId; at?: 'upkeep' }) =>
          (d.at === 'upkeep') === (ev.step === 'upkeep') &&
          d.fromTurn <= ev.turn &&
          (!d.whose || d.whose === ev.activePlayer);
        const due = s.delayed.filter(isDue);
        s.delayed = s.delayed.filter((d) => !isDue(d));
        for (const d of due)
          s.pendingTriggers.push({
            source: d.subject,
            sourceDefId: d.sourceDefId,
            abilityIndex: -1,
            controller: d.controller,
            subject: d.subject,
            inline: d.effects,
          });
      }
      if (ev.step !== 'upkeep' && ev.step !== 'end') return;
      const on = ev.step === 'upkeep' ? 'beginningOfUpkeep' : 'beginningOfEndStep';
      forEachBattlefieldTrigger(ctx, (o, a) => {
        const t = a.trigger;
        if (t.on !== on) return false;
        if (t.whose === 'opponents') return o.controller !== ev.activePlayer;
        return t.whose === 'each' || o.controller === ev.activePlayer;
      });
      return;
    }
    default:
      return;
  }
}

/** Scans events emitted since the last call and queues any triggered abilities. */
export function collectTriggers(ctx: Ctx): void {
  ctx.batched.clear();
  while (ctx.triggerCursor < ctx.events.length) {
    const ev = ctx.events[ctx.triggerCursor++]!;
    detect(ctx, ev);
  }
}

/** APNAP: the active player's triggers go on the stack first. */
export function nextPendingTriggerIndex(ctx: Ctx): number {
  const ap = ctx.s.turn.activePlayer;
  const i = ctx.s.pendingTriggers.findIndex((t) => t.controller === ap);
  if (i >= 0) return i;
  return ctx.s.pendingTriggers.findIndex((t) => t.controller === other(ap));
}

/** Type and subtype checks against a card definition (for a permanent that has already left). */
function defMatches(d: CardDefinition, f: CardFilter): boolean {
  if (f.types && !f.types.some((t) => d.types.includes(t))) return false;
  if (f.hasKeyword && !d.keywords.includes(f.hasKeyword)) return false;
  if (f.subtype && !d.subtypes.includes(f.subtype)) return false;
  if (f.subtypes && !f.subtypes.some((st) => d.subtypes.includes(st))) return false;
  return true;
}

function manaValueOf(d: CardDefinition): number {
  return manaValue(d.manaCost);
}

/** The ability a pending trigger or stack item refers to (granted ones carry their effects). */
export function triggeredAbility(
  ctx: Ctx,
  t: {
    sourceDefId: string;
    abilityIndex: number;
    inline?: EffectDef[] | undefined;
    emblem?: AbilityDef | undefined;
  },
): Triggered {
  if (t.emblem?.kind === 'triggered') return t.emblem;
  if (t.inline)
    return { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: t.inline };
  const a = defOf(ctx, t.sourceDefId).abilities[t.abilityIndex];
  if (!a || a.kind !== 'triggered')
    throw new Error(`No triggered ability ${t.sourceDefId}#${t.abilityIndex}`);
  return a;
}
