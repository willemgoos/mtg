import { cardDb, scryfallById } from '@mtg/cards';
import { type CardDefinition } from '@mtg/engine';
import { buildScenario } from '@mtg/engine/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardNotes, ENDURING_STORY_BADGE, ENDURING_STORY_RULE } from '../src/game/notes.ts';

// The Hobbit (20a): tooltips for amass, recruit, the cycling family and Storied (with the enduring story).

const note = (notes: { title: string; text: string }[], title: string) =>
  notes.find((n) => n.title === title);

describe('The Hobbit: mechanic tooltips', () => {
  it('explains Amass on a card that has it (Lazotep Plating)', () => {
    const s = buildScenario(cardDb, {});
    const amass = note(cardNotes(s, 'lazotep-plating'), 'Amass');
    expect(amass?.text).toMatch(/\+1\/\+1 counters on an Army/);
    expect(amass?.text).toMatch(/0\/0 black Army/);
  });

  it('explains cycling on a card that has it', () => {
    const s = buildScenario(cardDb, {});
    const withCycling = [...scryfallById.entries()].find(
      ([id, sc]) => sc.keywords.includes('Cycling') && cardDb.has(id),
    );
    expect(withCycling).toBeDefined();
    const text = note(cardNotes(s, withCycling![0]), 'Cycling')?.text;
    expect(text).toMatch(/Discard this card: Draw a card/);
  });

  it('the rule text of Storied and the badge say what an enduring story is', () => {
    expect(ENDURING_STORY_RULE).toMatch(/three or more artifacts, legendaries, and\/or Sagas/);
    expect(ENDURING_STORY_RULE).toMatch(/for the rest of the game/);
    expect(ENDURING_STORY_BADGE).toMatch(/^Enduring story:/);
  });
});

describe('The Hobbit: the Storied tooltip says where the enduring story stands', () => {
  const STORIED: CardDefinition = {
    id: 'test-storied-dwarf',
    name: 'Test Storied Dwarf',
    manaCost: { generic: 1, colored: {} },
    colors: [],
    types: ['Creature'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf'],
    keywords: [],
    power: 2,
    toughness: 2,
    abilities: [{ kind: 'static', effect: { kind: 'storied' } }],
  };
  const RELIC: CardDefinition = {
    id: 'test-relic',
    name: 'Test Relic',
    manaCost: { generic: 1, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
  };
  // The card database is a plain Map: add the test cards for these tests only (cardNotes reads it).
  const db = cardDb;
  const mutable = cardDb as unknown as Map<string, CardDefinition>;
  beforeAll(() => {
    mutable.set(STORIED.id, STORIED);
    mutable.set(RELIC.id, RELIC);
  });
  afterAll(() => {
    mutable.delete(STORIED.id);
    mutable.delete(RELIC.id);
  });

  it('counts the artifacts, legendaries and Sagas toward the three while a Storied permanent is out', () => {
    const s = buildScenario(db, { p1: { battlefield: [STORIED.id] } });
    const dwarf = s.battlefield.find((id) => s.objects[id]!.defId === STORIED.id)!;
    expect(note(cardNotes(s, STORIED.id, dwarf), 'Enduring story')?.text).toBe(
      'Not yet: 1 of the 3 artifacts, legendaries and/or Sagas.',
    );
    const two = buildScenario(db, { p1: { battlefield: [STORIED.id, RELIC.id] } });
    const dwarf2 = two.battlefield.find((id) => two.objects[id]!.defId === STORIED.id)!;
    expect(note(cardNotes(two, STORIED.id, dwarf2), 'Enduring story')?.text).toBe(
      'Not yet: 2 of the 3 artifacts, legendaries and/or Sagas.',
    );
  });

  it('says so once the enduring story is had', () => {
    const s = buildScenario(db, { p1: { battlefield: [STORIED.id, RELIC.id, RELIC.id] } });
    const dwarf = s.battlefield.find((id) => s.objects[id]!.defId === STORIED.id)!;
    expect(note(cardNotes(s, STORIED.id, dwarf), 'Enduring story')?.text).toBe(
      'You have an enduring story.',
    );
    // The designation stays when the permanents are gone.
    const flagged = buildScenario(db, { p1: { battlefield: [STORIED.id] } });
    flagged.players.p1.enduringStory = true;
    const d = flagged.battlefield.find((id) => flagged.objects[id]!.defId === STORIED.id)!;
    expect(note(cardNotes(flagged, STORIED.id, d), 'Enduring story')?.text).toBe(
      'You have an enduring story.',
    );
  });

  it('in hand it only says it works from the battlefield', () => {
    const s = buildScenario(db, { p1: { hand: [STORIED.id] } });
    const inHand = s.players.p1.hand[0]!;
    expect(note(cardNotes(s, STORIED.id, inHand), 'Enduring story')?.text).toMatch(
      /works while this is on the battlefield/,
    );
  });
});
