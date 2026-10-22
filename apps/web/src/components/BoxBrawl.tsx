import { scryfallById, slug } from '@mtg/cards';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyBoxSuggestion,
  BOX_DECK,
  BOX_LANDS,
  BOX_LOSSES,
  BOX_MAIN,
  HALF_PACKS,
  BOX_SET_NAMES,
  BOX_WINS,
  type BoxEvent,
  boxBoosters,
  boxPlayerDeck,
  type BoxState,
  canCommand,
  canPlay,
  chooseCommander,
  commanderChoices,
  currentBoxOpponent,
  fits,
  identityOf,
  LEGEND_CHOICES,
  leaveBox,
  markBoxRevealed,
  matchNumber,
  moveBoxCard,
  outsideColours,
  RECOMMENDED,
  rankCommanders,
  resignBox,
  startBox,
  statusOf,
} from '../game/boxBrawl.ts';
import { artFor } from '../game/deckArt.ts';
import { ALL_PACK_SETS, deckAdvice, type PackSet, size } from '../game/expedition.ts';
import { burst, flash, later, mountFx } from '../game/fx.ts';
import type { RunSummary } from '../game/gauntlet.ts';
import { ruleNotes } from '../game/notes.ts';
import { loadSideboard } from '../game/sideboard.ts';
import { play } from '../game/sound.ts';
import { DeckBuilder } from './DeckBuilder.tsx';
import { BoosterReveal, packArt, RANK, rarityOf } from './PackOpening.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { Tracker } from './Sealed.tsx';
import { UiSize } from './UiSize.tsx';
import './home.css';
import './expedition.css';
import './foil.css';
import './sealed.css';
import './box-brawl.css';

