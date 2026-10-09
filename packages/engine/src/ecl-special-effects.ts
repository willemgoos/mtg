import { type Ctx, type CustomEffect, emit, moveObject, newTimestamp, obj } from './context.ts';
import { matchesFilter } from './characteristics.ts';
import { creatureTypesOf, runEffect } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { Color, EffectDef, EffectSource, ObjectId } from './types.ts';

// Lorwyn Eclipsed (18b, special): the colourless, two-faced and Incarnation cards. One-off effects (called as
// `{ kind: 'custom', handler }` / `{ kind: 'chooseCustom', handler }`).

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The permanent a target slot points at, if it is still there. */
function targetOnBattlefield(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : undefined;
}

export const ECL_SPECIAL_EFFECTS: Record<string, CustomEffect> = {
  /**
   * The source becomes the colour (`params.color`): for good (Puca's Eye) or through the end of this turn
   * (`params.until: 'endOfTurn'`, Foraging Wickermaw).
   */
  eclBecomeColor(ctx, es, params) {
    const p = params as { color: Color; until?: 'endOfTurn' } | undefined;
    const o = es.source && ctx.s.objects[es.source.id];
    if (!p || !o || o.zone !== 'battlefield' || o.zcc !== es.source!.zcc) return;
    o.colorOverride = {
      colors: [p.color],
      ...(p.until === 'endOfTurn' ? { untilTurn: ctx.s.turn.number } : {}),
    };
  },
  /** Rooftop Percher: exile every target card that is still in a graveyard. */
  eclExileTargetCards(ctx, es) {
    for (const t of es.targets) {
      if (!t || !('object' in t)) continue;
      const o = ctx.s.objects[t.object.id];
      if (o && o.zone === 'graveyard' && o.zcc === t.object.zcc) moveObject(ctx, o.id, 'exile');
    }
  },
  /** Mirrormind Crown: `params.count` tokens that are copies of the equipped creature `params.creature`, instead. */
  eclCrownCopies(ctx, es, params) {
    const p = params as { creature: ObjectId; count: number } | undefined;
    const host = p && ctx.s.objects[p.creature];
    if (!p || !host || host.zone !== 'battlefield') return;
    runEffect(
      ctx,
      { ...es, chosen: { id: host.id, zcc: host.zcc } },
      { kind: 'tokenCopy', of: 'chosen', count: p.count },
    );
  },
  /** Sygg, Wanderbrine Shield: the target creature gains protection from each color until your next turn. */
  eclProtectionFromEachColor(ctx, es) {
    const id = targetOnBattlefield(ctx, es, 0);
    if (id === undefined) return;
    const o = obj(ctx, id);
    for (const color of COLORS)
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: o.id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        protectionFrom: color,
        expires: 'untilYourNextTurn',
        player: es.controller,
      });
  },
  /** Gathering Stone: the top card of your library goes into your hand (revealed). */
  eclTopCardToHand(ctx, es, params) {
    const id = (params as { id?: ObjectId } | undefined)?.id;
    const top = ctx.s.players[es.controller].library[0];
    if (id === undefined || top !== id) return;
    emit(ctx, {
      type: 'cardsRevealed',
      player: es.controller,
      cards: [{ id, defId: obj(ctx, id).defId }],
    });
    moveObject(ctx, id, 'hand');
  },
  /** Gathering Stone: the top card of your library goes into your graveyard. */
  eclTopCardToGraveyard(ctx, es, params) {
    const id = (params as { id?: ObjectId } | undefined)?.id;
    const top = ctx.s.players[es.controller].library[0];
    if (id === undefined || top !== id) return;
    moveObject(ctx, id, 'graveyard');
  },
};

