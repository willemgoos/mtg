import { characteristics, creaturesOnBattlefield, power } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, drawCard, emit, moveObject, newTimestamp, obj } from './context.ts';
import { CREATURE_TYPES } from './creature-types.ts';
import { vividCount } from './ecl-18a.ts';
import { canEnchant } from './fra-white-effects.ts';
import { shuffleInPlace } from './rng.ts';
import { attachAura } from './stack.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { CardType, EffectDef, ObjectId, PlayerId } from './types.ts';

/**
 * Lorwyn Eclipsed (18b, green): the one-off effects of Spry and Mighty ("choose exactly two creatures you control"),
 * Selfless Safewright ("choose a creature type") and Aurora Awakener ("reveal cards until you reveal X permanent cards"),
 * as custom effects, and the choosers behind `chooseCustom` (each choice is made step by step).
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const choose = (handler: string, params: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  params,
});

const PERMANENT_TYPES: readonly CardType[] = [
  'Artifact',
  'Creature',
  'Enchantment',
  'Land',
  'Planeswalker',
];
const isPermanentCard = (ctx: Ctx, id: ObjectId) =>
  def(ctx, id).types.some((t) => PERMANENT_TYPES.includes(t));
const isAura = (ctx: Ctx, id: ObjectId) => def(ctx, id).subtypes.includes('Aura');

export const ECL_GREEN_EFFECTS: Record<string, CustomEffect> = {
  /** Spry and Mighty: you draw X cards and the two chosen creatures get +X/+X and trample, X being the difference of their powers. */
  eclSpryResolve(ctx, es, params) {
    const { a, b } = params as { a: ObjectId; b: ObjectId };
    const ids = [a, b].filter((id) => ctx.s.objects[id]?.zone === 'battlefield');
    if (ids.length < 2) return;
    const x = Math.abs(power(ctx, a) - power(ctx, b));
    for (let i = 0; i < x; i++) drawCard(ctx, es.controller);
    for (const id of ids)
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id, zcc: obj(ctx, id).zcc },
        power: x,
        toughness: x,
        keywords: ['trample'],
        expires: 'endOfTurn',
      });
  },

  /**
   * Aurora Awakener: reveal cards from the top of the library until X permanent cards are revealed (X = the colors among
   * permanents you control), then let the player put any number of them onto the battlefield (`eclAuroraPick`).
   */
  eclAuroraReveal(ctx, es) {
    const x = vividCount(ctx, es.controller);
    const lib = ctx.s.players[es.controller].library;
    const revealed: ObjectId[] = [];
    let found = 0;
    for (const id of lib) {
      if (found >= x) break;
      revealed.push(id);
      emit(ctx, { type: 'revealed', player: es.controller, id });
      if (isPermanentCard(ctx, id)) found++;
    }
    if (revealed.length === 0) return;
    const pile = { cards: revealed, chosen: [], auras: [] };
    // Nothing to put onto the battlefield: no choice to make.
    if (!revealed.some((id) => isPermanentCard(ctx, id))) auroraFinish(ctx, es.controller, pile);
    else (ctx.deferred ??= []).push(choose('eclAuroraPick', pile));
  },

  /** Aurora Awakener, last step: the chosen cards enter together, the rest go to the bottom in a random order. */
  eclAuroraFinish(ctx, es, params) {
    auroraFinish(ctx, es.controller, params as unknown as AuroraPile);
  },
};

interface AuroraPile {
  cards: ObjectId[];
  chosen: ObjectId[];
  auras: { aura: ObjectId; host: ObjectId }[];
}

function auroraFinish(ctx: Ctx, player: PlayerId, p: AuroraPile): void {
  const rest = p.cards.filter(
    (id) =>
      ctx.s.objects[id]?.zone === 'library' &&
      !p.chosen.includes(id) &&
      !p.auras.some((a) => a.aura === id),
  );
  for (const id of p.chosen)
    if (ctx.s.objects[id]?.zone === 'library')
      moveObject(ctx, id, 'battlefield', { controller: player });
  for (const { aura, host } of p.auras) {
    if (ctx.s.objects[aura]?.zone !== 'library') continue;
    const h = ctx.s.objects[host];
    if (!h || h.zone !== 'battlefield') continue;
    moveObject(ctx, aura, 'battlefield', { controller: player });
    attachAura(ctx, aura, host);
  }
  const lib = ctx.s.players[player].library;
  for (const id of rest) {
    const i = lib.indexOf(id);
    if (i >= 0) lib.splice(i, 1);
  }
  shuffleInPlace(ctx.s.rng, rest);
  lib.push(...rest);
}

