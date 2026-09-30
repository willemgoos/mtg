/** Add only the explicitly implemented batch, never the entire missing manifest. */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import {
  FOUNDATIONS_BATCH_BEHAVIORS,
  FOUNDATIONS_BATCH_VANILLA,
} from '../src/foundations-batch.ts';
const wanted = new Set([...Object.keys(FOUNDATIONS_BATCH_BEHAVIORS), ...FOUNDATIONS_BATCH_VANILLA]);
const rows = createInterface({
  input: createReadStream(new URL('../.cache/default-cards.jsonl.gz', import.meta.url)).pipe(
    createGunzip(),
  ),
  crlfDelay: Infinity,
});
const best = new Map<
  string,
  { name: string; collector_number: string; colors: string[]; type_line: string }
>();
for await (const line of rows) {
  if (!line.startsWith('{')) continue;
  const c = JSON.parse(line);
  if (!wanted.has(c.name) || c.set !== 'fdn' || c.lang !== 'en' || c.layout !== 'normal') continue;
  const old = best.get(c.name);
  if (!old || Number(c.collector_number) < Number(old.collector_number)) best.set(c.name, c);
}
if ([...wanted].some((name) => !best.has(name))) throw Error('Batch metadata not found');
const file = new URL('../src/pool.ts', import.meta.url);
let pool = readFileSync(file, 'utf8');
const existing = JSON.parse(
  readFileSync(new URL('../src/generated/scryfall.json', import.meta.url), 'utf8'),
) as { name: string }[];
const existingNames = new Set(existing.map((c) => c.name));
const groups: Record<string, string[]> = {
  RED: [],
  GREEN: [],
  WHITE: [],
  BLUE: [],
  BLACK: [],
  OTHER: [],
  LAND: [],
};
const color: Record<string, string> = { R: 'RED', G: 'GREEN', W: 'WHITE', U: 'BLUE', B: 'BLACK' };
for (const c of best.values())
  if (!existingNames.has(c.name))
    groups[
      c.type_line.includes('Land') ? 'LAND' : c.colors.length === 1 ? color[c.colors[0]!]! : 'OTHER'
    ]!.push(c.name);
for (const [group, names] of Object.entries(groups))
  if (names.length)
    pool = pool.replace(
      `export const ${group}_POOL = [`,
      `export const ${group}_POOL = [\n${names
        .sort()
        .map((name) => `  ${JSON.stringify(name)},`)
        .join('\n')}`,
    );
writeFileSync(file, pool);
console.log(
  `Added ${[...wanted].filter((n) => !existingNames.has(n)).length} reviewed batch names to the pool`,
);
