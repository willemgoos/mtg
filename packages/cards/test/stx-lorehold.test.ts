import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckGameOptions, isPlayable } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13a: Lorehold Reckoning (R/W) and its Lessons.

const SPIRIT = 'lorehold-spirit-token';
const activate = (g: GameDriver, source: string, index = 0) =>
  g.do(
    g
      .legal()
      .find(
        (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
      )!,
  );
const spirits = (g: GameDriver, who: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === SPIRIT && g.obj(id).controller === who);
/** Resolves the stack, declining any Learn offer (the last option). */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 30; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: false });
    else break;
  }
  return g;
}

/** Passes priority until something other than a plain stack resolution needs an answer. */
function resolve(g: GameDriver): GameDriver {
  for (let i = 0; i < 30 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
  return g;
}

describe('Lorehold Reckoning: magecraft creatures', () => {
  it('Eager First-Year and Lorehold Pledgemage get +1/+0 per instant or sorcery', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['eager-first-year', 'lorehold-pledgemage', ...n('plains', 2)],
      },
    });
    const first = g.id('p1', 'eager-first-year');
    const pledge = g.id('p1', 'lorehold-pledgemage');
    done(cast(g, 'beaming-defiance', [g.ref(first)]));
    expect(pt(g, first)).toEqual([2 + 2 + 1, 2 + 2]); // Beaming Defiance +2/+2, magecraft +1/+0
    expect(pt(g, pledge)).toEqual([3, 2]);
    expect(cardDb.get('lorehold-pledgemage')!.keywords).toContain('firstStrike');
  });

  it('Lorehold Apprentice lets Spirits tap to ping each opponent until end of turn', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['lorehold-apprentice', SPIRIT, ...n('plains', 2)],
      },
    });
    const token = g.id('p1', SPIRIT);
    const apprentice = g.id('p1', 'lorehold-apprentice');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === token)).toBe(false);
    done(cast(g, 'beaming-defiance', [g.ref(apprentice)]));
    activate(g, token);
    done(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(token).tapped).toBe(true);
    // Not the Apprentice itself (not a Spirit), and gone at end of turn.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === apprentice)).toBe(
      false,
    );
    g.passUntilStep('end');
    g.passBoth();
    expect(g.obj(token).tempAbilities).toBeUndefined();
  });

  it('Storm-Kiln Artist gets +1/+0 per artifact and makes a Treasure on magecraft', () => {
    const g = game({
      p1: {
        hand: ['beaming-defiance'],
        battlefield: ['storm-kiln-artist', 'treasure-token', ...n('plains', 2)],
      },
    });
    const artist = g.id('p1', 'storm-kiln-artist');
    expect(pt(g, artist)).toEqual([3, 2]);
    done(cast(g, 'beaming-defiance', [g.ref(artist)]));
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'treasure-token')).toHaveLength(
      2,
    );
    expect(pt(g, artist)).toEqual([6, 4]);
  });
});

