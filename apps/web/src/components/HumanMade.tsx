import type { Decklist, Packet } from '@mtg/cards';

/** Who made a deck or packet, if people did (lists from Wizards or players, not our own). */
export function madeBy(x: Decklist | Packet): string | null {
  if (x.source !== 'arena') return null;
  if ('credit' in x && x.credit) return `Built by ${x.credit}`;
  return 'Made by Wizards of the Coast';
}

/** A small head-and-shoulders badge for decks and packets made by people. */
export function HumanMade({ of, inline = false }: { of: Decklist | Packet; inline?: boolean }) {
  const who = madeBy(of);
  if (!who) return null;
  return (
    <span
      className={`human-badge ${inline ? 'human-badge--inline' : ''}`}
      role="img"
      aria-label={who}
      title={who}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="5.25" r="3" />
        <path d="M2.5 14.5c0-3.1 2.46-5.25 5.5-5.25s5.5 2.15 5.5 5.25z" />
      </svg>
    </span>
  );
}
