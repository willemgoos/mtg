import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import {
  abilityActions,
  activate,
  board,
  casts,
  chars,
  done,
  exile,
  game,
  gy,
  hand,
  n,
  passTo,
  stop,
} from './ecl-special-helpers.ts';
import { cardDb } from '../src/index.ts';

// The Lord of the Rings 21d: the multicolour rares (part four: Sauron the Dark Lord, Saruman of Many Colors, Sharkey).

type Cast = Extract<Action, { type: 'castSpell' }>;
const ARMY = 'ltr-orc-army-token';
const SAURON = 'sauron-the-dark-lord';
const SARUMAN = 'saruman-of-many-colors';
const SHARKEY = 'sharkey-tyrant-of-the-shire';
const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
const kw = (g: GameDriver, id: string) => chars(g, id).keywords;
const ringLevel = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring?.tempted ?? 0;
function attack(g: GameDriver, attackers: string[]): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
  return g;
}

describe('Sauron, the Dark Lord', () => {
  it('has ward—sacrifice a legendary artifact or legendary creature', () => {
    expect(cardDb.get(SAURON)!.keywords).toContain('ward');
    const w = cardDb.get(SAURON)!.wardCost!;
    expect(w.mana).toEqual({ generic: 0, colored: {} });
    expect(w.sacrificeMatching).toBeDefined();
  });

  it('an opponent can target it only by sacrificing a legendary artifact or legendary creature', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SAURON] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'savannah-lions'] },
    });
    // No legendary artifact or creature: Sauron can't be targeted.
    expect(casts(g, 'shock', 'p2').some(targeting(g.id('p1', SAURON)))).toBe(false);
    const h = game({
      active: 'p2',
      p1: { battlefield: [SAURON] },
      p2: {
        hand: ['shock'],
        battlefield: ['mountain', 'savannah-lions', 'gothmog-morgul-lieutenant'],
      },
    });
    const sauron = h.id('p1', SAURON);
    h.do(casts(h, 'shock', 'p2').find(targeting(sauron))!);
    // The one legendary creature is sacrificed (no real choice).
    expect(gy(h, 'p2')).toEqual(['gothmog-morgul-lieutenant']);
    done(h);
    expect(h.obj(sauron).damage).toBe(2);
  });

  it('you choose which one to sacrifice', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SAURON] },
      p2: {
        hand: ['shock'],
        battlefield: [
          'mountain',
          'savannah-lions',
          'gothmog-morgul-lieutenant',
          'aragorn-the-uniter',
        ],
      },
    });
    g.do(casts(g, 'shock', 'p2').find(targeting(g.id('p1', SAURON)))!);
    expect(g.decision.kind).toBe('wardSacrifice');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    // Only legendary creatures (and artifacts): not the Lions.
    expect(options.sort()).toEqual(['aragorn-the-uniter', 'gothmog-morgul-lieutenant']);
    g.do({ type: 'chooseCard', player: 'p2', card: g.id('p2', 'aragorn-the-uniter') });
    done(g);
    expect(gy(g, 'p2')).toContain('aragorn-the-uniter');
    expect(board(g, 'gothmog-morgul-lieutenant', 'p2')).toHaveLength(1);
  });

  it('a Ring-bearer is legendary: it can pay for ward', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SAURON] },
      p2: { hand: ['shock'], battlefield: ['mountain', 'savannah-lions'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    g.state.players.p2.ring = { tempted: 1, bearer: g.ref(lions).object };
    g.do(casts(g, 'shock', 'p2').find(targeting(g.id('p1', SAURON)))!);
    done(g);
    expect(gy(g, 'p2')).toContain('savannah-lions');
  });

  it('whenever an opponent casts a spell, amass Orcs 1', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SAURON] },
      p2: { hand: ['savannah-lions', 'savannah-lions'], battlefield: ['plains', 'plains'] },
    });
    g.do(casts(g, 'savannah-lions', 'p2')[0]!);
    done(g);
    const army = board(g, ARMY, 'p1');
    expect(army).toHaveLength(1);
    expect(plus(g, army[0]!)).toBe(1);
    g.do(casts(g, 'savannah-lions', 'p2')[0]!);
    done(g);
    expect(plus(g, army[0]!)).toBe(2);
  });

  it('not for your own spells', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: [SAURON, 'plains'] },
    });
    g.do(casts(g, 'savannah-lions')[0]!);
    done(g);
    expect(board(g, ARMY, 'p1')).toHaveLength(0);
  });

  it('whenever an Army you control deals combat damage to a player, the Ring tempts you', () => {
    const g = game({ p1: { battlefield: [SAURON, ARMY] } });
    const army = g.id('p1', ARMY);
    g.obj(army).plusOneCounters = 2;
    attack(g, [army]);
    passTo(g, 'main2', 'p1', { accept: false });
    expect(ringLevel(g)).toBe(1);
  });

  it('whenever the Ring tempts you, you may discard your hand; if you do, draw four cards', () => {
    const g = game({
      p1: {
        hand: ['shock', 'opt', 'savannah-lions'],
        battlefield: [SAURON, ARMY],
        library: n('forest', 8),
      },
    });
    const army = g.id('p1', ARMY);
    g.obj(army).plusOneCounters = 2;
    attack(g, [army]);
    passTo(g, 'main2', 'p1', { accept: true });
    expect(ringLevel(g)).toBe(1);
    expect(gy(g).sort()).toEqual(['opt', 'savannah-lions', 'shock']);
    expect(hand(g)).toEqual(['forest', 'forest', 'forest', 'forest']);
  });

  it('declining keeps your hand and draws nothing', () => {
    const g = game({
      p1: { hand: ['shock', 'opt'], battlefield: [SAURON, ARMY], library: n('forest', 8) },
    });
    const army = g.id('p1', ARMY);
    g.obj(army).plusOneCounters = 2;
    attack(g, [army]);
    passTo(g, 'main2', 'p1', { accept: false });
    expect(hand(g).sort()).toEqual(['opt', 'shock']);
  });

  it('with no cards in hand you may still discard it and draw four', () => {
    const g = game({
      p1: { hand: [], battlefield: [SAURON, ARMY], library: n('forest', 8) },
    });
    const army = g.id('p1', ARMY);
    g.obj(army).plusOneCounters = 2;
    attack(g, [army]);
    passTo(g, 'main2', 'p1', { accept: true });
    expect(hand(g)).toHaveLength(4);
  });
});

