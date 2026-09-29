import { cardDb, type Decklist } from '@mtg/cards';
import type { Action, CardDefId, ManaCost, ObjectId, PendingTrigger, PlayerId } from '@mtg/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  castGroups,
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
import { Card, type CardMark, type HoverFn } from './Card.tsx';
import { FxLayer } from './FxLayer.tsx';
import { type ArrowSpec, Arrows, Floaters, TurnBanner, winnerText } from './Effects.tsx';
import {
  Battlefield,
  Hand,
  OpponentHand,
  PhaseTrack,
  PlayerBadge,
  StackView,
  type ZoneHandlers,
} from './Zones.tsx';
import { Playmat } from './Playmat.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';
import { SoundControl } from './SoundControl.tsx';
import { heartbeat, playEvents, playHover } from '../game/sound.ts';
import { isLethal } from '../game/lethal.ts';

const nameOf = (defId: CardDefId) => cardDb.get(defId)?.name ?? 'Card';

export function Board({
  game,
  decks,
  gauntlet,
  onMenu,
  onRematch,
}: {
  game: GameSession;
  decks: { you: Decklist; them: Decklist };
  /** Set for a gauntlet round (e.g. "Gauntlet · Round 3 of 6"): no restarts, and "Continue" goes back to the ladder. */
  gauntlet?: string;
  onMenu: () => void;
  onRematch: () => void;
}) {
  const { state, view, legal, apply, log, batch, settings, setSettings } = game;
  const d = state.decision;
  // Priority we are about to auto-pass is not ours to act on: showing it would
  // flash a Pass button and card glows for a moment on every step.
  const myDecision = d.kind !== 'gameOver' && d.player === HUMAN && !game.autoPassing;

  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [blocker, setBlocker] = useState<ObjectId | null>(null);
  const [hover, setHoverState] = useState<HoverState | null>(null);
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

  // Any new decision resets half-finished UI interactions.
  const decisionKey = `${state.turn.number}:${state.turn.step}:${d.kind}:${state.stack.length}`;
  useEffect(() => {
    setTargeting(null);
    setBlocker(null);
    setMenu(null);
    setCastMenu(null);
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
      apply(a);
    },
    [apply],
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

  const drag = useHandDrag({
    canDrag: (id) => myDecision && !targeting && playable(id).length > 0,
    onDrop: dropCard,
  });

  /** While dragging a targeted spell, its possible first targets light up. */
  const dragTargets = useMemo(() => {
    if (!drag.dragging) return null;
    const casts = playable(drag.dragging).filter((a) => targetsOf(a).length > 0);
    return casts.length ? targetOptions(startTargeting(drag.dragging, '', casts)) : null;
  }, [drag.dragging, legal]);

  // ------------------------------------------------------------------ clicks

  const onCard = (id: ObjectId) => {
    if (drag.wasDrag()) return;
    if (targeting) return choose(`obj:${id}`);
    if (!myDecision) return;
    if (d.kind === 'sacrifice') {
      if (d.options.includes(id)) act({ type: 'chooseCard', player: HUMAN, card: id });
      return;
    }
    const o = view.objects[id]!;
    if (o.zone !== 'battlefield') {
      const acts = handActions(legal, id);
      const casts = acts.filter((a) => a.type === 'castSpell');
      if (casts.length) return startCast(id, casts);
      const ability = legal.find((a) => a.type === 'activateAbility' && a.source === id);
      if (ability?.type === 'activateAbility') return activate(id, ability.abilityIndex);
      if (acts[0]) act(acts[0]);
      return;
    }
    const acts = permanentActions(legal, id);
    if (d.kind === 'declareAttackers') {
      const a = acts.find((x) => x.type === 'addAttacker' || x.type === 'removeAttacker');
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
    if (dragTargets) return dragTargets.has(`obj:${id}`) ? 'option' : null;
    if (options) return options.has(`obj:${id}`) ? 'option' : null;
    if (myDecision && d.kind === 'sacrifice') return d.options.includes(id) ? 'option' : null;
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
        return id && zone && zone !== 'hand' && zone !== 'battlefield' ? [id] : [];
      }),
    ),
  ].map((id) => ({ id, label: extraLabel(view.objects[id]!.zone, view.objects[id]!.defId) }));

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
  const buttons =
    bar.primary || bar.secondary ? (
      <>
        <div className="action__buttons">
          {bar.secondary && (
            <button className="btn btn--ghost" onClick={bar.secondary[1]}>
              {bar.secondary[0]}
            </button>
          )}
          {bar.primary && (
            <button
              className={`btn btn--primary btn--big ${idle ? 'btn--nudge' : ''}`}
              onClick={bar.primary[1]}
            >
              {bar.primary[0]}
            </button>
          )}
        </div>
        {bar.primary && (
          <div className="action__keys">
            <kbd>Space</kbd> {bar.primary[0].toLowerCase()} · <kbd>Esc</kbd> cancel
          </div>
        )}
      </>
    ) : null;
  function actionBar(): {
    prompt: string;
    primary?: [string, () => void];
    secondary?: [string, () => void];
  } {
    if (d.kind === 'gameOver') return { prompt: '' };
    if (targeting) {
      const first = targeting.candidates[0];
      const n = first ? targetsOf(first).length : 1;
      const sacrificing =
        targeting.chosen.length === 0 &&
        (first?.type === 'castSpell' || first?.type === 'activateAbility') &&
        !!first.sacrifice;
      const prompt = sacrificing
        ? `${targeting.label}: choose a creature to sacrifice`
        : `${targeting.label}: choose ${n > 1 ? `target ${targeting.chosen.length + 1} of ${n}` : 'a target'}`;
      if (targeting.skip) return { prompt, primary: ['Skip', () => act(targeting.skip!)] };
      if (d.kind === 'chooseTriggerTargets') return { prompt };
      return { prompt, secondary: ['Cancel', () => setTargeting(null)] };
    }
    if (!myDecision) return { prompt: '' };
    const pass: Action = { type: 'passPriority', player: HUMAN };
    const mine = state.turn.activePlayer === HUMAN;
    switch (d.kind) {
      case 'declareAttackers': {
        const n = d.declared.length;
        const adds = legal.filter((a) => a.type === 'addAttacker');
        return {
          prompt: 'Declare attackers: click creatures to attack',
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

  // Space = primary button, Escape = cancel.
  const barRef = useRef(bar);
  barRef.current = bar;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && barRef.current.primary) {
        e.preventDefault();
        barRef.current.primary[1]();
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
  const recent = log.slice(-2);

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
    <div className={`table ${targeting ? 'is-targeting' : ''} ${lethal ? 'is-lethal' : ''}`}>
      <Playmat side="opp" colors={decks.them.colors} />
      <Playmat side="me" colors={decks.you.colors} />
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
            onHover={setHover}
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
            onHover={setHover}
          />
          <Hand view={view} player={HUMAN} h={h} extras={extras} />
        </footer>
      </main>

      <StackView view={view} onHover={setHover} markOf={markOf} onCard={onCard} aside={!!targeting}>
        {respond && (
          <div className="stack__respond">
            <div className="action__prompt">{bar.prompt}</div>
            {buttons}
          </div>
        )}
      </StackView>

      {panel !== 'log' && recent.length > 0 && (
        <div className="recent" onClick={() => setPanel('log')}>
          {recent.map((l) => (
            <div
              key={l.id}
              className={`recent__line ${l.who ? `recent__line--${l.who === HUMAN ? 'me' : 'opp'}` : ''}`}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}

      <div className={`action ${myDecision ? 'action--live' : ''}`}>
        <PhaseTrack view={view} me={HUMAN} />
        {respond ? null : myDecision || targeting ? (
          <>
            <div className="action__prompt">{bar.prompt}</div>
            {buttons}
          </>
        ) : (
          <div className={`action__prompt action__prompt--wait ${game.thinking ? 'is-on' : ''}`}>
            Opponent is thinking…
          </div>
        )}
      </div>

      <div className="corner">
        <button
          className={`icon-btn ${panel === 'log' ? 'is-on' : ''}`}
          title="Game log"
          onClick={() => togglePanel('log')}
        >
          <i className="ico-log" />
        </button>
        <button
          className={`icon-btn ${panel === 'settings' ? 'is-on' : ''}`}
          title="Settings"
          onClick={() => togglePanel('settings')}
        >
          <i className="ico-gear" />
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
                      ? 'Concede this match? It counts as a loss.'
                      : 'Restart this match?'
                    : gauntlet
                      ? 'Pause the run? You can resume this match later.'
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
                Ability {i + 1}
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
        <MulliganOverlay game={game} onHover={setHover} />
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

function extraLabel(zone: string, defId: CardDefId): string {
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

/** "Choose one" mode name, or kicked / not kicked. */
function castLabel(defId: CardDefId, a: Action): string {
  if (a.type !== 'castSpell') return '';
  const def = cardDb.get(defId);
  if (a.mode !== undefined) return def?.modes?.[a.mode]?.label ?? `Mode ${a.mode + 1}`;
  if (def?.sacrificeOrPay)
    return a.sacrifice ? 'Sacrifice a creature' : `Pay ${manaText(def.sacrificeOrPay)}`;
  if (!def?.kicker) return 'Cast';
  return a.kicked ? `Kicked (+${manaText(def.kicker.cost)})` : 'Not kicked';
}

function manaText(c: ManaCost): string {
  const pips = Object.entries(c.colored).flatMap(([t, n]) => Array<string>(n ?? 0).fill(`{${t}}`));
  return `${c.generic ? `{${c.generic}}` : ''}${pips.join('')}`;
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
            ? 'Choose from your graveyard'
            : d.kind === 'searchLibrary' && d.looked
              ? 'Top of your library'
              : 'Search your library'}
        </h2>
        <p>
          {d.kind === 'searchLibrary' && d.to && d.to !== 'hand'
            ? 'Choose a card to put onto the battlefield.'
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
        <div className="mull__buttons">
          <button
            className="btn btn--ghost"
            onClick={() => apply({ type: 'chooseCard', player: HUMAN, card: null })}
          >
            Find nothing
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

function MulliganOverlay({ game, onHover }: { game: GameSession; onHover: HoverFn }) {
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
                mark={bottoming ? 'playable' : null}
                {...(bottoming
                  ? { onClick: () => apply({ type: 'bottomCard', player: HUMAN, card: id }) }
                  : {})}
                onHover={onHover}
              />
            </div>
          ))}
        </div>
        {!bottoming && (
          <div className="mull__buttons">
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
