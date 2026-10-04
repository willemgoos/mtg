import { deckById } from '@mtg/cards';
import { useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import {
  type GauntletState,
  LIVES,
  losses,
  ROUNDS,
  roundOf,
  statusOf,
  wins,
} from '../game/gauntlet.ts';
import { HumanMade } from './HumanMade.tsx';
import { UiSize } from './UiSize.tsx';
import './home.css';
import './expedition.css';

const deckOf = (id: string) => deckById(id);

/** The ladder between gauntlet matches: who's beaten, who's next, lives left. */
export function Gauntlet({
  name = 'Gauntlet',
  state,
  resumable,
  onPlay,
  onDeck,
  onAbandon,
  onAgain,
  onMenu,
}: {
  /** The mode, for titles ('Gauntlet', 'Expedition'). */
  name?: string;
  state: GauntletState;
  /** Opens the deck builder (expeditions). */
  onDeck?: () => void;
  /** A match for this round was left part-way and can be picked up. */
  resumable: boolean;
  onPlay: () => void;
  onAbandon: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const run = state.run!;
  const deck = deckOf(run.deck);
  const status = statusOf(run);
  const won = wins(run);
  const lost = losses(run);
  const round = roundOf(run);
  const next = deckOf(run.opponents[round]!);
  const record = state.records[run.deck];

  const headline =
    status === 'cleared'
      ? `${name} cleared!`
      : status === 'out'
        ? `Out after ${won} win${won === 1 ? '' : 's'}`
        : `Round ${round + 1} of ${ROUNDS.length}`;
  const sub =
    status === 'playing'
      ? `${ROUNDS[round]!.tier} opponent playing ${next.name}`
      : record
        ? `Best with this deck: ${record.best} of ${ROUNDS.length}${record.clears ? ` · cleared ${record.clears}×` : ''}`
        : '';

  return (
    <div className={`start shell gauntlet gauntlet--${status}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">
          {name} · {deck.name}
        </span>
        <h1>{headline}</h1>
        <p>{sub}</p>
      </div>

      <div className="lives" aria-label={`${LIVES - lost} of ${LIVES} lives left`}>
        {Array.from({ length: LIVES }, (_, i) => (
          <span key={i} className={`life ${i < LIVES - lost ? 'is-full' : 'is-lost'}`} />
        ))}
      </div>

      <ol className="ladder">
        {ROUNDS.map((r, i) => {
          const opp = deckOf(run.opponents[i]!);
          const state =
            i < won
              ? 'won'
              : i === round && status !== 'cleared'
                ? status === 'out'
                  ? 'fell'
                  : 'next'
                : 'ahead';
          return (
            <li
              key={i}
              className={`rung rung--${state} ${i === ROUNDS.length - 1 ? 'rung--boss' : ''}`}
              style={
                {
                  '--art': `url("${artFor(opp)}")`,
                  '--glow': `var(--mana-${opp.colors[0]})`,
                  '--i': i,
                } as React.CSSProperties
              }
            >
              <span className="rung__art" />
              <span className="rung__num">{i === ROUNDS.length - 1 ? 'Final' : i + 1}</span>
              <span className="rung__tier">{r.tier}</span>
              <span className="rung__name">{opp.name}</span>
              <span className="deck__pips">
                {opp.colors.map((c) => (
                  <span key={c} className={`pip pip--${c}`} />
                ))}
                <HumanMade of={opp} inline />
              </span>
              {state === 'won' && <span className="rung__mark rung__mark--won" />}
              {state === 'fell' && <span className="rung__mark rung__mark--fell" />}
            </li>
          );
        })}
      </ol>

      <div className="gauntlet__actions">
        {status === 'playing' ? (
          confirming ? (
            <>
              <span className="gauntlet__confirm">Abandon this run? Your best record is kept.</span>
              <button className="btn btn--primary" onClick={onAbandon}>
                Abandon
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                Keep going
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--primary btn--big" onClick={onPlay}>
                {resumable ? 'Resume match' : `Play round ${round + 1}`}
              </button>
              {onDeck && !resumable && (
                <button className="btn btn--ghost" onClick={onDeck}>
                  Edit deck
                </button>
              )}
              <button className="btn btn--ghost" onClick={() => setConfirming(true)}>
                Abandon run
              </button>
              <button className="btn btn--ghost" onClick={onMenu}>
                Main menu
              </button>
            </>
          )
        ) : (
          <>
            <button className="btn btn--primary btn--big" onClick={onAgain}>
              Run it again
            </button>
            <button className="btn btn--ghost" onClick={onAbandon}>
              Choose another deck
            </button>
          </>
        )}
      </div>
    </div>
  );
}
