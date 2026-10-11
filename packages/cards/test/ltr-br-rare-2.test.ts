import { describe, expect, it } from 'vitest';
import { type Action, getColors } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  board,
  casts,
  chars,
  choose,
  done,
  exile,
  game,
  gy,
  labels,
  n,
  passTo,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb } from '../src/index.ts';

// The Lord of the Rings 21d: the black and red rares of the random slot (part two: black creatures and Shadow of the Enemy).

const LIONS = 'savannah-lions';
const ELVES = 'llanowar-elves';
const BALOTH = 'rumbling-baloth';
const SAURON = 'sauron-the-necromancer';
const WITCH_KING = 'witch-king-of-angmar';
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
const setBearer = (g: GameDriver, id: string, p: 'p1' | 'p2' = 'p1') => {
  g.state.players[p].ring = { tempted: 1, bearer: { id, zcc: g.obj(id).zcc } };
};

/** Moves to the declare attackers decision and attacks the opponent with these creatures. */
function attack(g: GameDriver, attackers: string[], by: 'p1' | 'p2' = 'p1'): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({
      type: 'addAttacker',
      player: by,
      attacker,
      defender: by === 'p1' ? 'p2' : 'p1',
    });
  g.do({ type: 'confirmAttackers', player: by });
  return g;
}

/** Picks the trigger's target and resolves it as far as the first prompt. */
function toPrompt(g: GameDriver): void {
  if (g.decision.kind === 'chooseTriggerTargets')
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!);
  stop(g);
}

describe('Sauron, the Necromancer', () => {
  const setup = (gyCards: string[] = [BALOTH], extra: string[] = []) =>
    game({
      p1: { battlefield: [SAURON, ...extra], graveyard: gyCards },
      p2: { library: n('forest', 8) },
    });
  const token = (g: GameDriver) =>
    g.state.battlefield.filter((id) => g.obj(id).isToken && g.obj(id).controller === 'p1')[0]!;

  it('has menace', () => {
    const g = setup();
    expect(chars(g, g.id('p1', SAURON)).keywords.has('menace')).toBe(true);
  });

  it('attacks: exiles the creature card, and a tapped and attacking copy is a 3/3 black Wraith with menace', () => {
    const g = setup();
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    expect(exile(g)).toEqual([BALOTH]);
    expect(gy(g)).toHaveLength(0);
    const t = token(g);
    expect(g.obj(t).defId).toBe(BALOTH);
    expect(g.obj(t).tapped).toBe(true);
    expect(g.state.combat?.attackers.some((a) => a.id === t && a.defender === 'p2')).toBe(true);
    const c = chars(g, t);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.subtypes).toEqual(['Wraith']);
    expect(c.keywords.has('menace')).toBe(true);
    expect([...getColors(g.state, cardDb, t)]).toEqual(['B']);
  });

  it('the copy has the abilities of the card (a flier keeps flying) and deals combat damage', () => {
    const g = setup(['serra-angel']);
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    expect(chars(g, token(g)).keywords.has('flying')).toBe(true);
    expect(chars(g, token(g)).keywords.has('vigilance')).toBe(true);
    // Sauron 4 + the token 3.
    for (let i = 0; i < 6 && g.life('p2') === 20; i++) {
      if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
      else g.pass();
    }
    expect(g.life('p2')).toBe(13);
  });

  it('at the beginning of the next end step the token is exiled', () => {
    const g = setup();
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    const t = token(g);
    passTo(g, 'end', 'p1');
    done(g);
    expect(g.state.objects[t]).toBeUndefined();
    expect(board(g, BALOTH)).toHaveLength(0);
    expect(exile(g)).toEqual([BALOTH]);
  });

  it('unless Sauron is your Ring-bearer: then the token stays', () => {
    const g = setup();
    setBearer(g, g.id('p1', SAURON));
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    const t = token(g);
    passTo(g, 'end', 'p1');
    done(g);
    expect(g.state.objects[t]?.zone).toBe('battlefield');
    // It lasts into the next turns too: nothing else exiles it.
    passTo(g, 'main1', 'p1');
    expect(g.state.objects[t]?.zone).toBe('battlefield');
  });

  it("another creature as Ring-bearer doesn't save the token", () => {
    const g = setup([BALOTH], [LIONS]);
    setBearer(g, g.id('p1', LIONS));
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    const t = token(g);
    passTo(g, 'end', 'p1');
    done(g);
    expect(g.state.objects[t]).toBeUndefined();
  });

  it('when the opponent controls a planeswalker, you choose what the token attacks', () => {
    const g = game({
      p1: { battlefield: [SAURON], graveyard: [BALOTH] },
      p2: { battlefield: [{ card: 'vivien-reid', loyalty: 5 }], library: n('forest', 8) },
    });
    attack(g, [g.id('p1', SAURON)]);
    toPrompt(g);
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual(['Attack your opponent', 'Attack Vivien Reid']);
    choose(g, /Vivien/);
    done(g);
    const t = token(g);
    const entry = g.state.combat?.attackers.find((x) => x.id === t);
    expect(entry?.planeswalker).toBe(g.id('p2', 'vivien-reid'));
  });

  it('the token can attack the opponent even when they control a planeswalker', () => {
    const g = game({
      p1: { battlefield: [SAURON], graveyard: [BALOTH] },
      p2: { battlefield: [{ card: 'vivien-reid', loyalty: 5 }], library: n('forest', 8) },
    });
    attack(g, [g.id('p1', SAURON)]);
    toPrompt(g);
    choose(g, /opponent/);
    done(g);
    const entry = g.state.combat?.attackers.find((x) => x.id === token(g));
    expect(entry?.planeswalker).toBeUndefined();
    expect(entry?.defender).toBe('p2');
  });

  it('with no creature card in the graveyard there is no target: nothing happens', () => {
    const g = setup(['shock']);
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
    expect(gy(g)).toEqual(['shock']);
  });

  it('only a creature card from your own graveyard', () => {
    const g = game({
      p1: { battlefield: [SAURON] },
      p2: { graveyard: [BALOTH] },
    });
    attack(g, [g.id('p1', SAURON)]);
    done(g);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
    expect(gy(g, 'p2')).toEqual([BALOTH]);
  });
});

