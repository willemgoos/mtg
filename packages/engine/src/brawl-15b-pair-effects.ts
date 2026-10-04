import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  drawCard,
  emit,
  moveObject,
  newTimestamp,
  obj,
  tap,
} from './context.ts';
import { manaValue } from './cost.ts';
import { changeLife, gainLife } from './effects.ts';
import { nextInt, shuffleInPlace } from './rng.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven Brawl (15b, pair): one-offs of the two-colour cards, as custom
 * effects, and the choosers behind `chooseCustom`.
 */

export const CONTRACT_TOKEN = 'soc-15b-pair-contract';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** A permanent put onto the battlefield from nowhere (a token or a conjured card): triggers see it enter. */
function putOnBattlefield(ctx: Ctx, defId: string, owner: PlayerId, isToken: boolean) {
  const o = createObject(ctx, defId, owner, 'battlefield', isToken);
  ctx.s.battlefield.push(o.id);
  return o;
}

function announce(ctx: Ctx, o: { id: ObjectId; defId: string }): void {
  emit(ctx, { type: 'objectMoved', id: o.id, defId: o.defId, from: null, to: 'battlefield' });
}

export const BRAWL_15B_PAIR_EFFECTS: Record<string, CustomEffect> = {
  /** Scriv, the Obligator: a Contract Aura token attached to the target creature an opponent controls. */
  scrivContract(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const host = ctx.s.objects[t.object.id];
    if (!host || host.zone !== 'battlefield' || host.zcc !== t.object.zcc) return;
    const token = putOnBattlefield(ctx, CONTRACT_TOKEN, es.controller, true);
    token.attachedTo = host.id;
    announce(ctx, token);
  },

  /**
   * Contract: "Whenever enchanted creature attacks, it gets +2/+0 until end of turn if it's attacking
   * one of your opponents. Otherwise, its controller loses 2 life."
   */
  contractAttack(ctx, es) {
    const me = es.subject && ctx.s.objects[es.subject.id];
    if (!me || me.zone !== 'battlefield') return;
    const attacker = ctx.s.combat?.attackers.find((a) => a.id === me.id);
    if (attacker && attacker.defender !== es.controller) {
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: me.id, zcc: me.zcc },
        power: 2,
        toughness: 0,
        keywords: [],
        expires: 'endOfTurn',
      });
    } else {
      changeLife(ctx, me.controller, -2);
    }
  },

  /** Hydroid Krasis: "When you cast this spell, you gain half X life and draw half X cards. Round down each time." */
  krasisCast(ctx, es) {
    const item = ctx.s.stack.find((i) => i.id === es.subject?.id);
    const half = Math.floor((item?.x ?? 0) / 2);
    if (half <= 0) return;
    gainLife(ctx, es.controller, half);
    for (let i = 0; i < half; i++) drawCard(ctx, es.controller);
  },

  /** Urban Evolution: "You may play an additional land this turn." */
  extraLandDrop(ctx, es) {
    ctx.s.players[es.controller].landsPlayedThisTurn -= 1;
  },

  /**
   * Ornate Imitations: for each number between 1 and X, conjure a duplicate of a random creature
   * card with that mana value onto the battlefield.
   */
  ornateImitations(ctx, es) {
    const x = es.x ?? 0;
    const creatures = [...ctx.db.values()]
      .filter((d) => d.types.includes('Creature') && !d.isToken && !d.noManaCost)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let n = 1; n <= x; n++) {
      const options = creatures.filter((d) => manaValue(d.manaCost) === n);
      if (options.length === 0) continue;
      const pick = options[nextInt(ctx.s.rng, options.length)]!;
      const o = putOnBattlefield(ctx, pick.id, es.controller, false);
      announce(ctx, o);
    }
  },

  /**
   * Planar Genesis: the chosen card goes onto the battlefield tapped (a land) or into your hand; the
   * rest of the four cards go to the bottom of the library in a random order.
   */
  planarPick(ctx, es, params) {
    const { pick, to, cards } = params as {
      pick: ObjectId;
      to: 'hand' | 'battlefield';
      cards: ObjectId[];
    };
    const lib = ctx.s.players[es.controller].library;
    if (!lib.includes(pick)) return;
    if (to === 'battlefield') {
      moveObject(ctx, pick, 'battlefield', { controller: es.controller });
      tap(ctx, pick);
    } else moveObject(ctx, pick, 'hand');
    const rest = cards.filter((id) => id !== pick && lib.includes(id));
    shuffleInPlace(ctx.s.rng, rest);
    for (const id of rest) moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /**
   * Make Your Own Luck: the picked card is exiled and becomes plotted (cast free as a sorcery on a
   * later turn); the other cards go into your hand.
   */
  plotPick(ctx, es, params) {
    const { pick, cards } = params as { pick?: ObjectId; cards: ObjectId[] };
    const lib = ctx.s.players[es.controller].library;
    for (const id of cards) {
      if (!lib.includes(id)) continue;
      if (id === pick) {
        moveObject(ctx, id, 'exile');
        obj(ctx, id).plottedTurn = ctx.s.turn.number;
      } else moveObject(ctx, id, 'hand');
    }
  },

  /** Unexpected Results: a revealed land goes onto the battlefield (the spell returns to hand, see the chooser). */
  urLand(ctx, es, params) {
    const { id } = params as { id: ObjectId };
    if (!ctx.s.players[es.controller].library.includes(id)) return;
    moveObject(ctx, id, 'battlefield', { controller: es.controller });
  },

  /** Unexpected Results: a revealed nonland card that wasn't cast goes back on top of the library. */
  urPutBack(ctx, es, params) {
    const { id } = params as { id: ObjectId };
    const o = ctx.s.objects[id];
    if (o && o.zone === 'exile') moveObject(ctx, id, 'library', { position: 'top' });
  },
};

