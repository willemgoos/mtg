# Handoff: Marvel Jumpstart packets and shortcut fixes

For an agent picking this work up. Read `CLAUDE.md` first (MTG Arena is the reference), then this file, then
`docs/marvel-jumpstart.md` (the tracking table) and `docs/shortcuts.md` (the checklist of cards that don't yet match their
text).

## The goal

Add all 51 official Marvel Super Heroes Jumpstart packets (paper Jumpstart Boosters, also on Arena as Jumpstart events) to
the Jump In picker. A packet goes in once every card in it is implemented. The lists are Wizards':
https://magic.wizards.com/en/news/announcements/marvel-super-heroes-jumpstart-booster-themes, saved in
`packages/cards/scripts/data/marvel-jumpstart-lists.json`.

## Where it stands (4 October 2026)

- **31 of 51 packets are done** and in `MARVEL_JUMPSTART_PACKETS` (`packages/cards/src/jumpin.ts`), shown in the picker as
  "Marvel · Jumpstart". 20 packets are left, needing about 120 different cards.
- **Shortcuts:** `docs/shortcuts.md` has 24 open items (cards that don't do exactly what their text says), each with the
  reason. Two fixer passes have already been through it.
- **The user's rule: no shortcuts.** New cards must do exactly what their oracle text says. If something needs a new
  engine piece, build it properly with a test. If an exact version would flood the bots with legal actions (they score every
  action, so thousands of target combinations are too slow), make the choice step by step instead (see "any number of
  targets" and the `divide` effect for examples). If a card truly can't be done exactly, leave it out and say why; don't ship
  a simplified version.
- **Known bug, not yet fixed:** Zaffai and the Tempests' free cast (the `'zaffai'` cast route, Secrets of Strixhaven) also
  waives kicker costs and doesn't check that it's your turn. Vision, Spectral Synthezoid's `freeOnceEachTurn` route does
  this correctly and can be a model.

## Check the status

```bash
pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts
pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts --packet "Iron Man"
pnpm --filter @mtg/cards exec tsx scripts/marvel-jumpstart-status.ts --entry "Iron Man"
```

The first lists the remaining packets with their missing cards (closest first) and the cards shared by several packets; the
second shows one packet's list; the third prints its entry for `MARVEL_JUMPSTART_PACKETS` (fill in `colors`, `face` and
`blurb`).

## How a packet gets done

The work so far ran three packets at a time, one subagent each, in separate git worktrees, with the coordinator merging.
Pick packets that share no missing cards (the status script lists shared ones), so two agents never build the same card.

**1. Before starting:** mark the packets "In progress" in the `docs/marvel-jumpstart.md` table, commit, and push, so the
agents start from it.

**2. Each agent** (in its own worktree) gets a prompt like the ones used so far:

- Fast-forward to the coordinator's commit; `pnpm install --offline` if needed; read `CLAUDE.md` and `docs/marvel-jumpstart.md`.
- The packet's full list and the cards to implement (from the status script), noting which are shared with other packets
  (implement those generally).
- The no-shortcuts rule above, word for word.
- Card text from Scryfall (`https://api.scryfall.com/cards/named?exact=<name>`, with a User-Agent header). Only rules text
  is written by hand; printed characteristics come from `pnpm cards:fetch`. To skip the 80 MB download, copy
  `packages/cards/.cache/default-cards.jsonl.gz` from the main checkout. If a reprint isn't picked up, check
  `SET_PREFERENCE` in `packages/cards/src/pool.ts` and confirm no existing card changes printing.
- Behaviours in a new file `packages/cards/src/msh/jumpstart-<name>.ts` exporting `MSH_JUMPSTART_<NAME>`, registered in
  `packages/cards/src/msh/jumpstart.ts` with one import and one spread line. New tokens are exported from the same file and
  registered in `TOKENS` in `packages/cards/src/behaviors.ts`.
- Engine additions in small blocks commented with the packet or card name, in the middle of the relevant union or switch
  (not at the end), without reformatting existing code. This keeps parallel merges simple.
- Tests in `packages/cards/test/msh-jumpstart-<name>.test.ts`: every part of every card, plus one test that the whole
  packet list is in `cardDb`. Loops over game decisions must be bounded (never `while` on a decision). Creatures put on the
  battlefield by a test scenario aren't tokens unless `isToken` is set.
- `pnpm typecheck`, `pnpm lint` and `npx vitest run` must pass (long simulation tests can time out under load; rerun alone).
- Don't touch `jumpin.ts`, `docs/marvel-jumpstart.md` or `docs/shortcuts.md`; commit on the worktree branch, don't push,
  report files, engine changes and anything not exact.

**3. Merging** each finished branch into `main`:

- Conflicts are almost always both sides adding lines in the same spot: the import and spread lines in
  `msh/jumpstart.ts` and `behaviors.ts`, or engine union members and switch cases. Keep both. Watch for import lines that
  both sides changed (merge the names into one import, don't duplicate the line).
- `packages/cards/src/generated/scryfall.json`: never merge by hand. Take either side, then run `pnpm cards:fetch`.
- Run `pnpm typecheck`, `pnpm lint` and `npx vitest run` after each merge.

**4. Adding the packets:** paste each `--entry` into `MARVEL_JUMPSTART_PACKETS` in `packages/cards/src/jumpin.ts` (set
`colors`, a `face` from the packet, and a short `blurb`), mark them **Done** in the tracking table, list any new engine
pieces in its "Done so far" section, and add anything not exact to `docs/shortcuts.md`. Run
`npx vitest run packages/cards/test/jumpin.test.ts`, then commit and push.

## Notes

- Official packets may hold two rares and a hybrid card of another colour; `jumpin.test.ts` allows that for packets with
  `source: 'arena'`.
- Some packets have extra lands (Wild and Tenacious keep Terramorphic Expanse, Conniving has Villainous Hideout); the
  `--entry` output puts every land in `lands`.
- ESLint ignores `.claude/worktrees` (the agents' working copies). Old worktrees and their branches can be deleted once
  merged.
- Shortcut fixes follow the same pattern: one agent per section of `docs/shortcuts.md`, ticking items off (`- [x]`) or
  rewriting what's left, and updating the plan doc each item came from.
