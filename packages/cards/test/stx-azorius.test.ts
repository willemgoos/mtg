import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import { cardDb, deckById, deckIds, isPlayable, sideboardIds } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Azorius Skies (W/U) and its Lessons.

const activate = (g: GameDriver, source: string, index = 0) =>
  g.do(
    g
      .legal()
      .find(
        (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
      )!,
  );
/** Resolves the stack, declining any Learn offer (the last option) and optional effects. */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (g.legal().some((a) => a.type === 'discard'))
      g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: false });
    else break;
  }
  return g;
}
const choose = (g: GameDriver, index: number) =>
  g.do({ type: 'chooseOption', player: g.actor, index });
const handSize = (g: GameDriver) => g.state.players.p1.hand.length;

describe('the deck', () => {
  it('is 60 cards with 24 lands and four Lessons in the sideboard, and playable', () => {
    const d = deckById('stx-azorius-skies');
    expect(isPlayable(d)).toBe(true);
    const ids = deckIds(d);
    expect(ids).toHaveLength(60);
    expect(ids.filter((id) => cardDb.get(id)!.types.includes('Land'))).toHaveLength(24);
    expect(sideboardIds(d)).toHaveLength(4);
  });
});

describe('magecraft', () => {
  it('Clever Lumimancer gets +2/+2 and Leonin Lightscribe pumps the team', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['clever-lumimancer', 'leonin-lightscribe', ...n('plains', 2)],
      },
    });
    const lumi = g.id('p1', 'clever-lumimancer');
    const scribe = g.id('p1', 'leonin-lightscribe');
    done(cast(g, 'beaming-defiance', [g.ref(scribe)]));
    expect(pt(g, lumi)).toEqual([0 + 2 + 1, 1 + 2 + 1]); // magecraft x2: +2/+2 and +1/+1
    expect(pt(g, scribe)).toEqual([2 + 2 + 1, 2 + 2 + 1]); // Beaming Defiance +2/+2, its own +1/+1
  });

  it('Symmetry Sage flies and sets a creature’s power to 2', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['symmetry-sage', 'serra-angel', ...n('plains', 2)],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    expect(cardDb.get('symmetry-sage')!.keywords).toContain('flying');
    cast(g, 'beaming-defiance', [g.ref(angel)]);
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          JSON.stringify(a.targets).includes(JSON.stringify(g.ref(angel))),
      ),
    );
    done(g);
    expect(pt(g, angel)[0]).toBe(4);
    expect(pt(g, angel)[1]).toBe(6);
  });
});

