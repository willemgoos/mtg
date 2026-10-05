import { deckById, type Packet, PACKETS, packetCards, scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { useMemo, useState } from 'react';
import type { BotKind } from '../game/bot.worker.ts';
import {
  type BestOf,
  inSets,
  isOver,
  type JumpInSetup,
  type Series,
  SETS,
  type SetKey,
  score,
  scoreLine,
} from '../game/jumpInMatch.ts';
import { ruleNotes } from '../game/notes.ts';
import { HumanMade } from './HumanMade.tsx';
import { GROUPS, groupOf } from './JumpIn.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import './jumpin-lobby.css';

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const artOf = (name: string) => scryfallById.get(slug(name))?.image?.artCrop ?? '';
const byId = (id: string | null) => (id ? PACKETS.find((p) => p.id === id) : undefined);
const isRare = (name: string) =>
  ['rare', 'mythic'].includes(scryfallById.get(slug(name))?.rarity ?? '');

type Side = 'you' | 'them';
interface Slot {
  side: Side;
  i: 0 | 1;
}

/**
 * The Jump In mode's lobby: every packet in one browsable grid (by set,
 * colour or name), two slots for your deck and two for the bot's (left empty,
 * they are random), the sets both decks come from, the bot's level, and one
 * game or a best of three.
 */
export function JumpInLobby({
  setup,
  onSetup,
  series,
  resumable,
  opponents,
  onPlay,
  onContinue,
  onAbandon,
}: {
  setup: JumpInSetup;
  onSetup: (s: JumpInSetup) => void;
  /** The best of three in progress, if any. */
  series: Series | null;
  /** Its current game was left part-way and can be picked up. */
  resumable: boolean;
  opponents: { id: BotKind; name: string; blurb: string }[];
  onPlay: () => void;
  onContinue: () => void;
  onAbandon: () => void;
}) {
  const [active, setActive] = useState<Slot>(() => ({
    side: 'you',
    i: setup.you[0] && !setup.you[1] ? 1 : 0,
  }));
  const [group, setGroup] = useState<string | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<Packet | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const live = series && series.bestOf > 1 && !isOver(series) ? series : null;
  const allowed = useMemo(() => PACKETS.filter((p) => inSets(p, setup.sets)), [setup.sets]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allowed.filter(
      (p) =>
        (!group || groupOf(p).key === group) &&
        (!colors.length || p.colors.some((c) => colors.includes(c))) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.blurb.toLowerCase().includes(q) ||
          p.spells.some(([n]) => n.toLowerCase().includes(q))),
    );
  }, [allowed, group, colors, query]);

  const slots = (side: Side) => setup[side];
  /** The packet in the active slot's other half: a deck can't hold one packet twice. */
  const partner = slots(active.side)[1 - active.i];
  const put = (p: Packet) => {
    const next = [...slots(active.side)] as [string | null, string | null];
    next[active.i] = p.id;
    onSetup({ ...setup, [active.side]: next });
    setFocus(p);
    // On to the deck's other half if it's still empty.
    if (!next[1 - active.i]) setActive({ side: active.side, i: (1 - active.i) as 0 | 1 });
  };
  const clear = (s: Slot) => {
    const next = [...slots(s.side)] as [string | null, string | null];
    next[s.i] = null;
    onSetup({ ...setup, [s.side]: next });
    setActive(s);
  };
  /** Limits both decks to `sets`, emptying the slots holding a packet from elsewhere. */
  const limit = (sets: SetKey[]) => {
    const keep = (x: [string | null, string | null]) =>
      x.map((id) => {
        const p = byId(id);
        return p && inSets(p, sets) ? id : null;
      }) as [string | null, string | null];
    onSetup({ ...setup, sets, you: keep(setup.you), them: keep(setup.them) });
    setGroup(null);
  };
  const toggleSet = (k: SetKey) =>
    limit(setup.sets.includes(k) ? setup.sets.filter((x) => x !== k) : [...setup.sets, k]);
  const detail = focus ?? byId(slots(active.side)[active.i]) ?? null;

  return (
    <div className="jl">
      {live && (
        <div className="drun">
          <div
            className="drun__art"
            style={{ backgroundImage: `url("${artOf(deckById(live.you).face)}")` }}
          />
          <div className="drun__text">
            <span className="drun__state is-live">
              Best of {live.bestOf} · {scoreLine(live)}
            </span>
            <span className="drun__deck">
              {deckById(live.you).name} vs {deckById(live.them).name}
            </span>
          </div>
          <button className="hbtn hbtn--ghost" onClick={onAbandon}>
            Abandon
          </button>
          <button className="hbtn hbtn--primary" onClick={onContinue}>
            {resumable
              ? 'Resume game'
              : `Play game ${score(live).wins + score(live).losses + score(live).draws + 1}`}
          </button>
        </div>
      )}

      <div className={`jl__match ${live ? 'is-waiting' : ''}`}>
        {(['you', 'them'] as const).map((side) => (
          <div key={side} className="jl__side">
            <div className="jl__side-head">
              <span className="dsetup__label">{side === 'you' ? 'Your deck' : 'Their deck'}</span>
              <button
                className="jl__link"
                onClick={() => onSetup({ ...setup, [side]: [null, null] })}
                disabled={!slots(side).some(Boolean)}
              >
                Clear
              </button>
            </div>
            <div className="jl__slots">
              {([0, 1] as const).map((i) => (
                <SlotButton
                  key={i}
                  packet={byId(slots(side)[i])}
                  empty="Random"
                  on={active.side === side && active.i === i}
                  onClick={() => setActive({ side, i })}
                  onClear={() => clear({ side, i })}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="jl__setup">
          <div className="dsetup__field jl__sets">
            <span className="dsetup__label">Sets</span>
            <div className="dseg dseg--sm jl__sets-opts" role="group" aria-label="Sets">
              <button
                aria-pressed={!setup.sets.length}
                className={`dseg__opt ${!setup.sets.length ? 'is-on' : ''}`}
                onClick={() => limit([])}
              >
                All
              </button>
              {SETS.map((x) => (
                <button
                  key={x.key}
                  aria-pressed={setup.sets.includes(x.key)}
                  className={`dseg__opt ${setup.sets.includes(x.key) ? 'is-on' : ''}`}
                  onClick={() => toggleSet(x.key)}
                >
                  {x.name}
                </button>
              ))}
            </div>
          </div>
          <div className="dsetup__field">
            <span className="dsetup__label">Opponent</span>
            <div className="dseg dseg--sm" role="radiogroup" aria-label="Opponent">
              {opponents.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={setup.bot === o.id}
                  title={o.blurb}
                  className={`dseg__opt ${setup.bot === o.id ? 'is-on' : ''}`}
                  onClick={() => onSetup({ ...setup, bot: o.id })}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
          <div className="dsetup__field">
            <span className="dsetup__label">Format</span>
            <div className="dseg dseg--sm" role="radiogroup" aria-label="Format">
              {([1, 3] as BestOf[]).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={setup.bestOf === n}
                  className={`dseg__opt ${setup.bestOf === n ? 'is-on' : ''}`}
                  onClick={() => onSetup({ ...setup, bestOf: n })}
                >
                  Best of {n}
                </button>
              ))}
            </div>
          </div>
          <button
            className="hbtn hbtn--primary jl__play"
            disabled={!!live}
            onClick={onPlay}
          >
            Play
          </button>
        </div>
      </div>

      <div className="dfilter jl__filter" role="toolbar" aria-label="Packets">
        <button
          aria-pressed={!group}
          className={`dfilter__chip ${!group ? 'is-on' : ''}`}
          onClick={() => setGroup(null)}
        >
          All <span>{allowed.length}</span>
        </button>
        {GROUPS.map((g) => {
          const n = allowed.filter((p) => groupOf(p).key === g.key).length;
          return n ? (
            <button
              key={g.key}
              aria-pressed={group === g.key}
              className={`dfilter__chip ${group === g.key ? 'is-on' : ''}`}
              onClick={() => setGroup(group === g.key ? null : g.key)}
            >
              {g.name} <span>{n}</span>
            </button>
          ) : null;
        })}
        <span className="jl__sep" />
        {COLORS.map((c) => (
          <button
            key={c}
            aria-pressed={colors.includes(c)}
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            className={`jl__color ${colors.includes(c) ? 'is-on' : ''}`}
            style={{ '--c': `var(--mana-${c})` } as React.CSSProperties}
            onClick={() =>
              setColors(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c])
            }
          />
        ))}
        <input
          className="jl__search"
          type="search"
          placeholder="Search packets or cards"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="jl__body">
        <div className="jl__grid-wrap">
          <p className="jl__hint">
            Filling{' '}
            <strong>
              {active.side === 'you' ? 'your deck' : 'their deck'},{' '}
              {active.i === 0 ? 'first' : 'second'} half
            </strong>
            . Click a packet to put it there, or leave it empty for a random one.
          </p>
          {shown.length ? (
            <div className="dgrid jl__grid">
              {shown.map((p, i) => {
                const used = p.id === partner;
                const here = p.id === slots(active.side)[active.i];
                return (
                  <div
                    key={p.id}
                    className={`dtile jl__tile ${used ? 'is-off' : ''} ${here ? 'is-here' : ''}`}
                    style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                    onMouseEnter={() => setFocus(p)}
                  >
                    <button
                      className="dtile__main"
                      disabled={used}
                      onClick={() => put(p)}
                      onFocus={() => setFocus(p)}
                    >
                      <span
                        className="dtile__media"
                        style={{ backgroundImage: `url("${artOf(p.face)}")` }}
                      >
                        <HumanMade of={p} />
                        {used && <span className="tile__status">Other half</span>}
                      </span>
                      <span className="dtile__body">
                        <span className="dtile__row">
                          <span className="dtile__name">{p.name}</span>
                          <Pips colors={p.colors} />
                        </span>
                        <span className="dtile__meta">
                          {groupOf(p).name} · {p.blurb}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="jl__empty">No packets match.</p>
          )}
        </div>

        <aside className="jl__detail" aria-live="polite">
          {detail ? (
            <>
              <div
                className="jl__detail-art"
                style={{ backgroundImage: `url("${artOf(detail.face)}")` }}
              />
              <div className="jl__detail-head">
                <div>
                  <h3>{detail.name}</h3>
                  <p>{groupOf(detail).name}</p>
                </div>
                <Pips colors={detail.colors} />
              </div>
              <p className="jl__detail-blurb">{detail.blurb}</p>
              <ul className="jl__cards">
                {packetCards(detail).map(([name, n]) => (
                  <li
                    key={name}
                    className={isRare(name) ? 'is-rare' : ''}
                    onMouseEnter={(e) => setHover({ defId: slug(name), anchor: e.currentTarget })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span>{n}</span>
                    {name}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="jl__empty">Hover a packet to see its 20 cards.</p>
          )}
        </aside>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

function Pips({ colors }: { colors: Color[] }) {
  return (
    <span className="dpips" aria-label={colors.join('')}>
      {colors.map((c) => (
        <i key={c} style={{ background: `var(--mana-${c})` }} />
      ))}
    </span>
  );
}

function SlotButton({
  packet,
  empty,
  on,
  onClick,
  onClear,
}: {
  packet: Packet | undefined;
  empty: string;
  on: boolean;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <div className={`jl__slot ${on ? 'is-on' : ''} ${packet ? '' : 'is-empty'}`}>
      <button className="jl__slot-main" onClick={onClick} aria-pressed={on}>
        <span
          className="jl__slot-art"
          style={packet ? { backgroundImage: `url("${artOf(packet.face)}")` } : undefined}
        />
        <span className="jl__slot-text">
          <span className="jl__slot-name">{packet?.name ?? empty}</span>
          {packet ? (
            <Pips colors={packet.colors} />
          ) : (
            <span className="jl__slot-sub">Half of 20</span>
          )}
        </span>
      </button>
      {packet && (
        <button className="jl__slot-clear" onClick={onClear} aria-label={`Remove ${packet.name}`}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="m4.5 4.5 7 7m0-7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
