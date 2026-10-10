import { cardDb } from '@mtg/cards';
import { type CardDefinition } from '@mtg/engine';
import { buildScenario } from '@mtg/engine/testing';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Battlefield, PlayerBadge } from '../src/components/Zones.tsx';
import { cardNotes, RING_ABILITIES, ringBadgeText } from '../src/game/notes.ts';

// The Lord of the Rings (21a): the Ring on the player badge, with its tooltip, and the Ring-bearer's note.

const note = (notes: { title: string; text: string }[], title: string) =>
  notes.find((n) => n.title === title);

const BEARER: CardDefinition = {
  id: 'test-ring-bearer',
  name: 'Test Ring-bearer',
  manaCost: { generic: 1, colored: {} },
  colors: [],
  types: ['Creature'],
  supertypes: [],
  subtypes: ['Halfling'],
  keywords: [],
  power: 1,
  toughness: 1,
  abilities: [],
};

describe('The Lord of the Rings: the Ring tooltips', () => {
  const mutable = cardDb as unknown as Map<string, CardDefinition>;
  beforeAll(() => {
    mutable.set(BEARER.id, BEARER);
  });
  afterAll(() => {
    mutable.delete(BEARER.id);
  });

  it('the four abilities, in the order the Ring gains them', () => {
    expect(RING_ABILITIES).toHaveLength(4);
    expect(RING_ABILITIES[0]).toMatch(/legendary and can’t be blocked by creatures with greater power/);
    expect(RING_ABILITIES[1]).toMatch(/draw a card, then discard a card/);
    expect(RING_ABILITIES[2]).toMatch(/sacrifices it at end of combat/);
    expect(RING_ABILITIES[3]).toMatch(/each opponent loses 3 life/);
  });

  it('the badge tooltip: how often, the Ring-bearer, the abilities so far and the next one', () => {
    const one = ringBadgeText(1, 'Frodo');
    expect(one).toMatch(/tempted this player 1 time\./);
    expect(one).toMatch(/Ring-bearer: Frodo\./);
    expect(one).toMatch(/1\. Your Ring-bearer is legendary/);
    expect(one).not.toMatch(/2\. Whenever/);
    expect(one).toMatch(/The next time it tempts them: Whenever your Ring-bearer attacks/);
    const many = ringBadgeText(6);
    expect(many).toMatch(/6 times/);
    expect(many).toMatch(/No Ring-bearer right now/);
    expect(many).toMatch(/4\. Whenever your Ring-bearer deals combat damage/);
    expect(many).not.toMatch(/next time/);
  });

  it('a Ring-bearer\'s tooltip lists what the Ring does for it; others have none', () => {
    const s = buildScenario(cardDb, { p1: { battlefield: [BEARER.id, BEARER.id] } });
    const [a, b] = s.battlefield;
    s.players.p1.ring = { tempted: 2, bearer: { id: a!, zcc: s.objects[a!]!.zcc } };
    const text = note(cardNotes(s, BEARER.id, a), 'Ring-bearer')?.text;
    expect(text).toContain(RING_ABILITIES[0]);
    expect(text).toContain(RING_ABILITIES[1]);
    expect(text).not.toContain(RING_ABILITIES[2]);
    expect(note(cardNotes(s, BEARER.id, b), 'Ring-bearer')).toBeUndefined();
  });

  it('the player badge shows the Ring with its level and tooltip, only for the player who has it', () => {
    const s = buildScenario(cardDb, { p1: { battlefield: [BEARER.id] }, p2: {} });
    const bearer = s.battlefield[0]!;
    s.players.p1.ring = { tempted: 5, bearer: { id: bearer, zcc: s.objects[bearer]!.zcc } };
    const badge = (player: 'p1' | 'p2') =>
      renderToStaticMarkup(
        createElement(PlayerBadge, {
          view: s,
          player,
          name: player,
          art: '',
          targetable: false,
          active: false,
          priority: false,
          onClick: () => {},
        }),
      );
    const mine = badge('p1');
    expect(mine).toContain('data-testid="ring"');
    expect(mine).toContain('data-level="4"');
    expect(mine).toContain('tempted this player 5 times');
    expect(mine).toContain('Ring-bearer: Test Ring-bearer.');
    expect(badge('p2')).not.toContain('data-testid="ring"');
  });

  it('the Ring-bearer is marked on its card on the battlefield', () => {
    const s = buildScenario(cardDb, { p1: { battlefield: [BEARER.id, BEARER.id] }, p2: {} });
    const [a] = s.battlefield;
    s.players.p1.ring = { tempted: 1, bearer: { id: a!, zcc: s.objects[a!]!.zcc } };
    const html = renderToStaticMarkup(
      createElement(Battlefield, {
        view: s,
        player: 'p1',
        mirrored: false,
        h: { markOf: () => null, onCard: () => {}, onHover: () => {} },
      }),
    );
    // One of the two creatures carries the label.
    expect(html.match(/<span>Ring-bearer<\/span>/g)).toHaveLength(1);
    expect(html).toContain('card__tags');
  });
});
