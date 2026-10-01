import { redactFor } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow batch 2b: Rakdos Lizards and Dimir Rats.

describe('Rakdos Lizards', () => {
  it('Thought-Stalker Warlock picks a nonland card from a hand it can see, if they lost life', () => {
    const g = game({
      p1: {
        hand: ['thought-stalker-warlock', 'playful-shove'],
        battlefield: [...n('swamp', 3), ...n('mountain', 2)],
      },
      p2: { hand: ['serra-angel', 'forest'] },
    });
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    settle(cast(g, 'thought-stalker-warlock'));
    expect(g.decision.kind).toBe('chooseFromHand');
    // The chooser sees the hand; only the nonland card can be picked.
    const seen = redactFor(g.state, 'p1', cardDb);
    expect(seen.players.p2.hand.map((id) => seen.objects[id]!.defId).sort()).toEqual([
      'forest',
      'serra-angel',
    ]);
    expect(g.legal()).toHaveLength(1);
    settle(g.do(g.legal()[0]!));
    expect(g.state.players.p2.hand.map((id) => g.obj(id).defId)).toEqual(['forest']);
  });

  it('Reptilian Recruiter takes a small creature until end of turn', () => {
    const g = game({
      p1: { hand: ['reptilian-recruiter'], battlefield: n('mountain', 5) },
      p2: { battlefield: [{ card: 'bear-cub', tapped: true }] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'reptilian-recruiter', [], {}), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    expect(g.obj(bear).controller).toBe('p1');
    expect(g.obj(bear).tapped).toBe(false);
    g.passUntilStep('upkeep'); // the next turn: control has gone back
    settle(g);
    expect(g.obj(bear).controller).toBe('p2');
  });

  it('Gev puts an extra counter on creatures once an opponent lost life', () => {
    const g = game({
      p1: {
        hand: ['playful-shove', 'bear-cub'],
        battlefield: [...n('mountain', 2), 'forest', 'swamp', 'gev-scaled-scorch'],
      },
    });
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    settle(cast(g, 'bear-cub'));
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(1);
  });

  it('Valley Flamecaller adds 1 to a Lizard’s damage', () => {
    const g = game({
      p1: {
        battlefield: ['mountain', 'valley-flamecaller', 'iridescent-vinelasher'],
        hand: ['mountain'],
      },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'mountain', 'hand') });
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('Hearthborn Battler triggers on the second spell a player casts in a turn', () => {
    const g = game({
      p1: {
        hand: ['playful-shove', 'playful-shove'],
        battlefield: [...n('mountain', 4), 'hearthborn-battler'],
      },
    });
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(19);
    settle(cast(g, 'playful-shove', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
  });
});

describe('Dimir Rats', () => {
  it('Persistent Marshstalker returns from the graveyard attacking', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        battlefield: [...n('swamp', 3), 'thought-shucker'],
        graveyard: ['persistent-marshstalker', ...n('forest', 6)],
      },
    });
    g.passBoth().attack(g.id('p1', 'thought-shucker'));
    settle(g);
    expect(g.decision.kind).toBe('optionalEffect');
    settle(g.do({ type: 'chooseEffect', player: 'p1', accept: true }));
    const stalker = g.id('p1', 'persistent-marshstalker');
    expect(g.state.combat?.attackers.map((a) => a.id)).toContain(stalker);
    expect(pt(g, stalker)).toEqual([4, 1]); // +1/+0 for the other Rat
  });

  it('Azure Beastbinder strips a creature to a vanilla 2/2 until its next turn', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['azure-beastbinder'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.passBoth().attack(g.id('p1', 'azure-beastbinder'));
    settle(g);
    expect(pt(g, angel)).toEqual([2, 2]);
    expect(cardDb.get('serra-angel')!.keywords).toContain('flying');
    expect(g.obj(angel).blank).toBe(true);
    g.passUntilStep('upkeep');
    expect(pt(g, angel)).toEqual([2, 2]); // still, on its controller's turn
    g.passUntilStep('draw').passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(pt(g, angel)).toEqual([4, 4]);
    expect(g.obj(angel).blank).toBeFalsy();
  });

  it('Vren exiles dying creatures of the opponent and makes Rats at the end step', () => {
    const g = game({
      p1: { hand: ['fell'], battlefield: [...n('swamp', 2), 'vren-the-relentless'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'fell', [g.ref(bear)]));
    expect(g.zoneOf(bear)).toBe('exile');
    g.passUntilStep('end');
    settle(g);
    expect(all(g, 'vren-rat-token')).toHaveLength(1);
  });

  it('Dire Downdraft costs less against a tapped creature; its owner picks top or bottom', () => {
    const g = game({
      p1: { hand: ['dire-downdraft'], battlefield: n('island', 3) },
      p2: { battlefield: [{ card: 'bear-cub', tapped: true }, 'savannah-lions'] },
    });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(
      casts.map(
        (a) =>
          a.type === 'castSpell' &&
          g.obj((a.targets[0] as { object: { id: string } }).object.id).defId,
      ),
    ).toEqual(['bear-cub']);
    g.do(casts[0]!);
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    expect(g.actor).toBe('p2');
    settle(g.do({ type: 'chooseOption', player: 'p2', index: 1 }));
    const lib = g.state.players.p2.library;
    expect(g.obj(lib[lib.length - 1]!).defId).toBe('bear-cub');
  });

  it('stun counters keep a permanent tapped through one untap', () => {
    const g = game({
      p1: { hand: ['mind-spiral'], battlefield: n('island', 5) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'mind-spiral', [{ player: 'p1' }, g.ref(bear)], { kicked: true }));
    expect(handSize(g, 'p1')).toBe(3);
    expect(g.obj(bear).tapped).toBe(true);
    g.passUntilStep('upkeep');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(bear).counters?.stun).toBe(0);
  });

  it('Gev has ward—pay 2 life', () => {
    const g = game({
      p1: { battlefield: ['gev-scaled-scorch'] },
      p2: { hand: ['shock'], battlefield: ['mountain'] },
      active: 'p2',
    });
    settle(cast(g, 'shock', [g.ref(g.id('p1', 'gev-scaled-scorch'))]));
    expect(g.life('p2')).toBe(18);
  });
});
