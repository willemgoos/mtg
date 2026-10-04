import { deckById, scryfallById, slug } from '@mtg/cards';
import { useEffect, useMemo, useRef, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import {
  BASICS,
  type BoonId,
  BOONS,
  applySuggestion,
  camp,
  canChoose,
  chooseLand,
  chooseRare,
  landUpgrade,
  choosePact,
  deckAdvice,
  dismissGift,
  difficultyIn,
  fightOf,
  merchantPrice,
  type PactId,
  PACTS,
  pickable,
  pickCard,
  TWISTS,
  twistOf,
  type EventId,
  EVENTS,
  leaveMerchant,
  owned,
  resolveEvent,
  trade,
  chooseBoon,
  currentNode,
  enterNode,
  type Build,
  type ExpeditionRun,
  type ExpeditionState,
  floorsOf,
  keepCount,
  links,
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
  MAX_DIFFICULTY,
  MAX_LANES,
  PACK_SET_NAMES,
  packSetOf,
} from '../game/expedition.ts';
import { burst, flash, fxOn, later, mountFx, ring } from '../game/fx.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { DeckBuilder } from './DeckBuilder.tsx';
import './home.css';
import './expedition.css';
import { PackOpening, packName } from './PackOpening.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';

type Update = (f: (s: ExpeditionState) => ExpeditionState) => void;

type Props = Parameters<typeof Screens>[0];

/**
 * Everything between expedition matches: opening packs, boon and camp
 * choices, the deck builder, and the map itself. Choices are drawn over by
 * an effects layer (pack opening brings its own).
 */
export function Expedition(props: Props) {
  return (
    <>
      <Screens {...props} />
      {!props.state.run!.build.packs.length && <FxLayer />}
    </>
  );
}

function Screens({
  state,
  update,
  resumable,
  onPlay,
  onAbandon,
  onAgain,
  onContinue,
  onMenu,
}: {
  state: ExpeditionState;
  update: Update;
  resumable: boolean;
  onPlay: () => void;
  onAbandon: () => void;
  onAgain: () => void;
  /** After a clear: a new map with the deck and collection you've built. */
  onContinue: () => void;
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
        pact={run.pending.pact}
        picks={run.pending.picks ?? 1}
        onChoose={(boon) => {
          update((s) => chooseBoon(s, boon));
        }}
        onPact={(pact) => {
          update((s) => choosePact(s, pact));
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
          update((s) => resolveEvent(s, i));
        }}
      />
    );
  if (run.pending?.kind === 'rareDraft')
    return (
      <CardChoice
        eyebrow={run.pending.mythic ? 'Expedition · Mythic Pact' : 'Expedition · Elite defeated'}
        title={run.pending.mythic ? 'Claim a mythic' : 'Claim a rare'}
        text={
          run.pending.mythic
            ? 'Take one for your collection.'
            : 'Take one for your collection. A boon comes next.'
        }
        cards={run.pending.options}
        fx={run.pending.mythic ? 'mythic' : 'rare'}
        onChoose={(name) => {
          update((s) => chooseRare(s, name));
        }}
      />
    );
  if (run.pending?.kind === 'cardPick')
    return (
      <CardPick
        run={run}
        mode={run.pending.mode}
        onPick={(name) => {
          update((s) => pickCard(s, name));
        }}
      />
    );
  if (run.pending?.kind === 'lands')
    return (
      <LandChoice
        run={run}
        offers={run.pending.offers}
        onChoose={(land) => {
          update((s) => chooseLand(s, land));
        }}
      />
    );
  if (run.pending?.kind === 'gift')
    return (
      <Gift card={run.pending.card} note={run.pending.note} onDone={() => update(dismissGift)} />
    );
  if (run.pending?.kind === 'merchant')
    return (
      <Merchant
        run={run}
        offers={run.pending.offers}
        onTrade={(buy, give) => {
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
      onContinue={onContinue}
      onMenu={onMenu}
    />
  );
}

// ---------------------------------------------------------------------------
// Choice effects: a burst and a sound on what you picked, a beat before it takes effect
// ---------------------------------------------------------------------------

/** Particle colours by rarity, for gifts. */
const RARITY_FX: Record<string, string> = {
  common: '#c9cad1',
  uncommon: '#9fd0ee',
  rare: '#f4b13e',
  mythic: '#ff7a3d',
};

type ChoiceFx =
  'choice' | 'boon' | 'rest' | 'pact' | 'rare' | 'mythic' | 'land' | 'well' | 'mirror';

const CHOICE_FX: Record<ChoiceFx, { color: string; big?: boolean; sound: () => void }> = {
  choice: { color: '#ececee', sound: () => play('chime') },
  boon: { color: '#f4b13e', sound: () => play('chime') },
  rest: { color: '#f06b6b', sound: () => play('gain') },
  pact: {
    color: '#f2555a',
    big: true,
    sound: () => {
      play('win', { gain: 0.6 });
      play('hit', { gain: 0.35 });
    },
  },
  rare: { color: '#f4b13e', big: true, sound: () => play('win', { gain: 0.6 }) },
  mythic: {
    color: '#ff7a3d',
    big: true,
    sound: () => {
      play('win', { gain: 0.7 });
      play('gain', { gain: 0.5, delay: 0.12 });
    },
  },
  land: {
    color: '#5fd3c6',
    sound: () => {
      play('place');
      play('gain', { gain: 0.45, delay: 0.1 });
    },
  },
  well: { color: '#7cc4ff', sound: () => play('pluck') },
  mirror: { color: '#ffffff', sound: () => play('flip') },
};

/**
 * Celebrates a choice: the picked option pops while the others fade, with a
 * burst and a sound, and the choice takes effect a beat later. A second
 * click while that plays does nothing.
 */
function choose(el: HTMLElement, kind: ChoiceFx, then: () => void): void {
  const row = el.parentElement;
  if (row?.classList.contains('is-choosing')) return;
  row?.classList.add('is-choosing');
  el.classList.add('is-chosen');
  const fx = CHOICE_FX[kind];
  fx.sound();
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  burst(x, y, fx.color, {
    n: fx.big ? 64 : 32,
    speed: [1.5, fx.big ? 9 : 6],
    life: [24, 52],
    size: [2, 6],
    drag: 0.95,
    box: { w: r.width, h: r.height, mode: 'edge' },
  });
  ring(x, y, fx.color, { r0: 24, r1: fx.big ? 280 : 170, life: 26, width: fx.big ? 4 : 2.5 });
  if (fx.big) flash(fx.color, 0.18, 480);
  later(fxOn() ? 420 : 0, () => {
    row?.classList.remove('is-choosing');
    el.classList.remove('is-chosen');
    then();
  });
}

/** The canvas the choice effects draw on. */
function FxLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountFx(canvas.current!), []);
  return <canvas ref={canvas} className="fx-layer" aria-hidden />;
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
  surveyor: 'Surveyor',
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
  // A compass.
  surveyor: (
    <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm4.2 3.8-2.7 6.2-6.2 2.7 2.7-6.2 6.2-2.7zM12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z" />
  ),
  boss: <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7zm2.5 13.5h13V22h-13v-1.5z" />,
};

const HEART = <path d="M8 14 2 8a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" />;

/** "Easy opponent (3/7) playing Cat Attack". */
function foe(d: number, deck: string): string {
  return `${difficultyName(d)} opponent (${d}/${MAX_DIFFICULTY}) playing ${deck}`;
}

/** What the map's info panel says about a node: what waits there and what it pays. */
function nodeInfo(
  run: ExpeditionRun,
  floor: number,
  lane: number,
): { title: string; lines: string[] } {
  const node = run.map[floor]![lane]!;
  const boosters = PACK_SET_NAMES[packSetOf(run, run.build.opened)];
  const here = currentNode(run);
  // A fight a mystery event started here.
  if (run.fight && here?.floor === floor && here.lane === lane) {
    const f = fightOf(run);
    const opp = f ? foe(f.difficulty, deckById(f.opponent).name) : '';
    return run.fight.kind === 'ambush'
      ? { title: 'Ambush', lines: [opp, 'Win: a rare pack. Lose: nothing'] }
      : { title: 'Wandering duelist', lines: [opp, 'Win: choose a boon. Lose: a life'] };
  }
  const title = KIND_NAMES[node.kind];
  const opp = node.opponent
    ? foe(difficultyIn(run, floor, node), deckById(node.opponent).name)
    : '';
  switch (node.kind) {
    case 'duel':
      return { title, lines: [opp, `Win: ${packName(node.reward!)}`] };
    case 'elite': {
      const twist = twistOf(run, floor, lane);
      return twist
        ? {
            title: `${title} · ${TWISTS[twist].name}`,
            lines: [`${opp}. ${TWISTS[twist].text}`, 'Win: choose a rare, a boon, and a booster'],
          }
        : { title, lines: [opp, 'Win: choose a rare, then a boon'] };
    }
    case 'camp':
      return { title, lines: ['Rest to win back a life, or open a booster'] };
    case 'shrine':
      return { title, lines: ['Choose one of three boons, or make a pact'] };
    case 'treasure':
      return { title, lines: [`A free ${boosters} booster, no fight`] };
    case 'merchant': {
      const price = merchantPrice(run) === 1 ? 'one of your cards' : 'two of your cards';
      return { title, lines: [`Trade ${price} for one of three rares`] };
    }
    case 'mystery':
      // Keen Eye shows what the event is and what it offers.
      if (run.boons.includes('keenEye') && node.event) {
        const e = EVENTS[node.event];
        return { title: e.title, lines: e.choices.map((c) => `${c.label}: ${c.text}`) };
      }
      return { title, lines: ['Something unexpected waits here'] };
    case 'surveyor':
      return { title, lines: ['Swap some basic lands for special lands that suit your deck'] };
    case 'boss':
      return { title, lines: [opp, 'Win to clear the expedition'] };
  }
}

const laneY = (lanes: number, lane: number) => (lanes === 1 ? 50 : ((lane + 0.5) / lanes) * 100);

/**
 * Where a node sits on the board, in percent: its floor's column and its
 * lane's row, nudged a little by the run's seed so the map doesn't look like
 * a grid. Maps saved before paths branched freely keep their straight rows.
 */
function nodeAt(run: ExpeditionRun, floor: number, lane: number): { x: number; y: number } {
  const floors = floorsOf(run);
  const nodes = run.map[floor]!;
  const x = ((floor + 0.5) / floors) * 100;
  // On the grid, a node sits in its own lane's row; older maps spread their nodes evenly.
  const row = nodes[lane]?.row;
  const rows = row === undefined ? nodes.length : MAX_LANES;
  const y = row === undefined ? laneY(nodes.length, lane) : laneY(MAX_LANES, row);
  if (!nodes[lane]?.next || floor === floors - 1) return { x, y };
  // A fixed wobble from the seed, floor and lane: -0.5 to 0.5 on each axis.
  const wobble = (salt: number) =>
    (Math.imul(run.seed ^ (floor * 97 + lane * 13 + salt), 0x9e3779b1) >>> 0) / 2 ** 32 - 0.5;
  return { x: x + wobble(1) * (40 / floors), y: y + wobble(2) * (24 / rows) };
}

function ExpeditionMap({
  run,
  best,
  resumable,
  onEnter,
  onPlay,
  onDeck,
  onAbandon,
  onAgain,
  onContinue,
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
  onContinue: () => void;
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
  const floors = floorsOf(run);
  const floorX = (floor: number) => ((floor + 0.5) / floors) * 100;
  const floorNow = Math.min(run.outcomes.length + 1, floors);
  const shown = hover ?? (here && { floor: here.floor, lane: here.lane });
  const info = shown && nodeInfo(run, shown.floor, shown.lane);
  const fight = !!fightOf(run);
  // The travelling token: at your last node (or the start), or on its way to a new one.
  const [moving, setMoving] = useState<number | null>(null);
  const at = (floor: number, lane: number) => nodeAt(run, floor, lane);
  const tokenAt =
    moving !== null
      ? at(run.path.length, moving)
      : run.path.length
        ? at(run.path.length - 1, run.path.at(-1)!)
        : { x: floorX(0) - 45 / floors, y: 50 };
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
        : `Floor ${floorNow} of ${floors}`;
  const sub =
    status === 'playing'
      ? fight
        ? 'Your next fight is ready.'
        : 'Choose where to go next.'
      : status === 'cleared'
        ? 'Set out again with the deck and cards you’ve built. Lives and boons start over.'
        : `Floors cleared: ${run.outcomes.length} of ${floors} · best with this deck: ${best}`;
  // Expeditions cleared with this deck before this map, counting from the first.
  const number = (run.loop ?? 0) + 1;

  // Edges between every pair of connected nodes; the path taken is drawn in gold.
  const edges: { key: string; x1: number; y1: number; x2: number; y2: number; state: string }[] =
    [];
  // From where you stand, Mapmaker's extra lanes are drawn as paths too.
  const outs = (f: number, i: number) =>
    f === run.path.length - 1 && run.path[f] === i
      ? [...new Set([...links(run.map, f, i), ...open])]
      : links(run.map, f, i);
  for (let f = 0; f < floors - 1; f++)
    run.map[f]!.forEach((_, i) =>
      outs(f, i).forEach((j) => {
        const taken = run.path[f] === i && run.path[f + 1] === j;
        const next = run.path.length === f + 1 && run.path[f] === i && open.includes(j);
        const a = at(f, i);
        const b = at(f + 1, j);
        edges.push({
          key: `${f}-${i}-${j}`,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          state: taken ? 'taken' : next ? 'next' : '',
        });
      }),
    );

  return (
    <div className={`start shell xmap xmap--${status}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">
          Expedition{number > 1 && ` ${number}`} · {deck.name}
        </span>
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
        {run.boons.length + (run.pacts?.length ?? 0) > 0 && (
          <span className="xmap__boons">
            {(run.pacts ?? []).map((p) => (
              <span
                key={p}
                className="boon-chip boon-chip--pact"
                title={`${PACTS[p].reward} ${PACTS[p].cost}`}
              >
                {PACTS[p].name}
              </span>
            ))}
            {run.boons.map((b) => {
              const spent = b === 'secondWind' && run.windUsed;
              return (
                <span
                  key={b}
                  className={`boon-chip ${spent ? 'is-spent' : ''}`}
                  title={spent ? `${BOONS[b].text} (used)` : BOONS[b].text}
                >
                  {BOONS[b].name}
                </span>
              );
            })}
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
                    left: `${at(f, lane).x}%`,
                    top: `${at(f, lane).y}%`,
                  } as React.CSSProperties
                }
                aria-disabled={!canGo}
                aria-label={`${nodeInfo(run, f, lane).title}, floor ${f + 1}`}
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
                    className={`xnode__reward ${node.reward.kind === 'color' ? `pip--${node.reward.color}` : `is-${node.reward.kind}`}`}
                    title={packName(node.reward)}
                  />
                )}
                {!onPath && node.kind === 'elite' && (
                  <span className="xnode__reward is-rare" title="A rare of your choice" />
                )}
                {!onPath && twistOf(run, f, lane) && (
                  <span
                    className="xnode__twist"
                    title={`${TWISTS[twistOf(run, f, lane)!].name}: ${TWISTS[twistOf(run, f, lane)!].text}`}
                  />
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
              <span className="xmap__info-title" title={info.title}>
                {info.title}
              </span>
              {info.lines.map((l) => (
                <span key={l} title={l}>
                  {l}
                </span>
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
              {status === 'cleared' && (
                <button className="btn btn--primary btn--big" onClick={onContinue}>
                  Set out again with this deck
                </button>
              )}
              <button
                className={`btn ${status === 'cleared' ? 'btn--ghost' : 'btn--primary btn--big'}`}
                onClick={onAgain}
              >
                {status === 'cleared' ? 'Start over' : 'New expedition'}
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

/** A pact's seal: a scroll tied with a cord. */
const PACT_ICON = (
  <path d="M6 3h11a3 3 0 0 1 3 3v1h-3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2h3V6a3 3 0 0 1 1-3zm2 4v2h7V7H8zm0 4v2h7v-2H8zm6.5 4.5a2 2 0 1 0 0 .01z" />
);

function BoonChoice({
  run,
  options,
  pact,
  picks,
  onChoose,
  onPact,
}: {
  run: ExpeditionRun;
  options: BoonId[];
  pact?: PactId;
  /** Boons still to pick (Twin Blessing asks for two). */
  picks: number;
  onChoose: (b: BoonId) => void;
  onPact: (p: PactId) => void;
}) {
  const kind = currentNode(run)?.node.kind;
  const where =
    kind === 'shrine'
      ? (run.pacts ?? []).includes('twin') && picks > 0 && !pact
        ? 'Twin Blessing'
        : 'Shrine'
      : kind === 'mystery'
        ? 'Mystery'
        : 'Elite defeated';
  return (
    <div className="start shell choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · {where}</span>
        <h1>{picks > 1 ? 'Choose two boons' : 'Choose a boon'}</h1>
        <p>
          {pact
            ? 'It lasts for the rest of the run. Or make a pact: a bigger reward, for tougher fights.'
            : picks > 1
              ? 'Both last for the rest of the run.'
              : 'It lasts for the rest of the run.'}
        </p>
      </div>
      <div className="choice__options">
        {options.map((b, i) => (
          <button
            key={b}
            className="choice__option"
            style={{ '--i': i } as React.CSSProperties}
            onClick={(e) => choose(e.currentTarget, 'boon', () => onChoose(b))}
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
        {pact && (
          <button
            className="choice__option choice__option--pact"
            style={{ '--i': options.length } as React.CSSProperties}
            onClick={(e) => choose(e.currentTarget, 'pact', () => onPact(pact))}
          >
            <span className="choice__tag">Pact</span>
            <span className="choice__glyph">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                {PACT_ICON}
              </svg>
            </span>
            <span className="choice__name">{PACTS[pact].name}</span>
            <span className="choice__text">{PACTS[pact].reward}</span>
            <span className="choice__cost">{PACTS[pact].cost}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Camp({ run, onChoose }: { run: ExpeditionRun; onChoose: (c: 'rest' | 'forage') => void }) {
  const hurt = run.livesLost > 0;
  return (
    <div className="start shell choice">
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
          onClick={(e) => choose(e.currentTarget, 'rest', () => onChoose('rest'))}
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
          onClick={(e) => choose(e.currentTarget, 'choice', () => onChoose('forage'))}
        >
          <span className="choice__glyph">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              {ICONS.camp}
            </svg>
          </span>
          <span className="choice__name">Forage</span>
          <span className="choice__text">
            Open a {PACK_SET_NAMES[packSetOf(run, run.build.opened)]} booster and keep{' '}
            {keepCount(run)}.
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
    <div className="start shell choice">
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
              onClick={(e) => choose(e.currentTarget, 'choice', () => onChoose(i))}
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
  fx,
  onChoose,
}: {
  eyebrow: string;
  title: string;
  text: string;
  cards: string[];
  /** How picking one looks and sounds. */
  fx: 'rare' | 'mythic';
  onChoose: (name: string) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  return (
    <div className="start shell choice">
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
            onClick={(e) => choose(e.currentTarget, fx, () => onChoose(name))}
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

/**
 * Your cards to pay with or pick from, in two groups: spare copies in your
 * collection first (giving one costs your deck nothing), then cards that are
 * only in your deck. Each says how many copies are where, and a picked copy
 * that would come out of your deck says so. `takes` is false when picking
 * doesn't cost the card (the mirror).
 */
function YourCards({
  build,
  cards,
  picked,
  takes,
  onPick,
  onHover,
}: {
  build: Build;
  cards: string[];
  /** Copies chosen so far (a name twice for two copies). */
  picked: string[];
  takes: boolean;
  onPick: (name: string, el: HTMLElement) => void;
  onHover: (h: HoverState | null) => void;
}) {
  const spare = cards.filter((n) => (build.side[n] ?? 0) > 0);
  const deckOnly = cards.filter((n) => !(build.side[n] ?? 0));
  const tile = (name: string) => {
    const inDeck = build.main[name] ?? 0;
    const spares = build.side[name] ?? 0;
    const n = picked.filter((g) => g === name).length;
    const out = takes ? Math.max(0, n - spares) : 0;
    const where = [spares && `${spares} spare`, inDeck && `${inDeck} in deck`]
      .filter(Boolean)
      .join(' · ');
    return (
      <button
        key={name}
        className={`merchant__card ${n ? 'is-on' : ''} ${out ? 'is-from-deck' : ''}`}
        onClick={(e) => onPick(name, e.currentTarget)}
        onMouseEnter={(e) => onHover({ defId: slug(name), anchor: e.currentTarget })}
        onMouseLeave={() => onHover(null)}
      >
        <img src={imageOf(name)} alt={name} draggable={false} />
        {n > 0 ? (
          <span className="merchant__give">
            Give{n > 1 ? ` ×${n}` : ''}
            {out > 0 && ' · from deck'}
          </span>
        ) : (
          <span className="merchant__where">{where}</span>
        )}
      </button>
    );
  };
  return (
    <div className="merchant__pay">
      {spare.length > 0 && (
        <section className="merchant__group">
          <h2 className="merchant__heading">
            Your collection <span>Not in your deck. Giving these costs your deck nothing.</span>
          </h2>
          <div className="merchant__cards">{spare.map(tile)}</div>
        </section>
      )}
      {deckOnly.length > 0 && (
        <section className="merchant__group">
          <h2 className="merchant__heading">
            In your deck{' '}
            <span>
              {takes ? 'Giving one of these takes it out of your deck.' : 'Only in your deck.'}
            </span>
          </h2>
          <div className="merchant__cards">{deckOnly.map(tile)}</div>
        </section>
      )}
    </div>
  );
}

/** How many of the chosen copies would come out of the deck (spares go first). */
const fromDeck = (b: Build, picked: string[]) =>
  [...new Set(picked)].reduce(
    (k, n) => k + Math.max(0, picked.filter((g) => g === n).length - (b.side[n] ?? 0)),
    0,
  );

/** The wishing well and the mirror: choose one of your cards. */
function CardPick({
  run,
  mode,
  onPick,
}: {
  run: ExpeditionRun;
  mode: 'well' | 'mirror';
  onPick: (name: string | null) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const cards = useMemo(() => pickable(run, mode), [run, mode]);
  const b = run.build;
  return (
    <div className="start shell choice merchant">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">
          Expedition · {mode === 'well' ? 'Wishing well' : 'Mirror'}
        </span>
        <h1>{mode === 'well' ? 'Throw in a card' : 'Choose a card to copy'}</h1>
        <p>
          {mode === 'well'
            ? 'You get a random card a rarity higher from the same set.'
            : 'The copy goes into your collection.'}
        </p>
      </div>
      <YourCards
        build={b}
        cards={cards}
        picked={[]}
        takes={mode === 'well'}
        onPick={(name, el) => choose(el, mode, () => onPick(name))}
        onHover={setHover}
      />
      <div className="gauntlet__actions">
        <button className="btn btn--ghost" onClick={() => onPick(null)}>
          Walk away
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** The surveyor: three special lands, each replacing some of your basics. */
function LandChoice({
  run,
  offers,
  onChoose,
}: {
  run: ExpeditionRun;
  offers: string[];
  onChoose: (land: string | null) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const atEvent = currentNode(run)?.node.kind === 'mystery';
  return (
    <div className="start shell choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">
          Expedition · {atEvent ? 'A Lost Surveyor' : 'Surveyor'}
        </span>
        <h1>Upgrade your lands</h1>
        <p>Choose one. Its copies go into your deck in place of basics, and stay for the run.</p>
      </div>
      <div className="choice__options">
        {offers.map((land, i) => {
          const { copies, replaces } = landUpgrade(run.build, land);
          const swapped = [...new Set(replaces)]
            .map((b) => `${replaces.filter((x) => x === b).length} ${b}`)
            .join(', ');
          return (
            <button
              key={land}
              className="land-choice"
              style={{ '--i': i } as React.CSSProperties}
              onClick={(e) => choose(e.currentTarget, 'land', () => onChoose(land))}
              onMouseEnter={(e) => setHover({ defId: slug(land), anchor: e.currentTarget })}
              onMouseLeave={() => setHover(null)}
            >
              <span className="card-choice">
                <img src={imageOf(land)} alt={land} draggable={false} />
              </span>
              <span className="land-choice__copies">
                {copies} {copies > 1 ? 'copies' : 'copy'}
              </span>
              {swapped && <span className="land-choice__swap">Replaces {swapped}</span>}
            </button>
          );
        })}
      </div>
      <div className="gauntlet__actions">
        <button className="btn btn--ghost" onClick={() => onChoose(null)}>
          Keep my basics
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** A card you were just given: it flips in, with sparkles in its rarity's colour. */
function Gift({ card, note, onDone }: { card: string; note: string; onDone: () => void }) {
  const shown = useRef<HTMLDivElement>(null);
  const rarity = scryfallById.get(slug(card))?.rarity ?? 'common';
  useEffect(() => {
    play('flip');
    later(fxOn() ? 380 : 0, () => {
      const el = shown.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const color = RARITY_FX[rarity] ?? RARITY_FX.common!;
      const big = rarity === 'rare' || rarity === 'mythic';
      play(big ? 'win' : 'chime', { gain: big ? 0.6 : 0.5 });
      burst(r.left + r.width / 2, r.top + r.height / 2, color, {
        n: big ? 70 : 34,
        speed: [1.5, big ? 8 : 5],
        life: [30, 64],
        size: [2, 6],
        drag: 0.95,
        box: { w: r.width, h: r.height, mode: 'edge' },
      });
      if (big)
        ring(r.left + r.width / 2, r.top + r.height / 2, color, {
          r0: 40,
          r1: 280,
          life: 30,
          width: 4,
        });
    });
  }, [card, rarity]);
  return (
    <div className="start shell choice">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · New card</span>
        <h1>{card}</h1>
        <p>{note}</p>
      </div>
      <div className="choice__options gift">
        <div ref={shown} className={`card-choice card-choice--gift is-${rarity}`}>
          <img src={imageOf(card)} alt={card} draggable={false} />
        </div>
      </div>
      <div className="gauntlet__actions">
        <button className="btn btn--primary btn--big" onClick={onDone}>
          Continue
        </button>
      </div>
    </div>
  );
}

/** The merchant: pick a rare, then two of your cards to pay with (one with Haggler). */
function Merchant({
  run,
  offers,
  onTrade,
  onLeave,
}: {
  run: ExpeditionRun;
  offers: string[];
  onTrade: (buy: string, give: string[]) => void;
  onLeave: () => void;
}) {
  const [buy, setBuy] = useState<string | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const price = merchantPrice(run);
  const priceWords = price === 1 ? 'one card' : 'two cards';
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
    if (give.length < price && taken < owned(b, name)) setGive([...give, name]);
    else if (i >= 0) setGive(give.filter((_, j) => j !== i));
  };
  const losing = fromDeck(b, give);
  const hoverProps = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setHover({ defId: slug(name), anchor: e.currentTarget }),
    onMouseLeave: () => setHover(null),
  });

  return (
    <div className="start shell choice merchant">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Merchant</span>
        <h1>{buy ? `Pay with ${priceWords}` : 'A travelling merchant'}</h1>
        <p>
          {buy
            ? `Choose ${priceWords} from your deck or collection to trade away.`
            : `"Rare wares, friend. Any one of these for ${price === 1 ? 'one' : 'two'} of yours."`}
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
        <YourCards
          build={b}
          cards={yours}
          picked={give}
          takes
          onPick={(name) => toggle(name)}
          onHover={setHover}
        />
      )}
      {buy && losing > 0 && (
        <p className="merchant__note">
          {losing === 1 ? 'One card' : `${losing} cards`} will come out of your deck.
        </p>
      )}
      <div className="gauntlet__actions">
        {buy && (
          <button
            className="btn btn--primary btn--big"
            disabled={give.length < price}
            onClick={() => {
              const card = document.querySelector('.merchant .card-choice.is-on');
              if (card) choose(card as HTMLElement, 'rare', () => onTrade(buy, give));
              else onTrade(buy, give);
            }}
          >
            {give.length < price ? `Choose ${price - give.length} more` : 'Trade'}
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