describe('Witch-king of Angmar', () => {
  const setup = (p2Creatures: string[], p1Hand: string[] = []) =>
    game({
      p1: { battlefield: [WITCH_KING], hand: p1Hand },
      p2: { battlefield: p2Creatures },
      active: 'p2',
    });
  const attackWith = (g: GameDriver, ids: string[]) => {
    attack(g, ids, 'p2');
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({ type: 'confirmBlockers', player: 'p1' });
    // Combat damage is dealt; the trigger is on the stack.
    for (let i = 0; i < 6 && g.state.stack.length === 0 && g.decision.kind === 'priority'; i++)
      g.pass();
  };

  it('has flying', () => {
    const g = setup([]);
    expect(chars(g, g.id('p1', WITCH_KING)).keywords.has('flying')).toBe(true);
  });

  it('when creatures deal combat damage to you: the opponent sacrifices one of them, and the Ring tempts you', () => {
    const g = setup([ELVES, LIONS, BALOTH]);
    const elves = g.id('p2', ELVES);
    const lions = g.id('p2', LIONS);
    attackWith(g, [elves, lions]);
    // Several damaged you: one trigger (one or more), the opponent chooses.
    for (let i = 0; i < 6 && g.decision.kind !== 'chooseOption'; i++) {
      if (g.decision.kind !== 'priority') break;
      g.pass();
    }
    expect(g.decision.kind).toBe('chooseOption');
    if (g.decision.kind !== 'chooseOption') return;
    expect(g.decision.player).toBe('p2');
    // Only the creatures that dealt combat damage to you are on offer (not the Baloth that stayed home).
    expect(labels(g).sort()).toEqual(['Sacrifice Llanowar Elves', 'Sacrifice Savannah Lions'].sort());
    choose(g, /Lions/);
    done(g);
    expect(gy(g, 'p2')).toEqual([LIONS]);
    expect(board(g, ELVES)).toHaveLength(1);
    expect(board(g, BALOTH)).toHaveLength(1);
    expect(ringLevel(g)).toBe(1);
    expect(g.life('p1')).toBe(20 - 1 - 2);
  });

  it('a single creature that dealt combat damage is sacrificed without a prompt', () => {
    const g = setup([ELVES, BALOTH]);
    attackWith(g, [g.id('p2', ELVES)]);
    done(g);
    expect(gy(g, 'p2')).toEqual([ELVES]);
    expect(board(g, BALOTH)).toHaveLength(1);
    expect(ringLevel(g)).toBe(1);
  });

  it('a creature blocked by another one deals no damage to you: no trigger', () => {
    const g = game({
      p1: { battlefield: [WITCH_KING, BALOTH] },
      p2: { battlefield: [ELVES] },
      active: 'p2',
    });
    attack(g, [g.id('p2', ELVES)], 'p2');
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.do({
      type: 'addBlock',
      player: 'p1',
      blocker: g.id('p1', BALOTH),
      attacker: g.id('p2', ELVES),
    });
    g.do({ type: 'confirmBlockers', player: 'p1' });
    done(g);
    expect(ringLevel(g)).toBe(0);
    expect(g.life('p1')).toBe(20);
  });

  it('Discard a card: gains indestructible until end of turn. Tap him.', () => {
    const g = game({ p1: { battlefield: [WITCH_KING], hand: ['shock'] } });
    const wk = g.id('p1', WITCH_KING);
    const acts = abilityActions(g, wk, 1);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    expect(gy(g)).toEqual(['shock']);
    expect(g.obj(wk).tapped).toBe(true);
    expect(chars(g, wk).keywords.has('indestructible')).toBe(true);
  });

  it("can't be activated without a card to discard", () => {
    const g = game({ p1: { battlefield: [WITCH_KING] } });
    expect(abilityActions(g, g.id('p1', WITCH_KING), 1)).toHaveLength(0);
  });
});