describe('Lorehold Reckoning: Spirits and the graveyard', () => {
  it('Quintorius gives Spirits +1/+0 and makes one when cards leave your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['quintorius-field-historian', SPIRIT, ...n('mountain', 5)],
        graveyard: ['illustrious-historian'],
      },
    });
    expect(pt(g, g.id('p1', SPIRIT))).toEqual([4, 2]);
    expect(pt(g, g.id('p1', 'quintorius-field-historian'))).toEqual([2, 4]);
    activate(g, g.id('p1', 'illustrious-historian', 'graveyard'));
    done(g);
    // The Historian's own token (tapped) plus Quintorius's.
    expect(spirits(g)).toHaveLength(3);
    expect(spirits(g).filter((id) => g.obj(id).tapped)).toHaveLength(1);
  });

  it('Illustrious Historian can only be activated from the graveyard, for {5}', () => {
    const g = game({ p1: { battlefield: n('mountain', 4), graveyard: ['illustrious-historian'] } });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
    const h = game({ p1: { battlefield: n('mountain', 5), graveyard: ['illustrious-historian'] } });
    activate(h, h.id('p1', 'illustrious-historian', 'graveyard'));
    done(h);
    expect(spirits(h)).toHaveLength(1);
    expect(h.obj(spirits(h)[0]!).tapped).toBe(true);
    expect(pt(h, spirits(h)[0]!)).toEqual([3, 2]);
    expect(h.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Pillardrop Rescuer returns a creature card with mana value 3 or less, not a bigger one', () => {
    const g = game({
      p1: {
        hand: ['pillardrop-rescuer'],
        battlefield: n('plains', 5),
        graveyard: ['serra-angel', 'eager-first-year'],
      },
    });
    done(cast(g, 'pillardrop-rescuer'));
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['eager-first-year']);
  });

  it('Returned Pastcaller returns a Spirit, instant or sorcery, but not another creature', () => {
    const g = game({
      p1: {
        hand: ['returned-pastcaller'],
        battlefield: [...n('mountain', 3), ...n('plains', 3)],
        graveyard: ['serra-angel', 'pillardrop-warden', 'shock'],
      },
    });
    cast(g, 'returned-pastcaller');
    g.passBoth();
    const d = g.decision;
    expect(d.kind).toBe('chooseTriggerTargets');
    const targets = g
      .legal()
      .filter((a) => a.type === 'chooseTargets' && a.targets.length > 0)
      .map((a) => (a as { targets: { object: { id: string } }[] }).targets[0]!.object.id)
      .map((id) => g.obj(id).defId)
      .sort();
    expect(targets).toEqual(['pillardrop-warden', 'shock']);
  });

  it('Pillardrop Warden sacrifices itself at sorcery speed to return an instant or sorcery', () => {
    const g = game({
      p1: {
        battlefield: ['pillardrop-warden', ...n('mountain', 2)],
        graveyard: ['shock', 'serra-angel'],
      },
    });
    const warden = g.id('p1', 'pillardrop-warden');
    const shock = g.id('p1', 'shock', 'graveyard');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === warden)! as never);
    // Choose the Shock (the only legal target).
    done(g);
    expect(g.zoneOf(warden)).toBe('graveyard');
    expect(g.zoneOf(shock)).toBe('hand');
  });

  it('Tome Shredder exiles an instant or sorcery from your graveyard for a +1/+1 counter', () => {
    const empty = game({ p1: { battlefield: ['tome-shredder'], graveyard: ['serra-angel'] } });
    expect(empty.legal().some((a) => a.type === 'activateAbility')).toBe(false);
    const g = game({ p1: { battlefield: ['tome-shredder'], graveyard: ['serra-angel', 'shock'] } });
    const shredder = g.id('p1', 'tome-shredder');
    activate(g, shredder);
    done(g);
    expect(g.obj(shredder).plusOneCounters).toBe(1);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['serra-angel']);
  });

  it('Stonerise Spirit exiles a graveyard card of your choice to give a creature flying', () => {
    const g = game({
      p1: {
        battlefield: ['stonerise-spirit', 'eager-first-year', ...n('plains', 4)],
        graveyard: ['shock', 'plains'],
      },
    });
    const first = g.id('p1', 'eager-first-year');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'stonerise-spirit'),
      abilityIndex: 0,
      targets: [g.ref(first)],
    });
    // Reality Fracture (17a fixes): the player chooses the card (two different ones: it asks).
    expect(g.decision.kind).toBe('forageExile');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'plains', 'graveyard') });
    done(g);
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['shock']);
    expect(getCharacteristics(g.state, cardDb, first).keywords.has('flying')).toBe(true);
  });
});

