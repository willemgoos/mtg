import { useState } from 'react';

/**
 * Strixhaven (13c): the "choose one" menu. A long list (a card name for Silverquill
 * Silencer or Academic Probation) gets a search box, as Arena's name entry does.
 */
export function OptionMenu({
  title,
  options,
  onPick,
  noun = 'card name',
}: {
  title: string;
  options: { label: string }[];
  onPick: (index: number) => void;
  /** What is being chosen, for the search box ("card name", "creature type"). */
  noun?: string;
}) {
  const [query, setQuery] = useState('');
  const long = options.length > 12;
  const q = query.trim().toLowerCase();
  const shown = options
    .map((o, index) => ({ label: o.label, index }))
    .filter((o) => !q || o.label.toLowerCase().includes(q))
    .slice(0, long ? 40 : options.length);
  return (
    <div className="menu">
      <div
        className="menu__box"
        style={long ? { maxHeight: '80vh', overflowY: 'auto' } : undefined}
      >
        <div className="menu__title">{title}</div>
        {long && (
          <input
            autoFocus
            className="menu__search"
            placeholder={`Type a ${noun}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {shown.map((o) => (
          <button key={o.index} className="btn btn--ghost" onClick={() => onPick(o.index)}>
            {o.label}
          </button>
        ))}
        {long && shown.length === 0 && <div className="menu__title">No {noun} like that</div>}
      </div>
    </div>
  );
}