const setArt = (set: PackSet) => packArt({ kind: 'booster' }, set);
const cardArt = (name: string) => scryfallById.get(slug(name))?.image?.artCrop ?? '';
const cardImage = (name: string) => scryfallById.get(slug(name))?.image?.normal;
const SKILLS: Record<string, string> = {
  easy: 'Novice',
  heuristic: 'Apprentice',
  search: 'Master',
};
const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : word.endsWith('s') ? `${word}es` : `${word}s`}`;
const seed = () => Math.floor(Math.random() * 2 ** 31);
const GOLD = '#f3dca4';

const Pips = ({ name }: { name: string }) => (
  <span className="deck__pips">
    {identityOf(name).map((c) => (
      <span key={c} className={`pip pip--${c}`} />
    ))}
  </span>
);

/** The event in progress (or just finished) as the Home tile and the board's label show it. */
export function boxRunSummary(e: BoxEvent | null): RunSummary | null {
  if (!e) return null;
  const status = statusOf(e);
  const deck = boxPlayerDeck(e);
  return {
    deck: deck?.id ?? '',
    status: status === 'playing' ? 'playing' : status === 'won' ? 'cleared' : 'out',
    unit: 'Match',
    step: matchNumber(e) + 1,
    steps: BOX_WINS,
    done: e.wins,
    livesLeft: BOX_LOSSES - e.losses,
    lives: BOX_LOSSES,
    label: `${plural(e.wins, 'win')} · ${plural(e.losses, 'loss')}`,
    name: e.commander ?? `${BOX_SET_NAMES[e.set]} box`,
    art: e.commander ? cardArt(e.commander) : setArt(e.set),
  };
}

type Update = (f: (s: BoxState) => BoxState) => void;

/**
 * Box Brawl: pick a set, open half a box, build a 60-card Brawl deck with a commander from its
 * legends and play until three wins or two losses. No event is the set picker, an unopened box
 * the reveal, and otherwise the deck builder (straight after the reveal, and while you edit; its
 * commander slot opens the commander pick) or the event screen.
 */
export function BoxBrawl({
  state,
  update,
  resumable,
  onPlay,
  onMenu,
}: {
  state: BoxState;
  update: Update;
  /** A game was left part-way and can be picked up. */
  resumable: boolean;
  onPlay: () => void;
  onMenu: () => void;
}) {
  const e = state.event;
  const [building, setBuilding] = useState(
    () => !!e && !e.finished && (!e.commander || size(e.main) === 0),
  );
  const [picking, setPicking] = useState(false);
  if (!e) return <Picker state={state} update={update} onMenu={onMenu} />;
  if (!e.revealed)
    return (
      <Reveal
        event={e}
        onDone={() => {
          update(markBoxRevealed);
          setBuilding(true);
        }}
      />
    );
  if (!e.finished && picking)
    return (
      <CommanderPick
        event={e}
        onPick={(name) => {
          update((s) => chooseCommander(s, name));
          play('flip');
          setPicking(false);
          setBuilding(true);
        }}
        onBack={() => setPicking(false)}
      />
    );
  if (building && !e.finished)
    return (
      <Builder
        event={e}
        update={update}
        onCommander={() => setPicking(true)}
        onDone={() => setBuilding(false)}
      />
    );
  return (
    <Hub
      event={e}
      update={update}
      resumable={resumable}
      onPlay={onPlay}
      onDeck={() => setBuilding(true)}
      onMenu={onMenu}
    />
  );
}

// ---------------------------------------------------------------------------
// Set picker
// ---------------------------------------------------------------------------

function Picker({
  state,
  update,
  onMenu,
}: {
  state: BoxState;
  update: Update;
  onMenu: () => void;
}) {
  const [set, setSet] = useState<PackSet>(
    () =>
      ALL_PACK_SETS.slice().sort(
        (a, b) => (state.records[b]?.events ?? 0) - (state.records[a]?.events ?? 0),
      )[0]!,
  );
  const start = () => {
    play('fan', { gain: 0.6 });
    update((s) => startBox(s, set, seed()));
  };
  return (
    <div className="start shell sealed sealed--pick">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Box Brawl</span>
        <h1>Choose a box</h1>
        <p>
          Split a booster box with your first opponent, pick a legend from your half as your
          commander and build a Brawl deck around it. Later opponents bring half a box of their own.
        </p>
      </div>

      <div className="sealed-sets" role="radiogroup" aria-label="Set">
        {ALL_PACK_SETS.map((s) => {
          const rec = state.records[s];
          return (
            <button
              key={s}
              role="radio"
              aria-checked={set === s}
              className={`sealed-set ${set === s ? 'is-on' : ''}`}
              onClick={() => setSet(s)}
            >
              <span
                className="sealed-set__art"
                style={{ backgroundImage: `url("${setArt(s)}")` }}
              />
              <span className="sealed-set__name">{BOX_SET_NAMES[s]}</span>
              <span className="sealed-set__rec">
                {rec?.events
                  ? `Best ${plural(rec.best, 'win')} · ${rec.events}×`
                  : 'Not played yet'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sealed-info">
        <ul className="sealed-rules">
          <li>
            <strong>{HALF_PACKS}</strong> boosters (half a box)
          </li>
          <li>
            <strong>{BOX_DECK}</strong>-card deck with a commander
          </li>
          <li>
            <strong>25</strong> life
          </li>
          <li>
            <strong>{BOX_WINS}</strong> wins or <strong>{BOX_LOSSES}</strong> losses
          </li>
        </ul>
        <p className="sealed-season">
          Copies are fine: play as many of a card as you opened. Every card must fit your
          commander’s colours. A box without a legend offers {LEGEND_CHOICES} of the set’s. Box
          Brawl keeps no cards and pays no Season prize.
        </p>
      </div>

      <div className="gauntlet__actions">
        <button className="btn btn--primary btn--big" onClick={start}>
          Open a {BOX_SET_NAMES[set]} box
        </button>
        <button className="btn btn--ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Box reveal
// ---------------------------------------------------------------------------

/** The box's boosters one after another, or all at once. Every card is yours. */
function Reveal({ event, onDone }: { event: BoxEvent; onDone: () => void }) {
  const packs = useMemo(() => boxBoosters(event), [event.seed, event.set]);
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState(false);
  const last = index === packs.length - 1;
  if (all) return <WholeBox packs={packs} onDone={onDone} />;
  return (
    <>
      <BoosterReveal
        key={index}
        cards={packs[index]!.cards}
        foil={packs[index]!.foil}
        set={event.set}
        eyebrow={`Box Brawl · Pack ${index + 1} of ${packs.length}`}
        note="Every card is in your pool."
        doneLabel={last ? 'Build your deck' : 'Next pack'}
        onDone={() => (last ? onDone() : setIndex(index + 1))}
      />
      <div className="shell sealed-skip">
        <button className="btn btn--ghost" onClick={() => setAll(true)}>
          Open all
        </button>
        <button className="btn btn--ghost" onClick={onDone}>
          Skip to deck
        </button>
      </div>
    </>
  );
}

/** "Open all": your half of the box face up, each card once with its count, rares and mythics first. */
function WholeBox({
  packs,
  onDone,
}: {
  packs: readonly { cards: string[]; foil?: number }[];
  onDone: () => void;
}) {
  const cards = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of packs.flatMap((p) => p.cards)) counts.set(n, (counts.get(n) ?? 0) + 1);
    return [...counts].sort(
      ([a], [b]) => RANK[rarityOf(b)] - RANK[rarityOf(a)] || a.localeCompare(b),
    );
  }, [packs]);
  // A card shows foil when any of its copies came in a pack's foil slot.
  const foils = useMemo(
    () => new Set(packs.flatMap((p) => (p.foil === undefined ? [] : [p.cards[p.foil]!]))),
    [packs],
  );
  const total = packs.reduce((k, p) => k + p.cards.length, 0);
  const [hover, setHover] = useState<HoverState | null>(null);
  return (
    <div className="start shell sealed-all">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Box Brawl · All {packs.length} packs</span>
        <h1>Your half of the box</h1>
        <p>
          {total} cards, {cards.length} different. Rares and mythics first.
        </p>
      </div>
      <div className="sealed-all__grid">
        {cards.map(([name, n], i) => {
          const defId = slug(name);
          const img = cardImage(name);
          return (
            <span
              key={name}
              className={`sealed-all__card sealed-all__card--${rarityOf(name)} ${foils.has(name) ? 'is-foil' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              onMouseEnter={(e) => setHover({ defId, anchor: e.currentTarget })}
              onMouseLeave={() => setHover(null)}
            >
              {img ? <img src={img} alt={name} loading="lazy" draggable={false} /> : name}
              {n > 1 && <span className="box-count">×{n}</span>}
            </span>
          );
        })}
      </div>
      <div className="gauntlet__actions">
        <button className="btn btn--primary btn--big" onClick={onDone}>
          Build your deck
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commander
// ---------------------------------------------------------------------------