describe('Saruman of Many Colors', () => {
  it('has ward—discard an enchantment, instant, or sorcery card', () => {
    const w = cardDb.get(SARUMAN)!.wardCost!;
    expect(w.mana).toEqual({ generic: 0, colored: {} });
    expect(w.discardMatching).toBeDefined();
  });

  it('an opponent can target it only by discarding an enchantment, instant, or sorcery card (not the spell itself)', () => {
    const only = game({
      active: 'p2',
      p1: { battlefield: [SARUMAN] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
    });
    // Shock is the only such card: it can't be discarded to pay for itself.
    expect(casts(only, 'shock', 'p2').some(targeting(only.id('p1', SARUMAN)))).toBe(false);
    const creature = game({
      active: 'p2',
      p1: { battlefield: [SARUMAN] },
      p2: { hand: ['shock', 'savannah-lions'], battlefield: ['mountain'] },
    });
    expect(casts(creature, 'shock', 'p2').some(targeting(creature.id('p1', SARUMAN)))).toBe(false);
    const g = game({
      active: 'p2',
      p1: { battlefield: [SARUMAN] },
      p2: { hand: ['shock', 'opt', 'savannah-lions'], battlefield: ['mountain'] },
    });
    const saruman = g.id('p1', SARUMAN);
    g.do(casts(g, 'shock', 'p2').find(targeting(saruman))!);
    // The one instant to discard: no real choice.
    expect(gy(g, 'p2')).toEqual(['opt']);
    done(g);
    expect(g.obj(saruman).damage).toBe(2);
    expect(hand(g, 'p2')).toEqual(['savannah-lions']);
  });

  it('you choose which card to discard', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SARUMAN] },
      p2: { hand: ['shock', 'opt', 'giant-growth', 'savannah-lions'], battlefield: ['mountain'] },
    });
    g.do(casts(g, 'shock', 'p2').find(targeting(g.id('p1', SARUMAN)))!);
    expect(g.decision.kind).toBe('wardSacrifice');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(options.sort()).toEqual(['giant-growth', 'opt']);
    g.do({ type: 'chooseCard', player: 'p2', card: g.id('p2', 'giant-growth', 'hand') });
    done(g);
    expect(gy(g, 'p2')).toContain('giant-growth');
    expect(hand(g, 'p2')).toEqual(expect.arrayContaining(['opt', 'savannah-lions']));
  });

  const SECOND = (extra: { library?: string[]; board?: string[] } = {}) =>
    game({
      p1: {
        hand: ['llanowar-elves', 'llanowar-elves'],
        battlefield: [SARUMAN, 'forest', 'forest', ...(extra.board ?? [])],
      },
      p2: { library: extra.library ?? ['shock', 'savannah-lions', 'forest', 'forest'] },
    });

  it('whenever you cast your second spell each turn, each opponent mills two cards', () => {
    const g = SECOND();
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    // The first spell: nothing.
    expect(g.state.players.p2.library).toHaveLength(4);
    g.do(casts(g, 'llanowar-elves')[0]!);
    stop(g);
    expect(g.state.players.p2.library).toHaveLength(2);
    // (They are in the graveyard, or the one Saruman is about to take is exiled.)
    expect(g.state.players.p2.graveyard.length + g.state.players.p2.exile.length).toBe(2);
  });

  it('then exile an enchantment, instant, or sorcery card of theirs with mana value at most the spell\u2019s; copy it and cast the copy free', () => {
    const g = SECOND();
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    g.do(casts(g, 'llanowar-elves')[0]!);
    stop(g);
    // The reflexive trigger's target: Shock (mana value 1, the Elves' mana value is 1); the Lions aren't legal.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : []));
    expect(options).toEqual(['shock']);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!);
    stop(g);
    // The card is exiled and its copy may be cast without paying its mana cost.
    expect(exile(g, 'p2')).toContain('shock');
    expect(g.decision.kind).toBe('castFree');
    const cast = g.legal().find((a) => a.type === 'castSpell' && targetingPlayer('p2')(a))!;
    expect(cast).toBeDefined();
    g.do(cast);
    done(g);
    expect(g.life('p2')).toBe(18);
    // The copy ceases to exist; the card stays in exile.
    expect(exile(g, 'p2')).toEqual(['shock']);
    expect(gy(g, 'p1').filter((c) => c === 'shock')).toHaveLength(0);
    expect(g.state.players.p1.exile).toHaveLength(0);
  });

  it('you may choose not to cast the copy', () => {
    const g = SECOND();
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    g.do(casts(g, 'llanowar-elves')[0]!);
    stop(g);
    g.do(g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 1)!);
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    done(g);
    expect(g.life('p2')).toBe(20);
    expect(exile(g, 'p2')).toEqual(['shock']);
    expect(g.state.players.p1.exile).toHaveLength(0);
  });

  it('only a card with mana value at most that of the second spell', () => {
    const g = SECOND({ library: ['flame-of-anor', 'savannah-lions', 'forest'] });
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    g.do(casts(g, 'llanowar-elves')[0]!);
    stop(g);
    // Flame of Anor has mana value 3, the Elves 1: no legal target, so the trigger does nothing.
    expect(
      g.legal().filter((a) => a.type === 'chooseTargets' && a.targets.length > 0),
    ).toHaveLength(0);
    done(g);
    expect(exile(g, 'p2')).toEqual([]);
    expect(gy(g, 'p2')).toEqual(expect.arrayContaining(['flame-of-anor']));
  });

  it('a spell with a greater mana value allows a greater card', () => {
    const g = game({
      p1: {
        hand: ['llanowar-elves', 'serra-angel'],
        battlefield: [SARUMAN, ...n('forest', 2), ...n('plains', 4)],
      },
      p2: { library: ['flame-of-anor', 'savannah-lions', 'forest'] },
    });
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    g.do(casts(g, 'serra-angel')[0]!);
    stop(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseTargets' ? a.targets : []))
      .flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : []));
    expect(options).toEqual(['flame-of-anor']);
  });

  it('with an empty library nothing is milled, and so there is nothing to exile', () => {
    const g = SECOND({ library: [] });
    g.do(casts(g, 'llanowar-elves')[0]!);
    done(g);
    g.do(casts(g, 'llanowar-elves')[0]!);
    stop(g);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Sharkey, Tyrant of the Shire', () => {
  it('activated abilities of lands your opponents control can’t be activated unless they’re mana abilities', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SHARKEY] },
      p2: { battlefield: ['evolving-wilds', 'rogues-passage', 'savannah-lions'] },
    });
    const wilds = g.id('p2', 'evolving-wilds');
    const passage = g.id('p2', 'rogues-passage');
    expect(
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === wilds),
    ).toHaveLength(0);
    expect(
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === passage),
    ).toHaveLength(0);
  });

  it('mana abilities of those lands still work', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SHARKEY] },
      p2: { hand: ['soul-guide-lantern'], battlefield: ['rogues-passage'] },
    });
    // Rogue's Passage taps for {C} to cast the Lantern.
    expect(casts(g, 'soul-guide-lantern', 'p2')).toHaveLength(1);
    g.do(casts(g, 'soul-guide-lantern', 'p2')[0]!);
    done(g);
    expect(board(g, 'soul-guide-lantern', 'p2')).toHaveLength(1);
  });

  it('its own lands are not locked', () => {
    const g = game({
      p1: { battlefield: [SHARKEY, 'evolving-wilds'], library: ['plains', 'forest'] },
    });
    expect(abilityActions(g, g.id('p1', 'evolving-wilds'), 0).length).toBeGreaterThan(0);
  });

  it('without Sharkey, the opponent’s lands work', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['evolving-wilds'] },
    });
    expect(
      g
        .legal()
        .filter((a) => a.type === 'activateAbility' && a.source === g.id('p2', 'evolving-wilds'))
        .length,
    ).toBeGreaterThan(0);
  });

  it('has all activated abilities of lands your opponents control except mana abilities', () => {
    const g = game({
      p1: { battlefield: [SHARKEY] },
      p2: { battlefield: ['rogues-passage', 'forest'] },
    });
    const sharkey = g.id('p1', SHARKEY);
    const abilities = cardDb.get(SHARKEY)!.abilities;
    expect(abilities).toHaveLength(1);
    // Rogue's Passage: {4}, {T}: target creature can't be blocked. Sharkey has it (and not the mana ability).
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === sharkey);
    expect(acts).toHaveLength(0); // {4} is not payable yet
    const rich = game({
      p1: { battlefield: [SHARKEY, ...n('island', 4), 'savannah-lions'] },
      p2: { battlefield: ['rogues-passage'] },
    });
    const sh = rich.id('p1', SHARKEY);
    const options = rich.legal().filter((a) => a.type === 'activateAbility' && a.source === sh);
    expect(options.length).toBeGreaterThan(0);
  });

  it('the abilities it has use it as the source: tap and sacrifice Sharkey himself', () => {
    const g = game({
      p1: { battlefield: [SHARKEY], library: ['plains', 'forest'] },
      p2: { battlefield: ['evolving-wilds'] },
    });
    const sharkey = g.id('p1', SHARKEY);
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === sharkey);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    // "{T}, Sacrifice this land": Sharkey is sacrificed; the basic land was fetched.
    expect(gy(g)).toContain(SHARKEY);
    expect(board(g, 'plains', 'p1').length + board(g, 'forest', 'p1').length).toBe(1);
  });

  it('mana of any type can be spent to activate Sharkey\u2019s abilities', () => {
    const g = game({
      p1: { battlefield: [SHARKEY, 'island', 'island'] },
      p2: { battlefield: ['oakhollow-village'] },
    });
    const sharkey = g.id('p1', SHARKEY);
    // Oakhollow Village: {G}, {T}: put a +1/+1 counter on each Frog, Rabbit, Raccoon, or Squirrel you control.
    const printed = cardDb.get('oakhollow-village')!.abilities.find((a) => a.kind === 'activated');
    expect(printed && printed.kind === 'activated' && printed.cost.mana?.colored).toEqual({ G: 1 });
    // Sharkey has it, and an Island pays for the {G}.
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === sharkey);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts[0]!);
    done(g);
    expect(g.obj(sharkey).tapped).toBe(true);
    expect(board(g, 'island', 'p1').filter((id) => g.obj(id).tapped)).toHaveLength(1);
  });

  it('abilities with a target: {4}, {T}: target creature can\u2019t be blocked this turn', () => {
    const g = game({
      p1: { battlefield: [SHARKEY, ...n('island', 4), 'savannah-lions'] },
      p2: { battlefield: ['rogues-passage', 'serra-angel'] },
    });
    const sharkey = g.id('p1', SHARKEY);
    const lions = g.id('p1', 'savannah-lions');
    const acts = g
      .legal()
      .filter(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === sharkey &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      );
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(g.obj(sharkey).tapped).toBe(true);
    expect(board(g, 'island', 'p1').filter((id) => g.obj(id).tapped)).toHaveLength(4);
  });

  it('the lock ends when Sharkey leaves', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SHARKEY] },
      p2: { battlefield: ['evolving-wilds'] },
    });
    const wilds = g.id('p2', 'evolving-wilds');
    expect(
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === wilds),
    ).toHaveLength(0);
    g.state.battlefield = g.state.battlefield.filter((id) => id !== g.id('p1', SHARKEY));
    expect(
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === wilds).length,
    ).toBeGreaterThan(0);
  });
});

void kw;
void targetingPlayer;
void passTo;
void activate;
