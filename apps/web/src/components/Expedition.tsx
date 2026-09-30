import { deckById, scryfallById, slug } from '@mtg/cards';
import { useMemo, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import {
  BASICS,
  type BoonId,
  BOONS,
  applySuggestion,
  camp,
  canChoose,
  chooseRare,
  deckAdvice,
  type EventId,
  EVENTS,
  leaveMerchant,
  owned,
  resolveEvent,
  trade,
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
import { DeckBuilder } from './DeckBuilder.tsx';
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
  if (run.pending?.kind === 'event')
    return (
      <MysteryEvent
        run={run}
        event={run.pending.event}
        onChoose={(i) => {
          play('chime');
          update((s) => resolveEvent(s, i));
        }}
      />
    );
  if (run.pending?.kind === 'rareDraft')
    return (
      <CardChoice
        eyebrow="Expedition · Elite defeated"
        title="Claim a rare"
        text="Take one for your collection. A boon comes next."
        cards={run.pending.options}
        onChoose={(name) => {
          play('win', { gain: 0.6 });
          update((s) => chooseRare(s, name));
        }}
      />
    );
  if (run.pending?.kind === 'merchant')
    return (
      <Merchant
        run={run}
        offers={run.pending.offers}
        onTrade={(buy, give) => {
          play('chime');
          update((s) => trade(s, buy, give));
        }}
        onLeave={() => update(leaveMerchant)}
      />
    );
  if (!resumable && (building || size(b.main) < MIN_DECK))
    return <ExpeditionBuilder run={run} update={update} onDone={() => setBuilding(false)} />;
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
  treasure: 'Treasure',
  merchant: 'Merchant',
  mystery: 'Mystery',
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
  treasure: (
    <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9zm0-1V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3zm7 3v4h4v-4h-4z" />
  ),
  merchant: (
    <path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1.5 14h-13L4 7h3zm2 0h6V6a3 3 0 0 0-6 0v1zm1 5a2 2 0 1 0 4 0h-1.5a.5.5 0 0 1-1 0H10z" />
  ),
  mystery: (
    <path d="M12 2a6 6 0 0 1 6 6c0 2.6-1.7 3.8-3 4.7-.9.6-1.5 1.1-1.5 2.3v.5h-3V15c0-2.4 1.5-3.5 2.6-4.3 1-.7 1.9-1.3 1.9-2.7a3 3 0 0 0-6 0H6a6 6 0 0 1 6-6zm-1.5 16h3v3h-3v-3z" />
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
        lines: [`${foe(floor, node, opp)}`, 'Win: choose a rare, then a boon'],
      };
    case 'camp':
      return { title, lines: ['Rest to win back a life, or open a booster'] };
    case 'shrine':
      return { title, lines: ['Choose one of three boons'] };
    case 'treasure':
      return { title, lines: ['A free Foundations booster, no fight'] };
    case 'merchant':
      return { title, lines: ['Trade two of your cards for one of three rares'] };
    case 'mystery':
      return { title, lines: ['Something unexpected waits here'] };
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
  const fight = !!here?.node.opponent;
  // The travelling token: at your last node (or the start), or on its way to a new one.
  const [moving, setMoving] = useState<number | null>(null);
  const tokenAt =
    moving !== null
      ? { x: floorX(run.path.length), y: laneY(run.map[run.path.length]!.length, moving) }
      : run.path.length
        ? {
            x: floorX(run.path.length - 1),
            y: laneY(run.map[run.path.length - 1]!.length, run.path.at(-1)!),
          }
        : { x: floorX(0) - 45 / FLOORS, y: 50 };
  const travel = (lane: number) => {
    if (moving !== null) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMoving(lane);
    play('slide');
    window.setTimeout(
      () => {
        onEnter(lane);
        setMoving(null);
      },
      still ? 0 : 650,
    );
  };

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
        <span className="xmap__deck" title="Your deck">
          <span className="deck__pips">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          {size(run.build.main)} cards
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
                onClick={() => canGo && travel(lane)}
                onMouseEnter={() => setHover({ floor: f, lane })}
                onMouseLeave={() => setHover(null)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {ICONS[node.kind]}
                </svg>
                {outcome === 'loss' && <span className="xnode__mark">✕</span>}
                {!onPath && node.reward && (
                  <span
                    className={`xnode__reward ${node.reward.kind === 'color' ? `pip--${node.reward.color}` : 'is-booster'}`}
                    title={packName(node.reward)}
                  />
                )}
                {!onPath && node.kind === 'elite' && (
                  <span className="xnode__reward is-rare" title="A rare of your choice" />
                )}
              </button>
            );
          }),
        )}
        <span
          className="xmap__token"
          aria-hidden
          style={
            {
              left: `${tokenAt.x}%`,
              top: `${tokenAt.y}%`,
              backgroundImage: `url("${artFor(deck)}")`,
            } as React.CSSProperties
          }
        />
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

