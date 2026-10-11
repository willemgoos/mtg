import {
  type CustomEffect,
  def,
  drawCard,
  emit,
  moveObject,
  obj,
  other,
  removeFromCombat,
} from './context.ts';
import { joinAttack } from './ltr-multi-rare-effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import { creatureTypesOf, runEffect } from './effects.ts';
import { characteristics, hasKeyword } from './characteristics.ts';
import type { EffectDef } from './types.ts';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/**
 * Lord of the Rings (22): choosers and custom effects for the main-set commons and uncommons outside the
 * Jumpstart packets and for the Starter Kit (docs/lord-of-the-rings-plan.md, "Phase 22"). Rules hooks are in ltr-main-rules.ts; hooks elsewhere are marked
 * `// Lord of the Rings (22 <group>)`.
 */

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

const LTR_MAIN_CHOOSERS: Record<string, Chooser> = {
  /** Gollum, Scheming Guide: "look at the top two cards of your library, put them back in any order". */
  ltrGollumOrder: (ctx, es) => {
    const [a, b] = ctx.s.players[es.controller].library;
    if (a === undefined || b === undefined) return null;
    const name = (id: string) => def(ctx, id).name;
    return {
      title: 'Gollum: put the top two cards back in any order',
      options: [
        { label: `${name(a)} on top, then ${name(b)}`, effects: [] },
        { label: `${name(b)} on top, then ${name(a)}`, effects: [custom('ltrSwapTopTwo')] },
      ],
    };
  },
  /** Gollum: "then choose land or nonland." */
  ltrGollumKind: () => ({
    title: 'Gollum: choose land or nonland',
    options: (['land', 'nonland'] as const).map((kind) => ({
      label: kind === 'land' ? 'Land' : 'Nonland',
      effects: [{ kind: 'chooseCustom', handler: 'ltrGollumGuess', params: { kind } } as EffectDef],
    })),
  }),
  /** Gollum: "An opponent guesses whether the top card of your library is the chosen kind." */
  ltrGollumGuess: (ctx, es, params) => {
    const kind = (params as { kind?: string } | undefined)?.kind === 'land' ? 'land' : 'nonland';
    return {
      player: other(es.controller),
      title: `Gollum: is the top card of their library a ${kind} card?`,
      options: [true, false].map((yes) => ({
        label: yes ? `Yes, it's a ${kind} card` : `No, it isn't a ${kind} card`,
        effects: [custom('ltrGollumReveal', { kind, yes })],
      })),
    };
  },
  /**
   * Shadowfax, Lord of Horses: "you may put a creature card with lesser power from your hand onto the battlefield tapped and
   * attacking." It attacks what Shadowfax attacks.
   */
  ltrShadowfaxPut: (ctx, es) => {
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!self || self.zone !== 'battlefield' || self.zcc !== es.source!.zcc) return null;
    const power = characteristics(ctx, self.id).power;
    const cards = ctx.s.players[es.controller].hand.filter((id) => {
      const d = def(ctx, id);
      return d.types.includes('Creature') && (d.power ?? 0) < power;
    });
    if (!cards.length) return null;
    return {
      title: 'Shadowfax: put a creature with lesser power onto the battlefield attacking?',
      options: [
        ...cards.map((id) => ({
          label: `Put ${def(ctx, id).name} onto the battlefield attacking`,
          effects: [custom('ltrPutAttacking', { id })],
        })),
        { label: "Don't", effects: [] },
      ],
    };
  },
  /**
   * Long List of the Ents: "Note a creature type that hasn't been noted for this Saga." Types of creatures on the battlefield and
   * in your hand come first; each option notes its type for the Saga and sets up "when you next cast a creature spell of that type
   * this turn, that creature enters with an additional +1/+1 counter on it."
   */
  ltrNoteCreatureType: (ctx, es) => {
    const saga = es.source ? ctx.s.objects[es.source.id] : undefined;
    const noted = saga?.ltrNotedTypes ?? [];
    const options = creatureTypesOf(ctx, es.controller)
      .filter((type) => !noted.includes(type))
      .map((type) => ({ label: type, effects: [custom('ltrNoteType', { type })] }));
    return options.length ? { title: 'Note a creature type', options } : null;
  },
  /**
   * Morgul-Knife Wound: the enchanted creature has "At the beginning of your upkeep, exile this creature unless you pay 2 life."
   * The Aura carries the trigger (at the upkeep of the enchanted creature's controller), and that player chooses; life can only
   * be paid with at least that much (rule 119.4).
   */
  ltrPayLifeOrExileHost: (ctx, es, params) => {
    const aura = es.source ? ctx.s.objects[es.source.id] : undefined;
    const host = aura?.attachedTo !== undefined ? ctx.s.objects[aura.attachedTo] : undefined;
    if (!host || host.zone !== 'battlefield') return null;
    const life = Number((params as { life?: number } | undefined)?.life ?? 2);
    const options: { label: string; effects: EffectDef[] }[] = [];
    if (ctx.s.players[host.controller].life >= life)
      options.push({
        label: `Pay ${life} life`,
        effects: [{ kind: 'loseLife', who: 'attachedController', amount: life }],
      });
    options.push({ label: 'Exile it', effects: [{ kind: 'exile', what: 'attached' }] });
    return {
      player: host.controller,
      title: `Pay ${life} life or exile ${def(ctx, host.id).name}`,
      options,
    };
  },
};
Object.assign(CHOOSERS, LTR_MAIN_CHOOSERS);

