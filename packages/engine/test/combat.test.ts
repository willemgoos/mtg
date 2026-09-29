import { describe, expect, it } from 'vitest';
import { Game, scenario, type PlayerSpec } from './helpers.ts';

/** p1 attacks with `attacker`; p2 blocks with the given blockers. */
function fight(p1: PlayerSpec, p2: PlayerSpec) {
  const g = new Game(scenario({ step: 'beginCombat', p1, p2 }));
  g.passBoth();
  expect(g.decision.kind).toBe('declareAttackers');
  return g;
}

function toDamage(g: Game) {
  // Pass through declare blockers / first strike / damage steps.
  return g.passUntilStep('endCombat');
}

describe('declaring attackers', () => {
  it('only untapped, non-sick creatures (or haste) can attack', () => {
    const g = fight(
      {
        battlefield: [
          'bear',
          { card: 'ogre', sick: true },
          { card: 'hasty', sick: true },
          { card: 'flier', tapped: true },
        ],
      },
      {},
    );
    const adds = g
      .legal()
      .filter((a) => a.type === 'addAttacker')
      .map((a) => (a.type === 'addAttacker' ? g.obj(a.attacker).defId : ''));
    expect(adds.sort()).toEqual(['bear', 'hasty']);
  });

  it('skips the declaration when nothing can attack', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: [{ card: 'bear', sick: true }] } }),
    );
    g.passBoth();
    expect(g.state.turn.step).toBe('declareAttackers');
    expect(g.decision.kind).toBe('priority');
    g.passBoth();
    expect(g.state.turn.step).toBe('endCombat');
  });

  it('attacking taps the creature unless it has vigilance', () => {
    const g = fight({ battlefield: ['bear', 'vigilant'] }, {});
    g.attack(g.id('p1', 'bear'), g.id('p1', 'vigilant'));
    expect(g.obj(g.id('p1', 'bear')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'vigilant')).tapped).toBe(false);
  });

  it('attackers can be removed before confirming', () => {
    const g = fight({ battlefield: ['bear'] }, {});
    const bear = g.id('p1', 'bear');
    g.do({ type: 'addAttacker', player: 'p1', attacker: bear, defender: 'p2' });
    g.do({ type: 'removeAttacker', player: 'p1', attacker: bear });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    expect(g.obj(bear).tapped).toBe(false);
  });
});