function CommanderPick({
  event,
  onPick,
  onBack,
}: {
  event: BoxEvent;
  onPick: (name: string) => void;
  onBack: () => void;
}) {
  const { names, gifted } = useMemo(() => commanderChoices(event), [event.seed, event.set]);
  const [hover, setHover] = useState<HoverState | null>(null);
  // Building a deck for every legend takes a moment in a big box: show the cards first.
  const [best, setBest] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const t = window.setTimeout(
      () => setBest(new Set(rankCommanders(event).slice(0, RECOMMENDED))),
      50,
    );
    return () => window.clearTimeout(t);
  }, [event.seed, event.set]);
  return (
    <div className="start shell sealed-all box-pick">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Box Brawl · {BOX_SET_NAMES[event.set]}</span>
        <h1>Choose your commander</h1>
        <p>
          {gifted
            ? `Your half of the box has no legendary creature, so pick one of these ${names.length}.`
            : `${plural(names.length, 'legend')} in your half of the box, best first. Your deck takes only cards of its colours.`}{' '}
          {names.length > RECOMMENDED &&
            'Recommended ones make the strongest decks from what you opened.'}
        </p>
      </div>
      <div className="sealed-all__grid">
        {names.map((name, i) => {
          const img = cardImage(name);
          const on = event.commander === name;
          return (
            <button
              key={name}
              className={`sealed-all__card sealed-all__card--${rarityOf(name)} box-pick__card ${on ? 'is-on' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              aria-pressed={on}
              title={name}
              onClick={() => onPick(name)}
              onMouseEnter={(e) => setHover({ defId: slug(name), anchor: e.currentTarget })}
              onMouseLeave={() => setHover(null)}
            >
              {img ? <img src={img} alt={name} loading="lazy" draggable={false} /> : name}
              {names.length > RECOMMENDED && best.has(name) && (
                <span className="box-pick__tag">Recommended</span>
              )}
              <span className="box-pick__pips">
                <Pips name={name} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="gauntlet__actions">
        <button className="btn btn--ghost" onClick={onBack}>
          {event.commander ? `Keep ${event.commander}` : 'Back to the deck'}
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

function Builder({
  event,
  update,
  onCommander,
  onDone,
}: {
  event: BoxEvent;
  update: Update;
  onCommander: () => void;
  onDone: () => void;
}) {
  const commander = event.commander;
  const deckId = useMemo(() => boxPlayerDeck(event)?.id, [event]);
  const identity = commander ? identityOf(commander) : null;
  const outside = outsideColours(event);
  const sideKey = `box:${event.id}`;
  const blocked = useCallback(
    (name: string) => (identity && !fits(name, identity) ? `Outside ${commander}’s colours` : null),
    [commander],
  );
  const { names: legends, gifted } = useMemo(
    () => commanderChoices(event),
    [event.seed, event.set],
  );
  const tips = useMemo(
    () => [
      ...(commander
        ? []
        : [
            gifted
              ? 'Your half has no legend: choose a commander from the set’s.'
              : 'Choose a commander: a legend’s Commander button, or the commander slot.',
          ]),
      ...(outside.length
        ? [`${plural(outside.length, 'card')} outside ${commander}’s colours: take them out.`]
        : []),
      ...deckAdvice(
        { main: event.main, side: {}, opened: 0, packs: [], fresh: [] },
        { size: BOX_MAIN, lands: BOX_LANDS },
      ),
    ],
    [event.main, commander, gifted, outside.length],
  );
  const [confirming, setConfirming] = useState(false);
  const suggest = () => {
    if (size(event.main) && !confirming) return setConfirming(true);
    setConfirming(false);
    update((s) => applyBoxSuggestion(s, loadSideboard(sideKey)));
    play('shuffle');
  };
  return (
    <DeckBuilder
      name={commander ?? `${BOX_SET_NAMES[event.set]} box`}
      colors={identity ?? []}
      art={commander ? cardArt(commander) : setArt(event.set)}
      deck={event.main}
      pool={event.side}
      basics
      basicsDeck={deckId}
      min={BOX_MAIN}
      tips={tips}
      sideboardKey={sideKey}
      blocked={blocked}
      commandable={(name) => name !== commander && canCommand(name) && legends.includes(name)}
      onCommand={(name) => {
        update((s) => chooseCommander(s, name));
        play('flip');
      }}
      tools={
        <button
          className="btn btn--ghost"
          onClick={suggest}
          onMouseLeave={() => setConfirming(false)}
          title={`Builds ${BOX_MAIN} cards around ${commander ?? 'the recommended commander'} from your half of the box`}
        >
          {confirming ? 'Replace my deck?' : 'Suggest a deck'}
        </button>
      }
      extraStats={
        <button
          className={`box-commander ${commander ? '' : 'is-empty'}`}
          onClick={onCommander}
          title="Choose a commander from your legends"
        >
          {commander ? (
            <img src={cardImage(commander)} alt="" draggable={false} />
          ) : (
            <span className="box-commander__slot" aria-hidden />
          )}
          <span>
            <small>Commander, the {BOX_DECK}th card</small>
            <strong>{commander ?? 'Choose a commander'}</strong>
            <small>
              {commander ? 'Change' : plural(legends.length, 'legend') + ' to pick from'}
            </small>
          </span>
        </button>
      }
      onAdd={(name) => update((s) => moveBoxCard(s, name, 'main'))}
      onRemove={(name) => update((s) => moveBoxCard(s, name, 'side'))}
      onDone={onDone}
    />
  );
}

// ---------------------------------------------------------------------------
// Event screen
// ---------------------------------------------------------------------------

function Hub({
  event: e,
  update,
  resumable,
  onPlay,
  onDeck,
  onMenu,
}: {
  event: BoxEvent;
  update: Update;
  resumable: boolean;
  onPlay: () => void;
  onDeck: () => void;
  onMenu: () => void;
}) {
  const status = statusOf(e);
  const playing = status === 'playing';
  const [confirming, setConfirming] = useState(false);
  const foe = useMemo(
    () => (playing && e.commander ? currentBoxOpponent(e) : null),
    [playing, e.seed, e.set, e.wins, e.losses, e.draws, !!e.commander],
  );
  const cards = size(e.main) + (e.commander ? 1 : 0);
  const ready = canPlay(e);
  const outside = outsideColours(e);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (status !== 'won') return;
    const stop = mountFx(canvas.current!);
    play('win', { gain: 0.8 });
    later(250, () => {
      flash(GOLD, 0.3, 700);
      for (const x of [0.2, 0.5, 0.8])
        burst(innerWidth * x, innerHeight * 0.4, GOLD, {
          n: 90,
          speed: [3, 12],
          life: [34, 70],
          size: [3, 8],
          drag: 0.95,
        });
    });
    return stop;
  }, [status]);

  const headline =
    status === 'won'
      ? `${BOX_WINS} wins!`
      : status === 'out'
        ? `Out after ${plural(e.wins, 'win')}`
        : status === 'resigned'
          ? `Event over: ${plural(e.wins, 'win')}`
          : `Game ${matchNumber(e) + 1}`;
  const sub =
    status === 'playing'
      ? `${BOX_SET_NAMES[e.set]} box · ${BOX_WINS} wins or ${BOX_LOSSES} losses`
      : status === 'won'
        ? 'Your box beat every box it met.'
        : status === 'out'
          ? `${plural(e.losses, 'loss')} ended the event.`
          : 'You resigned with the record you had.';

  return (
    <div className={`start shell sealed sealed--${status}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Box Brawl · {BOX_SET_NAMES[e.set]}</span>
        <h1>{headline}</h1>
        <p>{sub}</p>
      </div>

      <Tracker
        wins={e.wins}
        losses={e.losses}
        maxWins={BOX_WINS}
        maxLosses={BOX_LOSSES}
        live={playing}
      />

      <div className="sealed-boxes">
        <section className="sealed-box">
          <span
            className="sealed-box__art"
            style={{
              backgroundImage: `url("${e.commander ? cardArt(e.commander) : setArt(e.set)}")`,
            }}
          />
          <div className="sealed-box__text">
            <span className="sealed-box__label">Your commander</span>
            <span className="sealed-box__name">{e.commander ?? 'Not chosen yet'}</span>
            <span className="sealed-box__meta">
              {e.commander && <Pips name={e.commander} />}
              {plural(cards, 'card')}
            </span>
          </div>
          {playing && !resumable && (
            <button className="btn btn--ghost" onClick={onDeck}>
              Edit deck
            </button>
          )}
        </section>
        {foe && (
          <section className="sealed-box sealed-box--foe">
            <span
              className="sealed-box__art"
              style={{ backgroundImage: `url("${artFor(foe.deck)}")` }}
            />
            <div className="sealed-box__text">
              <span className="sealed-box__label">Opponent</span>
              <span className="sealed-box__name">{foe.deck.commander}</span>
              <span className="sealed-box__meta">
                <Pips name={foe.deck.commander!} />
                {SKILLS[foe.bot] ?? 'Master'}
              </span>
            </div>
          </section>
        )}
      </div>

      {playing && !ready && !resumable && (
        <p className="sealed-reason">
          {!e.commander
            ? 'Choose a commander in the deck builder to play.'
            : outside.length
              ? `${plural(outside.length, 'card')} in your deck ${outside.length === 1 ? 'is' : 'are'} outside ${e.commander}’s colours.`
              : `Your deck has ${plural(cards, 'card')}; it needs ${BOX_DECK} with the commander to play.`}
        </p>
      )}

      <div className="gauntlet__actions sealed-actions">
        {playing ? (
          confirming ? (
            <>
              <span className="gauntlet__confirm">
                Resign? The event ends with {plural(e.wins, 'win')}.
              </span>
              <button className="btn btn--primary" onClick={() => update(resignBox)}>
                Resign
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                Keep playing
              </button>
            </>
          ) : (
            <>
              <button
                className={`btn btn--primary btn--big ${ready || resumable ? 'btn--nudge' : ''}`}
                disabled={!ready && !resumable}
                onClick={onPlay}
              >
                {resumable ? 'Resume game' : `Play game ${matchNumber(e) + 1}`}
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirming(true)}>
                Resign
              </button>
              <button className="btn btn--ghost" onClick={onMenu}>
                Main menu
              </button>
            </>
          )
        ) : (
          <>
            <button
              className="btn btn--primary btn--big"
              onClick={() => {
                update(leaveBox);
                onMenu();
              }}
            >
              Done
            </button>
            <button className="btn btn--ghost" onClick={() => update(leaveBox)}>
              New box
            </button>
          </>
        )}
      </div>
      {status === 'won' && <canvas ref={canvas} className="fx-layer" aria-hidden />}
    </div>
  );
}