const BRAWL_15B_PAIR_CHOOSERS: Record<string, Chooser> = {
  /** Planar Genesis: "look at the top four cards ... you may put a land card onto the battlefield tapped. If you don't, put a card into your hand." */
  planarGenesis(ctx, es) {
    const cards = ctx.s.players[es.controller].library.slice(0, 4);
    if (cards.length === 0) return null;
    const options = [
      ...cards
        .filter((id) => def(ctx, id).types.includes('Land'))
        .map((id) => ({
          label: `Put ${def(ctx, id).name} onto the battlefield tapped`,
          effects: [custom('planarPick', { pick: id, to: 'battlefield', cards })],
        })),
      ...cards.map((id) => ({
        label: `Put ${def(ctx, id).name} into your hand`,
        effects: [custom('planarPick', { pick: id, to: 'hand', cards })],
      })),
    ];
    return { title: 'Planar Genesis', options };
  },

  /** Make Your Own Luck: "look at the top three cards. You may exile a nonland card from among them. If you do, it becomes plotted." */
  makeYourOwnLuck(ctx, es) {
    const cards = ctx.s.players[es.controller].library.slice(0, 3);
    if (cards.length === 0) return null;
    const options = [
      ...cards
        .filter((id) => !def(ctx, id).types.includes('Land'))
        .map((id) => ({
          label: `Exile ${def(ctx, id).name} (plotted), the rest into your hand`,
          effects: [custom('plotPick', { pick: id, cards })],
        })),
      {
        label: 'Exile nothing, put them all into your hand',
        effects: [custom('plotPick', { cards })],
      },
    ];
    return { title: 'Make Your Own Luck', options };
  },

  /**
   * Unexpected Results: shuffle, then reveal the top card. A nonland card may be cast free; a land may
   * go onto the battlefield, returning this spell to your hand.
   */
  unexpectedResults(ctx, es) {
    const ps = ctx.s.players[es.controller];
    shuffleInPlace(ctx.s.rng, ps.library);
    const top = ps.library[0];
    if (top === undefined) return null;
    emit(ctx, { type: 'revealed', player: es.controller, id: top });
    if (def(ctx, top).types.includes('Land'))
      return {
        title: `Unexpected Results: ${def(ctx, top).name} is a land`,
        options: [
          {
            label: 'Put it onto the battlefield and return Unexpected Results to your hand',
            effects: [custom('urLand', { id: top }), { kind: 'returnSelfFromStack' }],
          },
          { label: 'Leave it on top of your library', effects: [] },
        ],
      };
    // A nonland card is exiled to be cast; if it isn't cast it goes back on top.
    moveObject(ctx, top, 'exile');
    const card = obj(ctx, top);
    return {
      title: `Unexpected Results: ${def(ctx, top).name}`,
      options: [
        {
          label: 'Cast it without paying its mana cost',
          effects: [
            { kind: 'castFreeCard', card: { id: top, zcc: card.zcc } },
            custom('urPutBack', { id: top }),
          ],
        },
        { label: "Don't cast it", effects: [custom('urPutBack', { id: top })] },
      ],
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_PAIR_CHOOSERS);
