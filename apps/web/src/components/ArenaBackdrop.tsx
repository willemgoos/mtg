import type { GameState, PlayerId } from '@mtg/engine';
import { useEffect, useRef } from 'react';
import { arenaBatchGate, arenaReactions, type ArenaDetail } from '../game/arena.ts';
import { juiceFor } from '../game/juice.ts';
import type { EventBatch } from '../game/useGame.ts';
import type { ArenaRenderer } from '../game/arenaScene.ts';
import './arena.css';

export function ArenaBackdrop({
  detail,
  batch,
  view,
  me,
}: {
  detail: ArenaDetail;
  batch: EventBatch;
  view: GameState;
  me: PlayerId;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ArenaRenderer | null>(null);
  const latest = useRef(batch.seq);
  const accept = useRef(arenaBatchGate(batch.seq));

  useEffect(() => {
    latest.current = batch.seq;
    if (accept.current(batch.seq))
      renderer.current?.react(arenaReactions(juiceFor(batch.events, view, me)));
  }, [batch, view, me]);

  useEffect(() => {
    let cancelled = false;
    accept.current = arenaBatchGate(latest.current);
    const element = canvas.current;
    if (!element || detail === 'static') return;
    const fail = () => {
      if (cancelled) return;
      element.dataset.ready = 'false';
      renderer.current?.dispose();
      renderer.current = null;
    };
    void import('../game/arenaScene.ts')
      .then(({ createArena }) => {
        if (cancelled) return;
        try {
          renderer.current = createArena(element, detail, fail);
          // Batches received while the scene was loading are deliberately discarded.
          accept.current = arenaBatchGate(latest.current);
        } catch {
          fail();
        }
      })
      .catch(fail);
    return () => {
      cancelled = true;
      renderer.current?.dispose();
      renderer.current = null;
      element.dataset.ready = 'false';
    };
  }, [detail]);

  return (
    <div className="arena-backdrop" aria-hidden="true">
      {detail !== 'static' && (
        <canvas ref={canvas} className="arena-backdrop__canvas" data-ready="false" />
      )}
    </div>
  );
}
