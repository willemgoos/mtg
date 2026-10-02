import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Wakanda Forever (9c): the monarch, prevention, monstrosity, Vibranium,
// token replacement, Equipment and Vehicles, "when you cast" copies.

const castable = (g: ReturnType<typeof game>, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId);
const activate = (g: ReturnType<typeof game>, defId: string, i = 0) => {
  const src = g.id(g.actor, defId);
  const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === src);
  g.do(acts[i]!);
  return settle(g);
};

describe('the monarch', () => {
  it('draws at their end step and passes to whoever deals them combat damage', () => {
    const g = game({
      p1: { battlefield: ['throne-of-the-high-city', ...n('plains', 4)] },
      p2: { battlefield: ['savannah-lions'] },
    });
    activate(g, 'throne-of-the-high-city');
    expect(g.state.monarch).toBe('p1');
    const hand = handSize(g, 'p1');
    g.passUntilStep('end');
    expect(handSize(g, 'p1')).toBe(hand + 1);
    // p2 attacks and hits the monarch.
    g.passUntilStep('beginCombat');
    expect(g.state.turn.activePlayer).toBe('p2');
    g.pass().pass();
    g.attack(g.id('p2', 'savannah-lions'));
    g.passUntilStep('end');
    expect(g.state.monarch).toBe('p2');
  });

  it('Palace Jailer exiles a creature until an opponent becomes the monarch', () => {
    const g = game({
      p1: { hand: ['palace-jailer'], battlefield: n('plains', 4) },
      p2: { battlefield: ['savannah-lions', 'throne-of-the-high-city', ...n('mountain', 4)] },
    });
    cast(g, 'palace-jailer');
    settle(g);
    expect(g.state.monarch).toBe('p1');
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    // p2 becomes the monarch with their Throne: the Lions come back.
    g.passUntilStep('main1');
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    activate(g, 'throne-of-the-high-city');
    expect(g.state.monarch).toBe('p2');
    expect(all(g, 'savannah-lions')).toHaveLength(1);
  });

  it('Queen Mother Ramonda: small creatures can’t attack the monarch', () => {
    const g = game({
      p1: { battlefield: ['queen-mother-ramonda'] },
      p2: { battlefield: ['savannah-lions', 'rumbling-baloth'] },
      active: 'p2',
      step: 'beginCombat',
    });
    g.state.monarch = 'p1';
    g.pass().pass();
    const attackers = g
      .legal()
      .filter((a) => a.type === 'addAttacker')
      .map((a) => a.type === 'addAttacker' && g.obj(a.attacker).defId);
    expect(attackers).toEqual(['rumbling-baloth']);
  });
});