describe('Shadow of the Enemy', () => {
  const SHADOW = 'shadow-of-the-enemy';
  const castable = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
    g
      .legal(p)
      .filter(
        (a) =>
          a.type === 'castSpell' &&
          g.obj(a.card).defId === defId &&
          g.obj(a.card).zone === 'exile',
      ) as Extract<Action, { type: 'castSpell' }>[];

  it("exiles all creature cards from target player's graveyard (not other cards)", () => {
    const g = game({
      p1: { hand: [SHADOW], battlefield: n('swamp', 6) },
      p2: { graveyard: [BALOTH, ELVES, 'shock', 'forest'] },
    });
    g.do(casts(g, SHADOW).find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    done(g);
    expect(exile(g, 'p2').sort()).toEqual([BALOTH, ELVES].sort());
    expect(gy(g, 'p2').sort()).toEqual(['forest', 'shock']);
  });

  it("you may cast those cards from exile with any mana, and an opponent can't", () => {
    const g = game({
      p1: { hand: [SHADOW], battlefield: n('swamp', 9) },
      p2: { graveyard: [ELVES], battlefield: n('forest', 3) },
    });
    g.do(casts(g, SHADOW).find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    done(g);
    // Llanowar Elves costs {G}; only swamps are on the battlefield.
    const c = castable(g, ELVES);
    expect(c.length).toBeGreaterThan(0);
    expect(castable(g, ELVES, 'p2')).toHaveLength(0);
    g.do(c[0]!);
    done(g);
    expect(board(g, ELVES, 'p1')).toHaveLength(1);
    expect(exile(g, 'p2')).toHaveLength(0);
  });

  it('works on your own graveyard too, for as long as the cards remain exiled', () => {
    const g = game({
      p1: { hand: [SHADOW], battlefield: n('swamp', 9), graveyard: [ELVES, LIONS] },
    });
    g.do(casts(g, SHADOW).find((a) => a.targets.some((t) => 'player' in t && t.player === 'p1'))!);
    done(g);
    expect(exile(g).sort()).toEqual([ELVES, LIONS].sort());
    // Later turns too.
    passTo(g, 'main1', 'p1');
    const c = castable(g, LIONS);
    expect(c.length).toBeGreaterThan(0);
    g.do(c[0]!);
    done(g);
    expect(board(g, LIONS, 'p1')).toHaveLength(1);
    expect(exile(g)).toEqual([ELVES]);
  });

  it('with no creature cards in the graveyard it does nothing', () => {
    const g = game({
      p1: { hand: [SHADOW], battlefield: n('swamp', 6) },
      p2: { graveyard: ['shock'] },
    });
    g.do(casts(g, SHADOW).find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['shock']);
  });
});