describe('creatures', () => {
  it('Burrog Befuddler has flash and gives an opposing creature -1/-0', () => {
    const g = game({
      p1: { hand: ['burrog-befuddler'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(cardDb.get('burrog-befuddler')!.keywords).toContain('flash');
    cast(g, 'burrog-befuddler');
    settle(g);
    done(g);
    expect(pt(g, angel)).toEqual([3, 4]);
  });

  it('Soothsayer Adept loots for {1}{U}', () => {
    const g = game({
      p1: {
        hand: ['plains'],
        library: ['island', 'island'],
        battlefield: ['soothsayer-adept', ...n('island', 2)],
      },
    });
    activate(g, g.id('p1', 'soothsayer-adept'));
    done(g);
    expect(handSize(g)).toBe(1);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });

  it('Biblioplex Assistant puts an instant from your graveyard on top of your library', () => {
    const g = game({
      p1: {
        hand: ['biblioplex-assistant'],
        graveyard: ['shock', 'serra-angel'],
        battlefield: n('island', 4),
      },
    });
    cast(g, 'biblioplex-assistant');
    settle(g);
    done(g);
    const top = g.state.players.p1.library[0]!;
    expect(g.obj(top).defId).toBe('shock');
  });

  it('Wormhole Serpent makes a creature unblockable for {3}{U}', () => {
    const g = game({
      p1: { battlefield: ['wormhole-serpent', 'serra-angel', ...n('island', 4)] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'activateAbility' &&
            a.source === g.id('p1', 'wormhole-serpent') &&
            JSON.stringify(a.targets).includes(JSON.stringify(g.ref(angel))),
        )!,
    );
    done(g);
    expect(getCharacteristics(g.state, cardDb, angel).cantBeBlocked).toBe(true);
  });
});

describe('spells', () => {
  it('Defend the Campus: +1/+1 for the team, or destroy a power 4+ creature', () => {
    const a = game({
      p1: { hand: ['defend-the-campus'], battlefield: ['eager-first-year', ...n('plains', 4)] },
    });
    cast(a, 'defend-the-campus', [], { mode: 0 });
    done(a);
    // magecraft +1/+0 and the +1/+1 from the mode
    expect(pt(a, a.id('p1', 'eager-first-year'))).toEqual([4, 3]);

    const b = game({
      p1: { hand: ['defend-the-campus'], battlefield: n('plains', 4) },
      p2: { battlefield: ['serra-angel', 'eager-first-year'] },
    });
    cast(b, 'defend-the-campus', [b.ref(b.id('p2', 'serra-angel'))], { mode: 1 });
    settle(b);
    done(b);
    expect(b.state.players.p2.graveyard.map((id) => b.obj(id).defId)).toEqual(['serra-angel']);
  });

  it('Introduction to Annihilation exiles a nonland permanent and its controller draws', () => {
    const g = game({
      p1: { hand: ['introduction-to-annihilation'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel'], library: ['plains', 'plains'] },
    });
    cast(g, 'introduction-to-annihilation', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.state.players.p2.hand).toHaveLength(1);
    expect(g.state.battlefield.some((id) => g.obj(id).defId === 'serra-angel')).toBe(false);
  });

  it('Teachings of the Archaics draws two only when an opponent has more cards', () => {
    const g = game({
      p1: {
        hand: ['teachings-of-the-archaics'],
        library: n('plains', 4),
        battlefield: n('island', 3),
      },
      p2: { hand: n('plains', 4) },
    });
    cast(g, 'teachings-of-the-archaics');
    done(g);
    expect(handSize(g)).toBe(2);

    const h = game({
      p1: {
        hand: ['teachings-of-the-archaics'],
        library: n('plains', 4),
        battlefield: n('island', 3),
      },
    });
    cast(h, 'teachings-of-the-archaics');
    done(h);
    expect(handSize(h)).toBe(0);
  });
});

describe('equipment and enchantments', () => {
  it('Zephyr Boots gives flying with equip {2}', () => {
    const g = game({
      p1: { battlefield: ['zephyr-boots', 'eager-first-year', ...n('plains', 2)] },
    });
    const boots = g.id('p1', 'zephyr-boots');
    const guy = g.id('p1', 'eager-first-year');
    expect(getCharacteristics(g.state, cardDb, guy).keywords).not.toContain('flying');
    activate(g, boots, 2);
    settle(g);
    done(g);
    expect(getCharacteristics(g.state, cardDb, guy).keywords).toContain('flying');
  });

  it('Sparring Regimen learns on entering', () => {
    const g = game({
      p1: {
        hand: ['sparring-regimen'],
        battlefield: n('plains', 3),
        sideboard: ['introduction-to-prophecy'],
      },
    });
    cast(g, 'sparring-regimen');
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, 0);
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});

describe('the rest of the deck', () => {
  it('Detention Vortex stops a creature from attacking or blocking', () => {
    const g = game({
      p1: { hand: ['detention-vortex'], battlefield: n('plains', 1) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'detention-vortex', [g.ref(angel)]);
    done(g);
    const c = getCharacteristics(g.state, cardDb, angel);
    expect(c.cantAttack).toBe(true);
    expect(c.cantBlock).toBe(true);
  });

  it('Vortex Runner gets +1/+0 and can’t be blocked with eight lands', () => {
    const few = game({ p1: { battlefield: ['vortex-runner', ...n('island', 7)] } });
    expect(pt(few, few.id('p1', 'vortex-runner'))).toEqual([2, 3]);
    const many = game({ p1: { battlefield: ['vortex-runner', ...n('island', 8)] } });
    const runner = many.id('p1', 'vortex-runner');
    expect(pt(many, runner)).toEqual([3, 3]);
    expect(getCharacteristics(many.state, cardDb, runner).cantBeBlocked).toBe(true);
  });

  it('Dream Strix is sacrificed when an opponent targets it', () => {
    const g = game({
      p1: { battlefield: ['dream-strix'], sideboard: ['introduction-to-prophecy'] },
      p2: { hand: ['shock'], battlefield: n('mountain', 1) },
    });
    const strix = g.id('p1', 'dream-strix');
    g.pass();
    cast(g, 'shock', [g.ref(strix)]);
    done(g);
    expect(g.zoneOf(strix)).toBe('graveyard');
  });

  it('Thunderous Orator gains flying when attacking beside a flyer', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['thunderous-orator', 'serra-angel'] },
    });
    const orator = g.id('p1', 'thunderous-orator');
    expect(getCharacteristics(g.state, cardDb, orator).keywords).not.toContain('flying');
    g.passBoth();
    g.attack(orator);
    settle(g);
    const keywords = getCharacteristics(g.state, cardDb, orator).keywords;
    expect(keywords).toContain('flying');
    expect(keywords).not.toContain('lifelink');
  });

  it('Elemental Summoning makes a 4/4 Elemental', () => {
    const g = game({ p1: { hand: ['elemental-summoning'], battlefield: n('island', 5) } });
    done(cast(g, 'elemental-summoning'));
    const el = g.state.battlefield.find((id) => g.obj(id).defId === 'stx-elemental-ur-token')!;
    expect(pt(g, el)).toEqual([4, 4]);
  });

  it('Excavated Wall mills a card for {1}', () => {
    const g = game({
      p1: { battlefield: ['excavated-wall', 'plains'], library: ['island', 'island'] },
    });
    activate(g, g.id('p1', 'excavated-wall'));
    done(g);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });
});