/** The creature types a player can name: those in play and in their hand first, then all the others. */
function creatureTypeChoices(ctx: Ctx, player: 'p1' | 'p2'): string[] {
  const first = new Set<string>();
  const note = (id: ObjectId) => {
    const d = def(ctx, id);
    if (d.types.includes('Creature')) for (const t of d.subtypes) first.add(t);
  };
  for (const id of ctx.s.battlefield) note(id);
  for (const id of ctx.s.players[player].hand) note(id);
  return [...[...first].sort(), ...CREATURE_TYPES.filter((t) => !first.has(t))];
}

const ECL_GREEN_CHOOSERS: Record<string, Chooser> = {
  /** Spry and Mighty: choose the first creature, then the second (step by step, not every pair at once). */
  eclSpryPick(ctx, es, params) {
    const first = (params as { first?: ObjectId } | undefined)?.first;
    const creatures = creaturesOnBattlefield(ctx, es.controller);
    const label = (id: ObjectId) => {
      const c = characteristics(ctx, id);
      return `${def(ctx, id).name} (${c.power}/${c.toughness})`;
    };
    if (first === undefined) {
      if (creatures.length < 2) return null;
      return {
        title: 'Spry and Mighty: choose the first of two creatures',
        options: creatures.map((c) => ({
          label: label(c.id),
          effects: [choose('eclSpryPick', { first: c.id })],
        })),
      };
    }
    return {
      title: `Spry and Mighty: choose the second creature (with ${label(first)})`,
      options: creatures
        .filter((c) => c.id !== first)
        .map((c) => ({
          label: label(c.id),
          effects: [custom('eclSpryResolve', { a: first, b: c.id })],
        })),
    };
  },

  /** Selfless Safewright: choose a creature type; other permanents you control of that type gain hexproof and indestructible. */
  eclSafewrightType(ctx, es) {
    return {
      title: 'Choose a creature type',
      options: creatureTypeChoices(ctx, es.controller).map((type) => ({
        label: type,
        effects: [
          {
            kind: 'pump',
            to: {
              each: 'permanent',
              controller: 'you',
              filter: { subtype: type, other: true },
            },
            power: 0,
            toughness: 0,
            keywords: ['hexproof', 'indestructible'],
          },
        ],
      })),
    };
  },

  /** Aurora Awakener: put any number of the revealed permanent cards onto the battlefield, one at a time. */
  eclAuroraPick(ctx, es, params) {
    const p = params as {
      cards: ObjectId[];
      chosen: ObjectId[];
      auras: { aura: ObjectId; host: ObjectId }[];
    };
    const taken = new Set([...p.chosen, ...p.auras.map((a) => a.aura)]);
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of p.cards) {
      if (taken.has(id) || ctx.s.objects[id]?.zone !== 'library' || !isPermanentCard(ctx, id)) continue;
      const name = def(ctx, id).name;
      if (isAura(ctx, id)) {
        if (!ctx.s.battlefield.some((h) => canEnchant(ctx, id, h))) continue;
        options.push({
          label: `Put ${name} onto the battlefield`,
          effects: [choose('eclAuroraHost', { ...p, aura: id })],
        });
      } else
        options.push({
          label: `Put ${name} onto the battlefield`,
          effects: [choose('eclAuroraPick', { ...p, chosen: [...p.chosen, id] })],
        });
    }
    options.push({
      label:
        p.chosen.length + p.auras.length === 0
          ? 'Put none of them onto the battlefield'
          : 'Done: put the rest on the bottom of the library',
      effects: [custom('eclAuroraFinish', p)],
    });
    return { title: 'Aurora Awakener: put any number of the permanent cards onto the battlefield', options };
  },

  /** Aurora Awakener: what an Aura put onto the battlefield enchants. */
  eclAuroraHost(ctx, _es, params) {
    const p = params as {
      cards: ObjectId[];
      chosen: ObjectId[];
      auras: { aura: ObjectId; host: ObjectId }[];
      aura: ObjectId;
    };
    const { aura, ...rest } = p;
    return {
      title: `${def(ctx, aura).name} enters: choose what it enchants`,
      options: ctx.s.battlefield
        .filter((h) => canEnchant(ctx, aura, h))
        .map((host) => ({
          label: `Enchant ${def(ctx, host).name}`,
          effects: [choose('eclAuroraPick', { ...rest, auras: [...rest.auras, { aura, host }] })],
        })),
    };
  },
};
Object.assign(CHOOSERS, ECL_GREEN_CHOOSERS);
