import { cardDb, scryfallById } from '@mtg/cards';
import type { CardDefId, ObjectId } from '@mtg/engine';
import type { MouseEvent } from 'react';

export type CardSize = 'hand' | 'field' | 'land' | 'stack' | 'preview' | 'mull';
export type CardMark =
  | 'playable'
  | 'option'
  | 'selected'
  | 'attacking'
  | 'blocking'
  | 'candidate'
  | 'activatable'
  | null;

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
  onClick?: (e: MouseEvent) => void;
  onHover?: (defId: CardDefId | null) => void;
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
  const cls = [
    'card',
    `card--${p.size}`,
    p.tapped ? 'is-tapped' : '',
    p.mark ? `mark-${p.mark}` : '',
    p.sick ? 'is-sick' : '',
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
      onMouseEnter={() => p.onHover?.(p.defId)}
      onMouseLeave={() => p.onHover?.(null)}
    >
      <div className="card__body">
        {img ? (
          <img src={img} alt={def?.name ?? ''} draggable={false} />
        ) : (
          <TokenFace defId={p.defId} />
        )}
        {showPt && (
          <span className={`card__pt ${ptClass} ${p.damage ? 'hurt' : ''}`}>
            {p.power}/{p.toughness! - (p.damage ?? 0)}
          </span>
        )}
        {!!p.counters && <span className="card__counters">+{p.counters}</span>}
      </div>
    </div>
  );
}

function TokenFace({ defId }: { defId: CardDefId }) {
  const def = cardDb.get(defId);
  if (!def) return <div className="token token--hidden" />;
  const color = def.colors[0] === 'R' ? 'red' : def.colors[0] === 'G' ? 'green' : 'plain';
  return (
    <div className={`token token--${color}`}>
      <div className="token__name">{def.name}</div>
      <div className="token__art" />
      <div className="token__type">Token Creature — {def.subtypes.join(' ')}</div>
      <div className="token__text">
        {def.keywords.map((k) => k[0]!.toUpperCase() + k.slice(1)).join(', ')}
      </div>
      <div className="token__pt">
        {def.power}/{def.toughness}
      </div>
    </div>
  );
}

export function CardBack({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="card card--back" style={style}>
      <div className="card__body">
        <div className="back">
          <div className="back__sigil" />
        </div>
      </div>
    </div>
  );
}
