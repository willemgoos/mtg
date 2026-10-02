import { cardDb } from '@mtg/cards';
import {
  type CardDefId,
  type CardDefinition,
  type GameObject,
  type GameState,
  getCharacteristics,
  type ObjectId,
  type PlayerId,
  type Step,
} from '@mtg/engine';
import { useEffect } from 'react';
import { Card, CardBack, type CardMark, cardImage, type HoverFn } from './Card.tsx';
import { LifeCounter } from './LifeCounter.tsx';

export interface ZoneHandlers {
  markOf: (id: ObjectId) => CardMark;
  onCard: (id: ObjectId) => void;
  onHover: HoverFn;
  /** Starts a possible drag of a hand card. */
  onHandPointerDown?: (id: ObjectId, e: React.PointerEvent) => void;
  /** The hand card currently being dragged. */
  dragging?: ObjectId | null;
}

/** Small labels on a permanent: a Class's level and named counters (stun, finality, stash). */
function cardTags(o: GameObject, def: CardDefinition | undefined): string[] {
  const tags: string[] = [];
  if (def?.subtypes.includes('Class')) tags.push(`Level ${o.level ?? 1}`);
  for (const [name, n] of Object.entries(o.counters ?? {}))
    if (n > 0) tags.push(`${name[0]!.toUpperCase()}${name.slice(1)}${n > 1 ? ` ${n}` : ''}`);
  return tags;
}

const isLand = (s: GameState, id: ObjectId) =>
  !!cardDb.get(s.objects[id]!.defId)?.types.includes('Land');

// ---------------------------------------------------------------------------
// Battlefield
// ---------------------------------------------------------------------------