describe('Wakanda Forever', () => {
  it('Fleecemane Lion becomes monstrous once: a counter, hexproof and indestructible', () => {
    const g = game({
      p1: { battlefield: ['fleecemane-lion', ...n('plains', 5), ...n('forest', 5)] },
    });
    activate(g, 'fleecemane-lion');
    const lion = g.id('p1', 'fleecemane-lion');
    expect(pt(g, lion)).toEqual([4, 4]);
    const keywords = getCharacteristics(g.state, cardDb, lion).keywords;
    expect(keywords.has('hexproof') && keywords.has('indestructible')).toBe(true);
    activate(g, 'fleecemane-lion');
    expect(pt(g, lion)).toEqual([4, 4]);
  });

  it('Panther Habit turns damage to its creature into +1/+1 counters', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', 'panther-habit'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.obj(g.id('p1', 'panther-habit')).attachedTo = lions;
    g.pass();
    cast(g, 'lightning-strike', [g.ref(lions)]);
    g.passBoth();
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(g.obj(lions).plusOneCounters).toBe(3);
  });

  it('Heart-Shaped Herb prevents 1 of each opponent’s damage to you', () => {
    const g = game({
      p1: { battlefield: ['heart-shaped-herb'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    cast(g, 'shock', [{ player: 'p1' }]);
    g.passBoth();
    expect(g.life('p1')).toBe(19);
  });

  it('Divine Visitation turns creature tokens into 4/4 Angels', () => {
    const g = game({
      p1: { hand: ['dragon-fodder'], battlefield: ['divine-visitation', ...n('mountain', 2)] },
    });
    cast(g, 'dragon-fodder');
    settle(g);
    expect(all(g, 'angel-4-4-token')).toHaveLength(2);
  });

  it('Vibranium mana only casts artifact spells', () => {
    const g = game({
      p1: { hand: ['savannah-lions', 'sol-ring'], battlefield: ['vibranium-token'] },
    });
    expect(castable(g, 'sol-ring')).toBe(true);
    const h = game({ p1: { hand: ['bear-cub'], battlefield: ['vibranium-token', 'forest'] } });
    expect(castable(h, 'bear-cub')).toBe(false);
  });

  it('Kimoyo Beads chooses each bead once', () => {
    const g = game({ p1: { battlefield: ['kimoyo-beads'] } });
    const toEndTrigger = () => {
      for (let i = 0; i < 40 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    };
    toEndTrigger();
    const modes = () =>
      g
        .legal()
        .flatMap((a) => (a.type === 'chooseTargets' && a.mode !== undefined ? [a.mode] : []));
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(modes()).toEqual([0, 1, 2]);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 0 });
    settle(g);
    g.pass();
    toEndTrigger();
    expect(modes()).toEqual([1, 2]);
  });

  it('Helm of the Host makes a hasty copy that isn’t legendary', () => {
    const g = game({
      p1: { battlefield: ['helm-of-the-host', 'tchalla-the-black-panther'] },
    });
    g.obj(g.id('p1', 'helm-of-the-host')).attachedTo = g.id('p1', 'tchalla-the-black-panther');
    g.passUntilStep('beginCombat');
    settle(g);
    expect(all(g, 'tchalla-the-black-panther')).toHaveLength(2);
  });

  it('Beast Within gives the destroyed permanent’s controller a 3/3 Beast', () => {
    const g = game({
      p1: { hand: ['beast-within'], battlefield: n('forest', 3) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    cast(g, 'beast-within', [g.ref(g.id('p2', 'rumbling-baloth'))]);
    settle(g);
    const beast = all(g, 'beast-3-token')[0]!;
    expect(g.obj(beast).controller).toBe('p2');
  });

  it('Metalwork Colossus costs less for noncreature artifacts', () => {
    const g = game({
      p1: {
        hand: ['metalwork-colossus'],
        battlefield: ['coveted-jewel', 'kimoyo-beads', 'forest'],
      },
    });
    // {11} minus 6 and 4: {1}.
    expect(castable(g, 'metalwork-colossus')).toBe(true);
  });

  it('Royal Talon Fighter Jet enters with X counters and makes that many Soldiers', () => {
    const g = game({ p1: { hand: ['royal-talon-fighter-jet'], battlefield: n('plains', 5) } });
    cast(g, 'royal-talon-fighter-jet', [], { x: 3 });
    settle(g);
    expect(g.obj(g.id('p1', 'royal-talon-fighter-jet')).plusOneCounters).toBe(3);
    expect(all(g, 'soldier-token')).toHaveLength(3);
  });

  it('Whispersilk Cloak: unblockable and untargetable', () => {
    const g = game({
      p1: { battlefield: ['whispersilk-cloak', 'savannah-lions'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    g.obj(g.id('p1', 'whispersilk-cloak')).attachedTo = g.id('p1', 'savannah-lions');
    const targets = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets.some((t) => 'object' in t)).toBe(false);
  });

  it('Bast can’t attack unless you control three or more creatures', () => {
    const g = game({ p1: { battlefield: ['bast-panther-goddess'] }, step: 'beginCombat' });
    g.pass().pass();
    expect(g.legal().some((a) => a.type === 'addAttacker')).toBe(false);
  });

  it('Hatut Zeraze Strike Force is copied once per commander cast', () => {
    const g = game({
      p1: {
        commander: 'tchalla-the-black-panther',
        hand: ['hatut-zeraze-strike-force'],
        battlefield: n('plains', 4),
      },
    });
    g.state.players.p1.commanderCasts = 2;
    cast(g, 'hatut-zeraze-strike-force');
    settle(g);
    expect(all(g, 'hatut-zeraze-strike-force')).toHaveLength(3);
  });

  it('Ancestral Communion is copied with your commander out, returning two cards', () => {
    const g = game({
      p1: {
        commander: 'tchalla-the-black-panther',
        hand: ['ancestral-communion'],
        graveyard: ['savannah-lions', 'bear-cub'],
        battlefield: n('forest', 2),
      },
    });
    const ct = g.state.players.p1.commander!;
    const s = g.state;
    s.players.p1.command = [];
    s.battlefield.push(ct);
    s.objects[ct]!.zone = 'battlefield';
    s.objects[ct]!.summoningSick = false;
    const lions = g.state.players.p1.graveyard[0]!;
    cast(g, 'ancestral-communion', [g.ref(lions)]);
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Conduit of Worlds lets you cast a permanent card from your graveyard, then no more spells', () => {
    const g = game({
      p1: {
        graveyard: ['savannah-lions'],
        hand: ['shock'],
        battlefield: ['conduit-of-worlds', ...n('plains', 2), 'mountain'],
      },
    });
    const conduit = g.id('p1', 'conduit-of-worlds');
    const lions = g.state.players.p1.graveyard[0]!;
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === conduit)!);
    settle(g);
    expect(castable(g, 'savannah-lions')).toBe(true);
    g.do({ type: 'castSpell', player: 'p1', card: lions, targets: [], via: 'conduit' });
    settle(g);
    expect(g.zoneOf(lions)).toBe('battlefield');
    expect(castable(g, 'shock')).toBe(false);
  });
});
