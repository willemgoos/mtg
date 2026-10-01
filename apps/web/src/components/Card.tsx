import { cardDb, scryfallById } from '@mtg/cards';
import type { CardDefId, ObjectId } from '@mtg/engine';
import { type MouseEvent, useRef } from 'react';

export type CardSize = 'hand' | 'field' | 'land' | 'stack' | 'preview' | 'mull';
export type CardMark =
  | 'playable'
  | 'option'
  | 'selected'
  | 'attacking'
  | 'blocking'
  | 'candidate'
  | 'activatable'
  | 'hint'
  | null;

/** Hover callback: the card and where it is on screen (for placing the preview). */
export type HoverFn = (defId: CardDefId | null, anchor?: Element) => void;

export function cardImage(defId: CardDefId): string | null {
  return scryfallById.get(defId)?.image?.normal ?? null;
}

export interface CardProps {
  id?: ObjectId;
  defId: CardDefId;
  size: CardSize;
  tapped?: boolean;
  mark?: CardMark;
  power?: number;
  toughness?: number;
  /** Printed P/T, to color buffed or shrunk stats. */
  basePower?: number;
  baseToughness?: number;
  damage?: number;
  counters?: number;
  sick?: boolean;
  /** An Equipment attached to the creature before it. */
  attached?: boolean;
  onClick?: (e: MouseEvent) => void;
  onHover?: HoverFn;
  style?: React.CSSProperties;
}

export function Card(p: CardProps) {
  const def = cardDb.get(p.defId);
  const img = cardImage(p.defId);
  const showPt = p.power !== undefined && p.toughness !== undefined;
  const ptClass =
    showPt && (p.power! > (p.basePower ?? 0) || p.toughness! > (p.baseToughness ?? 0))
      ? 'up'
      : showPt && p.toughness! < (p.baseToughness ?? 0)
        ? 'down'
        : '';
  // A power/toughness change pops the stats box (green up, red down). Worked
  // out while rendering so the new key remounts the box and replays the pop.
  const pt = useRef({ p: p.power, t: p.toughness, n: 0, dir: '' });
  if (showPt && (pt.current.p !== p.power || pt.current.t !== p.toughness)) {
    const was = pt.current;
    const gain = p.power! - (was.p ?? p.power!) + (p.toughness! - (was.t ?? p.toughness!));
    pt.current = {
      p: p.power,
      t: p.toughness,
      n: was.p === undefined ? was.n : was.n + 1,
      dir: gain >= 0 ? 'up' : 'down',
    };
  }
  const cls = [
    'card',
    `card--${p.size}`,
    p.tapped ? 'is-tapped' : '',
    p.mark ? `mark-${p.mark}` : '',
    p.sick ? 'is-sick' : '',
    p.attached ? 'is-attached' : '',
    p.onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      data-oid={p.id}
      style={p.style}
      onClick={p.onClick}
      onMouseEnter={(e) => p.onHover?.(p.defId, e.currentTarget)}
      onMouseLeave={() => p.onHover?.(null)}
    >
      <div className="card__body">
        {img ? (
          <img src={img} alt={def?.name ?? ''} draggable={false} />
        ) : (
          <TokenFace defId={p.defId} />
        )}
        {showPt && (
          <span
            key={pt.current.n}
            className={`card__pt ${ptClass} ${p.damage ? 'hurt' : ''} ${pt.current.n ? `pop-${pt.current.dir}` : ''}`}
          >
            {p.power}/{p.toughness! - (p.damage ?? 0)}
          </span>
        )}
        {!!p.counters && <span className="card__counters">+{p.counters}</span>}
      </div>
    </div>
  );
}

const TOKEN_TEXT: Record<string, string> = {
  'treasure-token': '{T}, Sacrifice: Add one mana of any color.',
  'food-token': '{2}, {T}, Sacrifice: You gain 3 life.',
};

function TokenFace({ defId }: { defId: CardDefId }) {
  const def = cardDb.get(defId);
  if (!def) return <div className="token token--hidden" />;
  const color =
    def.colors[0] === 'R'
      ? 'red'
      : def.colors[0] === 'G'
        ? 'green'
        : def.colors[0] === 'W'
          ? 'white'
          : def.colors[0] === 'U'
            ? 'blue'
            : def.colors[0] === 'B'
              ? 'black'
              : 'plain';
  const creature = def.types.includes('Creature');
  return (
    <div className={`token token--${color}`}>
      <div className="token__name">{def.name}</div>
      <div className="token__art" />
      <div className="token__type">
        Token {def.types.join(' ')} — {def.subtypes.join(' ')}
      </div>
      <div className="token__text">
        {creature
          ? def.keywords.map((k) => k[0]!.toUpperCase() + k.slice(1)).join(', ')
          : (TOKEN_TEXT[def.id] ?? '')}
      </div>
      {creature && (
        <div className="token__pt">
          {def.power}/{def.toughness}
        </div>
      )}
    </div>
  );
}

export function CardBack({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="card card--back" style={style}>
      <div className="card__body">
        <div className="back" />
      </div>
    </div>
  );
}
