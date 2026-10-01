/**
 * Helpers for building mid-game positions and driving games in tests
 * (exported as @mtg/engine/testing). Not used by the engine itself.
 */
import { createObject, makeCtx, refreshCreaturesAreFood } from './context.ts';
import type { Engine } from './engine.ts';
import { emptyState } from './setup.ts';
import type {
  Action,
  CardDb,
  GameEvent,
  GameState,
  ObjectId,
  PlayerId,
  Step,
  ZoneName,
} from './types.ts';

// ---------------------------------------------------------------------------
// Scenario builder
// ---------------------------------------------------------------------------

type PermSpec = string | { card: string; tapped?: boolean; sick?: boolean; damage?: number };

export interface PlayerSpec {
  life?: number;
  hand?: string[];
  battlefield?: PermSpec[];
  library?: string[];
  graveyard?: string[];
}

export interface ScenarioSpec {
  p1?: PlayerSpec;
  p2?: PlayerSpec;
  active?: PlayerId;
  step?: Step;
  turn?: number;
}

/**
 * Builds a mid-game state directly: active player has priority in the given
 * step (default: p1's main phase on turn 3). Libraries default to 10 forests.
 */
export function buildScenario(db: CardDb, spec: ScenarioSpec = {}): GameState {
  const ctx = makeCtx(emptyState(42), db);
  const s = ctx.s;
  for (const p of ['p1', 'p2'] as const) {
    const ps = spec[p] ?? {};
    const pl = s.players[p];
    pl.life = ps.life ?? 20;
    pl.keptHand = true;
    const put = (zone: ZoneName, list: ObjectId[], ids: string[]) => {
      for (const id of ids) list.push(createObject(ctx, id, p, zone).id);
    };
    put('library', pl.library, ps.library ?? Array(10).fill('forest'));
    put('hand', pl.hand, ps.hand ?? []);
    put('graveyard', pl.graveyard, ps.graveyard ?? []);
    for (const b of ps.battlefield ?? []) {
      const bs = typeof b === 'string' ? { card: b } : b;
      const o = createObject(ctx, bs.card, p, 'battlefield');
      o.tapped = bs.tapped ?? false;
      o.summoningSick = bs.sick ?? false;
      o.damage = bs.damage ?? 0;
      s.battlefield.push(o.id);
    }
  }
  const active = spec.active ?? 'p1';
  s.turn = {
    number: spec.turn ?? 3,
    activePlayer: active,
    step: spec.step ?? 'main1',
    passed: [],
    extraCombats: 0,
    attackers: [],
    lifeGains: { p1: 0, p2: 0 },
    creaturesDied: 0,
    cardsDrawn: { p1: 0, p2: 0 },
  };
  if (['beginCombat', 'declareAttackers', 'declareBlockers', 'endCombat'].includes(s.turn.step)) {
    s.combat = { attackers: [], dealtFirstStrikeDamage: [] };
  }
  s.decision = { kind: 'priority', player: active };
  refreshCreaturesAreFood(ctx);
  return s;
}

// ---------------------------------------------------------------------------
// Driving helpers
// ---------------------------------------------------------------------------

/** Small stateful wrapper for driving a game step by step in tests. */
export class GameDriver {
  events: GameEvent[] = [];
  constructor(
    public readonly engine: Engine,
    public state: GameState,
  ) {}

  do(action: Action): this {
    const r = this.engine.applyAction(this.state, action);
    this.state = r.state;
    this.events.push(...r.events);
    return this;
  }

  get decision() {
    return this.state.decision;
  }

  /** The player who must act now. */
  get actor(): PlayerId {
    const d = this.state.decision;
    if (d.kind === 'gameOver') throw new Error('Game is over');
    return d.player;
  }

  pass(): this {
    return this.do({ type: 'passPriority', player: this.actor });
  }

  /** Both players pass (resolving the top of the stack or ending the step). */
  passBoth(): this {
    return this.pass().pass();
  }

  /** Passes until the given step is reached with an empty stack. */
  passUntilStep(step: Step, maxPasses = 100): this {
    for (let i = 0; i < maxPasses; i++) {
      if (this.state.turn.step === step && this.state.decision.kind === 'priority') return this;
      const d = this.state.decision;
      if (d.kind === 'declareAttackers') this.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') this.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind !== 'priority') throw new Error(`Stuck at decision ${d.kind}`);
      else this.pass();
    }
    throw new Error(`Never reached ${step}`);
  }

  legal(player: PlayerId = this.actor): Action[] {
    return this.engine.getLegalActions(this.state, player);
  }

  /** Object id of the first `defId` in a zone (battlefield by default). */
  id(player: PlayerId, defId: string, zone: ZoneName = 'battlefield'): ObjectId {
    const list =
      zone === 'battlefield'
        ? this.state.battlefield
        : zone === 'stack'
          ? this.state.stack.map((x) => x.id)
          : this.state.players[player][zone];
    const found = list.find((id) => {
      const o = this.state.objects[id];
      return o && o.defId === defId && o.controller === player;
    });
    if (!found) throw new Error(`No ${defId} for ${player} in ${zone}`);
    return found;
  }

  obj(id: ObjectId) {
    const o = this.state.objects[id];
    if (!o) throw new Error(`No object ${id}`);
    return o;
  }

  ref(id: ObjectId) {
    return { object: { id, zcc: this.obj(id).zcc } };
  }

  life(p: PlayerId): number {
    return this.state.players[p].life;
  }

  zoneOf(id: ObjectId): ZoneName | 'gone' {
    return this.state.objects[id]?.zone ?? 'gone';
  }

  /** Declares attackers (in declare attackers step) and confirms. */
  attack(...attackers: ObjectId[]): this {
    for (const a of attackers)
      this.do({
        type: 'addAttacker',
        player: this.actor,
        attacker: a,
        defender: other(this.actor),
      });
    return this.do({ type: 'confirmAttackers', player: this.actor });
  }

  block(...pairs: [blocker: ObjectId, attacker: ObjectId][]): this {
    for (const [b, a] of pairs)
      this.do({ type: 'addBlock', player: this.actor, blocker: b, attacker: a });
    return this.do({ type: 'confirmBlockers', player: this.actor });
  }
}

function other(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}
