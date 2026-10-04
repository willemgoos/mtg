import { type Decklist, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  buySeasonPack,
  buySeasonStarter,
  claimSeasonVault,
  collectible,
  copyLimit,
  craftSeasonCard,
  isBasic,
  PACK_PRICE,
  RARITIES,
  SEASON_CARDS,
  SEASON_STARTERS,
  STARTER_PRICE,
  type Rarity,
  type SeasonPackKind,
  type SeasonSave,
} from '../game/season.ts';
import {
  BLOOMBURROW_SHEETS,
  FINAL_FANTASY_SHEETS,
  FOUNDATIONS_PACK_COUNT,
  MARVEL_SHEETS,
  REALITY_FRACTURE_SHEETS,
  SECRETS_ARCHIVE_SHEETS,
  SECRETS_SHEETS,
  STRIXHAVEN_ARCHIVE_SHEETS,
  STRIXHAVEN_SHEETS,
} from '../game/seasonPacks.ts';
import { PACK_SET_NAMES, type PackSet } from '../game/expedition.ts';
import { artFor, BLURBS } from '../game/deckArt.ts';
import { packArt } from './PackOpening.tsx';

export type Update = (change: (s: SeasonSave) => SeasonSave) => unknown;
const now = (s: SeasonSave) => Math.max(Date.now(), s.updatedAt);
export interface Props {
  save: SeasonSave;
  update: Update;
  error: string | null;
}

export const fmt = (n: number) => n.toLocaleString('en-US');
export const glowOf = (colors: readonly Color[]) =>
  colors.length ? `var(--mana-${colors[0]})` : 'var(--brass)';
const VAULT = 1000;

/* ------------------------------------------------------------- primitives */

