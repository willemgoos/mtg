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
  let rightSide = !a || a.left + a.width / 2 < innerWidth / 2;
  let left = gap;
  let top = (innerHeight - h) / 2;
  let height = h;
  if (a) {
    // Above the card when it fits (below when it fits better), so the row you're
    // moving along stays uncovered. The preview may shrink a little to fit;
    // only when neither side has room does it go beside the card.
    const above = a.top - 2 * gap;
    const below = innerHeight - a.bottom - 2 * gap;
    const room = Math.max(above, below);
    if (room >= h * 0.7) {
      height = Math.min(h, room);
      const wide = height * ASPECT;
      top = above >= below ? a.top - gap - height : a.bottom + gap;
      left = a.left + a.width / 2 - wide / 2;
      // Notes go on whichever side of the preview has space.
      rightSide = left + wide + notesW <= innerWidth - gap;
      if (!rightSide) left -= notesW;
      left = clamp(left, gap, innerWidth - wide - notesW - gap);
    } else {
      left = rightSide ? a.right + gap : a.left - gap - total;
      top = clamp(a.top + a.height / 2 - h / 2, gap, innerHeight - h - gap);
      left = clamp(left, gap, innerWidth - total - gap);
    }
  } else left = clamp(left, gap, innerWidth - total - gap);

  const img = hover.image ?? cardImage(hover.defId);
  return (
    <div
      className={`hover ${rightSide ? '' : 'hover--flip'}`}
      style={{ left, top, height }}
      aria-hidden
    >
      <div className="hover-preview" style={{ width: height * ASPECT, height }}>
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