const ECL_SPECIAL_CHOOSERS: Record<string, Chooser> = {
  /** Puca's Eye: "choose a color. This artifact becomes the chosen color." */
  eclChooseColorBecome(_ctx, _es) {
    return {
      title: 'Choose a color',
      options: COLORS.map((color) => ({
        label: COLOR_NAMES[color],
        effects: [custom('eclBecomeColor', { color })],
      })),
    };
  },
  /** Foraging Wickermaw: "Add one mana of any color. This creature becomes that color until end of turn." */
  eclAddAnyColorBecome(_ctx, _es) {
    return {
      title: 'Add one mana of any color',
      options: COLORS.map((color) => ({
        label: COLOR_NAMES[color],
        effects: [
          { kind: 'addMana', mana: [[color]] } as EffectDef,
          custom('eclBecomeColor', { color, until: 'endOfTurn' }),
        ],
      })),
    };
  },
  /** Springleaf Drum: "Add one mana of any color." */
  eclAddAnyColor(_ctx, _es) {
    return {
      title: 'Add one mana of any color',
      options: COLORS.map((color) => ({
        label: COLOR_NAMES[color],
        effects: [{ kind: 'addMana', mana: [[color]] } as EffectDef],
      })),
    };
  },
  /**
   * Gathering Stone: look at the top card of your library. If it's a card of the chosen type, you may reveal it and put it into your
   * hand. If you don't put the card into your hand, you may put it into your graveyard.
   */
  eclGatheringStoneLook(ctx, es) {
    const id = ctx.s.players[es.controller].library[0];
    const type = es.source && ctx.s.objects[es.source.id]?.chosenType;
    if (id === undefined) return null;
    const name = ctx.db.get(obj(ctx, id).defId)?.name ?? 'the top card';
    const ofType = !!type && matchesFilter(ctx, id, { subtype: type });
    return {
      title: `Gathering Stone: you look at ${name}`,
      options: [
        ...(ofType
          ? [
              {
                label: `Reveal ${name} and put it into your hand`,
                effects: [custom('eclTopCardToHand', { id })],
              },
            ]
          : []),
        {
          label: `Put ${name} into your graveyard`,
          effects: [custom('eclTopCardToGraveyard', { id })],
        },
        { label: `Leave ${name} on top of your library`, effects: [] },
      ],
    };
  },
  /**
   * Oko, Shadowmoor Scion's -6: "Choose a creature type. You get an emblem with 'Creatures you control of the chosen type get +3/+3 and
   * have vigilance and hexproof.'"
   */
  eclOkoEmblem(ctx, es) {
    return {
      title: 'Choose a creature type',
      options: creatureTypesOf(ctx, es.controller).map((type) => ({
        label: type,
        effects: [
          {
            kind: 'emblem',
            until: 'permanent',
            ability: {
              kind: 'static',
              effect: {
                kind: 'anthem',
                affects: 'creaturesYouControl',
                filter: { subtype: type },
                power: 3,
                toughness: 3,
                keywords: ['vigilance', 'hexproof'],
              },
            },
            label: `Creatures you control of the chosen type (${type}) get +3/+3 and have vigilance and hexproof.`,
            colorless: true,
          } as EffectDef,
        ],
      })),
    };
  },
  /** Trystan, Penitent Culler: "you may exile an Elf card from your graveyard. If you do, each opponent loses 2 life." */
  eclTrystanExileElf(ctx, es) {
    const elves = ctx.s.players[es.controller].graveyard.filter((id) =>
      matchesFilter(ctx, id, { subtype: 'Elf' }),
    );
    if (elves.length === 0) return null;
    const names = new Map<string, ObjectId>();
    for (const id of elves) {
      const name = ctx.db.get(obj(ctx, id).defId)?.name ?? id;
      if (!names.has(name)) names.set(name, id);
    }
    return {
      title: 'Trystan, Penitent Culler: exile an Elf card from your graveyard?',
      options: [
        ...[...names].map(([name, id]) => ({
          label: `Exile ${name}: each opponent loses 2 life`,
          effects: [
            custom('eclExileFromGraveyard', { id }),
            { kind: 'loseLife', who: 'eachOpponent', amount: 2 } as EffectDef,
          ],
        })),
        { label: "Don't exile a card", effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, ECL_SPECIAL_CHOOSERS);

ECL_SPECIAL_EFFECTS.eclExileFromGraveyard = (ctx, es, params) => {
  const id = (params as { id?: ObjectId } | undefined)?.id;
  if (id === undefined) return;
  const o = ctx.s.objects[id];
  if (o && o.zone === 'graveyard' && o.owner === es.controller) moveObject(ctx, id, 'exile');
};
