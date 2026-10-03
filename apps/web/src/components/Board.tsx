import { cardDb, type Decklist, displayName } from '@mtg/cards';
import type {
  Action,
  CardDefId,
  CardDefinition,
  GameObject,
  ManaCost,
  ObjectId,
  PendingTrigger,
  PlayerId,
} from '@mtg/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  castGroups,
  forageFood,
  handActions,
  isTargeting,
  permanentActions,
  pickTarget,
  startTargeting,
  type Targeting,
  targetOptions,
  targetsOf,
} from '../game/interaction.ts';
import { BOT, type GameSession, HUMAN } from '../game/useGame.ts';
import { cardNotes } from '../game/notes.ts';
import { artFor } from '../game/deckArt.ts';
import { useFlip } from '../game/useFlip.ts';
import { useHandDrag } from '../game/useHandDrag.ts';
import { reconcileHandOrder } from '../game/handOrder.ts';
import { Card, type CardMark, type HoverFn } from './Card.tsx';
import { OptionMenu } from './OptionMenu.tsx';
import { FxLayer } from './FxLayer.tsx';
import { type ArrowSpec, Arrows, Floaters, TurnBanner, winnerText } from './Effects.tsx';
import {
  Battlefield,
  Hand,
  OpponentHand,
  CommandSlot,
  PlayerBadge,
  StackView,
  type PileZone,
  PileViewer,
  ZonePiles,
  type ZoneHandlers,
} from './Zones.tsx';
import { ArenaBackdrop } from './ArenaBackdrop.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';
import { SoundControl } from './SoundControl.tsx';
import { heartbeat, playEvents, playHover } from '../game/sound.ts';
import { isLethal } from '../game/lethal.ts';
import { startTeamPick, type TeamPick, teamOptions, teamPower } from '../game/teamwork.ts';
import { type Hint, hintFor } from '../game/hint.ts';

const nameOf = (defId: CardDefId) => {
  const d = cardDb.get(defId);
  return d ? displayName(d) : 'Card';
};

