import { describe, expect, it } from 'vitest';
import { cast, game, n } from './blb-helpers.ts';
import { casts, done, keywords } from './hob-white-helpers.ts';
import { tokensOf, use } from './ltr-white-helpers.ts';
import { life, objRef } from './ltr-wu-rare-helpers.ts';

// Lord of the Rings 21d: the white rares, part three (Gandalf the White).

const GANDALF = 'gandalf-the-white';
const lands = (g: ReturnType<typeof game>) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === 'forest' && g.obj(id).controller === 'p1');

describe('Gandalf the White: flash', () => {
  it('has flash', () => {
    const g = game({ p1: { battlefield: [GANDALF] } });
    expect(keywords(g, g.id('p1', GANDALF))).toContain('flash');
  });
  it('lets you cast legendary spells and artifact spells (but not other sorcery-speed spells) as though they had flash', () => {
    const g = game({
      p1: {
        hand: ['boromir-warden-of-the-tower', 'pirates-cutlass', 'savannah-lions'],
        battlefield: [GANDALF, ...n('plains', 6)],
      },
      active: 'p2',
    });
    g.pass();
    expect(g.actor).toBe('p1');
    expect(casts(g, 'boromir-warden-of-the-tower').length).toBeGreaterThan(0);
    expect(casts(g, 'pirates-cutlass').length).toBeGreaterThan(0);
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
  });
  it("doesn't give flash without Gandalf", () => {
    const g = game({
      p1: { hand: ['boromir-warden-of-the-tower'], battlefield: n('plains', 6) },
      active: 'p2',
    });
    g.pass();
    expect(casts(g, 'boromir-warden-of-the-tower')).toHaveLength(0);
  });
});

describe('Gandalf the White: triggers an additional time', () => {
  it('a legendary creature entering makes a creature-entering trigger of yours trigger an additional time', () => {
    const g = game({
      p1: {
        hand: ['boromir-warden-of-the-tower'],
        battlefield: [GANDALF, 'impact-tremors', ...n('plains', 3)],
      },
    });
    cast(g, 'boromir-warden-of-the-tower');
    done(g);
    expect(life(g, 'p2')).toBe(18);
  });
  it('a nonlegendary nonartifact creature entering triggers it once', () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: [GANDALF, 'impact-tremors', ...n('plains', 3)],
      },
    });
    cast(g, 'savannah-lions');
    done(g);
    expect(life(g, 'p2')).toBe(19);
  });
  it('without Gandalf a legendary creature triggers it once', () => {
    const g = game({
      p1: {
        hand: ['boromir-warden-of-the-tower'],
        battlefield: ['impact-tremors', ...n('plains', 3)],
      },
    });
    cast(g, 'boromir-warden-of-the-tower');
    done(g);
    expect(life(g, 'p2')).toBe(19);
  });
  it("an artifact entering makes its own enters trigger happen twice (Solemn Simulacrum fetches two lands)", () => {
    const g = game({
      p1: { hand: ['solemn-simulacrum'], battlefield: [GANDALF, ...n('plains', 4)] },
    });
    cast(g, 'solemn-simulacrum');
    done(g);
    expect(lands(g)).toHaveLength(2);
  });
  it('without Gandalf the artifact\'s enters trigger happens once', () => {
    const g = game({ p1: { hand: ['solemn-simulacrum'], battlefield: n('plains', 4) } });
    cast(g, 'solemn-simulacrum');
    done(g);
    expect(lands(g)).toHaveLength(1);
  });
  it("an opponent's artifact entering does not double the opponent's triggers", () => {
    const g = game({
      p1: { battlefield: [GANDALF] },
      p2: { hand: ['solemn-simulacrum'], battlefield: n('plains', 4) },
      active: 'p2',
    });
    cast(g, 'solemn-simulacrum');
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'forest' && g.obj(id).controller === 'p2')).toHaveLength(1);
  });
  it('a legendary creature leaving makes a dies trigger of yours trigger an additional time', () => {
    const g = game({
      p1: { battlefield: [GANDALF, 'zulaport-cutthroat', 'boromir-warden-of-the-tower'] },
    });
    use(g, g.id('p1', 'boromir-warden-of-the-tower'), 1);
    done(g);
    expect(life(g, 'p2')).toBe(18);
    expect(life(g, 'p1')).toBe(22);
  });
  it('a nonlegendary creature leaving triggers it once', () => {
    const g = game({
      p1: {
        hand: ['bake-into-a-pie'],
        battlefield: [GANDALF, 'zulaport-cutthroat', 'savannah-lions', ...n('swamp', 4)],
      },
    });
    cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(life(g, 'p2')).toBe(19);
  });
  it('Gandalf leaving the battlefield himself triggers a dies trigger of yours twice (it looks back)', () => {
    const g = game({
      p1: {
        hand: ['the-battle-of-bywater'],
        battlefield: [GANDALF, 'zulaport-cutthroat', ...n('plains', 3)],
      },
    });
    cast(g, 'the-battle-of-bywater');
    done(g);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === GANDALF)).toBe(false);
    expect(life(g, 'p2')).toBe(18);
  });
  it("an artifact creature dying makes its own dies trigger happen twice (Gleaming Barrier makes two Treasures)", () => {
    const g = game({
      p1: {
        hand: ['bake-into-a-pie'],
        battlefield: [GANDALF, 'gleaming-barrier', ...n('swamp', 4)],
      },
    });
    cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', 'gleaming-barrier'))]);
    done(g);
    expect(tokensOf(g, 'treasure-token')).toHaveLength(2);
  });
  it('permanents leaving together with Gandalf still get the extra trigger', () => {
    const g = game({
      p1: {
        hand: ['the-battle-of-bywater'],
        battlefield: [GANDALF, 'gleaming-barrier', ...n('plains', 3)],
      },
    });
    g.obj(g.id('p1', 'gleaming-barrier')).plusOneCounters = 3;
    cast(g, 'the-battle-of-bywater');
    done(g);
    expect(tokensOf(g, 'treasure-token')).toHaveLength(2);
  });
});
