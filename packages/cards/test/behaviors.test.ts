import { createEngine, getCharacteristics } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

const engine = createEngine(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const mountains = (n: number) => Array<string>(n).fill('mountain');
const forests = (n: number) => Array<string>(n).fill('forest');
const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};

describe('red cards', () => {
  it('Heartfire Immolator: prowess, then sacrifice for damage equal to its power', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: [...mountains(2), 'heartfire-immolator'] },
      p2: { battlefield: ['magnigoth-sentry'] },
    });
    const imm = g.id('p1', 'heartfire-immolator');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [{ player: 'p2' }],
    });
    g.passBoth().passBoth(); // prowess trigger, then shock
    expect(pt(g, imm)).toEqual([3, 3]);
    const sentry = g.id('p2', 'magnigoth-sentry');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: imm,
      abilityIndex: 1,
      targets: [g.ref(sentry)],
    });
    g.passBoth();
    expect(g.obj(sentry).damage).toBe(3);
  });

  it('Ball Lightning is sacrificed at the end step', () => {
    const g = game({ p1: { hand: ['ball-lightning'], battlefield: mountains(3) } });
    const ball = g.id('p1', 'ball-lightning', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: ball, targets: [] }).passBoth();
    g.passUntilStep('declareAttackers');
    expect(g.zoneOf(ball)).toBe('battlefield');
    g.passUntilStep('end');
    expect(g.state.stack).toHaveLength(1);
    g.passBoth();
    expect(g.zoneOf(ball)).toBe('graveyard');
  });

  it('Searslicer Goblin only makes a token if you attacked', () => {
    const quiet = game({ step: 'main2', p1: { battlefield: ['searslicer-goblin'] } });
    quiet.passUntilStep('end');
    expect(quiet.state.stack).toHaveLength(0);

    const g = game({ step: 'beginCombat', p1: { battlefield: ['searslicer-goblin'] } });
    g.passBoth().attack(g.id('p1', 'searslicer-goblin'));
    g.passUntilStep('end').passBoth();
    expect(g.state.battlefield.map((id) => g.obj(id).defId)).toContain('goblin-token');
  });

  it('Giant Cindermaw stops Pelakka Wurm’s life gain', () => {
    const g = game({
      p1: { hand: ['pelakka-wurm'], battlefield: forests(7) },
      p2: { battlefield: ['giant-cindermaw'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'pelakka-wurm', 'hand'),
      targets: [],
    });
    g.passBoth().passBoth();
    expect(g.life('p1')).toBe(20);
  });

  it('Battlesong Berserker pumps an attacker when you attack', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['battlesong-berserker', 'swab-goblin'] },
    });
    const swab = g.id('p1', 'swab-goblin');
    g.passBoth().attack(swab);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(swab)] }).passBoth();
    expect(getCharacteristics(g.state, cardDb, swab)).toMatchObject({ power: 3 });
    expect(getCharacteristics(g.state, cardDb, swab).keywords.has('menace')).toBe(true);
  });
});

describe('green cards', () => {
  it('Gnarlback Rhino draws when you target it', () => {
    const g = game({ p1: { hand: ['giant-growth'], battlefield: ['forest', 'gnarlback-rhino'] } });
    const rhino = g.id('p1', 'gnarlback-rhino');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'giant-growth', 'hand'),
      targets: [g.ref(rhino)],
    });
    g.passBoth().passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(pt(g, rhino)).toEqual([7, 7]);
  });

  it("Dwynen's Elite + Imperious Perfect make pumped Elf tokens", () => {
    const g = game({
      p1: { hand: ['dwynens-elite'], battlefield: [...forests(3), 'imperious-perfect'] },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'dwynens-elite', 'hand'),
      targets: [],
    });
    g.passBoth().passBoth();
    const token = g.id('p1', 'elf-warrior-token');
    expect(pt(g, token)).toEqual([2, 2]);
    expect(pt(g, g.id('p1', 'dwynens-elite'))).toEqual([3, 3]);
  });

  it("Heroes' Bane enters with four counters and doubles its power", () => {
    const g = game({ p1: { hand: ['heroes-bane'], battlefield: forests(9) } });
    const bane = g.id('p1', 'heroes-bane', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: bane, targets: [] }).passBoth();
    expect(pt(g, bane)).toEqual([4, 4]);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: bane,
      abilityIndex: 0,
      targets: [],
    }).passBoth();
    expect(pt(g, bane)).toEqual([8, 8]);
  });

  it('Felling Blow adds a counter, then bites', () => {
    const g = game({
      p1: { hand: ['felling-blow'], battlefield: [...forests(3), 'bear-cub'] },
      p2: { battlefield: ['fire-elemental'] },
    });
    const fe = g.id('p2', 'fire-elemental');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'felling-blow', 'hand'),
      targets: [g.ref(g.id('p1', 'bear-cub')), g.ref(fe)],
    }).passBoth();
    expect(g.obj(fe).damage).toBe(3);
  });

  it('Aggressive Mammoth gives other creatures trample', () => {
    const g = game({ p1: { battlefield: ['aggressive-mammoth', 'bear-cub'] } });
    const c = getCharacteristics(g.state, cardDb, g.id('p1', 'bear-cub'));
    expect(c.keywords.has('trample')).toBe(true);
  });

  it('Rampaging Baloths makes a Beast on landfall', () => {
    const g = game({ p1: { hand: ['forest'], battlefield: ['rampaging-baloths'] } });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(pt(g, g.id('p1', 'beast-token'))).toEqual([4, 4]);
  });

  it('Broken Wings can only target fliers', () => {
    const g = game({
      p1: { hand: ['broken-wings'], battlefield: forests(3) },
      p2: { battlefield: ['shivan-dragon', 'fire-elemental'] },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(casts).toHaveLength(1);
    g.do(casts[0]!).passBoth();
    expect(g.state.players.p2.graveyard.map((id) => g.obj(id).defId)).toEqual(['shivan-dragon']);
  });
});