describe('Lorehold Reckoning: spells', () => {
  it('Combat Professor gives a creature +1/+0 and vigilance at the beginning of combat', () => {
    const g = game({ p1: { battlefield: ['combat-professor', 'eager-first-year'] } });
    g.passBoth();
    settle(g);
    const mine = g.state.battlefield.filter((id) => g.obj(id).controller === 'p1');
    expect(mine.reduce((sum, id) => sum + pt(g, id)[0]!, 0)).toBe(2 + 2 + 1);
    expect(
      mine.some((id) => getCharacteristics(g.state, cardDb, id).keywords.has('vigilance')),
    ).toBe(true);
  });

  it('Heated Debate is uncounterable and deals 4 to a creature or planeswalker', () => {
    expect(cardDb.get('heated-debate')!.uncounterable).toBe(true);
    const g = game({
      p1: { hand: ['heated-debate'], battlefield: n('mountain', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    done(cast(g, 'heated-debate', [g.ref(g.id('p2', 'serra-angel'))]));
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
  });

  it('Expel only targets tapped creatures', () => {
    const g = game({
      p1: { hand: ['expel'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel', { card: 'eager-first-year', tapped: true }] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(() => cast(g, 'expel', [g.ref(angel)])).toThrow();
    const tapped = g.id('p2', 'eager-first-year');
    done(cast(g, 'expel', [g.ref(tapped)]));
    expect(g.zoneOf(tapped)).toBe('exile');
  });

  it('Make Your Mark pumps a creature, and a Spirit appears if it dies this turn', () => {
    const g = game({
      p1: {
        hand: ['make-your-mark', 'shock'],
        battlefield: ['eager-first-year', 'mountain', 'plains', 'mountain'],
      },
    });
    const first = g.id('p1', 'eager-first-year');
    done(cast(g, 'make-your-mark', [g.ref(first)]));
    expect(pt(g, first)[0]).toBe(4); // +1/+0, magecraft +1/+0
    done(cast(g, 'shock', [g.ref(first)]));
    expect(g.zoneOf(first)).toBe('graveyard');
    expect(spirits(g)).toHaveLength(1);
  });

  it('Pigment Storm deals the excess damage to the creature’s controller', () => {
    const g = game({
      p1: { hand: ['pigment-storm'], battlefield: n('mountain', 5) },
      p2: { battlefield: ['eager-first-year'] },
    });
    const target = g.id('p2', 'eager-first-year');
    done(cast(g, 'pigment-storm', [g.ref(target)]));
    expect(g.zoneOf(target)).toBe('graveyard');
    expect(g.life('p2')).toBe(17);
  });

  it('Lorehold Command: a Spirit and 3 damage to a target while a player gains 3', () => {
    const g = game({
      p1: { hand: ['lorehold-command'], battlefield: [...n('mountain', 3), ...n('plains', 2)] },
    });
    const modes = cardDb.get('lorehold-command')!.modes!;
    expect(modes).toHaveLength(6);
    const mode = modes.findIndex(
      (m) => m.label === 'Create a 3/2 Spirit + 3 damage to any target, a player gains 3 life',
    );
    expect(mode).toBeGreaterThanOrEqual(0);
    done(cast(g, 'lorehold-command', [{ player: 'p2' }, { player: 'p1' }], { mode }));
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);
    expect(spirits(g)).toHaveLength(1);
  });

  it('Lorehold Command: sacrifice a permanent, then draw two', () => {
    const g = game({
      p1: {
        hand: ['lorehold-command'],
        battlefield: [...n('mountain', 3), ...n('plains', 2), 'eager-first-year'],
      },
    });
    const modes = cardDb.get('lorehold-command')!.modes!;
    const mode = modes.findIndex(
      (m) =>
        m.label?.endsWith('Sacrifice a permanent, then draw two cards') &&
        m.label.startsWith('Create'),
    );
    cast(g, 'lorehold-command', [], { mode });
    resolve(g);
    expect(g.decision.kind).toBe('sacrificeSeveral');
    const d = g.decision as { options: string[] };
    g.do({ type: 'chooseCard', player: 'p1', card: d.options[0]! });
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(spirits(g)).toHaveLength(1);
  });

  it('Study Break taps up to two creatures and offers Learn', () => {
    const g = game({
      p1: { hand: ['study-break'], battlefield: n('plains', 2), sideboard: ['spirit-summoning'] },
      p2: { battlefield: ['serra-angel', 'eager-first-year'] },
    });
    const a = g.id('p2', 'serra-angel');
    cast(g, 'study-break', [g.ref(a), g.ref(g.id('p2', 'eager-first-year'))]);
    g.passBoth();
    expect(g.obj(a).tapped).toBe(true);
    expect(g.decision.kind).toBe('chooseOption');
  });

  it('Igneous Inspiration deals 3 damage and Learn puts a Lesson into your hand', () => {
    const g = game({
      p1: {
        hand: ['igneous-inspiration'],
        battlefield: n('mountain', 3),
        sideboard: ['spirit-summoning'],
      },
    });
    cast(g, 'igneous-inspiration', [{ player: 'p2' }]);
    g.passBoth();
    expect(g.life('p2')).toBe(17);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['spirit-summoning']);
  });

  it('Professor of Symbology learns when it enters', () => {
    const g = game({
      p1: {
        hand: ['professor-of-symbology'],
        battlefield: n('plains', 2),
        sideboard: ['introduction-to-prophecy'],
      },
    });
    cast(g, 'professor-of-symbology');
    resolve(g);
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual([
      'introduction-to-prophecy',
    ]);
  });

  it('Academic Dispute: you may give the creature reach, so it must block a flyer', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['academic-dispute'], battlefield: ['serra-angel', 'mountain'] },
      p2: { battlefield: ['eager-first-year'] },
    });
    const first = g.id('p2', 'eager-first-year');
    cast(g, 'academic-dispute', [g.ref(first)]);
    resolve(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g);
    g.passBoth();
    g.attack(g.id('p1', 'serra-angel'));
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat!.attackers[0]!.blockers).toEqual([first]);
  });

  it('Academic Dispute: a forced blocker that can block does', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['academic-dispute'], battlefield: ['eager-first-year', 'mountain'] },
      p2: { battlefield: ['lorehold-pledgemage'] },
    });
    const first = g.id('p1', 'eager-first-year');
    const pledge = g.id('p2', 'lorehold-pledgemage');
    cast(g, 'academic-dispute', [g.ref(pledge)]);
    done(g);
    g.passBoth();
    g.attack(first);
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p2' });
    expect(g.state.combat!.attackers[0]!.blockers).toEqual([pledge]);
  });

  it('Reduce to Memory exiles a permanent and its controller gets a Spirit', () => {
    const g = game({
      p1: { hand: ['reduce-to-memory'], battlefield: [...n('plains', 2), 'plains'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    done(cast(g, 'reduce-to-memory', [g.ref(angel)]));
    expect(g.zoneOf(angel)).toBe('exile');
    expect(spirits(g, 'p2')).toHaveLength(1);
    expect(spirits(g, 'p1')).toHaveLength(0);
  });

  it('Start from Scratch and Expanded Anatomy work', () => {
    const g = game({
      p1: { hand: ['expanded-anatomy'], battlefield: [...n('plains', 3), 'eager-first-year'] },
    });
    const first = g.id('p1', 'eager-first-year');
    done(cast(g, 'expanded-anatomy', [g.ref(first)]));
    expect(g.obj(first).plusOneCounters).toBe(2);
    expect(cardDb.get('start-from-scratch')!.modes).toHaveLength(2);
  });
});

describe('Lorehold Reckoning: the deck', () => {
  const deck = deckById('stx-lorehold-reckoning');

  it('has 60 cards, a five-Lesson sideboard and only implemented cards', () => {
    expect(deck.cards.reduce((s, [, c]) => s + c, 0)).toBe(60);
    expect(deck.sideboard!.reduce((s, [, c]) => s + c, 0)).toBe(5);
    expect(isPlayable(deck)).toBe(true);
  });

  it('plays random games to the end against a starter deck and itself', () => {
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 12; seed++) {
      const other = seed % 2 ? deck : deckById('arcane-aerialists');
      const r = playRandomGame(
        engine,
        engine.newGame({ ...deckGameOptions(deck, other), seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
