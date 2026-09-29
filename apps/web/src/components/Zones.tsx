import { cardDb } from '@mtg/cards';
import {
  type CardDefId,
  type GameState,
  getCharacteristics,
  type ObjectId,
  type PlayerId,
  type Step,
} from '@mtg/engine';
import { Card, CardBack, type CardMark, type HoverFn } from './Card.tsx';
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

  const creatures = (
    <div className="row row--creatures">
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
                  basePower: def?.power ?? 0,
                  baseToughness: def?.toughness ?? 0,
                  damage: o.damage,
                  counters: o.plusOneCounters,
                }
              : {})}
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
}: {
  view: GameState;
  player: PlayerId;
  h: ZoneHandlers;
  /** Castable cards from elsewhere (flashback, top of library), shown beside the hand. */
  extras?: { id: ObjectId; label: string }[];
}) {
  const hand = view.players[player].hand;
  const n = hand.length;
  return (
    <div className="hand" style={{ '--n': n } as React.CSSProperties}>
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

export function PlayerBadge({
  view,
  player,
  name,
  art,
  targetable,
  active,
  priority,
  onClick,
  onHover,
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
  onHover: HoverFn;
}) {
  const ps = view.players[player];
  const top = ps.graveyard[ps.graveyard.length - 1];
  return (
    <div
      className={`badge ${targetable ? 'badge--target' : ''} ${active ? 'badge--active' : ''} ${
        priority ? 'badge--priority' : ''
      }`}
      data-player={player}
      onClick={onClick}
    >
      <div className="badge__portrait" style={{ backgroundImage: `url("${art}")` }}>
        <LifeCounter life={ps.life} />
      </div>
      <div className="badge__meta">
        <div className="badge__name">{name}</div>
        <div className="badge__zones">
          <span title="Library">
            <i className="ico ico--lib" />
            {ps.library.length}
          </span>
          <span title="Hand">
            <i className="ico ico--hand" />
            {ps.hand.length}
          </span>
          <span
            title="Graveyard"
            onMouseEnter={(e) => top && onHover(view.objects[top]!.defId, e.currentTarget)}
            onMouseLeave={() => onHover(null)}
          >
            <i className="ico ico--grave" />
            {ps.graveyard.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turn structure and stack
// ---------------------------------------------------------------------------

const PHASES: { label: string; steps: Step[] }[] = [
  { label: 'Upkeep', steps: ['untap', 'upkeep'] },
  { label: 'Draw', steps: ['draw'] },
  { label: 'Main', steps: ['main1'] },
  {
    label: 'Combat',
    steps: [
      'beginCombat',
      'declareAttackers',
      'declareBlockers',
      'firstStrikeDamage',
      'combatDamage',
      'endCombat',
    ],
  },
  { label: 'Main', steps: ['main2'] },
  { label: 'End', steps: ['end', 'cleanup'] },
];

const STEP_LABEL: Partial<Record<Step, string>> = {
  beginCombat: 'Beginning of combat',
  declareAttackers: 'Attackers',
  declareBlockers: 'Blockers',
  firstStrikeDamage: 'First strike',
  combatDamage: 'Damage',
  endCombat: 'End of combat',
};

export function PhaseTrack({ view, me }: { view: GameState; me: PlayerId }) {
  const step = view.turn.step;
  const mine = view.turn.activePlayer === me;
  return (
    <div className={`phases ${mine ? 'phases--me' : 'phases--opp'}`}>
      <div className="phases__turn">
        <span className="phases__who">{mine ? 'Your turn' : "Opponent's turn"}</span>
        <span className="phases__num">
          Turn {view.turn.number}
          {STEP_LABEL[step] && ` · ${STEP_LABEL[step]}`}
        </span>
      </div>
      <ol className="phases__list">
        {PHASES.map((p, i) => (
          <li key={i} className={p.steps.includes(step) ? 'is-on' : ''}>
            {p.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

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