export function Battlefield({
  view,
  player,
  mirrored,
  h,
}: {
  view: GameState;
  player: PlayerId;
  mirrored: boolean;
  h: ZoneHandlers;
}) {
  const mine = view.battlefield.filter((id) => view.objects[id]!.controller === player);
  const nonLands = withAttachments(
    view,
    mine.filter((id) => !isLand(view, id)),
  );
  const lands = mine.filter((id) => isLand(view, id));
  const groups = new Map<CardDefId, ObjectId[]>();
  for (const id of lands) {
    const d = view.objects[id]!.defId;
    groups.set(d, [...(groups.get(d) ?? []), id]);
  }

  // Cards tucked behind a creature (Equipment) don't take a slot of their own.
  const slots = nonLands.filter((id) => view.objects[id]!.attachedTo === undefined).length;
  const creatures = (
    <div
      className="row row--creatures"
      style={{ '--n': Math.max(1, slots) } as React.CSSProperties}
    >
      {nonLands.map((id) => {
        const o = view.objects[id]!;
        const def = cardDb.get(o.defId);
        const c = getCharacteristics(view, cardDb, id);
        const creature = def?.types.includes('Creature');
        return (
          <Card
            key={id}
            id={id}
            defId={o.defId}
            size="field"
            tapped={o.tapped}
            attached={o.attachedTo !== undefined}
            mark={h.markOf(id)}
            sick={
              creature &&
              o.summoningSick &&
              !c.keywords.has('haste') &&
              o.controller === view.turn.activePlayer
            }
            {...(creature
              ? {
                  power: c.power,
                  toughness: c.toughness,
                  basePower: o.copyPT?.power ?? def?.power ?? 0,
                  baseToughness: o.copyPT?.toughness ?? def?.toughness ?? 0,
                  damage: o.damage,
                  counters: o.plusOneCounters,
                }
              : {})}
            tags={cardTags(o, def)}
            onClick={() => h.onCard(id)}
            onHover={h.onHover}
          />
        );
      })}
    </div>
  );

  const landRow = (
    <div className="row row--lands">
      {[...groups].map(([defId, ids]) => (
        <div
          className="land-stack"
          key={defId}
          style={{ '--n': ids.length } as React.CSSProperties}
        >
          {ids.map((id, i) => (
            <Card
              key={id}
              id={id}
              defId={defId}
              size="land"
              tapped={view.objects[id]!.tapped}
              mark={h.markOf(id)}
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => h.onCard(id)}
              onHover={h.onHover}
            />
          ))}
          {ids.length > 1 && <span className="land-stack__count">{ids.length}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <section className={`battlefield ${mirrored ? 'battlefield--opp' : 'battlefield--me'}`}>
      {mirrored ? (
        <>
          {landRow}
          {creatures}
        </>
      ) : (
        <>
          {creatures}
          {landRow}
        </>
      )}
    </section>
  );
}

/** Orders permanents so each Equipment follows the creature it is attached to. */
function withAttachments(view: GameState, ids: ObjectId[]): ObjectId[] {
  const attached = ids.filter((id) => {
    const host = view.objects[id]!.attachedTo;
    return host !== undefined && ids.includes(host);
  });
  const out: ObjectId[] = [];
  for (const id of ids) {
    if (attached.includes(id)) continue;
    out.push(id, ...attached.filter((a) => view.objects[a]!.attachedTo === id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

/** A hovered hand card leans toward the pointer, with a sheen that follows it (Balatro, Marvel Snap). */
function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty('--tilt-x', `${(0.5 - y) * 14}deg`);
  el.style.setProperty('--tilt-y', `${(x - 0.5) * 18}deg`);
  el.style.setProperty('--sheen-x', `${x * 100}%`);
  el.style.setProperty('--sheen-y', `${y * 100}%`);
}

function untilt(e: React.PointerEvent<HTMLElement>) {
  for (const p of ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y']) {
    e.currentTarget.style.removeProperty(p);
  }
}

export function Hand({
  view,
  player,
  h,
  extras = [],
  order,
}: {
  view: GameState;
  player: PlayerId;
  h: ZoneHandlers;
  /** Castable cards from elsewhere (flashback, top of library), shown beside the hand. */
  extras?: { id: ObjectId; label: string }[];
  order?: ObjectId[];
}) {
  const hand = order ?? view.players[player].hand;
  const n = hand.length;
  return (
    <div className="hand" style={{ '--n': n, '--extras': extras.length } as React.CSSProperties}>
      {extras.length > 0 && (
        <div className="hand-extra">
          {extras.map(({ id, label }) => (
            <div
              key={id}
              className={`hand-extra__slot ${h.dragging === id ? 'is-dragging' : ''}`}
              onPointerDown={(e) => h.onHandPointerDown?.(id, e)}
            >
              <span className="hand-extra__label">{label}</span>
              <Card
                id={id}
                defId={view.objects[id]!.defId}
                size="hand"
                mark={h.markOf(id)}
                onClick={() => h.onCard(id)}
                onHover={h.onHover}
              />
            </div>
          ))}
        </div>
      )}
      {hand.map((id, i) => {
        const offset = i - (n - 1) / 2;
        return (
          <div
            key={id}
            className={`hand__slot ${h.dragging === id ? 'is-dragging' : ''}`}
            onPointerDown={(e) => h.onHandPointerDown?.(id, e)}
            onPointerMove={tilt}
            onPointerLeave={untilt}
            onAnimationEnd={(e) => {
              // Moving this keyed node during reordering can replay its CSS
              // entrance animation. Arrival is a one-time effect for this slot.
              if (e.target === e.currentTarget && e.animationName === 'draw')
                e.currentTarget.style.animation = 'none';
            }}
            style={{ '--o': offset, '--abs': Math.abs(offset) } as React.CSSProperties}
          >
            <Card
              id={id}
              defId={view.objects[id]!.defId}
              size="hand"
              mark={h.markOf(id)}
              onClick={() => h.onCard(id)}
              onHover={h.onHover}
            />
          </div>
        );
      })}
    </div>
  );
}

export function OpponentHand({ count }: { count: number }) {
  return (
    <div className="opp-hand" style={{ '--n': count } as React.CSSProperties}>
      {Array.from({ length: count }, (_, i) => {
        const offset = i - (count - 1) / 2;
        return (
          <div key={i} className="opp-hand__slot" style={{ '--o': offset } as React.CSSProperties}>
            <CardBack />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * A player's seat, after Arena: the portrait sits in the middle of their phase
 * strip (beginning, draw, main on the left; combat, main, end on the right), with
 * the life total just under it. The strip lights up on the active player's turn.
 */
/**
 * Brawl: the command zone beside a player's portrait, as on Arena. It shows
 * the commander while it waits there (click to cast it) and the commander
 * tax its next cast from there will cost.
 */
export function CommandSlot({
  view,
  player,
  h,
}: {
  view: GameState;
  player: PlayerId;
  h: ZoneHandlers;
}) {
  const ps = view.players[player];
  const id = ps.commander;
  if (id === undefined) return null;
  const home = ps.command.includes(id);
  const tax = 2 * (ps.commanderCasts ?? 0);
  return (
    <div
      className={`command ${home ? '' : 'is-away'}`}
      title={home ? 'Command zone' : 'Your commander is away from the command zone'}
    >
      {home ? (
        <Card
          id={id}
          defId={view.objects[id]!.defId}
          size="stack"
          mark={h.markOf(id)}
          onClick={() => h.onCard(id)}
          onHover={h.onHover}
        />
      ) : (
        <span className="command__empty">Commander</span>
      )}
      {tax > 0 && (
        <span className="command__tax" title={`Commander tax: {${tax}} more to cast`}>
          +{tax}
        </span>
      )}
    </div>
  );
}

export function PlayerBadge({
  view,
  player,
  name,
  art,
  targetable,
  active,
  priority,
  onClick,
  command,
}: {
  view: GameState;
  player: PlayerId;
  name: string;
  /** Deck face art, shown as the player's portrait. */
  art: string;
  targetable: boolean;
  active: boolean;
  priority: boolean;
  onClick: () => void;
  /** Brawl: the command zone, beside the portrait. */
  command?: React.ReactNode;
}) {
  const ps = view.players[player];
  const step = active ? view.turn.step : null;
  return (
    <div
      className={`badge ${targetable ? 'badge--target' : ''} ${active ? 'badge--active' : ''} ${
        priority ? 'badge--priority' : ''
      }`}
    >
      <PhaseStrip phases={PHASES.slice(0, 3)} step={step} />
      <div
        className="badge__portrait"
        style={{ backgroundImage: `url("${art}")` }}
        data-player={player}
        title={`${name} · ${ps.life} life · ${ps.hand.length} in hand`}
        onClick={onClick}
      >
        <LifeCounter life={ps.life} />
      </div>
      <PhaseStrip phases={PHASES.slice(3)} step={step} />
      {command}
    </div>
  );
}

function PhaseStrip({ phases, step }: { phases: Phase[]; step: Step | null }) {
  return (
    <ol className="strip">
      {phases.map((p) => {
        const on = !!step && p.steps.includes(step);
        const label = on && step && STEP_LABEL[step] ? `${p.label}: ${STEP_LABEL[step]}` : p.label;
        return (
          <li
            key={p.icon}
            className={`strip__phase ${on ? 'is-on' : ''}`}
            title={label}
            aria-label={label}
          >
            <svg viewBox="0 0 18 18" aria-hidden>
              <path d={PHASE_ICON[p.icon]} />
            </svg>
          </li>
        );
      })}
    </ol>
  );
}

export type PileZone = 'graveyard' | 'library';

/** Library and graveyard as small piles at the edge of each side, like Arena. */
export function ZonePiles({
  view,
  player,
  me,
  onHover,
  onOpen,
}: {
  view: GameState;
  player: PlayerId;
  me: PlayerId;
  onHover: HoverFn;
  /** Opens a pile for browsing. Only your own library can be looked through. */
  onOpen: (zone: PileZone) => void;
}) {
  const ps = view.players[player];
  const top = ps.graveyard[ps.graveyard.length - 1];
  const topDef = top ? view.objects[top]!.defId : null;
  const img = topDef ? cardImage(topDef) : null;
  const canBrowseLibrary = player === me && ps.library.length > 0;
  return (
    <div className={`piles piles--${player === 'p1' ? 'me' : 'opp'}`}>
      <button
        type="button"
        className={`pile pile--grave ${top ? 'is-clickable' : 'is-empty'}`}
        title="Graveyard"
        disabled={!top}
        style={img ? { backgroundImage: `url("${img}")` } : undefined}
        onClick={() => onOpen('graveyard')}
        onMouseEnter={(e) => topDef && onHover(topDef, e.currentTarget)}
        onMouseLeave={() => onHover(null)}
      >
        <b>{ps.graveyard.length}</b>
      </button>
      <button
        type="button"
        className={`pile pile--library ${canBrowseLibrary ? 'is-clickable' : ''}`}
        title={canBrowseLibrary ? 'Library: click to see the cards left' : 'Library'}
        disabled={!canBrowseLibrary}
        onClick={() => onOpen('library')}
      >
        <b>{ps.library.length}</b>
      </button>
    </div>
  );
}

/**
 * Browse a graveyard (newest first) or the cards left in your library. The
 * library is grouped by card and sorted, so it never gives away the order.
 */
export function PileViewer({
  view,
  player,
  zone,
  me,
  library,
  onHover,
  onClose,
}: {
  view: GameState;
  player: PlayerId;
  zone: PileZone;
  me: PlayerId;
  /** The cards in the library, in any order: the view hides them. */
  library: CardDefId[];
  onHover: HoverFn;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const ids = view.players[player][zone];
  const entries =
    zone === 'graveyard'
      ? [...ids].reverse().map((id) => ({ key: id, defId: view.objects[id]!.defId, count: 1 }))
      : libraryGroups(library);
  return (
    <div className="overlay overlay--pile" onClick={onClose}>
      <div className="pileview" onClick={(e) => e.stopPropagation()}>
        <h2>
          {player === me ? 'Your' : "Opponent's"} {zone}
        </h2>
        <p>
          {ids.length} {ids.length === 1 ? 'card' : 'cards'}
          {zone === 'library' ? ' left, sorted by name' : ', newest first'}
        </p>
        <div className="pileview__grid">
          {entries.map((e) => (
            <div key={e.key} className="pileview__card">
              <Card defId={e.defId} size="mull" onHover={onHover} />
              {e.count > 1 && <span className="pileview__count">×{e.count}</span>}
            </div>
          ))}
        </div>
        <div className="mull__buttons">
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Library cards counted by name: spells first, then lands, each alphabetical. */
function libraryGroups(library: CardDefId[]) {
  const counts = new Map<CardDefId, number>();
  for (const defId of library) counts.set(defId, (counts.get(defId) ?? 0) + 1);
  const rank = (defId: CardDefId) => {
    const def = cardDb.get(defId);
    return { land: def?.types.includes('Land') ? 1 : 0, name: def?.name ?? defId };
  };
  return [...counts]
    .sort(([a], [b]) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra.land - rb.land || ra.name.localeCompare(rb.name);
    })
    .map(([defId, count]) => ({ key: defId, defId, count }));
}

// ---------------------------------------------------------------------------
// Turn structure and stack
// ---------------------------------------------------------------------------

type PhaseIcon = 'untap' | 'draw' | 'main' | 'combat' | 'main2' | 'end';
interface Phase {
  label: string;
  icon: PhaseIcon;
  steps: Step[];
}

const PHASES: Phase[] = [
  { label: 'Beginning', icon: 'untap', steps: ['untap', 'upkeep'] },
  { label: 'Draw', icon: 'draw', steps: ['draw'] },
  { label: 'Main', icon: 'main', steps: ['main1'] },
  {
    label: 'Combat',
    icon: 'combat',
    steps: [
      'beginCombat',
      'declareAttackers',
      'declareBlockers',
      'firstStrikeDamage',
      'combatDamage',
      'endCombat',
    ],
  },
  { label: 'Second main', icon: 'main2', steps: ['main2'] },
  { label: 'End', icon: 'end', steps: ['end', 'cleanup'] },
];

/** 18×18 line icons, one per phase. */
const PHASE_ICON: Record<PhaseIcon, string> = {
  untap: 'M14.5 6.5A6 6 0 0 0 3.6 6M3.5 11.5A6 6 0 0 0 14.4 12M3.5 2.8V6h3.2M14.5 15.2V12h-3.2',
  draw: 'M6.3 2.5h6a1.3 1.3 0 0 1 1.3 1.3v9.4a1.3 1.3 0 0 1-1.3 1.3h-6A1.3 1.3 0 0 1 5 13.2V3.8a1.3 1.3 0 0 1 1.3-1.3zM9.3 6v5M6.9 8.5h4.8',
  main: 'M9 2.5 14.5 9 9 15.5 3.5 9zM9 7.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
  combat: 'M3 3l8.5 8.5M15 3l-8.5 8.5M10 13l2.5-2.5M8 13l-2.5-2.5M12.8 12.8l2 2M5.2 12.8l-2 2',
  main2: 'M9 2.5 14.5 9 9 15.5 3.5 9zM7.5 7.5h3v3h-3z',
  end: 'M13.8 11.2A5.8 5.8 0 0 1 6.8 4.2a5.8 5.8 0 1 0 7 7z',
};

const STEP_LABEL: Partial<Record<Step, string>> = {
  untap: 'Untap',
  upkeep: 'Upkeep',
  beginCombat: 'Beginning of combat',
  declareAttackers: 'Attackers',
  declareBlockers: 'Blockers',
  firstStrikeDamage: 'First strike',
  combatDamage: 'Damage',
  endCombat: 'End of combat',
  cleanup: 'Cleanup',
};

export function StackView({
  view,
  onHover,
  markOf,
  onCard,
  aside,
  children,
}: {
  view: GameState;
  onHover: HoverFn;
  /** Spells on the stack can be targets (counterspells). */
  markOf?: (id: ObjectId) => CardMark;
  onCard?: (id: ObjectId) => void;
  /** Move out of the middle, e.g. while picking a creature it could be covering. */
  aside?: boolean;
  /** The prompt and buttons for responding, shown under the stack. */
  children?: React.ReactNode;
}) {
  if (view.stack.length === 0) return <div className="stack stack--empty" />;
  return (
    <div className={`stack ${aside ? 'stack--aside' : ''}`}>
      {view.stack.map((item, i) => {
        const defId = item.kind === 'spell' ? view.objects[item.id]!.defId : item.sourceDefId;
        return (
          <div
            key={item.id}
            className={`stack__item stack__item--${item.controller === 'p1' ? 'me' : 'opp'}${i === view.stack.length - 1 ? ' stack__item--top' : ''}`}
            data-stack={item.id}
            style={{ '--i': i } as React.CSSProperties}
          >
            {item.kind === 'spell' ? (
              <Card
                id={item.id}
                defId={defId}
                size="stack"
                mark={markOf?.(item.id) ?? null}
                onHover={onHover}
                {...(onCard ? { onClick: () => onCard(item.id) } : {})}
              />
            ) : (
              <Card defId={defId} size="stack" onHover={onHover} />
            )}
            {item.kind === 'ability' && <span className="stack__tag">Ability</span>}
          </div>
        );
      })}
      {children}
    </div>
  );
}
