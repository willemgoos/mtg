import type { Keyword } from '@mtg/engine';

/*
 * Arena marks a permanent's combat keywords with small icons along the bottom
 * of its battlefield frame, so a board reads at a glance without hovering.
 * Simple 24x24 glyphs, drawn here (no icon font or licensed set).
 */

const ICONS: Partial<Record<Keyword, { name: string; d: string }>> = {
  flying: {
    name: 'Flying',
    d: 'M2 19c3-1 5-3 6-6-2 1-3 1-5 1 3-1 5-3 6-6-2 1-3 1-4 1 3-2 5-4 7-7 1 4 1 8-1 12-2 3-5 5-9 5z M13 7c3-1 6-1 9 0-2 1-3 2-3 3l2 1-3 1 1 2-3 0c-1 3-3 5-6 6 2-3 3-7 3-13z',
  },
  reach: {
    name: 'Reach',
    d: 'M12 2l7 8h-4.5v4h3.5l-6 8-6-8h3.5v-4H5z',
  },
  trample: {
    name: 'Trample',
    d: 'M3 5h4l7 7-7 7H3l7-7z M11 5h4l7 7-7 7h-4l7-7z',
  },
  haste: {
    name: 'Haste',
    d: 'M14 1L4 14h6.5L9 23l11-13h-6.5z',
  },
  firstStrike: {
    name: 'First strike',
    d: 'M20 2l2 2-11 11 1.5 1.5-1.5 1.5-1.5-1.5L5 21l-2-2 4.5-4.5L6 13l1.5-1.5L9 13z',
  },
  doubleStrike: {
    name: 'Double strike',
    d: 'M20 2l2 2-11 11 1.5 1.5-1.5 1.5-1.5-1.5L5 21l-2-2 4.5-4.5L6 13l1.5-1.5L9 13z M4 2L2 4l6.5 6.5 2-2z M15 13l-2 2 1.5 1.5L19 21l2-2-4.5-4.5L18 13l-1.5-1.5z',
  },
  vigilance: {
    name: 'Vigilance',
    d: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 110 8 4 4 0 010-8zm0 2.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z',
  },
  deathtouch: {
    name: 'Deathtouch',
    d: 'M12 2C7 2 4 5.5 4 10c0 3 1.5 5 3 6v3h2v-2h2v2h2v-2h2v2h2v-3c1.5-1 3-3 3-6 0-4.5-3-8-8-8zM8.5 9a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4zM12 13l1.3 2.5h-2.6z',
  },
  lifelink: {
    name: 'Lifelink',
    d: 'M12 21.5S3 16 3 9.5A4.8 4.8 0 0112 7a4.8 4.8 0 019 2.5C21 16 12 21.5 12 21.5z',
  },
  menace: {
    name: 'Menace',
    d: 'M3 2c0 5 2 8 5 9-1 1-1.5 2.5-1.5 4 0 4 2.5 7 5.5 7s5.5-3 5.5-7c0-1.5-.5-3-1.5-4 3-1 5-4 5-9-2 3-5 4.5-9 4.5S5 5 3 2zm6 11.5l2 1.2-.6 1.6-2-1zm6 0l.6 1.8-2 1-.6-1.6z',
  },
  defender: {
    name: 'Defender',
    d: 'M2 4h20v16H2zm2 2v3h7V6zm9 0v3h7V6zM4 11v3h3v-3zm5 0v3h6v-3zm8 0v3h3v-3zM4 16v2h7v-2zm9 0v2h7v-2z',
  },
  hexproof: {
    name: 'Hexproof',
    d: 'M12 1l9 4v6c0 6-4 10.5-9 12-5-1.5-9-6-9-12V5z',
  },
  indestructible: {
    name: 'Indestructible',
    d: 'M12 1l10 6v10l-10 6-10-6V7zm0 4.5L6 9v6l6 3.5 6-3.5V9z',
  },
  ward: {
    name: 'Ward',
    d: 'M12 1l9 4v6c0 6-4 10.5-9 12-5-1.5-9-6-9-12V5zm0 3L6 6.5V11c0 4 2.5 7.5 6 8.8 3.5-1.3 6-4.8 6-8.8V6.5z',
  },
};

/** Variants that show the same icon as their plain keyword. */
const ALIAS: Partial<Record<Keyword, Keyword>> = {
  hexproofFromInstants: 'hexproof',
  hexproofFromWhite: 'hexproof',
  hexproofFromMonocolored: 'hexproof',
  shroud: 'hexproof',
  wardOne: 'ward',
  wardPayTwoLife: 'ward',
};

const ORDER = Object.keys(ICONS) as Keyword[];

export function KeywordIcons({ keywords }: { keywords: Iterable<Keyword> }) {
  const has = new Set<Keyword>();
  for (const k of keywords) {
    const key = ALIAS[k] ?? k;
    if (ICONS[key]) has.add(key);
  }
  // Double strike already says first strike.
  if (has.has('doubleStrike')) has.delete('firstStrike');
  if (!has.size) return null;
  return (
    <span className="card__kw">
      {ORDER.filter((k) => has.has(k)).map((k) => (
        <svg key={k} viewBox="0 0 24 24" aria-label={ICONS[k]!.name} role="img">
          <title>{ICONS[k]!.name}</title>
          <path d={ICONS[k]!.d} fillRule="evenodd" />
        </svg>
      ))}
    </span>
  );
}