function MysteryEvent({
  run,
  event,
  onChoose,
}: {
  run: ExpeditionRun;
  event: EventId;
  onChoose: (i: number) => void;
}) {
  const e = EVENTS[event];
  return (
    <div className="start choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Mystery</span>
        <h1>{e.title}</h1>
        <p className="choice__story">{e.text}</p>
      </div>
      <div className="choice__options">
        {e.choices.map((c, i) => {
          const ok = canChoose(run, c);
          return (
            <button
              key={c.label}
              className="choice__option"
              style={{ '--i': i } as React.CSSProperties}
              disabled={!ok}
              onClick={() => onChoose(i)}
            >
              <span className="choice__glyph">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  {ICONS.mystery}
                </svg>
              </span>
              <span className="choice__name">{c.label}</span>
              <span className="choice__text">{ok ? c.text : "You can't spare a life."}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const imageOf = (name: string) => scryfallById.get(slug(name))?.image?.normal ?? '';

/** Pick one of a few cards, shown large. */
function CardChoice({
  eyebrow,
  title,
  text,
  cards,
  onChoose,
}: {
  eyebrow: string;
  title: string;
  text: string;
  cards: string[];
  onChoose: (name: string) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  return (
    <div className="start choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="choice__options">
        {cards.map((name, i) => (
          <button
            key={name}
            className="card-choice"
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => onChoose(name)}
            onMouseEnter={(e) => setHover({ defId: slug(name), anchor: e.currentTarget })}
            onMouseLeave={() => setHover(null)}
          >
            <img src={imageOf(name)} alt={name} draggable={false} />
          </button>
        ))}
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** The merchant: pick a rare, then two of your cards to pay with. */
function Merchant({
  run,
  offers,
  onTrade,
  onLeave,
}: {
  run: ExpeditionRun;
  offers: string[];
  onTrade: (buy: string, give: [string, string]) => void;
  onLeave: () => void;
}) {
  const [buy, setBuy] = useState<string | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const b = run.build;
  const yours = useMemo(
    () =>
      [...new Set([...Object.keys(b.side), ...Object.keys(b.main)])]
        .filter((n) => !Object.values(BASICS).includes(n))
        .sort((x, y) => x.localeCompare(y)),
    [b],
  );
  const toggle = (name: string) => {
    const i = give.indexOf(name);
    const taken = give.filter((g) => g === name).length;
    if (give.length < 2 && taken < owned(b, name)) setGive([...give, name]);
    else if (i >= 0) setGive(give.filter((_, j) => j !== i));
  };
  const hoverProps = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHover({ defId: slug(name), anchor: e.currentTarget }),
    onMouseLeave: () => setHover(null),
  });

  return (
    <div className="start choice merchant">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Merchant</span>
        <h1>{buy ? 'Pay with two cards' : 'A travelling merchant'}</h1>
        <p>
          {buy
            ? 'Choose two cards from your deck or collection to trade away.'
            : '"Rare wares, friend. Any one of these for two of yours."'}
        </p>
      </div>
      <div className="choice__options">
        {offers.map((name, i) => (
          <button
            key={name}
            className={`card-choice ${buy === name ? 'is-on' : buy ? 'is-off' : ''}`}
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => {
              setBuy(buy === name ? null : name);
              play('place', { gain: 0.6 });
            }}
            {...hoverProps(name)}
          >
            <img src={imageOf(name)} alt={name} draggable={false} />
          </button>
        ))}
      </div>
      {buy && (
        <div className="merchant__pay">
          {yours.map((name) => {
            const n = give.filter((g) => g === name).length;
            return (
              <button
                key={name}
                className={`merchant__card ${n ? 'is-on' : ''}`}
                onClick={() => toggle(name)}
                {...hoverProps(name)}
              >
                <img src={imageOf(name)} alt={name} draggable={false} />
                {owned(b, name) > 1 && <span className="dcard__qty">×{owned(b, name)}</span>}
                {n > 0 && <span className="merchant__give">Give{n > 1 ? ` ×${n}` : ''}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="gauntlet__actions">
        {buy && (
          <button
            className="btn btn--primary btn--big"
            disabled={give.length < 2}
            onClick={() => onTrade(buy, give as [string, string])}
          >
            {give.length < 2 ? `Choose ${2 - give.length} more` : 'Trade'}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onLeave}>
          Leave without trading
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

/** The expedition's deck builder: your collection is the pool, basic lands are free. */
function ExpeditionBuilder({
  run,
  update,
  onDone,
}: {
  run: ExpeditionRun;
  update: Update;
  onDone: () => void;
}) {
  const b = run.build;
  const fresh = useMemo(() => new Set(b.fresh), [b.fresh]);
  const tips = useMemo(() => deckAdvice(b), [b]);
  const deck = runDeck(run);
  const [confirming, setConfirming] = useState(false);
  const suggest = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    update(applySuggestion);
    play('shuffle');
  };
  return (
    <DeckBuilder
      name="Your deck"
      colors={deck.colors}
      art={artFor(deck)}
      deck={b.main}
      pool={b.side}
      basics
      fresh={fresh}
      min={MIN_DECK}
      tips={tips}
      tools={
        <button
          className="btn btn--ghost"
          onClick={suggest}
          onMouseLeave={() => setConfirming(false)}
          title="Builds a 40-card deck from your two strongest colours"
        >
          {confirming ? 'Replace my deck?' : 'Suggest a deck'}
        </button>
      }
      onAdd={(name) => update((s) => moveCard(s, name, 'main'))}
      onRemove={(name) => update((s) => moveCard(s, name, 'side'))}
      onDone={onDone}
    />
  );
}