export const LTR_MAIN_EFFECTS: Record<string, CustomEffect> = {
  /** Gollum: the second card goes on top. */
  ltrSwapTopTwo: (ctx, es) => {
    const lib = ctx.s.players[es.controller].library;
    if (lib.length >= 2) [lib[0], lib[1]] = [lib[1]!, lib[0]!];
  },
  /**
   * Gollum: "Reveal that card. If they guessed right, remove Gollum from combat. Otherwise, you draw a card and Gollum can't be
   * blocked this turn."
   */
  ltrGollumReveal: (ctx, es, params) => {
    const p = (params ?? {}) as { kind?: string; yes?: boolean };
    const top = ctx.s.players[es.controller].library[0];
    if (top !== undefined)
      emit(ctx, {
        type: 'cardsRevealed',
        player: es.controller,
        cards: [{ id: top, defId: obj(ctx, top).defId }],
      });
    const isKind =
      top !== undefined && def(ctx, top).types.includes('Land') === (p.kind === 'land');
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    const here =
      self && self.zone === 'battlefield' && self.zcc === es.source!.zcc ? self : undefined;
    if (!!p.yes === isKind) {
      if (here) removeFromCombat(ctx, here.id);
      return;
    }
    drawCard(ctx, es.controller);
    if (here)
      runEffect(ctx, es, { kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true });
  },
  /** Gandalf, White Rider: "put it into its owner's library fifth from the top" (from the graveyard it died into). */
  ltrFifthFromTop: (ctx, es) => {
    const card = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (card && card.zone === 'graveyard')
      moveObject(ctx, card.id, 'library', { position: 'fifth' });
  },
  /** Fires of Mount Doom: "Destroy all Equipment attached to that creature." */
  ltrDestroyEquipmentOnTarget: (ctx, es) => {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (
        o.attachedTo === t.object.id &&
        def(ctx, id).subtypes.includes('Equipment') &&
        !hasKeyword(ctx, id, 'indestructible')
      )
        moveObject(ctx, id, 'graveyard');
    }
  },
  /**
   * Fires of Mount Doom: "Exile the top card of your library. You may play that card this turn. When you play a card this way,
   * Fires of Mount Doom deals 2 damage to each player." `ability` is Fires' reflexive ability, queued by `detectLtrMain`.
   */
  ltrFiresExile: (ctx, es, params) => {
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined || !es.source) return;
    moveObject(ctx, top, 'exile');
    const o = obj(ctx, top);
    o.playableUntilTurn = ctx.s.turn.number;
    ctx.s.turn.ltrFiresExiled = [
      ...(ctx.s.turn.ltrFiresExiled ?? []),
      {
        id: o.id,
        source: es.source,
        controller: es.controller,
        ability: Number((params as { ability?: number } | undefined)?.ability ?? 0),
      },
    ];
  },
  /** Shadowfax: the chosen card from your hand enters tapped and attacking what Shadowfax attacks. */
  ltrPutAttacking: (ctx, es, params) => {
    const id = String((params as { id?: string } | undefined)?.id ?? '');
    const card = ctx.s.objects[id];
    if (!card || card.zone !== 'hand' || card.owner !== es.controller) return;
    const with_ = ctx.s.combat?.attackers.find((a) => a.id === es.source?.id);
    moveObject(ctx, id, 'battlefield', { controller: es.controller });
    const o = obj(ctx, id);
    if (o.zone !== 'battlefield') return;
    o.tapped = true;
    if (with_) joinAttack(ctx, o.id, with_.defender, with_.planeswalker);
  },
  /** Long List of the Ents: note the type for the Saga, and the next creature spell of that type you cast this turn gets a counter. */
  ltrNoteType: (ctx, es, params) => {
    const type = String((params as { type?: string } | undefined)?.type ?? '');
    const saga = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!type) return;
    if (saga) saga.ltrNotedTypes = [...(saga.ltrNotedTypes ?? []), type];
    ctx.s.turn.ltrNotedTypeBoons = [
      ...(ctx.s.turn.ltrNotedTypeBoons ?? []),
      { player: es.controller, type },
    ];
  },
  /** Fire of Orthanc: "Creatures without flying can't block this turn" (creatures that arrive later too). */
  ltrOnlyFlyersBlock: (ctx) => {
    ctx.s.turn.ltrOnlyFlyersBlock = true;
  },
  /** Elven Farsight: "reveal the top card of your library. If a creature card is revealed this way, draw a card." */
  ltrRevealTopDrawIfCreature: (ctx, es) => {
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return;
    emit(ctx, {
      type: 'cardsRevealed',
      player: es.controller,
      cards: [{ id: top, defId: obj(ctx, top).defId }],
    });
    if (def(ctx, top).types.includes('Creature')) drawCard(ctx, es.controller);
  },
};
