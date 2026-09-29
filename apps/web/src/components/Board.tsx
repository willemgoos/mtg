import { cardDb } from '@mtg/cards';
import type { Action, CardDefId, ObjectId, PlayerId } from '@mtg/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { Card, type CardMark, cardImage } from './Card.tsx';
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

const nameOf = (defId: CardDefId) => cardDb.get(defId)?.name ?? 'Card';

export function Board({ game, onRestart }: { game: GameSession; onRestart: () => void }) {
  const { state, view, legal, apply, log, batch, settings, setSettings } = game;
  const d = state.decision;
  const myDecision = d.kind !== 'gameOver' && d.player === HUMAN;

  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [blocker, setBlocker] = useState<ObjectId | null>(null);
  const [hover, setHover] = useState<CardDefId | null>(null);
  const [menu, setMenu] = useState<{ source: ObjectId; indices: number[] } | null>(null);

  // Any new decision resets half-finished UI interactions.
  const decisionKey = `${state.turn.number}:${state.turn.step}:${d.kind}:${state.stack.length}`;
  useEffect(() => {
    setTargeting(null);
    setBlocker(null);
    setMenu(null);
  }, [decisionKey]);

  // Triggered abilities that need targets open targeting straight away.
  useEffect(() => {
    if (d.kind === 'chooseTriggerTargets' && d.player === HUMAN && !targeting) {
      setTargeting(startTargeting(d.trigger.source.id, nameOf(d.trigger.sourceDefId), legal));
    }
  }, [d, legal, targeting]);

  const act = useCallback(
    (a: Action) => {
      setTargeting(null);
      setBlocker(null);
      setMenu(null);
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

  const choose = (key: string) => {
    if (!targeting) return;
    const r = pickTarget(targeting, key);
    if (!r) return;
    if (isTargeting(r)) setTargeting(r);
    else act(r);
  };

  // ------------------------------------------------------------------ clicks

  const onCard = (id: ObjectId) => {
    if (targeting) return choose(`obj:${id}`);
    if (!myDecision) return;
    const o = view.objects[id]!;
    if (o.zone === 'hand') {
      const acts = handActions(legal, id);
      const casts = acts.filter((a) => a.type === 'castSpell');
      if (casts.length) return beginOrApply(id, nameOf(o.defId), casts);
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
    if (options) return options.has(`obj:${id}`) ? 'option' : null;
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
    if (o.zone === 'hand') return handActions(legal, id).length ? 'playable' : null;
    const acts = permanentActions(legal, id);
    if (acts.some((a) => a.type === 'addAttacker' || a.type === 'addBlock')) return 'candidate';
    if (acts.some((a) => a.type === 'activateAbility')) return 'activatable';
    return null;
  };

  const h: ZoneHandlers = { markOf, onCard, onHover: setHover };

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
  function actionBar(): {
    prompt: string;
    primary?: [string, () => void];
    secondary?: [string, () => void];
  } {
    if (d.kind === 'gameOver') return { prompt: '' };
    if (targeting) {
      const n = targeting.candidates[0] ? targetsOf(targeting.candidates[0]).length : 1;
      const prompt = `${targeting.label}: choose ${n > 1 ? `target ${targeting.chosen.length + 1} of ${n}` : 'a target'}`;
      if (targeting.skip) return { prompt, primary: ['Skip', () => act(targeting.skip!)] };
      if (d.kind === 'chooseTriggerTargets') return { prompt };
      return { prompt, secondary: ['Cancel', () => setTargeting(null)] };
    }
    if (!myDecision)
      return {
        prompt:
          d.player === BOT ? (game.thinking ? 'Opponent is thinking…' : 'Opponent is acting…') : '',
      };
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
        return { prompt: `Discard ${d.count} card${d.count > 1 ? 's' : ''}` };
      case 'priority': {
        if (state.stack.length)
          return { prompt: 'Respond, or let it resolve', primary: ['Resolve', () => act(pass)] };
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d.kind]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const priorityOf = d.kind === 'priority' ? d.player : null;

  return (
    <div className={`table ${targeting ? 'is-targeting' : ''}`}>
      <main className="board">
        <header className="side side--opp">
          <PlayerBadge
            view={view}
            player={BOT}
            name="Opponent"
            targetable={!!options?.has(`player:${BOT}`)}
            active={state.turn.activePlayer === BOT}
            priority={priorityOf === BOT}
            onClick={() => onPlayer(BOT)}
            onHover={setHover}
          />
          <OpponentHand count={view.players[BOT].hand.length} />
        </header>

        <Battlefield view={view} player={BOT} mirrored h={h} />

        <div className="midline">
          <PhaseTrack view={view} me={HUMAN} />
          <StackView view={view} onHover={setHover} />
        </div>

        <Battlefield view={view} player={HUMAN} mirrored={false} h={h} />

        <footer className="side side--me">
          <PlayerBadge
            view={view}
            player={HUMAN}
            name="You"
            targetable={!!options?.has(`player:${HUMAN}`)}
            active={state.turn.activePlayer === HUMAN}
            priority={priorityOf === HUMAN}
            onClick={() => onPlayer(HUMAN)}
            onHover={setHover}
          />
          <Hand view={view} player={HUMAN} h={h} />
        </footer>
      </main>

      <aside className="rail">
        <div className="preview">
          {hover ? (
            cardImage(hover) ? (
              <img src={cardImage(hover)!} alt={nameOf(hover)} />
            ) : (
              <Card defId={hover} size="preview" />
            )
          ) : (
            <div className="preview__empty">Hover a card</div>
          )}
        </div>

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

        <div className={`command ${myDecision ? 'command--live' : ''}`}>
          <div className="command__prompt">{bar.prompt}</div>
          <div className="command__buttons">
            {bar.secondary && (
              <button className="btn btn--ghost" onClick={bar.secondary[1]}>
                {bar.secondary[0]}
              </button>
            )}
            {bar.primary && (
              <button className="btn btn--primary" onClick={bar.primary[1]}>
                {bar.primary[0]}
              </button>
            )}
          </div>
          <div className="command__keys">
            <kbd>Space</kbd> confirm · <kbd>Esc</kbd> cancel
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.fullControl}
              onChange={(e) => setSettings((s) => ({ ...s, fullControl: e.target.checked }))}
            />
            Full control (stop at every priority)
          </label>
        </div>
      </aside>

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

      {(d.kind === 'mulligan' || d.kind === 'bottomCards') && d.player === HUMAN && (
        <MulliganOverlay game={game} onHover={setHover} />
      )}

      {state.winner && (
        <div className="overlay overlay--end">
          <div className={`end end--${state.winner === HUMAN ? 'win' : 'loss'}`}>
            <h1>{winnerText(state, HUMAN)}</h1>
            <p>Turn {state.turn.number}</p>
            <button className="btn btn--primary" onClick={onRestart}>
              Play again
            </button>
          </div>
        </div>
      )}

      <Arrows specs={arrows} deps={[state, targeting]} />
      <Floaters batch={batch} />
      <TurnBanner batch={batch} me={HUMAN} />
    </div>
  );
}

function MulliganOverlay({
  game,
  onHover,
}: {
  game: GameSession;
  onHover: (d: CardDefId | null) => void;
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
