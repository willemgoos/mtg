import { slug } from '@mtg/cards';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  buySeasonPack,
  buySeasonStarter,
  claimSeasonVault,
  collectible,
  copyLimit,
  craftSeasonCard,
  isBasic,
  openSeasonPack,
  PACK_PRICE,
  RARITIES,
  SEASON_CARDS,
  SEASON_STARTERS,
  STARTER_PRICE,
  type Rarity,
  type SeasonSave,
} from '../game/season.ts';
import { FOUNDATIONS_PACK_COUNT, generateFoundationsPack } from '../game/seasonPacks.ts';

type Update = (change: (s: SeasonSave) => SeasonSave) => unknown;
const now = (s: SeasonSave) => Math.max(Date.now(), s.updatedAt);
interface Props {
  save: SeasonSave;
  update: Update;
  error: string | null;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
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
      className="season-dialog season-economy-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <div className="season-section">
        <h2>{title}</h2>
        <button className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Balances({ save, update }: Props) {
  return (
    <section className="season-panel" aria-label="Wildcards and Vault">
      <div className="season-balances">
        {RARITIES.map((r) => (
          <span key={r} className={`season-rarity season-rarity--${r}`}>
            <strong>{save.wildcards[r]}</strong> {r} wildcards
          </span>
        ))}
      </div>
      <div className="season-tracks">
        <label>
          Uncommon wildcard · {save.tracks.uncommon}/6{' '}
          <progress value={save.tracks.uncommon} max={6} />
        </label>
        <label>
          {save.tracks.rareRewards === 4 ? 'Mythic' : 'Rare'} wildcard · {save.tracks.rareMythic}/6{' '}
          <progress value={save.tracks.rareMythic} max={6} />
        </label>
        <div>
          Vault · {save.vaultPoints}/1,000 points{' '}
          <button
            className="btn btn--ghost"
            disabled={save.vaultPoints < 1000}
            onClick={() => update((s) => claimSeasonVault(s, now(s)))}
          >
            Claim Vault
          </button>
        </div>
      </div>
      <details>
        <summary>How wildcards work</summary>
        <p>
          Packs can contain wildcards. Every six opened packs earns an uncommon wildcard and a rare
          or mythic wildcard from the tracks. The high-rarity track awards four rares, then one
          mythic. One matching wildcard crafts one card.
        </p>
        <p>
          Extra commons and uncommons become 1 and 3 Vault points. Claim 1,000 points for 3
          uncommon, 2 rare, and 1 mythic wildcards. Overflow stays in your Vault.
        </p>
      </details>
    </section>
  );
}

export function SeasonEconomy(props: Props) {
  const { save, update, error } = props;
  const [tab, setTab] = useState('shop');
  const [starter, setStarter] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const list = SEASON_STARTERS.find((d) => d.id === starter);
  return (
    <section className="season-economy" aria-label="Season economy">
      <div className="season-section">
        <h2>Collection & shop</h2>
        <div className="season-actions" role="group" aria-label="Economy view">
          {['shop', 'packs', 'collection'].map((t) => (
            <button
              className="btn btn--ghost"
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'packs'
                ? `Packs (${save.packs.length})`
                : t === 'shop'
                  ? 'Shop'
                  : 'Collection'}
            </button>
          ))}
        </div>
      </div>
      <Balances {...props} />
      {tab === 'shop' && (
        <>
          <article className="season-panel season-shop-pack">
            <div>
              <h3>Foundations booster</h3>
              <p>
                Eight rewards: five common, two uncommon, one rare or mythic. Wildcards can replace
                cards.
              </p>
              <p className="season-warning">
                Prototype pool · {FOUNDATIONS_PACK_COUNT} supported regular pack cards. Special
                Guests are not included yet. Wildcard odds approximate Arena.
              </p>
            </div>
            <button
              className="btn btn--primary"
              disabled={save.coins < PACK_PRICE}
              onClick={() => update((s) => buySeasonPack(s, now(s)))}
            >
              Buy pack · {PACK_PRICE} coins
            </button>
          </article>
          <h3>Starter decks</h3>
          <div className="season-starter-shop">
            {SEASON_STARTERS.map((d) => (
              <article className="season-panel" key={d.id}>
                <h3>{d.name}</h3>
                <p>
                  {save.purchasedStarters.includes(d.id)
                    ? 'Owned'
                    : `${STARTER_PRICE.toLocaleString()} coins · one purchase per save`}
                </p>
                <button className="btn btn--ghost" onClick={() => setStarter(d.id)}>
                  View {d.name}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === 'packs' && (
        <section className="season-panel">
          <h3>Your packs</h3>
          <p>{save.packs.length} unopened Foundations boosters</p>
          <div className="season-actions">
            <button
              className="btn btn--primary"
              disabled={!save.packs.length}
              onClick={() => {
                const id = save.packs[0]!.id;
                if (update((s) => openSeasonPack(s, id, generateFoundationsPack, now(s))))
                  setReveal(true);
              }}
            >
              Open next pack
            </button>
            {save.lastPack && (
              <button className="btn btn--ghost" onClick={() => setReveal(true)}>
                View last pack
              </button>
            )}
          </div>
          <p>All eight rewards are yours. Opening saves them before the reveal.</p>
        </section>
      )}
      {tab === 'collection' && <SeasonCollection {...props} />}
      {list && (
        <Modal title={list.name} onClose={() => setStarter(null)}>
          <p>
            Full deck · {STARTER_PRICE.toLocaleString()} coins. Cards are shared across your decks.
          </p>
          <ul>
            {list.cards.map(([name, n]) => (
              <li key={name}>
                {n} × {name}{' '}
                {isBasic(slug(name))
                  ? '(unlimited)'
                  : `· ${save.collection[slug(name)] ?? 0} owned`}
              </li>
            ))}
          </ul>
          <p>
            Extra copies convert to Vault points or 20/40 coins for rares/mythics. Starter contents
            are fixed and have no duplicate protection.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="btn btn--primary"
            disabled={save.purchasedStarters.includes(list.id) || save.coins < STARTER_PRICE}
            onClick={() => {
              if (update((s) => buySeasonStarter(s, list.id, now(s)))) setStarter(null);
            }}
          >
            {save.purchasedStarters.includes(list.id)
              ? 'Already owned'
              : `Buy ${list.name} · ${STARTER_PRICE.toLocaleString()} coins`}
          </button>
        </Modal>
      )}
      {reveal && save.lastPack && (
        <PackReveal key={save.lastPack.packId} save={save} onClose={() => setReveal(false)} />
      )}
    </section>
  );
}

export function SeasonCrafting(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--ghost" onClick={() => setOpen(true)}>
        Craft cards
      </button>
      {open && (
        <Modal title="Craft cards" onClose={() => setOpen(false)}>
          <SeasonCollection {...props} />
        </Modal>
      )}
    </>
  );
}

function SeasonCollection({ save, update, error }: Props) {
  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [color, setColor] = useState('all');
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const cards = [...SEASON_CARDS]
    .filter(
      ([id, c]) =>
        !isBasic(id) &&
        (rarity === 'all' || c.rarity === rarity) &&
        (color === 'all' || (color === 'C' ? !c.colors.length : c.colors.includes(color))) &&
        (ownership === 'all' ||
          (ownership === 'owned' ? (save.collection[id] ?? 0) > 0 : !(save.collection[id] ?? 0))) &&
        `${c.name} ${c.typeLine} ${c.oracleText}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(cards.length / 24) - 1));
  const card = chosen ? collectible(chosen) : null;
  const count = chosen ? (save.collection[chosen] ?? 0) : 0;
  return (
    <section aria-label="Collection cards">
      <div className="season-filters">
        <label>
          Search cards
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Ownership
          <select
            value={ownership}
            onChange={(e) => {
              setOwnership(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All cards</option>
            <option value="owned">Owned</option>
            <option value="unowned">Unowned</option>
          </select>
        </label>
        <label>
          Rarity
          <select
            value={rarity}
            onChange={(e) => {
              setRarity(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All rarities</option>
            {RARITIES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Color
          <select
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All colors</option>
            {[
              ['W', 'White'],
              ['U', 'Blue'],
              ['B', 'Black'],
              ['R', 'Red'],
              ['G', 'Green'],
              ['C', 'Colorless'],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>{cards.length} supported collectible cards · Basic lands are unlimited.</p>
      {notice && <p role="status">{notice}</p>}
      <div className="season-collection-grid">
        {cards.slice(currentPage * 24, currentPage * 24 + 24).map(([id, c]) => (
          <button
            key={id}
            className={`season-collection-card season-rarity--${c.rarity}`}
            onClick={() => {
              setChosen(id);
              setNotice('');
            }}
          >
            {c.image && <img loading="lazy" src={c.image.normal} alt="" />}
            <strong>{c.name}</strong>
            <span>
              {c.rarity} · {save.collection[id] ?? 0}/
              {Number.isFinite(copyLimit(id)) ? copyLimit(id) : '∞'} owned
            </span>
          </button>
        ))}
      </div>
      {!cards.length && <p>No cards match these filters.</p>}
      <div className="season-actions season-pagination">
        <button
          className="btn btn--ghost"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {Math.max(1, Math.ceil(cards.length / 24))}
        </span>
        <button
          className="btn btn--ghost"
          disabled={(currentPage + 1) * 24 >= cards.length}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
      {card && chosen && (
        <Modal title={card.name} onClose={() => setChosen(null)}>
          <div className="season-craft-card">
            {card.image && <img src={card.image.normal} alt={card.name} />}
            <div>
              <p>{card.typeLine}</p>
              <p className="season-oracle">{card.oracleText}</p>
              <p>
                {count} owned · {save.wildcards[card.rarity as Rarity]} {card.rarity} wildcards
                available
              </p>
              <p>Cost: 1 {card.rarity} wildcard for 1 copy.</p>
              {error && <p role="alert">{error}</p>}
              <button
                className="btn btn--primary"
                disabled={count >= copyLimit(chosen) || save.wildcards[card.rarity as Rarity] < 1}
                onClick={() => {
                  const id = chosen;
                  if (update((s) => craftSeasonCard(s, id, now(s)))) {
                    setNotice(`Crafted ${card.name}.`);
                    setChosen(null);
                  }
                }}
              >
                {count >= copyLimit(chosen) ? 'Maximum copies owned' : `Craft ${card.name}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function PackReveal({ save, onClose }: { save: SeasonSave; onClose: () => void }) {
  const receipt = save.lastPack!;
  const [flipped, setFlipped] = useState<number[]>([]);
  return (
    <Modal title={`Foundations pack #${receipt.packId}`} onClose={onClose}>
      <p>All rewards have been added to your collection. Flip each card or reveal all.</p>
      <button
        className="btn btn--ghost"
        onClick={() => setFlipped(receipt.rewards.map((_, i) => i))}
      >
        Reveal all
      </button>
      <div className="season-rewards">
        {receipt.rewards.map((r, i) => {
          const up = flipped.includes(i);
          const c = r.kind === 'card' ? collectible(r.cardId) : null;
          const rarity = c?.rarity ?? (r.kind === 'wildcard' ? r.rarity : 'common');
          const name = c?.name ?? `${rarity} wildcard`;
          return (
            <button
              key={i}
              className={`season-reward season-rarity--${rarity} ${up ? 'is-revealed' : ''}`}
              aria-label={up ? name : `Reveal reward ${i + 1}`}
              onClick={() => setFlipped((s) => (s.includes(i) ? s : [...s, i]))}
            >
              {up ? (
                <>
                  {c?.image ? (
                    <img src={c.image.normal} alt="" />
                  ) : (
                    <span className="season-wildcard">
                      ✦<br />
                      {rarity}
                      <br />
                      wildcard
                    </span>
                  )}
                  <strong>{name}</strong>
                </>
              ) : (
                <span className="season-card-back">
                  ✦<br />
                  Reveal
                </span>
              )}
            </button>
          );
        })}
      </div>
      {receipt.bonus && (
        <div role="status">
          <p>
            Duplicate conversions: +{receipt.bonus.coins} coins · +{receipt.bonus.vaultPoints} Vault
            points
          </p>
          {RARITIES.filter((r) => receipt.bonus!.tracks[r] > 0).map((r) => (
            <p key={r}>
              Track reward: +{receipt.bonus!.tracks[r]} {r} wildcard
            </p>
          ))}
        </div>
      )}
    </Modal>
  );
}
