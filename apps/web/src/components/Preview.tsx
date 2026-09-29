import { cardDb } from '@mtg/cards';
import type { CardDefId } from '@mtg/engine';
import type { CardNote } from '../game/notes.ts';
import { Card, cardImage } from './Card.tsx';

export interface HoverState {
  defId: CardDefId;
  /** The hovered element; the preview sits beside it. */
  anchor: Element | null;
  /** Image to show instead of the bundled one (cards we have no data for). */
  image?: string | null;
}

const ASPECT = 63 / 88;
/** Width of the notes column, in rem. */
const NOTES_W = 17;

/**
 * Large card preview next to the hovered card, like Arena: to its right if the
 * card is on the left half of the screen, otherwise to its left. Keyword and
 * status notes sit on the far side of the preview, and the whole group is
 * kept on screen.
 */
export function HoverPreview({ hover, notes }: { hover: HoverState | null; notes: CardNote[] }) {
  if (!hover) return null;
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const h = Math.min(
    parseFloat(getComputedStyle(root).getPropertyValue('--preview-h')) * rem,
    innerHeight - 2 * rem,
  );
  const w = h * ASPECT;
  const gap = rem;
  const notesW = notes.length ? NOTES_W * rem + gap : 0;
  const total = w + notesW;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const a = hover.anchor?.getBoundingClientRect();
  const rightSide = !a || a.left + a.width / 2 < innerWidth / 2;
  let left = gap;
  let top = (innerHeight - h) / 2;
  if (a) {
    left = rightSide ? a.right + gap : a.left - gap - total;
    top = clamp(a.top + a.height / 2 - h / 2, gap, innerHeight - h - gap);
  }
  left = clamp(left, gap, innerWidth - total - gap);

  const img = hover.image ?? cardImage(hover.defId);
  return (
    <div
      className={`hover ${rightSide ? '' : 'hover--flip'}`}
      style={{ left, top, height: h }}
      aria-hidden
    >
      <div className="hover-preview" style={{ width: w, height: h }}>
        {img ? (
          <img src={img} alt={cardDb.get(hover.defId)?.name ?? ''} />
        ) : (
          <Card defId={hover.defId} size="preview" />
        )}
      </div>
      {notes.length > 0 && (
        <div className="notes" style={{ width: NOTES_W * rem }}>
          {notes.map((n) => (
            <div key={`${n.kind}:${n.title}`} className={`note note--${n.kind}`}>
              <div className="note__title">{n.title}</div>
              <div className="note__text">{n.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