export function Modal({
  title,
  wide,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`smodal ${wide ? 'smodal--wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="smodal__body">
        <header className="smodal__head">
          <h2>{title}</h2>
          <button className="smodal__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function CoinIcon() {
  return (
    <svg className="coin" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="url(#coin-g)" stroke="#6b4f1d" strokeWidth="1" />
      <circle cx="10" cy="10" r="6" fill="none" stroke="#7a5a20" strokeWidth="1" opacity="0.6" />
      <path d="M10 6.2 11.2 9 14 10l-2.8 1-1.2 2.8L8.8 11 6 10l2.8-1z" fill="#7a5a20" />
      <defs>
        <radialGradient id="coin-g" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="0.5" stopColor="#f0c35e" />
          <stop offset="1" stopColor="#a8741f" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Price({ n }: { n: number }) {
  return (
    <span className="price">
      <CoinIcon />
      {fmt(n)}
    </span>
  );
}

export function WildcardIcon({ rarity }: { rarity: Rarity }) {
  return <span className={`wcicon wcicon--${rarity}`} aria-hidden />;
}

/** The currencies strip in the Season bar: coins, four wildcards, Vault. */
export function Currencies({ save }: { save: SeasonSave }) {
  return (
    <div className="scur" aria-label="Currencies">
      <span className="scur__item scur__item--coins" title="Coins">
        <CoinIcon />
        <strong>{fmt(save.coins)}</strong>
      </span>
      <span className="scur__wild">
        {RARITIES.map((r) => (
          <span key={r} className="scur__item" title={`${r} wildcards`}>
            <WildcardIcon rarity={r} />
            <strong>{save.wildcards[r]}</strong>
            <span className="sr-only"> {r} wildcards</span>
          </span>
        ))}
      </span>
      <span
        className="scur__item scur__item--vault"
        title={`Vault: ${fmt(save.vaultPoints)} of 1,000`}
      >
        <span
          className="vaultring"
          style={{ '--p': Math.min(1, save.vaultPoints / VAULT) } as CSSProperties}
        />
        <strong>{Math.floor(Math.min(1, save.vaultPoints / VAULT) * 100)}%</strong>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- rewards */

function Track({
  icon,
  label,
  value,
  max,
  hint,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  max: number;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="strack">
      {icon}
      <div className="strack__main">
        <div className="strack__row">
          <span className="strack__label">{label}</span>
          <span className="strack__value">
            {fmt(value)}/{fmt(max)}
          </span>
        </div>
        <div
          className="strack__bar"
          role="progressbar"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemax={max}
        >
          <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
        <span className="strack__hint">{hint}</span>
      </div>
      {action}
    </div>
  );
}

/** Wildcard tracks and the Vault: the things packs build toward. */
export function RewardTracks({ save, update }: Omit<Props, 'error'>) {
  const mythic = save.tracks.rareRewards === 4;
  const left = (n: number) => `${6 - n} more ${6 - n === 1 ? 'pack' : 'packs'}`;
  return (
    <section className="spanel" aria-label="Wildcards and Vault">
      <h3 className="spanel__title">Pack rewards</h3>
      <Track
        icon={<WildcardIcon rarity="uncommon" />}
        label="Uncommon wildcard"
        value={save.tracks.uncommon}
        max={6}
        hint={left(save.tracks.uncommon)}
      />
      <Track
        icon={<WildcardIcon rarity={mythic ? 'mythic' : 'rare'} />}
        label={`${mythic ? 'Mythic' : 'Rare'} wildcard`}
        value={save.tracks.rareMythic}
        max={6}
        hint={`${left(save.tracks.rareMythic)}${mythic ? '' : ` · mythic in ${4 - save.tracks.rareRewards} more`}`}
      />
      <Track
        icon={
          <span
            className="vaultring"
            style={{ '--p': Math.min(1, save.vaultPoints / VAULT) } as CSSProperties}
          />
        }
        label="Vault"
        value={save.vaultPoints}
        max={VAULT}
        hint="Duplicate commons +1, uncommons +3"
        action={
          save.vaultPoints >= VAULT && (
            <button
              className="hbtn hbtn--primary strack__claim"
              onClick={() => update((s) => claimSeasonVault(s, now(s)))}
            >
              Claim Vault
            </button>
          )
        }
      />
      <details className="shelp">
        <summary>How wildcards work</summary>
        <p>
          One wildcard crafts one card of its rarity. Packs can contain wildcards, and every six
          packs you open earns an uncommon and a rare wildcard (every fifth of those is mythic).
        </p>
        <p>
          Extra copies beyond four fill the Vault. At 1,000 points it opens for 3 uncommon, 2 rare
          and 1 mythic wildcard. Extra rares and mythics pay 20 and 40 coins.
        </p>
      </details>
    </section>
  );
}

/* -------------------------------------------------------------- the store */

/** The boosters on sale: Foundations, Bloomburrow, Marvel Super Heroes and Final Fantasy. */
const BOOSTERS: { kind: SeasonPackKind; set: PackSet; title: string; count: number }[] = [
  { kind: 'foundations', set: 'fdn', title: 'Foundations', count: FOUNDATIONS_PACK_COUNT },
  {
    kind: 'bloomburrow',
    set: 'blb',
    title: 'Bloomburrow',
    count: Object.values(BLOOMBURROW_SHEETS).reduce((n, sheet) => n + sheet.length, 0),
  },
  {
    kind: 'marvel',
    set: 'msh',
    title: 'Marvel Super Heroes',
    count: Object.values(MARVEL_SHEETS).reduce((n, sheet) => n + sheet.length, 0),
  },
  {
    kind: 'strixhaven',
    set: 'stx',
    title: 'Strixhaven',
    count: [STRIXHAVEN_SHEETS, STRIXHAVEN_ARCHIVE_SHEETS]
      .flatMap((s) => Object.values(s))
      .reduce((n, sheet) => n + sheet.length, 0),
  },
  {
    kind: 'secrets',
    set: 'sos',
    title: 'Secrets of Strixhaven',
    count: [SECRETS_SHEETS, SECRETS_ARCHIVE_SHEETS]
      .flatMap((s) => Object.values(s))
      .reduce((n, sheet) => n + sheet.length, 0),
  },
  {
    kind: 'finalFantasy',
    set: 'fin',
    title: 'Final Fantasy',
    count: Object.values(FINAL_FANTASY_SHEETS).reduce((n, sheet) => n + sheet.length, 0),
  },
  {
    kind: 'realityFracture',
    set: 'fra',
    title: 'Reality Fracture',
    count: Object.values(REALITY_FRACTURE_SHEETS).reduce((n, sheet) => n + sheet.length, 0),
  },
];

/** The set of a pack kind (for its art). */
export const packSetOfKind = (kind: SeasonPackKind): PackSet =>
  kind === 'bloomburrow'
    ? 'blb'
    : kind === 'marvel'
      ? 'msh'
      : kind === 'finalFantasy'
        ? 'fin'
        : kind === 'strixhaven'
          ? 'stx'
          : kind === 'secrets'
            ? 'sos'
            : kind === 'realityFracture'
              ? 'fra'
              : 'fdn';

export function Booster({
  onClick,
  label,
  small,
  count,
  set = 'fdn',
}: {
  onClick?: () => void;
  label: string;
  small?: boolean;
  count?: number;
  set?: PackSet;
}) {
  return (
    <div className={`sbooster ${small ? 'sbooster--small' : ''}`}>
      <button
        className="booster"
        style={
          {
            '--art': `url("${packArt({ kind: 'booster' }, set)}")`,
            '--glow': 'var(--brass)',
          } as CSSProperties
        }
        onClick={onClick}
        disabled={!onClick}
        aria-label={label}
      >
        <span className="booster__crimp booster__crimp--top" />
        <span className="booster__art" />
        <span className="booster__foil" />
        <span className="booster__label">
          <span className="booster__set">{PACK_SET_NAMES[set]}</span>
          <span className="booster__kind">Booster</span>
        </span>
        <span className="booster__crimp booster__crimp--bottom" />
      </button>
      {count !== undefined && count > 0 && <span className="sbooster__count">×{count}</span>}
    </div>
  );
}

export function SeasonStore({
  save,
  update,
  error,
  onOpenPacks,
}: Props & { onOpenPacks: () => void }) {
  const [starter, setStarter] = useState<string | null>(null);
  const [bought, setBought] = useState<Record<SeasonPackKind, number>>({
    foundations: 0,
    bloomburrow: 0,
    marvel: 0,
    strixhaven: 0,
    secrets: 0,
    finalFantasy: 0,
    realityFracture: 0,
  });
  const list = SEASON_STARTERS.find((d) => d.id === starter);
  const buy = (n: number, kind: SeasonPackKind) => {
    let done = 0;
    for (let i = 0; i < n; i++) if (update((s) => buySeasonPack(s, now(s), kind))) done++;
    if (done) setBought((b) => ({ ...b, [kind]: b[kind] + done }));
  };
  return (
    <div className="sstore">
      {BOOSTERS.map((b) => (
        <section key={b.kind} className="sfeature sstore__pack">
          <div
            className="sfeature__wash"
            style={{ backgroundImage: `url("${packArt({ kind: 'booster' }, b.set)}")` }}
          />
          <Booster label={`${b.title} booster`} set={b.set} />
          <div className="sstore__copy">
            <span className="stag">Booster</span>
            <h2>{b.title}</h2>
            <p>
              Eight cards: five commons, two uncommons and one rare or mythic. Any slot can turn
              into a wildcard.
            </p>
            <div className="sstore__buy">
              <button
                className="hbtn hbtn--primary hbtn--lg"
                disabled={save.coins < PACK_PRICE}
                onClick={() => buy(1, b.kind)}
              >
                Buy 1 · <Price n={PACK_PRICE} />
              </button>
              <button
                className="hbtn hbtn--ghost"
                disabled={save.coins < PACK_PRICE * 3}
                onClick={() => buy(3, b.kind)}
              >
                Buy 3 · <Price n={PACK_PRICE * 3} />
              </button>
            </div>
            {bought[b.kind] > 0 && (
              <p className="sstore__bought" role="status">
                {bought[b.kind]} {bought[b.kind] === 1 ? 'pack' : 'packs'} added.{' '}
                <button className="slink" onClick={onOpenPacks}>
                  Open now
                </button>
              </p>
            )}
            <p className="sfine">{b.count} regular pack cards. Wildcard odds approximate Arena.</p>
          </div>
        </section>
      ))}

      <div className="ssection">
        <h2>Starter decks</h2>
        <span className="ssection__aside">
          Complete 60-card decks · <Price n={STARTER_PRICE} /> each, once per season
        </span>
      </div>
      <div className="sdecks">
        {SEASON_STARTERS.map((d, i) => {
          const owned = save.purchasedStarters.includes(d.id);
          return (
            <DeckTile
              key={d.id}
              deck={d}
              index={i}
              sub={BLURBS[d.id] ?? ''}
              badge={
                owned ? (
                  <span className="sbadge sbadge--owned">Owned</span>
                ) : (
                  <span className="sbadge">
                    <Price n={STARTER_PRICE} />
                  </span>
                )
              }
              onClick={() => setStarter(d.id)}
              label={`View ${d.name}`}
            />
          );
        })}
      </div>
      {list && (
        <Modal title={list.name} wide onClose={() => setStarter(null)}>
          <div className="sstarter">
            <img className="sstarter__art" src={artFor(list)} alt="" />
            <div>
              <p>{BLURBS[list.id]}</p>
              <p className="sfine">
                Adds every card to your collection and the deck to your decks. Copies beyond four
                become Vault points, or 20 and 40 coins for rares and mythics.
              </p>
              {error && (
                <p role="alert" className="swarn">
                  {error}
                </p>
              )}
              <button
                className="hbtn hbtn--primary hbtn--lg"
                disabled={save.purchasedStarters.includes(list.id) || save.coins < STARTER_PRICE}
                onClick={() => {
                  if (update((s) => buySeasonStarter(s, list.id, now(s)))) setStarter(null);
                }}
              >
                {save.purchasedStarters.includes(list.id) ? (
                  'Already owned'
                ) : (
                  <>
                    Buy deck · <Price n={STARTER_PRICE} />
                  </>
                )}
              </button>
            </div>
          </div>
          <ul className="slist">
            {list.cards.map(([name, n]) => {
              const id = slug(name);
              const have = save.collection[id] ?? 0;
              return (
                <li key={name}>
                  <span className="slist__n">{n}</span>
                  <span className="slist__name">{name}</span>
                  <span
                    className={`slist__own ${!isBasic(id) && have >= Math.min(4, copyLimit(id)) ? 'is-full' : ''}`}
                  >
                    {isBasic(id) ? 'basic' : `${have} owned`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
}

export function DeckTile({
  deck,
  index,
  sub,
  badge,
  selected,
  label,
  onClick,
}: {
  deck: Decklist;
  index: number;
  sub: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`stile ${selected ? 'is-selected' : ''}`}
      style={
        {
          '--art': `url("${artFor(deck)}")`,
          '--glow': glowOf(deck.colors),
          '--i': index,
        } as CSSProperties
      }
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
    >
      <span className="stile__art" />
      {badge && <span className="stile__badge">{badge}</span>}
      <span className="spip-row">
        {deck.colors.map((c) => (
          <span key={c} className={`pip pip--${c}`} />
        ))}
      </span>
      <span className="stile__name">{deck.name}</span>
      <span className="stile__sub">{sub}</span>
    </button>
  );
}

/* --------------------------------------------------------------- packs */

export function SeasonPacks({
  save,
  update,
  onOpen,
  onViewLast,
  onStore,
}: Omit<Props, 'error'> & { onOpen: () => void; onViewLast: () => void; onStore: () => void }) {
  const n = save.packs.length;
  // The next pack to open, by its set.
  const set = packSetOfKind(save.packs[0]?.kind ?? 'foundations');
  const title = `${PACK_SET_NAMES[set]} booster`;
  return (
    <div className="spacks">
      <section className="sfeature spacks__stage">
        <div
          className="sfeature__wash"
          style={{ backgroundImage: `url("${packArt({ kind: 'booster' }, set)}")` }}
        />
        {n ? (
          <>
            <Booster label={`Open a ${title}`} onClick={onOpen} count={n} set={set} />
            <div className="spacks__copy">
              <span className="stag">{n === 1 ? '1 unopened pack' : `${n} unopened packs`}</span>
              <h2>{title}</h2>
              <p>
                Click the pack or the button to open it. Everything inside is saved to your
                collection first.
              </p>
              <div className="sstore__buy">
                <button className="hbtn hbtn--primary hbtn--lg" onClick={onOpen}>
                  Open pack
                </button>
                {save.lastPack && (
                  <button className="hbtn hbtn--ghost" onClick={onViewLast}>
                    View last pack
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="sempty">
            <Booster label="No packs" small />
            <h2>No packs to open</h2>
            <p>Packs cost {PACK_PRICE} coins in the store. Win matches to earn coins.</p>
            <div className="sstore__buy">
              <button className="hbtn hbtn--primary" onClick={onStore}>
                Go to store
              </button>
              {save.lastPack && (
                <button className="hbtn hbtn--ghost" onClick={onViewLast}>
                  View last pack
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      <RewardTracks save={save} update={update} />
      {save.lastPack && (
        <section className="slast">
          <div className="ssection">
            <h2>Last pack</h2>
            <button className="slink" onClick={onViewLast}>
              Replay the reveal
            </button>
          </div>
          <div className="slast__cards">
            {save.lastPack.rewards.map((r, i) => {
              const c = r.kind === 'card' ? collectible(r.cardId) : null;
              return c?.image ? (
                <img key={i} src={c.image.normal} alt={c.name} loading="lazy" />
              ) : (
                <span
                  key={i}
                  className={`wildcard wildcard--${r.kind === 'wildcard' ? r.rarity : 'common'}`}
                >
                  <span className="wildcard__gem" />
                  <span className="wildcard__label">
                    {r.kind === 'wildcard' ? r.rarity : c?.name}
                    <small>Wildcard</small>
                  </span>
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Owned cards out of the whole pool, per rarity. */
export function CollectionProgress({ save, onOpen }: { save: SeasonSave; onOpen: () => void }) {
  const rows = RARITIES.map((r) => {
    const ids = [...SEASON_CARDS].filter(([id, c]) => c.rarity === r && !isBasic(id));
    return {
      r,
      total: ids.length,
      owned: ids.filter(([id]) => (save.collection[id] ?? 0) > 0).length,
    };
  });
  const owned = rows.reduce((n, x) => n + x.owned, 0);
  const total = rows.reduce((n, x) => n + x.total, 0);
  return (
    <section className="spanel scolprog">
      <div className="scolprog__head">
        <span className="spanel__title">Collection</span>
        <button className="slink" onClick={onOpen}>
          View
        </button>
      </div>
      <strong className="scolprog__big">
        {owned}
        <small>/{total} cards</small>
      </strong>
      {rows.map(({ r, owned, total }) => (
        <div key={r} className="scolprog__row">
          <WildcardIcon rarity={r} />
          <span className="scolprog__name">{r}</span>
          <span className="strack__bar">
            <span style={{ width: `${total ? (owned / total) * 100 : 0}%` }} />
          </span>
          <span className="strack__value">
            {owned}/{total}
          </span>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------ collection */

const COLORS: [string, string][] = [
  ['W', 'White'],
  ['U', 'Blue'],
  ['B', 'Black'],
  ['R', 'Red'],
  ['G', 'Green'],
  ['C', 'Colorless'],
];
const ORDER = 'WUBRG';
/** Arena's collection order: mono colours, then gold, colourless, lands; then mana value. */
const group = (c: { colors: string[]; typeLine: string }) =>
  c.typeLine.includes('Land')
    ? 8
    : c.colors.length > 1
      ? 6
      : c.colors.length
        ? ORDER.indexOf(c.colors[0]!)
        : 7;
const manaValue = (cost: string) =>
  [...cost.matchAll(/{([^}]+)}/g)].reduce(
    (n, [, sym]) => n + (/^d+$/.test(sym!) ? Number(sym) : sym === 'X' ? 0 : 1),
    0,
  );
const toggle = <T,>(set: ReadonlySet<T>, v: T) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

export function SeasonCrafting(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="hbtn hbtn--ghost" onClick={() => setOpen(true)}>
        Craft cards
      </button>
      {open && (
        <Modal title="Craft cards" wide onClose={() => setOpen(false)}>
          <SeasonCollection {...props} compact />
        </Modal>
      )}
    </>
  );
}

function OwnedPips({ id, count }: { id: string; count: number }) {
  const limit = copyLimit(id);
  if (!Number.isFinite(limit)) return <span className="spips spips--inf">{count} owned</span>;
  return (
    <span className="spips" aria-label={`${count} of ${limit} owned`}>
      {Array.from({ length: limit }, (_, i) => (
        <span key={i} className={i < count ? 'is-on' : ''} />
      ))}
    </span>
  );
}

export function SeasonCollection({ save, update, error, compact }: Props & { compact?: boolean }) {
  const start = compact ? 'all' : 'owned';
  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState<'all' | 'owned' | 'missing'>(start);
  const [rarities, setRarities] = useState<ReadonlySet<string>>(new Set());
  const [colors, setColors] = useState<ReadonlySet<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const all = useMemo(
    () =>
      [...SEASON_CARDS]
        .filter(([id]) => !isBasic(id))
        .sort(
          ([, a], [, b]) =>
            group(a) - group(b) ||
            manaValue(a.manaCost) - manaValue(b.manaCost) ||
            a.name.localeCompare(b.name),
        ),
    [],
  );
  const q = query.trim().toLowerCase();
  const cards = all.filter(
    ([id, c]) =>
      (!rarities.size || rarities.has(c.rarity)) &&
      (!colors.size || (c.colors.length ? c.colors.some((x) => colors.has(x)) : colors.has('C'))) &&
      (ownership === 'all' || (ownership === 'owned') === (save.collection[id] ?? 0) > 0) &&
      (!q || `${c.name} ${c.typeLine} ${c.oracleText}`.toLowerCase().includes(q)),
  );
  const owned = all.filter(([id]) => (save.collection[id] ?? 0) > 0).length;
  const card = chosen ? collectible(chosen) : null;
  const count = chosen ? (save.collection[chosen] ?? 0) : 0;
  const filtered = q || rarities.size || colors.size || ownership !== start;
  return (
    <section className={`scoll ${compact ? 'scoll--compact' : ''}`} aria-label="Collection cards">
      <div className="sfilters">
        <input
          className="sfilters__search"
          type="search"
          aria-label="Search cards"
          placeholder="Search name, type or text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="sfilters__group" role="group" aria-label="Colors">
          {COLORS.map(([id, name]) => (
            <button
              key={id}
              className={`mana-toggle mana-toggle--${id}`}
              aria-pressed={colors.has(id)}
              aria-label={name}
              title={name}
              onClick={() => setColors((s) => toggle(s, id))}
            />
          ))}
        </div>
        <div className="sfilters__group" role="group" aria-label="Rarity">
          {RARITIES.map((r) => (
            <button
              key={r}
              className={`chip chip--${r}`}
              aria-pressed={rarities.has(r)}
              onClick={() => setRarities((s) => toggle(s, r))}
            >
              <WildcardIcon rarity={r} />
              {r}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Ownership">
          {(['all', 'owned', 'missing'] as const).map((o) => (
            <button key={o} aria-pressed={ownership === o} onClick={() => setOwnership(o)}>
              {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}
            </button>
          ))}
        </div>
        {filtered && (
          <button
            className="slink"
            onClick={() => {
              setQuery('');
              setRarities(new Set());
              setColors(new Set());
              setOwnership(start);
            }}
          >
            Clear
          </button>
        )}
        <span className="sfilters__count">
          {filtered ? `${cards.length} shown · ` : ''}
          {owned}/{all.length} collected
        </span>
      </div>
      {notice && (
        <p className="stoast" role="status">
          {notice}
        </p>
      )}
      <div className="sgrid">
        {cards.map(([id, c]) => {
          const n = save.collection[id] ?? 0;
          return (
            <button
              key={id}
              className={`scard ${n ? '' : 'is-missing'}`}
              aria-label={`${c.name}, ${c.rarity}, ${n} owned`}
              onClick={() => {
                setChosen(id);
                setNotice('');
              }}
            >
              {c.image ? (
                <img loading="lazy" src={c.image.normal} alt="" draggable={false} />
              ) : (
                <span className="scard__name">{c.name}</span>
              )}
              <OwnedPips id={id} count={n} />
            </button>
          );
        })}
      </div>
      {!cards.length && <p className="sempty-line">No cards match these filters.</p>}
      {card && chosen && (
        <Modal title={card.name} onClose={() => setChosen(null)}>
          <div className="scraft">
            {card.image && <img src={card.image.normal} alt={card.name} />}
            <div className="scraft__info">
              <span className={`scraft__rarity scraft__rarity--${card.rarity}`}>
                <WildcardIcon rarity={card.rarity as Rarity} />
                {card.rarity}
              </span>
              <p className="scraft__type">{card.typeLine}</p>
              <p className="scraft__oracle">{card.oracleText}</p>
              <div className="scraft__own">
                <OwnedPips id={chosen} count={count} />
                <span>{count} owned</span>
              </div>
              {error && (
                <p role="alert" className="swarn">
                  {error}
                </p>
              )}
              <button
                className="hbtn hbtn--primary hbtn--lg"
                disabled={count >= copyLimit(chosen) || save.wildcards[card.rarity as Rarity] < 1}
                onClick={() => {
                  const id = chosen;
                  if (update((s) => craftSeasonCard(s, id, now(s)))) {
                    setNotice(`Crafted ${card.name}.`);
                    setChosen(null);
                  }
                }}
              >
                {count >= copyLimit(chosen) ? 'All copies owned' : 'Craft'}
                {count < copyLimit(chosen) && (
                  <span className="scraft__cost">
                    <WildcardIcon rarity={card.rarity as Rarity} />1
                  </span>
                )}
              </button>
              <span className="sfine">
                You have {save.wildcards[card.rarity as Rarity]} {card.rarity}{' '}
                {save.wildcards[card.rarity as Rarity] === 1 ? 'wildcard' : 'wildcards'}.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