export function Board({
  game,
  decks,
  gauntlet,
  onMenu,
  onRematch,
  resultText,
  concedeText,
  pauseText,
}: {
  game: GameSession;
  decks: { you: Decklist; them: Decklist };
  /** Set for a gauntlet round (e.g. "Gauntlet · Round 3 of 6"): no restarts, and "Continue" goes back to the ladder. */
  gauntlet?: string;
  onMenu: () => void;
  onRematch: () => void;
  resultText?: string;
  concedeText?: string;
  pauseText?: string;
}) {
  const { state, view, legal, apply, log, batch, settings, setSettings } = game;
  const d = state.decision;
  // Priority we are about to auto-pass is not ours to act on: showing it would
  // flash a Pass button and card glows for a moment on every step.
  const myDecision = d.kind !== 'gameOver' && d.player === HUMAN && !game.autoPassing;

  // A hint from the Apprentice bot; it goes stale as soon as the game moves on.
  const [hint, setHint] = useState<Hint | null>(null);
  useEffect(() => setHint(null), [view]);
  const askHint = () => {
    if (!myDecision) return;
    setHint(hintFor(view, HUMAN) ?? { text: 'Nothing to decide right now.', cards: [] });
    playHover(null);
  };

  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [blocker, setBlocker] = useState<ObjectId | null>(null);
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const [pile, setPile] = useState<{ player: PlayerId; zone: PileZone } | null>(null);
  const closePile = useCallback(() => {
    setPile(null);
    setHoverState(null);
  }, []);
  const setHover: HoverFn = useCallback((defId, anchor) => {
    if (defId) playHover(anchor);
    setHoverState(defId ? { defId, anchor: anchor ?? null } : null);
  }, []);
  useEffect(() => playEvents(batch.events, HUMAN), [batch]);
  const notes = useMemo(() => {
    if (!hover) return [];
    const oid = hover.anchor?.closest('[data-oid]')?.getAttribute('data-oid');
    return cardNotes(view, hover.defId, oid);
  }, [hover, view]);
  // A hovered card that leaves the DOM never fires mouseleave: drop its preview.
  useEffect(() => {
    if (hover?.anchor && !hover.anchor.isConnected) setHoverState(null);
  });
  const [menu, setMenu] = useState<{ source: ObjectId; indices: number[] } | null>(null);
  /** A spell with several ways to cast it (modes, kicker): pick one first. */
  const [castMenu, setCastMenu] = useState<{ source: ObjectId; groups: Action[][] } | null>(null);
  /** Teamwork: after the targets, the creatures to tap are picked on the board. */
  const [teamPick, setTeamPick] = useState<TeamPick | null>(null);

  // Any new decision resets half-finished UI interactions.
  const decisionKey = `${state.turn.number}:${state.turn.step}:${d.kind}:${state.stack.length}`;
  useEffect(() => {
    setTargeting(null);
    setBlocker(null);
    setMenu(null);
    setCastMenu(null);
    setTeamPick(null);
  }, [decisionKey]);

  // Triggered abilities that need targets open targeting straight away.
  useEffect(() => {
    if (d.kind === 'chooseTriggerTargets' && d.player === HUMAN && !targeting) {
      if (legal.some((a) => a.type === 'chooseTargets' && a.mode !== undefined)) return;
      setTargeting(startTargeting(d.trigger.source.id, triggerLabel(d.trigger), legal));
    }
  }, [d, legal, targeting]);

  const act = useCallback(
    (a: Action) => {
      setTargeting(null);
      setBlocker(null);
      setMenu(null);
      setCastMenu(null);
      setTeamPick(null);
      const team = startTeamPick(view, a);
      if (team) return setTeamPick(team);
      apply(a);
    },
    [apply, view],
  );

  const beginOrApply = useCallback(
    (source: ObjectId, label: string, actions: Action[]) => {
      if (actions.length === 0) return;
      if (actions.every((a) => targetsOf(a).length === 0)) return act(actions[0]!);
      setTargeting(startTargeting(source, label, actions));
    },
    [act],
  );

  /** Casts a card: asks for the mode/kicker first when there is a choice. */
  const startCast = (id: ObjectId, casts: Action[]) => {
    const groups = castGroups(casts);
    if (groups.length > 1) return setCastMenu({ source: id, groups });
    beginOrApply(id, nameOf(view.objects[id]!.defId), casts);
  };

  const choose = (key: string) => {
    if (!targeting) return;
    const r = pickTarget(targeting, key);
    if (!r) return;
    if (isTargeting(r)) setTargeting(r);
    else act(r);
  };

  // ------------------------------------------------------------ drag to play

  const playable = (id: ObjectId) =>
    handActions(legal, id).filter((a) => a.type === 'castSpell' || a.type === 'playLand');

  /** Dropped on the board: play it; a targeted spell dropped on a legal target takes it. */
  const dropCard = (id: ObjectId, x: number, y: number) => {
    const acts = playable(id);
    const land = acts.find((a) => a.type === 'playLand');
    // Final Fantasy (11a): an adventure land dropped on the board: the land or its Adventure.
    if (land && acts.length > 1)
      return setCastMenu({
        source: id,
        groups: [[land], ...castGroups(acts.filter((a) => a.type === 'castSpell'))],
      });
    if (land) return act(land);
    if (acts.length === 0) return;
    if (castGroups(acts).length > 1) return startCast(id, acts);
    if (acts.every((a) => targetsOf(a).length === 0)) return act(acts[0]!);
    const t = startTargeting(id, nameOf(view.objects[id]!.defId), acts);
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-oid],[data-player]');
    const key = el?.dataset.oid
      ? `obj:${el.dataset.oid}`
      : el?.dataset.player
        ? `player:${el.dataset.player}`
        : null;
    const picked = key ? pickTarget(t, key) : null;
    if (picked && !isTargeting(picked)) return act(picked);
    setTargeting(picked ?? t);
  };

  const [handOrder, setHandOrder] = useState<ObjectId[]>([]);
  const orderedHand = useMemo(
    () => reconcileHandOrder(view.players[HUMAN].hand, handOrder),
    [view.players[HUMAN].hand, handOrder],
  );
  const drag = useHandDrag({
    hand: orderedHand,
    canReorder: () => !targeting && d.kind !== 'gameOver',
    onReorder: setHandOrder,
    canPlay: (id) => myDecision && !targeting && playable(id).length > 0,
    onDrop: dropCard,
  });

  /** While dragging a targeted spell, its possible first targets light up. */
  const dragTargets = useMemo(() => {
    if (!drag.dragging || !drag.overBattlefield) return null;
    const casts = playable(drag.dragging).filter((a) => targetsOf(a).length > 0);
    return casts.length ? targetOptions(startTargeting(drag.dragging, '', casts)) : null;
  }, [drag.dragging, drag.overBattlefield, legal]);

  // ------------------------------------------------------------------ clicks

  const onCard = (id: ObjectId) => {
    if (drag.wasDrag()) return;
    if (targeting) return choose(`obj:${id}`);
    if (teamPick) {
      if (!teamOptions(view, HUMAN, teamPick).includes(id)) return;
      const chosen = teamPick.chosen.includes(id)
        ? teamPick.chosen.filter((c) => c !== id)
        : [...teamPick.chosen, id];
      return setTeamPick({ ...teamPick, chosen });
    }
    if (!myDecision) return;
    if (d.kind === 'sacrifice') {
      if (d.options.includes(id)) act({ type: 'chooseCard', player: HUMAN, card: id });
      return;
    }
    if (d.kind === 'forage') {
      if (d.foods.includes(id)) act({ type: 'forage', player: HUMAN, choice: id });
      return;
    }
    if (d.kind === 'chooseObject') {
      if (d.options.includes(id)) act({ type: 'chooseCard', player: HUMAN, card: id });
      return;
    }
    const o = view.objects[id]!;
    if (o.zone !== 'battlefield') {
      const acts = handActions(legal, id);
      const casts = acts.filter((a) => a.type === 'castSpell');
      // Final Fantasy (11a): an adventure land: play the land or cast its Adventure.
      const land = acts.find((a) => a.type === 'playLand');
      if (land && casts.length)
        return setCastMenu({ source: id, groups: [[land], ...castGroups(casts)] });
      if (casts.length) return startCast(id, casts);
      const ability = legal.find((a) => a.type === 'activateAbility' && a.source === id);
      if (ability?.type === 'activateAbility') return activate(id, ability.abilityIndex);
      if (acts[0]) act(acts[0]);
      return;
    }
    const acts = permanentActions(legal, id);
    if (d.kind === 'declareAttackers') {
      // An opponent's planeswalker: the last attacker declared goes after it instead.
      const last = d.declared[d.declared.length - 1];
      const atWalker =
        last &&
        legal.find(
          (x) => x.type === 'addAttacker' && x.attacker === last.id && x.planeswalker === id,
        );
      if (atWalker) return act(atWalker);
      const a = acts.find(
        (x) => (x.type === 'addAttacker' && !x.planeswalker) || x.type === 'removeAttacker',
      );
      if (a) act(a);
      return;
    }
    if (d.kind === 'declareBlockers') {
      if (o.controller === HUMAN) {
        const rm = acts.find((x) => x.type === 'removeBlock');
        if (rm) return act(rm);
        if (acts.some((x) => x.type === 'addBlock')) setBlocker(blocker === id ? null : id);
      } else if (blocker) {
        const a = legal.find(
          (x) => x.type === 'addBlock' && x.blocker === blocker && x.attacker === id,
        );
        if (a) act(a);
      }
      return;
    }
    const abilities = acts.filter((a) => a.type === 'activateAbility');
    const indices = [
      ...new Set(abilities.map((a) => (a.type === 'activateAbility' ? a.abilityIndex : -1))),
    ];
    if (indices.length > 1) setMenu({ source: id, indices });
    else if (indices.length === 1) activate(id, indices[0]!);
  };

  const activate = (source: ObjectId, index: number) => {
    setMenu(null);
    const acts = legal.filter(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
    );
    // Forage as a cost: a Food or the graveyard, chosen from a menu first.
    const groups = castGroups(acts);
    if (groups.length > 1) return setCastMenu({ source, groups });
    beginOrApply(source, `${nameOf(view.objects[source]!.defId)} ability`, acts);
  };

  const onPlayer = (p: PlayerId) => {
    if (targeting) choose(`player:${p}`);
  };

  // --------------------------------------------------------------- highlights

  const options = useMemo(() => (targeting ? targetOptions(targeting) : null), [targeting]);
  /** Targets that are cards in a graveyard (not on the board): chosen from an overlay. */
  const graveyardOptions = [...(options?.values() ?? [])].flatMap((t) =>
    'object' in t && view.objects[t.object.id]?.zone === 'graveyard' ? [t.object.id] : [],
  );
  const declaredAttackers = new Set(
    d.kind === 'declareAttackers'
      ? d.declared.map((x) => x.id)
      : (view.combat?.attackers.map((a) => a.id) ?? []),
  );
  const blockPairs =
    d.kind === 'declareBlockers'
      ? d.declared
      : (view.combat?.attackers.flatMap((a) =>
          a.blockers.map((b) => ({ blocker: b, attacker: a.id })),
        ) ?? []);
  const blocking = new Set(blockPairs.map((b) => b.blocker));

  const markOf = (id: ObjectId): CardMark => {
    if (hint?.cards.includes(id)) return 'hint';
    if (dragTargets) return dragTargets.has(`obj:${id}`) ? 'option' : null;
    if (options) return options.has(`obj:${id}`) ? 'option' : null;
    if (teamPick)
      return teamPick.chosen.includes(id)
        ? 'selected'
        : teamOptions(view, HUMAN, teamPick).includes(id)
          ? 'option'
          : null;
    if (myDecision && d.kind === 'sacrifice') return d.options.includes(id) ? 'option' : null;
    if (myDecision && d.kind === 'forage') return d.foods.includes(id) ? 'option' : null;
    if (myDecision && d.kind === 'chooseObject') return d.options.includes(id) ? 'option' : null;
    if (id === blocker) return 'selected';
    if (declaredAttackers.has(id)) return 'attacking';
    if (blocking.has(id)) return 'blocking';
    if (!myDecision) return null;
    if (
      blocker &&
      legal.some((a) => a.type === 'addBlock' && a.blocker === blocker && a.attacker === id)
    )
      return 'option';
    const o = view.objects[id]!;
    if (o.zone !== 'battlefield')
      return handActions(legal, id).length ||
        legal.some((a) => a.type === 'activateAbility' && a.source === id)
        ? 'playable'
        : null;
    const acts = permanentActions(legal, id);
    if (acts.some((a) => a.type === 'addAttacker' || a.type === 'addBlock')) return 'candidate';
    if (acts.some((a) => a.type === 'activateAbility')) return 'activatable';
    return null;
  };

  const h: ZoneHandlers = {
    markOf,
    onCard,
    onHover: setHover,
    onHandPointerDown: drag.onHandPointerDown,
    dragging: drag.dragging,
  };
  // Castable cards outside the hand (flashback, Vizier's top card) sit next to it.
  const extras = [
    ...new Set(
      legal.flatMap((a) => {
        const id =
          a.type === 'castSpell' || a.type === 'playLand'
            ? a.card
            : a.type === 'activateAbility'
              ? a.source
              : null;
        const zone = id ? view.objects[id]?.zone : undefined;
        // The commander is cast from its slot by the portrait.
        return id && zone && zone !== 'hand' && zone !== 'battlefield' && zone !== 'command'
          ? [id]
          : [];
      }),
    ),
  ].map((id) => ({ id, label: extraLabel(view.objects[id]!) }));

  const targetablePlayer = (p: PlayerId) =>
    !!options?.has(`player:${p}`) || !!dragTargets?.has(`player:${p}`);

  // ------------------------------------------------------------------ arrows

  const arrows: ArrowSpec[] = [
    ...blockPairs.map((b) => ({
      from: `[data-oid="${b.blocker}"]`,
      to: `[data-oid="${b.attacker}"]`,
      kind: 'block' as const,
    })),
    ...view.stack.flatMap((item) =>
      item.targets.map((t) => ({
        from: `[data-stack="${item.id}"]`,
        to: t,
        kind: 'target' as const,
      })),
    ),
    ...(targeting?.source
      ? targeting.chosen.map((t) => ({
          from: `[data-oid="${targeting.source}"]`,
          to: t,
          kind: 'aim' as const,
        }))
      : []),
  ];

  // ------------------------------------------------------------- action bar

  const bar = actionBar();
  // Responding to the stack happens at the stack, in the middle of the board.
  const respond = myDecision && !targeting && d.kind === 'priority' && view.stack.length > 0;
  // Nothing left to play: the primary button starts to glow so the next move is obvious.
  const idle =
    myDecision &&
    !targeting &&
    d.kind === 'priority' &&
    !legal.some((a) => a.type === 'playLand' || a.type === 'castSpell');
  const secondary = bar.secondary && (
    <button className="abtn abtn--second" onClick={bar.secondary[1]}>
      {bar.secondary[0]}
    </button>
  );
  const primary = bar.primary && (
    <button
      className={`abtn abtn--main ${idle ? 'abtn--nudge' : ''}`}
      title={`${bar.primary[0]} (Space)`}
      onClick={bar.primary[1]}
    >
      {bar.primary[0]}
    </button>
  );
  function actionBar(): {
    prompt: string;
    primary?: [string, () => void];
    secondary?: [string, () => void];
  } {
    if (d.kind === 'gameOver') return { prompt: '' };
    if (targeting) {
      const first = targeting.candidates[0];
      const n = first ? targetsOf(first).length : 1;
      const paying =
        targeting.chosen.length === 0 &&
        (first?.type === 'castSpell' || first?.type === 'activateAbility')
          ? first.sacrifice
            ? (first.type === 'castSpell' &&
                kickPermanentPrompt(view.objects[first.card]?.defId, first)) ||
              'a creature to sacrifice'
            : forageFood(first)
              ? 'a Food to sacrifice'
              : first.discard
                ? first.type === 'activateAbility' &&
                  exilesFromHand(view.objects[first.source]!.defId, first.abilityIndex)
                  ? 'an instant or sorcery card to exile'
                  : first.type === 'activateAbility' &&
                      discardsSameName(view.objects[first.source]!.defId, first.abilityIndex)
                    ? 'another card with the same name to discard'
                    : // Strixhaven (13c): Draconic Intervention exiles a card from your graveyard.
                      first.type === 'castSpell' &&
                        cardDb.get(view.objects[first.card]?.defId ?? '')?.exileFromGraveyardToCast
                      ? 'an instant or sorcery card to exile from your graveyard'
                      : 'a card to discard'
                : first.type === 'castSpell' && first.copyOf
                  ? 'a creature to copy (or skip)'
                  : first.type === 'castSpell' && first.sneak
                    ? 'an unblocked attacker to return'
                    : null
          : null;
      const prompt = paying
        ? `${targeting.label}: choose ${paying}`
        : `${targeting.label}: choose ${n > 1 ? `target ${targeting.chosen.length + 1} of ${n}` : 'a target'}`;
      if (targeting.skip) return { prompt, primary: ['Skip', () => act(targeting.skip!)] };
      if (d.kind === 'chooseTriggerTargets') return { prompt };
      return { prompt, secondary: ['Cancel', () => setTargeting(null)] };
    }
    if (teamPick) {
      const power = teamPower(view, teamPick.chosen);
      const name = nameOf(view.objects[teamPick.action.card]!.defId);
      return {
        prompt: `${name}: tap creatures with total power ${teamPick.need} or more (${power}/${teamPick.need})`,
        ...(power >= teamPick.need
          ? {
              primary: [
                'Done',
                () => {
                  setTeamPick(null);
                  apply({ ...teamPick.action, teamwork: teamPick.chosen });
                },
              ] as [string, () => void],
            }
          : {}),
        secondary: ['Cancel', () => setTeamPick(null)],
      };
    }
    if (!myDecision) return { prompt: '' };
    const pass: Action = { type: 'passPriority', player: HUMAN };
    const mine = state.turn.activePlayer === HUMAN;
    switch (d.kind) {
      case 'declareAttackers': {
        const n = d.declared.length;
        const adds = legal.filter((a) => a.type === 'addAttacker' && !a.planeswalker);
        return {
          prompt: legal.some((a) => a.type === 'addAttacker' && a.planeswalker)
            ? 'Declare attackers: click creatures, then a planeswalker to attack it instead'
            : 'Declare attackers: click creatures to attack',
          primary: [
            n ? `Attack ×${n}` : 'Skip',
            () => act({ type: 'confirmAttackers', player: HUMAN }),
          ],
          ...(adds.length
            ? {
                secondary: ['All attack', () => adds.forEach((a) => apply(a))] as [
                  string,
                  () => void,
                ],
              }
            : {}),
        };
      }
      case 'declareBlockers': {
        const ok = legal.some((a) => a.type === 'confirmBlockers');
        return {
          prompt: blocker
            ? 'Now click the attacker to block'
            : 'Declare blockers: click your creature, then an attacker',
          ...(ok
            ? {
                primary: [
                  d.declared.length ? 'Confirm blocks' : 'No blocks',
                  () => act({ type: 'confirmBlockers', player: HUMAN }),
                ] as [string, () => void],
              }
            : {}),
        };
      }
      case 'discardToHandSize':
      case 'discard':
        // Strixhaven (13c): "discard any number of cards, then draw that many".
        if (d.kind === 'discard' && d.anyNumber)
          return {
            prompt: `${nameOf(d.resume.sourceDefId)}: discard any number of cards (${d.anyNumber.discarded} so far), then draw that many${d.anyNumber.plus ? ` plus ${d.anyNumber.plus}` : ''}`,
            primary: [
              d.anyNumber.discarded + (d.anyNumber.plus ?? 0)
                ? `Done: draw ${d.anyNumber.discarded + (d.anyNumber.plus ?? 0)}`
                : 'Discard nothing',
              () => act({ type: 'chooseEffect', player: HUMAN, accept: false }),
            ] as [string, () => void],
          };
        return { prompt: `Discard ${d.count} card${d.count > 1 ? 's' : ''}` };
      case 'splitPiles':
        return { prompt: 'Split the cards into two piles' };
      case 'choosePile':
        return { prompt: 'Choose a pile for your opponent' };
      case 'scry':
        return { prompt: `Scry ${d.cards.length}` };
      case 'searchLibrary':
        return { prompt: 'Search your library' };
      case 'sacrifice':
        return { prompt: 'Choose a creature to sacrifice' };
      case 'punisher':
        return { prompt: `Sacrifice, discard, or lose ${d.life} life` };
      case 'pickExiled':
        return { prompt: 'Choose a card to play' };
      case 'forage': {
        const name = nameOf(d.resume.sourceDefId);
        const how = [
          d.foods.length ? 'click a Food to sacrifice' : '',
          d.graveyard ? 'exile three cards from your graveyard' : '',
        ].filter(Boolean);
        const forage = (choice: ObjectId | 'graveyard' | null) => () =>
          act({ type: 'forage', player: HUMAN, choice });
        return {
          prompt: `${name}: forage — ${how.join(', or ')}`,
          ...(d.graveyard
            ? { primary: ['Exile from graveyard', forage('graveyard')] as [string, () => void] }
            : {}),
          ...(d.optional
            ? { secondary: ["Don't forage", forage(null)] as [string, () => void] }
            : {}),
        };
      }
      case 'chooseOption':
        return {
          prompt: d.title
            ? `${nameOf(d.resume.sourceDefId)}: ${d.title}`
            : `${nameOf(d.resume.sourceDefId)}: choose one`,
        };
      case 'castFree':
        return {
          prompt: `${nameOf(d.resume.sourceDefId)}: you may cast a card without paying its cost`,
        };
      case 'pickCards':
        return { prompt: `Choose ${d.count} card${d.count > 1 ? 's' : ''} to keep` };
      case 'chooseObject':
        // Final Fantasy (11a): Garnet: any number of Sagas, one at a time.
        if (d.optional)
          return {
            prompt: `${nameOf(d.resume.sourceDefId)}: choose a Saga to remove a lore counter from`,
            secondary: ['Done', () => act({ type: 'chooseCard', player: HUMAN, card: null })] as [
              string,
              () => void,
            ],
          };
        return { prompt: `${nameOf(d.resume.sourceDefId)}: choose one of your permanents` };
      case 'payOrCounter': {
        const pay = legal.find((a) => a.type === 'chooseEffect' && a.accept);
        // Strixhaven (13c): Archway Commons (sacrifice it) and Wandering Archaic (they copy the spell).
        if (d.otherwise)
          return {
            prompt: `${nameOf(d.resume.sourceDefId)}: pay ${manaText(d.cost)}, or ${
              d.resume.controller === HUMAN ? 'sacrifice it' : 'your opponent may copy your spell'
            }`,
            ...(pay
              ? { primary: [`Pay ${manaText(d.cost)}`, () => act(pay)] as [string, () => void] }
              : {}),
            secondary: [
              "Don't pay",
              () => act({ type: 'chooseEffect', player: HUMAN, accept: false }),
            ] as [string, () => void],
          };
        return {
          prompt: `${nameOf(d.resume.sourceDefId)}: pay ${manaText(d.cost)} or your spell is countered`,
          ...(pay
            ? { primary: [`Pay ${manaText(d.cost)}`, () => act(pay)] as [string, () => void] }
            : {}),
          secondary: [
            "Don't pay",
            () => act({ type: 'chooseEffect', player: HUMAN, accept: false }),
          ] as [string, () => void],
        };
      }
      case 'commandZone': {
        const zone = view.objects[d.card]!.zone;
        return {
          prompt: `Move ${nameOf(view.objects[d.card]!.defId)} to the command zone?`,
          primary: [
            'Command zone',
            () => act({ type: 'chooseEffect', player: HUMAN, accept: true }),
          ] as [string, () => void],
          secondary: [
            `Leave in ${zone === 'library' ? 'library' : zone}`,
            () => act({ type: 'chooseEffect', player: HUMAN, accept: false }),
          ] as [string, () => void],
        };
      }
      case 'chooseFromHand':
        return { prompt: 'Choose a card from your opponent’s hand' };
      case 'forageExile':
        return {
          prompt: `Forage: exile ${d.count} more card${d.count > 1 ? 's' : ''} from your graveyard`,
        };
      case 'priority': {
        const top = view.stack[view.stack.length - 1];
        if (top) {
          const name = nameOf(top.kind === 'spell' ? view.objects[top.id]!.defId : top.sourceDefId);
          const canRespond = legal.some((a) => a.type !== 'passPriority');
          const prompt =
            top.controller === HUMAN
              ? 'Respond, or let it resolve'
              : canRespond
                ? `Opponent: ${name}. Respond, or let it resolve`
                : `Opponent: ${name}`;
          return { prompt, primary: ['Resolve', () => act(pass)] };
        }
        if (mine && state.turn.step === 'main1')
          return {
            prompt: 'Your main phase',
            primary: ['To combat', () => act(pass)],
            secondary: [
              'End turn',
              () => (setSettings((s) => ({ ...s, passTurn: state.turn.number })), act(pass)),
            ],
          };
        if (mine && state.turn.step === 'main2')
          return { prompt: 'Your second main phase', primary: ['End turn', () => act(pass)] };
        return { prompt: 'You have priority', primary: ['Pass', () => act(pass)] };
      }
      default:
        return { prompt: '' };
    }
  }

  // Space = primary button, Escape = cancel, H = hint.
  const barRef = useRef(bar);
  barRef.current = bar;
  const askRef = useRef(askHint);
  askRef.current = askHint;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && barRef.current.primary) {
        e.preventDefault();
        barRef.current.primary[1]();
      } else if (e.key === 'h' || e.key === 'H') {
        askRef.current();
      } else if (e.key === 'Escape') {
        setTargeting((t) => (t?.skip || d.kind === 'chooseTriggerTargets' ? t : null));
        setBlocker(null);
        setMenu(null);
        setCastMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d.kind]);

  const [panel, setPanel] = useState<'log' | 'settings' | null>(null);
  // Mid-match rematch/menu from the settings drawer asks for confirmation first.
  const [leaving, setLeaving] = useState<'rematch' | 'menu' | null>(null);
  const togglePanel = (p: 'log' | 'settings') => {
    setPanel((cur) => (cur === p ? null : p));
    setLeaving(null);
  };
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, panel]);
  const [lastPlay, setLastPlay] = useState<{ key: number; defId: CardDefId } | null>(null);
  const topSpell = view.stack[view.stack.length - 1];
  const oppSpell = topSpell?.kind === 'spell' && topSpell.controller === BOT ? topSpell.id : null;
  useEffect(() => {
    if (oppSpell !== null)
      setLastPlay((p) => ({ key: (p?.key ?? 0) + 1, defId: view.objects[oppSpell]!.defId }));
  }, [oppSpell]);

  const priorityOf = d.kind === 'priority' ? d.player : null;
  useFlip(view, BOT);
  const lethal = isLethal(view, HUMAN, d.kind === 'declareBlockers' ? d.declared : []);
  useEffect(() => {
    if (!lethal) return;
    heartbeat();
    const beat = setInterval(heartbeat, 1000);
    return () => clearInterval(beat);
  }, [lethal]);

  return (
    <div
      className={`table table--arena ${targeting ? 'is-targeting' : ''} ${lethal ? 'is-lethal' : ''}`}
    >
      <ArenaBackdrop />
      <FxLayer batch={batch} view={view} me={HUMAN} />

      <main className="board">
        <header className="side side--opp">
          <PlayerBadge
            view={view}
            player={BOT}
            name="Opponent"
            art={artFor(decks.them)}
            targetable={targetablePlayer(BOT)}
            active={state.turn.activePlayer === BOT}
            priority={priorityOf === BOT}
            onClick={() => onPlayer(BOT)}
            command={<CommandSlot view={view} player={BOT} h={h} />}
          />
          <OpponentHand count={view.players[BOT].hand.length} />
        </header>

        <Battlefield view={view} player={BOT} mirrored h={h} />

        <div className="midline" />

        <Battlefield view={view} player={HUMAN} mirrored={false} h={h} />

        <footer className="side side--me">
          <PlayerBadge
            view={view}
            player={HUMAN}
            name="You"
            art={artFor(decks.you)}
            targetable={targetablePlayer(HUMAN)}
            active={state.turn.activePlayer === HUMAN}
            priority={priorityOf === HUMAN}
            onClick={() => onPlayer(HUMAN)}
            command={<CommandSlot view={view} player={HUMAN} h={h} />}
          />
          {!!view.players[HUMAN].pool?.length && (
            <div className="floating-mana" title="Mana in your pool: spent first">
              Floating {view.players[HUMAN].pool!.map((m) => `{${m.produces.join('/')}}`).join('')}
            </div>
          )}
          <Hand view={view} player={HUMAN} h={h} extras={extras} order={orderedHand} />
        </footer>
      </main>

      <ZonePiles
        view={view}
        player={BOT}
        me={HUMAN}
        onHover={setHover}
        onOpen={(zone) => setPile({ player: BOT, zone })}
      />
      <ZonePiles
        view={view}
        player={HUMAN}
        me={HUMAN}
        onHover={setHover}
        onOpen={(zone) => setPile({ player: HUMAN, zone })}
      />

      <StackView view={view} onHover={setHover} markOf={markOf} onCard={onCard} aside={!!targeting}>
        {respond && (
          <div className="stack__respond">
            <div className="action__prompt">{bar.prompt}</div>
            <div className="action__row">
              {secondary}
              {primary}
            </div>
          </div>
        )}
      </StackView>

      {lastPlay && panel !== 'log' && (
        <button
          key={lastPlay.key}
          className="lastplay"
          title="Open the game log"
          onClick={() => setPanel('log')}
          onMouseEnter={(e) => setHover(lastPlay.defId, e.currentTarget)}
          onMouseLeave={() => setHover(null)}
        >
          <Card defId={lastPlay.defId} size="stack" />
          <span>Opponent cast {nameOf(lastPlay.defId)}</span>
        </button>
      )}

      {d.kind !== 'gameOver' && (
        <div className={`action ${myDecision ? 'action--live' : ''}`}>
          {hint && myDecision && (
            <div className="hint__bubble" role="status">
              {hint.text}
            </div>
          )}
          {!respond && (myDecision || targeting) && (
            <>
              <div className="action__prompt">{bar.prompt}</div>
              {secondary && <div className="action__row">{secondary}</div>}
            </>
          )}
          <div className="action__row">
            <button
              className={`abtn abtn--icon ${hint ? 'is-on' : ''}`}
              title="What would a good player do? (H)"
              aria-label="Hint"
              disabled={!myDecision}
              onClick={askHint}
            >
              <svg className="hud-ico" viewBox="0 0 18 18" aria-hidden>
                <path d="M7 14h4M7.5 16h3M9 2a5 5 0 0 0-2.9 9.1c.5.3.7.8.7 1.3v.1h4.4v-.1c0-.5.2-1 .7-1.3A5 5 0 0 0 9 2z" />
              </svg>
            </button>
            <button
              className={`abtn abtn--icon ${settings.fullControl ? 'is-on' : ''}`}
              title={`Full control: stop at every priority (${settings.fullControl ? 'on' : 'off'})`}
              aria-label="Full control"
              aria-pressed={settings.fullControl}
              onClick={() => setSettings((s) => ({ ...s, fullControl: !s.fullControl }))}
            >
              <svg className="hud-ico" viewBox="0 0 18 18" aria-hidden>
                <path d="M5.5 3h7A2.5 2.5 0 0 1 15 5.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 12.5v-7A2.5 2.5 0 0 1 5.5 3zM7 6.5v5M11 6.5v5" />
              </svg>
            </button>
            {respond ? null : myDecision || targeting ? (
              primary
            ) : (
              <button
                className={`abtn abtn--main abtn--wait ${game.thinking ? 'is-thinking' : ''}`}
                disabled
              >
                {state.turn.activePlayer === BOT ? "Opponent's turn" : 'Waiting for opponent'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="corner">
        <button
          className={`icon-btn ${panel === 'log' ? 'is-on' : ''}`}
          title="Game log"
          onClick={() => togglePanel('log')}
        >
          <svg className="hud-ico" viewBox="0 0 18 18" aria-hidden>
            <path d="M5 2.5h8a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 14V4A1.5 1.5 0 0 1 5 2.5zM6.5 6.5h5M6.5 9h5M6.5 11.5h3" />
          </svg>
        </button>
        <button
          className={`icon-btn ${panel === 'settings' ? 'is-on' : ''}`}
          title="Settings"
          onClick={() => togglePanel('settings')}
        >
          <svg className="hud-ico" viewBox="0 0 18 18" aria-hidden>
            <path d="M9 6.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM7.8 1.9h2.4l.4 1.8 1.3.6 1.6-1 1.7 1.7-1 1.6.6 1.3 1.8.4v2.4l-1.8.4-.6 1.3 1 1.6-1.7 1.7-1.6-1-1.3.6-.4 1.8H7.8l-.4-1.8-1.3-.6-1.6 1-1.7-1.7 1-1.6-.6-1.3-1.8-.4V7.8l1.8-.4.6-1.3-1-1.6 1.7-1.7 1.6 1 1.3-.6z" />
          </svg>
        </button>
      </div>

      {panel === 'log' && (
        <aside className="drawer">
          <div className="drawer__title">Game log</div>
          <div className="log" ref={logRef}>
            {log.map((l, i) => (
              <div key={l.id}>
                {(i === 0 || log[i - 1]!.turn !== l.turn) && (
                  <div className="log__turn">Turn {l.turn}</div>
                )}
                <div
                  className={`log__line ${l.who ? `log__line--${l.who === HUMAN ? 'me' : 'opp'}` : ''}`}
                >
                  {l.text}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {panel === 'settings' && (
        <aside className="drawer drawer--settings">
          <div className="drawer__title">Settings</div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.fullControl}
              onChange={(e) => setSettings((s) => ({ ...s, fullControl: e.target.checked }))}
            />
            Full control (stop at every priority)
          </label>
          <UiSize />
          <SoundControl />
          <div className="drawer__actions">
            {leaving ? (
              <>
                <span className="drawer__confirm">
                  {leaving === 'rematch'
                    ? gauntlet
                      ? (concedeText ?? 'Concede this match? It counts as a loss.')
                      : 'Restart this match?'
                    : gauntlet
                      ? (pauseText ?? 'Pause the run? You can resume this match later.')
                      : 'Leave this match?'}
                </span>
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    if (leaving === 'menu') return onMenu();
                    if (!gauntlet) return onRematch();
                    setLeaving(null);
                    setPanel(null);
                    apply({ type: 'concede', player: HUMAN });
                  }}
                >
                  Yes
                </button>
                <button className="btn btn--ghost" onClick={() => setLeaving(null)}>
                  No
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--ghost" onClick={() => setLeaving('rematch')}>
                  {gauntlet ? 'Concede' : 'Rematch'}
                </button>
                <button className="btn btn--ghost" onClick={() => setLeaving('menu')}>
                  Main menu
                </button>
              </>
            )}
          </div>
        </aside>
      )}

      {menu && (
        <div className="menu" onClick={() => setMenu(null)}>
          <div className="menu__box" onClick={(e) => e.stopPropagation()}>
            <div className="menu__title">{nameOf(view.objects[menu.source]!.defId)}</div>
            {menu.indices.map((i) => (
              <button key={i} className="btn btn--ghost" onClick={() => activate(menu.source, i)}>
                {abilityLabel(view.objects[menu.source]!.defId, i)}
              </button>
            ))}
          </div>
        </div>
      )}

      {castMenu && (
        <div className="menu" onClick={() => setCastMenu(null)}>
          <div className="menu__box" onClick={(e) => e.stopPropagation()}>
            <div className="menu__title">{nameOf(view.objects[castMenu.source]!.defId)}</div>
            {castMenu.groups.map((g) => (
              <button
                key={castLabel(view.objects[castMenu.source]!.defId, g[0]!)}
                className="btn btn--ghost"
                onClick={() => {
                  setCastMenu(null);
                  beginOrApply(castMenu.source, nameOf(view.objects[castMenu.source]!.defId), g);
                }}
              >
                {castLabel(view.objects[castMenu.source]!.defId, g[0]!)}
              </button>
            ))}
          </div>
        </div>
      )}

      {pile && (
        <PileViewer
          view={view}
          player={pile.player}
          zone={pile.zone}
          me={HUMAN}
          library={state.players[pile.player].library.map((id) => state.objects[id]!.defId)}
          onHover={setHover}
          onClose={closePile}
        />
      )}

      {d.kind === 'castFree' && d.player === HUMAN && !targeting && !castMenu && (
        <div className="overlay overlay--mull">
          <div className="mull">
            <h2>{nameOf(d.resume.sourceDefId)}</h2>
            <p>
              {d.discardInstead
                ? 'You may cast it by discarding a card instead of paying its mana cost.'
                : d.pay
                  ? `You may cast it by paying ${manaText(d.pay)} rather than its mana cost.`
                  : d.costLess
                    ? `You may cast it; it costs {${d.costLess}} less.`
                    : 'You may cast it without paying its mana cost.'}
            </p>
            <div className="mull__hand">
              {d.cards.map((id, i) => {
                const casts = legal.filter((a) => a.type === 'castSpell' && a.card === id);
                return (
                  <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
                    <Card
                      id={id}
                      defId={view.objects[id]!.defId}
                      size="mull"
                      mark={casts.length ? 'playable' : null}
                      {...(casts.length ? { onClick: () => startCast(id, casts) } : {})}
                      onHover={setHover}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mull__buttons">
              <button
                className="btn btn--ghost"
                onClick={() => act({ type: 'chooseEffect', player: HUMAN, accept: false })}
              >
                Don't cast
              </button>
            </div>
          </div>
        </div>
      )}

      {d.kind === 'pickCards' && d.player === HUMAN && (
        <div className="overlay overlay--mull">
          <div className="mull">
            <h2>{nameOf(d.resume.sourceDefId)}</h2>
            {d.upTo ? (
              // Strixhaven (13c): Search for Blex: any number, each costing life.
              <p>
                Put any number of these into your hand
                {d.lifePerCard ? `, losing ${d.lifePerCard} life for each` : ''}. The rest go to
                your graveyard.
              </p>
            ) : (
              <p>
                Put {d.count} more card{d.count > 1 ? 's' : ''} into your hand. The rest go to your
                graveyard.
              </p>
            )}
            <div className="mull__hand">
              {d.options.map((id, i) => (
                <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
                  <Card
                    id={id}
                    defId={view.objects[id]!.defId}
                    size="mull"
                    mark="option"
                    onClick={() => act({ type: 'chooseCard', player: HUMAN, card: id })}
                    onHover={setHover}
                  />
                </div>
              ))}
            </div>
            {d.upTo && (
              <div className="mull__buttons">
                <button
                  className="btn btn--primary"
                  onClick={() => act({ type: 'chooseCard', player: HUMAN, card: null })}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {d.kind === 'forageExile' && d.player === HUMAN && (
        <div className="overlay overlay--mull">
          <div className="mull">
            <h2>Forage</h2>
            <p>
              Exile {d.count} more card{d.count > 1 ? 's' : ''} from your graveyard.
            </p>
            <div className="mull__hand">
              {legal.flatMap((a, i) =>
                a.type === 'chooseCard' && a.card ? (
                  <div
                    key={a.card}
                    className="mull__card"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <Card
                      id={a.card}
                      defId={view.objects[a.card]!.defId}
                      size="mull"
                      mark="option"
                      onClick={() => act(a)}
                      onHover={setHover}
                    />
                  </div>
                ) : (
                  []
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {targeting && graveyardOptions.length > 0 && (
        <div className="overlay overlay--mull">
          <div className="mull">
            <h2>{targeting.label}</h2>
            <p>Choose a card from a graveyard.</p>
            <div className="mull__hand">
              {graveyardOptions.map((id, i) => (
                <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
                  <Card
                    id={id}
                    defId={view.objects[id]!.defId}
                    size="mull"
                    mark="option"
                    onClick={() => choose(`obj:${id}`)}
                    onHover={setHover}
                  />
                </div>
              ))}
            </div>
            {targeting.skip && (
              <div className="mull__buttons">
                <button className="btn btn--ghost" onClick={() => act(targeting.skip!)}>
                  Skip
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {d.kind === 'optionalEffect' && d.player === HUMAN && (
        <div className="menu">
          <div className="menu__box">
            <div className="menu__title">{nameOf(d.resume.sourceDefId)}: optional effect</div>
            {legal.map(
              (a) =>
                a.type === 'chooseEffect' && (
                  <button key={String(a.accept)} className="btn btn--ghost" onClick={() => act(a)}>
                    {a.accept ? 'Use ability' : 'Decline'}
                  </button>
                ),
            )}
          </div>
        </div>
      )}
      {d.kind === 'chooseOption' && d.player === HUMAN && (
        <OptionMenu
          title={`${nameOf(d.resume.sourceDefId)}: ${d.title ?? 'choose one'}`}
          options={d.options}
          onPick={(index) => act({ type: 'chooseOption', player: HUMAN, index })}
        />
      )}
      {d.kind === 'chooseFromHand' && d.player === HUMAN && (
        <div className="overlay overlay--mull">
          <div className="mull">
            <h2>{nameOf(d.resume.sourceDefId)}</h2>
            <p>
              Your opponent reveals their hand. Choose a card to{' '}
              {d.then === 'discard' ? 'discard' : 'exile'}.
            </p>
            <div className="mull__hand">
              {view.players[d.from].hand.map((id, i) => (
                <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
                  <Card
                    id={id}
                    defId={view.objects[id]!.defId}
                    size="mull"
                    mark={d.options.includes(id) ? 'option' : null}
                    {...(d.options.includes(id)
                      ? { onClick: () => act({ type: 'chooseCard', player: HUMAN, card: id }) }
                      : {})}
                    onHover={setHover}
                  />
                </div>
              ))}
            </div>
            {d.options.length === 0 && (
              <div className="mull__buttons">
                <button
                  className="btn btn--ghost"
                  onClick={() => act({ type: 'chooseCard', player: HUMAN, card: null })}
                >
                  Nothing to choose
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {d.kind === 'chooseTriggerTargets' &&
        d.player === HUMAN &&
        legal.some((a) => a.type === 'chooseTargets' && a.mode !== undefined) && (
          <div className="menu">
            <div className="menu__box">
              <div className="menu__title">{nameOf(d.trigger.sourceDefId)}: choose one</div>
              {legal.map((a) =>
                a.type === 'chooseTargets' && a.mode !== undefined ? (
                  <button key={a.mode} className="btn btn--ghost" onClick={() => act(a)}>
                    {triggerModeLabel(d.trigger, a.mode)}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}

      {d.kind === 'splitPiles' && d.player === HUMAN && (
        <SplitPilesOverlay key={d.cards.join()} game={game} onHover={setHover} />
      )}
      {d.kind === 'choosePile' && d.player === HUMAN && (
        <ChoosePileOverlay game={game} onHover={setHover} />
      )}

      {(d.kind === 'punisher' || d.kind === 'pickExiled') && d.player === HUMAN && (
        <ChooseCardOverlay game={game} onHover={setHover} />
      )}

      {d.kind === 'searchLibrary' && d.player === HUMAN && (
        <SearchOverlay game={game} onHover={setHover} />
      )}

      {(d.kind === 'mulligan' || d.kind === 'bottomCards') && d.player === HUMAN && (
        <MulliganOverlay game={game} onHover={setHover} hint={hint} onHint={askHint} />
      )}
      {d.kind === 'scry' && d.player === HUMAN && (
        <ScryOverlay key={d.cards.join()} game={game} onHover={setHover} />
      )}

      {state.winner && (
        <div className="overlay overlay--end">
          <div className={`end end--${state.winner === HUMAN ? 'win' : 'loss'}`}>
            <h1>{winnerText(state, HUMAN)}</h1>
            <p>
              {gauntlet ? `${gauntlet} · turn ${state.turn.number}` : `Turn ${state.turn.number}`}
            </p>
            {resultText && <p role="status">{resultText}</p>}
            <div className="end__actions">
              <button className="btn btn--primary" onClick={onRematch}>
                {gauntlet ? 'Continue' : 'Rematch'}
              </button>
              <button className="btn btn--ghost" onClick={onMenu}>
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}

      {drag.dragging && (
        <div ref={drag.ghostRef} className="drag-ghost">
          <Card defId={view.objects[drag.dragging]!.defId} size="hand" />
        </div>
      )}
      {!drag.dragging && <HoverPreview hover={hover} notes={notes} />}

      <Arrows specs={arrows} deps={[state, targeting]} />
      <Floaters batch={batch} />
      <TurnBanner batch={batch} me={HUMAN} />
    </div>
  );
}

/** Curator of Destinies: click cards to move them to the face-up pile. */
function SplitPilesOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
  const { view, apply, state } = game;
  const d = state.decision;
  const [up, setUp] = useState<ReadonlySet<string>>(new Set());
  if (d.kind !== 'splitPiles') return null;
  const toggle = (id: string) =>
    setUp((u) => {
      const next = new Set(u);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>Split into two piles</h2>
        <p>
          Click cards to put them in the face-up pile; the rest are face down. Your opponent picks a
          pile for your hand, and the other goes to your graveyard.
        </p>
        <div className="mull__hand">
          {d.cards.map((id, i) => (
            <div
              key={id}
              className={`mull__card scry__card ${up.has(id) ? '' : 'is-bottom'}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <Card
                id={id}
                defId={view.objects[id]!.defId}
                size="mull"
                mark={up.has(id) ? 'playable' : null}
                onClick={() => toggle(id)}
                onHover={onHover}
              />
              <span className="scry__label">{up.has(id) ? 'Face up' : 'Face down'}</span>
            </div>
          ))}
        </div>
        <div className="mull__buttons">
          <button
            className="btn btn--primary"
            onClick={() =>
              apply({
                type: 'splitPiles',
                player: HUMAN,
                faceUp: d.cards.filter((id) => up.has(id)),
              })
            }
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Choosing which of the opponent's piles goes to their hand. */
function ChoosePileOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
  const { view, apply, state } = game;
  const d = state.decision;
  if (d.kind !== 'choosePile') return null;
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>Choose a pile</h2>
        <p>The pile you choose goes to your opponent's hand; the other goes to their graveyard.</p>
        <div className="mull__hand">
          {d.faceUp.map((id, i) => (
            <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
              <Card id={id} defId={view.objects[id]!.defId} size="mull" onHover={onHover} />
            </div>
          ))}
        </div>
        <div className="mull__buttons">
          <button
            className="btn btn--ghost"
            onClick={() => apply({ type: 'choosePile', player: HUMAN, pile: 'faceUp' })}
          >
            Face-up pile ({d.faceUp.length})
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => apply({ type: 'choosePile', player: HUMAN, pile: 'faceDown' })}
          >
            Face-down pile ({d.faceDown.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function extraLabel(o: GameObject): string {
  const { zone, defId } = o;
  // Secrets of Strixhaven (14a): the copy of a prepared creature's spell; Paradigm's free copy.
  if (zone === 'exile' && o.preparedBy !== undefined) return 'Prepared';
  if (zone === 'exile' && o.spellCopyCard) return 'Paradigm';
  if (zone === 'exile') return 'Exiled';
  if (zone === 'library') return 'Top of library';
  const def = cardDb.get(defId);
  if (def?.flashback) return 'Flashback';
  if (def?.castFromGraveyardRemovingCounters) return 'From graveyard';
  return 'Graveyard';
}

function triggerModeLabel(t: PendingTrigger, mode: number): string {
  const a = cardDb.get(t.sourceDefId)?.abilities[t.abilityIndex];
  return (a?.kind === 'triggered' && a.modes?.[mode]?.label) || `Mode ${mode + 1}`;
}

/** Perforating Artist (sacrifice, discard or lose life) and Strongbox Raider (pick a card). */
function ChooseCardOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
  const { view, legal, apply, state } = game;
  const d = state.decision;
  if (d.kind !== 'punisher' && d.kind !== 'pickExiled') return null;
  const picks = legal.flatMap((a) => (a.type === 'chooseCard' && a.card ? [a] : []));
  const punisher = d.kind === 'punisher';
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>{punisher ? `Lose ${d.life} life?` : 'Choose a card to play'}</h2>
        <p>
          {punisher
            ? 'Sacrifice a nonland permanent or discard a card, or lose the life.'
            : 'You may play it until the end of your next turn. The other stays exiled.'}
        </p>
        <div className="mull__hand">
          {picks.map((a, i) => (
            <div key={a.card} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
              <Card
                id={a.card!}
                defId={view.objects[a.card!]!.defId}
                size="mull"
                mark="option"
                onClick={() => apply(a)}
                onHover={onHover}
              />
              {punisher && (
                <span className="scry__label">
                  {view.objects[a.card!]!.zone === 'hand' ? 'Discard' : 'Sacrifice'}
                </span>
              )}
            </div>
          ))}
        </div>
        {punisher && (
          <div className="mull__buttons">
            <button
              className="btn btn--primary"
              onClick={() => apply({ type: 'chooseCard', player: HUMAN, card: null })}
            >
              Lose {d.life} life
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Strixhaven (13c): Uvilda exiles a card from your hand as a cost. */
function exilesFromHand(defId: CardDefId, index: number): boolean {
  const a = cardDb.get(defId)?.abilities[index];
  return a?.kind === 'activated' && !!a.cost.exileRefine;
}

/** Secrets of Strixhaven (14b): Page, Loose Leaf discards another card with its name. */
function discardsSameName(defId: CardDefId, index: number): boolean {
  const a = cardDb.get(defId)?.abilities[index];
  return a?.kind === 'activated' && !!a.cost.discardSameName;
}

/** Final Fantasy (11b): what a kicker paid with a permanent asks for (Vayne's Treachery, Chocobo Kick). */
function kickPermanentPrompt(defId: CardDefId | undefined, a: Action): string | null {
  if (a.type !== 'castSpell' || !a.kicked || !defId) return null;
  const kicker = cardDb.get(defId)?.kicker;
  if (kicker?.returnLand) return 'a land to return to your hand';
  if (kicker?.sacrifice) return 'an artifact or creature to sacrifice';
  return null;
}

/** "Choose one" mode name, or kicked / not kicked. */
function castLabel(defId: CardDefId, a: Action): string {
  // Final Fantasy (11a): an adventure land's own option.
  if (a.type === 'playLand') return `Play ${cardDb.get(defId)?.name ?? 'land'}`;
  if (a.type !== 'castSpell' && a.type !== 'activateAbility') return '';
  if (a.forage)
    return a.forage === 'graveyard'
      ? 'Forage: exile three cards from your graveyard'
      : 'Forage: sacrifice a Food';
  if (a.x !== undefined) return `X = ${a.x}`;
  if (a.type === 'activateAbility') return 'Activate';
  if (a.via === 'festival') return 'From your graveyard (pay 1 life)';
  if (a.via === 'osteomancer') return 'From your graveyard (forage)';
  // Secrets of Strixhaven (14b): Zaffai and the Tempests (free, once a turn).
  if (a.via === 'zaffai') return 'Cast free (Zaffai)';
  if (a.paws) return pawLabel(defId, a.paws);
  const def = cardDb.get(defId);
  if (a.type === 'castSpell' && a.sneak && def?.sneak) return `Sneak (${manaText(def.sneak)})`;
  // Final Fantasy (11a): an adventure land's Adventure.
  if (def?.adventure && a.back) {
    const face = cardDb.get(def.back!);
    return `Adventure: ${face?.name ?? ''} (${face ? manaText(face.manaCost) : ''})`;
  }
  // A modal double-faced card: cast either face.
  if (def?.back) {
    const face = a.back ? cardDb.get(def.back) : def;
    return `Cast ${face?.name ?? ''} (${face ? manaText(face.manaCost) : ''})`;
  }
  // Final Fantasy (11a): tiered: the mode with its additional cost ("Thundara — {3}").
  if (a.mode !== undefined && def?.tiered?.[a.mode])
    return `${def.modes?.[a.mode]?.label ?? `Mode ${a.mode + 1}`} — ${manaText(def.tiered[a.mode]!) || '{0}'}`;
  if (a.mode !== undefined) return def?.modes?.[a.mode]?.label ?? `Mode ${a.mode + 1}`;
  if (def?.sacrificeOrPay)
    return a.sacrifice ? 'Sacrifice a creature' : `Pay ${manaText(def.sacrificeOrPay)}`;
  if (def?.forageOrPay) return `Pay ${manaText(def.forageOrPay)}`;
  // Multikicker (Batroc), overload (Vandalblast), Toxic Deluge's X life.
  if (a.kickCount) return `Kicked ×${a.kickCount}`;
  if (def?.payXLife && a.x !== undefined) return `Pay ${a.x} life`;
  if (def?.multikicker) return 'Not kicked';
  // Strixhaven (13c): Plumb the Forbidden: sacrifice creatures, copy the spell for each.
  if (def?.sacrificeCreaturesToCopy) {
    const n = a.type === 'castSpell' ? (a.sacrificeMany?.length ?? 0) : 0;
    return n
      ? `Sacrifice ${n} creature${n > 1 ? 's' : ''}: copy it ${n} time${n > 1 ? 's' : ''}`
      : 'No sacrifice';
  }
  // Secrets of Strixhaven (14b): Soaring Stoneglider, exile two cards from your graveyard or pay the kicker.
  if (def?.unkickedExilesGraveyard && def.kicker)
    return a.kicked
      ? `Pay ${manaText(def.kicker.cost)}`
      : `Exile ${def.unkickedExilesGraveyard} cards from your graveyard`;
  if (!def?.kicker) return 'Cast';
  if (def.kicker.as === 'overload')
    return a.kicked ? `Overload (each, ${manaText(def.kicker.cost)} more)` : 'One target';
  if (def.kicker.as === 'gift')
    return a.kicked ? `Promise ${giftText(def)} to your opponent` : 'No gift';
  if (def.kicker.as === 'offspring')
    return a.kicked ? `With offspring (+${manaText(def.kicker.cost)})` : 'Without offspring';
  if (def.kicker.teamwork !== undefined)
    return a.kicked ? `Teamwork (tap power ${def.kicker.teamwork})` : 'Without teamwork';
  // Strixhaven (13b): an alternative cost (Baleful Mastery).
  if (def.kicker.replacesCost)
    return a.kicked
      ? `Alternative cost (${manaText(def.kicker.cost)}): ${def.kicker.altLabel ?? 'an opponent draws a card'}`
      : 'Full cost';
  // Final Fantasy (11b): a kicker paid with a permanent.
  if (def.kicker.returnLand) return a.kicked ? 'Kicked (return a land)' : 'Not kicked';
  if (def.kicker.sacrifice)
    return a.kicked ? 'Kicked (sacrifice an artifact or creature)' : 'Not kicked';
  return a.kicked ? `Kicked (+${manaText(def.kicker.cost)})` : 'Not kicked';
}

/** A Season's chosen modes: "Rabbit ×3, Exile, they draw". */
function pawLabel(defId: CardDefId, paws: readonly number[]): string {
  const modes = cardDb.get(defId)?.pawprints ?? [];
  const counts = new Map<number, number>();
  for (const m of paws) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts]
    .map(([m, n]) => `${modes[m]?.spell.label ?? `Mode ${m + 1}`}${n > 1 ? ` ×${n}` : ''}`)
    .join(', ');
}

/** What a gift spell promises: "a card", "a Food", "a tapped Fish". */
function giftText(def: CardDefinition): string {
  const gift = def.kicker?.spell?.effects[0];
  if (gift?.kind === 'createToken')
    return `a ${gift.tapped ? 'tapped ' : ''}${cardDb.get(gift.token)?.name ?? 'token'}`;
  return 'a card';
}

/** A menu label for an activated ability: its own label, or its cost ("{1}{U}, {T}"). */
function abilityLabel(defId: CardDefId, i: number): string {
  const a = cardDb.get(defId)?.abilities[i];
  if (!a || a.kind !== 'activated') return `Ability ${i + 1}`;
  if (a.label) return a.label;
  const c = a.cost;
  const parts = [
    c.mana ? manaText(c.mana) : '',
    c.tapSelf ? '{T}' : '',
    c.life ? `pay ${c.life} life` : '',
    c.sacrificeSelf ? 'sacrifice it' : '',
    c.sacrificeCreature ? 'sacrifice a creature' : '',
    c.forage ? 'forage' : '',
    c.exileSelf ? 'exile it' : '',
  ].filter(Boolean);
  if (a.powerUp) return `Power-up ${parts.join(', ')}`;
  return parts.join(', ') || `Ability ${i + 1}`;
}

function manaText(c: ManaCost): string {
  const pips = Object.entries(c.colored).flatMap(([t, n]) => Array<string>(n ?? 0).fill(`{${t}}`));
  const hybrid = [
    ...(c.hybrid ?? []).map(([a, b]) => `{${a}/${b}}`),
    // Secrets of Strixhaven (14b): twobrid pips.
    ...(c.twoHybrid ?? []).map((t) => `{2/${t}}`),
  ];
  const x = '{X}'.repeat(c.x ?? 0);
  const twoHybrid = (c.twoHybrid ?? []).map((t) => `{2/${t}}`);
  return `${x}${c.generic ? `{${c.generic}}` : ''}${pips.join('')}${hybrid.join('')}${twoHybrid.join('')}`;
}

/** Prompt for a triggered ability, mentioning an optional cost ("you may pay"). */
function triggerLabel(t: PendingTrigger): string {
  const a = cardDb.get(t.sourceDefId)?.abilities[t.abilityIndex];
  const cost = a?.kind === 'triggered' && a.cost ? ` (pay ${manaText(a.cost)})` : '';
  return `${nameOf(t.sourceDefId)}${cost}`;
}

/** Library search: pick a card (one of each kind is shown) or find nothing. */
function SearchOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
  const { view, legal, apply, state } = game;
  const d = state.decision;
  const picks = legal.flatMap((a) => (a.type === 'chooseCard' && a.card ? [a] : []));
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>
          {d.kind === 'searchLibrary' && d.fromGraveyard
            ? picks[0]?.card && view.objects[picks[0].card]?.zone === 'exile'
              ? 'Choose a card you own in exile'
              : 'Choose from your graveyard'
            : d.kind === 'searchLibrary' && d.looked
              ? 'Top of your library'
              : 'Search your library'}
        </h2>
        <p>
          {d.kind === 'searchLibrary' && d.to === 'libraryBottom'
            ? // Strixhaven (13c): Ardent Dustspeaker
              'Choose a card to put on the bottom of your library.'
            : d.kind === 'searchLibrary' && d.to === 'castFree'
              ? 'Choose a card to exile; you may cast it without paying its mana cost.'
              : d.kind === 'searchLibrary' && d.to && d.to !== 'hand'
                ? 'Choose a card to put onto the battlefield.'
                : d.kind === 'searchLibrary' && d.canBin
                  ? // Strixhaven (13c): The Biblioplex
                    'An instant or sorcery card may go into your hand; otherwise you may put it into your graveyard.'
                  : 'Choose a card to put into your hand.'}{' '}
          {d.kind === 'searchLibrary' && d.fromGraveyard
            ? ''
            : d.kind === 'searchLibrary' && d.looked
              ? 'The rest go to the bottom.'
              : 'Your library is then shuffled.'}
        </p>
        <div className="mull__hand">
          {picks.map((a, i) => (
            <div key={a.card} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
              <Card
                id={a.card!}
                defId={view.objects[a.card!]!.defId}
                size="mull"
                mark="playable"
                onClick={() => apply(a)}
                onHover={onHover}
              />
            </div>
          ))}
        </div>
        {d.kind === 'searchLibrary' && d.canBin && (
          <div className="mull__hand">
            {(d.looked ?? [])
              .filter((id) => !picks.some((a) => a.card === id))
              .map((id) => (
                <div key={id} className="mull__card">
                  <Card id={id} defId={view.objects[id]!.defId} size="mull" onHover={onHover} />
                </div>
              ))}
          </div>
        )}
        <div className="mull__buttons">
          {d.kind === 'searchLibrary' && d.canBin && (
            <button
              className="btn"
              onClick={() => apply({ type: 'chooseEffect', player: HUMAN, accept: true })}
            >
              Put it into your graveyard
            </button>
          )}
          <button
            className="btn btn--ghost"
            onClick={() => apply({ type: 'chooseCard', player: HUMAN, card: null })}
          >
            {d.kind === 'searchLibrary' && d.canBin
              ? 'Leave it on top'
              : d.kind === 'searchLibrary' && d.fromGraveyard
                ? 'Choose nothing'
                : 'Find nothing'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Arena-style scry: click a card to send it to the bottom (or back), then confirm. */
function ScryOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
  const { view, apply, state } = game;
  const d = state.decision;
  const [bottom, setBottom] = useState<ReadonlySet<string>>(new Set());
  if (d.kind !== 'scry') return null;
  const toggle = (id: string) =>
    setBottom((b) => {
      const next = new Set(b);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const confirm = () =>
    apply({
      type: 'scry',
      player: HUMAN,
      top: d.cards.filter((id) => !bottom.has(id)),
      bottom: d.cards.filter((id) => bottom.has(id)),
    });
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>
          {d.surveil ? 'Surveil' : 'Scry'} {d.cards.length}
        </h2>
        <p>
          Click a card to put it{' '}
          {d.surveil ? 'into your graveyard' : 'on the bottom of your library'}. The rest stay on
          top.
        </p>
        <div className="mull__hand">
          {d.cards.map((id, i) => (
            <div
              key={id}
              className={`mull__card scry__card ${bottom.has(id) ? 'is-bottom' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <Card
                id={id}
                defId={view.objects[id]!.defId}
                size="mull"
                mark={bottom.has(id) ? null : 'playable'}
                onClick={() => toggle(id)}
                onHover={onHover}
              />
              <span className="scry__label">
                {bottom.has(id) ? (d.surveil ? 'Graveyard' : 'Bottom') : 'Top'}
              </span>
            </div>
          ))}
        </div>
        <div className="mull__buttons">
          <button className="btn btn--primary" onClick={confirm}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MulliganOverlay({
  game,
  onHover,
  hint,
  onHint,
}: {
  game: GameSession;
  onHover: HoverFn;
  hint: Hint | null;
  onHint: () => void;
}) {
  const { view, legal, apply, state } = game;
  const d = state.decision;
  const p = view.players[HUMAN];
  const bottoming = d.kind === 'bottomCards';
  return (
    <div className="overlay overlay--mull">
      <div className="mull">
        <h2>
          {bottoming
            ? `Put ${d.count} card${d.count > 1 ? 's' : ''} on the bottom`
            : 'Opening hand'}
        </h2>
        <p>
          {bottoming
            ? 'Click the cards you want to put on the bottom of your library.'
            : `${state.turn.activePlayer === HUMAN ? 'You play first.' : 'Opponent plays first.'}${
                p.mulligans ? ` Mulligans taken: ${p.mulligans}.` : ''
              }`}
        </p>
        <div className="mull__hand">
          {p.hand.map((id, i) => (
            <div key={id} className="mull__card" style={{ '--i': i } as React.CSSProperties}>
              <Card
                id={id}
                defId={view.objects[id]!.defId}
                size="mull"
                mark={hint?.cards.includes(id) ? 'hint' : bottoming ? 'playable' : null}
                {...(bottoming
                  ? { onClick: () => apply({ type: 'bottomCard', player: HUMAN, card: id }) }
                  : {})}
                onHover={onHover}
              />
            </div>
          ))}
        </div>
        {hint && (
          <div className="hint__bubble mull__hint" role="status">
            {hint.text}
          </div>
        )}
        {!bottoming && (
          <div className="mull__buttons">
            <button className="btn btn--ghost" onClick={onHint}>
              Hint
            </button>
            {legal.some((a) => a.type === 'mulligan') && (
              <button
                className="btn btn--ghost"
                onClick={() => apply({ type: 'mulligan', player: HUMAN })}
              >
                Mulligan
              </button>
            )}
            <button
              className="btn btn--primary"
              onClick={() => apply({ type: 'keepHand', player: HUMAN })}
            >
              Keep hand
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
