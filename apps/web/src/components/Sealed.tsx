import { scryfallById, slug } from '@mtg/cards';
import { useEffect, useMemo, useRef, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import {
  deckAdvice,
  deckColors,
  MIN_DECK,
  PACK_SET_NAMES,
  type PackSet,
  size,
} from '../game/expedition.ts';
import { burst, flash, fxOn, later, mountFx, ring } from '../game/fx.ts';
import type { RunSummary } from '../game/gauntlet.ts';
import {
  applySealedSuggestion,
  canPlay,
  currentOpponent,
  grantSealedPool,
  leaveSealed,
  markSealedRevealed,
  matchNumber,
  moveSealedCard,
  prizeFor,
  resignSealed,
  SEALED_LOSSES,
  SEALED_PACKS,
  SEALED_PRIZES,
  SEALED_WINS,
  type SealedEvent,
  type SealedState,
  sealedPacks,
  sealedPlayerDeck,
  sealedPromo,
  startSealed,
  statusOf,
} from '../game/sealed.ts';
import { createSeasonRepository } from '../game/seasonStorage.ts';
import { play } from '../game/sound.ts';
import { DeckBuilder } from './DeckBuilder.tsx';
import { BoosterReveal, packArt } from './PackOpening.tsx';
import { UiSize } from './UiSize.tsx';
import './home.css';
import './expedition.css';
import './foil.css';
import './sealed.css';
import './sealed-promo.css';

/** The Season saves Sealed can put cards and prizes into. */
export const seasonRepository = () => createSeasonRepository(localStorage);

interface SeasonInfo {
  /** The save that is active now. */
  activeId: string | null;
  names: Record<string, string>;
}

function seasonInfo(): SeasonInfo {
  try {
    const library = seasonRepository().load();
    return {
      activeId: library.activeSaveId,
      names: Object.fromEntries(library.saves.map((s) => [s.id, s.name])),
    };
  } catch {
    return { activeId: null, names: {} };
  }
}

const SETS = Object.keys(PACK_SET_NAMES) as PackSet[];
const setArt = (set: PackSet) => packArt({ kind: 'booster' }, set);
const SKILLS: Record<string, string> = { easy: 'Novice', heuristic: 'Apprentice', search: 'Master' };
const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : word.endsWith('s') ? `${word}es` : `${word}s`}`;
const seed = () => Math.floor(Math.random() * 2 ** 31);
const GOLD = '#f3dca4';

/** The event in progress (or just finished) as the Home tile and the board's label show it. */
export function sealedRunSummary(e: SealedEvent | null): RunSummary | null {
  if (!e) return null;
  const status = statusOf(e);
  const deck = sealedPlayerDeck(e);
  return {
    deck: deck.id,
    status: status === 'playing' ? 'playing' : status === 'won' ? 'cleared' : 'out',
    unit: 'Match',
    step: matchNumber(e) + 1,
    steps: SEALED_WINS,
    done: e.wins,
    livesLeft: SEALED_LOSSES - e.losses,
    lives: SEALED_LOSSES,
    label: `${plural(e.wins, 'win')} · ${plural(e.losses, 'loss')}`,
    name: deck.name,
    art: size(e.main) ? artFor(deck) : setArt(e.set),
  };
}

type Update = (f: (s: SealedState) => SealedState) => void;

/**
 * Arena's Sealed event: pick a set, open six boosters, build a 40-card deck, then play
 * best-of-one matches until seven wins or three losses. Which screen shows follows from the
 * event: no event is the set picker, an unopened pool is the reveal, and otherwise the event
 * screen (or the deck builder while you edit).
 */
export function Sealed({
  state,
  update,
  resumable,
  onPlay,
  onMenu,
  onSeason,
}: {
  state: SealedState;
  update: Update;
  /** A match was left part-way and can be picked up. */
  resumable: boolean;
  onPlay: () => void;
  onMenu: () => void;
  onSeason: () => void;
}) {
  const e = state.event;
  const [building, setBuilding] = useState(
    () => !!e && !e.finished && e.revealed && size(e.main) === 0,
  );
  const info = useMemo(seasonInfo, [e?.id, e?.finished, e?.prizePaid]);
  if (!e) return <Picker state={state} info={info} update={update} onMenu={onMenu} onSeason={onSeason} />;
  if (!e.revealed)
    return (
      <Reveal
        event={e}
        info={info}
        onDone={() => {
          update(markSealedRevealed);
          setBuilding(true);
        }}
      />
    );
  if (building && !e.finished)
    return <Builder event={e} update={update} onDone={() => setBuilding(false)} />;
  return (
    <Hub
      event={e}
      state={state}
      info={info}
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

/** What the Season save does with the event, in a sentence. */
function SeasonNote({
  info,
  saveId,
  onSeason,
}: {
  info: SeasonInfo;
  saveId: string | null;
  onSeason?: () => void;
}) {
  const name = saveId ? info.names[saveId] : undefined;
  return (
    <p className={`sealed-season ${saveId ? 'is-on' : ''}`}>
      {saveId ? (
        <>
          Every card you open and the prize go to your Season save <strong>{name ?? 'Season'}</strong>.
        </>
      ) : (
        <>
          No Season save is active, so the cards and the prize would be lost. You need a Season
          save to keep them.{' '}
          {onSeason && (
            <button className="sealed-link" onClick={onSeason}>
              Open Season
            </button>
          )}
        </>
      )}
    </p>
  );
}

function Picker({
  state,
  info,
  update,
  onMenu,
  onSeason,
}: {
  state: SealedState;
  info: SeasonInfo;
  update: Update;
  onMenu: () => void;
  onSeason: () => void;
}) {
  const [set, setSet] = useState<PackSet>(
    () =>
      SETS.slice().sort(
        (a, b) => (state.records[b]?.events ?? 0) - (state.records[a]?.events ?? 0),
      )[0]!,
  );
  const start = () => {
    play('fan', { gain: 0.6 });
    update((s) => grantSealedPool(startSealed(s, set, seed(), info.activeId), seasonRepository(), Date.now()));
  };
  return (
    <div className="start shell sealed sealed--pick">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Sealed</span>
        <h1>Choose a set</h1>
        <p>Open six boosters of it and build a deck from what you find.</p>
      </div>

      <div className="sealed-sets" role="radiogroup" aria-label="Set">
        {SETS.map((s) => {
          const rec = state.records[s];
          return (
            <button
              key={s}
              role="radio"
              aria-checked={set === s}
              className={`sealed-set ${set === s ? 'is-on' : ''}`}
              onClick={() => setSet(s)}
            >
              <span className="sealed-set__art" style={{ backgroundImage: `url("${setArt(s)}")` }} />
              <span className="sealed-set__name">{PACK_SET_NAMES[s]}</span>
              <span className="sealed-set__rec">
                {rec?.events ? `Best ${plural(rec.best, 'win')} · ${rec.events}×` : 'Not played yet'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sealed-info">
        <ul className="sealed-rules">
          <li>
            <strong>{SEALED_PACKS}</strong> boosters
          </li>
          <li>
            <strong>{MIN_DECK}</strong>-card deck
          </li>
          <li>
            <strong>{SEALED_WINS}</strong> wins or <strong>{SEALED_LOSSES}</strong> losses
          </li>
          <li>Free entry</li>
        </ul>
        <table className="sealed-prizes">
          <caption>Prizes</caption>
          <tbody>
            <tr>
              <th scope="row">Wins</th>
              {SEALED_PRIZES.map((_, i) => (
                <td key={i}>{i}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Coins</th>
              {SEALED_PRIZES.map((p, i) => (
                <td key={i}>{p.coins || '–'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Packs</th>
              {SEALED_PRIZES.map((p, i) => (
                <td key={i}>{p.packs || '–'}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <SeasonNote info={info} saveId={info.activeId} onSeason={onSeason} />
      </div>

      <div className="gauntlet__actions">
        <button className="btn btn--primary btn--big" onClick={start}>
          Open {PACK_SET_NAMES[set]} packs
        </button>
        <button className="btn btn--ghost" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pack reveal
// ---------------------------------------------------------------------------

/** The six boosters, one after another. Every card is yours, so there is nothing to pick. */
/** The prerelease promo: one foil rare (or mythic), big and centred, before the six boosters. */
function PromoReveal({ event, onDone }: { event: SealedEvent; onDone: () => void }) {
  const name = useMemo(() => sealedPromo(event), [event.seed, event.set]);
  const card = scryfallById.get(slug(name));
  const mythic = card?.rarity === 'mythic';
  const [up, setUp] = useState(false);
  const face = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountFx(canvas.current!), []);
  useEffect(() => {
    play('fan', { gain: 0.6 });
  }, []);
  const flip = () => {
    if (up) return;
    const r = face.current?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth / 2;
    const y = r ? r.top + r.height / 2 : innerHeight / 2;
    const color = mythic ? '#ff8a4c' : GOLD;
    play('tick');
    later(fxOn() ? 380 : 0, () => {
      setUp(true);
      flash(color, mythic ? 0.4 : 0.28, 700);
      burst(x, y, color, {
        n: mythic ? 100 : 70,
        speed: [3, 12],
        life: [34, 70],
        size: [3, 8],
        drag: 0.95,
      });
      burst(x, y, GOLD, { n: 40, speed: [1, 6], life: [40, 80], grav: -0.03 });
      ring(x, y, color, { r0: 30, r1: 360, life: 36, width: 5 });
      play(mythic ? 'win' : 'chime', { gain: 0.8 });
    });
  };
  return (
    <div className="start shell sealed sealed--promo">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Sealed · {PACK_SET_NAMES[event.set]}</span>
        <h1>Prerelease promo</h1>
        <p>
          {up
            ? `${name}: a foil ${mythic ? 'mythic' : 'rare'} to start your pool.`
            : 'Every event starts with a foil promo rare. Click it to turn it over.'}
        </p>
      </div>
      <button
        ref={face}
        className={`promo ${up ? 'is-up' : ''}`}
        onClick={flip}
        aria-label={up ? name : 'Turn over the promo card'}
      >
        <span className="promo__inner">
          <span className="promo__back">
            <span className="back" />
          </span>
          <span className="promo__face is-foil">
            {card?.image?.normal ? (
              <img src={card.image.normal} alt={name} draggable={false} />
            ) : (
              name
            )}
          </span>
        </span>
      </button>
      <div className="gauntlet__actions">
        <button className="btn btn--primary btn--big" disabled={!up} onClick={onDone}>
          Open the packs
        </button>
      </div>
      <canvas ref={canvas} className="fx-layer" aria-hidden />
    </div>
  );
}

function Reveal({
  event,
  info,
  onDone,
}: {
  event: SealedEvent;
  info: SeasonInfo;
  onDone: () => void;
}) {
  const packs = useMemo(() => sealedPacks(event), [event.seed, event.set]);
  // The promo comes first (-1), then the packs.
  const [index, setIndex] = useState(-1);
  const last = index === packs.length - 1;
  const save = event.seasonSaveId ? info.names[event.seasonSaveId] : undefined;
  if (index < 0) return <PromoReveal event={event} onDone={() => setIndex(0)} />;
  return (
    <>
      <BoosterReveal
        key={index}
        cards={packs[index]!}
        set={event.set}
        eyebrow={`Sealed · Pack ${index + 1} of ${packs.length}`}
        note={
          event.poolGranted && save
            ? `Every card is in your pool and in your Season save ${save}.`
            : 'Every card is in your pool.'
        }
        doneLabel={last ? 'Build deck' : 'Next pack'}
        onDone={() => (last ? onDone() : setIndex(index + 1))}
      />
      <div className="shell sealed-skip">
        <button className="btn btn--ghost" onClick={onDone}>
          Skip to deck
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

function Builder({
  event,
  update,
  onDone,
}: {
  event: SealedEvent;
  update: Update;
  onDone: () => void;
}) {
  const build = useMemo(
    () => ({ main: event.main, side: event.side, opened: 0, packs: [], fresh: [] }),
    [event.main, event.side],
  );
  const tips = useMemo(() => deckAdvice(build), [build]);
  const deck = useMemo(() => sealedPlayerDeck(event), [event]);
  const [confirming, setConfirming] = useState(false);
  const empty = size(event.main) === 0;
  const suggest = () => {
    if (!empty && !confirming) return setConfirming(true);
    setConfirming(false);
    update((s) => applySealedSuggestion(s));
    play('shuffle');
  };
  return (
    <DeckBuilder
      name="Your deck"
      colors={deckColors(build)}
      art={size(event.main) ? artFor(deck) : setArt(event.set)}
      deck={event.main}
      pool={event.side}
      basics
      basicsDeck={deck.id}
      foil={useMemo(() => new Set([sealedPromo(event)]), [event.seed, event.set])}
      min={MIN_DECK}
      tips={tips}
      tools={
        <button
          className="btn btn--ghost"
          onClick={suggest}
          onMouseLeave={() => setConfirming(false)}
          title="Builds a 40-card deck from your pool's strongest colours"
        >
          {confirming ? 'Replace my deck?' : 'Suggest a deck'}
        </button>
      }
      onAdd={(name) => update((s) => moveSealedCard(s, name, 'main'))}
      onRemove={(name) => update((s) => moveSealedCard(s, name, 'side'))}
      onBuildPair={(colors) => update((s) => applySealedSuggestion(s, colors))}
      onDone={onDone}
    />
  );
}

// ---------------------------------------------------------------------------
// Event screen and summary
// ---------------------------------------------------------------------------

const prizeText = (p: { coins: number; packs: number }, set: PackSet) =>
  p.coins || p.packs
    ? [
        p.coins ? `${p.coins} coins` : '',
        p.packs ? plural(p.packs, `${PACK_SET_NAMES[set]} pack`) : '',
      ]
        .filter(Boolean)
        .join(' and ')
    : 'No prize';

/** Seven win slots and three loss marks, like Arena's event tracker. */
function Tracker({ event }: { event: SealedEvent }) {
  const live = statusOf(event) === 'playing';
  return (
    <div
      className="sealed-track"
      role="img"
      aria-label={`${plural(event.wins, 'win')} of ${SEALED_WINS}, ${plural(event.losses, 'loss')} of ${SEALED_LOSSES}`}
    >
      <div className="sealed-track__group">
        <span className="sealed-track__label">Wins</span>
        <ol className="sealed-wins">
          {Array.from({ length: SEALED_WINS }, (_, i) => (
            <li key={i} className={i < event.wins ? 'is-won' : live && i === event.wins ? 'is-next' : ''}>
              {i < event.wins ? (
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              ) : (
                i + 1
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="sealed-track__group">
        <span className="sealed-track__label">Losses</span>
        <ol className="sealed-losses">
          {Array.from({ length: SEALED_LOSSES }, (_, i) => (
            <li key={i} className={i < event.losses ? 'is-lost' : ''}>
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Hub({
  event: e,
  info,
  update,
  resumable,
  onPlay,
  onDeck,
  onMenu,
}: {
  event: SealedEvent;
  state: SealedState;
  info: SeasonInfo;
  update: Update;
  resumable: boolean;
  onPlay: () => void;
  onDeck: () => void;
  onMenu: () => void;
}) {
  const status = statusOf(e);
  const playing = status === 'playing';
  const [confirming, setConfirming] = useState(false);
  const deck = useMemo(() => sealedPlayerDeck(e), [e]);
  const foe = useMemo(
    () => (playing ? currentOpponent(e) : null),
    [playing, e.seed, e.set, e.wins, e.losses, e.draws],
  );
  const cards = size(e.main);
  const ready = canPlay(e);
  const prize = prizeFor(e.wins);
  const next = e.wins < SEALED_WINS ? prizeFor(e.wins + 1) : null;
  const save = e.seasonSaveId ? info.names[e.seasonSaveId] : undefined;

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
      ? '7 wins!'
      : status === 'out'
        ? `Out after ${plural(e.wins, 'win')}`
        : status === 'resigned'
          ? `Event over: ${plural(e.wins, 'win')}`
          : `Match ${matchNumber(e) + 1}`;
  const sub =
    status === 'playing'
      ? `${PACK_SET_NAMES[e.set]} · ${SEALED_WINS} wins or ${SEALED_LOSSES} losses`
      : status === 'won'
        ? 'A perfect run. The full prize is yours.'
        : status === 'out'
          ? `${plural(e.losses, 'loss')} ended the event.`
          : 'You resigned with the record you had.';

  return (
    <div className={`start shell sealed sealed--${status}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Sealed · {PACK_SET_NAMES[e.set]}</span>
        <h1>{headline}</h1>
        <p>{sub}</p>
      </div>

      <Tracker event={e} />

      {playing ? (
        <div className="sealed-prize">
          <span>
            <small>Now</small>
            {prizeText(prize, e.set)}
          </span>
          {next && (
            <span>
              <small>Next win</small>
              {prizeText(next, e.set)}
            </span>
          )}
        </div>
      ) : (
        <div className="sealed-result">
          <span className="sealed-result__title">Prize</span>
          <strong>{prizeText(prize, e.set)}</strong>
          <p>
            {e.seasonSaveId === null
              ? 'No Season save was active when this event started, so nothing was paid and the cards were not kept.'
              : e.prizePaid
                ? prize.coins || prize.packs
                  ? `Paid to your Season save ${save ?? ''}. The packs wait under Packs.`
                  : `Nothing to pay this time. Your cards are still in your Season save ${save ?? ''}.`
                : `The Season save ${save ?? ''} could not be found or written, so the prize was not paid.`}
          </p>
        </div>
      )}

      <p className="sealed-promo">
        <span className="sealed-promo__tag is-foil">Prerelease promo</span>
        {sealedPromo(e)}
      </p>

      <div className="sealed-boxes">
        <section className="sealed-box">
          <span className="sealed-box__art" style={{ backgroundImage: `url("${cards ? artFor(deck) : setArt(e.set)}")` }} />
          <div className="sealed-box__text">
            <span className="sealed-box__label">Your deck</span>
            <span className="sealed-box__name">{deck.name}</span>
            <span className="sealed-box__meta">
              {cards > 0 && (
                <span className="deck__pips">
                  {deckColors({ main: e.main, side: {}, opened: 0, packs: [], fresh: [] })
                    .slice(0, 2)
                    .map((c) => (
                      <span key={c} className={`pip pip--${c}`} />
                    ))}
                </span>
              )}
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
            <span className="sealed-box__art" style={{ backgroundImage: `url("${artFor(foe.deck)}")` }} />
            <div className="sealed-box__text">
              <span className="sealed-box__label">Opponent</span>
              <span className="sealed-box__name">{foe.deck.name}</span>
              <span className="sealed-box__meta">
                <span className="deck__pips">
                  {foe.deck.colors.map((c) => (
                    <span key={c} className={`pip pip--${c}`} />
                  ))}
                </span>
                {SKILLS[foe.bot] ?? 'Master'}
              </span>
            </div>
          </section>
        )}
      </div>

      {playing && e.seasonSaveId === null && (
        <p className="sealed-season">
          No Season save is active, so this event keeps no cards and pays no prize.
        </p>
      )}
      {playing && e.seasonSaveId !== null && !e.poolGranted && (
        <p className="sealed-season">
          Your cards could not be added to the Season save {save ?? ''}, so they stay in this event only.
        </p>
      )}
      {playing && !ready && !resumable && (
        <p className="sealed-reason">
          Your deck has {plural(cards, 'card')}; it needs {MIN_DECK} to play.
        </p>
      )}

      <div className="gauntlet__actions sealed-actions">
        {playing ? (
          confirming ? (
            <>
              <span className="gauntlet__confirm">
                Resign? The event ends and pays for {plural(e.wins, 'win')}.
              </span>
              <button
                className="btn btn--primary"
                onClick={() => update(resignSealed)}
              >
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
                {resumable ? 'Resume match' : `Play match ${matchNumber(e) + 1}`}
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
                update(leaveSealed);
                onMenu();
              }}
            >
              Done
            </button>
            <button className="btn btn--ghost" onClick={() => update(leaveSealed)}>
              New event
            </button>
          </>
        )}
      </div>
      {status === 'won' && <canvas ref={canvas} className="fx-layer" aria-hidden />}
    </div>
  );
}
