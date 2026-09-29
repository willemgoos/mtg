import { deckById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { useMemo, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import { cardEntries, type DeckEntry, deckColumns, total } from '../game/deckView.ts';
import {
  BASICS,
  type BoonId,
  BOONS,
  camp,
  chooseBoon,
  currentNode,
  enterNode,
  type ExpeditionRun,
  type ExpeditionState,
  FLOORS,
  keepCount,
  type MapNode,
  maxLives,
  MIN_DECK,
  moveCard,
  type NodeKind,
  openPacks,
  reachable,
  runDeck,
  size,
  statusOf,
  difficultyName,
  difficultyOf,
  MAX_DIFFICULTY,
} from '../game/expedition.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { DeckList } from './DeckView.tsx';
import { PackOpening, packName } from './PackOpening.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';

type Update = (f: (s: ExpeditionState) => ExpeditionState) => void;

/**
 * Everything between expedition matches: opening packs, boon and camp
 * choices, the deck builder, and the map itself.
 */
export function Expedition({
  state,
  update,
  resumable,
  onPlay,
  onAbandon,
  onAgain,
  onMenu,
}: {
  state: ExpeditionState;
  update: Update;
  resumable: boolean;
  onPlay: () => void;
  onAbandon: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const run = state.run!;
  const b = run.build;
  const [building, setBuilding] = useState(false);
  if (b.packs.length)
    return (
      <PackOpening
        run={run}
        onDone={(kept) => {
          update((s) => openPacks(s, kept));
          setBuilding(true);
        }}
      />
    );
  if (run.pending?.kind === 'boon')
    return (
      <BoonChoice
        run={run}
        options={run.pending.options}
        onChoose={(boon) => {
          play('chime');
          update((s) => chooseBoon(s, boon));
        }}
      />
    );
  if (run.pending?.kind === 'camp')
    return <Camp run={run} onChoose={(c) => update((s) => camp(s, c))} />;
  if (!resumable && (building || size(b.main) < MIN_DECK))
    return <DeckBuilder run={run} update={update} onDone={() => setBuilding(false)} />;
  return (
    <ExpeditionMap
      run={run}
      best={state.records[run.deck]?.best ?? 0}
      resumable={resumable}
      onEnter={(lane) => {
        play('place');
        update((s) => enterNode(s, lane));
      }}
      onPlay={onPlay}
      onDeck={() => setBuilding(true)}
      onAbandon={onAbandon}
      onAgain={onAgain}
      onMenu={onMenu}
    />
  );
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

const KIND_NAMES: Record<NodeKind, string> = {
  duel: 'Duel',
  elite: 'Elite',
  camp: 'Camp',
  shrine: 'Shrine',
  boss: 'Final battle',
};

/** Small glyphs for the map's nodes, drawn on a 24-unit grid. */
const ICONS: Record<NodeKind, React.ReactNode> = {
  duel: (
    <path d="M4 3l7 7-2 2-7-7V3zm16 0v2l-7 7-2-2 7-7h2zM3 18l4-4 3 3-4 4-3-3zm18 0l-3 3-4-4 3-3 4 4zM8 13l3 3-1 1-3-3 1-1zm8 0l1 1-3 3-1-1 3-3z" />
  ),
  elite: (
    <path d="M12 2c4.4 0 8 3.2 8 7.5 0 2.4-1.1 4.2-3 5.4V18a1 1 0 0 1-1 1h-1v2h-2v-2h-2v2H9v-2H8a1 1 0 0 1-1-1v-3.1c-1.9-1.2-3-3-3-5.4C4 5.2 7.6 2 12 2zm-3.5 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
  ),
  camp: (
    <path d="M12 2c1 3 4 4.5 4 8.5A4 4 0 0 1 12 15a4 4 0 0 1-4-4.5c0-1.5.7-2.6 1.6-3.4.1 1.4.8 2.4 1.9 2.9C11 7.5 11 5 12 2zM3 19l18-3 .4 2L3.4 21 3 19zm18 0L3 16l-.4 2 18 3 .4-2z" />
  ),
  shrine: (
    <path d="M12 1l2.6 6.9L22 8.3l-5.7 4.8L18.2 21 12 16.8 5.8 21l1.9-7.9L2 8.3l7.4-.4L12 1z" />
  ),
  boss: <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7zm2.5 13.5h13V22h-13v-1.5z" />,
};

const HEART = <path d="M8 14 2 8a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" />;

/** "Easy opponent (3/7) playing Cat Attack". */
function foe(floor: number, node: MapNode, deck: string): string {
  const d = difficultyOf(floor, node);
  return `${difficultyName(d)} opponent (${d}/${MAX_DIFFICULTY}) playing ${deck}`;
}

function nodeInfo(floor: number, node: MapNode): { title: string; lines: string[] } {
  const title = KIND_NAMES[node.kind];
  const opp = node.opponent ? deckById(node.opponent).name : '';
  switch (node.kind) {
    case 'duel':
      return {
        title,
        lines: [`${foe(floor, node, opp)}`, `Win: ${packName(node.reward!)}`],
      };
    case 'elite':
      return {
        title,
        lines: [`${foe(floor, node, opp)}`, 'Win: Rare pack and a boon'],
      };
    case 'camp':
      return { title, lines: ['Rest to win back a life, or open a booster'] };
    case 'shrine':
      return { title, lines: ['Choose one of three boons'] };
    case 'boss':
      return {
        title,
        lines: [`${foe(floor, node, opp)}`, 'Win to clear the expedition'],
      };
  }
}

const laneY = (lanes: number, lane: number) => (lanes === 1 ? 50 : ((lane + 0.5) / lanes) * 100);
const floorX = (floor: number) => ((floor + 0.5) / FLOORS) * 100;

function ExpeditionMap({
  run,
  best,
  resumable,
  onEnter,
  onPlay,
  onDeck,
  onAbandon,
  onAgain,
  onMenu,
}: {
  run: ExpeditionRun;
  best: number;
  resumable: boolean;
  onEnter: (lane: number) => void;
  onPlay: () => void;
  onDeck: () => void;
  onAbandon: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hover, setHover] = useState<{ floor: number; lane: number } | null>(null);
  const status = statusOf(run);
  const here = currentNode(run);
  const open = reachable(run);
  const deck = runDeck(run);
  const lives = maxLives(run);
  const left = lives - run.livesLost;
  const floorNow = Math.min(run.outcomes.length + 1, FLOORS);
  const shown = hover ?? (here && { floor: here.floor, lane: here.lane });
  const info = shown && nodeInfo(shown.floor, run.map[shown.floor]![shown.lane]!);
  const fight = here && !['camp', 'shrine'].includes(here.node.kind);

  const headline =
    status === 'cleared'
      ? 'Expedition cleared!'
      : status === 'out'
        ? 'Out of lives'
        : `Floor ${floorNow} of ${FLOORS}`;
  const sub =
    status === 'playing'
      ? fight
        ? 'Your next fight is ready.'
        : 'Choose where to go next.'
      : `Floors cleared: ${run.outcomes.length} of ${FLOORS} · best with this deck: ${best}`;

  // Edges between every pair of connected nodes; the path taken is drawn in gold.
  const edges: { key: string; x1: number; y1: number; x2: number; y2: number; state: string }[] =
    [];
  for (let f = 0; f < FLOORS - 1; f++) {
    const a = run.map[f]!;
    const b = run.map[f + 1]!;
    a.forEach((_, i) =>
      b.forEach((__, j) => {
        if (b.length > 1 && Math.abs(i - j) > 1) return;
        const taken = run.path[f] === i && run.path[f + 1] === j;
        const next = run.path.length === f + 1 && run.path[f] === i && open.includes(j);
        edges.push({
          key: `${f}-${i}-${j}`,
          x1: floorX(f),
          y1: laneY(a.length, i),
          x2: floorX(f + 1),
          y2: laneY(b.length, j),
          state: taken ? 'taken' : next ? 'next' : '',
        });
      }),
    );
  }

  return (
    <div className={`start xmap xmap--${status}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · {deck.name}</span>
        <h1>{headline}</h1>
        <p>{sub}</p>
      </div>

      <div className="xmap__status">
        <span className="lives" aria-label={`${left} of ${lives} lives left`}>
          {Array.from({ length: lives }, (_, i) => (
            <span key={i} className={`life ${i < left ? 'is-full' : 'is-lost'}`} />
          ))}
        </span>
        {run.boons.length > 0 && (
          <span className="xmap__boons">
            {run.boons.map((b) => (
              <span key={b} className="boon-chip" title={BOONS[b].text}>
                {BOONS[b].name}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="xmap__board">
        <svg className="xmap__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {edges.map((e) => (
            <line
              key={e.key}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              className={e.state && `is-${e.state}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {run.map.map((nodes, f) =>
          nodes.map((node, lane) => {
            const onPath = run.path[f] === lane;
            const outcome = onPath ? run.outcomes[f] : undefined;
            const isHere = here?.floor === f && here.lane === lane;
            const canGo = f === run.path.length && open.includes(lane);
            const state = isHere
              ? 'here'
              : outcome
                ? `done is-${outcome}`
                : canGo
                  ? 'open'
                  : f < run.path.length
                    ? 'past'
                    : 'ahead';
            return (
              <button
                key={`${f}-${lane}`}
                className={`xnode xnode--${node.kind} is-${state}`}
                style={
                  {
                    left: `${floorX(f)}%`,
                    top: `${laneY(nodes.length, lane)}%`,
                  } as React.CSSProperties
                }
                aria-disabled={!canGo}
                aria-label={`${nodeInfo(f, node).title}, floor ${f + 1}`}
                onClick={() => canGo && onEnter(lane)}
                onMouseEnter={() => setHover({ floor: f, lane })}
                onMouseLeave={() => setHover(null)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {ICONS[node.kind]}
                </svg>
                {outcome === 'loss' && <span className="xnode__mark">✕</span>}
              </button>
            );
          }),
        )}
      </div>

      <div className="xmap__bar">
        <div className="xmap__info">
          {info ? (
            <>
              <span className="xmap__info-title">{info.title}</span>
              {info.lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </>
          ) : (
            <span className="xmap__info-hint">Hover a node to see what waits there.</span>
          )}
        </div>
        <div className="gauntlet__actions">
          {status === 'playing' ? (
            confirming ? (
              <>
                <span className="gauntlet__confirm">
                  Abandon this run? Your best record is kept.
                </span>
                <button className="btn btn--primary" onClick={onAbandon}>
                  Abandon
                </button>
                <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                  Keep going
                </button>
              </>
            ) : (
              <>
                {fight && (
                  <button className="btn btn--primary btn--big btn--nudge" onClick={onPlay}>
                    {resumable ? 'Resume match' : 'Fight'}
                  </button>
                )}
                {!resumable && (
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
                New expedition
              </button>
              <button className="btn btn--ghost" onClick={onMenu}>
                Main menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shrines and camps
// ---------------------------------------------------------------------------

function BoonChoice({
  run,
  options,
  onChoose,
}: {
  run: ExpeditionRun;
  options: BoonId[];
  onChoose: (b: BoonId) => void;
}) {
  const atShrine = currentNode(run)?.node.kind === 'shrine';
  return (
    <div className="start choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">
          Expedition · {atShrine ? 'Shrine' : 'Elite defeated'}
        </span>
        <h1>Choose a boon</h1>
        <p>It lasts for the rest of the run.</p>
      </div>
      <div className="choice__options">
        {options.map((b, i) => (
          <button
            key={b}
            className="choice__option"
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => onChoose(b)}
          >
            <span className="choice__glyph">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                {ICONS.shrine}
              </svg>
            </span>
            <span className="choice__name">{BOONS[b].name}</span>
            <span className="choice__text">{BOONS[b].text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Camp({ run, onChoose }: { run: ExpeditionRun; onChoose: (c: 'rest' | 'forage') => void }) {
  const hurt = run.livesLost > 0;
  return (
    <div className="start choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Camp</span>
        <h1>Make camp</h1>
        <p>Catch your breath before the next floor.</p>
      </div>
      <div className="choice__options">
        <button
          className="choice__option"
          style={{ '--i': 0 } as React.CSSProperties}
          disabled={!hurt}
          onClick={() => onChoose('rest')}
        >
          <span className="choice__glyph choice__glyph--heart">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              {HEART}
            </svg>
          </span>
          <span className="choice__name">Rest</span>
          <span className="choice__text">
            {hurt ? 'Win back a life.' : "You're at full lives already."}
          </span>
        </button>
        <button
          className="choice__option"
          style={{ '--i': 1 } as React.CSSProperties}
          onClick={() => onChoose('forage')}
        >
          <span className="choice__glyph">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {ICONS.camp}
            </svg>
          </span>
          <span className="choice__name">Forage</span>
          <span className="choice__text">
            Open a Foundations booster and keep {keepCount(run)}.
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

/**
 * Arena's deck builder, Limited style: your collection in columns by mana
 * value on the left (click to add), the deck list on the right (click to take
 * out), and basic lands free for the taking.
 */
function DeckBuilder({
  run,
  update,
  onDone,
}: {
  run: ExpeditionRun;
  update: Update;
  onDone: () => void;
}) {
  const b = run.build;
  const main = useMemo(() => cardEntries(Object.entries(b.main)), [b.main]);
  const side = useMemo(() => cardEntries(Object.entries(b.side)), [b.side]);
  const fresh = useMemo(() => new Set(b.fresh), [b.fresh]);
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const setHover = (e: DeckEntry | null, anchor?: Element) =>
    setHoverState(e ? { defId: e.defId ?? slug(e.name), anchor: anchor ?? null } : null);
  const move = (name: string, to: 'main' | 'side') => {
    update((s) => moveCard(s, name, to));
    play('place', { gain: 0.6 });
  };
  const deck = runDeck(run);
  const n = size(b.main);

  return (
    <div
      className="deckview builder"
      style={{ '--glow': `var(--mana-${deck.colors[0]})` } as React.CSSProperties}
    >
      <header className="deckview__head">
        <div
          className="deckview__banner"
          style={{ '--art': `url("${artFor(deck)}")` } as React.CSSProperties}
        >
          <span className="deck__pips">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <h1>Your deck</h1>
          <p>
            Click a card in your collection to add it, or a card in your deck to take it out. At
            least {MIN_DECK} cards.
          </p>
        </div>
        <button
          className="btn btn--primary deckview__play"
          disabled={n < MIN_DECK}
          onClick={onDone}
        >
          {n < MIN_DECK ? `${MIN_DECK - n} more to go` : 'Done'}
        </button>
      </header>
      <div className="deckview__body">
        <main className="builder__pool">
          <div className="builder__lands" aria-label="Basic lands">
            <span className="builder__label">Basic lands</span>
            {(Object.entries(BASICS) as [Color, string][]).map(([c, name]) => (
              <span key={c} className="builder__land">
                <button
                  className="btn btn--ghost builder__step"
                  aria-label={`Remove a ${name}`}
                  disabled={!b.main[name]}
                  onClick={() => move(name, 'side')}
                >
                  −
                </button>
                <span className={`pip pip--${c}`} title={name} />
                <span className="builder__count">{b.main[name] ?? 0}</span>
                <button
                  className="btn btn--ghost builder__step"
                  aria-label={`Add a ${name}`}
                  onClick={() => move(name, 'main')}
                >
                  +
                </button>
              </span>
            ))}
          </div>
          <div className="deckview__cols">
            {side.length === 0 && (
              <p className="builder__empty">Every card you own is in your deck.</p>
            )}
            {deckColumns(side).map((col) => (
              <section key={col.label} className="dcol">
                <div className="dcol__label">
                  {col.label}
                  <span>{total(col.cards)}</span>
                </div>
                <div className="dcol__stack">
                  {col.cards.map((e) => (
                    <div
                      key={e.name}
                      className="dcard is-pickable"
                      role="button"
                      tabIndex={0}
                      title="Add to the deck"
                      onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        move(e.name, 'main');
                        if (e.count === 1) setHover(null);
                      }}
                      onKeyDown={(ev) => ev.key === 'Enter' && move(e.name, 'main')}
                    >
                      {e.image ? (
                        <img src={e.image} alt={e.name} draggable={false} />
                      ) : (
                        <div className="dcard__blank">{e.name}</div>
                      )}
                      {fresh.has(e.name) && <span className="dcard__new">New</span>}
                      {e.count > 1 && <span className="dcard__qty">×{e.count}</span>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
        <DeckList
          entries={main}
          onHover={setHover}
          onPick={(e) => {
            move(e.name, 'side');
            setHover(null);
          }}
        />
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}