describe('combat damage', () => {
  it('unblocked attackers damage the defending player', () => {
    const g = fight({ battlefield: ['ogre'] }, {});
    g.attack(g.id('p1', 'ogre'));
    toDamage(g);
    expect(g.life('p2')).toBe(17);
  });

  it('blocked creatures trade damage', () => {
    const g = fight({ battlefield: ['ogre'] }, { battlefield: ['bear'] });
    g.attack(g.id('p1', 'ogre')).pass().pass();
    expect(g.decision.kind).toBe('declareBlockers');
    g.block([g.id('p2', 'bear'), g.id('p1', 'ogre')]);
    toDamage(g);
    expect(g.life('p2')).toBe(20);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    expect(g.obj(g.id('p1', 'ogre')).damage).toBe(2);
  });

  it('flying can only be blocked by flying or reach', () => {
    const g = fight({ battlefield: ['flier'] }, { battlefield: ['bear', 'spider'] });
    g.attack(g.id('p1', 'flier')).passBoth();
    const blockers = g
      .legal()
      .filter((a) => a.type === 'addBlock')
      .map((a) => (a.type === 'addBlock' ? g.obj(a.blocker).defId : ''));
    expect(blockers).toEqual(['spider']);
  });

  it('trample assigns lethal to blockers and the rest to the player', () => {
    const g = fight({ battlefield: ['trampler'] }, { battlefield: ['bear'] });
    g.attack(g.id('p1', 'trampler')).passBoth();
    g.block([g.id('p2', 'bear'), g.id('p1', 'trampler')]);
    toDamage(g);
    expect(g.life('p2')).toBe(17);
  });

  it('trample counts damage already marked on the blocker', () => {
    const g = fight({ battlefield: ['trampler'] }, { battlefield: [{ card: 'ogre', damage: 2 }] });
    g.attack(g.id('p1', 'trampler')).passBoth();
    g.block([g.id('p2', 'ogre'), g.id('p1', 'trampler')]);
    toDamage(g);
    expect(g.life('p2')).toBe(16);
  });

  it('deathtouch + trample only needs 1 damage per blocker', () => {
    const g = fight({ battlefield: ['dt-trampler'] }, { battlefield: ['ogre'] });
    g.attack(g.id('p1', 'dt-trampler')).passBoth();
    g.block([g.id('p2', 'ogre'), g.id('p1', 'dt-trampler')]);
    toDamage(g);
    expect(g.life('p2')).toBe(18);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });

  it('a blocked attacker without trample deals no damage if its blocker is removed', () => {
    const g = fight(
      { battlefield: ['ogre'] },
      { battlefield: ['bear', 'mountain'], hand: ['shock'] },
    );
    g.attack(g.id('p1', 'ogre')).passBoth();
    const bear = g.id('p2', 'bear');
    g.block([bear, g.id('p1', 'ogre')]);
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(bear)],
    });
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    toDamage(g);
    expect(g.life('p2')).toBe(20);
  });

  it('first strike deals damage first; the victim deals none', () => {
    const g = fight({ battlefield: ['striker'] }, { battlefield: ['bear'] });
    g.attack(g.id('p1', 'striker')).passBoth();
    g.block([g.id('p2', 'bear'), g.id('p1', 'striker')]);
    expect(g.state.turn.step).toBe('declareBlockers');
    g.passBoth();
    expect(g.state.turn.step).toBe('firstStrikeDamage');
    expect(g.state.players.p2.graveyard).toHaveLength(1);
    toDamage(g);
    expect(g.obj(g.id('p1', 'striker')).damage).toBe(0);
  });

  it('double strike deals damage in both steps', () => {
    const g = fight({ battlefield: ['double'] }, {});
    g.attack(g.id('p1', 'double'));
    toDamage(g);
    expect(g.life('p2')).toBe(16);
  });

  it('there is no first-strike step without first strikers', () => {
    const g = fight({ battlefield: ['bear'] }, {});
    g.attack(g.id('p1', 'bear'));
    toDamage(g);
    expect(g.events.some((e) => e.type === 'stepChanged' && e.step === 'firstStrikeDamage')).toBe(
      false,
    );
  });

  it('deathtouch kills whatever it damages', () => {
    const g = fight({ battlefield: ['trampler'] }, { battlefield: ['assassin'] });
    g.attack(g.id('p1', 'trampler')).passBoth();
    g.block([g.id('p2', 'assassin'), g.id('p1', 'trampler')]);
    toDamage(g);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.state.players.p2.graveyard).toHaveLength(1);
  });

  it('lifelink gains life equal to damage dealt', () => {
    const g = fight({ battlefield: ['lifelinker'] }, {});
    g.attack(g.id('p1', 'lifelinker'));
    toDamage(g);
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(17);
  });

  it('menace requires two or more blockers', () => {
    const g = fight({ battlefield: ['menacer'] }, { battlefield: ['bear', 'ogre'] });
    const m = g.id('p1', 'menacer');
    g.attack(m).passBoth();
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'bear'), attacker: m });
    expect(g.legal().some((a) => a.type === 'confirmBlockers')).toBe(false);
    g.do({ type: 'addBlock', player: 'p2', blocker: g.id('p2', 'ogre'), attacker: m });
    expect(g.legal().some((a) => a.type === 'confirmBlockers')).toBe(true);
  });

  it('multiple blockers split the attacker’s damage', () => {
    const g = fight({ battlefield: ['trampler'] }, { battlefield: ['bear', 'bear'] });
    const t = g.id('p1', 'trampler');
    g.attack(t).passBoth();
    const [b1, b2] = g.state.battlefield.filter((id) => g.obj(id).controller === 'p2');
    g.block([b1!, t], [b2!, t]);
    toDamage(g);
    expect(g.state.players.p2.graveyard).toHaveLength(2);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(t).damage).toBe(4);
  });
});
